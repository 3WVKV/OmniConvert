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
  CalendarDays, Loader2, Download, X,
} from "lucide-react";
import type { SignatureMode, SavedSignature, SignaturePlacement } from "@/types/pdf";
import { renderPdfPageToBase64 } from "@/lib/pdfRenderer";
import { toast } from "sonner";

interface SigOverlay {
  xFrac: number;
  yFrac: number;
  wFrac: number;
  hFrac: number;
}

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

  // Signature overlay on the PDF preview
  const [sigOverlay, setSigOverlay] = useState<SigOverlay | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const dragState = useRef<{
    type: "move" | "resize";
    startX: number;
    startY: number;
    startOverlay: SigOverlay;
  } | null>(null);

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
      const base64 = await invoke<string>("read_file_base64", { path });
      setPdfPath(path);
      setPdfBase64(base64);
      setPdfName(fileInfo.name);
      setPageCount(info.page_count);
      setCurrentPage(1);
      setSigOverlay(null);
      await renderPage(base64, 1);
    } catch (err) {
      toast.error(String(err));
    }
  }, [renderPage]);

  const closePdf = () => {
    setPdfPath(null);
    setPdfBase64(null);
    setPageImageSrc(null);
    setSigOverlay(null);
  };

  const goToPage = async (page: number) => {
    if (!pdfBase64 || page < 1 || page > pageCount) return;
    setCurrentPage(page);
    await renderPage(pdfBase64, page);
  };

  // Place signature overlay on the preview
  const placeSignatureOnPreview = () => {
    if (!signatureImage) return;
    setSigOverlay({
      xFrac: 0.55,
      yFrac: 0.82,
      wFrac: 0.3,
      hFrac: 0.08,
    });
  };

  // Get the actual image element dimensions for accurate fractional calculations
  const getImageRect = (): DOMRect | null => {
    return imgRef.current?.getBoundingClientRect() ?? null;
  };

  // Mouse handlers for drag & resize
  const handleOverlayMouseDown = (e: React.MouseEvent, actionType: "move" | "resize") => {
    e.preventDefault();
    e.stopPropagation();
    if (!sigOverlay) return;
    dragState.current = {
      type: actionType,
      startX: e.clientX,
      startY: e.clientY,
      startOverlay: { ...sigOverlay },
    };

    const handleMouseMove = (ev: MouseEvent) => {
      if (!dragState.current) return;
      const imgRect = getImageRect();
      if (!imgRect) return;
      const dx = (ev.clientX - dragState.current.startX) / imgRect.width;
      const dy = (ev.clientY - dragState.current.startY) / imgRect.height;
      const s = dragState.current.startOverlay;

      if (dragState.current.type === "move") {
        setSigOverlay({
          ...s,
          xFrac: Math.max(0, Math.min(1 - s.wFrac, s.xFrac + dx)),
          yFrac: Math.max(0, Math.min(1 - s.hFrac, s.yFrac + dy)),
        });
      } else {
        const newW = Math.max(0.05, Math.min(1 - s.xFrac, s.wFrac + dx));
        const newH = Math.max(0.03, Math.min(1 - s.yFrac, s.hFrac + dy));
        setSigOverlay({ ...s, wFrac: newW, hFrac: newH });
      }
    };

    const handleMouseUp = () => {
      dragState.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Smooth drawing with quadratic curves
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  const startDraw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    lastPoint.current = { x, y };
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";

    if (lastPoint.current) {
      // Smooth quadratic curve
      const midX = (lastPoint.current.x + x) / 2;
      const midY = (lastPoint.current.y + y) / 2;
      ctx.quadraticCurveTo(lastPoint.current.x, lastPoint.current.y, midX, midY);
      ctx.stroke();
    }

    lastPoint.current = { x, y };
  };

  const endDraw = () => {
    if (!drawing) return;
    setDrawing(false);
    lastPoint.current = null;
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
    setSigOverlay(null);
  };

  // Type signature → canvas
  useEffect(() => {
    if (signatureMode !== "type" || !typedName) return;
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.font = "italic 48px 'Geist Variable', serif";
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";
    ctx.fillText(typedName, 10, 60);
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
    if (!pdfPath || !signatureImage || !sigOverlay) return;
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
        xFraction: sigOverlay.xFrac,
        yFraction: sigOverlay.yFrac,
        widthFraction: sigOverlay.wFrac,
        heightFraction: sigOverlay.hFrac,
        dateText: addDate ? new Date().toLocaleDateString() : undefined,
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
          {/* PDF Preview centered with signature overlay */}
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
              <Button variant="ghost" size="sm" onClick={closePdf}>
                <X className="mr-1 h-4 w-4" />
                {t("common.close")}
              </Button>
            </div>
            {/* Centered scroll area */}
            <div className="flex-1 overflow-auto rounded-lg border bg-white min-h-0 w-full flex items-start justify-center">
              {loadingPage ? (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : pageImageSrc ? (
                <div ref={previewContainerRef} className="relative inline-block m-auto">
                  <img
                    ref={imgRef}
                    src={pageImageSrc}
                    alt="PDF page"
                    className="max-w-full max-h-[70vh] select-none"
                    draggable={false}
                  />
                  {/* Signature overlay */}
                  {sigOverlay && signatureImage && (
                    <div
                      className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 cursor-move"
                      style={{
                        left: `${sigOverlay.xFrac * 100}%`,
                        top: `${sigOverlay.yFrac * 100}%`,
                        width: `${sigOverlay.wFrac * 100}%`,
                        height: `${sigOverlay.hFrac * 100}%`,
                      }}
                      onMouseDown={(e) => handleOverlayMouseDown(e, "move")}
                    >
                      <img
                        src={signatureImage}
                        alt="signature"
                        className="h-full w-full object-contain pointer-events-none"
                        draggable={false}
                      />
                      {/* Resize handle (bottom-right) */}
                      <div
                        className="absolute -bottom-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-blue-600 cursor-se-resize border-2 border-white"
                        onMouseDown={(e) => handleOverlayMouseDown(e, "resize")}
                      />
                      {/* Remove overlay button */}
                      <div
                        className="absolute -top-2.5 -right-2.5 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center cursor-pointer text-xs leading-none font-bold"
                        onClick={(e) => { e.stopPropagation(); setSigOverlay(null); }}
                      >
                        x
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  {t("common.loading")}
                </div>
              )}
            </div>
          </div>

          {/* Signature panel */}
          <div className="flex w-80 shrink-0 flex-col gap-3 rounded-lg border bg-card p-4 overflow-y-auto">
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
                  width={560}
                  height={200}
                  className="w-full rounded border bg-white cursor-crosshair"
                  style={{ height: "150px" }}
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

            {/* Place on PDF button */}
            {signatureImage && !sigOverlay && (
              <Button variant="outline" className="w-full" onClick={placeSignatureOnPreview}>
                {t("pdfSignature.placeOnPage")}
              </Button>
            )}

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
                disabled={!signatureImage || !sigOverlay || saving}
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
