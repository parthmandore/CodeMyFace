# CodeMyFace — Creative Coding Studio

Transform your selfie into stylized geometric vector portraits and authentic code art with pure client-side code synthesis.

---

## 🎨 Key Features

- **100% In-Browser Privacy**: All image analysis, vector tracing, and ML inference run locally inside your browser memory. No photos are ever uploaded to any server.
- **Three-Tier Architecture**:
  - **Tier 1 (High Quality)**: Maximum visual fidelity preserving crisp edges, fine textures, and rich color depth.
  - **Tier 2 (Medium Quality)**: Balanced compression (~40–60% of Tier 1) optimizing vector node count while preserving essential facial contours.
  - **Tier 3 (Low / Compact)**: High-efficiency lightweight vector art (~10–20% of Tier 1) designed for ultra-fast web rendering.
- **Dynamic Size Budgeting**: Specify a target file size (e.g., 50 KB) and the binary search optimizer automatically tunes color palettes and path omissions to meet your target.
- **Dual Synthesis Engines**:
  - **Recreation Mode**: Direct high-fidelity photo vectorization.
  - **Painting Studio Mode**: Layered artistic painting synthesis with animated stroke reveals.
- **Export Options**: Export clean, standalone SVG vector documents, React TSX components, or self-contained HTML art.

---

## 🛠️ Technology Stack

- **UI Framework**: React 19 + TypeScript
- **Bundler & Dev Server**: Vite 8
- **Editor**: CodeMirror 6 with syntax highlighting
- **Icons**: Lucide React
- **Face Landmark Detection**: MediaPipe Tasks Vision (`@mediapipe/tasks-vision`)
- **Vector Tracing Engine**: ImageTracerJS + Custom Edge-Preserving Denoise and Compound Path Optimization

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

CodeMyFace runs entirely client-side. The application does not store, transmit, or process your images externally.
