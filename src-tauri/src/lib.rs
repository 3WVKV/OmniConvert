use base64::{engine::general_purpose::STANDARD, Engine};
use image::ImageFormat;
use lopdf::Object;
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
    /// Fraction (0-1) of page width for X position
    #[serde(rename = "xFraction")]
    x_fraction: f64,
    /// Fraction (0-1) of page height for Y position (from top)
    #[serde(rename = "yFraction")]
    y_fraction: f64,
    /// Fraction (0-1) of page width for signature width
    #[serde(rename = "widthFraction")]
    width_fraction: f64,
    /// Fraction (0-1) of page height for signature height
    #[serde(rename = "heightFraction")]
    height_fraction: f64,
    #[serde(rename = "dateText")]
    date_text: Option<String>,
}

#[derive(Serialize)]
struct OcrResult {
    text: String,
    confidence: f64,
}

// ─── Helper: find ffmpeg ───────────────────────────────────────────

fn find_ffmpeg() -> String {
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
        "xml" => serde_json::Value::String(content),
        "yaml" | "yml" => serde_json::Value::String(content),
        _ => return Err(format!("Unsupported input data format: {}", in_ext)),
    };

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
        ("md", "html") | ("txt", "html") => {
            // Wrap in proper HTML so the file renders correctly in a browser
            let escaped = content
                .replace('&', "&amp;")
                .replace('<', "&lt;")
                .replace('>', "&gt;");
            format!(
                "<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>{}</title></head>\n<body>\n<pre>{}</pre>\n</body>\n</html>",
                Path::new(input).file_stem().and_then(|s| s.to_str()).unwrap_or("document"),
                escaped
            )
        }
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
        ("txt", "md") => content,
        ("md", "txt") => content,
        ("rtf", "txt") => content,
        ("docx", "txt") => extract_docx_text(input)?,
        ("docx", "html") => {
            let text = extract_docx_text(input)?;
            let escaped = text.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;");
            format!(
                "<!DOCTYPE html>\n<html>\n<head><meta charset=\"utf-8\"><title>{}</title></head>\n<body>\n<pre>{}</pre>\n</body>\n</html>",
                Path::new(input).file_stem().and_then(|s| s.to_str()).unwrap_or("document"),
                escaped
            )
        }
        ("docx", "md") => extract_docx_text(input)?,
        _ => content,
    };

    fs::write(output, &result).map_err(|e| format!("Write error: {}", e))?;
    Ok(output.to_string())
}

/// Extract plain text from a .docx file (which is a ZIP with word/document.xml)
fn extract_docx_text(path: &str) -> Result<String, String> {
    let file = fs::File::open(path).map_err(|e| format!("Open error: {}", e))?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| format!("ZIP error: {}", e))?;

    let mut xml = String::new();
    {
        let mut doc_file = archive
            .by_name("word/document.xml")
            .map_err(|_| "Not a valid .docx file (missing word/document.xml)".to_string())?;
        std::io::Read::read_to_string(&mut doc_file, &mut xml)
            .map_err(|e| format!("Read error: {}", e))?;
    }

    // Strip XML tags and extract text content
    let mut text = String::new();
    let mut in_tag = false;
    let mut last_was_para = false;
    let chars: Vec<char> = xml.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        if chars[i] == '<' {
            // Check for paragraph end: </w:p>
            let rest: String = chars[i..std::cmp::min(i + 10, chars.len())].iter().collect();
            if rest.starts_with("</w:p>") && !last_was_para {
                text.push('\n');
                last_was_para = true;
            }
            in_tag = true;
        } else if chars[i] == '>' {
            in_tag = false;
        } else if !in_tag {
            text.push(chars[i]);
            last_was_para = false;
        }
        i += 1;
    }

    Ok(text.trim().to_string())
}

// ─── PDF helpers ───────────────────────────────────────────────────

/// Remap all object references within an Object by adding an offset to IDs
fn remap_refs(obj: &Object, offset: u32) -> Object {
    match obj {
        Object::Reference(id) => Object::Reference((id.0 + offset, id.1)),
        Object::Array(arr) => {
            Object::Array(arr.iter().map(|o| remap_refs(o, offset)).collect())
        }
        Object::Dictionary(dict) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, value) in dict.iter() {
                new_dict.set(key.clone(), remap_refs(value, offset));
            }
            Object::Dictionary(new_dict)
        }
        Object::Stream(stream) => {
            let mut new_dict = lopdf::Dictionary::new();
            for (key, value) in stream.dict.iter() {
                new_dict.set(key.clone(), remap_refs(value, offset));
            }
            Object::Stream(lopdf::Stream::new(new_dict, stream.content.clone()))
        }
        other => other.clone(),
    }
}

// ─── Convert to PDF ─────────────────────────────────────────────────

fn convert_to_pdf(input: &str, output: &str) -> Result<String, String> {
    let in_ext = Path::new(input)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    match in_ext.as_str() {
        // Image → PDF: embed the image as a full-page PDF
        "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "tiff" | "tif" | "avif" | "ico" | "svg" => {
            let img = image::open(input).map_err(|e| format!("Failed to open image: {}", e))?;
            let rgb_img = img.to_rgb8();
            let (img_w, img_h) = rgb_img.dimensions();

            // Create a PDF page sized to the image (1 pixel = 1 point, capped at reasonable size)
            let scale = if img_w > 2000 || img_h > 2000 {
                2000.0 / (img_w.max(img_h) as f64)
            } else {
                1.0
            };
            let page_w = (img_w as f64 * scale) as i64;
            let page_h = (img_h as f64 * scale) as i64;

            let mut doc = lopdf::Document::with_version("1.5");

            // Create image XObject
            let mut img_dict = lopdf::Dictionary::new();
            img_dict.set("Type", Object::Name(b"XObject".to_vec()));
            img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
            img_dict.set("Width", Object::Integer(img_w as i64));
            img_dict.set("Height", Object::Integer(img_h as i64));
            img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
            img_dict.set("BitsPerComponent", Object::Integer(8));
            let pixels: Vec<u8> = rgb_img.into_raw();
            let img_id = doc.add_object(Object::Stream(lopdf::Stream::new(img_dict, pixels)));

            // Resources dict
            let mut xobjects = lopdf::Dictionary::new();
            xobjects.set("Img0", Object::Reference(img_id));
            let mut resources = lopdf::Dictionary::new();
            resources.set("XObject", Object::Dictionary(xobjects));
            let resources_id = doc.add_object(Object::Dictionary(resources));

            // Content stream: draw image full-page
            let content = format!("q\n{} 0 0 {} 0 0 cm\n/Img0 Do\nQ\n", page_w, page_h);
            let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
                lopdf::Dictionary::new(),
                content.into_bytes(),
            )));

            // Page
            let mut page_dict = lopdf::Dictionary::new();
            page_dict.set("Type", Object::Name(b"Page".to_vec()));
            page_dict.set(
                "MediaBox",
                Object::Array(vec![
                    Object::Integer(0),
                    Object::Integer(0),
                    Object::Integer(page_w),
                    Object::Integer(page_h),
                ]),
            );
            page_dict.set("Resources", Object::Reference(resources_id));
            page_dict.set("Contents", Object::Reference(content_id));
            let page_id = doc.add_object(Object::Dictionary(page_dict));

            // Pages
            let mut pages_dict = lopdf::Dictionary::new();
            pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
            pages_dict.set("Kids", Object::Array(vec![Object::Reference(page_id)]));
            pages_dict.set("Count", Object::Integer(1));
            let pages_id = doc.add_object(Object::Dictionary(pages_dict));

            // Update page Parent
            if let Ok(page_obj) = doc.get_object_mut(page_id) {
                if let Object::Dictionary(ref mut dict) = page_obj {
                    dict.set("Parent", Object::Reference(pages_id));
                }
            }

            // Catalog
            let mut catalog = lopdf::Dictionary::new();
            catalog.set("Type", Object::Name(b"Catalog".to_vec()));
            catalog.set("Pages", Object::Reference(pages_id));
            let catalog_id = doc.add_object(Object::Dictionary(catalog));

            doc.trailer.set("Root", Object::Reference(catalog_id));

            doc.save(output).map_err(|e| format!("PDF save error: {}", e))?;
            Ok(output.to_string())
        }
        // Text/doc → PDF: create a simple text PDF
        "txt" | "md" | "html" | "rtf" | "docx" | "doc" => {
            let text = if in_ext == "docx" {
                extract_docx_text(input)?
            } else {
                fs::read_to_string(input).map_err(|e| format!("Read error: {}", e))?
            };

            // Strip HTML tags for html input
            let plain_text = if in_ext == "html" {
                let mut result = String::new();
                let mut in_tag = false;
                for ch in text.chars() {
                    if ch == '<' { in_tag = true; continue; }
                    if ch == '>' { in_tag = false; continue; }
                    if !in_tag { result.push(ch); }
                }
                result
            } else {
                text
            };

            // Create a simple text PDF
            let mut doc = lopdf::Document::with_version("1.5");

            // Split text into lines and pages (roughly 50 lines per page at 12pt)
            let lines: Vec<&str> = plain_text.lines().collect();
            let lines_per_page = 50;
            let page_w: i64 = 612; // US Letter
            let page_h: i64 = 792;
            let margin = 50.0;
            let line_height = 14.0;
            let font_size = 11.0;

            let mut page_ids: Vec<lopdf::ObjectId> = Vec::new();

            for chunk in lines.chunks(lines_per_page) {
                let mut content = String::new();
                content.push_str(&format!("BT\n/F1 {} Tf\n", font_size));
                content.push_str(&format!("{} {} Td\n", margin, page_h as f64 - margin));
                for line in chunk {
                    // Escape PDF special chars
                    let escaped = line
                        .replace('\\', "\\\\")
                        .replace('(', "\\(")
                        .replace(')', "\\)");
                    content.push_str(&format!("({}) Tj\n0 -{} Td\n", escaped, line_height));
                }
                content.push_str("ET\n");

                let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
                    lopdf::Dictionary::new(),
                    content.into_bytes(),
                )));

                // Font resource
                let mut font_dict = lopdf::Dictionary::new();
                font_dict.set("Type", Object::Name(b"Font".to_vec()));
                font_dict.set("Subtype", Object::Name(b"Type1".to_vec()));
                font_dict.set("BaseFont", Object::Name(b"Helvetica".to_vec()));
                let mut fonts = lopdf::Dictionary::new();
                fonts.set("F1", Object::Dictionary(font_dict));
                let mut resources = lopdf::Dictionary::new();
                resources.set("Font", Object::Dictionary(fonts));
                let resources_id = doc.add_object(Object::Dictionary(resources));

                let mut page_dict = lopdf::Dictionary::new();
                page_dict.set("Type", Object::Name(b"Page".to_vec()));
                page_dict.set(
                    "MediaBox",
                    Object::Array(vec![
                        Object::Integer(0),
                        Object::Integer(0),
                        Object::Integer(page_w),
                        Object::Integer(page_h),
                    ]),
                );
                page_dict.set("Resources", Object::Reference(resources_id));
                page_dict.set("Contents", Object::Reference(content_id));
                page_ids.push(doc.add_object(Object::Dictionary(page_dict)));
            }

            // If empty text, create at least one blank page
            if page_ids.is_empty() {
                let mut page_dict = lopdf::Dictionary::new();
                page_dict.set("Type", Object::Name(b"Page".to_vec()));
                page_dict.set(
                    "MediaBox",
                    Object::Array(vec![
                        Object::Integer(0),
                        Object::Integer(0),
                        Object::Integer(page_w),
                        Object::Integer(page_h),
                    ]),
                );
                page_ids.push(doc.add_object(Object::Dictionary(page_dict)));
            }

            // Pages
            let kids: Vec<Object> = page_ids.iter().map(|id| Object::Reference(*id)).collect();
            let mut pages_dict = lopdf::Dictionary::new();
            pages_dict.set("Type", Object::Name(b"Pages".to_vec()));
            pages_dict.set("Kids", Object::Array(kids));
            pages_dict.set("Count", Object::Integer(page_ids.len() as i64));
            let pages_id = doc.add_object(Object::Dictionary(pages_dict));

            // Update Parent on all pages
            for pid in &page_ids {
                if let Ok(page_obj) = doc.get_object_mut(*pid) {
                    if let Object::Dictionary(ref mut dict) = page_obj {
                        dict.set("Parent", Object::Reference(pages_id));
                    }
                }
            }

            // Catalog
            let mut catalog = lopdf::Dictionary::new();
            catalog.set("Type", Object::Name(b"Catalog".to_vec()));
            catalog.set("Pages", Object::Reference(pages_id));
            let catalog_id = doc.add_object(Object::Dictionary(catalog));

            doc.trailer.set("Root", Object::Reference(catalog_id));

            doc.save(output).map_err(|e| format!("PDF save error: {}", e))?;
            Ok(output.to_string())
        }
        _ => Err(format!("Cannot convert {} to PDF", in_ext)),
    }
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
        "txt" | "md" | "html" | "rtf" | "docx" => "text",
        "zip" | "rar" | "7z" | "tar" | "gz" => "archive",
        _ => "unknown",
    };

    // Check if target is PDF — use dedicated converter
    let out_ext = Path::new(&output_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if out_ext == "pdf" {
        return convert_to_pdf(&input_path, &output_path);
    }

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
                .map_err(|e| format!("ffmpeg error: {}. Make sure ffmpeg is installed and in PATH.", e))?;

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

/// Returns the raw PDF file as base64 so the frontend can render it with pdf.js
#[tauri::command]
fn render_pdf_page(path: String, _page_number: u32) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Read error: {}", e))?;
    Ok(STANDARD.encode(&bytes))
}

#[tauri::command]
fn merge_pdfs(input_paths: Vec<String>, output_path: String) -> Result<String, String> {
    if input_paths.len() < 2 {
        return Err("Need at least 2 PDFs to merge".to_string());
    }

    let mut documents: Vec<lopdf::Document> = Vec::new();
    for path in &input_paths {
        let doc = lopdf::Document::load(path)
            .map_err(|e| format!("Failed to load {}: {}", path, e))?;
        documents.push(doc);
    }

    let mut base_doc = documents.remove(0);

    // Get the base doc's Pages object ID
    let base_pages_id = {
        let catalog = base_doc.catalog().map_err(|e| format!("Catalog error: {}", e))?;
        match catalog.get(b"Pages").map_err(|e| format!("Pages ref error: {}", e))? {
            Object::Reference(id) => *id,
            _ => return Err("Invalid Pages reference in base PDF".to_string()),
        }
    };

    for other_doc in documents {
        let id_offset = base_doc.max_id;
        let other_page_ids: Vec<lopdf::ObjectId> = other_doc.get_pages().values().cloned().collect();

        // Copy all objects from other doc with remapped IDs and internal references
        for (old_id, object) in &other_doc.objects {
            let new_id = (old_id.0 + id_offset, old_id.1);
            let remapped = remap_refs(object, id_offset);
            base_doc.objects.insert(new_id, remapped);
        }

        // Update each copied page's Parent to point to base_pages_id
        for page_id in &other_page_ids {
            let new_page_id = (page_id.0 + id_offset, page_id.1);
            if let Ok(page_obj) = base_doc.get_object_mut(new_page_id) {
                if let Object::Dictionary(ref mut dict) = page_obj {
                    dict.set("Parent", Object::Reference(base_pages_id));
                }
            }
        }

        // Add new page references to base doc's Kids array and update Count
        if let Ok(pages_obj) = base_doc.get_object_mut(base_pages_id) {
            if let Object::Dictionary(ref mut pages_dict) = pages_obj {
                if let Ok(kids) = pages_dict.get_mut(b"Kids") {
                    if let Object::Array(ref mut kids_arr) = kids {
                        for page_id in &other_page_ids {
                            let new_id = (page_id.0 + id_offset, page_id.1);
                            kids_arr.push(Object::Reference(new_id));
                        }
                    }
                }
                let current_count = pages_dict
                    .get(b"Count")
                    .ok()
                    .and_then(|c| {
                        if let Object::Integer(n) = c { Some(*n) } else { None }
                    })
                    .unwrap_or(0);
                let added = other_page_ids.len() as i64;
                pages_dict.set("Count", Object::Integer(current_count + added));
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
                if let Object::Dictionary(ref mut dict) = page {
                    dict.set("Rotate", Object::Integer(degrees as i64));
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
    fs::create_dir_all(&output_dir).map_err(|e| format!("Dir error: {}", e))?;
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
    placement: SignaturePlacement,
) -> Result<String, String> {
    let mut doc = lopdf::Document::load(&input_path)
        .map_err(|e| format!("PDF load error: {}", e))?;

    // Decode the base64 signature image
    let img_data = if placement.signature_image_base64.contains(',') {
        let parts: Vec<&str> = placement.signature_image_base64.splitn(2, ',').collect();
        STANDARD.decode(parts.get(1).unwrap_or(&""))
            .map_err(|e| format!("Base64 decode error: {}", e))?
    } else {
        STANDARD.decode(&placement.signature_image_base64)
            .map_err(|e| format!("Base64 decode error: {}", e))?
    };

    // Decode PNG to RGBA to preserve transparency
    let img = image::load_from_memory(&img_data)
        .map_err(|e| format!("Image decode error: {}", e))?;
    let rgba_img = img.to_rgba8();
    let (img_w, img_h) = rgba_img.dimensions();

    // Separate RGB and Alpha channels
    let mut rgb_pixels = Vec::with_capacity((img_w * img_h * 3) as usize);
    let mut alpha_pixels = Vec::with_capacity((img_w * img_h) as usize);
    for pixel in rgba_img.pixels() {
        rgb_pixels.push(pixel[0]);
        rgb_pixels.push(pixel[1]);
        rgb_pixels.push(pixel[2]);
        alpha_pixels.push(pixel[3]);
    }

    // Create SMask (alpha channel) as a separate Image XObject
    let mut smask_dict = lopdf::Dictionary::new();
    smask_dict.set("Type", Object::Name(b"XObject".to_vec()));
    smask_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    smask_dict.set("Width", Object::Integer(img_w as i64));
    smask_dict.set("Height", Object::Integer(img_h as i64));
    smask_dict.set("ColorSpace", Object::Name(b"DeviceGray".to_vec()));
    smask_dict.set("BitsPerComponent", Object::Integer(8));
    let smask_id = doc.add_object(Object::Stream(lopdf::Stream::new(smask_dict, alpha_pixels)));

    // Create the RGB Image XObject with SMask reference
    let mut img_dict = lopdf::Dictionary::new();
    img_dict.set("Type", Object::Name(b"XObject".to_vec()));
    img_dict.set("Subtype", Object::Name(b"Image".to_vec()));
    img_dict.set("Width", Object::Integer(img_w as i64));
    img_dict.set("Height", Object::Integer(img_h as i64));
    img_dict.set("ColorSpace", Object::Name(b"DeviceRGB".to_vec()));
    img_dict.set("BitsPerComponent", Object::Integer(8));
    img_dict.set("SMask", Object::Reference(smask_id));
    let img_obj_id = doc.add_object(Object::Stream(lopdf::Stream::new(img_dict, rgb_pixels)));

    // Get the target page
    let pages = doc.get_pages();
    let page_num = placement.page_index + 1;
    let page_id = pages
        .get(&page_num)
        .cloned()
        .ok_or_else(|| format!("Page {} not found", page_num))?;

    // Get page dimensions from MediaBox
    let (page_w, page_h) = {
        let page_obj = doc.get_object(page_id)
            .map_err(|e| format!("Page object error: {}", e))?;
        if let Object::Dictionary(ref dict) = page_obj {
            if let Ok(Object::Array(ref media_box)) = dict.get(b"MediaBox") {
                let w = match &media_box[2] {
                    Object::Integer(n) => *n as f64,
                    Object::Real(n) => *n as f64,
                    _ => 612.0,
                };
                let h = match &media_box[3] {
                    Object::Integer(n) => *n as f64,
                    Object::Real(n) => *n as f64,
                    _ => 792.0,
                };
                (w, h)
            } else {
                (612.0, 792.0) // Default US Letter
            }
        } else {
            (612.0, 792.0)
        }
    };

    // Convert fractional coordinates to PDF coordinates
    // PDF Y-axis: 0 is at BOTTOM, increases upward
    // Frontend Y: 0 is at TOP, increases downward
    let sig_w = placement.width_fraction * page_w;
    let sig_h = placement.height_fraction * page_h;
    let sig_x = placement.x_fraction * page_w;
    let sig_y = page_h - (placement.y_fraction * page_h) - sig_h; // flip Y

    // Add the image to the page's Resources/XObject dictionary
    let sig_name = b"Sig0".to_vec();
    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Object::Dictionary(ref mut page_dict) = page_obj {
            let has_resources = page_dict.get(b"Resources").is_ok();
            if !has_resources {
                page_dict.set("Resources", Object::Dictionary(lopdf::Dictionary::new()));
            }
            if let Ok(Object::Dictionary(ref mut resources)) = page_dict.get_mut(b"Resources") {
                let has_xobject = resources.get(b"XObject").is_ok();
                if !has_xobject {
                    resources.set("XObject", Object::Dictionary(lopdf::Dictionary::new()));
                }
                if let Ok(Object::Dictionary(ref mut xobjects)) = resources.get_mut(b"XObject") {
                    xobjects.set(sig_name.clone(), Object::Reference(img_obj_id));
                }
            }
        }
    }

    // Build content stream to draw the signature image
    let mut draw_ops = format!(
        "\nq\n{} 0 0 {} {} {} cm\n/{} Do\nQ\n",
        sig_w, sig_h, sig_x, sig_y,
        String::from_utf8_lossy(&sig_name)
    );

    // Optionally draw date text below signature
    if let Some(ref date_text) = placement.date_text {
        let date_y = sig_y - 14.0;
        draw_ops.push_str(&format!(
            "q\nBT\n/Helvetica 10 Tf\n{} {} Td\n({}) Tj\nET\nQ\n",
            sig_x, date_y, date_text
        ));
    }

    // Append drawing operations to the page's content stream
    let content_id = doc.add_object(Object::Stream(lopdf::Stream::new(
        lopdf::Dictionary::new(),
        draw_ops.into_bytes(),
    )));

    if let Ok(page_obj) = doc.get_object_mut(page_id) {
        if let Object::Dictionary(ref mut page_dict) = page_obj {
            let existing_contents = page_dict.get(b"Contents").ok().cloned();
            let new_contents = match existing_contents {
                Some(Object::Reference(ref_id)) => {
                    Object::Array(vec![Object::Reference(ref_id), Object::Reference(content_id)])
                }
                Some(Object::Array(mut arr)) => {
                    arr.push(Object::Reference(content_id));
                    Object::Array(arr)
                }
                _ => Object::Reference(content_id),
            };
            page_dict.set("Contents", new_contents);
        }
    }

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

    // Check if tesseract exists before trying
    let check = Command::new(&tesseract)
        .arg("--version")
        .output();

    if check.is_err() {
        return Err(
            "Tesseract OCR is not installed.\n\
             Install it from: https://github.com/UB-Mannheim/tesseract/wiki\n\
             After installation, restart the application."
                .to_string(),
        );
    }

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
