import type { FormatCategory, FormatInfo } from "@/types/conversion";

export const FORMAT_REGISTRY: FormatInfo[] = [
  // Images
  { extension: "jpg", mimeType: "image/jpeg", category: "image", label: "JPEG" },
  { extension: "jpeg", mimeType: "image/jpeg", category: "image", label: "JPEG" },
  { extension: "png", mimeType: "image/png", category: "image", label: "PNG" },
  { extension: "webp", mimeType: "image/webp", category: "image", label: "WebP" },
  { extension: "gif", mimeType: "image/gif", category: "image", label: "GIF" },
  { extension: "bmp", mimeType: "image/bmp", category: "image", label: "BMP" },
  { extension: "tiff", mimeType: "image/tiff", category: "image", label: "TIFF" },
  { extension: "avif", mimeType: "image/avif", category: "image", label: "AVIF" },
  { extension: "heic", mimeType: "image/heic", category: "image", label: "HEIC" },
  { extension: "ico", mimeType: "image/x-icon", category: "image", label: "ICO" },
  { extension: "svg", mimeType: "image/svg+xml", category: "image", label: "SVG" },

  // Documents
  { extension: "pdf", mimeType: "application/pdf", category: "document", label: "PDF" },
  { extension: "txt", mimeType: "text/plain", category: "document", label: "Text" },
  { extension: "md", mimeType: "text/markdown", category: "document", label: "Markdown" },
  { extension: "html", mimeType: "text/html", category: "document", label: "HTML" },
  { extension: "rtf", mimeType: "application/rtf", category: "document", label: "RTF" },
  { extension: "doc", mimeType: "application/msword", category: "document", label: "DOC" },
  { extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", category: "document", label: "DOCX" },
  { extension: "odt", mimeType: "application/vnd.oasis.opendocument.text", category: "document", label: "ODT" },
  { extension: "epub", mimeType: "application/epub+zip", category: "document", label: "EPUB" },

  // Data
  { extension: "csv", mimeType: "text/csv", category: "data", label: "CSV" },
  { extension: "json", mimeType: "application/json", category: "data", label: "JSON" },
  { extension: "xml", mimeType: "application/xml", category: "data", label: "XML" },
  { extension: "yaml", mimeType: "application/x-yaml", category: "data", label: "YAML" },
  { extension: "xls", mimeType: "application/vnd.ms-excel", category: "data", label: "XLS" },
  { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", category: "data", label: "XLSX" },
  { extension: "ods", mimeType: "application/vnd.oasis.opendocument.spreadsheet", category: "data", label: "ODS" },

  // Audio
  { extension: "mp3", mimeType: "audio/mpeg", category: "audio", label: "MP3" },
  { extension: "wav", mimeType: "audio/wav", category: "audio", label: "WAV" },
  { extension: "flac", mimeType: "audio/flac", category: "audio", label: "FLAC" },
  { extension: "aac", mimeType: "audio/aac", category: "audio", label: "AAC" },
  { extension: "ogg", mimeType: "audio/ogg", category: "audio", label: "OGG" },
  { extension: "m4a", mimeType: "audio/mp4", category: "audio", label: "M4A" },
  { extension: "opus", mimeType: "audio/opus", category: "audio", label: "Opus" },

  // Video
  { extension: "mp4", mimeType: "video/mp4", category: "video", label: "MP4" },
  { extension: "mov", mimeType: "video/quicktime", category: "video", label: "MOV" },
  { extension: "mkv", mimeType: "video/x-matroska", category: "video", label: "MKV" },
  { extension: "avi", mimeType: "video/x-msvideo", category: "video", label: "AVI" },
  { extension: "webm", mimeType: "video/webm", category: "video", label: "WebM" },
  { extension: "flv", mimeType: "video/x-flv", category: "video", label: "FLV" },
  { extension: "mpeg", mimeType: "video/mpeg", category: "video", label: "MPEG" },
  { extension: "mpg", mimeType: "video/mpeg", category: "video", label: "MPG" },

  // Archives
  { extension: "zip", mimeType: "application/zip", category: "archive", label: "ZIP" },
  { extension: "rar", mimeType: "application/vnd.rar", category: "archive", label: "RAR" },
  { extension: "7z", mimeType: "application/x-7z-compressed", category: "archive", label: "7Z" },
  { extension: "tar", mimeType: "application/x-tar", category: "archive", label: "TAR" },
  { extension: "gz", mimeType: "application/gzip", category: "archive", label: "GZ" },
];

export function getFormatByExtension(ext: string): FormatInfo | undefined {
  return FORMAT_REGISTRY.find((f) => f.extension === ext.toLowerCase());
}

export function getFormatsByCategory(category: FormatCategory): FormatInfo[] {
  return FORMAT_REGISTRY.filter((f) => f.category === category);
}

export function detectCategory(ext: string): FormatCategory | undefined {
  return getFormatByExtension(ext)?.category;
}

export const CATEGORY_LABELS: Record<FormatCategory, string> = {
  image: "Images",
  document: "Documents",
  data: "Data",
  audio: "Audio",
  video: "Video",
  archive: "Archives",
};
