/**
 * CodeMyFace V4 — Three-Tier Architecture & Centralized Settings
 *
 * Implements the 3-Tier Image-to-Code Recreation System:
 * - Tier 1 (High Quality): Closest photographic copy, largest, high SSIM, dedicated skin/hair levels.
 * - Tier 2 (Medium Quality): 40–60% of Tier 1 gzipped bytes, safe compound path merging.
 * - Tier 3 (Low Quality): 10–20% of Tier 1 gzipped bytes, saliency-weighted simplification, 10–12 colors.
 * - Target Size Mode: Adaptive binary search on parameters to meet a specific byte budget within +/-10%.
 */

import { optimizeSvgForExport, optimizeSvgAutoSelect } from './sizeOptimizer/exportOptimizer';
import type { NormalizedLandmark } from '../../services/faceDetection/types';

export type QualityTier = 'tier1' | 'tier2' | 'tier3';

export interface TierConfig {
  id: QualityTier;
  name: string;
  label: string;
  description: string;
  targetGzipRatio: number; // Relative to Tier 1: 1.0 (Tier 1), 0.50 (Tier 2), 0.15 (Tier 3)
  targetColors: number;
  skinColors: number;
  hairColors: number;
  pathOmitBase: number;
  ltres: number;
  qtres: number;
  underlayColors: number;
  underlayBlur: number;
  mergeCompoundPaths: boolean;
  precision: number;
  relativeCommands: boolean;
  saliencyWeighting: boolean;
  blurradius: number;
  blurdelta: number;
}

export const TIER_CONFIGS: Record<QualityTier, TierConfig> = {
  tier1: {
    id: 'tier1',
    name: 'High',
    label: 'High (Tier 1)',
    description: 'Closest match to photograph: dedicated 24 skin and 20 hair tones, fine contours intact.',
    targetGzipRatio: 1.0,
    targetColors: 48,
    skinColors: 24,
    hairColors: 20,
    pathOmitBase: 8,
    ltres: 1.0,
    qtres: 1.0,
    underlayColors: 10,
    underlayBlur: 3,
    mergeCompoundPaths: false,
    precision: 1,
    relativeCommands: true,
    saliencyWeighting: false,
    blurradius: 1,
    blurdelta: 16,
  },
  tier2: {
    id: 'tier2',
    name: 'Medium',
    label: 'Medium (Tier 2)',
    description: 'Balanced 40-60% size reduction with safe compound path merging and preserved contours.',
    targetGzipRatio: 0.50,
    targetColors: 24,
    skinColors: 14,
    hairColors: 12,
    pathOmitBase: 24,
    ltres: 1.0,
    qtres: 1.0,
    underlayColors: 8,
    underlayBlur: 3,
    mergeCompoundPaths: true,
    precision: 1,
    relativeCommands: true,
    saliencyWeighting: false,
    blurradius: 1,
    blurdelta: 16,
  },
  tier3: {
    id: 'tier3',
    name: 'Low',
    label: 'Low (Tier 3)',
    description: 'Ultra-compact 10-20% size with saliency weighting, 10-12 colors, and planar geometry.',
    targetGzipRatio: 0.15,
    targetColors: 12,
    skinColors: 8,
    hairColors: 8,
    pathOmitBase: 48,
    ltres: 1.2,
    qtres: 1.2,
    underlayColors: 6,
    underlayBlur: 4,
    mergeCompoundPaths: true,
    precision: 0,
    relativeCommands: true,
    saliencyWeighting: true,
    blurradius: 2,
    blurdelta: 24,
  },
};

export interface TierExecutionResult {
  tier: QualityTier;
  svgString: string;
  rawBytes: number;
  gzipBytes: number;
  pathCount: number;
  nodeCount: number;
  ssim: number;
  psnr: number;
  colorError: number;
  skinColorError?: number;
  executionTimeMs: number;
}

export interface AllTiersResult {
  tier1: TierExecutionResult;
  tier2: TierExecutionResult;
  tier3: TierExecutionResult;
  selectedTier: QualityTier;
}

/**
 * Computes PSNR (Peak Signal-to-Noise Ratio) between two identical-size RGBA buffers.
 */
export function computePSNR(
  dataA: Uint8ClampedArray | Uint8Array,
  dataB: Uint8ClampedArray | Uint8Array,
  totalPixels: number
): number {
  let mse = 0;
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const dr = dataA[idx] - dataB[idx];
    const dg = dataA[idx + 1] - dataB[idx + 1];
    const db = dataA[idx + 2] - dataB[idx + 2];
    mse += (dr * dr + dg * dg + db * db) / 3;
  }
  mse /= totalPixels;
  if (mse <= 0.0001) return 99.9; // Identical
  return Math.round((10 * Math.log10((255 * 255) / mse)) * 10) / 10;
}

/**
 * Fast estimation or exact calculation of gzipped bytes.
 */
export function estimateGzipBytes(str: string): number {
  try {
    // @ts-ignore
    const zlib = typeof require !== 'undefined' ? require('zlib') : null;
    if (zlib?.gzipSync) {
      const buf = typeof (globalThis as any).Buffer !== 'undefined'
        ? (globalThis as any).Buffer.from(str, 'utf8')
        : new TextEncoder().encode(str);
      return zlib.gzipSync(buf).length;
    }
  } catch (_e) {}
  const raw = new TextEncoder().encode(str).length;
  return Math.round(raw * 0.28);
}

/**
 * Applies saliency weighting to an SVG document.
 * Protects fine facial features from omission while simplifying background micro-paths.
 */
export function applySaliencyWeighting(
  svgString: string,
  landmarks?: NormalizedLandmark[],
  width?: number,
  height?: number,
  minBgAreaPx: number = 64
): string {
  if (!landmarks || landmarks.length === 0 || !width || !height) {
    return svgString;
  }

  // Calculate face bounding box with generous padding
  let minX = 1.0, maxX = 0.0, minY = 1.0, maxY = 0.0;
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.y > maxY) maxY = lm.y;
  }

  const faceBox = {
    x0: Math.max(0, (minX - 0.1) * width),
    x1: Math.min(width, (maxX + 0.1) * width),
    y0: Math.max(0, (minY - 0.15) * height),
    y1: Math.min(height, (maxY + 0.15) * height),
  };

  return svgString.replace(/<path\b([^>]*)\/?>/gi, (match) => {
    // Preserve underlay paths and base rectangle
    if (match.includes('v4-underlay-path') || match.includes('v4-base-rect')) {
      return match;
    }

    const dMatch = match.match(/\bd="([^"]*)"/i);
    if (!dMatch) return match;

    const d = dMatch[1];
    const nums = d.match(/[-+]?\d*\.?\d+/g);
    if (!nums || nums.length < 4) return match;

    let pMinX = Infinity, pMaxX = -Infinity, pMinY = Infinity, pMaxY = -Infinity;
    for (let i = 0; i < nums.length - 1; i += 2) {
      const x = parseFloat(nums[i]);
      const y = parseFloat(nums[i + 1]);
      if (!isNaN(x) && !isNaN(y)) {
        if (x < pMinX) pMinX = x;
        if (x > pMaxX) pMaxX = x;
        if (y < pMinY) pMinY = y;
        if (y > pMaxY) pMaxY = y;
      }
    }

    const boxW = Math.max(0, pMaxX - pMinX);
    const boxH = Math.max(0, pMaxY - pMinY);
    const area = boxW * boxH;

    // Check if path overlaps face bounding box
    const overlapsFace =
      pMaxX >= faceBox.x0 &&
      pMinX <= faceBox.x1 &&
      pMaxY >= faceBox.y0 &&
      pMinY <= faceBox.y1;

    if (!overlapsFace && area < minBgAreaPx) {
      // Omit small background noise path
      return '';
    }

    return match;
  });
}

/**
 * Optimizes SVG export tailored to a specific tier config.
 */
export function optimizeSvgForTier(
  svgString: string,
  tier: QualityTier,
  context?: {
    landmarks?: NormalizedLandmark[];
    width?: number;
    height?: number;
  }
): { svg: string; rawBytes: number; gzipBytes: number; pathCount: number } {
  let processedSvg = svgString;

  if (tier === 'tier3') {
    // Tier 3: Apply saliency weighting first to drop non-facial micro-shapes
    processedSvg = applySaliencyWeighting(
      processedSvg,
      context?.landmarks,
      context?.width,
      context?.height,
      64
    );

    processedSvg = optimizeSvgForExport(processedSvg, {
      mergeCompoundPaths: true,
      relativeCommands: true,
      precision: 0,
      shortHex: true,
      stripWhitespace: true,
      removeRedundantStrokes: true,
    });
  } else if (tier === 'tier2') {
    // Tier 2: Safe compound path merging + 1 decimal precision
    processedSvg = optimizeSvgForExport(processedSvg, {
      mergeCompoundPaths: true,
      relativeCommands: true,
      precision: 1,
      shortHex: true,
      stripWhitespace: true,
      removeRedundantStrokes: true,
    });
  } else {
    // Tier 1: Auto-select relative vs absolute for smallest lossless compression
    const auto = optimizeSvgAutoSelect(processedSvg, {
      mergeCompoundPaths: false,
      shortHex: true,
      stripWhitespace: true,
      removeRedundantStrokes: true,
    });
    processedSvg = auto.svg;
  }

  const rawBytes = new TextEncoder().encode(processedSvg).length;
  const gzipBytes = estimateGzipBytes(processedSvg);
  const pathMatches = processedSvg.match(/<path\b[^>]*\/?>/gi) || [];

  return {
    svg: processedSvg,
    rawBytes,
    gzipBytes,
    pathCount: pathMatches.length,
  };
}

export interface TargetSizeResult {
  targetGzipBytes: number;
  actualGzipBytes: number;
  actualRawBytes: number;
  svgString: string;
  pathCount: number;
  params: {
    precision: number;
    mergeCompoundPaths: boolean;
    saliencyMinArea: number;
  };
  iterations: number;
  withinTolerance: boolean;
}

/**
 * Binary search over tier parameters to hit a user-specified byte budget within +/-10%.
 */
export function binarySearchTargetSize(
  baseSvg: string,
  targetGzipBytes: number,
  context?: {
    landmarks?: NormalizedLandmark[];
    width?: number;
    height?: number;
  }
): TargetSizeResult {
  const tolerance = targetGzipBytes * 0.10;
  const minTarget = targetGzipBytes - tolerance;
  const maxTarget = targetGzipBytes + tolerance;

  let bestSvg = baseSvg;
  let bestGzip = estimateGzipBytes(baseSvg);
  let bestParams = { precision: 1, mergeCompoundPaths: false, saliencyMinArea: 0 };
  let bestDiff = Math.abs(bestGzip - targetGzipBytes);

  // Parameter space exploration (fast discrete step evaluations)
  const candidateParams = [
    { precision: 1, mergeCompoundPaths: false, saliencyMinArea: 0 },
    { precision: 1, mergeCompoundPaths: true, saliencyMinArea: 0 },
    { precision: 1, mergeCompoundPaths: true, saliencyMinArea: 32 },
    { precision: 0, mergeCompoundPaths: true, saliencyMinArea: 48 },
    { precision: 0, mergeCompoundPaths: true, saliencyMinArea: 96 },
    { precision: 0, mergeCompoundPaths: true, saliencyMinArea: 160 },
  ];

  let iterations = 0;
  for (const p of candidateParams) {
    iterations++;
    let candidateSvg = baseSvg;
    if (p.saliencyMinArea > 0 && context?.landmarks && context.width && context.height) {
      candidateSvg = applySaliencyWeighting(
        candidateSvg,
        context.landmarks,
        context.width,
        context.height,
        p.saliencyMinArea
      );
    }

    candidateSvg = optimizeSvgForExport(candidateSvg, {
      mergeCompoundPaths: p.mergeCompoundPaths,
      relativeCommands: true,
      precision: p.precision,
      shortHex: true,
      stripWhitespace: true,
      removeRedundantStrokes: true,
    });

    const gz = estimateGzipBytes(candidateSvg);
    const diff = Math.abs(gz - targetGzipBytes);

    if (diff < bestDiff) {
      bestDiff = diff;
      bestGzip = gz;
      bestSvg = candidateSvg;
      bestParams = p;
    }

    if (gz >= minTarget && gz <= maxTarget) {
      break;
    }
  }

  const rawBytes = new TextEncoder().encode(bestSvg).length;
  const pathCount = (bestSvg.match(/<path\b[^>]*\/?>/gi) || []).length;

  return {
    targetGzipBytes,
    actualGzipBytes: bestGzip,
    actualRawBytes: rawBytes,
    svgString: bestSvg,
    pathCount,
    params: bestParams,
    iterations,
    withinTolerance: bestGzip >= minTarget && bestGzip <= maxTarget,
  };
}
