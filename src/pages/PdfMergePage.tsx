import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { useAppStore } from "@/stores/appStore";
import { DropZone } from "@/components/shared/DropZone";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { FileText, ChevronUp, ChevronDown, X, Merge, Loader2 } from "lucide-react";
import type { PdfDocument } from "@/types/pdf";
import { toast } from "sonner";

export function PdfMergePage() {
  const { t } = useTranslation();
  const {
    pdfMergeFiles, addPdfMergeFiles, removePdfMergeFile,
    reorderPdfMergeFiles, clearPdfMergeFiles,
  } = useAppStore();
  const [merging, setMerging] = useState(false);

  const handlePaths = useCallback(async (paths: string[]) => {
    const pdfPaths = paths.filter((p) => p.toLowerCase().endsWith(".pdf"));
    if (pdfPaths.length === 0) return;

    const docs: PdfDocument[] = [];
    for (const path of pdfPaths) {
      try {
        const fileInfo = await invoke<{ name: string; size: number; extension: string }>("get_file_info", { path });
        const info = await invoke<{ page_count: number; file_size: number }>("get_pdf_info", { path });
        docs.push({
          id: crypto.randomUUID(),
          name: fileInfo.name,
          path,
          pageCount: info.page_count,
          fileSize: info.file_size,
        });
      } catch {
        const name = path.split(/[\\/]/).pop() || path;
        docs.push({
          id: crypto.randomUUID(),
          name,
          path,
          pageCount: 0,
          fileSize: 0,
        });
      }
    }
    addPdfMergeFiles(docs);
  }, [addPdfMergeFiles]);

  const moveItem = (idx: number, direction: -1 | 1) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= pdfMergeFiles.length) return;
    const items = [...pdfMergeFiles];
    const [moved] = items.splice(idx, 1);
    items.splice(newIdx, 0, moved);
    reorderPdfMergeFiles(items);
  };

  const handleMerge = async () => {
    if (pdfMergeFiles.length < 2) return;
    setMerging(true);
    try {
      const outputPath = await save({
        defaultPath: "merged.pdf",
        filters: [{ name: "PDF", extensions: ["pdf"] }],
      });
      if (!outputPath) { setMerging(false); return; }

      await invoke("merge_pdfs", {
        inputPaths: pdfMergeFiles.map((f) => f.path),
        outputPath,
      });
      toast.success(t("common.success"));
    } catch (err) {
      toast.error(String(err));
    }
    setMerging(false);
  };

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pdfMerge.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("pdfMerge.description")}</p>
      </div>

      {pdfMergeFiles.length === 0 ? (
        <DropZone
          label={t("pdfMerge.dropzone")}
          activeLabel={t("converter.dropzoneActive")}
          extensions={["pdf"]}
          multiple
          onPaths={handlePaths}
          className="flex-1"
        />
      ) : (
        <div className="flex flex-1 flex-col gap-4 min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("pdfMerge.reorderHint")}</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={clearPdfMergeFiles}>
                {t("common.delete")}
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0">
            <div className="flex flex-col gap-2 pr-3">
              {pdfMergeFiles.map((doc, idx) => (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors"
                >
                  <div className="flex flex-col gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === pdfMergeFiles.length - 1}
                      onClick={() => moveItem(idx, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                    <FileText className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{doc.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {doc.pageCount > 0 ? `${doc.pageCount} ${t("pdfMerge.pages")}` : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removePdfMergeFile(doc.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </ScrollArea>

          <DropZone
            label={t("pdfMerge.addFiles")}
            activeLabel={t("converter.dropzoneActive")}
            extensions={["pdf"]}
            multiple
            onPaths={handlePaths}
            className="h-20"
          />

          <Separator />

          <Button
            size="lg"
            disabled={pdfMergeFiles.length < 2 || merging}
            onClick={handleMerge}
          >
            {merging ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("pdfMerge.merging")}
              </>
            ) : (
              <>
                <Merge className="mr-2 h-4 w-4" />
                {t("pdfMerge.merge")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
