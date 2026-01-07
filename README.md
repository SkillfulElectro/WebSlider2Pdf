# WebSlider to PDF Converter

A cross-platform command-line tool that converts `.webslider` (tar archive) presentations into PDF documents by rendering each slide as a high-quality JPEG image.

## Features

- 🖥️ **Cross-platform** - Works on Linux, macOS, and Windows
- 🚀 **Fast** - Built with [Bun](https://bun.sh) for maximum performance
- 📐 **Configurable** - Respects slide dimensions from manifest or uses sensible defaults
- 🎨 **High Quality** - Renders slides using Chromium for pixel-perfect output
- 📄 **Optimized PDFs** - Uses JPEG compression for smaller file sizes

## Prerequisites

### 1. Install Bun

**Linux/macOS:**
```bash
curl -fsSL https://bun.sh/install | bash
```

**Windows:**
```powershell
powershell -c "irm bun.sh/install.ps1 | iex"
```

Or via npm:
```bash
npm install -g bun
```

### 2. Install Chrome or Chromium

The tool requires a Chromium-based browser to render slides.

**macOS:**
```bash
# Using Homebrew
brew install --cask google-chrome
# or
brew install --cask chromium
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update
sudo apt install chromium-browser
# or
sudo apt install google-chrome-stable
```

**Linux (Fedora):**
```bash
sudo dnf install chromium
```

**Linux (Arch):**
```bash
sudo pacman -S chromium
```

**Windows:**
- Download from [google.com/chrome](https://www.google.com/chrome/)
- Or install via winget: `winget install Google.Chrome`

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/webslider-pdf.git
cd webslider-pdf
```

2. Install dependencies:
```bash
bun install
```

## Usage

### Basic Usage

```bash
bun run make-pdf.js <input.webslider> <output.pdf>
```

### Examples

```bash
# Convert a presentation
bun run make-pdf.js presentation.webslider output.pdf

# Convert with absolute paths
bun run make-pdf.js /path/to/my-slides.webslider /path/to/output/slides.pdf

# Windows example
bun run make-pdf.js C:\Users\Me\slides.webslider C:\Users\Me\output.pdf
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_PATH` | Auto-detect | Custom path to Chrome/Chromium executable |
| `SLIDE_WAIT_MS` | `250` | Milliseconds to wait for slide animations |
| `JPEG_QUALITY` | `90` | JPEG quality (1-100) |

**Examples:**

```bash
# Use a specific Chrome installation
CHROME_PATH=/opt/chrome/chrome bun run make-pdf.js input.webslider output.pdf

# Wait longer for complex animations
SLIDE_WAIT_MS=1000 bun run make-pdf.js input.webslider output.pdf

# Higher quality output
JPEG_QUALITY=100 bun run make-pdf.js input.webslider output.pdf

# Windows PowerShell
$env:CHROME_PATH="C:\Chrome\chrome.exe"; bun run make-pdf.js input.webslider output.pdf
```

## WebSlider Archive Format

The `.webslider` file is a tar archive with the following structure:

```
project.webslider
├── manifest.json          # Optional: Contains slideSize configuration
└── slides/
    ├── 0/
    │   └── index.html     # Slide 1
    ├── 1/
    │   └── index.html     # Slide 2
    ├── 2/
    │   └── index.html     # Slide 3
    └── ...
```

### manifest.json (Optional)

```json
{
  "slideSize": {
    "width": 1920,
    "height": 1080
  }
}
```

If no manifest is provided, the default slide size is 1280×720 pixels.

## Building Standalone Executables

You can compile the tool into a standalone executable:

```bash
# Linux
bun build --compile --target=bun-linux-x64 make-pdf.js --outfile=webslider-pdf-linux

# macOS (Intel)
bun build --compile --target=bun-darwin-x64 make-pdf.js --outfile=webslider-pdf-macos-x64

# macOS (Apple Silicon)
bun build --compile --target=bun-darwin-arm64 make-pdf.js --outfile=webslider-pdf-macos-arm64

# Windows
bun build --compile --target=bun-windows-x64 make-pdf.js --outfile=webslider-pdf-windows.exe
```

## Troubleshooting

### "No Chrome/Chromium binary found"

1. Ensure Chrome or Chromium is installed
2. Set the `CHROME_PATH` environment variable to point to your browser executable

**Find Chrome path:**

```bash
# Linux
which chromium-browser || which google-chrome

# macOS
ls /Applications/Google\ Chrome.app/Contents/MacOS/

# Windows (PowerShell)
Get-Command chrome.exe
```

### "Failed to extract tar"

Ensure the input file is a valid tar archive:

```bash
# Verify the archive
tar -tf your-file.webslider
```

### Slides Not Rendering Correctly

1. Increase the wait time for animations:
   ```bash
   SLIDE_WAIT_MS=2000 bun run make-pdf.js input.webslider output.pdf
   ```

2. Check that slides work in a regular browser first

### Large PDF File Size

Reduce JPEG quality:
```bash
JPEG_QUALITY=75 bun run make-pdf.js input.webslider output.pdf
```

## Dependencies

- [tar](https://www.npmjs.com/package/tar) - Archive extraction
- [puppeteer](https://pptr.dev/) - Browser automation
- [pdf-lib](https://pdf-lib.js.org/) - PDF generation
- [fs-extra](https://www.npmjs.com/package/fs-extra) - Enhanced file system operations

## License

MIT License - see [LICENSE](LICENSE) for details.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
