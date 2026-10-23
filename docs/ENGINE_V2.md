# CodeMyFace — Engine V2 Architecture & Implementation

Engine V2 provides an authentic client-side progressive vector portrait synthesis engine designed for structural likeness, organic facial geometry, and evidence-based color reconstruction.

---

## 🎨 5-Stage Progressive Pipeline

Engine V2 operates as an asynchronous progressive pipeline (`executeProgressivePortraitPipeline`) that yields to the browser event loop between mathematical stages, giving users live progressive visual feedback as their vector portrait is constructed:

1. **Stage 1 — Canonical Normalization & Multi-Pass Analysis (`canonicalFrame.ts`, `landmarkAnalyzer.ts`, `segmentationAnalyzer.ts`)**:
   - Detects landmarks using MediaPipe Face Landmarker (478 3D points).
   - Normalizes facial orientation, roll, and pitch into a standardized 1000×1000 canonical coordinate system.
   - Evaluates multi-class semantic segmentation masks (hair, body skin, face skin, clothes, background) and diagnoses boundary failure modes.

2. **Stage 2 — Dual Silhouette Geometry (`faceGeometry.ts`, `hairGeometry.ts`, `contourCleanup.ts`)**:
   - Constructs anatomical jawline, cheek, and chin contours using zygomatic malar landmark anchors to preserve individual face shape.
   - Reconstructs outer hair volume and silhouette curves with adaptive smoothing.

3. **Stage 3 — Anatomical Feature Geometry (`featureGeometry.ts`, `phase3SvgRenderer.ts`)**:
   - Reconstructs eyes (sclera depth, sampled iris color, pupil, and catchlight specular glints).
   - Derives eyebrows with dynamic arch curvature.
   - Generates nose bridge lines, tip facets, and subtle nostril contours.
   - Constructs lips with Cupid's bow fidelity and smile tension analysis.

4. **Stage 4 — Oklab Color Harmonization & Planar Shading (`paletteExtractor.ts`, `facialHairDetector.ts`, `skinShadingGenerator.ts`, `oklab.ts`)**:
   - Samples skin, hair, and lip color palettes in perceptual Oklab color space to avoid digital posterization.
   - Evidence-based facial hair detection (stubble, full beard, or clean-shaven).
   - Generates directional planar lighting facets across the nose bridge and cheek hollows.

5. **Stage 5 — Progressive SVG Synthesis (`progressiveSvgGenerator.ts`, `progressivePipeline.ts`)**:
   - Assembles clean, layered vector markup with semantic layer IDs.
   - 100% standalone SVG output with zero raster bitmaps or external runtime assets.

---

## 🧪 Verification & Unit Test Suite

Engine V2 is fully verified with 52 automated unit tests across 6 dedicated test suites:

- `src/engine/v2/__tests__/phase1Analysis.test.ts` (11 tests): Canonical framing, normalization math, and segmentation analysis.
- `src/engine/v2/__tests__/phase2Reconstruction.test.ts` (10 tests): Face and hair silhouette reconstruction.
- `src/engine/v2/__tests__/phase3Features.test.ts` (8 tests): Eyes, lips, nose, and eyebrow geometry.
- `src/engine/v2/__tests__/phase4ColorAndStyling.test.ts` (9 tests): Oklab palette extraction, facial hair detection, and planar shading.
- `src/engine/v2/__tests__/phase5ProgressiveConstruction.test.ts` (10 tests): Progressive pipeline execution, stage updates, and SVG assembly.
- `src/engine/v2/__tests__/phase6StudioIntegration.test.ts` (4 tests): Studio parameter reactivity and live styling updates.
