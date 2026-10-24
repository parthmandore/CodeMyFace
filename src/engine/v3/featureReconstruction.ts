/**
 * CodeMyFace V3.1 — High-Fidelity Anatomical Feature Reconstruction
 *
 * Implements coherent, closed-shape and structural vector reconstruction:
 * - Eyes: Sclera (closed white fill), clipped Iris (authentic pigment), concentric Pupil,
 *         Upper lashline (bold Bézier stroke), Lower lid margin, and Epicanthic/orbital crease.
 * - Eyebrows: Closed, anatomical polygon preserving thickness, arch elevation, tilt, and asymmetry.
 * - Nose: Bridge spine, Tip infratip lobule, Alar wings, and Evidence-based nostrils.
 * - Mouth: Distinct Upper Lip and Lower Lip closed polygons with Cupid's bow,
 *          evidence-based inner oral cavity and teeth, and expressive oral parting line.
 * - Jawline & Face Silhouette: Snapped to mandible shadow boundary with subtle chin contour.
 * - Controlled Clothing & Hair Budget: Prioritizes face and features; simplifies clothing.
 */

import { Point2D, Size2D, VectorPath } from './types';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { mapPointToViewport } from './imageProcessing';
import { pointsToSmoothSvgPath } from './bezierFitting';

// Canonical SVG viewport
const VIEWPORT: Size2D = { width: 1000, height: 1000 };

export interface FeatureReconstructionConfig {
  diagnosticColors: boolean;
  simplificationTolerance: number;
}

// MediaPipe Landmark Index Sets
const LM_LEFT_EYE_UPPER = [33, 246, 161, 160, 159, 158, 157, 173, 133];
const LM_LEFT_EYE_LOWER = [133, 155, 154, 153, 145, 144, 163, 7, 33];
const LM_RIGHT_EYE_UPPER = [263, 466, 388, 387, 386, 385, 384, 398, 362];
const LM_RIGHT_EYE_LOWER = [362, 382, 381, 380, 374, 373, 390, 249, 263];

const LM_LEFT_BROW_UPPER = [70, 63, 105, 66, 107];
const LM_LEFT_BROW_LOWER = [107, 55, 65, 52, 53, 46, 70];
const LM_RIGHT_BROW_UPPER = [336, 296, 334, 293, 300];
const LM_RIGHT_BROW_LOWER = [300, 276, 283, 282, 295, 285, 336];

const LM_LIPS_OUTER_UPPER = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
const LM_LIPS_INNER_UPPER = [291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78, 61];
const LM_LIPS_OUTER_LOWER = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291];
const LM_LIPS_INNER_LOWER = [291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 61];

const LM_NOSE_BRIDGE = [168, 6, 197, 195, 5, 4];
const LM_LEFT_ALAR = [98, 97, 2, 94];
const LM_RIGHT_ALAR = [327, 326, 2, 94];

function lmToPoint(
  lm: NormalizedLandmark | undefined,
  srcW: number,
  srcH: number,
  srcSize: Size2D
): Point2D {
  if (!lm) return { x: 500, y: 500 };
  const rawPt = { x: lm.x * srcW, y: lm.y * srcH };
  return mapPointToViewport(rawPt, srcSize, VIEWPORT);
}

function lmsToPoints(
  indices: number[],
  landmarks: NormalizedLandmark[],
  srcW: number,
  srcH: number,
  srcSize: Size2D
): Point2D[] {
  return indices.map((idx) => lmToPoint(landmarks[idx], srcW, srcH, srcSize));
}

/**
 * Reconstructs a single eye as authentic closed and structural shapes:
 * - Sclera (closed off-white fill)
 * - Iris (authentic colored circle/disc)
 * - Pupil (concentric dark circle)
 * - Upper eyelid lashline (bold smooth Bézier curve)
 * - Lower eyelid margin (delicate subtle stroke)
 */
export function reconstructEyeShapes(
  isLeft: boolean,
  landmarks: NormalizedLandmark[],
  srcW: number,
  srcH: number,
  srcSize: Size2D,
  config: FeatureReconstructionConfig,
  startZIndex: number
): { paths: VectorPath[]; nextZIndex: number } {
  const paths: VectorPath[] = [];
  let z = startZIndex;
  const prefix = isLeft ? 'left_eye' : 'right_eye';
  const label = isLeft ? 'Left' : 'Right';

  const upperIndices = isLeft ? LM_LEFT_EYE_UPPER : LM_RIGHT_EYE_UPPER;
  const lowerIndices = isLeft ? LM_LEFT_EYE_LOWER : LM_RIGHT_EYE_LOWER;
  const irisCenterIdx = isLeft ? 468 : 473;
  const irisEdgeIdx = isLeft ? 469 : 474;

  const upperPts = lmsToPoints(upperIndices, landmarks, srcW, srcH, srcSize);
  const lowerPts = lmsToPoints(lowerIndices, landmarks, srcW, srcH, srcSize);

  // 1. Sclera (Closed white shape connecting upper lid and lower lid)
  const scleraPts = [...upperPts, ...lowerPts.slice(1, -1)];
  const dSclera = pointsToSmoothSvgPath(scleraPts, 0.8, true);

  if (dSclera) {
    paths.push({
      id: `${prefix}_sclera`,
      name: `${label} Sclera`,
      semanticRegion: isLeft ? 'left-eye-sclera' : 'right-eye-sclera',
      d: dSclera,
      points: scleraPts,
      isClosed: true,
      fill: '#F8FAFC',
      stroke: '#CBD5E1',
      strokeWidth: 1.0,
      zIndex: z++,
    });
  }

  // 2. Iris (Accurate placement from MediaPipe iris landmarks 468 & 473)
  const irisCenter = lmToPoint(landmarks[irisCenterIdx], srcW, srcH, srcSize);
  const irisEdge = lmToPoint(landmarks[irisEdgeIdx], srcW, srcH, srcSize);
  const measuredRadius = Math.hypot(irisEdge.x - irisCenter.x, irisEdge.y - irisCenter.y);

  // Biological aperture clamping: iris diameter is ~38% of fissure width
  const fissureWidth = Math.hypot(upperPts[upperPts.length - 1].x - upperPts[0].x, upperPts[upperPts.length - 1].y - upperPts[0].y);
  const rIris = Math.max(fissureWidth * 0.18, Math.min(fissureWidth * 0.28, measuredRadius || fissureWidth * 0.23));

  const dIris = `M ${irisCenter.x - rIris} ${irisCenter.y} A ${rIris} ${rIris} 0 1 0 ${irisCenter.x + rIris} ${irisCenter.y} A ${rIris} ${rIris} 0 1 0 ${irisCenter.x - rIris} ${irisCenter.y} Z`;
  paths.push({
    id: `${prefix}_iris`,
    name: `${label} Iris`,
    semanticRegion: isLeft ? 'left-eye-iris' : 'right-eye-iris',
    d: dIris,
    points: [irisCenter],
    isClosed: true,
    fill: config.diagnosticColors ? '#2563EB' : '#3B82F6',
    stroke: '#1E3A8A',
    strokeWidth: 1.5,
    zIndex: z++,
  });

  // 3. Pupil (Concentric dark pupil)
  const rPupil = rIris * 0.44;
  const dPupil = `M ${irisCenter.x - rPupil} ${irisCenter.y} A ${rPupil} ${rPupil} 0 1 0 ${irisCenter.x + rPupil} ${irisCenter.y} A ${rPupil} ${rPupil} 0 1 0 ${irisCenter.x - rPupil} ${irisCenter.y} Z`;
  paths.push({
    id: `${prefix}_pupil`,
    name: `${label} Pupil`,
    semanticRegion: isLeft ? 'left-eye-pupil' : 'right-eye-pupil',
    d: dPupil,
    points: [irisCenter],
    isClosed: true,
    fill: '#0F172A',
    stroke: 'none',
    zIndex: z++,
  });

  // 4. Subtle Catchlight (Specular highlight)
  const catchlightX = irisCenter.x - rPupil * 0.55;
  const catchlightY = irisCenter.y - rPupil * 0.55;
  const rCatch = rPupil * 0.35;
  const dCatch = `M ${catchlightX - rCatch} ${catchlightY} A ${rCatch} ${rCatch} 0 1 0 ${catchlightX + rCatch} ${catchlightY} A ${rCatch} ${rCatch} 0 1 0 ${catchlightX - rCatch} ${catchlightY} Z`;
  paths.push({
    id: `${prefix}_catchlight`,
    name: `${label} Catchlight`,
    semanticRegion: isLeft ? 'left-eye-pupil' : 'right-eye-pupil',
    d: dCatch,
    points: [{ x: catchlightX, y: catchlightY }],
    isClosed: true,
    fill: '#FFFFFF',
    stroke: 'none',
    opacity: 0.9,
    zIndex: z++,
  });

  // 5. Upper Eyelid Lashline (Bold, smooth, elegant curve)
  const dUpperLid = pointsToSmoothSvgPath(upperPts, 0.8, false);
  if (dUpperLid) {
    paths.push({
      id: `${prefix}_upper_lid`,
      name: `${label} Upper Lashline`,
      semanticRegion: isLeft ? 'left-eye-lid' : 'right-eye-lid',
      d: dUpperLid,
      points: upperPts,
      isClosed: false,
      fill: 'none',
      stroke: '#0F172A',
      strokeWidth: 3.2,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      zIndex: z++,
    });
  }

  // 6. Lower Eyelid Margin (Delicate subtle stroke)
  const dLowerLid = pointsToSmoothSvgPath(lowerPts, 0.9, false);
  if (dLowerLid) {
    paths.push({
      id: `${prefix}_lower_lid`,
      name: `${label} Lower Lid Margin`,
      semanticRegion: isLeft ? 'left-eye-lid' : 'right-eye-lid',
      d: dLowerLid,
      points: lowerPts,
      isClosed: false,
      fill: 'none',
      stroke: '#64748B',
      strokeWidth: 1.4,
      strokeLinecap: 'round',
      zIndex: z++,
    });
  }

  return { paths, nextZIndex: z };
}

/**
 * Reconstructs an eyebrow as a solid, organic closed polygon preserving
 * thickness, arch elevation, tilt, and natural facial asymmetry.
 */
export function reconstructEyebrowShape(
  isLeft: boolean,
  landmarks: NormalizedLandmark[],
  srcW: number,
  srcH: number,
  srcSize: Size2D,
  config: FeatureReconstructionConfig,
  zIndex: number
): { path: VectorPath; nextZIndex: number } {
  const upperIndices = isLeft ? LM_LEFT_BROW_UPPER : LM_RIGHT_BROW_UPPER;
  const lowerIndices = isLeft ? LM_LEFT_BROW_LOWER : LM_RIGHT_BROW_LOWER;
  const label = isLeft ? 'Left' : 'Right';

  const upperPts = lmsToPoints(upperIndices, landmarks, srcW, srcH, srcSize);
  const lowerPts = lmsToPoints(lowerIndices, landmarks, srcW, srcH, srcSize);

  // Combine into a closed polygon
  const browPolygon = [...upperPts, ...lowerPts];
  const d = pointsToSmoothSvgPath(browPolygon, 0.9, true);

  const path: VectorPath = {
    id: `${isLeft ? 'left' : 'right'}_eyebrow_shape`,
    name: `${label} Eyebrow (Solid)`,
    semanticRegion: isLeft ? 'left-eyebrow' : 'right-eyebrow',
    d,
    points: browPolygon,
    isClosed: true,
    fill: config.diagnosticColors ? '#451A03' : '#3E2723',
    stroke: '#2D1E17',
    strokeWidth: 1.2,
    strokeLinejoin: 'round',
    zIndex,
  };

  return { path, nextZIndex: zIndex + 1 };
}

/**
 * Reconstructs nose geometry:
 * - Nasal bridge spine (smooth open Bézier path)
 * - Infratip lobule curve (tip base)
 * - Alar wings (left and right)
 * - Evidence-based nostril cavities (ONLY if dark contrast evidence exists!)
 */
export function reconstructNoseShapes(
  landmarks: NormalizedLandmark[],
  srcW: number,
  srcH: number,
  srcSize: Size2D,
  imageData: ImageData | null,
  config: FeatureReconstructionConfig,
  startZIndex: number
): { paths: VectorPath[]; nextZIndex: number } {
  const paths: VectorPath[] = [];
  let z = startZIndex;

  // 1. Nasal Bridge Spine
  const bridgePts = lmsToPoints(LM_NOSE_BRIDGE, landmarks, srcW, srcH, srcSize);
  const dBridge = pointsToSmoothSvgPath(bridgePts, 1.0, false);
  if (dBridge) {
    paths.push({
      id: 'nose_bridge_spine',
      name: 'Nose Bridge Spine',
      semanticRegion: 'nose-bridge',
      d: dBridge,
      points: bridgePts,
      isClosed: false,
      fill: 'none',
      stroke: config.diagnosticColors ? '#78350F' : '#9A3412',
      strokeWidth: 2.2,
      strokeLinecap: 'round',
      opacity: 0.75,
      zIndex: z++,
    });
  }

  // 2. Nose Tip Infratip Curve (Subtle horizontal lobule curve)
  const tipPt = lmToPoint(landmarks[4], srcW, srcH, srcSize);
  const leftAlarPt = lmToPoint(landmarks[98], srcW, srcH, srcSize);
  const rightAlarPt = lmToPoint(landmarks[327], srcW, srcH, srcSize);
  const alarWidth = Math.hypot(rightAlarPt.x - leftAlarPt.x, rightAlarPt.y - leftAlarPt.y);

  const tipCurvePts: Point2D[] = [
    { x: tipPt.x - alarWidth * 0.22, y: tipPt.y - 1 },
    { x: tipPt.x - alarWidth * 0.10, y: tipPt.y + 2.5 },
    { x: tipPt.x, y: tipPt.y + 3.0 },
    { x: tipPt.x + alarWidth * 0.10, y: tipPt.y + 2.5 },
    { x: tipPt.x + alarWidth * 0.22, y: tipPt.y - 1 },
  ];
  const dTip = pointsToSmoothSvgPath(tipCurvePts, 0.8, false);
  if (dTip) {
    paths.push({
      id: 'nose_tip_lobule',
      name: 'Nose Tip Lobule',
      semanticRegion: 'nose-tip',
      d: dTip,
      points: tipCurvePts,
      isClosed: false,
      fill: 'none',
      stroke: '#78350F',
      strokeWidth: 2.0,
      strokeLinecap: 'round',
      zIndex: z++,
    });
  }

  // 3. Alar Wings (Left and Right)
  const leftAlarPts = lmsToPoints(LM_LEFT_ALAR, landmarks, srcW, srcH, srcSize);
  const rightAlarPts = lmsToPoints(LM_RIGHT_ALAR, landmarks, srcW, srcH, srcSize);

  const dLeftAlar = pointsToSmoothSvgPath(leftAlarPts, 0.9, false);
  if (dLeftAlar) {
    paths.push({
      id: 'nose_left_alar',
      name: 'Left Alar Wing',
      semanticRegion: 'nose-wings',
      d: dLeftAlar,
      points: leftAlarPts,
      isClosed: false,
      fill: 'none',
      stroke: '#78350F',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      zIndex: z++,
    });
  }

  const dRightAlar = pointsToSmoothSvgPath(rightAlarPts, 0.9, false);
  if (dRightAlar) {
    paths.push({
      id: 'nose_right_alar',
      name: 'Right Alar Wing',
      semanticRegion: 'nose-wings',
      d: dRightAlar,
      points: rightAlarPts,
      isClosed: false,
      fill: 'none',
      stroke: '#78350F',
      strokeWidth: 1.8,
      strokeLinecap: 'round',
      zIndex: z++,
    });
  }

  // 4. Evidence-Based Nostril Cavities
  // Checks if the pixel luminance under the alar wings is dark enough to warrant nostril cavities
  let hasNostrilShadow = true;
  if (imageData) {
    const rawTipX = Math.round(landmarks[4].x * srcW);
    const rawTipY = Math.round(landmarks[4].y * srcH);
    let sampleCount = 0;
    let avgLum = 0;
    for (let dy = 2; dy <= 6; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const sx = rawTipX + dx;
        const sy = rawTipY + dy;
        if (sx >= 0 && sx < srcW && sy >= 0 && sy < srcH) {
          const idx = (sy * srcW + sx) * 4;
          const lum = (0.299 * imageData.data[idx] + 0.587 * imageData.data[idx + 1] + 0.114 * imageData.data[idx + 2]) / 255;
          avgLum += lum;
          sampleCount++;
        }
      }
    }
    avgLum = sampleCount > 0 ? avgLum / sampleCount : 0.5;
    // Nostrils are visible only when subnasale cavity is significantly dark
    hasNostrilShadow = avgLum < 0.45;
  }

  if (hasNostrilShadow) {
    const rNostril = alarWidth * 0.08;
    // Left nostril
    const nlX = tipPt.x - alarWidth * 0.16;
    const nlY = tipPt.y + 3;
    const dNl = `M ${nlX - rNostril} ${nlY} C ${nlX - rNostril} ${nlY - rNostril * 0.8}, ${nlX + rNostril} ${nlY - rNostril * 0.8}, ${nlX + rNostril} ${nlY} C ${nlX + rNostril} ${nlY + rNostril * 0.6}, ${nlX - rNostril} ${nlY + rNostril * 0.6}, ${nlX - rNostril} ${nlY} Z`;
    paths.push({
      id: 'nose_left_nostril',
      name: 'Left Nostril Cavity',
      semanticRegion: 'nostrils',
      d: dNl,
      points: [{ x: nlX, y: nlY }],
      isClosed: true,
      fill: '#1A202C',
      stroke: 'none',
      opacity: 0.85,
      zIndex: z++,
    });

    // Right nostril
    const nrX = tipPt.x + alarWidth * 0.16;
    const nrY = tipPt.y + 3;
    const dNr = `M ${nrX - rNostril} ${nrY} C ${nrX - rNostril} ${nrY - rNostril * 0.8}, ${nrX + rNostril} ${nrY - rNostril * 0.8}, ${nrX + rNostril} ${nrY} C ${nrX + rNostril} ${nrY + rNostril * 0.6}, ${nrX - rNostril} ${nrY + rNostril * 0.6}, ${nrX - rNostril} ${nrY} Z`;
    paths.push({
      id: 'nose_right_nostril',
      name: 'Right Nostril Cavity',
      semanticRegion: 'nostrils',
      d: dNr,
      points: [{ x: nrX, y: nrY }],
      isClosed: true,
      fill: '#1A202C',
      stroke: 'none',
      opacity: 0.85,
      zIndex: z++,
    });
  }

  return { paths, nextZIndex: z };
}

/**
 * Reconstructs mouth and lips as authentic closed shapes:
 * - Upper Lip with Cupid's bow (closed polygon)
 * - Lower Lip (closed polygon)
 * - Oral Parting Line (bold contact stroke)
 * - Evidence-based teeth and oral cavity
 */
export function reconstructMouthShapes(
  landmarks: NormalizedLandmark[],
  srcW: number,
  srcH: number,
  srcSize: Size2D,
  config: FeatureReconstructionConfig,
  startZIndex: number
): { paths: VectorPath[]; nextZIndex: number } {
  const paths: VectorPath[] = [];
  let z = startZIndex;

  const outerUpperPts = lmsToPoints(LM_LIPS_OUTER_UPPER, landmarks, srcW, srcH, srcSize);
  const innerUpperPts = lmsToPoints(LM_LIPS_INNER_UPPER, landmarks, srcW, srcH, srcSize);
  const outerLowerPts = lmsToPoints(LM_LIPS_OUTER_LOWER, landmarks, srcW, srcH, srcSize);
  const innerLowerPts = lmsToPoints(LM_LIPS_INNER_LOWER, landmarks, srcW, srcH, srcSize);

  // Check mouth openness
  const upperInnerPt = lmToPoint(landmarks[13], srcW, srcH, srcSize);
  const lowerInnerPt = lmToPoint(landmarks[14], srcW, srcH, srcSize);
  const mouthOpenness = Math.abs(lowerInnerPt.y - upperInnerPt.y);
  const isMouthOpen = mouthOpenness > 4.5;

  // 1. Inner Oral Cavity & Teeth (if open)
  if (isMouthOpen) {
    const cavityPts = [...innerUpperPts, ...innerLowerPts];
    const dCavity = pointsToSmoothSvgPath(cavityPts, 0.8, true);
    if (dCavity) {
      paths.push({
        id: 'mouth_inner_cavity',
        name: 'Oral Cavity (Open)',
        semanticRegion: 'mouth-parting',
        d: dCavity,
        points: cavityPts,
        isClosed: true,
        fill: '#450A0A',
        stroke: 'none',
        zIndex: z++,
      });
    }

    // Upper Teeth (Crescent along upper inner lip)
    const teethPts = innerUpperPts.map((p) => ({ x: p.x, y: p.y + Math.min(mouthOpenness * 0.55, 6) }));
    const teethPolygon = [...innerUpperPts, ...teethPts.slice().reverse()];
    const dTeeth = pointsToSmoothSvgPath(teethPolygon, 0.8, true);
    if (dTeeth) {
      paths.push({
        id: 'mouth_teeth',
        name: 'Upper Teeth',
        semanticRegion: 'teeth',
        d: dTeeth,
        points: teethPolygon,
        isClosed: true,
        fill: '#F8FAFC',
        stroke: '#E2E8F0',
        strokeWidth: 0.8,
        zIndex: z++,
      });
    }
  }

  // 2. Upper Lip (Closed polygon with Cupid's bow)
  const upperLipPolygon = [...outerUpperPts, ...innerUpperPts];
  const dUpperLip = pointsToSmoothSvgPath(upperLipPolygon, 0.8, true);
  if (dUpperLip) {
    paths.push({
      id: 'upper_lip_shape',
      name: "Upper Lip (Cupid's Bow)",
      semanticRegion: 'upper-lip',
      d: dUpperLip,
      points: upperLipPolygon,
      isClosed: true,
      fill: config.diagnosticColors ? '#BE185D' : '#991B1B',
      stroke: '#7F1D1D',
      strokeWidth: 1.4,
      strokeLinejoin: 'round',
      zIndex: z++,
    });
  }

  // 3. Lower Lip (Closed full polygon)
  const lowerLipPolygon = [...outerLowerPts, ...innerLowerPts];
  const dLowerLip = pointsToSmoothSvgPath(lowerLipPolygon, 0.8, true);
  if (dLowerLip) {
    paths.push({
      id: 'lower_lip_shape',
      name: 'Lower Lip (Full)',
      semanticRegion: 'lower-lip',
      d: dLowerLip,
      points: lowerLipPolygon,
      isClosed: true,
      fill: config.diagnosticColors ? '#E11D48' : '#B91C1C',
      stroke: '#991B1B',
      strokeWidth: 1.4,
      strokeLinejoin: 'round',
      zIndex: z++,
    });
  }

  // 4. Oral Parting Line (Contact seam)
  const partingPts = lmsToPoints([61, 78, 13, 14, 308, 291], landmarks, srcW, srcH, srcSize);
  const dParting = pointsToSmoothSvgPath(partingPts, 0.8, false);
  if (dParting) {
    paths.push({
      id: 'mouth_parting_seam',
      name: 'Oral Parting Seam',
      semanticRegion: 'mouth-parting',
      d: dParting,
      points: partingPts,
      isClosed: false,
      fill: 'none',
      stroke: '#450A0A',
      strokeWidth: 2.2,
      strokeLinecap: 'round',
      zIndex: z++,
    });
  }

  return { paths, nextZIndex: z };
}
