import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
// ScrollArea available if needed
import {
  Scissors, Merge, Music, Maximize, Minimize2, Image as ImageIcon,
  RotateCw, VolumeX, Camera, Loader2, X, Film, Plus,
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
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("trim");

  // Trim
  const [startTime, setStartTime] = useState("00:00:00");
  const [endTime, setEndTime] = useState("00:00:10");

  // Merge
  const [mergeFiles, setMergeFiles] = useState<{ path: string; name: string }[]>([]);

  // Resize
  const [resizeWidth, setResizeWidth] = useState("1280");
  const [resizeHeight, setResizeHeight] = useState("720");

  // Compress
  const [crf, setCrf] = useState(23);

  // GIF
  const [gifFps, setGifFps] = useState("10");
  const [gifWidth, setGifWidth] = useState("480");

  // Rotate
  const [rotation, setRotation] = useState("90");

  // Thumbnail
  const [frameTime, setFrameTime] = useState("00:00:01");

  const handlePaths = useCallback(async (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    try {
      const info = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
      setFilePath(path);
      setFileName(info.name);
      // Try to get media info
      try {
        const mediaInfo = await invoke<VideoInfo>("get_media_info", { path });
        setVideoInfo(mediaInfo);
      } catch {
        setVideoInfo(null);
      }
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
          await invoke("ffmpeg_compress", { inputPath: filePath, outputPath: out, crf });
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

  const formatDuration = (dur: string) => {
    const secs = parseFloat(dur);
    if (isNaN(secs)) return dur;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
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
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => { setFilePath(null); setVideoInfo(null); }}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  {videoInfo && (
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {videoInfo.duration !== "unknown" && (
                        <p>{t("videoTools.duration")}: {formatDuration(videoInfo.duration)}</p>
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
                    <Label className="text-xs">{t("videoTools.crf")}: {crf}</Label>
                    <Slider
                      value={[crf]}
                      onValueChange={(v) => setCrf(Array.isArray(v) ? v[0] : v)}
                      min={0}
                      max={51}
                      step={1}
                    />
                    <p className="text-xs text-muted-foreground">{t("videoTools.crfHint")}</p>
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

          {/* Right: video preview area */}
          <div className="flex flex-1 flex-col items-center justify-center min-h-0 rounded-lg border bg-card">
            {filePath ? (
              <div className="flex flex-col items-center gap-4 p-8 text-center">
                <Film className="h-16 w-16 text-muted-foreground" />
                <div>
                  <p className="text-lg font-medium">{fileName}</p>
                  {videoInfo && videoInfo.duration !== "unknown" && (
                    <p className="text-sm text-muted-foreground">
                      {formatDuration(videoInfo.duration)} • {videoInfo.resolution} • {formatBytes(videoInfo.file_size)}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
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
