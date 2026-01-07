#!/usr/bin/env bun
// make-pdf.js
// Cross-platform Bun app to convert a .webslider (tar) into a PDF by screenshotting slides as JPEGs
// Usage: bun run make-pdf.js /path/to/project.webslider /path/to/output.pdf
//
// Requirements:
//   bun add tar puppeteer pdf-lib fs-extra

import { x as tarExtract } from "tar";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import os from "os";
import { mkdirp } from "fs-extra";

// Cross-platform utilities
const isWindows = process.platform === "win32";
const isMacOS = process.platform === "darwin";
const isLinux = process.platform === "linux";

function usageExit() {
  console.error("Usage: bun run make-pdf.js <input.webslider> <output.pdf>");
  console.error("");
  console.error("Arguments:");
  console.error("  input.webslider  Path to the .webslider archive file");
  console.error("  output.pdf       Path for the generated PDF file");
  console.error("");
  console.error("Environment Variables:");
  console.error("  CHROME_PATH      Custom path to Chrome/Chromium executable");
  console.error("  SLIDE_WAIT_MS    Milliseconds to wait for slide animations (default: 250)");
  console.error("  JPEG_QUALITY     JPEG quality 1-100 (default: 90)");
  process.exit(2);
}

if (process.argv.length < 4) usageExit();

const archivePath = path.resolve(process.argv[2]);
const outPdfPath = path.resolve(process.argv[3]);

// Configuration from environment
const SLIDE_WAIT_MS = parseInt(process.env.SLIDE_WAIT_MS || "250", 10);
const JPEG_QUALITY = parseInt(process.env.JPEG_QUALITY || "90", 10);

/**
 * Find Chrome/Chromium executable based on the current platform
 */
function findSystemChrome() {
  const candidates = [];

  // Always check CHROME_PATH first
  if (process.env.CHROME_PATH) {
    candidates.push(process.env.CHROME_PATH);
  }

  if (isWindows) {
    // Windows Chrome/Chromium paths
    const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
    const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");

    candidates.push(
      // Google Chrome
      path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
      // Chrome Canary
      path.join(localAppData, "Google", "Chrome SxS", "Application", "chrome.exe"),
      // Chromium
      path.join(programFiles, "Chromium", "Application", "chrome.exe"),
      path.join(programFilesX86, "Chromium", "Application", "chrome.exe"),
      path.join(localAppData, "Chromium", "Application", "chrome.exe"),
      // Microsoft Edge (Chromium-based)
      path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
      // Brave Browser
      path.join(programFiles, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(programFilesX86, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
      path.join(localAppData, "BraveSoftware", "Brave-Browser", "Application", "brave.exe"),
    );
  } else if (isMacOS) {
    // macOS Chrome/Chromium paths
    const home = os.homedir();
    candidates.push(
      // Google Chrome
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      path.join(home, "Applications", "Google Chrome.app", "Contents", "MacOS", "Google Chrome"),
      // Chrome Canary
      "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
      path.join(home, "Applications", "Google Chrome Canary.app", "Contents", "MacOS", "Google Chrome Canary"),
      // Chromium
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      path.join(home, "Applications", "Chromium.app", "Contents", "MacOS", "Chromium"),
      // Brave Browser
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      path.join(home, "Applications", "Brave Browser.app", "Contents", "MacOS", "Brave Browser"),
      // Microsoft Edge
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      // Homebrew installations
      "/opt/homebrew/bin/chromium",
      "/usr/local/bin/chromium",
    );
  } else {
    // Linux Chrome/Chromium paths
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/opt/google/chrome/chrome",
      "/opt/google/chrome/google-chrome",
      "/snap/bin/chromium",
      "/snap/bin/google-chrome",
      // Flatpak installations
      "/var/lib/flatpak/exports/bin/com.google.Chrome",
      "/var/lib/flatpak/exports/bin/org.chromium.Chromium",
      // Brave on Linux
      "/usr/bin/brave-browser",
      "/usr/bin/brave",
      "/opt/brave.com/brave/brave-browser",
    );
  }

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // Ignore access errors
    }
  }
  return null;
}

async function extractTar(archive, dest) {
  await tarExtract({
    file: archive,
    C: dest,
    sync: false,
  });
}

async function readManifestIfExists(dir) {
  const manifestPath = path.join(dir, "manifest.json");
  try {
    const raw = await fsp.readFile(manifestPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function listNumericSlideFolders(slidesDir) {
  try {
    const entries = await fsp.readdir(slidesDir, { withFileTypes: true });
    return entries
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .filter((n) => /^\d+$/.test(n))
      .sort((a, b) => Number(a) - Number(b));
  } catch {
    return [];
  }
}

function pxToPdfPoints(px, dpi = 96) {
  return (px * 72) / dpi;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Normalize path for URL usage (convert Windows backslashes)
 */
function toUrlPath(fsPath) {
  return fsPath.split(path.sep).join("/");
}

/**
 * Create a simple HTTP server for serving extracted files
 */
function createServer(extracted, port = 0) {
  return Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      let fsPath = path.join(extracted, decodeURIComponent(url.pathname));

      // Handle directory requests
      if (fs.existsSync(fsPath) && fs.statSync(fsPath).isDirectory()) {
        const indexPath = path.join(fsPath, "index.html");
        if (fs.existsSync(indexPath)) {
          fsPath = indexPath;
        }
      }

      if (!fs.existsSync(fsPath)) {
        return new Response("Not Found", { status: 404 });
      }

      const file = Bun.file(fsPath);
      const headers = new Headers();

      // MIME type detection - comprehensive WebSlider MIME types
      const ext = path.extname(fsPath).toLowerCase().slice(1); // Remove leading dot
      const mimeTypes = {
        // Core web documents
        'html': 'text/html; charset=utf-8',
        'htm': 'text/html; charset=utf-8',
        'css': 'text/css; charset=utf-8',
        'js': 'text/javascript; charset=utf-8',
        'mjs': 'text/javascript; charset=utf-8',
        'cjs': 'text/javascript; charset=utf-8',
        'json': 'application/json; charset=utf-8',
        'map': 'application/json; charset=utf-8',
        'xml': 'application/xml; charset=utf-8',
        'txt': 'text/plain; charset=utf-8',
        'csv': 'text/csv; charset=utf-8',
        'md': 'text/markdown; charset=utf-8',
        'yaml': 'application/yaml; charset=utf-8',
        'yml': 'application/yaml; charset=utf-8',
        'toml': 'application/toml; charset=utf-8',
        'webmanifest': 'application/manifest+json; charset=utf-8',
        
        // Images
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'webp': 'image/webp',
        'avif': 'image/avif',
        'svg': 'image/svg+xml',
        'ico': 'image/x-icon',
        'bmp': 'image/bmp',
        'tif': 'image/tiff',
        'tiff': 'image/tiff',
        
        // Fonts
        'woff': 'font/woff',
        'woff2': 'font/woff2',
        'ttf': 'font/ttf',
        'otf': 'font/otf',
        'eot': 'application/vnd.ms-fontobject',
        
        // Audio
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav',
        'ogg': 'audio/ogg',
        'opus': 'audio/opus',
        'aac': 'audio/aac',
        'm4a': 'audio/mp4',
        'flac': 'audio/flac',
        
        // Video
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogv': 'video/ogg',
        'mov': 'video/quicktime',
        'm4v': 'video/mp4',
        'mpeg': 'video/mpeg',
        'mpg': 'video/mpeg',
        
        // Data / binaries / 3D / WASM
        'wasm': 'application/wasm',
        'bin': 'application/octet-stream',
        'glb': 'model/gltf-binary',
        'gltf': 'model/gltf+json',
        'obj': 'text/plain; charset=utf-8',
        'stl': 'model/stl',
        'dae': 'model/vnd.collada+xml',
        
        // Documents
        'pdf': 'application/pdf',
        'rtf': 'application/rtf',
        
        // Archives
        'zip': 'application/zip',
        'tar': 'application/x-tar',
        'gz': 'application/gzip',
        'tgz': 'application/gzip',
        '7z': 'application/x-7z-compressed',
        'rar': 'application/vnd.rar'
      };

      if (mimeTypes[ext]) {
        headers.set("Content-Type", mimeTypes[ext]);
      }

      return new Response(file.stream(), { status: 200, headers });
    },
  });
}

async function main() {
  console.log(`Platform: ${process.platform} (${os.arch()})`);
  console.log(`Bun version: ${Bun.version}`);
  console.log("");

  // 1. Validate input file
  try {
    await fsp.stat(archivePath);
  } catch {
    console.error("❌ Archive not found:", archivePath);
    process.exit(1);
  }

  // 2. Create temp directory
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "webslider-"));
  const extracted = path.join(tmp, "project");
  await mkdirp(extracted);

  console.log("📦 Extracting archive to", extracted);
  try {
    await extractTar(archivePath, extracted);
  } catch (err) {
    console.error("❌ Failed to extract tar:", err.message);
    process.exit(1);
  }

  // 3. Read manifest for slide size
  const manifest = await readManifestIfExists(extracted);
  let slideWidth = 1280;
  let slideHeight = 720;

  if (manifest?.slideSize?.width && manifest?.slideSize?.height) {
    slideWidth = manifest.slideSize.width;
    slideHeight = manifest.slideSize.height;
    console.log(`📐 Slide size from manifest: ${slideWidth}x${slideHeight}`);
  } else {
    console.log(`📐 Using default slide size: ${slideWidth}x${slideHeight}`);
  }

  // 4. Find slides
  const slidesRoot = path.join(extracted, "slides");
  let slideDirs = await listNumericSlideFolders(slidesRoot);

  if (slideDirs.length === 0) {
    console.warn("⚠️  No numeric slide folders found, scanning for alternatives...");
    try {
      const entries = await fsp.readdir(slidesRoot, { withFileTypes: true });
      const candidates = entries
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .filter((n) => {
          const indexPath = path.join(slidesRoot, n, "index.html");
          return fs.existsSync(indexPath);
        });
      slideDirs = candidates.sort();
    } catch {
      console.error("❌ No slides found. Exiting.");
      process.exit(1);
    }
  }

  if (slideDirs.length === 0) {
    console.error("❌ No slides found in the archive. Exiting.");
    process.exit(1);
  }

  console.log(`📊 Found ${slideDirs.length} slide(s)`);

  // 5. Start local server
  const srv = createServer(extracted, 0);
  const host = "127.0.0.1";
  const boundPort = srv.port;
  console.log(`🌐 Serving at http://${host}:${boundPort}/`);

  // 6. Find and launch browser
  const chromePath = findSystemChrome();
  if (!chromePath) {
    console.error("❌ No Chrome/Chromium binary found.");
    console.error("   Set CHROME_PATH environment variable or install Chrome/Chromium.");
    console.error("");
    console.error("   Installation guides:");
    if (isWindows) {
      console.error("   - Download from: https://www.google.com/chrome/");
    } else if (isMacOS) {
      console.error("   - Download from: https://www.google.com/chrome/");
      console.error("   - Or via Homebrew: brew install --cask google-chrome");
    } else {
      console.error("   - Ubuntu/Debian: sudo apt install chromium-browser");
      console.error("   - Fedora: sudo dnf install chromium");
      console.error("   - Arch: sudo pacman -S chromium");
    }
    await srv.stop();
    process.exit(1);
  }

  console.log(`🌍 Using browser: ${chromePath}`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: slideWidth, height: slideHeight });

    const images = [];

    for (let i = 0; i < slideDirs.length; i++) {
      const s = slideDirs[i];
      const tryPaths = [
        `/slides/${s}/index.html`,
        `/slides/${s}`,
        `/${s}/index.html`,
        `/${s}`,
        `/slides/${s}.html`,
      ];

      let urlPath = null;
      for (const p of tryPaths) {
        try {
          const r = await fetch(`http://${host}:${boundPort}${p}`);
          if (r.status === 200) {
            urlPath = p;
            break;
          }
        } catch {
          // Ignore fetch errors
        }
      }

      if (!urlPath) {
        console.warn(`⚠️  Skipping slide '${s}' — couldn't find index URL`);
        continue;
      }

      const url = `http://${host}:${boundPort}${urlPath}`;
      console.log(`🎨 Rendering slide ${i + 1}/${slideDirs.length}: ${s}`);

      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
      await sleep(SLIDE_WAIT_MS);

      const imgPath = path.join(tmp, `slide-${String(i).padStart(4, "0")}.jpg`);
      await page.screenshot({
        path: imgPath,
        type: "jpeg",
        quality: JPEG_QUALITY,
        clip: { x: 0, y: 0, width: slideWidth, height: slideHeight },
      });

      images.push({ path: imgPath, width: slideWidth, height: slideHeight });
    }

    if (images.length === 0) {
      console.error("❌ No slides were rendered. Exiting.");
      await browser.close();
      await srv.stop();
      process.exit(1);
    }

    // 7. Compose PDF
    console.log("📄 Composing PDF...");
    const pdfDoc = await PDFDocument.create();

    for (const img of images) {
      const jpgBytes = await fsp.readFile(img.path);
      const embedded = await pdfDoc.embedJpg(jpgBytes);
      const widthPts = pxToPdfPoints(img.width, 96);
      const heightPts = pxToPdfPoints(img.height, 96);
      const pdfPage = pdfDoc.addPage([widthPts, heightPts]);
      pdfPage.drawImage(embedded, {
        x: 0,
        y: 0,
        width: widthPts,
        height: heightPts,
      });
    }

    // Ensure output directory exists
    const outDir = path.dirname(outPdfPath);
    if (outDir && outDir !== ".") {
      await mkdirp(outDir);
    }

    const pdfBytes = await pdfDoc.save();
    await fsp.writeFile(outPdfPath, pdfBytes);
    console.log(`✅ PDF written to: ${outPdfPath}`);
    console.log(`   Pages: ${images.length}`);
    console.log(`   Size: ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);

    // Cleanup
    await browser.close();
    await srv.stop();

    // Clean up temp files
    try {
      await fsp.rm(tmp, { recursive: true, force: true });
    } catch {
      console.warn("⚠️  Could not clean up temp directory:", tmp);
    }

    console.log("🎉 Done!");
  } catch (err) {
    console.error("❌ Error during rendering:", err.message);
    try {
      await browser?.close();
      await srv.stop();
    } catch {
      // Ignore cleanup errors
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("💥 Fatal error:", err.message);
  process.exit(1);
});
