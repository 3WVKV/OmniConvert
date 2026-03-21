/** Maps source extension to list of valid target extensions */

const imageFormats = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "avif", "heic", "ico", "svg"];
const audioFormats = ["mp3", "wav", "flac", "aac", "ogg", "m4a", "opus"];
const videoFormats = ["mp4", "mov", "mkv", "avi", "webm", "flv", "mpeg", "mpg"];
const docFormats = ["txt", "md", "html", "rtf", "docx"];
const dataFormats = ["csv", "json", "xml", "yaml", "xlsx", "xls", "ods"];
const archiveFormats = ["zip", "tar", "gz", "7z"];

function allExcept(formats: string[], self: string): string[] {
  return formats.filter((f) => f !== self);
}

export const conversionMatrix: Record<string, string[]> = {
  // ─── Images ──────────────────────────────────────────────
  // Every image format can convert to every other image format + PDF
  ...Object.fromEntries(
    imageFormats.map((fmt) => [fmt, [...allExcept(imageFormats, fmt), "pdf"]])
  ),

  // ─── Documents ───────────────────────────────────────────
  // Every document format can convert to every other document format + PDF
  ...Object.fromEntries(
    docFormats.map((fmt) => [fmt, [...allExcept(docFormats, fmt), "pdf"]])
  ),
  // Also support doc (read-only, old Word)
  doc: [...docFormats.filter((f) => f !== "doc"), "pdf"],

  // ─── Data ────────────────────────────────────────────────
  // Every data format can convert to every other data format
  ...Object.fromEntries(
    dataFormats.map((fmt) => [fmt, allExcept(dataFormats, fmt)])
  ),
  // yml alias
  yml: allExcept(dataFormats, "yaml"),

  // ─── Audio ───────────────────────────────────────────────
  // Every audio format can convert to every other audio format
  ...Object.fromEntries(
    audioFormats.map((fmt) => [fmt, allExcept(audioFormats, fmt)])
  ),

  // ─── Video ───────────────────────────────────────────────
  // Every video format can convert to every other video format
  ...Object.fromEntries(
    videoFormats.map((fmt) => [fmt, allExcept(videoFormats, fmt)])
  ),

  // ─── Archives ────────────────────────────────────────────
  // Every archive format can convert to every other archive format
  ...Object.fromEntries(
    archiveFormats.map((fmt) => [fmt, allExcept(archiveFormats, fmt)])
  ),
  // RAR is read-only (no RAR creation), can convert to other archives
  rar: archiveFormats.filter((f) => f !== "rar"),

  // ─── PDF (as source) ─────────────────────────────────────
  // PDF can be converted to text/document formats and images
  pdf: ["txt", "md", "html", "rtf", "docx", "jpg", "png", "webp", "bmp", "tiff"],
};

export function getTargetFormats(sourceExtension: string): string[] {
  return conversionMatrix[sourceExtension.toLowerCase()] ?? [];
}
