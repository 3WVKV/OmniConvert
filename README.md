# OmniConvert - 3WVKV

Application desktop de manipulation de fichiers 100% locale. Convertissez, fusionnez, signez, compressez et extrayez du texte depuis vos fichiers sans jamais envoyer vos donnees sur internet.

## Fonctionnalites

### Convertisseur universel
Glissez-deposez vos fichiers et convertissez-les dans le format de votre choix. Mode fichier unique ou batch.

| Categorie | Formats supportes |
|-----------|-------------------|
| Images | JPG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIC, ICO, SVG |
| Documents | TXT, MD, HTML, RTF, DOCX, DOC → TXT, HTML, MD, PDF |
| Donnees | CSV, JSON, XML, YAML, XLS, XLSX, ODS |
| Audio | MP3, WAV, FLAC, AAC, OGG, M4A, OPUS |
| Video | MP4, MOV, MKV, AVI, WebM, FLV, MPEG |
| Archives | ZIP, RAR, 7Z, TAR, GZ |

### Fusion PDF
Importez plusieurs PDF, previsualisation par miniature, reorganisez l'ordre, fusionnez en un seul fichier.

### Signature PDF
Chargez un PDF, ajoutez une signature (dessin, texte ou image importee), placez-la par glisser-deposer sur n'importe quelle page, ajoutez la date, enregistrez vos signatures pour reutilisation.

### Outils PDF
- **Diviser** un PDF en plusieurs fichiers
- **Extraire** des pages specifiques
- **Pivoter** les pages (90, 180, 270 degres)
- **Compresser** un PDF
- **Convertir** un PDF en images ou en texte

### Outils Video (FFmpeg)
- **Decouper** une video (trim start/end)
- **Fusionner** plusieurs videos
- **Extraire l'audio** d'une video
- **Redimensionner** une video
- **Compresser** une video (controle CRF)
- **Convertir en GIF** (palette optimisee, sans artefacts)
- **Pivoter** une video
- **Supprimer l'audio** d'une video
- **Extraire une miniature** (frame unique)

### OCR
Extrayez du texte depuis des images ou des PDF scannes via Tesseract. Exportez en TXT, Markdown ou copiez dans le presse-papier. Supporte le francais et l'anglais.

## Plateformes supportees

| OS | Statut |
|----|--------|
| Windows 10/11 | Supporte |
| macOS 11+ | Supporte |
| Linux (Ubuntu 22.04+, Fedora 38+, Arch) | Supporte |

## Prerequis

### Obligatoires

| Dependance | Version | Usage |
|------------|---------|-------|
| [Node.js](https://nodejs.org/) | >= 18 | Frontend build |
| [Rust](https://rustup.rs/) | >= 1.77 | Backend Tauri |
| [Tauri CLI](https://tauri.app/) | v2 | Build & dev |

### Optionnels (selon les fonctionnalites utilisees)

| Dependance | Version | Usage | Lien |
|------------|---------|-------|------|
| [FFmpeg](https://ffmpeg.org/) | >= 5.0 | Conversion audio/video, outils video | [Telechargement](https://ffmpeg.org/download.html) |
| [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) | >= 5.0 | Extraction de texte (OCR) | [Telechargement](https://github.com/UB-Mannheim/tesseract/wiki) |

## Installation

### Windows

1. **Node.js** : Telechargez et installez depuis [nodejs.org](https://nodejs.org/)

2. **Rust** : Ouvrez PowerShell et executez :
   ```powershell
   winget install Rustlang.Rustup
   ```
   Ou telechargez l'installateur depuis [rustup.rs](https://rustup.rs/)

3. **FFmpeg** (optionnel) :
   ```powershell
   winget install Gyan.FFmpeg
   ```
   Ou telechargez depuis [gyan.dev](https://www.gyan.dev/ffmpeg/builds/), extrayez et ajoutez le dossier `bin` au PATH systeme.

4. **Tesseract** (optionnel) :
   Telechargez l'installateur Windows depuis [UB-Mannheim](https://github.com/UB-Mannheim/tesseract/wiki).
   Pendant l'installation, cochez les packs de langues souhaites (ex: French).

5. **Cloner et lancer** :
   ```powershell
   git clone https://github.com/3WVKV/OmniConvert.git
   cd OmniConvert
   npm install
   npm run tauri dev
   ```

### macOS

1. **Xcode Command Line Tools** :
   ```bash
   xcode-select --install
   ```

2. **Homebrew** (si pas deja installe) :
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

3. **Node.js & Rust** :
   ```bash
   brew install node
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   ```

4. **FFmpeg & Tesseract** (optionnels) :
   ```bash
   brew install ffmpeg tesseract tesseract-lang
   ```

5. **Cloner et lancer** :
   ```bash
   git clone https://github.com/3WVKV/OmniConvert.git
   cd OmniConvert
   npm install
   npm run tauri dev
   ```

### Linux (Debian/Ubuntu)

1. **Dependances systeme** :
   ```bash
   sudo apt update
   sudo apt install -y build-essential curl wget file libssl-dev libgtk-3-dev \
     libwebkit2gtk-4.1-dev librsvg2-dev libayatana-appindicator3-dev
   ```

2. **Node.js** :
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   ```

3. **Rust** :
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
   source $HOME/.cargo/env
   ```

4. **FFmpeg & Tesseract** (optionnels) :
   ```bash
   sudo apt install -y ffmpeg tesseract-ocr tesseract-ocr-fra
   ```

5. **Cloner et lancer** :
   ```bash
   git clone https://github.com/3WVKV/OmniConvert.git
   cd OmniConvert
   npm install
   npm run tauri dev
   ```

### Linux (Fedora)

1. **Dependances systeme** :
   ```bash
   sudo dnf install -y gcc-c++ openssl-devel gtk3-devel webkit2gtk4.1-devel \
     librsvg2-devel libayatana-appindicator-gtk3
   ```

2. **Node.js & Rust** : meme procedure que Debian/Ubuntu (etapes 2 et 3)

3. **FFmpeg & Tesseract** (optionnels) :
   ```bash
   sudo dnf install -y ffmpeg tesseract tesseract-langpack-fra
   ```

4. **Cloner et lancer** : meme procedure que Debian/Ubuntu (etape 5)

### Linux (Arch)

```bash
sudo pacman -S --needed base-devel nodejs npm rust gtk3 webkit2gtk-4.1 \
  librsvg libayatana-appindicator ffmpeg tesseract tesseract-data-fra
git clone https://github.com/3WVKV/OmniConvert.git
cd OmniConvert
npm install
npm run tauri dev
```

## Build production

Pour generer l'installateur de l'application :

```bash
npm run tauri build
```

Les fichiers de sortie se trouvent dans `src-tauri/target/release/bundle/` :
- **Windows** : `.msi` et `.exe` (NSIS)
- **macOS** : `.dmg` et `.app`
- **Linux** : `.deb`, `.AppImage`, `.rpm`

## Stack technique

| Couche | Technologie |
|--------|------------|
| Framework desktop | Tauri v2 (Rust) |
| Frontend | React 19 + TypeScript 5.8 |
| Bundler | Vite 7 |
| UI | shadcn/ui + Tailwind CSS 4 |
| State | Zustand |
| i18n | i18next (FR / EN) |
| PDF | lopdf (Rust) + pdf.js (preview) |
| Images | image crate (Rust) |
| Audio/Video | FFmpeg (CLI externe) |
| OCR | Tesseract (CLI externe) |

## Licence

Projet personnel de [3WVKV](https://github.com/3WVKV).
