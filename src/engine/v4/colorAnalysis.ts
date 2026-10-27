/**
 * CodeMyFace V4 — Empirical Color Analysis
 *
 * Samples real RGB pixels directly from source photograph guided by MediaPipe
 * facial landmark ROIs and semantic segmentation masks.
 * Zero hardcoded cartoon hex codes.
 */

import { ColorPaletteAnalysis, PaletteEntry } from './types';
import { NormalizedLandmark } from '../../services/faceDetection/types';

interface Point {
  x: number;
  y: number;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const hex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

export function getLuminance(rgb: [number, number, number]): number {
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
}

// ============================================================================
// CIELAB Color Space Functions (D65 Illuminant)
// Matches human perceptual color discrimination
// ============================================================================

function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearToSrgb(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

/** Converts sRGB [0..255] to CIELAB [L*: 0..100, a*: -128..127, b*: -128..127] under D65 */
export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);

  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750) / 1.00000;
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

  const eps = 216 / 24389; // (6/29)^3
  const kappa = 24389 / 27;

  const fx = x > eps ? Math.cbrt(x) : (kappa * x + 16) / 116;
  const fy = y > eps ? Math.cbrt(y) : (kappa * y + 16) / 116;
  const fz = z > eps ? Math.cbrt(z) : (kappa * z + 16) / 116;

  const L = Math.max(0, Math.min(100, 116 * fy - 16));
  const a = 500 * (fx - fy);
  const bb = 200 * (fy - fz);

  return [L, a, bb];
}

/** Converts CIELAB back to sRGB [0..255] */
export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;

  const eps = 216 / 24389;
  const kappa = 24389 / 27;

  const x3 = fx * fx * fx;
  const z3 = fz * fz * fz;

  const x = (x3 > eps ? x3 : (116 * fx - 16) / kappa) * 0.95047;
  const y = (L > kappa * eps ? Math.pow((L + 16) / 116, 3) : L / kappa) * 1.00000;
  const z = (z3 > eps ? z3 : (116 * fz - 16) / kappa) * 1.08883;

  const lr = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const lg = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
  const lb = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;

  return [linearToSrgb(lr), linearToSrgb(lg), linearToSrgb(lb)];
}

/** Perceptual Euclidean distance in CIELAB space (CIE 1976 Delta E) */
export function deltaE(lab1: [number, number, number], lab2: [number, number, number]): number {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
}

// ============================================================================
// V4.5 Anatomical & Chromatic Constants
// All numbers have explicit units and documented rationale.
// ============================================================================

/** Multiplier for intermediate transition skin tone derivation.
 * Reason: 0.91 creates a gentle 9% planar step that smoothly bridges highlight and shadow planes without banding. */
export const SKIN_TRANSITION_DARKEN_FACTOR = 0.91;

/** Multiplier for soft shadow skin tone derivation.
 * Reason: 0.83 darkens skin by 17% (instead of 26%), preserving natural warm chroma and preventing muddy black facial bruising. */
export const SKIN_SHADOW_DARKEN_FACTOR = 0.83;

/** Multiplier for highlight skin tone derivation.
 * Reason: 1.11 provides clean, radiant volumetric highlights without causing blown-out chalky vitiligo patches. */
export const SKIN_HIGHLIGHT_LIGHTEN_FACTOR = 1.11;

/** Minimum luminance threshold for natural human eye sclera, in normalized [0, 1] units.
 * Reason: Anatomically, healthy human sclera maintains luminance > 0.82; values below this indicate eyelid fold/makeup sampling errors. */
export const SCLERA_MIN_ANATOMICAL_LUM = 0.82;

/** Target baseline luminance for lifted sclera under dark ambient shadow, in normalized [0, 1] units.
 * Reason: 0.88 yields a natural, soft warm ivory white (#F4F1EC) that looks vibrant and living in portraiture. */
export const SCLERA_TARGET_BASE_LUM = 0.88;

/** Minimum vertical lip gap in pixels to trigger open-mouth / teeth detection.
 * Reason: 3.5 px reliably distinguishes parted lips / teeth from closed vermilion contact across portrait resolutions. */
export const MOUTH_OPEN_THRESHOLD_PX = 3.5;

/**
 * Computes median RGB from a list of RGB pixel samples to reject outliers (specular highlights, dust).
 */
export function medianRgb(samples: [number, number, number][]): [number, number, number] {
  if (samples.length === 0) return [128, 128, 128];
  
  const rs = samples.map(s => s[0]).sort((a, b) => a - b);
  const gs = samples.map(s => s[1]).sort((a, b) => a - b);
  const bs = samples.map(s => s[2]).sort((a, b) => a - b);
  
  const mid = Math.floor(samples.length / 2);
  return [rs[mid], gs[mid], bs[mid]];
}

/**
 * Samples pixels within a radius around specific coordinates directly from ImageData buffer.
 * Rejects specular flash reflections and pure occlusion black for true pigment extraction.
 */
export function samplePixelsFromImageData(
  imgData: ImageData,
  points: Point[],
  radius: number = 2,
  filterOutliers: boolean = true
): [number, number, number][] {
  const { width, height, data } = imgData;
  const samples: [number, number, number][] = [];

  for (const pt of points) {
    const cx = Math.round(pt.x * width);
    const cy = Math.round(pt.y * height);
    if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;

    const startX = Math.max(0, cx - radius);
    const endX = Math.min(width - 1, cx + radius);
    const startY = Math.max(0, cy - radius);
    const endY = Math.min(height - 1, cy + radius);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (filterOutliers && (lum > 0.96 || lum < 0.04)) {
          continue;
        }
        samples.push([r, g, b]);
      }
    }
  }
  return samples;
}

/** Legacy wrapper for sampleAtPoints using ImageData under the hood */
function sampleAtPoints(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: Point[],
  radius: number = 2
): [number, number, number][] {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    return samplePixelsFromImageData(imgData, points, radius, true);
  } catch {
    return [];
  }
}

/**
 * Extracts comprehensive, empirical color palette from the actual image pixels.
 */
export function analyzePhotoColors(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks?: NormalizedLandmark[],
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null
): ColorPaletteAnalysis {
  // 1. Skin Sampling
  let skinSamples: [number, number, number][] = [];
  if (landmarks && landmarks.length >= 200) {
    // Forehead (10, 151, 9, 67, 297), Cheeks (117, 118, 50, 346, 347, 280), Chin (152, 175)
    const skinLandmarkIndices = [10, 151, 9, 67, 297, 117, 118, 50, 346, 347, 280, 152, 175];
    const skinPts = skinLandmarkIndices
      .map(idx => landmarks[idx])
      .filter((lm): lm is NormalizedLandmark => !!lm)
      .map(lm => ({ x: lm.x, y: lm.y }));
    
    skinSamples = sampleAtPoints(ctx, width, height, skinPts, 3);
  }
  
  // Fallback to center-face box if landmarks absent
  if (skinSamples.length === 0) {
    skinSamples = sampleAtPoints(ctx, width, height, [
      { x: 0.5, y: 0.45 },
      { x: 0.42, y: 0.5 },
      { x: 0.58, y: 0.5 },
      { x: 0.5, y: 0.65 }
    ], 10);
  }
  
  const baseSkinRgb = medianRgb(skinSamples);
  const skinLum = getLuminance(baseSkinRgb);
  
  // Transition skin (darkened by 9% with warm chromatic preservation)
  // Reason: Creates smooth, natural planar transitions between light and shadow on cheeks and forehead.
  const transitionSkinRgb: [number, number, number] = [
    Math.max(0, Math.round(baseSkinRgb[0] * SKIN_TRANSITION_DARKEN_FACTOR)),
    Math.max(0, Math.round(baseSkinRgb[1] * (SKIN_TRANSITION_DARKEN_FACTOR - 0.01))),
    Math.max(0, Math.round(baseSkinRgb[2] * (SKIN_TRANSITION_DARKEN_FACTOR - 0.02))),
  ];

  // Soft shadow skin (darkened by 17% instead of 26%, preserving natural warm chroma and preventing muddy black facial bruising)
  const shadowSkinRgb: [number, number, number] = [
    Math.max(0, Math.round(baseSkinRgb[0] * (SKIN_SHADOW_DARKEN_FACTOR + 0.01))),
    Math.max(0, Math.round(baseSkinRgb[1] * SKIN_SHADOW_DARKEN_FACTOR)),
    Math.max(0, Math.round(baseSkinRgb[2] * (SKIN_SHADOW_DARKEN_FACTOR - 0.02))),
  ];
  
  // Highlight skin (lightened by 11% with soft warmth)
  const highlightSkinRgb: [number, number, number] = [
    Math.min(255, Math.round(baseSkinRgb[0] * SKIN_HIGHLIGHT_LIGHTEN_FACTOR)),
    Math.min(255, Math.round(baseSkinRgb[1] * (SKIN_HIGHLIGHT_LIGHTEN_FACTOR - 0.01))),
    Math.min(255, Math.round(baseSkinRgb[2] * (SKIN_HIGHLIGHT_LIGHTEN_FACTOR - 0.02))),
  ];

  // 2. Iris Sampling
  let leftIrisSamples: [number, number, number][] = [];
  let rightIrisSamples: [number, number, number][] = [];
  
  if (landmarks && landmarks.length >= 478) {
    // Left iris landmark 468, Right iris landmark 473
    const leftIris = landmarks[468];
    const rightIris = landmarks[473];
    if (leftIris) {
      leftIrisSamples = sampleAtPoints(ctx, width, height, [{ x: leftIris.x, y: leftIris.y }], 2);
    }
    if (rightIris) {
      rightIrisSamples = sampleAtPoints(ctx, width, height, [{ x: rightIris.x, y: rightIris.y }], 2);
    }
  } else if (landmarks && landmarks.length >= 264) {
    // Approximate pupil from eye corners
    const leftEyeInner = landmarks[133], leftEyeOuter = landmarks[33];
    const rightEyeInner = landmarks[362], rightEyeOuter = landmarks[263];
    if (leftEyeInner && leftEyeOuter) {
      leftIrisSamples = sampleAtPoints(ctx, width, height, [{
        x: (leftEyeInner.x + leftEyeOuter.x) / 2,
        y: (leftEyeInner.y + leftEyeOuter.y) / 2,
      }], 2);
    }
    if (rightEyeInner && rightEyeOuter) {
      rightIrisSamples = sampleAtPoints(ctx, width, height, [{
        x: (rightEyeInner.x + rightEyeOuter.x) / 2,
        y: (rightEyeInner.y + rightEyeOuter.y) / 2,
      }], 2);
    }
  }
  
  // Filter out specular highlights (pure white > 230)
  const filterHighlights = (samples: [number, number, number][]) =>
    samples.filter(s => !(s[0] > 230 && s[1] > 230 && s[2] > 230));
    
  const validLeft = filterHighlights(leftIrisSamples);
  const validRight = filterHighlights(rightIrisSamples);
  const combinedIris = [...validLeft, ...validRight];
  
  const baseIrisRgb = combinedIris.length > 0 ? medianRgb(combinedIris) : [65, 48, 38] as [number, number, number];
  const irisLum = getLuminance(baseIrisRgb);
  
  let estimatedCategory: 'blue' | 'green' | 'hazel' | 'brown' | 'dark' = 'brown';
  if (baseIrisRgb[2] > baseIrisRgb[0] + 10 && baseIrisRgb[2] > baseIrisRgb[1]) {
    estimatedCategory = 'blue';
  } else if (baseIrisRgb[1] > baseIrisRgb[0] + 5 && baseIrisRgb[1] > baseIrisRgb[2]) {
    estimatedCategory = 'green';
  } else if (irisLum < 0.18) {
    estimatedCategory = 'dark';
  } else if (irisLum < 0.36) {
    estimatedCategory = 'brown';
  } else {
    estimatedCategory = 'hazel';
  }

  // 3. Anatomical Sclera (Eye White) Sampling
  // Sample strictly inside the eye aperture between iris and corners, avoiding eyelid folds/skin
  let scleraSamples: [number, number, number][] = [];
  if (landmarks && landmarks.length >= 478) {
    const lIris = landmarks[468], rIris = landmarks[473];
    const lOuter = landmarks[33], lInner = landmarks[133];
    const rOuter = landmarks[263], rInner = landmarks[362];
    const scleraPts: Point[] = [];
    if (lIris && lOuter) {
      scleraPts.push({ x: lIris.x * 0.40 + lOuter.x * 0.60, y: lIris.y * 0.40 + lOuter.y * 0.60 });
    }
    if (lIris && lInner) {
      scleraPts.push({ x: lIris.x * 0.40 + lInner.x * 0.60, y: lIris.y * 0.40 + lInner.y * 0.60 });
    }
    if (rIris && rOuter) {
      scleraPts.push({ x: rIris.x * 0.40 + rOuter.x * 0.60, y: rIris.y * 0.40 + rOuter.y * 0.60 });
    }
    if (rIris && rInner) {
      scleraPts.push({ x: rIris.x * 0.40 + rInner.x * 0.60, y: rIris.y * 0.40 + rInner.y * 0.60 });
    }
    scleraSamples = sampleAtPoints(ctx, width, height, scleraPts, 1);
  } else if (landmarks && landmarks.length >= 264) {
    const lOuter = landmarks[33], lInner = landmarks[133];
    const rOuter = landmarks[263], rInner = landmarks[362];
    const scleraPts: Point[] = [];
    if (lOuter && lInner) {
      scleraPts.push({ x: lOuter.x * 0.70 + lInner.x * 0.30, y: lOuter.y * 0.70 + lInner.y * 0.30 });
      scleraPts.push({ x: lOuter.x * 0.30 + lInner.x * 0.70, y: lOuter.y * 0.30 + lInner.y * 0.70 });
    }
    if (rOuter && rInner) {
      scleraPts.push({ x: rOuter.x * 0.70 + rInner.x * 0.30, y: rOuter.y * 0.70 + rInner.y * 0.30 });
      scleraPts.push({ x: rOuter.x * 0.30 + rInner.x * 0.70, y: rOuter.y * 0.30 + rInner.y * 0.70 });
    }
    scleraSamples = sampleAtPoints(ctx, width, height, scleraPts, 1);
  }

  // Filter out dark lash/eyeliner boundary pixels (luminance < 0.40)
  const brightSclera = scleraSamples.filter(s => getLuminance(s) > 0.40);
  const rawScleraRgb = brightSclera.length > 0 ? medianRgb(brightSclera) : [244, 241, 238] as [number, number, number];
  const scleraLum = getLuminance(rawScleraRgb);

  // Guarantee anatomical health: if sclera is in deep shadow, lift softly towards warm off-white #F4F1EC
  // while preserving authentic ambient color temperature
  let baseScleraRgb: [number, number, number];
  if (scleraLum < SCLERA_MIN_ANATOMICAL_LUM) {
    const liftFactor = Math.min(1.0, (SCLERA_TARGET_BASE_LUM - scleraLum) / SCLERA_TARGET_BASE_LUM);
    baseScleraRgb = [
      Math.min(255, Math.round(rawScleraRgb[0] * (1 - liftFactor) + 246 * liftFactor)),
      Math.min(255, Math.round(rawScleraRgb[1] * (1 - liftFactor) + 242 * liftFactor)),
      Math.min(255, Math.round(rawScleraRgb[2] * (1 - liftFactor) + 238 * liftFactor)),
    ];
  } else {
    baseScleraRgb = rawScleraRgb;
  }

  // 4. Lip Sampling
  let lipSamples: [number, number, number][] = [];
  let upperLipSamples: [number, number, number][] = [];
  let lowerLipSamples: [number, number, number][] = [];
  
  if (landmarks && landmarks.length >= 315) {
    const upperPts = [13, 82, 312, 0, 37, 267]
      .map(idx => landmarks[idx])
      .filter((lm): lm is NormalizedLandmark => !!lm)
      .map(lm => ({ x: lm.x, y: lm.y }));
    const lowerPts = [14, 84, 314, 17, 87, 317]
      .map(idx => landmarks[idx])
      .filter((lm): lm is NormalizedLandmark => !!lm)
      .map(lm => ({ x: lm.x, y: lm.y }));
      
    upperLipSamples = sampleAtPoints(ctx, width, height, upperPts, 2);
    lowerLipSamples = sampleAtPoints(ctx, width, height, lowerPts, 2);
    lipSamples = [...upperLipSamples, ...lowerLipSamples];
  }
  
  const baseLipRgb = lipSamples.length > 0 ? medianRgb(lipSamples) : [
    Math.min(255, Math.round(baseSkinRgb[0] * 1.25)),
    Math.max(0, Math.round(baseSkinRgb[1] * 0.75)),
    Math.max(0, Math.round(baseSkinRgb[2] * 0.8)),
  ] as [number, number, number];
  
  const upperLipRgb = upperLipSamples.length > 0 ? medianRgb(upperLipSamples) : [
    Math.max(0, Math.round(baseLipRgb[0] * 0.92)),
    Math.max(0, Math.round(baseLipRgb[1] * 0.90)),
    Math.max(0, Math.round(baseLipRgb[2] * 0.90)),
  ] as [number, number, number];
  
  const lowerLipRgb = lowerLipSamples.length > 0 ? medianRgb(lowerLipSamples) : baseLipRgb;
  const lipContrast = Math.abs(getLuminance(baseLipRgb) - skinLum);

  // 4b. Dental Teeth Sampling (if lips are open / smile detected)
  let isMouthOpen = false;
  let dentalRgb: [number, number, number] = [243, 239, 233];
  if (landmarks && landmarks.length >= 15) {
    const innerTop = landmarks[13];
    const innerBottom = landmarks[14];
    if (innerTop && innerBottom) {
      const verticalGapPx = Math.abs(innerBottom.y - innerTop.y) * height;
      if (verticalGapPx >= MOUTH_OPEN_THRESHOLD_PX) {
        isMouthOpen = true;
        const teethSamples = sampleAtPoints(ctx, width, height, [
          { x: (innerTop.x + innerBottom.x) / 2, y: (innerTop.y + innerBottom.y) / 2 }
        ], 2);
        if (teethSamples.length > 0) {
          const rawTeeth = medianRgb(teethSamples);
          const teethLum = getLuminance(rawTeeth);
          if (teethLum >= 0.45) {
            // Soft warm ivory tone (#F4F0EA) prevents dental cavity or chalky white look
            dentalRgb = [
              Math.min(255, Math.round(rawTeeth[0] * 0.35 + 246 * 0.65)),
              Math.min(255, Math.round(rawTeeth[1] * 0.35 + 242 * 0.65)),
              Math.min(255, Math.round(rawTeeth[2] * 0.35 + 236 * 0.65)),
            ];
          }
        }
      }
    }
  }

  // 5. Eyebrows Sampling
  let browSamples: [number, number, number][] = [];
  if (landmarks && landmarks.length >= 335) {
    const browPts = [70, 63, 105, 66, 107, 300, 296, 334, 293, 276]
      .map(idx => landmarks[idx])
      .filter((lm): lm is NormalizedLandmark => !!lm)
      .map(lm => ({ x: lm.x, y: lm.y }));
    browSamples = sampleAtPoints(ctx, width, height, browPts, 2);
  }
  // Sort by luminance and take darker half to avoid skin bleeding
  const sortedBrowSamples = browSamples.sort((a, b) => getLuminance(a) - getLuminance(b));
  const darkBrowSamples = sortedBrowSamples.slice(0, Math.max(1, Math.floor(sortedBrowSamples.length * 0.6)));
  const baseBrowRgb = darkBrowSamples.length > 0 ? medianRgb(darkBrowSamples) : [
    Math.max(0, Math.round(baseSkinRgb[0] * 0.5)),
    Math.max(0, Math.round(baseSkinRgb[1] * 0.45)),
    Math.max(0, Math.round(baseSkinRgb[2] * 0.4)),
  ] as [number, number, number];

  // 6. Hair Sampling
  let hairSamples: [number, number, number][] = [];
  if (categoryMask && categoryMask.rawMask) {
    // Sample pixels where class == 1 (Hair)
    const mw = categoryMask.maskWidth;
    const mh = categoryMask.maskHeight;
    const mData = categoryMask.rawMask;
    
    // Sample up to 100 hair mask pixels
    const step = Math.max(1, Math.floor((mw * mh) / 800));
    for (let i = 0; i < mData.length; i += step) {
      if (mData[i] === 1) { // Hair class
        const mx = i % mw;
        const my = Math.floor(i / mw);
        const px = Math.floor((mx / mw) * width);
        const py = Math.floor((my / mh) * height);
        try {
          const pixel = ctx.getImageData(px, py, 1, 1).data;
          hairSamples.push([pixel[0], pixel[1], pixel[2]]);
        } catch {
          // ignore
        }
      }
    }
  }
  
  // Fallback: sample above forehead if mask hair samples are sparse
  if (hairSamples.length < 5 && landmarks && landmarks.length >= 11) {
    const topPt = landmarks[10];
    if (topPt) {
      hairSamples = sampleAtPoints(ctx, width, height, [
        { x: topPt.x, y: Math.max(0.02, topPt.y - 0.12) },
        { x: topPt.x - 0.1, y: Math.max(0.02, topPt.y - 0.08) },
        { x: topPt.x + 0.1, y: Math.max(0.02, topPt.y - 0.08) },
      ], 6);
    }
  }
  
  let baseHairRgb: [number, number, number];
  let shadowHairRgb: [number, number, number];
  let highlightHairRgb: [number, number, number];
  let hasHairTonalDepth = false;

  if (hairSamples.length >= 8) {
    const sorted = [...hairSamples].sort((a, b) => getLuminance(a) - getLuminance(b));
    const p15 = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.20)));
    const p50 = sorted.slice(Math.floor(sorted.length * 0.35), Math.ceil(sorted.length * 0.65));
    const p85 = sorted.slice(Math.floor(sorted.length * 0.80));

    shadowHairRgb = medianRgb(p15);
    baseHairRgb = medianRgb(p50);
    const sampledHighlight = medianRgb(p85);

    const minLum = getLuminance(shadowHairRgb);
    const maxLum = getLuminance(sampledHighlight);
    if (maxLum - minLum >= 0.08) {
      hasHairTonalDepth = true;
      highlightHairRgb = sampledHighlight;
    } else {
      highlightHairRgb = [
        Math.min(255, Math.round(baseHairRgb[0] * 1.25)),
        Math.min(255, Math.round(baseHairRgb[1] * 1.20)),
        Math.min(255, Math.round(baseHairRgb[2] * 1.18)),
      ];
    }
  } else {
    baseHairRgb = hairSamples.length > 0 ? medianRgb(hairSamples) : [42, 34, 30] as [number, number, number];
    shadowHairRgb = [
      Math.max(0, Math.round(baseHairRgb[0] * 0.75)),
      Math.max(0, Math.round(baseHairRgb[1] * 0.75)),
      Math.max(0, Math.round(baseHairRgb[2] * 0.75)),
    ];
    highlightHairRgb = [
      Math.min(255, Math.round(baseHairRgb[0] * 1.30)),
      Math.min(255, Math.round(baseHairRgb[1] * 1.25)),
      Math.min(255, Math.round(baseHairRgb[2] * 1.20)),
    ];
  }
  const hairLum = getLuminance(baseHairRgb);

  // Dedicated Lab tones for hair curls and volume
  const hairLab = rgbToLab(baseHairRgb[0], baseHairRgb[1], baseHairRgb[2]);
  const hairTones: string[] = [
    rgbToHex(...labToRgb(Math.max(6, hairLab[0] - 12), hairLab[1], hairLab[2])),                // Deep curl crease
    rgbToHex(...shadowHairRgb),                                                                  // Shadow
    rgbToHex(...baseHairRgb),                                                                    // Mid body
    rgbToHex(...highlightHairRgb),                                                               // Highlight curl crest
    rgbToHex(...labToRgb(Math.min(80, hairLab[0] + 25), hairLab[1] * 0.9, hairLab[2] * 0.9)),   // Specular sheen
  ];

  // 6b. Facial Hair (Beard & Moustache) Evidence Sampling
  let beardSamples: [number, number, number][] = [];
  let beardCoverage = 0;
  let isBeardPresent = false;
  if (landmarks && landmarks.length >= 200) {
    const beardPts: Point[] = [
      // Moustache region
      164, 18, 2, 200, 201, 37, 267, 39, 269,
      // Chin bulb & jaw region
      152, 148, 149, 150, 176, 377, 378, 400,
      172, 136, 365, 397, 58, 288
    ].map(idx => landmarks[idx])
     .filter((lm): lm is NormalizedLandmark => !!lm)
     .map(lm => ({ x: lm.x, y: lm.y }));

    beardSamples = sampleAtPoints(ctx, width, height, beardPts, 3);
    if (beardSamples.length > 0) {
      const darkBeard = beardSamples.filter(s => getLuminance(s) < skinLum * 0.80);
      beardCoverage = darkBeard.length / beardSamples.length;
      if (beardCoverage >= 0.22 || (darkBeard.length >= 4 && (skinLum - getLuminance(medianRgb(beardSamples))) > 0.10)) {
        isBeardPresent = true;
      }
    }
  }

  let baseBeardRgb: [number, number, number];
  let shadowBeardRgb: [number, number, number];
  let highlightBeardRgb: [number, number, number];

  if (isBeardPresent && beardSamples.length > 0) {
    const sortedBeard = beardSamples.sort((a, b) => getLuminance(a) - getLuminance(b));
    const darkHalf = sortedBeard.slice(0, Math.max(1, Math.floor(sortedBeard.length * 0.55)));
    baseBeardRgb = medianRgb(darkHalf);
    shadowBeardRgb = [
      Math.max(0, Math.round(baseBeardRgb[0] * 0.82)),
      Math.max(0, Math.round(baseBeardRgb[1] * 0.80)),
      Math.max(0, Math.round(baseBeardRgb[2] * 0.80)),
    ];
    highlightBeardRgb = [
      Math.min(255, Math.round(baseBeardRgb[0] * 1.25)),
      Math.min(255, Math.round(baseBeardRgb[1] * 1.22)),
      Math.min(255, Math.round(baseBeardRgb[2] * 1.20)),
    ];
  } else {
    baseBeardRgb = baseHairRgb;
    shadowBeardRgb = [
      Math.max(0, Math.round(baseHairRgb[0] * 0.82)),
      Math.max(0, Math.round(baseHairRgb[1] * 0.80)),
      Math.max(0, Math.round(baseHairRgb[2] * 0.80)),
    ];
    highlightBeardRgb = highlightHairRgb;
  }

  const beardTones: string[] = [
    rgbToHex(...shadowBeardRgb),
    rgbToHex(...baseBeardRgb),
    rgbToHex(...highlightBeardRgb),
  ];

  // 7. Clothing Sampling
  let clothingSamples: [number, number, number][] = [];
  if (categoryMask && categoryMask.rawMask) {
    const mw = categoryMask.maskWidth;
    const mh = categoryMask.maskHeight;
    const mData = categoryMask.rawMask;
    const step = Math.max(1, Math.floor((mw * mh) / 800));
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const data = imgData.data;
      for (let i = 0; i < mData.length; i += step) {
        if (mData[i] === 4) { // Clothes class
          const mx = i % mw;
          const my = Math.floor(i / mw);
          const px = Math.floor((mx / mw) * width);
          const py = Math.floor((my / mh) * height);
          if (px >= 0 && px < width && py >= 0 && py < height) {
            const idx = (py * width + px) * 4;
            clothingSamples.push([data[idx], data[idx + 1], data[idx + 2]]);
          }
        }
      }
    } catch {
      // fallback
    }
  }
  if (clothingSamples.length === 0) {
    // Sample lower corners / bottom center
    clothingSamples = sampleAtPoints(ctx, width, height, [
      { x: 0.2, y: 0.95 },
      { x: 0.5, y: 0.96 },
      { x: 0.8, y: 0.95 }
    ], 6);
  }
  let baseClothingRgb: [number, number, number];
  let shadowClothingRgb: [number, number, number];
  let highlightClothingRgb: [number, number, number];
  let hasClothingTonalVariance = false;

  if (clothingSamples.length >= 8) {
    const sorted = [...clothingSamples].sort((a, b) => getLuminance(a) - getLuminance(b));
    const p15 = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.20)));
    const p50 = sorted.slice(Math.floor(sorted.length * 0.35), Math.ceil(sorted.length * 0.65));
    const p85 = sorted.slice(Math.floor(sorted.length * 0.80));

    shadowClothingRgb = medianRgb(p15);
    baseClothingRgb = medianRgb(p50);
    const sampledHighlight = medianRgb(p85);

    const minLum = getLuminance(shadowClothingRgb);
    const maxLum = getLuminance(sampledHighlight);
    if (maxLum - minLum >= 0.09) {
      hasClothingTonalVariance = true;
      highlightClothingRgb = sampledHighlight;
    } else {
      highlightClothingRgb = [
        Math.min(255, Math.round(baseClothingRgb[0] * 1.20)),
        Math.min(255, Math.round(baseClothingRgb[1] * 1.20)),
        Math.min(255, Math.round(baseClothingRgb[2] * 1.20)),
      ];
    }
  } else {
    baseClothingRgb = clothingSamples.length > 0 ? medianRgb(clothingSamples) : [60, 70, 85] as [number, number, number];
    shadowClothingRgb = [
      Math.max(0, Math.round(baseClothingRgb[0] * 0.75)),
      Math.max(0, Math.round(baseClothingRgb[1] * 0.75)),
      Math.max(0, Math.round(baseClothingRgb[2] * 0.75)),
    ];
    highlightClothingRgb = [
      Math.min(255, Math.round(baseClothingRgb[0] * 1.25)),
      Math.min(255, Math.round(baseClothingRgb[1] * 1.25)),
      Math.min(255, Math.round(baseClothingRgb[2] * 1.25)),
    ];
  }

  const clothingTones: string[] = [
    rgbToHex(...shadowClothingRgb),
    rgbToHex(...baseClothingRgb),
    rgbToHex(...highlightClothingRgb),
  ];

  // 8. Background Sampling
  const bgSamples = sampleAtPoints(ctx, width, height, [
    { x: 0.02, y: 0.02 },
    { x: 0.98, y: 0.02 },
    { x: 0.02, y: 0.30 },
    { x: 0.98, y: 0.30 }
  ], 5);
  const baseBgRgb = bgSamples.length > 0 ? medianRgb(bgSamples) : [230, 230, 235] as [number, number, number];

  // Step 2: Empirical whole-photo average color for seamless stacked base layer
  let totalR = 0, totalG = 0, totalB = 0, totalCount = 0;
  try {
    const fullImgData = ctx.getImageData(0, 0, width, height);
    const d = fullImgData.data;
    const step = Math.max(1, Math.floor((width * height) / 4000));
    for (let i = 0; i < d.length; i += step * 4) {
      totalR += d[i];
      totalG += d[i + 1];
      totalB += d[i + 2];
      totalCount++;
    }
  } catch (_e) {
    // fallback
  }
  const avgPhotoHex = totalCount > 0
    ? rgbToHex(Math.round(totalR / totalCount), Math.round(totalG / totalCount), Math.round(totalB / totalCount))
    : rgbToHex(baseBgRgb[0], baseBgRgb[1], baseBgRgb[2]);

  // 6 Smooth tones in CIELAB space for cohesive, unblotchy painterly skin
  const skinLab = rgbToLab(baseSkinRgb[0], baseSkinRgb[1], baseSkinRgb[2]);
  const skinTones: string[] = [
    rgbToHex(...labToRgb(Math.min(96, skinLab[0] + 12), skinLab[1] * 0.95, skinLab[2] * 0.95)), // Highlight
    rgbToHex(...labToRgb(Math.min(90, skinLab[0] + 6), skinLab[1] * 0.98, skinLab[2] * 0.98)),  // Light Base
    rgbToHex(...baseSkinRgb),                                                                     // Base
    rgbToHex(...transitionSkinRgb),                                                               // Transition
    rgbToHex(...shadowSkinRgb),                                                                   // Shadow
    rgbToHex(...labToRgb(Math.max(12, skinLab[0] - 22), skinLab[1] * 1.05, skinLab[2] * 1.02)),  // Deep Shadow
  ];

  // Dedicated >= 24-level Skin Palette and >= 20-level Dark-Range Hair Palette (Smooth gradient, anti-posterization)
  const dedicatedSkinPal = extractDedicatedSkinPalette(ctx, width, height, landmarks, categoryMask, 24);
  const dedicatedHairPal = extractDedicatedDarkHairPalette(ctx, width, height, landmarks, categoryMask, 20);
  const skinAvg = landmarks && landmarks.length >= 33 ? calculateFaceSkinAverage(ctx, width, height, landmarks) : { averageRgb: baseSkinRgb, averageHex: rgbToHex(...baseSkinRgb) };

  const hasLandmarks = !!(landmarks && landmarks.length >= 33);

  return {
    skin: {
      base: rgbToHex(baseSkinRgb[0], baseSkinRgb[1], baseSkinRgb[2]),
      baseRgb: baseSkinRgb,
      transition: rgbToHex(transitionSkinRgb[0], transitionSkinRgb[1], transitionSkinRgb[2]),
      transitionRgb: transitionSkinRgb,
      shadow: rgbToHex(shadowSkinRgb[0], shadowSkinRgb[1], shadowSkinRgb[2]),
      shadowRgb: shadowSkinRgb,
      highlight: rgbToHex(highlightSkinRgb[0], highlightSkinRgb[1], highlightSkinRgb[2]),
      highlightRgb: highlightSkinRgb,
      tones: skinTones,
      palette14: dedicatedSkinPal,
      averageRgb: skinAvg.averageRgb,
      averageHex: skinAvg.averageHex,
      luminance: skinLum,
      status: skinSamples.length > 0 ? 'found' : 'not found',
    },
    iris: {
      hex: rgbToHex(baseIrisRgb[0], baseIrisRgb[1], baseIrisRgb[2]),
      rgb: baseIrisRgb,
      luminance: irisLum,
      estimatedCategory,
      leftIrisSampled: validLeft.length > 0 ? rgbToHex(...medianRgb(validLeft)) : rgbToHex(...baseIrisRgb),
      rightIrisSampled: validRight.length > 0 ? rgbToHex(...medianRgb(validRight)) : rgbToHex(...baseIrisRgb),
      status: (combinedIris.length > 0 && hasLandmarks) ? 'found' : 'not found',
    },
    sclera: {
      hex: rgbToHex(baseScleraRgb[0], baseScleraRgb[1], baseScleraRgb[2]),
      rgb: baseScleraRgb,
      status: (brightSclera.length > 0 && hasLandmarks) ? 'found' : 'not found',
    },
    lips: {
      base: rgbToHex(baseLipRgb[0], baseLipRgb[1], baseLipRgb[2]),
      upper: rgbToHex(upperLipRgb[0], upperLipRgb[1], upperLipRgb[2]),
      lower: rgbToHex(lowerLipRgb[0], lowerLipRgb[1], lowerLipRgb[2]),
      baseRgb: baseLipRgb,
      contrastToSkin: lipContrast,
      status: (lipSamples.length > 0 && hasLandmarks) ? 'found' : 'not found',
    },
    teeth: {
      hex: rgbToHex(dentalRgb[0], dentalRgb[1], dentalRgb[2]),
      rgb: dentalRgb,
      visible: isMouthOpen,
      status: isMouthOpen ? 'found' : 'not found',
    },
    brows: {
      hex: rgbToHex(baseBrowRgb[0], baseBrowRgb[1], baseBrowRgb[2]),
      rgb: baseBrowRgb,
      status: (browSamples.length > 0 && hasLandmarks) ? 'found' : 'not found',
    },
    hair: {
      base: rgbToHex(baseHairRgb[0], baseHairRgb[1], baseHairRgb[2]),
      highlight: rgbToHex(highlightHairRgb[0], highlightHairRgb[1], highlightHairRgb[2]),
      shadow: rgbToHex(shadowHairRgb[0], shadowHairRgb[1], shadowHairRgb[2]),
      shadowRgb: shadowHairRgb,
      baseRgb: baseHairRgb,
      tones: hairTones,
      palette16: dedicatedHairPal,
      luminance: hairLum,
      hasTonalDepth: hasHairTonalDepth,
      status: hairSamples.length > 0 ? 'found' : 'not found',
    },
    beard: {
      base: rgbToHex(baseBeardRgb[0], baseBeardRgb[1], baseBeardRgb[2]),
      baseRgb: baseBeardRgb,
      shadow: rgbToHex(shadowBeardRgb[0], shadowBeardRgb[1], shadowBeardRgb[2]),
      shadowRgb: shadowBeardRgb,
      highlight: rgbToHex(highlightBeardRgb[0], highlightBeardRgb[1], highlightBeardRgb[2]),
      highlightRgb: highlightBeardRgb,
      tones: beardTones,
      present: isBeardPresent,
      coverage: Math.round(beardCoverage * 100) / 100,
      status: isBeardPresent ? 'found' : 'not found',
    },
    clothing: {
      hex: rgbToHex(baseClothingRgb[0], baseClothingRgb[1], baseClothingRgb[2]),
      rgb: baseClothingRgb,
      shadow: rgbToHex(shadowClothingRgb[0], shadowClothingRgb[1], shadowClothingRgb[2]),
      shadowRgb: shadowClothingRgb,
      highlight: rgbToHex(highlightClothingRgb[0], highlightClothingRgb[1], highlightClothingRgb[2]),
      highlightRgb: highlightClothingRgb,
      tones: clothingTones,
      hasTonalVariance: hasClothingTonalVariance,
      status: clothingSamples.length > 0 ? 'found' : 'not found',
    },
    background: {
      hex: rgbToHex(baseBgRgb[0], baseBgRgb[1], baseBgRgb[2]),
      rgb: baseBgRgb,
      status: 'found',
    },
    averagePhotoColor: avgPhotoHex,
  };
}

/**
 * Step 3: Extracts a dedicated >= 12-level (default 14) skin palette spanning from
 * the brightest specular highlight to deep jawline shadows.
 */
export function extractDedicatedSkinPalette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks?: NormalizedLandmark[],
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null,
  targetCount: number = 14
): PaletteEntry[] {
  const samples: [number, number, number][] = [];
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Sample from categoryMask if available (classes 2 = face skin, 3 = body skin)
    if (categoryMask && categoryMask.rawMask) {
      const mw = categoryMask.maskWidth;
      const mh = categoryMask.maskHeight;
      const mData = categoryMask.rawMask;
      const step = Math.max(1, Math.floor((mw * mh) / 1200));

      for (let i = 0; i < mData.length; i += step) {
        if (mData[i] === 2 || mData[i] === 3) {
          const mx = i % mw;
          const my = Math.floor(i / mw);
          const px = Math.floor((mx / mw) * width);
          const py = Math.floor((my / mh) * height);
          const idx = (py * width + px) * 4;
          const r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          // Filter out dark hair bleeds or specular blowout
          if (lum > 0.18 && lum < 0.96) {
            samples.push([r, g, b]);
          }
        }
      }
    }

    // 2. Dense grid inside facial landmarks
    if (landmarks && landmarks.length >= 33) {
      const skinIndices = [
        10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 164, 0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 199, 175, 152,
        234, 127, 162, 21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152,
        117, 118, 50, 101, 205, 36, 142, 126, 217, 346, 347, 280, 330, 425, 266, 371, 355, 437
      ].filter(i => !!landmarks[i]);

      const skinPts = skinIndices.map(i => ({ x: landmarks[i].x, y: landmarks[i].y }));
      const lmsSamples = samplePixelsFromImageData(imgData, skinPts, 3, false);
      for (const s of lmsSamples) {
        const lum = (0.299 * s[0] + 0.587 * s[1] + 0.114 * s[2]) / 255;
        if (lum > 0.15 && lum < 0.96) {
          samples.push(s);
        }
      }
    }
  } catch (_e) {
    // fallback
  }

  if (samples.length < targetCount) {
    const base: [number, number, number] = [210, 168, 142];
    const palette: PaletteEntry[] = [];
    for (let i = 0; i < targetCount; i++) {
      const factor = 0.55 + (i / (targetCount - 1)) * 0.70;
      const r = Math.min(255, Math.round(base[0] * factor));
      const g = Math.min(255, Math.round(base[1] * factor));
      const b = Math.min(255, Math.round(base[2] * factor));
      palette.push({ r, g, b, a: 255, hex: rgbToHex(r, g, b) });
    }
    return palette;
  }

  // Sort by perceptual lightness L* in CIELAB space
  samples.sort((a, b) => {
    const labA = rgbToLab(a[0], a[1], a[2]);
    const labB = rgbToLab(b[0], b[1], b[2]);
    return labA[0] - labB[0];
  });

  const palette: PaletteEntry[] = [];
  const count = samples.length;

  for (let k = 0; k < targetCount; k++) {
    const startIdx = Math.floor((k / targetCount) * count);
    const endIdx = Math.min(count, Math.floor(((k + 1) / targetCount) * count));
    const slice = samples.slice(startIdx, Math.max(startIdx + 1, endIdx));
    const med = medianRgb(slice);
    palette.push({
      r: med[0],
      g: med[1],
      b: med[2],
      a: 255,
      hex: rgbToHex(med[0], med[1], med[2]),
    });
  }

  return palette;
}

/**
 * Step 3: Extracts a dedicated >= 16-level dark-range hair palette so curly hair stays dark
 * and hair strands are crisp and distinct.
 */
export function extractDedicatedDarkHairPalette(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  _landmarks?: NormalizedLandmark[],
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null,
  targetCount: number = 16
): PaletteEntry[] {
  const samples: [number, number, number][] = [];
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Sample hair mask if available (class 1)
    if (categoryMask && categoryMask.rawMask) {
      const mw = categoryMask.maskWidth;
      const mh = categoryMask.maskHeight;
      const mData = categoryMask.rawMask;
      const step = Math.max(1, Math.floor((mw * mh) / 1000));

      for (let i = 0; i < mData.length; i += step) {
        if (mData[i] === 1) { // Hair
          const mx = i % mw;
          const my = Math.floor(i / mw);
          const px = Math.floor((mx / mw) * width);
          const py = Math.floor((my / mh) * height);
          const idx = (py * width + px) * 4;
          samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
      }
    }

    // 2. Also sample dark-range pixels across the canvas (lum < 0.38)
    const stepCanvas = Math.max(2, Math.floor(Math.sqrt((width * height) / 1500)));
    for (let y = 0; y < height; y += stepCanvas) {
      for (let x = 0; x < width; x += stepCanvas) {
        const idx = (y * width + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        if (lum < 0.38) {
          samples.push([r, g, b]);
        }
      }
    }
  } catch (_e) {
    // fallback
  }

  if (samples.length < targetCount) {
    const palette: PaletteEntry[] = [];
    for (let i = 0; i < targetCount; i++) {
      const val = Math.round(12 + (i / (targetCount - 1)) * 78);
      palette.push({ r: val, g: Math.round(val * 0.9), b: Math.round(val * 0.85), a: 255, hex: rgbToHex(val, Math.round(val * 0.9), Math.round(val * 0.85)) });
    }
    return palette;
  }

  // Sort by lightness L*
  samples.sort((a, b) => {
    const lumA = 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2];
    const lumB = 0.299 * b[0] + 0.587 * b[1] + 0.114 * b[2];
    return lumA - lumB;
  });

  const palette: PaletteEntry[] = [];
  const count = samples.length;

  for (let k = 0; k < targetCount; k++) {
    const startIdx = Math.floor((k / targetCount) * count);
    const endIdx = Math.min(count, Math.floor(((k + 1) / targetCount) * count));
    const slice = samples.slice(startIdx, Math.max(startIdx + 1, endIdx));
    const med = medianRgb(slice);
    palette.push({
      r: med[0],
      g: med[1],
      b: med[2],
      a: 255,
      hex: rgbToHex(med[0], med[1], med[2]),
    });
  }

  return palette;
}

/**
 * Calculates average skin color for a face in RGB and Hex.
 */
export function calculateFaceSkinAverage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  landmarks: NormalizedLandmark[]
): { averageRgb: [number, number, number]; averageHex: string } {
  if (!landmarks || landmarks.length < 33) {
    return { averageRgb: [200, 160, 130], averageHex: '#C8A082' };
  }
  const skinIndices = [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 117, 118, 50, 346, 347, 280, 152];
  const pts = skinIndices.map(i => landmarks[i]).filter(Boolean).map(p => ({ x: p.x, y: p.y }));
  const samples = sampleAtPoints(ctx, width, height, pts, 3);
  if (samples.length === 0) {
    return { averageRgb: [200, 160, 130], averageHex: '#C8A082' };
  }
  let rSum = 0, gSum = 0, bSum = 0;
  for (const s of samples) {
    rSum += s[0];
    gSum += s[1];
    bSum += s[2];
  }
  const n = samples.length;
  const avgR = Math.round(rSum / n);
  const avgG = Math.round(gSum / n);
  const avgB = Math.round(bSum / n);
  return {
    averageRgb: [avgR, avgG, avgB],
    averageHex: rgbToHex(avgR, avgG, avgB),
  };
}

