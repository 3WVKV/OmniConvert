import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Scissors, FileOutput, RotateCw, Minimize2, FileImage, FileText,
  Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { CompressionQuality } from "@/types/pdf";
import { toast } from "sonner";

export function PdfToolkitPage() {
  const { t } = useTranslation();

  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImageBase64, setPageImageBase64] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  // Split / Extract
  const [pageRange, setPageRange] = useState("");

  // Rotate
  const [rotateDegrees, setRotateDegrees] = useState(90);

  // Compress
  const [compressionLevel, setCompressionLevel] = useState<CompressionQuality>("medium");

  const loadPdf = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    const path = (file as unknown as { path?: string }).path || file.name;
    try {
      const info = await invoke<{ page_count: number }>("get_pdf_info", { path });
      setPdfPath(path);
      setPdfName(file.name);
      setPageCount(info.page_count);
      setCurrentPage(1);
      await renderPage(path, 1);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const renderPage = async (path: string, page: number) => {
    try {
      const base64 = await invoke<string>("render_pdf_page", { path, pageNumber: page });
      setPageImageBase64(base64);
    } catch {
      setPageImageBase64(null);
    }
  };

  const goToPage = async (page: number) => {
    if (!pdfPath || page < 1 || page > pageCount) return;
    setCurrentPage(page);
    await renderPage(pdfPath, page);
  };

  const handleSplit = async () => {
    if (!pdfPath || !pageRange) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_split.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("split_pdf", { inputPath: pdfPath, outputPath, pageRange });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  const handleExtract = async () => {
    if (!pdfPath || !pageRange) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_extracted.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("extract_pages", { inputPath: pdfPath, outputPath, pageRange });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  const handleRotate = async () => {
    if (!pdfPath) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_rotated.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("rotate_pdf", {
        inputPath: pdfPath,
        outputPath,
        pageRange: pageRange || `1-${pageCount}`,
        degrees: rotateDegrees,
      });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  const handleCompress = async () => {
    if (!pdfPath) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_compressed.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("compress_pdf", { inputPath: pdfPath, outputPath, quality: compressionLevel });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  const handleConvertToImages = async () => {
    if (!pdfPath) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_pages"),
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("pdf_to_images", { inputPath: pdfPath, outputDir: outputPath });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  const handleConvertToText = async () => {
    if (!pdfPath) return;
    setProcessing(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", ".txt"),
        filters: [{ name: "Text", extensions: ["txt"] }],
      });
      if (!outputPath) { setProcessing(false); return; }
      await invoke("pdf_to_text", { inputPath: pdfPath, outputPath });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setProcessing(false);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pdfToolkit.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pdfToolkit.description")}</p>
      </div>

      {!pdfPath ? (
        <DropZone
          label={t("pdfToolkit.loadPdf")}
          activeLabel={t("converter.dropzoneActive")}
          accept=".pdf"
          multiple={false}
          onFiles={loadPdf}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 gap-4 min-h-0">
          {/* PDF Preview */}
          <div className="flex flex-1 flex-col items-center gap-2 min-h-0">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm">
                {currentPage} / {pageCount}
              </span>
              <Button variant="ghost" size="icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setPdfPath(null); setPageImageBase64(null); }}>
                {t("common.close")}
              </Button>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border bg-white min-h-0">
              {pageImageBase64 ? (
                <img src={`data:image/png;base64,${pageImageBase64}`} alt="PDF page" className="max-w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {t("common.loading")}
                </div>
              )}
            </div>
          </div>

          {/* Tools panel */}
          <div className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-4">
            <Tabs defaultValue="split">
              <TabsList className="w-full flex-wrap h-auto gap-1">
                <TabsTrigger value="split" className="text-xs">
                  <Scissors className="mr-1 h-3 w-3" /> {t("pdfToolkit.split")}
                </TabsTrigger>
                <TabsTrigger value="extract" className="text-xs">
                  <FileOutput className="mr-1 h-3 w-3" /> {t("pdfToolkit.extract")}
                </TabsTrigger>
                <TabsTrigger value="rotate" className="text-xs">
                  <RotateCw className="mr-1 h-3 w-3" /> {t("pdfToolkit.rotate")}
                </TabsTrigger>
                <TabsTrigger value="compress" className="text-xs">
                  <Minimize2 className="mr-1 h-3 w-3" /> {t("pdfToolkit.compress")}
                </TabsTrigger>
                <TabsTrigger value="convert" className="text-xs">
                  <FileImage className="mr-1 h-3 w-3" /> {t("pdfToolkit.convertTo")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="split" className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t("pdfToolkit.pageRange")}</Label>
                  <Input
                    placeholder="1-3, 5, 8-10"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={!pageRange || processing} onClick={handleSplit}>
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Scissors className="mr-2 h-4 w-4" />}
                  {t("pdfToolkit.split")}
                </Button>
              </TabsContent>

              <TabsContent value="extract" className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t("pdfToolkit.pageRange")}</Label>
                  <Input
                    placeholder="1-3, 5, 8-10"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
                <Button className="w-full" disabled={!pageRange || processing} onClick={handleExtract}>
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileOutput className="mr-2 h-4 w-4" />}
                  {t("pdfToolkit.extract")}
                </Button>
              </TabsContent>

              <TabsContent value="rotate" className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t("pdfToolkit.pageRange")}</Label>
                  <Input
                    placeholder={`1-${pageCount}`}
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={rotateDegrees === 90 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setRotateDegrees(90)}
                  >
                    {t("pdfToolkit.rotateRight")}
                  </Button>
                  <Button
                    variant={rotateDegrees === 270 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setRotateDegrees(270)}
                  >
                    {t("pdfToolkit.rotateLeft")}
                  </Button>
                </div>
                <Button
                  variant={rotateDegrees === 180 ? "default" : "outline"}
                  size="sm"
                  className="w-full"
                  onClick={() => setRotateDegrees(180)}
                >
                  {t("pdfToolkit.rotate180")}
                </Button>
                <Button className="w-full" disabled={processing} onClick={handleRotate}>
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
                  {t("pdfToolkit.apply")}
                </Button>
              </TabsContent>

              <TabsContent value="compress" className="space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">{t("pdfToolkit.compressionLevel")}</Label>
                  <Select value={compressionLevel} onValueChange={(v) => setCompressionLevel(v as CompressionQuality)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t("pdfToolkit.low")}</SelectItem>
                      <SelectItem value="medium">{t("pdfToolkit.medium")}</SelectItem>
                      <SelectItem value="high">{t("pdfToolkit.high")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={processing} onClick={handleCompress}>
                  {processing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Minimize2 className="mr-2 h-4 w-4" />}
                  {t("pdfToolkit.compress")}
                </Button>
              </TabsContent>

              <TabsContent value="convert" className="space-y-3">
                <Button variant="outline" className="w-full" disabled={processing} onClick={handleConvertToImages}>
                  <FileImage className="mr-2 h-4 w-4" />
                  {t("pdfToolkit.toImages")}
                </Button>
                <Button variant="outline" className="w-full" disabled={processing} onClick={handleConvertToText}>
                  <FileText className="mr-2 h-4 w-4" />
                  {t("pdfToolkit.toText")}
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </div>
  );
}
