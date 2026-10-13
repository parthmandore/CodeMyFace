/**
 * CodeMyFace — Face Analyzer
 *
 * Extracts structured semantic facial features, proportions, angles,
 * and face shape classifications from normalized MediaPipe landmarks.
 *
 * All coordinates are normalized [0, 1] and bounded safely.
 */
import { Vec2, FacialFeatures, FaceShape } from '../types/portrait';
import { clamp, distance, midpoint, clampVec2 } from './geometry';
import * as LM from './landmarkIndices';
import { NormalizedLandmark } from '../services/faceDetection/types';

/** Safe point extractor with bounds checking */
function getPt(landmarks: NormalizedLandmark[], index: number): Vec2 {
  if (!landmarks || landmarks.length === 0) {
    return { x: 0.5, y: 0.5 };
  }
  const safeIdx = Math.max(0, Math.min(landmarks.length - 1, index));
  const pt = landmarks[safeIdx];
  if (!pt || !isFinite(pt.x) || !isFinite(pt.y)) {
    return { x: 0.5, y: 0.5 };
  }
  return clampVec2({ x: pt.x, y: pt.y });
}

/** Map array of indices to Vec2 points */
function mapIndices(landmarks: NormalizedLandmark[], indices: readonly number[]): Vec2[] {
  return indices.map((idx) => getPt(landmarks, idx));
}

/**
 * Extracts normalized facial features from MediaPipe landmarks
 */
export function extractFacialFeatures(landmarks: NormalizedLandmark[]): FacialFeatures {
  // Outline & Jaw
  const faceOutline = mapIndices(landmarks, LM.FACE_OVAL);
  const jawline = mapIndices(landmarks, LM.JAWLINE);

  // Eyes
  const leftEyeContour = mapIndices(landmarks, LM.LEFT_EYE_CONTOUR);
  const rightEyeContour = mapIndices(landmarks, LM.RIGHT_EYE_CONTOUR);

  const leftEyeOuter = getPt(landmarks, LM.LEFT_EYE_CONTOUR[0]);
  const leftEyeInner = getPt(landmarks, LM.LEFT_EYE_CONTOUR[8]);
  const leftEyeWidth = distance(leftEyeOuter, leftEyeInner);

  const rightEyeOuter = getPt(landmarks, LM.RIGHT_EYE_CONTOUR[8]);
  const rightEyeInner = getPt(landmarks, LM.RIGHT_EYE_CONTOUR[0]);
  const rightEyeWidth = distance(rightEyeOuter, rightEyeInner);

  // Eye opening heights (vertical distance between upper and lower lid midpoints)
  const leftUpperMid = getPt(landmarks, LM.LEFT_EYE_CONTOUR[12]);
  const leftLowerMid = getPt(landmarks, LM.LEFT_EYE_CONTOUR[4]);
  const leftEyeOpeningHeight = distance(leftUpperMid, leftLowerMid);

  const rightUpperMid = getPt(landmarks, LM.RIGHT_EYE_CONTOUR[12]);
  const rightLowerMid = getPt(landmarks, LM.RIGHT_EYE_CONTOUR[4]);
  const rightEyeOpeningHeight = distance(rightUpperMid, rightLowerMid);

  // Pupils and Iris: consume verified iris contour landmarks (MediaPipe 468-477)
  const hasIrisLandmarks = landmarks && landmarks.length >= 478;

  let leftPupil: Vec2;
  let rightPupil: Vec2;
  let leftIrisRadius: number;
  let rightIrisRadius: number;
  let leftIrisContour: Vec2[] | undefined;
  let rightIrisContour: Vec2[] | undefined;

  if (hasIrisLandmarks) {
    leftPupil = getPt(landmarks, LM.LEFT_IRIS_CENTER);
    rightPupil = getPt(landmarks, LM.RIGHT_IRIS_CENTER);

    leftIrisContour = [
      getPt(landmarks, LM.LEFT_IRIS[1]),
      getPt(landmarks, LM.LEFT_IRIS[2]),
      getPt(landmarks, LM.LEFT_IRIS[3]),
      getPt(landmarks, LM.LEFT_IRIS[4]),
    ];
    rightIrisContour = [
      getPt(landmarks, LM.RIGHT_IRIS[1]),
      getPt(landmarks, LM.RIGHT_IRIS[2]),
      getPt(landmarks, LM.RIGHT_IRIS[3]),
      getPt(landmarks, LM.RIGHT_IRIS[4]),
    ];

    // Measure iris radii directly from center to boundary contour
    const leftDistances = leftIrisContour.map((p) => distance(leftPupil, p));
    const leftMeasuredR = leftDistances.reduce((s, d) => s + d, 0) / leftDistances.length;

    const rightDistances = rightIrisContour.map((p) => distance(rightPupil, p));
    const rightMeasuredR = rightDistances.reduce((s, d) => s + d, 0) / rightDistances.length;

    // Validate measured radii: iris radius is normally 20% to 38% of eye width
    const leftRatio = leftEyeWidth > 0 ? leftMeasuredR / leftEyeWidth : 0.28;
    if (leftRatio >= 0.16 && leftRatio <= 0.42) {
      leftIrisRadius = leftMeasuredR;
    } else {
      leftIrisRadius = Math.max(0.008, Math.min(0.025, leftEyeWidth * 0.28));
    }

    const rightRatio = rightEyeWidth > 0 ? rightMeasuredR / rightEyeWidth : 0.28;
    if (rightRatio >= 0.16 && rightRatio <= 0.42) {
      rightIrisRadius = rightMeasuredR;
    } else {
      rightIrisRadius = Math.max(0.008, Math.min(0.025, rightEyeWidth * 0.28));
    }
  } else {
    // Conservative fallback when iris landmarks are unavailable (< 478 landmarks)
    leftPupil = midpoint(leftEyeOuter, leftEyeInner);
    rightPupil = midpoint(rightEyeOuter, rightEyeInner);
    leftIrisRadius = Math.max(0.008, Math.min(0.025, leftEyeWidth * 0.28));
    rightIrisRadius = Math.max(0.008, Math.min(0.025, rightEyeWidth * 0.28));
  }

  // Eyebrows
  const leftEyebrow = mapIndices(landmarks, LM.LEFT_EYEBROW);
  const rightEyebrow = mapIndices(landmarks, LM.RIGHT_EYEBROW);

  // Nose
  const noseBridge = mapIndices(landmarks, LM.NOSE_BRIDGE);
  const noseTip = getPt(landmarks, LM.NOSE_TIP);
  const noseBottom = mapIndices(landmarks, LM.NOSE_BOTTOM);
  const leftNostril = getPt(landmarks, LM.LEFT_NOSTRIL);
  const rightNostril = getPt(landmarks, LM.RIGHT_NOSTRIL);

  // Lips
  const upperLip = mapIndices(landmarks, LM.UPPER_LIP_OUTER);
  const lowerLip = mapIndices(landmarks, LM.LOWER_LIP_OUTER);
  const mouthCenter = getPt(landmarks, LM.MOUTH_CENTER);

  // Forehead & Temples
  const foreheadTop = getPt(landmarks, LM.FOREHEAD_TOP);
  const templeLeft = getPt(landmarks, LM.TEMPLE_LEFT);
  const templeRight = getPt(landmarks, LM.TEMPLE_RIGHT);
  const chinTip = getPt(landmarks, LM.CHIN_TIP);

  // Neck estimation: project downwards from lower jaw corners
  const jawLeft = getPt(landmarks, LM.JAW_BOTTOM_LEFT);
  const jawRight = getPt(landmarks, LM.JAW_BOTTOM_RIGHT);
  const faceHeight = Math.max(0.1, chinTip.y - foreheadTop.y);
  const faceWidth = Math.max(0.08, Math.abs(templeRight.x - templeLeft.x));
  const neckDrop = faceHeight * 0.45;

  const neckLeft: Vec2 = {
    x: clamp(jawLeft.x - 0.02, 0.05, 0.95),
    y: clamp(jawLeft.y + neckDrop, 0.1, 1.0),
  };
  const neckRight: Vec2 = {
    x: clamp(jawRight.x + 0.02, 0.05, 0.95),
    y: clamp(jawRight.y + neckDrop, 0.1, 1.0),
  };

  // Ear estimations (anatomical placement between eye line and nose base)
  // MediaPipe Face Mesh landmarks 234 and 454 correspond to the preauricular cheek/zygomatic base.
  // In true frontal view, the visible pinna projects only subtly (10-15px on canvas), closely hugging the cranial contour.
  const leftEarTip = getPt(landmarks, LM.LEFT_EAR_TIP);
  const rightEarTip = getPt(landmarks, LM.RIGHT_EAR_TIP);
  const earTopY = (leftPupil.y + rightPupil.y) / 2 - faceHeight * 0.025;
  const earBottomY = noseTip.y + faceHeight * 0.01;
  const earMidY = (earTopY + earBottomY) / 2;
  const earW = Math.max(0.012, Math.min(0.024, faceWidth * 0.08));

  const leftEar: Vec2[] = [
    { x: leftEarTip.x, y: earTopY },
    { x: leftEarTip.x - earW * 0.85, y: earTopY + faceHeight * 0.02 },
    { x: leftEarTip.x - earW, y: earMidY },
    { x: leftEarTip.x - earW * 0.70, y: earBottomY },
    { x: leftEarTip.x, y: earBottomY - faceHeight * 0.015 },
  ];

  const rightEar: Vec2[] = [
    { x: rightEarTip.x, y: earTopY },
    { x: rightEarTip.x + earW * 0.85, y: earTopY + faceHeight * 0.02 },
    { x: rightEarTip.x + earW, y: earMidY },
    { x: rightEarTip.x + earW * 0.70, y: earBottomY },
    { x: rightEarTip.x, y: earBottomY - faceHeight * 0.015 },
  ];

  // Eyes detailed curves
  const leftEyeUpper = mapIndices(landmarks, LM.LEFT_EYE_UPPER);
  const leftEyeLower = mapIndices(landmarks, LM.LEFT_EYE_LOWER);
  const rightEyeUpper = mapIndices(landmarks, LM.RIGHT_EYE_UPPER);
  const rightEyeLower = mapIndices(landmarks, LM.RIGHT_EYE_LOWER);

  // Eyebrows detailed curves
  const leftEyebrowUpper = mapIndices(landmarks, LM.LEFT_EYEBROW_UPPER);
  const leftEyebrowLower = mapIndices(landmarks, LM.LEFT_EYEBROW_LOWER);
  const rightEyebrowUpper = mapIndices(landmarks, LM.RIGHT_EYEBROW_UPPER);
  const rightEyebrowLower = mapIndices(landmarks, LM.RIGHT_EYEBROW_LOWER);

  // Alar wings & detailed nose geometry
  const leftAlarWing = mapIndices(landmarks, LM.NOSE_LEFT_WING);
  const rightAlarWing = mapIndices(landmarks, LM.NOSE_RIGHT_WING);
  const subnasale = getPt(landmarks, LM.SUBNASALE);
  const nasion = getPt(landmarks, LM.NASION);
  const leftNostrilContour = mapIndices(landmarks, LM.LEFT_NOSTRIL_CONTOUR);
  const rightNostrilContour = mapIndices(landmarks, LM.RIGHT_NOSTRIL_CONTOUR);
  const leftNasalSidewall = mapIndices(landmarks, LM.LEFT_NASAL_SIDEWALL);
  const rightNasalSidewall = mapIndices(landmarks, LM.RIGHT_NASAL_SIDEWALL);

  // Lips detailed outer and inner
  const upperLipOuter = mapIndices(landmarks, LM.UPPER_LIP_OUTER);
  const upperLipInner = mapIndices(landmarks, LM.UPPER_LIP_INNER);
  const lowerLipOuter = mapIndices(landmarks, LM.LOWER_LIP_OUTER);
  const lowerLipInner = mapIndices(landmarks, LM.LOWER_LIP_INNER);

  // Structural planes
  const foreheadHairline = mapIndices(landmarks, LM.FOREHEAD_HAIRLINE);
  const leftCheekPlane = mapIndices(landmarks, LM.LEFT_CHEEK_PLANE);
  const rightCheekPlane = mapIndices(landmarks, LM.RIGHT_CHEEK_PLANE);
  const chinCrest = mapIndices(landmarks, LM.CHIN_CREST);

  // Eyelid creases, nasolabial folds, and mental crease
  const leftEyeCrease = mapIndices(landmarks, LM.LEFT_EYELID_CREASE);
  const rightEyeCrease = mapIndices(landmarks, LM.RIGHT_EYELID_CREASE);
  const leftNasolabial = mapIndices(landmarks, LM.LEFT_NASOLABIAL);
  const rightNasolabial = mapIndices(landmarks, LM.RIGHT_NASOLABIAL);
  const mentalCrease = mapIndices(landmarks, LM.MENTAL_CREASE);
  const allLandmarks = (landmarks || []).map((pt) => clampVec2({ x: pt.x, y: pt.y }));

  // Mandibular corners
  const leftMandibularCorner = getPt(landmarks, LM.JAW_BOTTOM_LEFT);
  const rightMandibularCorner = getPt(landmarks, LM.JAW_BOTTOM_RIGHT);
  const glabella = getPt(landmarks, LM.GLABELLA);
  const philtrum = getPt(landmarks, LM.PHILTRUM);

  return {
    faceOutline,
    jawline,
    leftEyeContour,
    rightEyeContour,
    leftEyeUpper,
    leftEyeLower,
    rightEyeUpper,
    rightEyeLower,
    leftPupil,
    rightPupil,
    leftIrisRadius,
    rightIrisRadius,
    leftIrisContour,
    rightIrisContour,
    leftEyeOpeningHeight,
    rightEyeOpeningHeight,
    leftEyebrow,
    rightEyebrow,
    leftEyebrowUpper,
    leftEyebrowLower,
    rightEyebrowUpper,
    rightEyebrowLower,
    noseBridge,
    noseTip,
    noseBottom,
    leftNostril,
    rightNostril,
    leftAlarWing,
    rightAlarWing,
    subnasale,
    nasion,
    leftNostrilContour,
    rightNostrilContour,
    leftNasalSidewall,
    rightNasalSidewall,
    upperLip,
    lowerLip,
    upperLipOuter,
    upperLipInner,
    lowerLipOuter,
    lowerLipInner,
    mouthCenter,
    leftEar,
    rightEar,
    foreheadTop,
    foreheadHairline,
    templeLeft,
    templeRight,
    chinTip,
    chinCrest,
    leftCheekPlane,
    rightCheekPlane,
    leftMandibularCorner,
    rightMandibularCorner,
    neckLeft,
    neckRight,
    glabella,
    philtrum,
    leftEyeCrease,
    rightEyeCrease,
    leftNasolabial,
    rightNasolabial,
    mentalCrease,
    allLandmarks,
  };
}

/**
 * Constrains a pupil coordinate strictly within the bounds of the upper and lower eyelids
 */
export function constrainPupilToEyeContour(
  pupil: Vec2,
  eyeUpper: Vec2[],
  eyeLower: Vec2[]
): Vec2 {
  if (eyeUpper.length < 2 || eyeLower.length < 2) return pupil;

  // Find average Y bounds near pupil.x
  let minY = 1;
  let maxY = 0;
  for (const pt of eyeUpper) {
    if (Math.abs(pt.x - pupil.x) < 0.035) {
      if (pt.y < minY) minY = pt.y;
    }
  }
  for (const pt of eyeLower) {
    if (Math.abs(pt.x - pupil.x) < 0.035) {
      if (pt.y > maxY) maxY = pt.y;
    }
  }

  if (minY >= maxY) {
    minY = Math.min(...eyeUpper.map((p) => p.y));
    maxY = Math.max(...eyeLower.map((p) => p.y));
  }

  const margin = (maxY - minY) * 0.15;
  const safeY = clamp(pupil.y, minY + margin, maxY - margin);

  // Horizontal bounds
  const minX = Math.min(eyeUpper[0].x, eyeUpper[eyeUpper.length - 1].x);
  const maxX = Math.max(eyeUpper[0].x, eyeUpper[eyeUpper.length - 1].x);
  const safeX = clamp(pupil.x, minX + 0.004, maxX - 0.004);

  return { x: safeX, y: safeY };
}

/**
 * Checks whether the mouth has an open smile showing teeth
 */
export function isSmileOpen(
  upperLipInner: Vec2[],
  lowerLipInner: Vec2[],
  imgDim?: { width: number; height: number }
): boolean {
  if (upperLipInner.length < 6 || lowerLipInner.length < 6) return false;
  const h = imgDim?.height ?? 1000;
  const midUpper = upperLipInner[5] || upperLipInner[Math.floor(upperLipInner.length / 2)];
  const midLower = lowerLipInner[5] || lowerLipInner[Math.floor(lowerLipInner.length / 2)];
  const gapPx = (midLower.y - midUpper.y) * h;
  return gapPx > 14;
}

/**
 * Classifies face shape based on true physical facial proportions (aspect-ratio corrected)
 */
export function classifyFaceShape(
  features: FacialFeatures,
  imgDim?: { width: number; height: number }
): FaceShape {
  const { foreheadTop, chinTip, templeLeft, templeRight, jawline } = features;
  const w = imgDim?.width ?? 1000;
  const h = imgDim?.height ?? 1000;

  const faceHeightPx = Math.max(10, (chinTip.y - foreheadTop.y) * h);
  const cheekWidthDx = (templeRight.x - templeLeft.x) * w;
  const cheekWidthDy = (templeRight.y - templeLeft.y) * h;
  const cheekWidthPx = Math.max(10, Math.sqrt(cheekWidthDx * cheekWidthDx + cheekWidthDy * cheekWidthDy));

  // Measure jaw width from lower jaw points
  const leftJawPt = jawline[Math.floor(jawline.length * 0.25)] || templeLeft;
  const rightJawPt = jawline[Math.floor(jawline.length * 0.75)] || templeRight;
  const jawDx = (rightJawPt.x - leftJawPt.x) * w;
  const jawDy = (rightJawPt.y - leftJawPt.y) * h;
  const jawWidthPx = Math.sqrt(jawDx * jawDx + jawDy * jawDy);

  const ratio = cheekWidthPx / faceHeightPx;
  const jawToCheekRatio = jawWidthPx / cheekWidthPx;

  // Classification rules based on physical human skull anthropometry
  if (ratio > 0.86) {
    return jawToCheekRatio > 0.80 ? 'square' : 'round';
  } else if (ratio < 0.68) {
    return 'oblong';
  } else if (jawToCheekRatio < 0.65) {
    return 'heart';
  } else {
    return 'oval';
  }
}

/**
 * Computes face rotation (roll angle), center, and bounding dimensions
 */
export function computeFaceMetrics(
  features: FacialFeatures,
  imgDim?: { width: number; height: number }
): {
  faceCenter: Vec2;
  faceWidth: number;
  faceHeight: number;
  faceAngle: number;
} {
  const { leftPupil, rightPupil, foreheadTop, chinTip, templeLeft, templeRight } = features;
  const w = imgDim?.width ?? 1000;
  const h = imgDim?.height ?? 1000;

  const eyeMid = midpoint(leftPupil, rightPupil);
  const vertMid = midpoint(foreheadTop, chinTip);
  const faceCenter: Vec2 = {
    x: (eyeMid.x + vertMid.x) / 2,
    y: (eyeMid.y + vertMid.y) / 2,
  };

  const dx = (templeRight.x - templeLeft.x) * w;
  const dy = (templeRight.y - templeLeft.y) * h;
  const faceWidth = Math.sqrt(dx * dx + dy * dy) / w;
  const faceHeight = Math.max(0.05, chinTip.y - foreheadTop.y);

  // Roll angle in radians (horizontal = 0)
  const faceAngle = Math.atan2((rightPupil.y - leftPupil.y) * h, (rightPupil.x - leftPupil.x) * w);

  return {
    faceCenter,
    faceWidth,
    faceHeight,
    faceAngle,
  };
}
