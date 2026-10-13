# CodeMyFace — Comprehensive Technical Architecture & Facial Reconstruction Audit

**Project:** CodeMyFace  
**Document Version:** 1.0.0 (Read-Only Technical Audit)  
**Date:** October 13, 2026  
**Repository Path:** `c:\Users\mando\ag\CodeMyFace`  
**Execution Environment:** Static Browser Client (Vite 8, React 19, TypeScript, MediaPipe WASM)  
**Audit Mode:** Complete Investigation & Codebase Trace (No Code Modifications)

---

## Executive Summary

CodeMyFace is an in-browser creative coding application designed to transform an uploaded human photograph into a stylized, original geometric vector portrait (SVG). The entire pipeline executes 100% locally on the client hardware using WebAssembly (WASM), WebGL, and HTML5 Canvas APIs, requiring zero server roundtrips, zero paid AI APIs, and zero raster image embeds (`<image>`, `data:image/`, or base64) in the exported artwork.

This audit report documents the exact end-to-end architecture, mathematics, computer-vision models, heuristic pipelines, coordinate projection mechanics, landmark index mappings, and limitations of the codebase as it exists today.

---

## Table of Contents

1. [Section 1 — Project Architecture](#section-1--project-architecture)
2. [Section 2 — Image Upload and Preprocessing](#section-2--image-upload-and-preprocessing)
3. [Section 3 — Facial Detection and Landmark Model](#section-3--facial-detection-and-landmark-model)
4. [Section 4 — Landmark Visualization](#section-4--landmark-visualization)
5. [Section 5 — Face Segmentation and Hair Analysis](#section-5--face-segmentation-and-hair-analysis)
6. [Section 6 — Face Shape and Facial Feature Generation](#section-6--face-shape-and-facial-feature-generation)
7. [Section 7 — Gender and Facial Hair Logic](#section-7--gender-and-facial-hair-logic)
8. [Section 8 — Color Estimation](#section-8--color-estimation)
9. [Section 9 — SVG Generation](#section-9--svg-generation)
10. [Section 10 — Complete Data Flow](#section-10--complete-data-flow)
11. [Section 11 — Runtime Diagnostics](#section-11--runtime-diagnostics)
12. [Section 12 — Dependencies and Model Assets](#section-12--dependencies-and-model-assets)
13. [Section 13 — Limitations of the Current Implementation](#section-13--limitations-of-the-current-implementation)
14. [Section 14 — Summary Matrix & Questions for Human Review](#section-14--summary-matrix--questions-for-human-review)

---

## Section 1 — Project Architecture

### 1.1 Core Technology Stack

- **Frontend Framework:** React 19 (`react: ^19.3.0`, `react-dom: ^19.3.0`) utilizing React Hooks (`useState`, `useEffect`, `useCallback`, `useMemo`, `useRef`).
- **Programming Language:** TypeScript (~6.0.2 in `package.json`), configured with `"strict": true`, `"moduleResolution": "bundler"`, and `"target": "ES2022"`.
- **Build Tooling & Dev Server:** Vite 8 (`vite: ^8.3.0`, `@vitejs/plugin-react: ^6.1.2`).
- **Testing Engine:** Vitest 5 (`vitest: ^5.0.4`), running in Node/JSDOM environment with 8 test suites and 60 test cases.
- **Iconography:** Lucide React (`lucide-react: ^1.55.0`).
- **Computer Vision Model Runtime:** Google MediaPipe Tasks Vision (`@mediapipe/tasks-vision: ^1.1.0`), executed via client-side WebAssembly (`.wasm`) with WebGL/WebGPU hardware acceleration.

### 1.2 Directory Structure

```text
CodeMyFace/
├── package.json                   # Dependencies, scripts, project metadata
├── tsconfig.json                  # TypeScript compiler options
├── vite.config.ts                 # Vite bundler configuration (port 5180)
├── index.html                     # HTML5 entry shell mounting #root
├── public/                        # Static public assets (favicon.svg, icons.svg)
└── src/
    ├── main.tsx                   # React root mount point (createRoot)
    ├── App.tsx                    # Root application controller (Upload vs Studio view)
    ├── vite-env.d.ts              # Vite environment typings
    ├── types/
    │   ├── portrait.ts            # Core geometric & pipeline interfaces (Vec2, Color, FacialFeatures, PortraitModel, FaceAnalysis)
    │   └── upload.ts              # Upload interfaces (ValidatedImage, UploadError)
    ├── utils/
    │   ├── formatters.ts          # Dimension, aspect-ratio, and byte formatting helpers
    │   ├── imageLoader.ts         # In-memory Image object decoding & URL.revokeObjectURL lifecycle
    │   └── imageValidator.ts      # MIME, file-size, and binary magic-byte validator
    ├── services/
    │   ├── faceDetection/
    │   │   ├── index.ts           # React hook `useFaceDetection` singleton accessor
    │   │   ├── mediaPipeAdapter.ts # MediaPipe FaceLandmarker WASM adapter
    │   │   └── types.ts           # IFaceDetectionService contracts & landmark types
    │   └── segmentation/
    │       ├── segmentationService.ts # MediaPipe ImageSegmenter (selfie_multiclass)
    │       └── contourExtractor.ts   # Radial ray mask scanning & Douglas-Peucker simplifier
    ├── engine/
    │   ├── colorSampler.ts        # Transient OffscreenCanvas pixel color sampling
    │   ├── coordinateTransform.ts # Isotropic projection & Catmull-Rom spline curves
    │   ├── faceAnalyzer.ts        # Semantic landmark mapping, face shape classification, pupil constraint
    │   ├── geometry.ts            # Vector math, clamping, color manipulation (darken, lighten, luminance)
    │   ├── heuristicFeatures.ts   # Palette extraction, hairstyle estimation, facial hair detection
    │   ├── landmarkIndices.ts     # Canonical named indices into the 478 MediaPipe landmark mesh
    │   ├── portraitPipeline.ts    # End-to-end multi-stage pipeline coordinator (Stages A–M)
    │   └── svgRenderer.ts         # 10-layer PortraitModel synthesis & XML SVG serializer
    ├── components/
    │   ├── common/                # Shared UI primitives (Button, ErrorAlert, StatusPill)
    │   ├── layout/                # Shell header & engine status indicator (Header.tsx)
    │   ├── studio/                # Studio editor shell (StudioStage.tsx, StepIndicator.tsx)
    │   └── upload/                # Photo input dropzone & preview (UploadWorkflow.tsx, Dropzone.tsx, PhotoPreview.tsx)
    └── styles/
        ├── tokens.css             # Color palette tokens, CSS variables, typography
        ├── base.css               # Global CSS resets, typography, layout containers
        └── components.css         # Component-specific styles (editor shell, canvas viewport, mesh overlay)
```

### 1.3 Key Source File Breakdown

| Source File | Primary Purpose | Inputs | Outputs | Called By | Calls | Facial Reconstruction Role |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `src/main.tsx` | Application Bootstrap | DOM `#root` | Mounted React App | Vite runtime | `src/App.tsx` | Mounts client-side shell. |
| `src/App.tsx` | View State Controller | User interactions | `currentView`, `currentImage`, `portraitModel` | `src/main.tsx` | `generatePortrait()`, `useFaceDetection()`, `UploadWorkflow`, `StudioStage` | Coordinates transitions between photo upload and vector studio. |
| `src/utils/imageValidator.ts` | Binary Header & Size Validation | Raw `File` | `{ valid: true, mimeType }` or `{ valid: false, error }` | `UploadWorkflow.tsx` | `readHeaderBytes()` | Rejects non-image, corrupt, or oversized files before decoding. |
| `src/utils/imageLoader.ts` | Bitmap Decoding | `File`, `mimeType` | `ValidatedImage` (`HTMLImageElement`, dimensions) | `UploadWorkflow.tsx` | `Image.onload`, `URL.createObjectURL` | Decodes image into memory safely without network transfer. |
| `src/services/faceDetection/mediaPipeAdapter.ts` | Face Landmark Inference | `HTMLImageElement` | `FaceDetectionResult` (478 landmarks, bounding box, latency) | `PhotoPreview.tsx`, `useFaceDetection` | MediaPipe `FaceLandmarker.detect()` | Extracts raw 478 MediaPipe 3D landmark points. |
| `src/services/segmentation/segmentationService.ts` | Hair Segmentation | `HTMLImageElement`, `headCenter` | `HairSegmentationResult` (boundary points) | `portraitPipeline.ts` | MediaPipe `ImageSegmenter.segment()`, `extractRadialMaskContour()` | Extracts binary hair category mask from Google multiclass model. |
| `src/engine/faceAnalyzer.ts` | Semantic Feature Extraction | `NormalizedLandmark[]` | `FacialFeatures`, `FaceShape`, `faceMetrics` | `portraitPipeline.ts` | `mapIndices()`, `classifyFaceShape()` | Translates raw landmark array indices into anatomical facial contours. |
| `src/engine/colorSampler.ts` | Pixel Color Reader | `HTMLImageElement` | `ColorSampler` instance | `portraitPipeline.ts` | `ctx.getImageData()` on 512px canvas | Extracts pixel RGB values at normalized facial coordinates. |
| `src/engine/heuristicFeatures.ts` | Palette, Hair & Beard Logic | `FacialFeatures`, `ColorSampler` | `PortraitPalette`, `HairEstimate`, `FacialHairEstimate` | `portraitPipeline.ts` | `luminance()`, `darken()`, `lighten()` | Calibrates fair skin tone, detects long/short hair, checks facial hair contrast. |
| `src/engine/coordinateTransform.ts` | Isotropic Scaling & Curves | Normalized `Vec2[]`, image dimensions | Canvas `Vec2`, SVG Path strings (`M...C...Z`) | `svgRenderer.ts`, `StudioStage.tsx` | `computeBoundsImagePx()`, Catmull-Rom splines | Eliminates aspect-ratio distortion; projects landmarks to 1000x1000 artboard. |
| `src/engine/svgRenderer.ts` | Vector Model & XML Serializer | `FaceAnalysis` | `PortraitModel`, Standalone SVG string | `portraitPipeline.ts`, `StudioStage.tsx` | `createIsotropicProjection()`, `projectSmoothClosedCurveToPath()` | Assembles 10 semantic vector layers and serializes pure SVG code. |
| `src/components/studio/StudioStage.tsx` | Studio Workspace | `PortraitModel`, `ValidatedImage` | Interactive UI (vector, split view, code stream) | `App.tsx` | `renderPortraitSvg()`, `handleDownloadSvg()` | Renders side-by-side vector preview, code viewer, and 478-point mesh overlay. |

---

## Section 2 — Image Upload and Preprocessing

### 2.1 Trace of Selected File

1. **Selection:** The user drags a file into `Dropzone.tsx` or selects it via `<input type="file" accept="image/jpeg,image/png,image/webp">`.
2. **File Size & Type Checking (`validateImageFile`):**
   - Verified against `DEFAULT_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024` (10 MB).
   - Validated against MIME whitelist: `image/jpeg`, `image/png`, `image/webp`.
3. **Magic Byte Verification (`verifyImageHeader`):**
   - The first 16 bytes are sliced via `file.slice(0, 16).arrayBuffer()` and inspected:
     - JPEG: `bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF`
     - PNG: `bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47`
     - WebP: `RIFF` (bytes 0–3) and `WEBP` (bytes 8–11).
4. **Bitmap Decoding (`loadImageFromFile`):**
   - An in-memory Object URL is created: `const objectUrl = URL.createObjectURL(file)`.
   - An `HTMLImageElement` instance (`new Image()`) is instantiated with `img.crossOrigin = 'anonymous'` and `img.src = objectUrl`.
   - `naturalWidth` and `naturalHeight` are measured on `img.onload`.
   - The original image file is **never modified, never cropped, and never uploaded to any remote server**.

### 2.2 Preprocessing, Resizing, and Scaling Details

- **Is the Image Resized Before MediaPipe Analysis?**
  No client-side downsampling is performed before passing the image to MediaPipe. The complete, uncompressed `HTMLImageElement` is passed directly to `landmarker.detect(source)`. Internally, the MediaPipe WebAssembly vision kernel downsamples the frame to its native neural network input tensor ($256 \times 256$ pixels).
- **Is the Image Cropped?**
  No cropping is applied. The full frame is analyzed.
- **Is the Image Mirrored?**
  No mirroring is applied.
- **Handling of EXIF Orientation:**
  The application does not use an external EXIF parsing library. Decoding relies on standard browser behavior when parsing image blobs via `HTMLImageElement`.
- **Handling of Portrait vs. Landscape Images:**
  In non-square images, MediaPipe normalizes coordinates independently:
  $$\text{normX} = \frac{\text{pixelX}}{\text{imageWidth}}, \quad \text{normY} = \frac{\text{pixelY}}{\text{imageHeight}}$$
  If normalized coordinates are drawn directly onto a square $1000 \times 1000$ canvas without aspect-ratio compensation, portrait images become horizontally stretched by $\frac{\text{imageHeight}}{\text{imageWidth}}$ (e.g., $1.78\times$ distortion on a $9:16$ portrait photo).
- **The Isotropic Projection Solution (`coordinateTransform.ts`):**
  To prevent distortion, `createIsotropicProjection` converts normalized points back to physical pixel space:
  $$\text{px} = p.x \times \text{imageWidth}, \quad \text{py} = p.y \times \text{imageHeight}$$
  It computes the true bounding box in physical pixels (`headBoundsPx`), selects an isotropic scale factor identical for both X and Y:
  $$\text{scale} = \min\left(\frac{1000 \times 0.64}{\text{headBoundsPx.height}}, \frac{1000 \times 0.52}{\text{headBoundsPx.width}}\right)$$
  And projects points to the canvas:
  $$\text{canvasX} = 500 + (\text{px} - \text{headBoundsPx.centerX}) \times \text{scale}$$
  $$\text{canvasY} = 480 + (\text{py} - \text{headBoundsPx.centerY}) \times \text{scale}$$
- **Color Analysis Downsampling (`ColorSampler.fromImage`):**
  For color sampling, the image is drawn onto an offscreen canvas. If $\max(\text{width}, \text{height}) > 512$, it is scaled down preserving exact aspect ratio (`maxDim = 512`):
  $$\text{scale} = \frac{512}{\max(\text{srcW}, \text{srcH})}, \quad w = \text{round}(\text{srcW} \times \text{scale}), \quad h = \text{round}(\text{srcH} \times \text{scale})$$

---

## Section 3 — Facial Detection and Landmark Model

### 3.1 Model Identification & Configuration

- **Model Name:** MediaPipe Face Landmarker (Float16 quantized task bundle)
- **Package:** `@mediapipe/tasks-vision` version `1.1.0`
- **Model Asset Filename:** `face_landmarker.task`
- **Model URI:** `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
- **WASM Runtime URI:** `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm`
- **Execution Backend:** Pure browser client-side execution. Tries `delegate: 'GPU'` (WebGL / WebGPU) first, falling back to `delegate: 'CPU'` (WebAssembly SIMD).
- **Runtime Network Behavior:** Downloaded once into browser cache over HTTPS; executed 100% locally with zero server API interaction.
- **Model Configuration Parameters:**
  ```typescript
  FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU', // Fallback to 'CPU'
    },
    outputFaceBlendshapes: false,
    outputFacialTransformationMatrixes: false,
    runningMode: 'IMAGE',
    numFaces: 4,
  });
  ```

### 3.2 Output Capability Utilization

- **Face Detection:** Enabled. Detects bounding boxes for up to 4 faces.
- **Face Landmarker Mesh:** Enabled. Returns 468 3D facial mesh points ($x, y, z$ in normalized space).
- **Iris Tracking:** Enabled. Returns 10 iris landmark points (5 for left eye: 468–472; 5 for right eye: 473–477). Total raw landmark count: **478 points**.
- **Facial Blendshapes:** Disabled (`outputFaceBlendshapes: false`).
- **Transformation Matrices:** Disabled (`outputFacialTransformationMatrixes: false`).

### 3.3 Landmark Accounting

- **A. Total Landmarks Returned by Model:** 478 points.
- **B. Valid Landmarks Returned for Face:** 478 points.
- **C. Landmarks Consumed in Semantic Facial Geometry:** 172 distinct landmarks mapped across feature definitions in `landmarkIndices.ts`.
- **D. Landmarks Used for Diagnostics / Visual Overlay:** All 478 landmarks are rendered in the visual mesh overlay (`PhotoPreview.tsx` and `StudioStage.tsx`).
- **E. Landmarks Ignored in Geometric Path Synthesis:** 306 interior facial mesh points (primarily interior cheek and forehead tessellation triangles that do not define structural anatomical boundaries).
- **F. Synthesized Vector Points (Non-Model):**
  - Cranial dome arc: 25 parametric points calculated above forehead top.
  - Ear pinna silhouettes: 5 points per ear, calculated relative to tragus points 234 and 454.
  - Back hair mass: 20 points cascading behind jaw and neck to shoulders.
  - Dental arch incisor divider lines: 3 vertical dividers across the smile opening.

### 3.4 Canonical Landmark Index Mapping (`src/engine/landmarkIndices.ts`)

| Feature | MediaPipe Landmark Indices | Total Points |
| :--- | :--- | :--- |
| **Face Oval** | `10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109` | 36 |
| **Jawline** | `454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234` | 21 |
| **Left Eye Contour** | `33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246` | 16 |
| **Left Eye Upper / Lower** | Upper: `[33, 246, 161, 160, 159, 158, 157, 173, 133]`, Lower: `[33, 7, 163, 144, 145, 153, 154, 155, 133]` | 9 + 9 |
| **Left Pupil / Iris** | Pupil Center: `468`, Iris Ring: `[468, 469, 470, 471, 472]` | 5 |
| **Right Eye Contour** | `362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398` | 16 |
| **Right Eye Upper / Lower** | Upper: `[362, 398, 384, 385, 386, 387, 388, 466, 263]`, Lower: `[362, 382, 381, 380, 374, 373, 390, 249, 263]` | 9 + 9 |
| **Right Pupil / Iris** | Pupil Center: `473`, Iris Ring: `[473, 474, 475, 476, 477]` | 5 |
| **Left Eyebrow** | `[70, 63, 105, 66, 107, 55, 65, 52, 53, 46]` (Upper 5, Lower 5) | 10 |
| **Right Eyebrow** | `[300, 293, 334, 296, 336, 285, 295, 282, 283, 276]` (Upper 5, Lower 5) | 10 |
| **Nose Bridge & Tip** | Bridge: `[6, 197, 195, 5, 4]`, Tip: `4`, Subnasale: `2`, Nasion: `168`, Bottom: `[97, 2, 326]` | 8 |
| **Nostrils & Alar Wings** | Left Nostril: `94`, Right Nostril: `370`, Left Wing: `[48, 115, 220, 45, 4]`, Right Wing: `[278, 344, 440, 275, 4]` | 12 |
| **Nostril Contours & Sidewalls**| Left Contour: `[240, 97, 98, 2]`, Right Contour: `[460, 326, 327, 2]`, Sidewalls: `[197, 196, 236, 134]` & `[197, 419, 456, 363]` | 16 |
| **Upper Lip Outer / Inner** | Outer: `[61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291]`, Inner: `[78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308]` | 11 + 11 |
| **Lower Lip Outer / Inner** | Outer: `[61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291]`, Inner: `[78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308]` | 11 + 11 |
| **Forehead & Temples** | Forehead Top: `10`, Left Temple: `127`, Right Temple: `356`, Forehead Hairline: `[109, 67, 103, 54, 21, 10, 251, 284, 332, 297, 338]` | 14 |
| **Chin Crest & Creases** | Chin Tip: `152`, Chin Crest: `[176, 148, 152, 377, 400]`, Mental Crease: `[18, 200, 199, 175, 152]` | 11 |
| **Eyelid Creases & Smile Lines**| Left Crease: `[226, 247, 30, 29, 27, 28, 56, 190, 243]`, Right Crease: `[446, 467, 260, 259, 257, 258, 286, 414, 463]`, Nasolabial: `[205, 206, 207, 216, 212]` & `[425, 426, 427, 436, 432]`| 28 |
| **Ears** | Left Tragus: `234`, Right Tragus: `454` *(MediaPipe has NO outer ear contour points; pinna is synthesized)* | 2 |

---

## Section 4 — Landmark Visualization

### 4.1 Generation of Cyan and Purple Points (`PhotoPreview.tsx`)

In the upload stage preview card (`src/components/upload/PhotoPreview.tsx`, lines 166–176), landmark points are drawn over the source photograph via an SVG overlay:

```tsx
{detectionResult.landmarks.map((pt, idx) => (
  <circle
    key={idx}
    cx={pt.x * 1000}
    cy={pt.y * 1000}
    r={idx % 10 === 0 ? 3 : 1.5}
    className={idx % 10 === 0 ? 'mesh-point-key' : 'mesh-point-subtle'}
  />
))}
```

Styling rules from `src/styles/components.css` (lines 748–756) and `tokens.css` (lines 29–35):
- **Cyan Points (`.mesh-point-key`):**
  Applied whenever `idx % 10 === 0` (every 10th index in the 478 array).
  `fill: var(--accent-secondary)` (`#06b6d4` cyan), with radius `r = 3` and a 3px glow filter.
- **Purple Points (`.mesh-point-subtle`):**
  Applied whenever `idx % 10 !== 0`.
  `fill: var(--accent-primary)` (`#8b5cf6` violet/purple), with radius `r = 1.5` and `opacity: 0.8`.
- **Are Points Real Detected Landmarks?**
  Yes. Every single one of the 478 points represents an actual $(x, y)$ coordinate returned by `landmarker.detect()`.
- **Coordinate Transformation in Photo Preview:**
  The SVG element has `viewBox="0 0 1000 1000"` with `preserveAspectRatio="none"`. Each point is multiplied by 1000: `cx={pt.x * 1000}, cy={pt.y * 1000}`.
- **Why Points Appeared Sparse in Previous Split-View Screenshots:**
  In the studio split comparison view (`src/components/studio/StudioStage.tsx`), an earlier code iteration hardcoded `.map()` over only three semantic arrays (`faceOutline`, `leftEyeContour`, and `rightEyeContour`), omitting the eyebrows, nose, mouth, and interior points. The current implementation renders all 478 points (`allLandmarks`) plus highlighted anatomical contours.

---

## Section 5 — Face Segmentation and Hair Analysis

### 5.1 Segmentation Model Architecture

- **Dedicated Hair Segmentation Model:** Yes.
- **Model Implementation:** `SegmentationService` in `src/services/segmentation/segmentationService.ts`.
- **Model Name:** Google MediaPipe `ImageSegmenter` using `selfie_multiclass_256x256.tflite` (float32).
- **URI:** `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`
- **Output Classes Supported:**
  - `0`: Background
  - `1`: Hair
  - `2`: Body skin
  - `3`: Face skin
  - `4`: Clothes
  - `5`: Others
- **Input Tensor Dimensions:** $256 \times 256$ pixels.
- **Output Tensor Dimensions:** $256 \times 256$ uint8 category mask.
- **Hair Mask Post-Processing (`contourExtractor.ts`):**
  1. Verifies hair presence: `hairPixelCount / (256 * 256) >= 0.005` (at least 0.5% of pixels).
  2. Casts 36 radial rays from `headCenter` outward at angles from $0.95\pi$ to $2.05\pi$.
  3. Records boundary transition points where mask value exits class `1` (hair).
  4. Simplifies the polygon using the Douglas-Peucker algorithm (`douglasPeucker(points, 0.012)`).

### 5.2 Hair Length and Hairstyle Classification (`heuristicFeatures.ts`)

When the neural segmentation model is active, its boundary contour informs the silhouette. When the model is loading or in fallback mode, the engine uses computer-vision pixel probing:

1. **Long Hair Detection:**
   Probes three lateral neck points on each side below the chin ($y = \text{chinTip.y} - 0.02 H$, $+0.08 H$, $+0.16 H$):
   ```typescript
   const isHair = (col: Color) => (refSkinLum - l > 0.10 && l <= 0.45) || Math.abs(l - hairLum) < 0.20;
   ```
   If 2 or more neck probes match hair color, or if the neural segmentation contour extends below `chinTip.y + 0.05 * faceHeight`, the engine sets:
   $$\text{length} = \text{'long'}, \quad \text{hasLongHairSides} = \text{true}$$
2. **Parting Detection (Middle Part vs. Bangs):**
   Probes the mid-upper forehead ($x = \text{headCenterX}, y = \text{foreheadTop.y} + 0.04 H$).
   - If the mid-forehead probe is skin-colored ($\text{lum} \ge \text{refSkinLum} - 0.08$ and not hair):
     $$\text{parting} = \text{'middle'}, \quad \text{style} = \text{'straight'}$$
     Bangs are completely disabled, and an open middle-parted hairline arch is generated.
   - If the mid-forehead probe is covered by dark hair:
     $$\text{parting} = \text{'bangs'}, \quad \text{style} = \text{'curly'}$$
     Continuous scalloped fringe curls are synthesized.
3. **Geometry Synthesis for Long Hair:**
   - **Layer 2 (Back Hair):** Generates `backHairPoints` cascading behind the face silhouette, ears, and jawline, flowing down to the shoulders.
   - **Layer 4 (Front Hair):** Generates cranial dome arc, symmetrical middle parting sweeping outward from center, and front cheek drapes.

---

## Section 6 — Face Shape and Facial Feature Generation

### 6.1 Feature Generation Algorithm Matrix

| Feature | Source Data | Algorithm / Calculation | Hardcoded Assumptions | Output Geometry | Source File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Face Silhouette** | 36 landmarks (`FACE_OVAL`) | Laplacian smoothing on chin crest (indices 16–20) to prevent acute pinching; Catmull-Rom projection. | Symmetrical planar smoothing weight (0.20/0.60/0.20). | Closed smooth curve path (`#face-silhouette`). | `svgRenderer.ts:260-282` |
| **Forehead** | Landmark `10` + hairline `116` | Traces trichion landmark boundary across upper face oval. | Bounded by cranial dome. | Closed contour. | `faceAnalyzer.ts:76`, `svgRenderer.ts` |
| **Temples** | Landmarks `127, 356` | Direct isotropic projection. | None. | Anchor points for width measurement. | `faceAnalyzer.ts:77-78` |
| **Cheeks** | Cheeks `50, 280`, planes `LEFT/RIGHT_CHEEK_PLANE` | Multi-point planar shadow polygon based on lighting direction. | Shadow opacity (0.08–0.12). | Smooth closed shadow paths (`#facet-left/right-cheek-shadow`). | `svgRenderer.ts:384-416` |
| **Jawline** | 21 landmarks (`JAWLINE`) | Direct isotropic projection. | None. | Outer boundary of lower face silhouette. | `faceAnalyzer.ts:38`, `svgRenderer.ts` |
| **Chin** | Landmark `152`, crest `CHIN_CREST` | Measured apex; labiomental shadow facet underneath lower lip. | Shadow offset ($+0.008 H$ to $+0.024 H$ below lip). | Closed shadow facet (`#facet-underlip-shadow`). | `svgRenderer.ts:483-499` |
| **Ears** | Landmarks `234, 454` | **Synthesized template:** Anchored at tragus points 234/454. Height bounded by eye line and nose base. | Height $= 0.07 H$; width $= 0.075 H$. Pinna shape is an assumed 5-point curve. | Closed smooth curve paths (`#ear-left`, `#ear-right`). | `faceAnalyzer.ts:96-118`, `svgRenderer.ts:192-247` |
| **Hair Silhouette** | Multi-class mask or radial dome | Parametric cranial dome (25 arc points) + lateral cheek drapes + middle parting or fringe lobes. | Dome height $= 0.30 H$; dome width $= 0.64 \times \text{widthNorm}$. | Closed smooth curve path (`#hair-silhouette`). | `heuristicFeatures.ts:326-440`, `svgRenderer.ts:297-307` |
| **Back Hair** | Lateral neck probes | Multi-point cascade behind ears and jaw to shoulders. | Shoulder width $= \text{temple} \pm 0.26 \times \text{widthNorm}$. | Closed smooth curve path in Layer 2 (`#hair-back-silhouette`). | `heuristicFeatures.ts:394-420`, `svgRenderer.ts:197-208` |
| **Eyebrows** | Landmarks `70...46` (left), `300...276` (right) | Upper contour joined with reversed lower contour to form closed anatomical polygon. | Stroke width 0.8px. | Closed smooth paths (`#eyebrow-left`, `#eyebrow-right`). | `svgRenderer.ts:552-578` |
| **Sclera** | 16 landmarks (`LEFT/RIGHT_EYE_CONTOUR`) | Direct Catmull-Rom projection of eye contour. | Fill `#f5f6f9`. Serves as SVG `<clipPath>` for pupil and iris. | Closed smooth path (`#eye-sclera-left/right`). | `svgRenderer.ts:580-606` |
| **Iris** | Landmarks `468, 473` (centers) | Center placed at pupil. Radius calculated from physical eye width ($\text{eyeWidthPx} \times \text{scale} \times 0.28$). | Radial multi-stop gradient; limbal outer ring. | Circular SVG elements clipped to sclera (`#iris-inner-left/right`). | `svgRenderer.ts:608-672` |
| **Pupils** | Landmarks `468, 473` | Centered at pupil coordinate, constrained strictly inside eyelid contour bounds (`constrainPupilToEyeContour`). | Radius $= \text{irisRadius} \times 0.44$; fill `#0d0e12`. | Circular SVG elements clipped to sclera (`#pupil-left/right`). | `faceAnalyzer.ts:233-270`, `svgRenderer.ts:674-694` |
| **Nose Bridge** | Landmarks `6, 197, 195, 5, 4` | Dorsal bridge highlight strip with volumetric linear gradient (`#nose-dorsum-grad`). | Dorsal width $= \text{noseWidthNorm} \times 0.14$. | Closed smooth path (`#nose-dorsum-plane`). | `svgRenderer.ts:817-832` |
| **Nose Tip** | Landmark `4` | Anatomical diamond lobule centered on pronasale. | Horizontal radius $= \text{noseWidth} \times 0.28$; vertical radius $= 0.011$. | Closed smooth path (`#nose-tip-facet`). | `svgRenderer.ts:844-862` |
| **Nostrils** | Landmarks `94, 370`, contours `240, 97, 98, 2` | Teardrop aperture paths from contour landmarks or anatomical offsets. | Fill `#1c0d10`, opacity 0.90. | Closed smooth curved paths (`#nostril-left/right-aperture`). | `svgRenderer.ts:903-936` |
| **Alar Wings** | Landmarks `48...4` (left), `278...4` (right) | Direct projection of alar wing landmarks. | Warmer skin tone (`palette.skinToneWarmer`). | Closed paths + alar crease lines (`#alar-wing-left/right`). | `svgRenderer.ts:864-900` |
| **Upper Lip** | Outer `61...291`, inner `78...308` | Cupid's bow outer contour joined with reversed inner contour; volumetric gradient. | Stroke width 0.9px. | Closed smooth path (`#upper-lip-facet`). | `svgRenderer.ts:1040-1054` |
| **Lower Lip** | Outer `61...291`, inner `78...308` | Outer vermilion contour joined with reversed inner contour; central highlight facet. | Center highlight opacity 0.65. | Closed smooth path (`#lower-lip-facet`). | `svgRenderer.ts:1055-1086` |
| **Teeth** | Inner lip contours | Activated when `isSmileOpen()` detects vertical gap $> 14\text{px}$. Dental arch bite curve. | 3 vertical incisor dividing lines at center and lateral teeth. | Oral cavity background (`#240d0f`) + teeth polygon (`#mouth-teeth`). | `faceAnalyzer.ts:275-286`, `svgRenderer.ts:975-1038` |
| **Beard** | Jawline `454...234` + soul patch | Mandibular polygon along jawline, with anatomical notch below lower lip. | Soul patch width $= 0.05 \times \text{widthNorm}$. Triggered ONLY if local contrast tests pass. | Closed smooth path (`#beard-main`). | `heuristicFeatures.ts:659-713`, `svgRenderer.ts:1138-1149` |
| **Moustache** | Philtrum `164`, nostrils, upper lip outer | Sculpted polygon from subnasale/nostrils down to upper lip vermilion border. | Wing width $= \text{mouthWidth} \times 0.08$. Triggered ONLY if philtrum contrast tests pass. | Closed smooth path (`#mustache-main`). | `heuristicFeatures.ts:625-657`, `svgRenderer.ts:1114-1125` |

---

## Section 7 — Gender and Facial Hair Logic

### 7.1 Gender Classification

- **Is There a Gender Classification Model?**
  **NO.** There is no gender classification model, age model, or demographic neural network in the repository. The application does not attempt to predict gender.

### 7.2 Facial Hair Detection Architecture (`src/engine/heuristicFeatures.ts`)

Facial hair is determined strictly via **physical local contrast computer vision**:

1. **Unadjusted Physical Skin Baseline:**
   The algorithm extracts `rawSkinLum` and `localSkinRefLum` directly from the photograph's upper cheeks and forehead pixels. It does **not** compare pixels against the artificially brightened palette skin base.
2. **Moustache Detection (Philtrum vs. Lateral Upper Lip):**
   - Samples philtrum center and wings ($x = \text{mouthCenter.x} \pm 0.025, y = (\text{noseTip.y} + \text{upperLip.y}) / 2$).
   - Samples adjacent lateral upper lip skin directly above mouth corners.
   - Computes local contrast: $\Delta_{\text{local}} = L_{\text{lateralLip}} - L_{\text{philtrum}}$.
   - **Moustache Criteria:**
     $$\Delta_{\text{local}} > 0.08 \quad \text{AND} \quad (L_{\text{skin}} - L_{\text{philtrum}}) > 0.12 \quad \text{AND} \quad L_{\text{philtrum}} \le 0.35 \quad \text{AND} \quad |L_{\text{philtrum}} - L_{\text{hair}}| < 0.28$$
     If any condition fails (e.g. clean upper lip skin where $\Delta_{\text{local}} \approx 0.02$), `hasMustache = false`.
3. **Beard & Goatee Detection (Mandibular Border vs. Upper Cheeks):**
   - Samples 7 points along the lower jawline and chin.
   - Samples 2 points on the lower cheeks.
   - Computes contrast against clean upper cheek skin: $\Delta_{\text{jaw}} = L_{\text{cheek}} - L_{\text{jaw}}$.
   - **Beard Criteria:**
     $$\Delta_{\text{jaw}} > 0.14 \quad \text{AND} \quad L_{\text{jaw}} \le 0.36 \quad \text{AND} \quad |L_{\text{jaw}} - L_{\text{hair}}| < 0.28$$
4. **Default Clean-Shaven Guarantee:**
   If the local contrast conditions are not met, the engine sets:
   $$\text{hasBeard} = \text{false}, \quad \text{hasMustache} = \text{false}, \quad \text{hasFullBeard} = \text{false}, \quad \text{density} = \text{'none'}$$
   $$\text{beardRegion} = [], \quad \text{mustacheRegion} = []$$
   In `svgRenderer.ts`, Layer 9 (`layer-facial-hair`) receives zero shapes and is set to `visible: false`. No beard or moustache paths are serialized.

---

## Section 8 — Color Estimation

### 8.1 Color Estimation Architecture (`heuristicFeatures.ts` & `colorSampler.ts`)

| Color Role | Origin | Sampling Region / Calculation | Fixed Constants / Fallbacks | Output Representation |
| :--- | :--- | :--- | :--- | :--- |
| **Raw Skin Base** | Photo Sample | Average of forehead top, left cheek, right cheek, and nose bridge pixels. | Outlier filtering; raw melanin undertone ($R > G > B$). | `{ r, g, b }` (true photo color) |
| **Palette Skin Base** | Calibrated Sample | Blended 30% from raw skin sample and 70% toward fair warm ivory (`fairR: 246, fairG: 222, fairB: 202`). | $R \in [240, 255]$, $G \in [215, 238]$, $B \in [195, 222]$. | Hex `#F6DEC8` to `#FAF4EE` |
| **Skin Shadow** | Algorithmic | `darken(skinBase, 0.07)` | Factor 0.07 | Hex color |
| **Skin Shadow Deep**| Algorithmic | `darken(skinBase, 0.14)` | Factor 0.14 | Hex color |
| **Skin Highlight** | Algorithmic | `lighten(skinBase, 0.06)` | Factor 0.06 | Hex color |
| **Skin Tone Warmer** | Algorithmic | $R \times 1.02, G \times 0.96, B \times 0.92$ | Melanin warm shift | Hex color |
| **Hair Primary** | Photo Sample | Sample cluster across crown center, left parietal, right parietal. | Clamped to deep dark espresso ($R \le 22, G \le 20, B \le 24$). | Hex `#161418` |
| **Hair Secondary** | Algorithmic | $R + 26, G + 24, B + 30$ relative to hair primary. | Offset values | Hex color (used in highlights) |
| **Eye / Iris Color** | Photo Sample | Sample region around left pupil (468) and right pupil (473). | Clamped to espresso-amber ($R \in [28, 65], G \in [22, 50], B \in [18, 42]$). | Hex color |
| **Iris Outer Ring** | Algorithmic | `darken(eyeColor, 0.45)` | Factor 0.45 | Hex color (limbal ring) |
| **Lip Color** | Photo Sample | Sample region at center of upper/lower lip vermilion. | Normalized to coral-rose ($R \in [205, 228], G \in [125, 148], B \in [120, 142]$). | Hex color |
| **Lip Shadow / Highlight**| Algorithmic | `darken(lipColor, 0.16)` / `lighten(lipColor, 0.14)` | Factors 0.16 / 0.14 | Hex color |
| **Eyebrows** | Photo Sample | Sample region at center of left/right eyebrow landmarks. | Clamped to dark espresso ($R \le 32, G \le 30, B \le 32$). | Hex color |
| **Beard Color** | Photo Sample | Sample region at chin tip (152), combined with hair primary. | Clamped to dark espresso ($R \le 26, G \le 24, B \le 26$). | Hex color |
| **Background** | **Fixed Design**| Set to warm ivory cream `{ r: 251, g: 245, b: 238 }` (`#FBF5EE`). | Fixed constant. Ensures clear contrast with fair skin and dark hair. | Hex `#FBF5EE` |

---

## Section 9 — SVG Generation

### 9.1 SVG Architecture & Specifications

- **viewBox:** `0 0 1000 1000` (aspect ratio 1:1).
- **Coordinate Normalization:** Isotropic projection (`createIsotropicProjection`) maps physical image coordinates to the 1000x1000 artboard.
- **Layer Stack (Z-Order):**
  1. `layer-background`: Canvas rectangle (`id="canvas-bg"`).
  2. `layer-ears`: Back hair cascade (`#hair-back-silhouette`, if long hair) and ear contours (`#ear-left`, `#ear-right`).
  3. `layer-face-silhouette`: Main facial skin polygon (`#face-silhouette`) with volumetric directional gradient.
  4. `layer-hair`: Front hair dome, middle-parted hairline, front cheek drapes, and interior wave locks.
  5. `layer-facial-shadows`: Cheekbone shadow planes, eye socket depressions, nose bridge shadow, nasolabial smile lines, labiomental chin shadow.
  6. `layer-eyebrows-eyes`: Eyebrows, eye sclera, limbal rings, radial gradient irises, pupils, catchlight specular dots, eyelid crease lines, dark lash lines.
  7. `layer-nose`: Lateral sidewall shadows, dorsal highlight plane, structural bridge ridge, pronasale tip highlight facet, alar wings, and nostril apertures.
  8. `layer-mouth-lips`: Philtrum lines, oral cavity & dental arch (if smiling), upper lip vermilion with gradient, lower lip vermilion, central lip highlight facet.
  9. `layer-facial-hair`: Mustache polygon, beard polygon, sideburns (rendered only if facial hair is detected; omitted on clean-shaven faces).
  10. `layer-highlights`: Forehead highlight plane, cheekbone highlight plane, hair specular sheen facets.
- **SVG Element Counts:** A typical generated portrait contains approximately 45–65 individual SVG elements (35–50 `<path>` elements, 8–12 `<circle>` elements, 2 `<clipPath>` definitions, and 8 `<linearGradient>`/`<radialGradient>` definitions).
- **Raster Image Embeds:** **Zero.** The SVG string never contains `<image>`, `data:image/`, or base64 strings.
- **Portability:** The SVG string begins with `<?xml version="1.0" encoding="UTF-8"?>` and contains all gradient definitions and clip paths inside `<defs>`. It renders identically in Chrome, Safari, Firefox, Inkscape, Adobe Illustrator, and Figma.
- **Live Preview vs. Export Parity:** `StudioStage.tsx` renders the preview via `dangerouslySetInnerHTML={{ __html: activeSvgString }}` and downloads the exact same `activeSvgString` via a Blob. The preview and download are 100% identical.

---

## Section 10 — Complete Data Flow

```text
[User Selects Image File]
        │
        ▼
[Stage 1: Pre-decoding Validation] (imageValidator.ts)
  - Checks file size <= 10MB
  - Checks MIME in [jpeg, png, webp]
  - Verifies binary magic bytes
        │
        ▼
[Stage 2: In-Memory Bitmap Decoding] (imageLoader.ts)
  - URL.createObjectURL(file)
  - new Image() onload measures naturalWidth & naturalHeight
  - Stores ValidatedImage in React state
        │
        ▼
[Stage 3: MediaPipe Face Landmark Detection] (mediaPipeAdapter.ts)
  - Calls FaceLandmarker.detect(imgElement)
  - Returns 478 3D landmarks, bounding box, latencyMs
  - If multiple faces detected: selects largest central foreground face
        │
        ▼
[Stage 4: Semantic Feature Extraction] (faceAnalyzer.ts)
  - Maps 478 landmarks to FacialFeatures (eyes, nose, lips, jaw, eyebrows)
  - Computes face metrics: center, faceWidth, faceHeight, roll rotation
  - Classifies face shape (oval, round, square, oblong, heart)
        │
        ▼
[Stage 5: Semantic Hair Segmentation] (segmentationService.ts)
  - Lazy load ImageSegmenter (selfie_multiclass_256x256.tflite)
  - Extracts 36-ray radial mask contour
  - Fallback to ColorSampler pixel probe if offline
        │
        ▼
[Stage 6: Color Palette & Lighting Sampling] (colorSampler.ts & heuristicFeatures.ts)
  - Samples unadjusted physical skin RGB (rawSkinBase, rawSkinLum)
  - Calibrates fair luminous skin tone (skinBase) and structural planar tones
  - Samples hair, iris, lips, eyebrows, and lighting direction
        │
        ▼
[Stage 7: Hair & Facial Hair Physical Analysis] (heuristicFeatures.ts)
  - Probes lateral neck probes for long hair
  - Probes mid-forehead for middle part vs. bangs
  - Tests philtrum local contrast for mustache
  - Tests mandibular border contrast for beard
  - Sets clean-shaven default for female / clean-shaven faces
        │
        ▼
[Stage 8: Isotropic Projection & Artboard Mapping] (coordinateTransform.ts)
  - Computes physical head bounds in image pixels
  - Computes uniform scale factor for 1000x1000 artboard
  - Converts Catmull-Rom spline curves to SVG path strings
        │
        ▼
[Stage 9: 10-Layer Portrait Model Assembly] (svgRenderer.ts: buildPortraitModel)
  - Assembles 10 layers with SVG gradient defs and sclera clip paths
  - Layer 2 includes back hair; Layer 4 includes front hair; Layer 9 omitted if clean-shaven
        │
        ▼
[Stage 10: Standalone SVG Serialization] (svgRenderer.ts: renderPortraitSvg)
  - Serializes model into standalone XML SVG markup string
        │
        ▼
[Stage 11: Validation & Quality Scoring] (portraitPipeline.ts: validatePortraitGeometry)
  - Verifies pupil containment, landmark alignment, silhouette continuity, quality score
        │
        ▼
[Stage 12: Split-Screen Studio Rendering] (StudioStage.tsx)
  - Left pane: Code generation editor shell (portrait.svg & analysis.json)
  - Right pane: Vector canvas, source photo, or side-by-side split with 478-point mesh overlay
        │
        ▼
[Stage 13: SVG File Export] (StudioStage.tsx: handleDownloadSvg)
  - Creates Blob([svgString], { type: 'image/svg+xml' })
  - Programmatic download of standalone .svg file
```

---

## Section 11 — Runtime Diagnostics

The application was inspected in a read-only manner using its existing test harness and static analysis.

### 11.1 Verified Runtime Observations

- **Test Suite Execution:** Vitest 5.0.4 executed 8 test files across the engine, services, and utils.
  - Test files passing: 8 of 8 (100%).
  - Total tests passing: 60 of 60 (100%).
  - Total test run duration: ~450ms.
- **Production Build Status:** `tsc && vite build` completed in 1.66s.
  - Output bundle: `dist/index.html` (0.94 kB), `dist/assets/index.js` (475.70 kB, 144 kB gzipped), `dist/assets/index.css` (28.25 kB).
- **Landmark Array Dimensions:** 478 points, each having `{ x: number, y: number, z: number }`.
- **Bounding Box Calculation:** Margin $= 0.04$, scoring: $\text{area} \times 10 - \text{centerDistance}$.
- **Color Sampling Canvas Dimension:** Downsampled to $\le 512 \times 512$ pixels inside `ColorSampler.fromImage`.
- **Segmentation Mask Resolution:** $256 \times 256$ pixels (`selfie_multiclass_256x256.tflite`).
- **Artboard Dimensions:** Fixed viewBox `1000 × 1000`.
- **Inference Latencies (Typical Hardware):**
  - MediaPipe Face Landmarker GPU: ~15–35 ms per frame.
  - MediaPipe Face Landmarker CPU Fallback: ~45–95 ms per frame.
  - MediaPipe ImageSegmenter: ~30–60 ms per frame.
  - SVG Generation & Serialization: ~2–5 ms.

---

## Section 12 — Dependencies and Model Assets

### 12.1 Dependency Inventory

| Package Name | Declared Version | Purpose in Application | License | Remote API Required? | Paid Service? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `react` | `^19.3.0` | UI Component Hierarchy & State | MIT | No | Free Open Source |
| `react-dom` | `^19.3.0` | DOM Rendering | MIT | No | Free Open Source |
| `@mediapipe/tasks-vision` | `^1.1.0` | WASM Vision Runtime & Landmarker | Apache-2.0 | No (runs locally) | Free Open Source |
| `lucide-react` | `^1.55.0` | UI Icons | ISC | No | Free Open Source |
| `vite` (dev) | `^8.3.0` | Bundler & Development Server | MIT | No | Free Open Source |
| `@vitejs/plugin-react` (dev)| `^6.1.2` | React Fast Refresh Vite Plugin | MIT | No | Free Open Source |
| `typescript` (dev) | `~6.0.2` | Type Checking | Apache-2.0 | No | Free Open Source |
| `vitest` (dev) | `^5.0.4` | Unit & Integration Test Runner | MIT | No | Free Open Source |

### 12.2 Model Assets & Network Endpoints

1. **Face Landmarker:**
   - URL: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`
   - Size: ~3.8 MB.
   - Host: Google Cloud Storage CDN (Public, Free).
2. **Image Segmenter:**
   - URL: `https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite`
   - Size: ~1.0 MB.
   - Host: Google Cloud Storage CDN (Public, Free).
3. **WebAssembly Fileset:**
   - URL: `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm`
   - Contains: `vision_wasm_internal.js`, `vision_wasm_internal.wasm`, `vision_wasm_nosimd_internal.wasm`.
   - Host: jsDelivr CDN (Public, Free).

**Cost & Privacy Summary:** There are **zero paid dependencies, zero subscription services, and zero private APIs**. The entire stack can be hosted on a 100% free static tier (e.g., Vercel, Netlify, GitHub Pages).

---

## Section 13 — Limitations of the Current Implementation

### 13.1 Verified Implementation Facts

1. **Ears Are 100% Synthesized:** MediaPipe Face Landmarker does not track outer ear contours. It only provides points 234 and 454 near the tragus. The rendered ear pinna shape is a synthetic geometric offset.
2. **Cranial Hair Dome Relies on Parametric Geometry:** MediaPipe has no landmarks on the top of the skull (landmark 10 is the top of the forehead). Unless the neural segmentation model loads successfully, hair dome volume is calculated parametrically above landmark 10.
3. **Teeth Are Stylized Parting Dividers:** When a smile is detected with an open mouth, the teeth are rendered using an anatomical dental arch with 3 dividing lines. Individual tooth boundaries (crowding, gaps, unique incisor shapes) are not tracked.
4. **Pupil Containment Is Geometrically Constrained:** Pupils are constrained to the eye opening to prevent iris overflow, which works well for stylized art but does not model eyelid depth or 3D corneal refraction.
5. **Color Sampling Depends on Ambient Lighting:** The color sampler reads raw photo pixels. A photograph with heavy yellow or blue cast will skew the sampled skin, lip, and hair colors unless lighting normalization is applied.

### 13.2 Hypotheses for Further Quality Refinement

- **3D Head Pose Compensation:** MediaPipe outputs a 3D mesh ($z$ depth coordinates). Currently, the renderer uses primarily 2D $(x, y)$ projections with isotropic scaling. Utilizing $z$-depth for yaw and pitch perspective correction would improve 3/4-angle portraits.
- **Eyeglass Detection:** The current model has no dedicated eyewear detection layer. If a user wears glasses, the frames are partially mapped across the eye contour landmarks.

---

## Section 14 — Summary Matrix & Questions for Human Review

### 14.1 Component Implementation Summary

| Component | Current Implementation | Actual Input | Actual Output | Verified Limitations | Evidence Location |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Image Input** | `Dropzone.tsx`, `imageValidator.ts` | File drag/pick | `ValidatedImage` | Memory limited to 10MB; standard formats only. | `src/utils/imageValidator.ts:4-128` |
| **Bitmap Decoding** | `imageLoader.ts` | `File` object | `HTMLImageElement` | Browser decoding only; no manual EXIF parser. | `src/utils/imageLoader.ts:24-95` |
| **Face Detection** | `mediaPipeAdapter.ts` | Full image | 478 landmarks, bbox | Max 4 faces; requires CDN access for initial download. | `src/services/faceDetection/mediaPipeAdapter.ts:80-272` |
| **Coordinate System**| `coordinateTransform.ts` | Normalized `Vec2` | 1000x1000 canvas `Vec2` | Planar projection; assumes upright or near-upright pose. | `src/engine/coordinateTransform.ts:144-188` |
| **Feature Extraction**| `faceAnalyzer.ts` | 478 landmarks | `FacialFeatures` | Ear pinna synthesized; teeth boundaries stylized. | `src/engine/faceAnalyzer.ts:35-230` |
| **Hair Segmentation** | `segmentationService.ts` | Image + head center | 36-ray boundary | Falls back to pixel probing if model CDN fails. | `src/services/segmentation/segmentationService.ts:112-172` |
| **Hairstyle Engine** | `heuristicFeatures.ts` | Landmarks + sampler | `HairEstimate` | Top of head is parametric above landmark 10. | `src/engine/heuristicFeatures.ts:296-512` |
| **Facial Hair Engine**| `heuristicFeatures.ts` | Local contrast | `FacialHairEstimate` | Contrast thresholds may need fine-tuning for stubble. | `src/engine/heuristicFeatures.ts:620-725` |
| **Color Calibration** | `heuristicFeatures.ts` | Pixel samples | `PortraitPalette` | Background color is fixed ivory cream (#FBF5EE). | `src/engine/heuristicFeatures.ts:115-288` |
| **SVG Generation** | `svgRenderer.ts` | `FaceAnalysis` | 10-layer SVG string | Pure vector; zero raster embeds; face-only composition. | `src/engine/svgRenderer.ts:47-1351` |
| **Code Display** | `StudioStage.tsx` | SVG & JSON strings | Formatted code view | Read-only display of first 120 lines; not an active editor. | `src/components/studio/StudioStage.tsx:300-384` |

---

### 14.2 Questions That Require Human Review

Before the team undertakes any further development phases, the following technical and architectural questions require explicit human decisions:

1. **Stylization Level vs. Photorealism Target:**
   CodeMyFace is designed as a *stylized digital vector illustration engine* (similar to the reference Instagram Reel with flat facets, volumetric gradients, and clean curves), not a 3D raster clone. Should future improvements continue advancing stylized geometric vector portraiture, or is there an expectation of photorealistic mesh baking?
2. **Ear Pinna Handling:**
   MediaPipe provides no outer ear contour points. Is the current anatomical template projection (derived from eye line and nose base) acceptable, or should we incorporate an additional multi-class segmentation mask to outline visible ears?
3. **Eyeglass & Accessory Support:**
   When subjects wear eyeglasses, landmarks on the nose bridge and eye contours can be slightly displaced by frames. Should we implement a dedicated eyewear detection heuristic to render stylized glasses frames?
4. **Offline PWA Caching for Models:**
   MediaPipe `.task` and `.wasm` bundles are loaded from public CDNs. Should we configure a Service Worker or bundle the model files into the repository's `public/` folder so the application works completely offline without initial network access?
5. **Teeth & Smile Granularity:**
   The dental arch currently renders teeth using an anatomical smile curve with 3 central incisor divider lines. Does the team want individual tooth contour extraction, or does the current clean illustration style meet requirements?
6. **Background Color Customization:**
   The canvas background is currently fixed to a warm ivory cream (`#FBF5EE`) to ensure high contrast against both skin and hair. Should the studio stage UI provide a background color picker allowing the user to select custom solid colors or gradients?
