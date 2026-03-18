---
name: omniconvert-dev
description: |
  Skill for developing and maintaining OmniConvert — a Tauri + React + TypeScript desktop app for local file manipulation. Covers all 5 modules: Universal Converter, PDF Merge, PDF Signature, PDF Toolkit, and OCR. Use this skill when working on any feature, bug fix, or enhancement for OmniConvert.
triggers:
  - omniconvert
  - converter
  - pdf merge
  - pdf signature
  - pdf toolkit
  - ocr module
  - file conversion
---

# OmniConvert Development Skill

## Project Overview
OmniConvert is a universal local file manipulation desktop app with 5 modules:
1. **Universal Converter** — drag & drop file conversion (images, docs, data, audio, video, archives, 61+ formats including PDF output)
2. **PDF Merge** — import multiple PDFs, thumbnail preview, reorder with up/down buttons, merge
3. **PDF Signature** — load PDF, add signature (draw/type/import image), draggable/resizable placement on any page, add date, save signatures
4. **PDF Toolkit** — split, extract pages, rotate, compress, convert PDF to image/text
5. **OCR** — extract text from images/scanned PDFs via Tesseract, output TXT/MD/clipboard

## Tech Stack
- **Framework**: Tauri v2 (Rust backend + webview frontend)
- **Frontend**: React 19 + TypeScript 5.8 + Vite 7
- **UI**: shadcn/ui built on @base-ui/react (NOT radix — uses `render` prop, not `asChild`; `delay` not `delayDuration`)
- **State**: Zustand
- **i18n**: i18next (English + French in `public/locales/{en,fr}/translation.json`)
- **Styling**: Tailwind CSS 4 with oklch color variables and dark mode
- **PDF (Rust)**: lopdf 0.35 (Results not Options on `dict.get()`)
- **PDF (Frontend)**: pdfjs-dist v5 (requires `canvas` property in RenderParameters)
- **Image**: image 0.25 crate
- **Archive**: zip 2 crate (for docx text extraction)
- **Audio/Video**: ffmpeg (external CLI)
- **OCR**: Tesseract (external CLI)
- **File dialogs**: @tauri-apps/plugin-dialog (`open()`, `save()`)
- **FS**: @tauri-apps/plugin-fs
- **Shell**: @tauri-apps/plugin-shell
- **Drag-drop**: Tauri native `onDragDropEvent()` — conflicts with HTML5 drag events, use buttons instead

## Key Architecture Decisions

### File Path Resolution
- Browser `File` objects don't have real paths in Tauri webview
- Use `@tauri-apps/plugin-dialog` `open()` for file picking
- Use `getCurrentWebviewWindow().onDragDropEvent()` for drag-drop (returns native paths)
- DropZone component uses `onPaths: (paths: string[]) => void` callback pattern

### PDF Rendering
- Rust `render_pdf_page` returns the full PDF as base64
- Frontend `pdfRenderer.ts` uses pdfjs-dist to render individual pages client-side
- Both PdfSignaturePage and PdfToolkitPage use this pattern

### PDF Signature Coordinates
- Frontend uses fractional coordinates (0-1) relative to the preview container
- `SignaturePlacement` interface: `xFraction`, `yFraction`, `widthFraction`, `heightFraction`
- Rust converts fractions to PDF points using MediaBox dimensions
- PDF Y-axis is flipped: `sig_y = page_h - (yFraction * page_h) - sig_h`
- Alpha transparency handled via separate SMask XObject (RGBA → RGB + Alpha channels)

### PDF Merge
- Uses `remap_refs()` recursive function to remap all Object::Reference IDs when copying objects between documents
- Updates Parent references on copied pages to point to base document's Pages object

### Conversion to PDF
- Images → PDF: embed as full-page XObject with auto-scaling for large images
- Text/docs → PDF: render text with Helvetica font, 50 lines per page, proper pagination
- Integrated in `convert_file` via output extension check before category matching

## Project Structure
```
src-tauri/
  src/lib.rs          — All Rust backend (15 Tauri commands)
  Cargo.toml          — Dependencies
  capabilities/default.json — Tauri permissions
src/
  App.tsx             — Router + Toaster (position: top-right)
  pages/
    ConverterPage.tsx — Universal converter
    PdfMergePage.tsx  — PDF merge with up/down reorder buttons
    PdfSignaturePage.tsx — Signature with draggable/resizable overlay
    PdfToolkitPage.tsx — PDF tools
    OcrPage.tsx       — OCR extraction
  components/
    shared/DropZone.tsx — Native file drop zone
    layout/Sidebar.tsx  — Navigation sidebar
    ui/               — shadcn/ui components
  lib/
    conversionMatrix.ts — Source→target format mapping
    pdfRenderer.ts      — pdfjs-dist rendering helper
  stores/
    appStore.ts         — Zustand store
  types/
    pdf.ts              — PDF-related TypeScript interfaces
public/
  locales/{en,fr}/translation.json — i18n strings
```

## Tauri Commands (lib.rs)
- `convert_file(input_path, output_path, target_format, quality, compression_level)`
- `get_pdf_info(path)` → `{ page_count, file_size }`
- `render_pdf_page(path, page_number)` → base64 of full PDF
- `merge_pdfs(input_paths, output_path)`
- `split_pdf(input_path, output_path, page_range)`
- `extract_pages(input_path, output_path, page_range)`
- `rotate_pdf(input_path, output_path, page_range, degrees)`
- `compress_pdf(input_path, output_path, quality)`
- `pdf_to_images(input_path, output_dir)` — needs poppler-utils
- `pdf_to_text(input_path, output_path)`
- `apply_signature(input_path, output_path, placement)`
- `get_file_info(path)` → `{ name, size, extension }`
- `read_file_base64(path)` → base64 string
- `write_text_file(path, content)`
- `ocr_extract(path, language)` → `{ text, confidence }`

## Common Pitfalls
- **pdfjs-dist v5**: RenderParameters requires `canvas` property — use `as any` cast
- **lopdf 0.35**: `dict.get()` returns `Result`, not `Option`
- **Tauri drag-drop vs HTML5 drag**: They conflict — use button-based reordering
- **PDF Y-axis**: 0 is at bottom, not top — always flip Y coordinates
- **Transparent images in PDF**: Must use separate SMask XObject (can't use RGBA directly)
- **base-ui/react**: Different API from Radix — check component docs before using
- **Toast position**: Use `top-right` to avoid blocking action buttons
- **ffmpeg/Tesseract**: External dependencies — always pre-check availability and show install instructions
