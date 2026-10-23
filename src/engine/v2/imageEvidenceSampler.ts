/**
 * CodeMyFace Engine V2 — Phase 3: Image Evidence Sampler
 *
 * Implements Part A & Part D image verification:
 * - Samples true luminance inside pupils to detect genuine specular catchlights
 * - Inspects oral cavity luminance to verify exposed teeth vs dark cavity vs closed lips
 * - Samples true eyebrow color and lip vermilion tone
 * - Gracefully falls back when canvas context is unavailable (e.g. headless unit tests)
 */

import { Vec2 } from '../../types/portrait';
import { CatchlightEvidence, MouthEvidence } from './phase3Types';

export interface ImageEvidenceResult {
  leftCatchlight: CatchlightEvidence | null;
  rightCatchlight: CatchlightEvidence | null;
  mouthEvidence: MouthEvidence;
  leftEyebrowColor: string;
  rightEyebrowColor: string;
  vermilionColor: string;
  nostrilColor: string;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toH = (c: number) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
  return `#${toH(r)}${toH(g)}${toH(b)}`;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Samples a pixel from ImageData with bounds safety
 */
function getPixel(imgData: ImageData, x: number, y: number): [number, number, number, number] {
  const ix = Math.max(0, Math.min(imgData.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(imgData.height - 1, Math.round(y)));
  const idx = (iy * imgData.width + ix) * 4;
  return [imgData.data[idx], imgData.data[idx + 1], imgData.data[idx + 2], imgData.data[idx + 3]];
}

/**
 * Searches for a genuine specular catchlight inside the pupil / iris aperture
 */
function detectCatchlightForPupil(
  imgData: ImageData | null,
  pupilCenter: Vec2,
  irisRadius: number
): CatchlightEvidence | null {
  if (!imgData) return null;

  const searchRadius = Math.max(3, Math.min(10, Math.round(irisRadius * 0.55)));
  const minX = Math.max(0, Math.round(pupilCenter.x - searchRadius));
  const maxX = Math.min(imgData.width - 1, Math.round(pupilCenter.x + searchRadius));
  const minY = Math.max(0, Math.round(pupilCenter.y - searchRadius));
  const maxY = Math.min(imgData.height - 1, Math.round(pupilCenter.y + searchRadius));

  let maxLum = 0;
  let peakX = pupilCenter.x;
  let peakY = pupilCenter.y;
  let sumLum = 0;
  let count = 0;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = Math.hypot(x - pupilCenter.x, y - pupilCenter.y);
      if (d <= searchRadius) {
        const [r, g, b] = getPixel(imgData, x, y);
        const lum = luminance(r, g, b);
        sumLum += lum;
        count++;
        if (lum > maxLum) {
          maxLum = lum;
          peakX = x;
          peakY = y;
        }
      }
    }
  }

  const meanLum = count > 0 ? sumLum / count : 0;
  const contrast = maxLum - meanLum;

  // Credible catchlight rule:
  // Must be substantially brighter than the surrounding pupil (contrast >= 55)
  // and reach a high specular intensity (maxLum >= 195)
  if (maxLum >= 195 && contrast >= 55) {
    const catchlightRadius = Math.max(1.8, Math.min(3.2, irisRadius * 0.20));
    return {
      hasCatchlight: true,
      cx: peakX,
      cy: peakY,
      r: Math.round(catchlightRadius * 10) / 10,
      opacity: Math.min(0.95, Math.max(0.70, (maxLum / 255))),
    };
  }

  return null;
}

/**
 * Samples oral aperture to check whether mouth shows teeth or dark cavity
 */
function analyzeOralEvidence(
  imgData: ImageData | null,
  mouthCenter: Vec2,
  isSmileOpen: boolean,
  gapHeight: number
): MouthEvidence {
  if (!imgData || !isSmileOpen || gapHeight < 6) {
    return {
      isOpen: false,
      hasTeeth: false,
      meanOralLuminance: 0,
    };
  }

  // Sample vertical aperture slit in mouth center
  const sampleRadiusX = 12;
  const sampleRadiusY = Math.max(2, Math.min(8, Math.round(gapHeight * 0.35)));

  let sumLum = 0;
  let count = 0;

  for (let y = mouthCenter.y - sampleRadiusY; y <= mouthCenter.y + sampleRadiusY; y++) {
    for (let x = mouthCenter.x - sampleRadiusX; x <= mouthCenter.x + sampleRadiusX; x++) {
      const [r, g, b] = getPixel(imgData, x, y);
      sumLum += luminance(r, g, b);
      count++;
    }
  }

  const meanOralLuminance = count > 0 ? Math.round(sumLum / count) : 0;

  // If oral gap has high luminance (> 135), teeth are visibly exposed
  // If dark (<= 135), cavity is open but teeth are in shadow
  const hasTeeth = meanOralLuminance > 135;

  return {
    isOpen: true,
    hasTeeth,
    meanOralLuminance,
  };
}

/**
 * Samples natural color from a region
 */
function sampleAverageColor(
  imgData: ImageData | null,
  pts: Vec2[],
  defaultHex: string
): string {
  if (!imgData || !pts || pts.length === 0) return defaultHex;

  let sumR = 0, sumG = 0, sumB = 0, count = 0;
  for (const p of pts) {
    const [r, g, b] = getPixel(imgData, p.x, p.y);
    sumR += r;
    sumG += g;
    sumB += b;
    count++;
  }

  if (count === 0) return defaultHex;
  return rgbToHex(sumR / count, sumG / count, sumB / count);
}

/**
 * Extracts complete image evidence for Phase 3 feature reconstruction
 */
export function extractImageEvidence(
  normCanvas: HTMLCanvasElement | null,
  leftPupil: Vec2,
  leftIrisRadius: number,
  rightPupil: Vec2,
  rightIrisRadius: number,
  mouthCenter: Vec2,
  isSmileOpen: boolean,
  mouthGap: number,
  leftEyebrowPoints: Vec2[],
  rightEyebrowPoints: Vec2[],
  lipPoints: Vec2[],
  nostrilPoints: Vec2[]
): ImageEvidenceResult {
  let imgData: ImageData | null = null;
  if (normCanvas) {
    try {
      const ctx = normCanvas.getContext('2d');
      if (ctx) {
        imgData = ctx.getImageData(0, 0, normCanvas.width, normCanvas.height);
      }
    } catch (_) {
      imgData = null;
    }
  }

  const leftCatchlight = detectCatchlightForPupil(imgData, leftPupil, leftIrisRadius);
  const rightCatchlight = detectCatchlightForPupil(imgData, rightPupil, rightIrisRadius);
  const mouthEvidence = analyzeOralEvidence(imgData, mouthCenter, isSmileOpen, mouthGap);

  const leftEyebrowColor = sampleAverageColor(imgData, leftEyebrowPoints, '#2d2424');
  const rightEyebrowColor = sampleAverageColor(imgData, rightEyebrowPoints, '#2d2424');
  const vermilionColor = sampleAverageColor(imgData, lipPoints, '#c4786f');
  const nostrilColor = sampleAverageColor(imgData, nostrilPoints, '#5c3527');

  return {
    leftCatchlight,
    rightCatchlight,
    mouthEvidence,
    leftEyebrowColor,
    rightEyebrowColor,
    vermilionColor,
    nostrilColor,
  };
}
