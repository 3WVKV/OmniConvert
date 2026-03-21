import { create } from "zustand";
import type { FileEntry, ConversionJob, ConversionOptions } from "@/types/conversion";
import type { PdfDocument, SavedSignature } from "@/types/pdf";

export type AppView = "converter" | "pdfMerge" | "pdfSignature" | "pdfToolkit" | "ocr" | "videoTools";

interface AppState {
  currentView: AppView;
  setView: (view: AppView) => void;

  // Converter
  converterFiles: FileEntry[];
  converterJobs: ConversionJob[];
  converterOptions: ConversionOptions;
  addConverterFiles: (files: FileEntry[]) => void;
  removeConverterFile: (id: string) => void;
  clearConverterFiles: () => void;
  setConverterOptions: (opts: Partial<ConversionOptions>) => void;
  updateJob: (id: string, updates: Partial<ConversionJob>) => void;
  addJob: (job: ConversionJob) => void;
  clearJobs: () => void;

  // PDF Merge
  pdfMergeFiles: PdfDocument[];
  addPdfMergeFiles: (files: PdfDocument[]) => void;
  removePdfMergeFile: (id: string) => void;
  reorderPdfMergeFiles: (files: PdfDocument[]) => void;
  clearPdfMergeFiles: () => void;

  // PDF Signature
  savedSignatures: SavedSignature[];
  addSavedSignature: (sig: SavedSignature) => void;
  removeSavedSignature: (id: string) => void;

  // PDF Toolkit — state managed locally in component
}

export const useAppStore = create<AppState>((set) => ({
  currentView: "converter",
  setView: (view) => set({ currentView: view }),

  // Converter
  converterFiles: [],
  converterJobs: [],
  converterOptions: { quality: 85, compressionLevel: 5, preserveMetadata: true },
  addConverterFiles: (files) =>
    set((s) => ({ converterFiles: [...s.converterFiles, ...files] })),
  removeConverterFile: (id) =>
    set((s) => ({
      converterFiles: s.converterFiles.filter((f) => f.id !== id),
      converterJobs: s.converterJobs.filter((j) => j.id !== id),
    })),
  clearConverterFiles: () => set({ converterFiles: [], converterJobs: [] }),
  setConverterOptions: (opts) =>
    set((s) => ({ converterOptions: { ...s.converterOptions, ...opts } })),
  updateJob: (id, updates) =>
    set((s) => ({
      converterJobs: s.converterJobs.map((j) =>
        j.id === id ? { ...j, ...updates } : j
      ),
    })),
  addJob: (job) => set((s) => ({ converterJobs: [...s.converterJobs, job] })),
  clearJobs: () => set({ converterJobs: [] }),

  // PDF Merge
  pdfMergeFiles: [],
  addPdfMergeFiles: (files) =>
    set((s) => ({ pdfMergeFiles: [...s.pdfMergeFiles, ...files] })),
  removePdfMergeFile: (id) =>
    set((s) => ({ pdfMergeFiles: s.pdfMergeFiles.filter((f) => f.id !== id) })),
  reorderPdfMergeFiles: (files) => set({ pdfMergeFiles: files }),
  clearPdfMergeFiles: () => set({ pdfMergeFiles: [] }),

  // PDF Signature
  savedSignatures: JSON.parse(localStorage.getItem("savedSignatures") || "[]"),
  addSavedSignature: (sig) =>
    set((s) => {
      const updated = [...s.savedSignatures, sig];
      localStorage.setItem("savedSignatures", JSON.stringify(updated));
      return { savedSignatures: updated };
    }),
  removeSavedSignature: (id) =>
    set((s) => {
      const updated = s.savedSignatures.filter((sig) => sig.id !== id);
      localStorage.setItem("savedSignatures", JSON.stringify(updated));
      return { savedSignatures: updated };
    }),
}));
