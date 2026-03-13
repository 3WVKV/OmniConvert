import * as pdfjsLib from "pdfjs-dist";

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

/**
 * Render a specific page of a PDF to a base64 PNG string.
 * @param pdfBase64 - The entire PDF file as a base64 string
 * @param pageNumber - 1-indexed page number
 * @param scale - Render scale (default 1.5)
 */
export async function renderPdfPageToBase64(
  pdfBase64: string,
  pageNumber: number,
  scale = 1.5
): Promise<string> {
  const binaryStr = atob(pdfBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;

  await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;

  return canvas.toDataURL("image/png");
}
