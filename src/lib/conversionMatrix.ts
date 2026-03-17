/** Maps source extension to list of valid target extensions */
export const conversionMatrix: Record<string, string[]> = {
  // Images
  jpg: ["png", "webp", "gif", "bmp", "tiff", "avif", "ico", "pdf"],
  jpeg: ["png", "webp", "gif", "bmp", "tiff", "avif", "ico", "pdf"],
  png: ["jpg", "webp", "gif", "bmp", "tiff", "avif", "ico", "pdf"],
  webp: ["jpg", "png", "gif", "bmp", "tiff", "avif", "ico", "pdf"],
  gif: ["jpg", "png", "webp", "bmp", "tiff", "avif", "pdf"],
  bmp: ["jpg", "png", "webp", "gif", "tiff", "avif", "ico", "pdf"],
  tiff: ["jpg", "png", "webp", "gif", "bmp", "avif", "pdf"],
  avif: ["jpg", "png", "webp", "gif", "bmp", "tiff", "pdf"],
  heic: ["jpg", "png", "webp", "gif", "bmp", "tiff", "avif", "pdf"],
  ico: ["png", "jpg", "webp", "bmp", "pdf"],
  svg: ["png", "jpg", "webp", "pdf"],

  // Documents
  md: ["html", "txt", "pdf"],
  html: ["txt", "md", "pdf"],
  txt: ["md", "html", "pdf"],
  rtf: ["txt", "pdf"],
  docx: ["txt", "html", "md", "pdf"],
  doc: ["txt", "pdf"],

  // Data
  csv: ["json", "xml", "yaml", "xlsx"],
  json: ["csv", "xml", "yaml"],
  xml: ["json", "csv", "yaml"],
  yaml: ["json", "csv", "xml"],
  xls: ["csv", "json", "xml", "yaml", "xlsx"],
  xlsx: ["csv", "json", "xml", "yaml"],
  ods: ["csv", "json", "xml", "yaml", "xlsx"],

  // Audio
  mp3: ["wav", "flac", "aac", "ogg", "m4a", "opus"],
  wav: ["mp3", "flac", "aac", "ogg", "m4a", "opus"],
  flac: ["mp3", "wav", "aac", "ogg", "m4a", "opus"],
  aac: ["mp3", "wav", "flac", "ogg", "m4a", "opus"],
  ogg: ["mp3", "wav", "flac", "aac", "m4a", "opus"],
  m4a: ["mp3", "wav", "flac", "aac", "ogg", "opus"],
  opus: ["mp3", "wav", "flac", "aac", "ogg", "m4a"],

  // Video
  mp4: ["mov", "mkv", "avi", "webm", "flv", "mpeg"],
  mov: ["mp4", "mkv", "avi", "webm", "flv", "mpeg"],
  mkv: ["mp4", "mov", "avi", "webm", "flv", "mpeg"],
  avi: ["mp4", "mov", "mkv", "webm", "flv", "mpeg"],
  webm: ["mp4", "mov", "mkv", "avi", "flv", "mpeg"],
  flv: ["mp4", "mov", "mkv", "avi", "webm", "mpeg"],
  mpeg: ["mp4", "mov", "mkv", "avi", "webm", "flv"],
  mpg: ["mp4", "mov", "mkv", "avi", "webm", "flv"],

  // Archives
  zip: ["tar", "gz", "7z"],
  rar: ["zip", "tar", "gz", "7z"],
  "7z": ["zip", "tar", "gz"],
  tar: ["zip", "gz", "7z"],
  gz: ["zip", "tar", "7z"],
};

export function getTargetFormats(sourceExtension: string): string[] {
  return conversionMatrix[sourceExtension.toLowerCase()] ?? [];
}
