import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { DropZone } from "@/components/shared/DropZone";
import { FileCard } from "@/components/shared/FileCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getTargetFormats } from "@/lib/conversionMatrix";
import { getFormatByExtension, detectCategory } from "@/lib/formats";
import type { FileEntry, ConversionJob } from "@/types/conversion";
import { Download, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function ConverterPage() {
  const { t } = useTranslation();
  const {
    converterFiles, converterJobs, converterOptions,
    addConverterFiles, removeConverterFile, clearConverterFiles,
    setConverterOptions, addJob, updateJob, clearJobs,
  } = useAppStore();

  const [targetFormat, setTargetFormat] = useState<string>("");
  const [converting, setConverting] = useState(false);

  const handlePaths = useCallback(async (paths: string[]) => {
    const entries: FileEntry[] = [];
    for (const path of paths) {
      try {
        const info = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
        entries.push({
          id: crypto.randomUUID(),
          name: info.name,
          path,
          size: info.size,
          extension: info.extension,
          category: detectCategory(info.extension) || "document",
        });
      } catch (err) {
        toast.error(String(err));
      }
    }
    if (entries.length > 0) addConverterFiles(entries);
  }, [addConverterFiles]);

  const availableTargets = (() => {
    if (converterFiles.length === 0) return [];
    const ext = converterFiles[0].extension;
    return getTargetFormats(ext);
  })();

  const handleConvert = async () => {
    if (!targetFormat || converterFiles.length === 0) return;
    setConverting(true);
    clearJobs();

    for (const file of converterFiles) {
      const job: ConversionJob = {
        id: file.id,
        inputPath: file.path,
        outputPath: "",
        sourceFormat: file.extension,
        targetFormat,
        options: converterOptions,
        status: "pending",
        progress: 0,
      };
      addJob(job);
    }

    for (const file of converterFiles) {
      updateJob(file.id, { status: "processing", progress: 30 });
      try {
        const outputPath = await save({
          defaultPath: file.name.replace(/\.[^.]+$/, `.${targetFormat}`),
          filters: [{ name: targetFormat.toUpperCase(), extensions: [targetFormat] }],
        });
        if (!outputPath) {
          updateJob(file.id, { status: "failed", error: "Cancelled" });
          continue;
        }
        updateJob(file.id, { progress: 50 });
        const result = await invoke<string>("convert_file", {
          inputPath: file.path,
          outputPath,
          targetFormat,
          quality: converterOptions.quality ?? 85,
          compressionLevel: converterOptions.compressionLevel ?? 5,
        });
        updateJob(file.id, { status: "completed", progress: 100, outputPath: result });
        toast.success(`${file.name} → .${targetFormat}`);
      } catch (err) {
        const msg = String(err);
        const displayMsg = msg.includes("FFMPEG_NOT_INSTALLED")
          ? t("errors.ffmpegNotInstalled")
          : msg;
        updateJob(file.id, { status: "failed", error: displayMsg });
        toast.error(`${file.name}: ${displayMsg}`);
      }
    }
    setConverting(false);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("converter.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("converter.description")}</p>
      </div>

      <Tabs defaultValue="single" className="flex-1 flex flex-col min-h-0">
        <TabsList>
          <TabsTrigger value="single">{t("converter.single")}</TabsTrigger>
          <TabsTrigger value="batch">{t("converter.batch")}</TabsTrigger>
        </TabsList>

        <TabsContent value="single" className="flex-1 flex flex-col gap-4 min-h-0">
          <ConverterContent
            files={converterFiles}
            jobs={converterJobs}
            targetFormat={targetFormat}
            availableTargets={availableTargets}
            converting={converting}
            options={converterOptions}
            onPaths={handlePaths}
            onRemove={removeConverterFile}
            onClear={clearConverterFiles}
            onTargetChange={setTargetFormat}
            onOptionsChange={setConverterOptions}
            onConvert={handleConvert}
            t={t}
          />
        </TabsContent>

        <TabsContent value="batch" className="flex-1 flex flex-col gap-4 min-h-0">
          <ConverterContent
            files={converterFiles}
            jobs={converterJobs}
            targetFormat={targetFormat}
            availableTargets={availableTargets}
            converting={converting}
            options={converterOptions}
            onPaths={handlePaths}
            onRemove={removeConverterFile}
            onClear={clearConverterFiles}
            onTargetChange={setTargetFormat}
            onOptionsChange={setConverterOptions}
            onConvert={handleConvert}
            t={t}
            batch
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface ConverterContentProps {
  files: FileEntry[];
  jobs: ConversionJob[];
  targetFormat: string;
  availableTargets: string[];
  converting: boolean;
  options: { quality?: number; compressionLevel?: number; preserveMetadata?: boolean };
  onPaths: (paths: string[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onTargetChange: (f: string) => void;
  onOptionsChange: (opts: Record<string, unknown>) => void;
  onConvert: () => void;
  t: (key: string) => string;
  batch?: boolean;
}

function ConverterContent({
  files, jobs, targetFormat, availableTargets, converting, options,
  onPaths, onRemove, onClear, onTargetChange, onOptionsChange, onConvert, t, batch,
}: ConverterContentProps) {
  const showQuality = files.length > 0 && ["image", "audio", "video"].includes(
    detectCategory(files[0].extension) || ""
  );

  return (
    <div className="flex flex-1 gap-4 min-h-0">
      <div className="flex flex-1 flex-col gap-4 min-h-0">
        {files.length === 0 ? (
          <DropZone
            label={t("converter.dropzone")}
            activeLabel={t("converter.dropzoneActive")}
            multiple={batch}
            onPaths={onPaths}
            className="flex-1"
          />
        ) : (
          <>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {files.length} {t(files.length === 1 ? "common.file" : "common.files")}
              </span>
              <Button variant="ghost" size="sm" onClick={onClear}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {t("common.delete")}
              </Button>
            </div>
            <ScrollArea className="flex-1 min-h-0">
              <div className="flex flex-col gap-2 pr-3">
                {files.map((file) => {
                  const job = jobs.find((j) => j.id === file.id);
                  return (
                    <FileCard
                      key={file.id}
                      name={file.name}
                      size={file.size}
                      extension={file.extension}
                      category={file.category}
                      status={job?.status}
                      progress={job?.progress}
                      onRemove={() => onRemove(file.id)}
                    />
                  );
                })}
              </div>
            </ScrollArea>
            {batch && (
              <DropZone
                label={t("converter.dropzone")}
                activeLabel={t("converter.dropzoneActive")}
                multiple
                onPaths={onPaths}
                className="h-20"
              />
            )}
          </>
        )}
      </div>

      {files.length > 0 && (
        <div className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border bg-card p-4">
          <div className="space-y-2">
            <Label>{t("converter.selectFormat")}</Label>
            <Select value={targetFormat} onValueChange={(v) => { if (v) onTargetChange(v); }}>
              <SelectTrigger>
                <SelectValue placeholder={t("converter.selectFormat")} />
              </SelectTrigger>
              <SelectContent>
                {availableTargets.map((fmt) => {
                  const info = getFormatByExtension(fmt);
                  return (
                    <SelectItem key={fmt} value={fmt}>
                      {info?.label || fmt.toUpperCase()} (.{fmt})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {showQuality && (
            <>
              <Separator />
              <div className="space-y-2">
                <Label>{t("converter.quality")}: {options.quality}%</Label>
                <Slider
                  value={[options.quality ?? 85]}
                  onValueChange={(v) => {
                    const val = Array.isArray(v) ? v[0] : v;
                    onOptionsChange({ quality: val });
                  }}
                  min={1}
                  max={100}
                  step={1}
                />
              </div>
            </>
          )}

          <div className="mt-auto">
            <Button
              className="w-full"
              disabled={!targetFormat || converting}
              onClick={onConvert}
            >
              {converting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("converter.converting")}
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {batch ? t("converter.convertAll") : t("converter.convert")}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
