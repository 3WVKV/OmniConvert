export interface OcrResult {
  text: string;
  confidence: number;
  wordCount: number;
}

export type OcrLanguage = "eng" | "fra" | "eng+fra";

export type OcrOutputFormat = "txt" | "markdown";
