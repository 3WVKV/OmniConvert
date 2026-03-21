import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ScanText, Copy, FileText, FileCode, Loader2, Check } from "lucide-react";
import { renderPdfPageToBase64 } from "@/lib/pdfRenderer";
import type { OcrLanguage } from "@/types/ocr";
import { toast } from "sonner";

export function OcrPage() {
  const { t } = useTranslation();

  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [fileExt, setFileExt] = useState("");
  const [language, setLanguage] = useState<OcrLanguage>("eng");
  const [extractedText, setExtractedText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handlePaths = useCallback(async (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    try {
      const fileInfo = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
      setFilePath(path);
      setFileName(fileInfo.name);
      setFileExt(fileInfo.extension.toLowerCase());
      setExtractedText("");
    } catch (err) {
      toast.error(String(err));
    }
  }, []);

  const handleExtract = async () => {
    if (!filePath) return;
    setExtracting(true);
    try {
      if (fileExt === "pdf") {
        // For PDFs: render each page to image, then OCR the images
        const pdfInfo = await invoke<{ page_count: number; file_size: number }>("get_pdf_info", { path: filePath });
        const pdfBase64 = await invoke<string>("read_file_base64", { path: filePath });
        let allText = "";

        for (let page = 1; page <= pdfInfo.page_count; page++) {
          const dataUrl = await renderPdfPageToBase64(pdfBase64, page, 2.5);
          // Send rendered image to backend OCR
          const result = await invoke<{ text: string; confidence: number }>("ocr_extract_base64", {
            imageBase64: dataUrl,
            language,
          });
          if (result.text.trim()) {
            if (pdfInfo.page_count > 1) {
              allText += `--- ${t("pdfSignature.page")} ${page} ---\n`;
            }
            allText += result.text + "\n";
          }
        }

        setExtractedText(allText.trim());
        if (!allText.trim()) {
          toast.info(t("ocr.noText"));
        }
      } else {
        // For images: use direct file path OCR
        const result = await invoke<{ text: string; confidence: number }>("ocr_extract", {
          path: filePath,
          language,
        });
        setExtractedText(result.text);
        if (!result.text) {
          toast.info(t("ocr.noText"));
        }
      }
    } catch (err) {
      const msg = String(err);
      if (msg.includes("TESSERACT_NOT_INSTALLED")) {
        toast.error(t("errors.tesseractNotInstalled"));
      } else if (msg.includes("TESSERACT_LANG_NOT_AVAILABLE")) {
        toast.error(t("errors.tesseractLangNotAvailable"));
      } else {
        toast.error(msg);
      }
    }
    setExtracting(false);
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(extractedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t("ocr.copied"));
  };

  const handleExport = async (format: "txt" | "md") => {
    const ext = format === "md" ? "md" : "txt";
    const outputPath = await save({
      defaultPath: fileName.replace(/\.[^.]+$/, `.${ext}`),
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (!outputPath) return;
    try {
      const content = format === "md"
        ? `# OCR: ${fileName}\n\n${extractedText}`
        : extractedText;
      await invoke("write_text_file", { path: outputPath, content });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("ocr.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("ocr.description")}</p>
      </div>

      {!filePath ? (
        <DropZone
          label={t("ocr.dropzone")}
          activeLabel={t("converter.dropzoneActive")}
          extensions={["png", "jpg", "jpeg", "bmp", "tiff", "webp", "pdf"]}
          multiple={false}
          onPaths={handlePaths}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* Controls */}
          <div className="flex w-64 shrink-0 flex-col gap-4 rounded-lg border bg-card p-4">
            <div className="space-y-1">
              <p className="text-sm font-medium truncate">{fileName}</p>
              {fileExt === "pdf" && (
                <p className="text-xs text-muted-foreground">PDF → {t("ocr.pdfRenderHint")}</p>
              )}
              <Button variant="ghost" size="sm" onClick={() => { setFilePath(null); setExtractedText(""); setFileExt(""); }}>
                {t("common.close")}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("ocr.language")}</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as OcrLanguage)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="eng">{t("ocr.english")}</SelectItem>
                  <SelectItem value="fra">{t("ocr.french")}</SelectItem>
                  <SelectItem value="eng+fra">{t("ocr.both")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              className="w-full"
              disabled={extracting}
              onClick={handleExtract}
            >
              {extracting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("ocr.extracting")}
                </>
              ) : (
                <>
                  <ScanText className="mr-2 h-4 w-4" />
                  {t("ocr.extract")}
                </>
              )}
            </Button>

            {extractedText && (
              <>
                <Separator />
                <Button variant="outline" className="w-full" onClick={handleCopy}>
                  {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  {copied ? t("ocr.copied") : t("ocr.copyToClipboard")}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => handleExport("txt")}>
                  <FileText className="mr-2 h-4 w-4" />
                  {t("ocr.exportTxt")}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => handleExport("md")}>
                  <FileCode className="mr-2 h-4 w-4" />
                  {t("ocr.exportMd")}
                </Button>
              </>
            )}
          </div>

          {/* Text output */}
          <div className="flex flex-1 flex-col min-h-0">
            <ScrollArea className="flex-1 rounded-lg border bg-card p-4 min-h-0">
              {extractedText ? (
                <pre className="whitespace-pre-wrap text-sm font-mono">{extractedText}</pre>
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
                  {extracting ? t("ocr.extracting") : t("ocr.noText")}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  );
}
