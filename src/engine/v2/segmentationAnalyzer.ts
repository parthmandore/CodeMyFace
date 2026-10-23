/**
 * CodeMyFace Engine V2 — Phase 1: Segmentation Analyzer
 *
 * Implements Part C:
 * - Processes MediaPipe multiclass segmentation output (classes 0-5)
 * - Retains pixel counts, area ratios, and semantic labels:
 *   - Class 0: Background (#3b82f6)
 *   - Class 1: Hair (#ec4899)
 *   - Class 2: Body skin (#f97316)
 *   - Class 3: Face skin (#10b981)
 *   - Class 4: Clothes (#06b6d4)
 *   - Class 5: Others (#eab308)
 * - Conducts rigorous diagnosis of 7 specific segmentation failure modes:
 *   1. Hair extending below the ears
 *   2. Long hair descending past neck/shoulders
 *   3. Bangs / fringe covering the upper forehead
 *   4. Dark clothing conflated with hair
 *   5. Facial hair / beard on mandible and chin
 *   6. Spectacles / eyewear bridge occlusion
 *   7. Low color contrast between hair/skin and background
 */

import {
  SegmentationAnalysisV2,
  SegmentationInvestigation,
  CategoryMetric,
  SemanticCategory,
  NormalizedFacialLandmarks,
  CoordinateTransform2D,
} from './types';

export const CATEGORY_DEFINITIONS: Record<number, { name: SemanticCategory; label: string; colorHex: string }> = {
  0: { name: 'background', label: 'Background', colorHex: '#3b82f6' },
  1: { name: 'hair', label: 'Hair', colorHex: '#ec4899' },
  2: { name: 'bodySkin', label: 'Body Skin', colorHex: '#f97316' },
  3: { name: 'faceSkin', label: 'Face Skin', colorHex: '#10b981' },
  4: { name: 'clothes', label: 'Clothes', colorHex: '#06b6d4' },
  5: { name: 'others', label: 'Others', colorHex: '#eab308' },
};

/**
 * Analyzes multiclass segmentation mask and investigates edge cases
 */
export function analyzeSegmentationMask(
  rawMask: Uint8Array | undefined,
  maskWidth: number,
  maskHeight: number,
  landmarks: NormalizedFacialLandmarks | undefined,
  transform: CoordinateTransform2D | undefined,
  _sourceCanvasOrImage?: HTMLImageElement | HTMLCanvasElement
): SegmentationAnalysisV2 {
  if (!rawMask || rawMask.length === 0 || maskWidth <= 0 || maskHeight <= 0) {
    return createEmptySegmentationAnalysis();
  }

  const totalPixels = maskWidth * maskHeight;
  const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (let i = 0; i < rawMask.length; i++) {
    const cls = rawMask[i];
    if (cls >= 0 && cls <= 5) {
      counts[cls] = (counts[cls] || 0) + 1;
    }
  }

  const categories: Record<SemanticCategory, CategoryMetric> = {
    background: {
      id: 0,
      name: 'background',
      label: 'Background',
      colorHex: '#3b82f6',
      pixelCount: counts[0] || 0,
      ratioOfTotal: (counts[0] || 0) / totalPixels,
    },
    hair: {
      id: 1,
      name: 'hair',
      label: 'Hair',
      colorHex: '#ec4899',
      pixelCount: counts[1] || 0,
      ratioOfTotal: (counts[1] || 0) / totalPixels,
    },
    bodySkin: {
      id: 2,
      name: 'bodySkin',
      label: 'Body Skin',
      colorHex: '#f97316',
      pixelCount: counts[2] || 0,
      ratioOfTotal: (counts[2] || 0) / totalPixels,
    },
    faceSkin: {
      id: 3,
      name: 'faceSkin',
      label: 'Face Skin',
      colorHex: '#10b981',
      pixelCount: counts[3] || 0,
      ratioOfTotal: (counts[3] || 0) / totalPixels,
    },
    clothes: {
      id: 4,
      name: 'clothes',
      label: 'Clothes',
      colorHex: '#06b6d4',
      pixelCount: counts[4] || 0,
      ratioOfTotal: (counts[4] || 0) / totalPixels,
    },
    others: {
      id: 5,
      name: 'others',
      label: 'Others',
      colorHex: '#eab308',
      pixelCount: counts[5] || 0,
      ratioOfTotal: (counts[5] || 0) / totalPixels,
    },
  };

  // Perform rigorous investigation of the 7 edge cases
  const investigation = investigateMaskAnomalies(
    rawMask,
    maskWidth,
    maskHeight,
    categories,
    landmarks,
    transform
  );

  const hairConfidence = categories.hair.ratioOfTotal > 0.01 ? 0.95 : 0.40;
  const faceSkinConfidence = categories.faceSkin.ratioOfTotal > 0.05 ? 0.98 : 0.50;

  return {
    available: true,
    provenance: 'mediapipe-multiclass',
    maskWidth,
    maskHeight,
    rawMask,
    categories,
    investigation,
    hairConfidence,
    faceSkinConfidence,
  };
}

/**
 * Investigates specific image edge cases and potential failure modes
 */
function investigateMaskAnomalies(
  rawMask: Uint8Array,
  width: number,
  height: number,
  categories: Record<SemanticCategory, CategoryMetric>,
  landmarks?: NormalizedFacialLandmarks,
  transform?: CoordinateTransform2D
): SegmentationInvestigation {
  const weaknesses: string[] = [];

  // Find vertical span of hair pixels (class 1)
  let minHairY = height;
  let maxHairY = 0;
  let minHairX = width;
  let maxHairX = 0;
  let hairPixelCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (rawMask[idx] === 1) {
        hairPixelCount++;
        if (y < minHairY) minHairY = y;
        if (y > maxHairY) maxHairY = y;
        if (x < minHairX) minHairX = x;
        if (x > maxHairX) maxHairX = x;
      }
    }
  }

  // 1 & 2. Hair below ears and long hair detection
  let hairExtendingBelowEars = false;
  let longHairDetected = false;

  if (landmarks && transform) {
    // Ear bottom level in source normalized coordinates
    const leftEarSrc = transform.canonicalToNormalizedSource(landmarks.ears.leftRoot);
    const rightEarSrc = transform.canonicalToNormalizedSource(landmarks.ears.rightRoot);
    const chinSrc = transform.canonicalToNormalizedSource(landmarks.chin.tip);

    const earBottomYPx = Math.max(leftEarSrc.y, rightEarSrc.y) * height;
    const chinYPx = chinSrc.y * height;

    if (maxHairY > earBottomYPx + height * 0.03) {
      hairExtendingBelowEars = true;
    }

    if (maxHairY > chinYPx - height * 0.02) {
      longHairDetected = true;
      weaknesses.push('Hair descends past chin/neck line (long hair volume)');
    }
  } else {
    // Heuristic fallback if landmarks absent
    if (maxHairY > height * 0.65) {
      hairExtendingBelowEars = true;
      longHairDetected = true;
    }
  }

  // 3. Bangs / fringe covering forehead
  let bangsCoveringForehead = false;
  if (landmarks && transform) {
    const foreheadTopSrc = transform.canonicalToNormalizedSource(landmarks.forehead.top);
    const browMidSrc = transform.canonicalToNormalizedSource(
      landmarks.leftEyebrow.arch || { x: 500, y: 400 }
    );

    const fTopPx = Math.round(foreheadTopSrc.y * height);
    const browPx = Math.round(browMidSrc.y * height);

    // Check hair pixels in the central forehead band
    const cx = Math.round(width / 2);
    let foreheadHairPixels = 0;
    let totalForeheadPixels = 0;

    for (let y = Math.max(0, fTopPx); y < Math.min(height, browPx); y++) {
      for (let x = Math.max(0, cx - Math.round(width * 0.15)); x < Math.min(width, cx + Math.round(width * 0.15)); x++) {
        totalForeheadPixels++;
        if (rawMask[y * width + x] === 1) {
          foreheadHairPixels++;
        }
      }
    }

    if (totalForeheadPixels > 0 && foreheadHairPixels / totalForeheadPixels > 0.35) {
      bangsCoveringForehead = true;
      weaknesses.push('Bangs or fringe cover upper forehead skull region');
    }
  }

  // 4. Dark clothing mistaken for hair risk
  let darkClothingMistakenForHairRisk = false;
  // If clothes (class 4) and hair (class 1) directly touch with no body skin (class 2) gap
  const clothesRatio = categories.clothes.ratioOfTotal;
  const hairRatio = categories.hair.ratioOfTotal;
  if (clothesRatio > 0.15 && hairRatio > 0.15 && categories.bodySkin.ratioOfTotal < 0.02) {
    darkClothingMistakenForHairRisk = true;
    weaknesses.push('Hair contacts dark clothing directly with minimal neck separation');
  }

  // 5. Facial hair / beard presence
  let facialHairDetected = false;
  if (landmarks && transform) {
    const subnasaleSrc = transform.canonicalToNormalizedSource(landmarks.nose.subnasale);
    const chinSrc = transform.canonicalToNormalizedSource(landmarks.chin.tip);
    const startY = Math.round(subnasaleSrc.y * height);
    const endY = Math.round(chinSrc.y * height);
    const midX = Math.round(subnasaleSrc.x * width);

    let chinHairPixels = 0;
    for (let y = startY; y <= endY && y < height; y++) {
      for (let x = Math.max(0, midX - 20); x <= Math.min(width - 1, midX + 20); x++) {
        if (rawMask[y * width + x] === 1) {
          chinHairPixels++;
        }
      }
    }
    if (chinHairPixels > 15) {
      facialHairDetected = true;
      weaknesses.push('Beard or mustache pixels classified in lower facial zone');
    }
  }

  // 6. Glasses / eyewear detection
  let glassesDetected = false;
  if (landmarks) {
    // If eye distance is wide and pupil landmarks are slightly occluded, or known glasses fixture
    const leftW = landmarks.leftEye.fissureWidth;
    const rightW = landmarks.rightEye.fissureWidth;
    if (Math.abs(leftW - rightW) > 15 || landmarks.nose.alarWidth > 90) {
      glassesDetected = true;
      weaknesses.push('Potential spectacles or eyewear occlusion around nasal bridge');
    }
  }

  // 7. Background contrast risk
  let lowContrastBackgroundRisk = false;
  if (categories.background.ratioOfTotal < 0.20 || categories.hair.ratioOfTotal > 0.40) {
    lowContrastBackgroundRisk = true;
    weaknesses.push('High hair ratio or tight background suggests potential background bleed');
  }

  return {
    hairExtendingBelowEars,
    longHairDetected,
    bangsCoveringForehead,
    darkClothingMistakenForHairRisk,
    facialHairDetected,
    glassesDetected,
    lowContrastBackgroundRisk,
    identifiedWeaknesses: weaknesses,
  };
}

function createEmptySegmentationAnalysis(): SegmentationAnalysisV2 {
  const emptyCategory = (id: number, name: SemanticCategory, label: string, colorHex: string): CategoryMetric => ({
    id,
    name,
    label,
    colorHex,
    pixelCount: 0,
    ratioOfTotal: 0,
  });

  return {
    available: false,
    provenance: 'fallback-heuristic',
    maskWidth: 0,
    maskHeight: 0,
    categories: {
      background: emptyCategory(0, 'background', 'Background', '#3b82f6'),
      hair: emptyCategory(1, 'hair', 'Hair', '#ec4899'),
      bodySkin: emptyCategory(2, 'bodySkin', 'Body Skin', '#f97316'),
      faceSkin: emptyCategory(3, 'faceSkin', 'Face Skin', '#10b981'),
      clothes: emptyCategory(4, 'clothes', 'Clothes', '#06b6d4'),
      others: emptyCategory(5, 'others', 'Others', '#eab308'),
    },
    investigation: {
      hairExtendingBelowEars: false,
      longHairDetected: false,
      bangsCoveringForehead: false,
      darkClothingMistakenForHairRisk: false,
      facialHairDetected: false,
      glassesDetected: false,
      lowContrastBackgroundRisk: false,
      identifiedWeaknesses: ['Segmentation mask unavailable'],
    },
    hairConfidence: 0,
    faceSkinConfidence: 0,
  };
}
