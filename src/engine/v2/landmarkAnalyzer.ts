/**
 * CodeMyFace Engine V2 — Phase 1: Landmark Analyzer
 *
 * Implements Part B:
 * - Maps MediaPipe 478 landmarks to canonical frame coordinates
 * - Extracts structured anatomical groups:
 *   - Face outline and mandibular jawline
 *   - Eye contours, lid creases, eye centers, and pupils/irises
 *   - Eyebrow contours, heads, arches, and tails
 *   - Nose bridge, tip, subnasale, alar wings, and nostrils
 *   - Mouth, lips, Cupid's bow, and commissures
 *   - Chin tip and mental crest
 *   - Ears (preauricular facial anchors)
 *   - Forehead and hairline landmarks
 * - Strictly separates facial landmarks from hair boundaries (hair is non-landmark)
 */

import { Vec2 } from '../../types/portrait';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import {
  CoordinateTransform2D,
  NormalizedFacialLandmarks,
  AnatomicalLandmarkGroup,
} from './types';
import * as LM from '../landmarkIndices';

function distance(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Maps a list of landmark indices into an AnatomicalLandmarkGroup with both
 * canonical transformed points and raw normalized source coordinates.
 */
function buildGroup(
  name: string,
  indices: readonly number[],
  landmarks: NormalizedLandmark[],
  transform: CoordinateTransform2D
): AnatomicalLandmarkGroup {
  const rawPoints: Vec2[] = [];
  const points: Vec2[] = [];

  for (const idx of indices) {
    if (idx >= 0 && idx < landmarks.length) {
      const lm = landmarks[idx];
      const raw: Vec2 = { x: lm.x, y: lm.y };
      rawPoints.push(raw);
      points.push(transform.normalizedSourceToCanonical(raw));
    }
  }

  return {
    name,
    indices,
    rawPoints,
    points,
  };
}

function getCanonicalPt(
  index: number,
  landmarks: NormalizedLandmark[],
  transform: CoordinateTransform2D,
  fallback: Vec2
): Vec2 {
  if (index >= 0 && index < landmarks.length) {
    const lm = landmarks[index];
    return transform.normalizedSourceToCanonical({ x: lm.x, y: lm.y });
  }
  return fallback;
}

export function extractNormalizedLandmarks(
  landmarks: NormalizedLandmark[],
  transform: CoordinateTransform2D
): NormalizedFacialLandmarks {
  const allPoints: Vec2[] = landmarks.map((lm) =>
    transform.normalizedSourceToCanonical({ x: lm.x, y: lm.y })
  );

  // 1. Face Outline & Jawline
  const faceOutline = buildGroup('faceOutline', LM.FACE_OVAL, landmarks, transform);
  const jawline = buildGroup('jawline', LM.JAWLINE, landmarks, transform);

  // 2. Eyes
  const leftEyeContour = buildGroup('leftEyeContour', LM.LEFT_EYE_CONTOUR, landmarks, transform);
  const rightEyeContour = buildGroup('rightEyeContour', LM.RIGHT_EYE_CONTOUR, landmarks, transform);
  const leftEyeUpper = buildGroup('leftEyeUpper', LM.LEFT_EYE_UPPER, landmarks, transform);
  const leftEyeLower = buildGroup('leftEyeLower', LM.LEFT_EYE_LOWER, landmarks, transform);
  const rightEyeUpper = buildGroup('rightEyeUpper', LM.RIGHT_EYE_UPPER, landmarks, transform);
  const rightEyeLower = buildGroup('rightEyeLower', LM.RIGHT_EYE_LOWER, landmarks, transform);

  // Iris landmarks (468-472 left, 473-477 right)
  const hasIris = landmarks.length >= 478;
  const leftPupil = hasIris
    ? getCanonicalPt(LM.LEFT_IRIS_CENTER, landmarks, transform, { x: 420, y: 460 })
    : midpoint(leftEyeUpper.points[0] || { x: 390, y: 460 }, leftEyeUpper.points[leftEyeUpper.points.length - 1] || { x: 450, y: 460 });
  const rightPupil = hasIris
    ? getCanonicalPt(LM.RIGHT_IRIS_CENTER, landmarks, transform, { x: 580, y: 460 })
    : midpoint(rightEyeUpper.points[0] || { x: 550, y: 460 }, rightEyeUpper.points[rightEyeUpper.points.length - 1] || { x: 610, y: 460 });

  const leftIrisGroup = hasIris ? buildGroup('leftIris', LM.LEFT_IRIS, landmarks, transform) : undefined;
  const rightIrisGroup = hasIris ? buildGroup('rightIris', LM.RIGHT_IRIS, landmarks, transform) : undefined;

  const leftFissureWidth = leftEyeContour.points.length >= 9
    ? distance(leftEyeContour.points[0], leftEyeContour.points[8])
    : 60;
  const leftFissureHeight = leftEyeUpper.points.length > 4 && leftEyeLower.points.length > 4
    ? distance(leftEyeUpper.points[4], leftEyeLower.points[4])
    : 20;

  const rightFissureWidth = rightEyeContour.points.length >= 9
    ? distance(rightEyeContour.points[0], rightEyeContour.points[8])
    : 60;
  const rightFissureHeight = rightEyeUpper.points.length > 4 && rightEyeLower.points.length > 4
    ? distance(rightEyeUpper.points[4], rightEyeLower.points[4])
    : 20;

  const leftIrisRadius = leftIrisGroup && leftIrisGroup.points.length > 1
    ? distance(leftPupil, leftIrisGroup.points[1])
    : leftFissureWidth * 0.28;
  const rightIrisRadius = rightIrisGroup && rightIrisGroup.points.length > 1
    ? distance(rightPupil, rightIrisGroup.points[1])
    : rightFissureWidth * 0.28;

  // 3. Eyebrows
  const leftEyebrowContour = buildGroup('leftEyebrow', LM.LEFT_EYEBROW, landmarks, transform);
  const leftEyebrowUpper = buildGroup('leftEyebrowUpper', LM.LEFT_EYEBROW_UPPER, landmarks, transform);
  const leftEyebrowLower = buildGroup('leftEyebrowLower', LM.LEFT_EYEBROW_LOWER, landmarks, transform);
  const leftHead = leftEyebrowUpper.points[0] || { x: 380, y: 410 };
  const leftArch = leftEyebrowUpper.points[Math.floor(leftEyebrowUpper.points.length / 2)] || { x: 420, y: 400 };
  const leftTail = leftEyebrowLower.points[0] || { x: 460, y: 420 };

  const rightEyebrowContour = buildGroup('rightEyebrow', LM.RIGHT_EYEBROW, landmarks, transform);
  const rightEyebrowUpper = buildGroup('rightEyebrowUpper', LM.RIGHT_EYEBROW_UPPER, landmarks, transform);
  const rightEyebrowLower = buildGroup('rightEyebrowLower', LM.RIGHT_EYEBROW_LOWER, landmarks, transform);
  const rightHead = rightEyebrowUpper.points[0] || { x: 620, y: 410 };
  const rightArch = rightEyebrowUpper.points[Math.floor(rightEyebrowUpper.points.length / 2)] || { x: 580, y: 400 };
  const rightTail = rightEyebrowLower.points[0] || { x: 540, y: 420 };

  // 4. Nose
  const noseBridge = buildGroup('noseBridge', LM.NOSE_BRIDGE, landmarks, transform);
  const noseTip = getCanonicalPt(LM.NOSE_TIP, landmarks, transform, { x: 500, y: 540 });
  const subnasale = getCanonicalPt(LM.SUBNASALE, landmarks, transform, { x: 500, y: 565 });
  const nasion = getCanonicalPt(LM.NASION, landmarks, transform, { x: 500, y: 450 });
  const leftWing = buildGroup('noseLeftWing', LM.NOSE_LEFT_WING, landmarks, transform);
  const rightWing = buildGroup('noseRightWing', LM.NOSE_RIGHT_WING, landmarks, transform);
  const leftNostril = getCanonicalPt(LM.LEFT_NOSTRIL, landmarks, transform, { x: 480, y: 560 });
  const rightNostril = getCanonicalPt(LM.RIGHT_NOSTRIL, landmarks, transform, { x: 520, y: 560 });
  const leftSidewall = buildGroup('leftNasalSidewall', LM.LEFT_NASAL_SIDEWALL, landmarks, transform);
  const rightSidewall = buildGroup('rightNasalSidewall', LM.RIGHT_NASAL_SIDEWALL, landmarks, transform);

  const alarWidth = leftWing.points.length > 0 && rightWing.points.length > 0
    ? distance(leftWing.points[0], rightWing.points[0])
    : 70;

  // 5. Mouth & Lips
  const upperLipOuter = buildGroup('upperLipOuter', LM.UPPER_LIP_OUTER, landmarks, transform);
  const upperLipInner = buildGroup('upperLipInner', LM.UPPER_LIP_INNER, landmarks, transform);
  const lowerLipOuter = buildGroup('lowerLipOuter', LM.LOWER_LIP_OUTER, landmarks, transform);
  const lowerLipInner = buildGroup('lowerLipInner', LM.LOWER_LIP_INNER, landmarks, transform);

  const cupidsBowLeft = getCanonicalPt(LM.CUPIDS_BOW_PEAK_LEFT, landmarks, transform, { x: 485, y: 630 });
  const cupidsBowRight = getCanonicalPt(LM.CUPIDS_BOW_PEAK_RIGHT, landmarks, transform, { x: 515, y: 630 });
  const cupidsBowTrough = getCanonicalPt(LM.CUPIDS_BOW_TROUGH, landmarks, transform, { x: 500, y: 633 });
  const commissureLeft = getCanonicalPt(LM.COMMISSURE_LEFT, landmarks, transform, { x: 440, y: 645 });
  const commissureRight = getCanonicalPt(LM.COMMISSURE_RIGHT, landmarks, transform, { x: 560, y: 645 });
  const mouthCenter = getCanonicalPt(LM.MOUTH_CENTER, landmarks, transform, { x: 500, y: 645 });

  // Open mouth gap calculation
  let isSmileOpen = false;
  if (upperLipInner.points.length >= 6 && lowerLipInner.points.length >= 6) {
    const midUpperY = upperLipInner.points[5]?.y || mouthCenter.y;
    const midLowerY = lowerLipInner.points[5]?.y || mouthCenter.y;
    isSmileOpen = (midLowerY - midUpperY) > 12; // in canonical units
  }

  // 6. Chin & Jaw
  const chinTip = getCanonicalPt(LM.CHIN_TIP, landmarks, transform, { x: 500, y: 770 });
  const chinCrest = buildGroup('chinCrest', LM.CHIN_CREST, landmarks, transform);
  const leftMandibularCorner = getCanonicalPt(LM.JAW_BOTTOM_LEFT, landmarks, transform, { x: 380, y: 720 });
  const rightMandibularCorner = getCanonicalPt(LM.JAW_BOTTOM_RIGHT, landmarks, transform, { x: 620, y: 720 });

  // 7. Forehead & Hairline
  const foreheadTop = getCanonicalPt(LM.FOREHEAD_TOP, landmarks, transform, { x: 500, y: 300 });
  const foreheadHairline = buildGroup('foreheadHairline', LM.FOREHEAD_HAIRLINE, landmarks, transform);
  const templeLeft = getCanonicalPt(LM.TEMPLE_LEFT, landmarks, transform, { x: 350, y: 380 });
  const templeRight = getCanonicalPt(LM.TEMPLE_RIGHT, landmarks, transform, { x: 650, y: 380 });
  const glabella = getCanonicalPt(LM.GLABELLA, landmarks, transform, { x: 500, y: 420 });

  // 8. Ears
  const leftEarRoot = getCanonicalPt(LM.LEFT_PREAURICULAR_ANCHOR, landmarks, transform, { x: 320, y: 470 });
  const rightEarRoot = getCanonicalPt(LM.RIGHT_PREAURICULAR_ANCHOR, landmarks, transform, { x: 680, y: 470 });
  const earHeight = Math.max(80, distance(nasion, subnasale) * 1.3);
  const earWidth = 30;

  const estimatedLeftEar: Vec2[] = [
    { x: leftEarRoot.x, y: leftEarRoot.y - earHeight * 0.4 },
    { x: leftEarRoot.x - earWidth, y: leftEarRoot.y - earHeight * 0.1 },
    { x: leftEarRoot.x - earWidth * 0.9, y: leftEarRoot.y + earHeight * 0.3 },
    { x: leftEarRoot.x, y: leftEarRoot.y + earHeight * 0.5 },
  ];

  const estimatedRightEar: Vec2[] = [
    { x: rightEarRoot.x, y: rightEarRoot.y - earHeight * 0.4 },
    { x: rightEarRoot.x + earWidth, y: rightEarRoot.y - earHeight * 0.1 },
    { x: rightEarRoot.x + earWidth * 0.9, y: rightEarRoot.y + earHeight * 0.3 },
    { x: rightEarRoot.x, y: rightEarRoot.y + earHeight * 0.5 },
  ];

  return {
    totalCount: landmarks.length,
    allPoints,
    faceOutline,
    jawline,
    leftEye: {
      contour: leftEyeContour,
      upperLid: leftEyeUpper,
      lowerLid: leftEyeLower,
      pupil: leftPupil,
      irisContour: leftIrisGroup,
      irisRadius: Math.round(leftIrisRadius * 10) / 10,
      fissureWidth: Math.round(leftFissureWidth * 10) / 10,
      fissureHeight: Math.round(leftFissureHeight * 10) / 10,
    },
    rightEye: {
      contour: rightEyeContour,
      upperLid: rightEyeUpper,
      lowerLid: rightEyeLower,
      pupil: rightPupil,
      irisContour: rightIrisGroup,
      irisRadius: Math.round(rightIrisRadius * 10) / 10,
      fissureWidth: Math.round(rightFissureWidth * 10) / 10,
      fissureHeight: Math.round(rightFissureHeight * 10) / 10,
    },
    leftEyebrow: {
      contour: leftEyebrowContour,
      upper: leftEyebrowUpper,
      lower: leftEyebrowLower,
      head: leftHead,
      arch: leftArch,
      tail: leftTail,
    },
    rightEyebrow: {
      contour: rightEyebrowContour,
      upper: rightEyebrowUpper,
      lower: rightEyebrowLower,
      head: rightHead,
      arch: rightArch,
      tail: rightTail,
    },
    nose: {
      bridge: noseBridge,
      tip: noseTip,
      subnasale,
      nasion,
      leftWing,
      rightWing,
      leftNostril,
      rightNostril,
      leftSidewall,
      rightSidewall,
      alarWidth: Math.round(alarWidth * 10) / 10,
    },
    mouth: {
      upperLipOuter,
      upperLipInner,
      lowerLipOuter,
      lowerLipInner,
      cupidsBowLeft,
      cupidsBowRight,
      cupidsBowTrough,
      commissureLeft,
      commissureRight,
      center: mouthCenter,
      isSmileOpen,
    },
    chin: {
      tip: chinTip,
      crest: chinCrest,
      leftMandibularCorner,
      rightMandibularCorner,
    },
    forehead: {
      top: foreheadTop,
      hairline: foreheadHairline,
      templeLeft,
      templeRight,
      glabella,
    },
    ears: {
      leftRoot: leftEarRoot,
      rightRoot: rightEarRoot,
      estimatedLeftEar,
      estimatedRightEar,
    },
  };
}
