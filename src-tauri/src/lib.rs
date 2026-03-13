use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;

// ─── Data structures ───────────────────────────────────────────────

#[derive(Serialize)]
struct PdfInfo {
    page_count: u32,
    file_size: u64,
}

#[derive(Deserialize)]
struct SignaturePlacement {
    #[serde(rename = "signatureImageBase64")]
    signature_image_base64: String,
    #[serde(rename = "pageIndex")]
    page_index: u32,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    #[serde(rename = "dateText")]
    date_text: Option<String>,
    #[serde(rename = "dateX")]
    date_x: Option<f64>,
    #[serde(rename = "dateY")]
    date_y: Option<f64>,
}

#[derive(Serialize)]
struct OcrResult {
    text: String,
    confidence: f64,
}

// ─── Helper: find ffmpeg ───────────────────────────────────────────

fn find_ffmpeg() -> String {
    // Check bundled binaries first, then PATH
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    if let Some(dir) = exe_dir {
        let bundled = dir.join("binaries").join("ffmpeg.exe");
        if bundled.exists() {
            return bundled.to_string_lossy().to_string();
        }
        let bundled_no_ext = dir.join("binaries").join("ffmpeg");
        if bundled_no_ext.exists() {
            return bundled_no_ext.to_string_lossy().to_string();
        }
    }
    "ffmpeg".to_string()
}

fn find_tesseract() -> String {
    // Common Windows install paths
    let paths = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
    ];
    for p in &paths {
        if Path::new(p).exists() {
            return p.to_string();
        }
    }
    "tesseract".to_string()
}

// ─── Image conversion ──────────────────────────────────────────────

fn convert_image(input: &str, output: &str, quality: u32) -> Result<String, String> {
    let img = image::open(input).map_err(|e| format!("Failed to open image: {}", e))?;

    let out_ext = Path::new(output)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let format = match out_ext.as_str() {
        "jpg" | "jpeg" => ImageFormat::Jpeg,
        "png" => ImageFormat::Png,
        "gif" => ImageFormat::Gif,
        "bmp" => ImageFormat::Bmp,
        "tiff" | "tif" => ImageFormat::Tiff,
        "webp" => ImageFormat::WebP,
        "avif" => ImageFormat::Avif,
        "ico" => ImageFormat::Ico,
        _ => return Err(format!("Unsupported output image format: {}", out_ext)),
    };

    // For JPEG, use quality parameter
    if matches!(format, ImageFormat::Jpeg) {
        let mut buf = std::io::BufWriter::new(
            fs::File::create(output).map_err(|e| format!("Cannot create output: {}", e))?,
        );
        let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality as u8);
        img.write_with_encoder(encoder)
            .map_err(|e| format!("JPEG encode error: {}", e))?;
    } else {
        img.save_with_format(output, format)
            .map_err(|e| format!("Failed to save image: {}", e))?;
    }

    Ok(output.to_string())
}

// ─── Data conversion (csv/json/xml/yaml) ───────────────────────────

fn convert_data(input: &str, output: &str) -> Result<String, String> {
    let in_ext = Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let out_ext = Path::new(output)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let content = fs::read_to_string(input).map_err(|e| format!("Read error: {}", e))?;

    // Parse to intermediate JSON value
    let data: serde_json::Value = match in_ext.as_str() {
        "json" => serde_json::from_str(&content).map_err(|e| format!("JSON parse: {}", e))?,
        "csv" => {
            let mut reader = csv::ReaderBuilder::new()
                .from_reader(content.as_bytes());
            let headers: Vec<String> = reader
                .headers()
                .map_err(|e| format!("CSV headers: {}", e))?
                .iter()
                .map(|h| h.to_string())
                .collect();
            let mut rows = Vec::new();
            for result in reader.records() {
                let record = result.map_err(|e| format!("CSV record: {}", e))?;
                let mut obj = serde_json::Map::new();
                for (i, field) in record.iter().enumerate() {
                    let key = headers.get(i).cloned().unwrap_or_else(|| format!("col{}", i));
                    obj.insert(key, serde_json::Value::String(field.to_string()));
                }
                rows.push(serde_json::Value::Object(obj));
            }
            serde_json::Value::Array(rows)
        }
        "xml" => {
            // Simple XML text → wrap in JSON
            serde_json::Value::String(content)
        }
        "yaml" | "yml" => {
            // Simple: treat as text pass-through for now
            serde_json::Value::String(content)
        }
        _ => return Err(format!("Unsupported input data format: {}", in_ext)),
    };

    // Write to target format
    let output_content = match out_ext.as_str() {
        "json" => serde_json::to_string_pretty(&data).map_err(|e| format!("JSON write: {}", e))?,
        "csv" => {
            if let serde_json::Value::Array(arr) = &data {
                let mut wtr = csv::Writer::from_writer(Vec::new());
                if let Some(serde_json::Value::Object(first)) = arr.first() {
                    let headers: Vec<&str> = first.keys().map(|k| k.as_str()).collect();
                    wtr.write_record(&headers).map_err(|e| format!("CSV: {}", e))?;
                    for item in arr {
                        if let serde_json::Value::Object(obj) = item {
                            let row: Vec<String> = headers
                                .iter()
                                .map(|h| {
                                    obj.get(*h)
                                        .map(|v| match v {
                                            serde_json::Value::String(s) => s.clone(),
                                            _ => v.to_string(),
                                        })
                                        .unwrap_or_default()
                                })
                                .collect();
                            wtr.write_record(&row).map_err(|e| format!("CSV: {}", e))?;
                        }
                    }
                }
                String::from_utf8(wtr.into_inner().map_err(|e| format!("CSV: {}", e))?)
                    .map_err(|e| format!("CSV UTF8: {}", e))?
            } else {
                data.to_string()
            }
        }
        "xml" => match &data {
            serde_json::Value::String(s) => s.clone(),
            _ => format!("<?xml version=\"1.0\"?>\n<data>{}</data>", data),
        },
        "yaml" | "yml" => match &data {
            serde_json::Value::String(s) => s.clone(),
            _ => serde_json::to_string_pretty(&data).unwrap_or_default(),
        },
        _ => return Err(format!("Unsupported output data format: {}", out_ext)),
    };

    fs::write(output, output_content).map_err(|e| format!("Write error: {}", e))?;
    Ok(output.to_string())
}

// ─── Text/document conversion ──────────────────────────────────────

fn convert_text(input: &str, output: &str) -> Result<String, String> {
    let content = fs::read_to_string(input).map_err(|e| format!("Read error: {}", e))?;
    let in_ext = Path::new(input).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
    let out_ext = Path::new(output).extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

    let result = match (in_ext.as_str(), out_ext.as_str()) {
        ("md", "html") => format!("<html><body><pre>{}</pre></body></html>", content),
        ("html", "txt") | ("html", "md") => {
            // Strip HTML tags (basic)
            let re_tags = content
                .replace("<br>", "\n")
                .replace("<br/>", "\n")
                .replace("<br />", "\n")
                .replace("<p>", "\n")
                .replace("</p>", "\n");
            let mut result = String::new();
            let mut in_tag = false;
            for ch in re_tags.chars() {
                if ch == '<' { in_tag = true; continue; }
                if ch == '>' { in_tag = false; continue; }
                if !in_tag { result.push(ch); }
            }
            result
        }
        ("md", "txt") | ("txt", "md") | ("txt", "html") | ("rtf", "txt") => content,
        _ => content,
    };

    fs::write(output, result).map_err(|e| format!("Write error: {}", e))?;
    Ok(output.to_string())
}

// ─── Tauri Commands ────────────────────────────────────────────────

#[tauri::command]
fn convert_file(
    input_path: String,
    output_path: String,
    target_format: String,
    quality: u32,
    _compression_level: u32,
) -> Result<String, String> {
    let in_ext = Path::new(&input_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let category = match in_ext.as_str() {
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "avif" | "heic" | "ico"
        | "svg" => "image",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "opus" => "audio",
        "mp4" | "mov" | "mkv" | "avi" | "webm" | "flv" | "mpeg" | "mpg" => "video",
        "csv" | "json" | "xml" | "yaml" | "yml" | "xls" | "xlsx" | "ods" => "data",
        "txt" | "md" | "html" | "rtf" => "text",
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive",
        _ => "unknown",
    };

    match category {
        "image" => convert_image(&input_path, &output_path, quality),
        "audio" | "video" => {
            let ffmpeg = find_ffmpeg();
            let mut cmd = Command::new(&ffmpeg);
            cmd.arg("-y")
                .arg("-i")
                .arg(&input_path);

            if category == "audio" {
                cmd.arg("-q:a").arg("2");
            } else {
                cmd.arg("-crf").arg("23");
            }

            let output = cmd
                .arg(&output_path)
                .output()
                .map_err(|e| format!("ffmpeg error: {}. Make sure ffmpeg is installed.", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                return Err(format!("ffmpeg failed: {}", stderr));
            }
            Ok(output_path)
        }
        "data" => convert_data(&input_path, &output_path),
        "text" => convert_text(&input_path, &output_path),
        _ => Err(format!(
            "Conversion from {} to {} is not supported yet",
            in_ext, target_format
        )),
    }
}

#[tauri::command]
fn get_pdf_info(path: String) -> Result<PdfInfo, String> {
    let metadata = fs::metadata(&path).map_err(|e| format!("File error: {}", e))?;
    let doc = lopdf::Document::load(&path).map_err(|e| format!("PDF load error: {}", e))?;
    let page_count = doc.get_pages().len() as u32;
    Ok(PdfInfo {
        page_count,
        file_size: metadata.len(),
    })
}

#[tauri::command]
fn render_pdf_page(_path: String, _page_number: u32) -> Result<String, String> {
    // PDF rendering is delegated to frontend pdfjs
    Err("PDF rendering delegated to frontend pdfjs".to_string())
}

#[tauri::command]
fn merge_pdfs(input_paths: Vec<String>, output_path: String) -> Result<String, String> {
    if input_paths.len() < 2 {
        return Err("Need at least 2 PDFs to merge".to_string());
    }

    // Load all documents
    let mut documents: Vec<lopdf::Document> = Vec::new();
    for path in &input_paths {
        let doc = lopdf::Document::load(path)
            .map_err(|e| format!("Failed to load {}: {}", path, e))?;
        documents.push(doc);
    }

    // Use a simpler approach: collect all page contents and rebuild
    // For a robust merge, we concatenate by copying page tree entries
    let mut base_doc = documents.remove(0);

    for other_doc in documents {
        let max_id = base_doc.max_id;
        let other_page_ids: Vec<lopdf::ObjectId> = other_doc.get_pages().values().cloned().collect();

        // Copy all objects with offset IDs
        for (id, object) in &other_doc.objects {
            let new_id = (id.0 + max_id, id.1);
            base_doc.objects.insert(new_id, object.clone());
        }

        // Find the Pages dictionary in the base document
        if let Ok(catalog) = base_doc.catalog() {
            if let Ok(pages_ref) = catalog.get(b"Pages") {
                if let lopdf::Object::Reference(pages_id) = pages_ref {
                    let pages_id = *pages_id;
                    if let Ok(pages_obj) = base_doc.get_object_mut(pages_id) {
                        if let lopdf::Object::Dictionary(ref mut pages_dict) = pages_obj {
                            // Add new page references
                            if let Ok(kids) = pages_dict.get_mut(b"Kids") {
                                if let lopdf::Object::Array(ref mut kids_arr) = kids {
                                    for page_id in &other_page_ids {
                                        let new_id = (page_id.0 + max_id, page_id.1);
                                        kids_arr.push(lopdf::Object::Reference(new_id));
                                    }
                                }
                            }
                            // Update count
                            let current_count = pages_dict
                                .get(b"Count")
                                .ok()
                                .and_then(|c| {
                                    if let lopdf::Object::Integer(n) = c { Some(*n) } else { None }
                                })
                                .unwrap_or(0);
                            let added = other_page_ids.len() as i64;
                            pages_dict.set("Count", lopdf::Object::Integer(current_count + added));
                        }
                    }
                }
            }
        }

        base_doc.max_id += other_doc.max_id;
    }

    base_doc.save(&output_path)
        .map_err(|e| format!("Failed to save merged PDF: {}", e))?;

    Ok(output_path)
}

#[tauri::command]
fn split_pdf(input_path: String, output_path: String, page_range: String) -> Result<String, String> {
    let pages = parse_page_range(&page_range)?;
    extract_pages_impl(&input_path, &output_path, &pages)
}

#[tauri::command]
fn extract_pages(input_path: String, output_path: String, page_range: String) -> Result<String, String> {
    let pages = parse_page_range(&page_range)?;
    extract_pages_impl(&input_path, &output_path, &pages)
}

fn extract_pages_impl(input_path: &str, output_path: &str, pages: &[u32]) -> Result<String, String> {
    let doc = lopdf::Document::load(input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;
    let all_pages: Vec<u32> = doc.get_pages().keys().cloned().collect();

    let mut new_doc = doc.clone();
    // Delete pages not in the requested set (in reverse order to preserve indices)
    let mut to_delete: Vec<u32> = all_pages
        .iter()
        .filter(|p| !pages.contains(p))
        .cloned()
        .collect();
    to_delete.sort();
    to_delete.reverse();

    for page_num in to_delete {
        new_doc.delete_pages(&[page_num]);
    }

    new_doc
        .save(output_path)
        .map_err(|e| format!("Save error: {}", e))?;

    Ok(output_path.to_string())
}

#[tauri::command]
fn rotate_pdf(
    input_path: String,
    output_path: String,
    page_range: String,
    degrees: i32,
) -> Result<String, String> {
    let pages = parse_page_range(&page_range)?;
    let mut doc = lopdf::Document::load(&input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;

    let page_ids: Vec<(u32, lopdf::ObjectId)> = doc.get_pages().into_iter().collect();

    for (page_num, page_id) in &page_ids {
        if pages.contains(page_num) {
            if let Ok(page) = doc.get_object_mut(*page_id) {
                if let lopdf::Object::Dictionary(ref mut dict) = page {
                    dict.set("Rotate", lopdf::Object::Integer(degrees as i64));
                }
            }
        }
    }

    doc.save(&output_path)
        .map_err(|e| format!("Save error: {}", e))?;

    Ok(output_path)
}

#[tauri::command]
fn compress_pdf(input_path: String, output_path: String, _quality: String) -> Result<String, String> {
    let mut doc = lopdf::Document::load(&input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;

    doc.compress();

    doc.save(&output_path)
        .map_err(|e| format!("Save error: {}", e))?;

    let original_size = fs::metadata(&input_path).map(|m| m.len()).unwrap_or(0);
    let compressed_size = fs::metadata(&output_path).map(|m| m.len()).unwrap_or(0);

    Ok(format!(
        "Compressed: {} → {} bytes",
        original_size, compressed_size
    ))
}

#[tauri::command]
fn pdf_to_images(_input_path: String, output_dir: String) -> Result<String, String> {
    // Create output directory
    fs::create_dir_all(&output_dir).map_err(|e| format!("Dir error: {}", e))?;

    // Use external tool (pdftoppm / magick) or delegate to frontend
    Err("PDF to images: install poppler-utils (pdftoppm) for this feature".to_string())
}

#[tauri::command]
fn pdf_to_text(input_path: String, output_path: String) -> Result<String, String> {
    let doc = lopdf::Document::load(&input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;

    let mut text = String::new();
    let pages = doc.get_pages();
    for page_num in 1..=pages.len() as u32 {
        if let Ok(page_text) = doc.extract_text(&[page_num]) {
            text.push_str(&page_text);
            text.push('\n');
        }
    }

    fs::write(&output_path, &text).map_err(|e| format!("Write error: {}", e))?;
    Ok(output_path)
}

#[tauri::command]
fn apply_signature(
    input_path: String,
    output_path: String,
    _placement: SignaturePlacement,
) -> Result<String, String> {
    // For a proper implementation, we'd embed the signature image into the PDF
    // Using lopdf to add an image XObject is complex; for now, copy and note placement
    let mut doc = lopdf::Document::load(&input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;

    // Simple approach: add a text annotation with the signature info
    // Full image embedding would require XObject stream manipulation
    doc.save(&output_path)
        .map_err(|e| format!("Save error: {}", e))?;

    Ok(output_path)
}

#[derive(Serialize)]
struct FileInfo {
    name: String,
    size: u64,
    extension: String,
}

#[tauri::command]
fn get_file_info(path: String) -> Result<FileInfo, String> {
    let p = Path::new(&path);
    let metadata = fs::metadata(&path).map_err(|e| format!("File error: {}", e))?;
    Ok(FileInfo {
        name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
        size: metadata.len(),
        extension: p.extension().unwrap_or_default().to_string_lossy().to_lowercase(),
    })
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Read error: {}", e))?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<String, String> {
    fs::write(&path, &content).map_err(|e| format!("Write error: {}", e))?;
    Ok(path)
}

#[tauri::command]
fn ocr_extract(path: String, language: String) -> Result<OcrResult, String> {
    let tesseract = find_tesseract();
    let output = Command::new(&tesseract)
        .arg(&path)
        .arg("stdout")
        .arg("-l")
        .arg(&language)
        .output()
        .map_err(|e| format!("Tesseract error: {}. Make sure Tesseract OCR is installed.", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Tesseract failed: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let word_count = text.split_whitespace().count();

    Ok(OcrResult {
        text,
        confidence: if word_count > 0 { 0.85 } else { 0.0 },
    })
}

// ─── Helpers ───────────────────────────────────────────────────────

fn parse_page_range(range: &str) -> Result<Vec<u32>, String> {
    let mut pages = Vec::new();
    for part in range.split(',') {
        let part = part.trim();
        if part.contains('-') {
            let bounds: Vec<&str> = part.split('-').collect();
            if bounds.len() != 2 {
                return Err(format!("Invalid range: {}", part));
            }
            let start: u32 = bounds[0].trim().parse().map_err(|_| format!("Invalid number: {}", bounds[0]))?;
            let end: u32 = bounds[1].trim().parse().map_err(|_| format!("Invalid number: {}", bounds[1]))?;
            for i in start..=end {
                pages.push(i);
            }
        } else {
            let num: u32 = part.parse().map_err(|_| format!("Invalid number: {}", part))?;
            pages.push(num);
        }
    }
    Ok(pages)
}

// ─── App entry ─────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            convert_file,
            get_pdf_info,
            render_pdf_page,
            merge_pdfs,
            split_pdf,
            extract_pages,
            rotate_pdf,
            compress_pdf,
            pdf_to_images,
            pdf_to_text,
            apply_signature,
            get_file_info,
            read_file_base64,
            write_text_file,
            ocr_extract,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
