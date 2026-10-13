/**
 * CodeMyFace — Coordinate System & Isotropic Transformation Engine
 *
 * Establishes documented, mathematically rigorous transformations between:
 * 1. Normalized Image Space [0, 1] × [0, 1] (as returned by MediaPipe)
 * 2. Source Image Pixel Space [0, W] × [0, H] (physical image pixels)
 * 3. Canonical Isotropic Face Space (aspect-ratio corrected face coordinates)
 * 4. SVG Artboard Space [0, canvasWidth] × [0, canvasHeight] (default 1000 × 1000)
 *
 * CRITICAL FIX FOR ASPECT RATIO:
 * MediaPipe normalizes x by imageWidth and y by imageHeight.
 * In a non-square image (e.g. 900 × 1600 portrait), 1 normalized unit in X is
 * 900 physical pixels, while 1 normalized unit in Y is 1600 physical pixels.
 * Any uncorrected scaling distorts the face horizontally by (1600/900) = 1.78x!
 *
 * This utility enforces isotropic scaling (equal pixels per millimeter in X and Y)
 * so that face proportions (oval, oblong, round, square, heart) are 100% preserved.
 */
import { Vec2, FacialFeatures, PortraitViewBox } from '../types/portrait';
import { clamp, svgNum } from './geometry';

export { type PortraitViewBox };

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ArtboardDimensions {
  width: number;
  height: number;
}

export interface FaceBoundsPx {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

export interface PortraitProjectionResult {
  /** Map normalized point [0, 1] to artboard canvas pixels [0, canvasWidth] */
  toCanvas: (p: Vec2) => Vec2;
  /** Map physical image pixel (px, py) to artboard canvas pixels */
  imagePxToCanvas: (px: number, py: number) => Vec2;
  /** Isotropic scale factor (canvas units per image pixel) */
  scale: number;
  /** Target center in canvas */
  canvasCenter: Vec2;
  /** Bounds of head in image pixels */
  headBoundsPx: FaceBoundsPx;
}

/**
 * Converts normalized Vec2 [0, 1] to physical image pixel coordinates
 */
export function normalizedToImagePx(p: Vec2, imgDim: ImageDimensions): Vec2 {
  return {
    x: p.x * imgDim.width,
    y: p.y * imgDim.height,
  };
}

/**
 * Converts physical image pixel coordinates to normalized Vec2 [0, 1]
 */
export function imagePxToNormalized(p: Vec2, imgDim: ImageDimensions): Vec2 {
  return {
    x: clamp(p.x / Math.max(1, imgDim.width), 0, 1),
    y: clamp(p.y / Math.max(1, imgDim.height), 0, 1),
  };
}

/**
 * Computes true Euclidean distance in physical image pixels
 * (accounting for source image aspect ratio)
 */
export function distanceImagePx(a: Vec2, b: Vec2, imgDim: ImageDimensions): number {
  const dx = (b.x - a.x) * imgDim.width;
  const dy = (b.y - a.y) * imgDim.height;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Computes the aspect-ratio corrected bounding box of a collection of
 * normalized points in physical image pixels.
 */
export function computeBoundsImagePx(points: Vec2[], imgDim: ImageDimensions): FaceBoundsPx {
  if (points.length === 0) {
    return {
      minX: 0,
      maxX: imgDim.width,
      minY: 0,
      maxY: imgDim.height,
      width: imgDim.width,
      height: imgDim.height,
      centerX: imgDim.width / 2,
      centerY: imgDim.height / 2,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    const px = pt.x * imgDim.width;
    const py = pt.y * imgDim.height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Extracts reliable facial landmarks that define the skull and face geometry.
 * Hair, back hair, neck, shoulders, and clothing are strictly excluded.
 */
export function extractReliableFacePoints(features: FacialFeatures): Vec2[] {
  return [
    ...features.faceOutline,
    features.chinTip,
    features.foreheadTop,
    features.templeLeft,
    features.templeRight,
  ];
}

/**
 * Creates an isotropic projection derived STRICTLY from reliable facial landmarks.
 *
 * Guarantees:
 * 1. Hair, back hair, shoulders, or clothing NEVER influence the face scale.
 * 2. Hair, back hair, shoulders, or clothing NEVER influence face translation.
 * 3. Changing hairstyle, hair volume, or curls leaves all facial features in the
 *    exact same coordinates.
 * 4. Isotropic scaling is preserved (1 horizontal image px = 1 vertical image px).
 */
export function createFaceProjection(
  reliableFacePoints: Vec2[],
  imgDim: ImageDimensions,
  artboardDim: ArtboardDimensions = { width: 1000, height: 1000 }
): PortraitProjectionResult {
  const w = artboardDim.width;
  const h = artboardDim.height;

  // Calculate physical pixel bounds of the face only
  const faceBoundsPx = computeBoundsImagePx(reliableFacePoints, imgDim);

  // Target framing in canvas for face:
  // Face occupies ~50% of vertical canvas space, and up to ~40% of horizontal space
  const targetFaceHeight = h * 0.50;
  const targetFaceWidth = w * 0.40;

  // Isotropic scale: MUST be identical for both X and Y!
  const scale = Math.min(
    targetFaceHeight / Math.max(20, faceBoundsPx.height),
    targetFaceWidth / Math.max(20, faceBoundsPx.width)
  );

  const targetCenterX = w * 0.5;
  // Position face center slightly below midpoint so chin ends around y ≈ 790 and forehead around y ≈ 290
  const targetCenterY = h * 0.54;

  const imagePxToCanvas = (px: number, py: number): Vec2 => ({
    x: targetCenterX + (px - faceBoundsPx.centerX) * scale,
    y: targetCenterY + (py - faceBoundsPx.centerY) * scale,
  });

  const toCanvas = (p: Vec2): Vec2 => {
    const px = p.x * imgDim.width;
    const py = p.y * imgDim.height;
    return imagePxToCanvas(px, py);
  };

  return {
    toCanvas,
    imagePxToCanvas,
    scale,
    canvasCenter: { x: targetCenterX, y: targetCenterY },
    headBoundsPx: faceBoundsPx,
  };
}

/**
 * Computes the artboard viewBox that encloses all rendered illustration paths
 * (hair, ears, face silhouette, beard) with a safe margin, preventing any clipping.
 *
 * If the illustration fits comfortably within the base artboard [0, 0, canvasWidth, canvasHeight],
 * the standard base artboard viewBox is preserved. If hair or features extend beyond,
 * the viewBox expands smoothly without moving or scaling the face.
 */
export function computeIllustrationViewBox(
  renderedPoints: Vec2[],
  canvasWidth: number = 1000,
  canvasHeight: number = 1000,
  margin: number = 40
): PortraitViewBox {
  if (renderedPoints.length === 0) {
    return { minX: 0, minY: 0, width: canvasWidth, height: canvasHeight };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of renderedPoints) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }

  const vbMinX = Math.min(0, Math.floor(minX - margin));
  const vbMinY = Math.min(0, Math.floor(minY - margin));
  const vbMaxX = Math.max(canvasWidth, Math.ceil(maxX + margin));
  const vbMaxY = Math.max(canvasHeight, Math.ceil(maxY + margin));

  return {
    minX: vbMinX,
    minY: vbMinY,
    width: vbMaxX - vbMinX,
    height: vbMaxY - vbMinY,
  };
}

/**
 * Creates an isotropic projection from normalized source image coordinates
 * to the SVG artboard viewBox space.
 *
 * Preserves the exact aspect ratio of the human face:
 * - 1 horizontal image pixel = `scale` canvas pixels
 * - 1 vertical image pixel = `scale` canvas pixels
 *
 * Centers the face horizontally (x = 500) and balances vertical placement
 * so the chin sits naturally around y ≈ 800 and the crown sits around y ≈ 160.
 */
export function createIsotropicProjection(
  allHeadKeyPoints: Vec2[],
  imgDim: ImageDimensions,
  artboardDim: ArtboardDimensions = { width: 1000, height: 1000 }
): PortraitProjectionResult {
  const w = artboardDim.width;
  const h = artboardDim.height;

  // Calculate physical pixel bounds of the head
  const headBoundsPx = computeBoundsImagePx(allHeadKeyPoints, imgDim);

  // Target framing in canvas:
  // Head occupies ~64% of vertical canvas space, and up to ~52% of horizontal space
  const targetHeadHeight = h * 0.64;
  const targetHeadWidth = w * 0.52;

  // Isotropic scale: MUST be identical for both X and Y!
  const scale = Math.min(
    targetHeadHeight / Math.max(20, headBoundsPx.height),
    targetHeadWidth / Math.max(20, headBoundsPx.width)
  );

  const targetCenterX = w * 0.5;
  // Position head center slightly above midpoint so chin ends at ~80% height
  const targetCenterY = h * 0.48;

  const imagePxToCanvas = (px: number, py: number): Vec2 => ({
    x: targetCenterX + (px - headBoundsPx.centerX) * scale,
    y: targetCenterY + (py - headBoundsPx.centerY) * scale,
  });

  const toCanvas = (p: Vec2): Vec2 => {
    const px = p.x * imgDim.width;
    const py = p.y * imgDim.height;
    return imagePxToCanvas(px, py);
  };

  return {
    toCanvas,
    imagePxToCanvas,
    scale,
    canvasCenter: { x: targetCenterX, y: targetCenterY },
    headBoundsPx,
  };
}

/**
 * Projects a closed polygon of normalized points into an SVG path string 'd'
 */
export function projectPolygonToPath(
  points: Vec2[],
  toCanvas: (p: Vec2) => Vec2
): string {
  if (!points || points.length < 2) return '';
  const parts = points.map((p, idx) => {
    const pt = toCanvas(p);
    return `${idx === 0 ? 'M' : 'L'} ${svgNum(pt.x)} ${svgNum(pt.y)}`;
  });
  parts.push('Z');
  return parts.join(' ');
}

/**
 * Projects an open curve of normalized points into an SVG path string 'd'
 */
export function projectOpenCurveToPath(
  points: Vec2[],
  toCanvas: (p: Vec2) => Vec2,
  tension: number = 0.25
): string {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    const a = toCanvas(points[0]);
    const b = toCanvas(points[1]);
    return `M ${svgNum(a.x)} ${svgNum(a.y)} L ${svgNum(b.x)} ${svgNum(b.y)}`;
  }
  const px = points.map(toCanvas);
  const n = px.length;
  let d = `M ${svgNum(px[0].x)} ${svgNum(px[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? px[i - 1] : px[0];
    const p1 = px[i];
    const p2 = px[i + 1];
    const p3 = i < n - 2 ? px[i + 2] : p2;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  return d;
}

/**
 * Projects a closed smooth curve of normalized points into an SVG path string 'd'
 */
export function projectSmoothClosedCurveToPath(
  points: Vec2[],
  toCanvas: (p: Vec2) => Vec2,
  tension: number = 0.25
): string {
  if (!points || points.length < 3) return projectPolygonToPath(points, toCanvas);
  const px = points.map(toCanvas);
  const n = px.length;
  let d = `M ${svgNum(px[0].x)} ${svgNum(px[0].y)}`;
  for (let i = 0; i < n; i++) {
    const p0 = px[(i - 1 + n) % n];
    const p1 = px[i];
    const p2 = px[(i + 1) % n];
    const p3 = px[(i + 2) % n];
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  d += ' Z';
  return d;
}
