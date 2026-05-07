import { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Scissors, Merge, Music, Maximize, Minimize2, Image as ImageIcon,
  RotateCw, VolumeX, Camera, Loader2, X, Film, Plus, Play, Pause,
} from "lucide-react";
import { toast } from "sonner";

interface VideoInfo {
  duration: string;
  video_codec: string;
  audio_codec: string;
  resolution: string;
  file_size: number;
}

export function VideoToolsPage() {
  const { t } = useTranslation();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("trim");

  // Video player state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Timeline thumbnails
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loadingThumbs, setLoadingThumbs] = useState(false);

  // Trim
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(10);
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:10");

  // Merge
  const [mergeFiles, setMergeFiles] = useState<{ path: string; name: string }[]>([]);

  // Resize
  const [resizeWidth, setResizeWidth] = useState("1280");
  const [resizeHeight, setResizeHeight] = useState("720");

  // Compress
  const [quality, setQuality] = useState(55); // 0-100%, mapped to CRF 51-0

  // GIF
  const [gifFps, setGifFps] = useState("10");
  const [gifWidth, setGifWidth] = useState("480");

  // Rotate
  const [rotation, setRotation] = useState("90");

  // Thumbnail
  const [frameTime, setFrameTime] = useState("00:00:01");

  const formatTimeCode = (secs: number, ms = false): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const base = `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    if (ms) {
      const millis = Math.round((secs % 1) * 1000);
      return `${base}.${millis.toString().padStart(3, "0")}`;
    }
    return base;
  };

  const parseTimeCode = (tc: string): number => {
    // Support HH:MM:SS.mmm format
    const [timePart, msPart] = tc.split(".");
    const parts = timePart.split(":").map(Number);
    let seconds = 0;
    if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
    else seconds = parts[0] || 0;
    if (msPart) seconds += parseInt(msPart.padEnd(3, "0").slice(0, 3)) / 1000;
    return seconds;
  };

  const handlePaths = useCallback(async (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    try {
      const info = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
      setFilePath(path);
      setFileName(info.name);
      setVideoSrc(convertFileSrc(path));
      setThumbnails([]);

      try {
        const mediaInfo = await invoke<VideoInfo>("get_media_info", { path });
        setVideoInfo(mediaInfo);
        const dur = parseFloat(mediaInfo.duration);
        if (!isNaN(dur)) {
          setTrimEnd(dur);
          setEndTime(formatTimeCode(dur));
        }
      } catch {
        setVideoInfo(null);
      }

      // Load timeline thumbnails
      setLoadingThumbs(true);
      try {
        const thumbs = await invoke<string[]>("ffmpeg_timeline_thumbnails", { inputPath: path, count: 15 });
        setThumbnails(thumbs);
      } catch {
        // Thumbnails are optional
      }
      setLoadingThumbs(false);
    } catch (err) {
      toast.error(String(err));
    }
  }, []);

  const handleAddMergeFile = async () => {
    const paths = await open({
      multiple: true,
      filters: [{ name: "Video", extensions: ["mp4", "mov", "mkv", "avi", "webm", "flv", "mpeg", "mpg"] }],
    });
    if (!paths) return;
    const pathList = Array.isArray(paths) ? paths : [paths];
    const newFiles: { path: string; name: string }[] = [];
    for (const p of pathList) {
      try {
        const info = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path: p });
        newFiles.push({ path: p, name: info.name });
      } catch (err) {
        toast.error(String(err));
      }
    }
    setMergeFiles((prev) => [...prev, ...newFiles]);
  };

  const getOutputPath = async (defaultExt: string, suffix: string) => {
    const baseName = fileName.replace(/\.[^.]+$/, "");
    return save({
      defaultPath: `${baseName}_${suffix}.${defaultExt}`,
      filters: [{ name: defaultExt.toUpperCase(), extensions: [defaultExt] }],
    });
  };

  const handleProcess = async () => {
    if (!filePath && activeTab !== "merge") return;
    setProcessing(true);
    try {
      switch (activeTab) {
        case "trim": {
          const out = await getOutputPath("mp4", "trimmed");
          if (!out) break;
          await invoke("ffmpeg_trim", { inputPath: filePath, outputPath: out, startTime, endTime });
          toast.success(t("common.success"));
          break;
        }
        case "merge": {
          if (mergeFiles.length < 2) {
            toast.error("Need at least 2 videos to merge");
            break;
          }
          const out = await getOutputPath("mp4", "merged");
          if (!out) break;
          await invoke("ffmpeg_merge_videos", {
            inputPaths: mergeFiles.map((f) => f.path),
            outputPath: out,
          });
          toast.success(t("common.success"));
          break;
        }
        case "extractAudio": {
          const out = await getOutputPath("mp3", "audio");
          if (!out) break;
          await invoke("ffmpeg_extract_audio", { inputPath: filePath, outputPath: out });
          toast.success(t("common.success"));
          break;
        }
        case "resize": {
          const out = await getOutputPath("mp4", "resized");
          if (!out) break;
          await invoke("ffmpeg_resize", {
            inputPath: filePath,
            outputPath: out,
            width: parseInt(resizeWidth) || 1280,
            height: parseInt(resizeHeight) || 720,
          });
          toast.success(t("common.success"));
          break;
        }
        case "compress": {
          const out = await getOutputPath("mp4", "compressed");
          if (!out) break;
          // Convert quality% (0-100) to CRF (51-0): higher quality = lower CRF
          const crfValue = Math.round(51 - (quality / 100) * 51);
          await invoke("ffmpeg_compress", { inputPath: filePath, outputPath: out, crf: crfValue });
          toast.success(t("common.success"));
          break;
        }
        case "toGif": {
          const out = await getOutputPath("gif", "animated");
          if (!out) break;
          await invoke("ffmpeg_to_gif", {
            inputPath: filePath,
            outputPath: out,
            fps: parseInt(gifFps) || 10,
            width: parseInt(gifWidth) || 480,
          });
          toast.success(t("common.success"));
          break;
        }
        case "rotate": {
          const out = await getOutputPath("mp4", "rotated");
          if (!out) break;
          await invoke("ffmpeg_rotate", { inputPath: filePath, outputPath: out, rotation });
          toast.success(t("common.success"));
          break;
        }
        case "removeAudio": {
          const out = await getOutputPath("mp4", "noaudio");
          if (!out) break;
          await invoke("ffmpeg_remove_audio", { inputPath: filePath, outputPath: out });
          toast.success(t("common.success"));
          break;
        }
        case "thumbnail": {
          const out = await getOutputPath("jpg", "thumb");
          if (!out) break;
          await invoke("ffmpeg_thumbnail", { inputPath: filePath, outputPath: out, time: frameTime });
          toast.success(t("common.success"));
          break;
        }
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("FFMPEG_NOT_INSTALLED")) {
        toast.error(t("errors.ffmpegNotInstalled"));
      } else {
        toast.error(msg);
      }
    }
    setProcessing(false);
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  const handleVideoLoaded = () => {
    if (!videoRef.current) return;
    setDuration(videoRef.current.duration);
    if (videoRef.current.duration && trimEnd === 10) {
      setTrimEnd(videoRef.current.duration);
      setEndTime(formatTimeCode(videoRef.current.duration));
    }
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!videoRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const newTime = x * duration;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Update trim handles from input fields
  useEffect(() => {
    setTrimStart(parseTimeCode(startTime));
  }, [startTime]);

  useEffect(() => {
    setTrimEnd(parseTimeCode(endTime));
  }, [endTime]);

  const handleTrimDrag = (e: React.MouseEvent<HTMLDivElement>, handle: "start" | "end") => {
    e.stopPropagation();
    const timeline = e.currentTarget.parentElement;
    if (!timeline || !duration) return;

    const onMove = (ev: MouseEvent) => {
      const rect = timeline.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const time = x * duration;
      if (handle === "start") {
        const clamped = Math.min(time, trimEnd - 0.5);
        setTrimStart(Math.max(0, clamped));
        setStartTime(formatTimeCode(Math.max(0, clamped), true));
      } else {
        const clamped = Math.max(time, trimStart + 0.5);
        setTrimEnd(Math.min(duration, clamped));
        setEndTime(formatTimeCode(Math.min(duration, clamped), true));
      }
    };

    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("videoTools.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("videoTools.description")}</p>
      </div>

      {!filePath && activeTab !== "merge" ? (
        <DropZone
          label={t("videoTools.dropzone")}
          activeLabel={t("converter.dropzoneActive")}
          extensions={["mp4", "mov", "mkv", "avi", "webm", "flv", "mpeg", "mpg"]}
          multiple={false}
          onPaths={handlePaths}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Left panel: tools */}
          <div className="flex w-80 shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 overflow-y-auto">
            {filePath && (
              <>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate flex-1">{fileName}</p>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => {
                      setFilePath(null); setVideoInfo(null); setVideoSrc(null);
                      setThumbnails([]); setIsPlaying(false); setCurrentTime(0); setDuration(0);
                    }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {videoInfo && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {videoInfo.duration !== "unknown" && (
                        <p>{t("videoTools.duration")}: {formatTimeCode(parseFloat(videoInfo.duration))}</p>
                      )}
                      {videoInfo.resolution !== "unknown" && (
                        <p>{t("videoTools.resolution")}: {videoInfo.resolution}</p>
                      )}
                      {videoInfo.video_codec !== "unknown" && (
                        <p>{t("videoTools.codec")}: {videoInfo.video_codec}</p>
                      )}
                      <p>{t("common.size")}: {formatBytes(videoInfo.file_size)}</p>
                    </div>
                  )}
                </div>
                <Separator />
              </>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-3 h-auto gap-1 mb-1">
                <TabsTrigger value="trim" className="text-xs px-1">
                  <Scissors className="h-3 w-3 mr-1" />{t("videoTools.trim")}
                </TabsTrigger>
                <TabsTrigger value="merge" className="text-xs px-1">
                  <Merge className="h-3 w-3 mr-1" />{t("videoTools.merge")}
                </TabsTrigger>
                <TabsTrigger value="extractAudio" className="text-xs px-1">
                  <Music className="h-3 w-3 mr-1" />{t("videoTools.extractAudio")}
                </TabsTrigger>
              </TabsList>
              <TabsList className="grid w-full grid-cols-3 h-auto gap-1 mb-1">
                <TabsTrigger value="resize" className="text-xs px-1">
                  <Maximize className="h-3 w-3 mr-1" />{t("videoTools.resize")}
                </TabsTrigger>
                <TabsTrigger value="compress" className="text-xs px-1">
                  <Minimize2 className="h-3 w-3 mr-1" />{t("videoTools.compress")}
                </TabsTrigger>
                <TabsTrigger value="toGif" className="text-xs px-1">
                  <ImageIcon className="h-3 w-3 mr-1" />{t("videoTools.toGif")}
                </TabsTrigger>
              </TabsList>
              <TabsList className="grid w-full grid-cols-3 h-auto gap-1">
                <TabsTrigger value="rotate" className="text-xs px-1">
                  <RotateCw className="h-3 w-3 mr-1" />{t("videoTools.rotate")}
                </TabsTrigger>
                <TabsTrigger value="removeAudio" className="text-xs px-1">
                  <VolumeX className="h-3 w-3 mr-1" />{t("videoTools.removeAudio")}
                </TabsTrigger>
                <TabsTrigger value="thumbnail" className="text-xs px-1">
                  <Camera className="h-3 w-3 mr-1" />{t("videoTools.thumbnail")}
                </TabsTrigger>
              </TabsList>

              <div className="mt-3 space-y-3">
                <TabsContent value="trim" className="mt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.startTime")} ({t("videoTools.timeFormat")})</Label>
                    <Input value={startTime} onChange={(e) => setStartTime(e.target.value)} placeholder="00:00:00" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.endTime")} ({t("videoTools.timeFormat")})</Label>
                    <Input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="00:00:10" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("videoTools.trimHint") || "Drag the handles on the timeline to adjust"}
                  </p>
                </TabsContent>

                <TabsContent value="merge" className="mt-0 space-y-3">
                  <Button variant="outline" size="sm" className="w-full" onClick={handleAddMergeFile}>
                    <Plus className="h-3 w-3 mr-1" />{t("videoTools.addVideos")}
                  </Button>
                  {mergeFiles.length > 0 && (
                    <div className="space-y-1">
                      {mergeFiles.map((f, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
                          <Film className="h-3 w-3 shrink-0" />
                          <span className="truncate flex-1">{f.name}</span>
                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setMergeFiles((prev) => prev.filter((_, j) => j !== i))}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="extractAudio" className="mt-0">
                  <p className="text-xs text-muted-foreground">
                    {t("videoTools.extractAudio")}: MP3
                  </p>
                </TabsContent>

                <TabsContent value="resize" className="mt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.width")} (px)</Label>
                    <Input value={resizeWidth} onChange={(e) => setResizeWidth(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.height")} (px)</Label>
                    <Input value={resizeHeight} onChange={(e) => setResizeHeight(e.target.value)} type="number" />
                  </div>
                </TabsContent>

                <TabsContent value="compress" className="mt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.quality")}: {quality}%</Label>
                    <Slider
                      value={[quality]}
                      onValueChange={(v) => setQuality(Array.isArray(v) ? v[0] : v)}
                      min={1}
                      max={100}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">{t("videoTools.qualityHint")}</p>
                  </div>
                </TabsContent>

                <TabsContent value="toGif" className="mt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.fps")}</Label>
                    <Input value={gifFps} onChange={(e) => setGifFps(e.target.value)} type="number" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.gifWidth")}</Label>
                    <Input value={gifWidth} onChange={(e) => setGifWidth(e.target.value)} type="number" />
                  </div>
                </TabsContent>

                <TabsContent value="rotate" className="mt-0 space-y-3">
                  <Select value={rotation} onValueChange={(v) => { if (v) setRotation(v); }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="90">{t("videoTools.rotation90")}</SelectItem>
                      <SelectItem value="180">{t("videoTools.rotation180")}</SelectItem>
                      <SelectItem value="270">{t("videoTools.rotation270")}</SelectItem>
                    </SelectContent>
                  </Select>
                </TabsContent>

                <TabsContent value="removeAudio" className="mt-0">
                  <p className="text-xs text-muted-foreground">
                    {t("videoTools.removeAudio")}
                  </p>
                </TabsContent>

                <TabsContent value="thumbnail" className="mt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{t("videoTools.frameTime")} ({t("videoTools.timeFormat")})</Label>
                    <Input value={frameTime} onChange={(e) => setFrameTime(e.target.value)} placeholder="00:00:01" />
                  </div>
                </TabsContent>
              </div>
            </Tabs>

            <div className="mt-auto pt-3">
              <Button
                className="w-full"
                disabled={processing || (!filePath && activeTab !== "merge")}
                onClick={handleProcess}
              >
                {processing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("videoTools.processing")}
                  </>
                ) : (
                  <>
                    <Film className="mr-2 h-4 w-4" />
                    {t("videoTools.process")}
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Right: video preview + timeline */}
          <div className="flex flex-1 flex-col min-h-0 rounded-lg border bg-card overflow-hidden">
            {videoSrc ? (
              <>
                {/* Video player */}
                <div className="flex-1 flex items-center justify-center bg-black min-h-0 relative">
                  <video
                    ref={videoRef}
                    src={videoSrc}
                    className="max-w-full max-h-full"
                    onTimeUpdate={handleVideoTimeUpdate}
                    onLoadedMetadata={handleVideoLoaded}
                    onEnded={() => setIsPlaying(false)}
                    onClick={togglePlay}
                  />
                  {!isPlaying && (
                    <button
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors"
                    >
                      <Play className="h-16 w-16 text-white/80" fill="white" fillOpacity={0.8} />
                    </button>
                  )}
                </div>

                {/* Controls bar */}
                <div className="flex items-center gap-3 px-4 py-2 border-t bg-card">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={togglePlay}>
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </Button>
                  <span className="text-xs font-mono text-muted-foreground min-w-[70px]">
                    {formatTimeCode(currentTime)}
                  </span>
                  <div className="flex-1" />
                  <span className="text-xs font-mono text-muted-foreground min-w-[70px] text-right">
                    {formatTimeCode(duration)}
                  </span>
                </div>

                {/* Timeline with thumbnails */}
                <div className="px-4 pb-3">
                  <div
                    className="relative h-16 rounded-md overflow-hidden cursor-pointer bg-muted border"
                    onClick={handleTimelineClick}
                  >
                    {/* Thumbnail strip */}
                    {thumbnails.length > 0 ? (
                      <div className="flex h-full w-full">
                        {thumbnails.map((thumb, i) => (
                          <img
                            key={i}
                            src={`data:image/jpeg;base64,${thumb}`}
                            alt=""
                            className="h-full object-cover"
                            style={{ width: `${100 / thumbnails.length}%` }}
                            draggable={false}
                          />
                        ))}
                      </div>
                    ) : loadingThumbs ? (
                      <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        {t("videoTools.loadingTimeline") || "Loading timeline..."}
                      </div>
                    ) : (
                      <div className="h-full bg-muted" />
                    )}

                    {/* Trim region overlay (only in trim mode) */}
                    {activeTab === "trim" && duration > 0 && (
                      <>
                        {/* Darkened areas outside trim region */}
                        <div
                          className="absolute top-0 bottom-0 left-0 bg-black/60"
                          style={{ width: `${(trimStart / duration) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 right-0 bg-black/60"
                          style={{ width: `${((duration - trimEnd) / duration) * 100}%` }}
                        />

                        {/* Trim start handle */}
                        <div
                          className="absolute top-0 bottom-0 w-1.5 bg-primary cursor-col-resize z-10 hover:bg-primary/80"
                          style={{ left: `calc(${(trimStart / duration) * 100}% - 3px)` }}
                          onMouseDown={(e) => handleTrimDrag(e, "start")}
                        >
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-primary text-primary-foreground px-1 rounded whitespace-nowrap">
                            {formatTimeCode(trimStart, true)}
                          </div>
                        </div>

                        {/* Trim end handle */}
                        <div
                          className="absolute top-0 bottom-0 w-1.5 bg-primary cursor-col-resize z-10 hover:bg-primary/80"
                          style={{ left: `calc(${(trimEnd / duration) * 100}% - 3px)` }}
                          onMouseDown={(e) => handleTrimDrag(e, "end")}
                        >
                          <div className="absolute -top-4 left-1/2 -translate-x-1/2 text-[10px] font-mono bg-primary text-primary-foreground px-1 rounded whitespace-nowrap">
                            {formatTimeCode(trimEnd, true)}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Playhead */}
                    {duration > 0 && (
                      <div
                        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{ left: `${(currentTime / duration) * 100}%` }}
                      >
                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-red-500 rounded-full" />
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Film className="h-12 w-12" />
                <p className="text-sm">{t("videoTools.loadVideo")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
