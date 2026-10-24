/**
 * CodeMyFace V3 — Landmark-Guided Structural Constraints
 *
 * Uses MediaPipe's 478 landmarks strictly as anatomical reference frames,
 * bounding windows, and orientation invariants, rather than replacing
 * image evidence with generic parametric templates.
 *
 * Capabilities:
 * - Anatomical Region-of-Interest (ROI) extraction
 * - Local normal edge snapping (snapping fiducials to physical image gradient peaks)
 * - Evidence-based facial hair gate (density in sub-nasal and mandibular zones)
 * - Glasses and occlusion detection (transverse bridge edges)
 */

import { Point2D, BoundingBox } from './types';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { computeBoundingBox } from './contourExtractor';
import { GradientMap, calculateEdgeDensityInRegion } from './imageProcessing';

export interface AnatomicalROIs {
  leftEyeBox: BoundingBox;
  rightEyeBox: BoundingBox;
  leftEyebrowBox: BoundingBox;
  rightEyebrowBox: BoundingBox;
  noseBox: BoundingBox;
  mouthBox: BoundingBox;
  lowerThirdBox: BoundingBox; // Sub-nasal to chin
  orbitalBandBox: BoundingBox; // Across eyes and bridge for glasses
  faceBox: BoundingBox;
}

export interface FeatureEvidence {
  hasFacialHair: boolean;
  facialHairConfidence: number;
  hasGlasses: boolean;
  glassesConfidence: number;
  openMouth: boolean;
}

// MediaPipe landmark indices
const LM_LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const LM_RIGHT_EYE = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398];
const LM_LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const LM_RIGHT_BROW = [336, 296, 334, 293, 300, 276, 283, 282, 295, 285];
const LM_NOSE = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2, 98, 327, 278, 48];
const LM_LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 78, 95, 88, 178, 87, 14, 317];
const LM_JAW = [234, 93, 132, 58, 172, 136, 150, 149, 176, 148, 152, 377, 400, 378, 379, 365, 397, 288, 361, 323, 454];

function landmarksToPoints(
  indices: number[],
  landmarks: NormalizedLandmark[],
  imgW: number,
  imgH: number
): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i < indices.length; i++) {
    const idx = indices[i];
    if (landmarks[idx]) {
      pts.push({
        x: landmarks[idx].x * imgW,
        y: landmarks[idx].y * imgH,
      });
    }
  }
  return pts;
}

function expandBoundingBox(bbox: BoundingBox, padXRatio: number, padYRatio: number, imgW: number, imgH: number): BoundingBox {
  const padX = bbox.width * padXRatio;
  const padY = bbox.height * padYRatio;
  const minX = Math.max(0, bbox.minX - padX);
  const minY = Math.max(0, bbox.minY - padY);
  const maxX = Math.min(imgW - 1, bbox.maxX + padX);
  const maxY = Math.min(imgH - 1, bbox.maxY + padY);

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Derives anatomical regions of interest from MediaPipe landmarks
 */
export function extractAnatomicalROIs(
  landmarks: NormalizedLandmark[],
  imgW: number,
  imgH: number
): AnatomicalROIs {
  const leftEyePts = landmarksToPoints(LM_LEFT_EYE, landmarks, imgW, imgH);
  const rightEyePts = landmarksToPoints(LM_RIGHT_EYE, landmarks, imgW, imgH);
  const leftBrowPts = landmarksToPoints(LM_LEFT_BROW, landmarks, imgW, imgH);
  const rightBrowPts = landmarksToPoints(LM_RIGHT_BROW, landmarks, imgW, imgH);
  const nosePts = landmarksToPoints(LM_NOSE, landmarks, imgW, imgH);
  const lipsPts = landmarksToPoints(LM_LIPS, landmarks, imgW, imgH);
  const jawPts = landmarksToPoints(LM_JAW, landmarks, imgW, imgH);

  const leftEyeBox = expandBoundingBox(computeBoundingBox(leftEyePts), 0.25, 0.40, imgW, imgH);
  const rightEyeBox = expandBoundingBox(computeBoundingBox(rightEyePts), 0.25, 0.40, imgW, imgH);
  const leftEyebrowBox = expandBoundingBox(computeBoundingBox(leftBrowPts), 0.15, 0.30, imgW, imgH);
  const rightEyebrowBox = expandBoundingBox(computeBoundingBox(rightBrowPts), 0.15, 0.30, imgW, imgH);
  const noseBox = expandBoundingBox(computeBoundingBox(nosePts), 0.20, 0.20, imgW, imgH);
  const mouthBox = expandBoundingBox(computeBoundingBox(lipsPts), 0.20, 0.35, imgW, imgH);
  const faceBox = expandBoundingBox(computeBoundingBox(jawPts), 0.10, 0.15, imgW, imgH);

  // Lower third: from nose tip down to below chin
  const noseTip = landmarks[4] ? { x: landmarks[4].x * imgW, y: landmarks[4].y * imgH } : { x: imgW / 2, y: imgH / 2 };
  const chinTip = landmarks[152] ? { x: landmarks[152].x * imgW, y: landmarks[152].y * imgH } : { x: imgW / 2, y: (imgH * 3) / 4 };
  const lowerThirdBox = expandBoundingBox(
    {
      minX: faceBox.minX,
      minY: noseTip.y,
      maxX: faceBox.maxX,
      maxY: chinTip.y + (chinTip.y - noseTip.y) * 0.15,
      width: faceBox.width,
      height: chinTip.y - noseTip.y,
    },
    0.05,
    0.05,
    imgW,
    imgH
  );

  // Orbital band: horizontal span covering both eyes and nasal bridge
  const orbitalBandBox: BoundingBox = {
    minX: Math.min(leftEyeBox.minX, rightEyeBox.minX),
    minY: Math.min(leftEyeBox.minY, rightEyeBox.minY),
    maxX: Math.max(leftEyeBox.maxX, rightEyeBox.maxX),
    maxY: Math.max(leftEyeBox.maxY, rightEyeBox.maxY),
    width: Math.max(leftEyeBox.maxX, rightEyeBox.maxX) - Math.min(leftEyeBox.minX, rightEyeBox.minX),
    height: Math.max(leftEyeBox.maxY, rightEyeBox.maxY) - Math.min(leftEyeBox.minY, rightEyeBox.minY),
  };

  return {
    leftEyeBox,
    rightEyeBox,
    leftEyebrowBox,
    rightEyebrowBox,
    noseBox,
    mouthBox,
    lowerThirdBox,
    orbitalBandBox,
    faceBox,
  };
}

/**
 * Snaps a landmark point to the nearest physical luminance gradient edge along its normal
 */
export function snapPointToGradientEdge(
  pt: Point2D,
  normal: Point2D,
  gradients: GradientMap,
  searchRadius: number = 6,
  minMagThreshold: number = 0.12
): Point2D {
  const { magnitude, width, height } = gradients;
  let bestX = pt.x;
  let bestY = pt.y;
  let maxMag = 0;

  const nLen = Math.hypot(normal.x, normal.y) || 1;
  const ndx = normal.x / nLen;
  const ndy = normal.y / nLen;

  for (let r = -searchRadius; r <= searchRadius; r++) {
    const sx = Math.round(pt.x + ndx * r);
    const sy = Math.round(pt.y + ndy * r);

    if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
      const mag = magnitude[sy * width + sx];
      if (mag > maxMag && mag >= minMagThreshold) {
        maxMag = mag;
        bestX = sx;
        bestY = sy;
      }
    }
  }

  return { x: bestX, y: bestY };
}

/**
 * Inspects source image evidence in anatomical ROIs to detect facial hair, glasses, open mouth
 */
export function analyzeFeatureEvidence(
  edgeMap: Uint8Array,
  imgW: number,
  imgH: number,
  rois: AnatomicalROIs,
  landmarks: NormalizedLandmark[]
): FeatureEvidence {
  // 1. Facial hair: measure edge density in mandibular and sub-nasal lower-third zone
  const lowerThirdDensity = calculateEdgeDensityInRegion(edgeMap, imgW, imgH, rois.lowerThirdBox);
  // Clean shaven typically has density < 0.04; heavy beards/stubbles have density > 0.08
  const hasFacialHair = lowerThirdDensity > 0.075;
  const facialHairConfidence = Math.min(1.0, lowerThirdDensity / 0.12);

  // 2. Glasses detection: measure horizontal edge continuity across the nasal bridge (between the two inner canthi)
  const leftInnerCanthus = landmarks[133] ? { x: landmarks[133].x * imgW, y: landmarks[133].y * imgH } : null;
  const rightInnerCanthus = landmarks[362] ? { x: landmarks[362].x * imgW, y: landmarks[362].y * imgH } : null;

  let hasGlasses = false;
  let glassesConfidence = 0;

  if (leftInnerCanthus && rightInnerCanthus) {
    const bridgeBox: BoundingBox = {
      minX: Math.min(leftInnerCanthus.x, rightInnerCanthus.x),
      minY: Math.min(leftInnerCanthus.y, rightInnerCanthus.y) - 8,
      maxX: Math.max(leftInnerCanthus.x, rightInnerCanthus.x),
      maxY: Math.max(leftInnerCanthus.y, rightInnerCanthus.y) + 8,
      width: Math.abs(rightInnerCanthus.x - leftInnerCanthus.x),
      height: 16,
    };
    const bridgeDensity = calculateEdgeDensityInRegion(edgeMap, imgW, imgH, bridgeBox);
    const orbitalBandDensity = calculateEdgeDensityInRegion(edgeMap, imgW, imgH, rois.orbitalBandBox);

    // Glasses frames produce distinctive high edge density across the nasal bridge AND orbital perimeters
    if (bridgeDensity > 0.14 && orbitalBandDensity > 0.09) {
      hasGlasses = true;
      glassesConfidence = Math.min(1.0, (bridgeDensity + orbitalBandDensity) / 0.25);
    }
  }

  // 3. Open mouth / teeth: check vertical gap between upper and lower inner lip landmarks
  const upperInner = landmarks[13] ? landmarks[13].y * imgH : 0;
  const lowerInner = landmarks[14] ? landmarks[14].y * imgH : 0;
  const mouthOpenDist = Math.abs(lowerInner - upperInner);
  const openMouth = mouthOpenDist > 4.5;

  return {
    hasFacialHair,
    facialHairConfidence,
    hasGlasses,
    glassesConfidence,
    openMouth,
  };
}
