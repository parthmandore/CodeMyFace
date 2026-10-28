# CodeMyPicture — Creative Coding Studio

Transform your photos into stylized digital paintings or high-fidelity photographic vector reproductions with pure client-side code synthesis.

---

## 🎨 Key Features

- **100% In-Browser Privacy**: All image analysis, vector tracing, and ML inference run locally inside your browser memory. No photos are ever uploaded to any server.
- **Two Distinct Synthesis Engines**:
  - **Option A — Painting Mode**: Organic digital painting studio generating cohesive vector planar brushwork masses with zero synthetic stamps and zero blur filters.
  - **Option B — Recreation Mode**: High-fidelity photographic vector reconstruction preserving fine facial features, micro-textures, horizontal stripes, and crisp contours with subpixel coordinate precision and zero transparent holes.
- **Two Simplified Quality Tiers**:
  - **High Quality**: Maximum visual fidelity, rich color depth, and fine contour tracking.
  - **Low Quality**: Balanced, lightweight vector structure optimized for rapid web rendering and compact file sizes.
- **Progressive Canvas Loading**: Animated brush sweep visualization during synthesis.
- **Clean Vector Output**: 100% genuine vector geometry (zero `<image>` tags and zero base64 bitmaps) ready to copy into Figma, Illustrator, or HTML.
- **Export Options**: Export clean, standalone SVG vector documents, React TSX components, or self-contained HTML art.

---

## 🛠️ Technology Stack

- **UI Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite 8
- **Editor**: CodeMirror 6 with syntax highlighting
- **Icons**: Lucide React
- **Face Landmark Detection**: MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)
- **Vector Tracing Engine**: ImageTracerJS + Multi-Scale Biometric Color Synthesis & Planar Optimization

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20 or higher
- npm 9 or higher

### Installation & Run

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Build for production
npm run build

# 4. Preview production build
npm run preview
```

---

## 🔒 Privacy Guarantee

CodeMyPicture runs entirely client-side. The application does not store, transmit, or process your images externally.
