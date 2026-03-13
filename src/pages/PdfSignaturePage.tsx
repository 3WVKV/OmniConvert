import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  PenTool, Type, ImageIcon, Save, Trash2, ChevronLeft, ChevronRight,
  CalendarDays, Loader2, Download,
} from "lucide-react";
import type { SignatureMode, SavedSignature, SignaturePlacement } from "@/types/pdf";
import { renderPdfPageToBase64 } from "@/lib/pdfRenderer";
import { toast } from "sonner";

export function PdfSignaturePage() {
  const { t } = useTranslation();
  const { savedSignatures, addSavedSignature, removeSavedSignature } = useAppStore();

  const [pdfPath, setPdfPath] = useState<string | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [pdfName, setPdfName] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageImageSrc, setPageImageSrc] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  const [signatureMode, setSignatureMode] = useState<SignatureMode>("draw");
  const [signatureImage, setSignatureImage] = useState<string | null>(null);
  const [typedName, setTypedName] = useState("");
  const [signatureName, setSignatureName] = useState("");
  const [addDate, setAddDate] = useState(false);
  const [saving, setSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  const renderPage = useCallback(async (base64: string, page: number) => {
    setLoadingPage(true);
    try {
      const dataUrl = await renderPdfPageToBase64(base64, page);
      setPageImageSrc(dataUrl);
    } catch {
      setPageImageSrc(null);
    }
    setLoadingPage(false);
  }, []);

  const loadPdf = useCallback(async (paths: string[]) => {
    const path = paths[0];
    if (!path) return;
    try {
      const fileInfo = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
      const info = await invoke<{ page_count: number }>("get_pdf_info", { path });
      // Load the PDF bytes for pdf.js rendering
      const base64 = await invoke<string>("read_file_base64", { path });
      setPdfPath(path);
      setPdfBase64(base64);
      setPdfName(fileInfo.name);
      setPageCount(info.page_count);
      setCurrentPage(1);
      await renderPage(base64, 1);
    } catch (err) {
      toast.error(String(err));
    }
  }, [renderPage]);

  const goToPage = async (page: number) => {
    if (!pdfBase64 || page < 1 || page > pageCount) return;
    setCurrentPage(page);
    await renderPage(pdfBase64, page);
  };

  // Drawing handlers
  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
  };

  const endDraw = () => {
    setDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      setSignatureImage(canvas.toDataURL("image/png"));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
    setSignatureImage(null);
  };

  // Type signature → canvas
  useEffect(() => {
    if (signatureMode !== "type" || !typedName) return;
    const canvas = document.createElement("canvas");
    canvas.width = 300;
    canvas.height = 80;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "italic 32px 'Geist Variable', serif";
    ctx.fillStyle = "#000";
    ctx.fillText(typedName, 10, 50);
    setSignatureImage(canvas.toDataURL("image/png"));
  }, [typedName, signatureMode]);

  const handleImportImage = async () => {
    const path = await open({ filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }] });
    if (!path) return;
    try {
      const base64 = await invoke<string>("read_file_base64", { path });
      setSignatureImage(`data:image/png;base64,${base64}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleSaveSignature = () => {
    if (!signatureImage || !signatureName) return;
    const sig: SavedSignature = {
      id: crypto.randomUUID(),
      name: signatureName,
      imageBase64: signatureImage,
      createdAt: new Date().toISOString(),
    };
    addSavedSignature(sig);
    setSignatureName("");
    toast.success(t("common.success"));
  };

  const handleApplySignature = async () => {
    if (!pdfPath || !signatureImage) return;
    setSaving(true);
    try {
      const outputPath = await save({
        defaultPath: pdfName.replace(".pdf", "_signed.pdf"),
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setSaving(false); return; }

      const placement: SignaturePlacement = {
        signatureImageBase64: signatureImage,
        pageIndex: currentPage - 1,
        x: 350,
        y: 700,
        width: 200,
        height: 60,
        dateText: addDate ? new Date().toLocaleDateString() : undefined,
        dateX: addDate ? 350 : undefined,
        dateY: addDate ? 770 : undefined,
      };

      await invoke("apply_signature", {
        inputPath: pdfPath,
        outputPath,
        placement,
      });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setSaving(false);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pdfSignature.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pdfSignature.description")}</p>
      </div>

      {!pdfPath ? (
        <DropZone
          label={t("pdfSignature.loadPdf")}
          activeLabel={t("converter.dropzoneActive")}
          extensions={["pdf"]}
          multiple={false}
          onPaths={loadPdf}
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
                {t("pdfSignature.page")} {currentPage} {t("pdfSignature.of")} {pageCount}
              </span>
              <Button variant="ghost" size="icon" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= pageCount}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto rounded-lg border bg-white min-h-0">
              {loadingPage ? (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : pageImageSrc ? (
                <img src={pageImageSrc} alt="PDF page" className="max-w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted-foreground">
                  {t("common.loading")}
                </div>
              )}
            </div>
          </div>

          {/* Signature panel */}
          <div className="flex w-72 shrink-0 flex-col gap-3 rounded-lg border bg-card p-4">
            <Tabs value={signatureMode} onValueChange={(v) => setSignatureMode(v as SignatureMode)}>
              <TabsList className="w-full">
                <TabsTrigger value="draw" className="flex-1">
                  <PenTool className="mr-1 h-3.5 w-3.5" /> {t("pdfSignature.draw")}
                </TabsTrigger>
                <TabsTrigger value="type" className="flex-1">
                  <Type className="mr-1 h-3.5 w-3.5" /> {t("pdfSignature.type")}
                </TabsTrigger>
                <TabsTrigger value="import" className="flex-1">
                  <ImageIcon className="mr-1 h-3.5 w-3.5" /> {t("pdfSignature.import")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="draw" className="space-y-2">
                <canvas
                  ref={canvasRef}
                  width={240}
                  height={80}
                  className="w-full rounded border bg-white cursor-crosshair"
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                />
                <Button variant="ghost" size="sm" onClick={clearCanvas}>
                  {t("pdfSignature.clear")}
                </Button>
              </TabsContent>

              <TabsContent value="type" className="space-y-2">
                <Input
                  placeholder={t("pdfSignature.typeName")}
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                />
                {signatureImage && (
                  <img src={signatureImage} alt="typed signature" className="rounded border bg-white p-2" />
                )}
              </TabsContent>

              <TabsContent value="import" className="space-y-2">
                <Button variant="outline" className="w-full" onClick={handleImportImage}>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  {t("pdfSignature.import")}
                </Button>
                {signatureImage && (
                  <img src={signatureImage} alt="imported signature" className="rounded border bg-white p-2" />
                )}
              </TabsContent>
            </Tabs>

            <Separator />

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="addDate"
                checked={addDate}
                onChange={(e) => setAddDate(e.target.checked)}
                className="rounded"
              />
              <Label htmlFor="addDate" className="text-sm cursor-pointer">
                <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                {t("pdfSignature.addDate")}
              </Label>
            </div>

            <Separator />

            {/* Save signature */}
            <div className="space-y-2">
              <Label className="text-xs">{t("pdfSignature.saveSignature")}</Label>
              <div className="flex gap-2">
                <Input
                  placeholder={t("pdfSignature.signatureName")}
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  disabled={!signatureImage || !signatureName}
                  onClick={handleSaveSignature}
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Saved signatures */}
            {savedSignatures.length > 0 && (
              <>
                <Separator />
                <Label className="text-xs">{t("pdfSignature.savedSignatures")}</Label>
                <ScrollArea className="max-h-32">
                  <div className="flex flex-col gap-1">
                    {savedSignatures.map((sig) => (
                      <div
                        key={sig.id}
                        className="flex items-center gap-2 rounded border p-1.5 cursor-pointer hover:bg-accent"
                        onClick={() => setSignatureImage(sig.imageBase64)}
                      >
                        <img src={sig.imageBase64} alt={sig.name} className="h-6 w-12 object-contain" />
                        <span className="flex-1 truncate text-xs">{sig.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={(e) => { e.stopPropagation(); removeSavedSignature(sig.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}

            <div className="mt-auto">
              <Button
                className="w-full"
                disabled={!signatureImage || saving}
                onClick={handleApplySignature}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                {t("pdfSignature.savePdf")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
