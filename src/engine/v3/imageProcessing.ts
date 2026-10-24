/**
 * CodeMyFace V3 — Image Processing and Pixel Analysis
 *
 * Implements high-performance, browser-native computer vision algorithms:
 * - Luminance conversion
 * - Separable 2D Gaussian blur
 * - Sobel directional gradient calculation (magnitude and angle)
 * - Canny edge detection with non-maximum suppression (NMS) and hysteresis
 * - Local region texture analysis (edge density, frequency variance)
 * - Coordinate mapping and aspect-ratio preserving viewport transforms
 */

import { Point2D, Size2D, BoundingBox } from './types';

export interface GradientMap {
  magnitude: Float32Array;
  angle: Float32Array; // in radians [-PI, PI]
  width: number;
  height: number;
}

export interface CannyResult {
  edges: Uint8Array; // 1 = edge, 0 = non-edge
  width: number;
  height: number;
  strongEdgeCount: number;
  totalEdgeCount: number;
}

/**
 * Extracts grayscale luminance buffer from ImageData: Y = 0.299R + 0.587G + 0.114B
 */
export function extractLuminance(imageData: ImageData): Float32Array {
  const { width, height, data } = imageData;
  const lum = new Float32Array(width * height);
  const total = width * height;

  for (let i = 0; i < total; i++) {
    const idx = i * 4;
    lum[i] = (0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]) / 255.0;
  }
  return lum;
}

/**
 * Separable Gaussian blur (5x5 kernel, sigma ≈ 1.4)
 * Kernel weights: [1, 4, 6, 4, 1] / 16
 */
export function gaussianBlur5x5(
  src: Float32Array,
  width: number,
  height: number
): Float32Array {
  const temp = new Float32Array(width * height);
  const dest = new Float32Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const xm2 = Math.max(0, x - 2);
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);
      const xp2 = Math.min(width - 1, x + 2);

      temp[rowOffset + x] =
        (src[rowOffset + xm2] * 1 +
          src[rowOffset + xm1] * 4 +
          src[rowOffset + x] * 6 +
          src[rowOffset + xp1] * 4 +
          src[rowOffset + xp2] * 1) /
        16.0;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    const ym2 = Math.max(0, y - 2) * width;
    const ym1 = Math.max(0, y - 1) * width;
    const y0 = y * width;
    const yp1 = Math.min(height - 1, y + 1) * width;
    const yp2 = Math.min(height - 1, y + 2) * width;

    for (let x = 0; x < width; x++) {
      dest[y0 + x] =
        (temp[ym2 + x] * 1 +
          temp[ym1 + x] * 4 +
          temp[y0 + x] * 6 +
          temp[yp1 + x] * 4 +
          temp[yp2 + x] * 1) /
        16.0;
    }
  }

  return dest;
}

/**
 * Computes directional Sobel gradients (magnitude and angle)
 */
export function computeSobelGradients(
  src: Float32Array,
  width: number,
  height: number
): GradientMap {
  const magnitude = new Float32Array(width * height);
  const angle = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    const yPrev = (y - 1) * width;
    const yCurr = y * width;
    const yNext = (y + 1) * width;

    for (let x = 1; x < width - 1; x++) {
      // Sobel horizontal Gx
      // [-1  0  1]
      // [-2  0  2]
      // [-1  0  1]
      const gx =
        -src[yPrev + x - 1] +
        src[yPrev + x + 1] -
        2.0 * src[yCurr + x - 1] +
        2.0 * src[yCurr + x + 1] -
        src[yNext + x - 1] +
        src[yNext + x + 1];

      // Sobel vertical Gy
      // [-1 -2 -1]
      // [ 0  0  0]
      // [ 1  2  1]
      const gy =
        -src[yPrev + x - 1] -
        2.0 * src[yPrev + x] -
        src[yPrev + x + 1] +
        src[yNext + x - 1] +
        2.0 * src[yNext + x] +
        src[yNext + x + 1];

      const mag = Math.hypot(gx, gy);
      magnitude[yCurr + x] = mag;
      angle[yCurr + x] = Math.atan2(gy, gx);
    }
  }

  return { magnitude, angle, width, height };
}

/**
 * Runs Canny edge detection:
 * 1. Non-Maximum Suppression (NMS) to thin edges
 * 2. Hysteresis double-thresholding with 8-connected flood fill
 */
export function runCannyEdgeDetector(
  blurredLum: Float32Array,
  width: number,
  height: number,
  thresholdLow: number = 0.08,
  thresholdHigh: number = 0.20
): CannyResult {
  const { magnitude, angle } = computeSobelGradients(blurredLum, width, height);
  const nms = new Float32Array(width * height);
  const edges = new Uint8Array(width * height);

  // 1. Non-Maximum Suppression
  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      const mag = magnitude[idx];
      if (mag < thresholdLow) continue;

      // Quantize gradient angle to 4 sectors: 0, 45, 90, 135 deg
      let deg = (angle[idx] * 180) / Math.PI;
      if (deg < 0) deg += 180;

      let q = 0;
      let r = 0;

      if ((deg >= 0 && deg < 22.5) || (deg >= 157.5 && deg <= 180)) {
        // Horizontal gradient -> vertical edge (compare left/right)
        q = magnitude[idx + 1];
        r = magnitude[idx - 1];
      } else if (deg >= 22.5 && deg < 67.5) {
        // Diagonal 45 -> compare top-right and bottom-left
        q = magnitude[idx - width + 1];
        r = magnitude[idx + width - 1];
      } else if (deg >= 67.5 && deg < 112.5) {
        // Vertical gradient -> horizontal edge (compare top/bottom)
        q = magnitude[idx - width];
        r = magnitude[idx + width];
      } else if (deg >= 112.5 && deg < 157.5) {
        // Diagonal 135 -> compare top-left and bottom-right
        q = magnitude[idx - width - 1];
        r = magnitude[idx + width + 1];
      }

      if (mag >= q && mag >= r) {
        nms[idx] = mag;
      }
    }
  }

  // 2. Hysteresis thresholding
  let strongEdgeCount = 0;
  const stack: number[] = [];

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      if (nms[idx] >= thresholdHigh) {
        edges[idx] = 2; // Strong edge
        strongEdgeCount++;
        stack.push(idx);
      } else if (nms[idx] >= thresholdLow) {
        edges[idx] = 1; // Weak candidate
      }
    }
  }

  // 8-connected flood fill to promote weak edges connected to strong edges
  const neighbors = [
    -width - 1, -width, -width + 1,
    -1,                  1,
    width - 1,  width,  width + 1,
  ];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (let n = 0; n < 8; n++) {
      const nIdx = cur + neighbors[n];
      if (edges[nIdx] === 1) {
        edges[nIdx] = 2; // Promoted to strong
        stack.push(nIdx);
      }
    }
  }

  // Clean non-promoted weak edges and binarize
  let totalEdgeCount = 0;
  for (let i = 0; i < width * height; i++) {
    if (edges[i] === 2) {
      edges[i] = 1;
      totalEdgeCount++;
    } else {
      edges[i] = 0;
    }
  }

  return { edges, width, height, strongEdgeCount, totalEdgeCount };
}

/**
 * Calculates edge density (ratio of edge pixels to total pixels) within a bounding box
 */
export function calculateEdgeDensityInRegion(
  edges: Uint8Array,
  width: number,
  height: number,
  bbox: BoundingBox
): number {
  const x0 = Math.max(0, Math.floor(bbox.minX));
  const y0 = Math.max(0, Math.floor(bbox.minY));
  const x1 = Math.min(width - 1, Math.ceil(bbox.maxX));
  const y1 = Math.min(height - 1, Math.ceil(bbox.maxY));

  if (x1 <= x0 || y1 <= y0) return 0;

  let edgeCount = 0;
  let totalCount = 0;

  for (let y = y0; y <= y1; y++) {
    const row = y * width;
    for (let x = x0; x <= x1; x++) {
      if (edges[row + x] === 1) edgeCount++;
      totalCount++;
    }
  }

  return totalCount > 0 ? edgeCount / totalCount : 0;
}

/**
 * Converts image-space point into canonical SVG viewport point preserving aspect ratio
 */
export function mapPointToViewport(
  pt: Point2D,
  srcSize: Size2D,
  targetSize: Size2D,
  padding: number = 40
): Point2D {
  const availW = targetSize.width - 2 * padding;
  const availH = targetSize.height - 2 * padding;
  const scale = Math.min(availW / srcSize.width, availH / srcSize.height);

  const offsetX = padding + (availW - srcSize.width * scale) / 2;
  const offsetY = padding + (availH - srcSize.height * scale) / 2;

  return {
    x: Math.round((offsetX + pt.x * scale) * 10) / 10,
    y: Math.round((offsetY + pt.y * scale) * 10) / 10,
  };
}

/**
 * Generates a diagnostic data URI image from a binary edge map
 */
export function edgeMapToDataUri(edges: Uint8Array, width: number, height: number): string {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  for (let i = 0; i < width * height; i++) {
    const isEdge = edges[i] === 1;
    const idx = i * 4;
    data[idx] = isEdge ? 255 : 18;
    data[idx + 1] = isEdge ? 255 : 22;
    data[idx + 2] = isEdge ? 255 : 30;
    data[idx + 3] = 255;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}
