export interface PdfDocument {
  id: string;
  name: string;
  path: string;
  pageCount: number;
  fileSize: number;
  thumbnailBase64?: string;
}

export interface PdfInfo {
  pageCount: number;
  title?: string;
  author?: string;
  fileSizeBytes: number;
}

export interface PageRange {
  start: number;
  end: number;
}

export interface PageRotation {
  page: number;
  degrees: number;
}

export type CompressionQuality = "low" | "medium" | "high";

export interface CompressResult {
  outputPath: string;
  originalSize: number;
  compressedSize: number;
}

export interface SignaturePlacement {
  signatureImageBase64: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  dateText?: string;
  dateX?: number;
  dateY?: number;
}

export interface SavedSignature {
  id: string;
  name: string;
  imageBase64: string;
  createdAt: string;
}

export type SignatureMode = "draw" | "type" | "import";
