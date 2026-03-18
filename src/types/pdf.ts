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
  /** Fraction (0-1) of page width for X position */
  xFraction: number;
  /** Fraction (0-1) of page height for Y position (from top) */
  yFraction: number;
  /** Fraction (0-1) of page width for signature width */
  widthFraction: number;
  /** Fraction (0-1) of page height for signature height */
  heightFraction: number;
  dateText?: string;
}

export interface SavedSignature {
  id: string;
  name: string;
  imageBase64: string;
  createdAt: string;
}

export type SignatureMode = "draw" | "type" | "import";
