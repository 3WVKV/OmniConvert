export type FormatCategory = "image" | "document" | "data" | "audio" | "video" | "archive";

export interface FormatInfo {
  extension: string;
  mimeType: string;
  category: FormatCategory;
  label: string;
}

export interface ConversionOptions {
  quality?: number;
  compressionLevel?: number;
  preserveMetadata?: boolean;
  bitrate?: string;
  sampleRate?: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  crf?: number;
}

export type JobStatus = "pending" | "processing" | "completed" | "failed";

export interface ConversionJob {
  id: string;
  inputPath: string;
  outputPath: string;
  sourceFormat: string;
  targetFormat: string;
  options: ConversionOptions;
  status: JobStatus;
  progress: number;
  error?: string;
}

export interface ConversionResult {
  jobId: string;
  outputPath: string;
  success: boolean;
  error?: string;
  originalSize: number;
  outputSize: number;
}

export interface FileEntry {
  id: string;
  name: string;
  path: string;
  size: number;
  extension: string;
  category: FormatCategory;
}

export interface MediaInfo {
  duration: number;
  videoCodec?: string;
  audioCodec?: string;
  resolution?: string;
  bitrate?: number;
  sampleRate?: number;
  channels?: number;
}
