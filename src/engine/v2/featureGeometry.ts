/**
 * CodeMyFace Engine V2 — Phase 3: Facial Feature Geometry Reconstruction
 *
 * Implements:
 * - PART A: Image-aware eyes with realistic lids, canthi, irises, and evidence-based catchlights
 * - PART B: Anatomical eyebrows preserving thickness, curvature, and asymmetry
 * - PART C: Coherent nose geometry with bridge, alar lobules, and subtle anatomical nostrils
 * - PART D: Accurate mouth with Cupid's bow, parting line, and evidence-based teeth
 * - PART E: Proportional integrity on common canonical frame (1000x1000)
 * - PART G: Graceful failure handling with detail reduction when landmarks are uncertain
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import {
  ReconstructedEyeGeometry,
  ReconstructedEyebrowGeometry,
  ReconstructedNoseGeometry,
  ReconstructedMouthGeometry,
  FacialFeaturesGeometryV2,
} from './phase3Types';
import { ImageEvidenceResult } from './imageEvidenceSampler';

function svgNum(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Converts a series of 2D points into a smooth open Catmull-Rom SVG path
 */
function pointsToSmoothOpenPath(pts: Vec2[], tension: number = 0.18): string {
  if (!pts || pts.length < 2) return '';
  if (pts.length === 2) {
    return `M ${svgNum(pts[0].x)} ${svgNum(pts[0].y)} L ${svgNum(pts[1].x)} ${svgNum(pts[1].y)}`;
  }

  let d = `M ${svgNum(pts[0].x)} ${svgNum(pts[0].y)}`;
  const n = pts.length;

  for (let i = 0; i < n - 1; i++) {
    const p0 = i > 0 ? pts[i - 1] : pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = i < n - 2 ? pts[i + 2] : p2;

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  return d;
}

/**
 * Converts a series of 2D points into a smooth closed Catmull-Rom SVG path
 */
function pointsToSmoothClosedPath(pts: Vec2[], tension: number = 0.18): string {
  if (!pts || pts.length < 3) return '';
  const n = pts.length;
  let d = `M ${svgNum(pts[0].x)} ${svgNum(pts[0].y)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  return `${d} Z`;
}

/**
 * Reconstructs a single eye with realistic lids, canthi, iris, and optional catchlight
 */
function reconstructEye(
  contourPts: Vec2[],
  upperLidPts: Vec2[],
  lowerLidPts: Vec2[],
  pupilCenter: Vec2,
  measuredIrisRadius: number,
  isLeftEye: boolean,
  evidence: ImageEvidenceResult
): ReconstructedEyeGeometry {
  if (!contourPts || contourPts.length < 6 || !upperLidPts || !lowerLidPts) {
    // Graceful failure fallback
    const cx = pupilCenter.x;
    const cy = pupilCenter.y;
    return {
      scleraPath: `M ${cx - 25} ${cy} C ${cx - 15} ${cy - 10}, ${cx + 15} ${cy - 10}, ${cx + 25} ${cy} C ${cx + 15} ${cy + 10}, ${cx - 15} ${cy + 10}, ${cx - 25} ${cy} Z`,
      upperEyelidPath: `M ${cx - 25} ${cy} C ${cx - 15} ${cy - 10}, ${cx + 15} ${cy - 10}, ${cx + 25} ${cy}`,
      lowerEyelidPath: `M ${cx - 25} ${cy} C ${cx - 15} ${cy + 10}, ${cx + 15} ${cy + 10}, ${cx + 25} ${cy}`,
      innerCanthus: { x: cx + (isLeftEye ? 25 : -25), y: cy },
      outerCanthus: { x: cx - (isLeftEye ? 25 : -25), y: cy },
      iris: { cx, cy, r: 12 },
      pupil: { cx, cy, r: 5 },
      catchlight: null,
      metrics: { fissureWidth: 50, fissureHeight: 20, apertureRatio: 0.40, tiltAngleDegrees: 0 },
    };
  }

  // Identify canthi (medial = toward nose, lateral = toward temple)
  // Left eye in viewer perspective: outer canthus is leftmost (min X), inner is rightmost (max X)
  // Right eye: inner canthus is leftmost (min X), outer is rightmost (max X)
  const outerCanthus = isLeftEye ? upperLidPts[0] : upperLidPts[upperLidPts.length - 1];
  const innerCanthus = isLeftEye ? upperLidPts[upperLidPts.length - 1] : upperLidPts[0];

  const fissureWidth = distance(outerCanthus, innerCanthus);
  const midUpper = upperLidPts[Math.floor(upperLidPts.length / 2)];
  const midLower = lowerLidPts[Math.floor(lowerLidPts.length / 2)];
  const fissureHeight = Math.max(8, distance(midUpper, midLower));

  // Upper & lower lid paths
  const upperEyelidPath = pointsToSmoothOpenPath(upperLidPts, 0.18);
  const lowerEyelidPath = pointsToSmoothOpenPath(lowerLidPts, 0.18);

  // Closed sclera path connecting upper lid to lower lid
  const scleraPoints = [
    ...upperLidPts,
    ...lowerLidPts.slice().reverse(),
  ];
  const scleraPath = pointsToSmoothClosedPath(scleraPoints, 0.16);

  // Realistic iris radius proportional to fissure width (clamped within biological bounds)
  const boundedIrisRadius = Math.max(
    fissureWidth * 0.22,
    Math.min(fissureWidth * 0.32, measuredIrisRadius)
  );

  // Realistic pupil radius: 0.42x of iris radius
  const pupilRadius = boundedIrisRadius * 0.42;

  // Eyelid tilt angle
  const dx = innerCanthus.x - outerCanthus.x;
  const dy = innerCanthus.y - outerCanthus.y;
  const tiltAngleDegrees = Math.round((Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI) * 10) / 10;

  // Evidence-based catchlight
  const catchlight = isLeftEye ? evidence.leftCatchlight : evidence.rightCatchlight;

  return {
    scleraPath,
    upperEyelidPath,
    lowerEyelidPath,
    innerCanthus,
    outerCanthus,
    iris: {
      cx: pupilCenter.x,
      cy: pupilCenter.y,
      r: Math.round(boundedIrisRadius * 10) / 10,
    },
    pupil: {
      cx: pupilCenter.x,
      cy: pupilCenter.y,
      r: Math.round(pupilRadius * 10) / 10,
    },
    catchlight,
    metrics: {
      fissureWidth: Math.round(fissureWidth * 10) / 10,
      fissureHeight: Math.round(fissureHeight * 10) / 10,
      apertureRatio: Math.round((fissureHeight / fissureWidth) * 100) / 100,
      tiltAngleDegrees,
    },
  };
}

/**
 * Reconstructs a single eyebrow preserving arch, thickness, and asymmetry
 */
function reconstructEyebrow(
  contourPts: Vec2[],
  upperPts: Vec2[],
  lowerPts: Vec2[],
  eyePupilY: number,
  fillColor: string,
  isLeftBrow: boolean
): ReconstructedEyebrowGeometry {
  if (!contourPts || contourPts.length < 4 || !upperPts || !lowerPts) {
    // Graceful fallback
    const x0 = isLeftBrow ? 380 : 540;
    const y0 = 380;
    return {
      path: `M ${x0} ${y0} C ${x0 + 30} ${y0 - 15}, ${x0 + 60} ${y0 - 10}, ${x0 + 80} ${y0} Z`,
      spinePath: `M ${x0} ${y0} L ${x0 + 80} ${y0}`,
      head: { x: x0, y: y0 },
      arch: { x: x0 + 40, y: y0 - 12 },
      tail: { x: x0 + 80, y: y0 },
      fillColor,
      metrics: { length: 80, thickness: 12, archElevation: 12, tiltAngleDegrees: 0, distanceToEye: 35 },
    };
  }

  // Head is medial (closest to centerline x=500), tail is lateral (away from 500)
  const head = isLeftBrow
    ? (upperPts[upperPts.length - 1] || contourPts[contourPts.length - 1])
    : (upperPts[0] || contourPts[0]);
  const tail = isLeftBrow
    ? (upperPts[0] || contourPts[0])
    : (upperPts[upperPts.length - 1] || contourPts[contourPts.length - 1]);

  // Find arch apex (highest point = minimum y)
  let arch = upperPts[0];
  let minY = Infinity;
  for (const p of upperPts) {
    if (p.y < minY) {
      minY = p.y;
      arch = p;
    }
  }

  // Brow length and thickness
  const browLength = distance(head, tail);
  let totalDist = 0;
  const sampleCount = Math.min(upperPts.length, lowerPts.length);
  for (let i = 0; i < sampleCount; i++) {
    totalDist += distance(upperPts[i], lowerPts[i]);
  }
  const thickness = sampleCount > 0 ? Math.max(6, totalDist / sampleCount) : 12;

  // Smooth closed eyebrow path
  const browPath = pointsToSmoothClosedPath(contourPts, 0.20);
  const spinePath = pointsToSmoothOpenPath([head, arch, tail], 0.20);

  const archElevation = Math.round((head.y - arch.y) * 10) / 10;
  const distanceToEye = Math.round(Math.abs(eyePupilY - arch.y) * 10) / 10;
  const dx = tail.x - head.x;
  const dy = tail.y - head.y;
  const tiltAngleDegrees = Math.round((Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI) * 10) / 10;

  return {
    path: browPath,
    spinePath,
    head,
    arch,
    tail,
    fillColor,
    metrics: {
      length: Math.round(browLength * 10) / 10,
      thickness: Math.round(thickness * 10) / 10,
      archElevation,
      tiltAngleDegrees,
      distanceToEye,
    },
  };
}

/**
 * Reconstructs anatomical nose geometry
 */
function reconstructNose(
  analysis: FacialAnalysisResultV2,
  evidence: ImageEvidenceResult
): ReconstructedNoseGeometry {
  const lm = analysis.landmarks!.nose;

  // 1. Nasal bridge path (nasion to supratip break)
  const bridgePoints: Vec2[] = [
    lm.nasion,
    ...lm.bridge.points,
    lm.tip,
  ];
  const bridgePath = pointsToSmoothOpenPath(bridgePoints, 0.16);

  // 2. Nose tip infratip lobule curve (symmetrical under the apex, no plunging tail)
  const tipCurve: Vec2[] = [
    { x: lm.tip.x - 14, y: lm.tip.y - 1 },
    { x: lm.tip.x - 6, y: lm.tip.y + 1.5 },
    { x: lm.tip.x, y: lm.tip.y + 2 },
    { x: lm.tip.x + 6, y: lm.tip.y + 1.5 },
    { x: lm.tip.x + 14, y: lm.tip.y - 1 },
  ];
  const tipPath = pointsToSmoothOpenPath(tipCurve, 0.20);

  // 3. Alar wings (smooth curves)
  const leftWingPath = lm.leftWing.points.length >= 2
    ? pointsToSmoothOpenPath(lm.leftWing.points, 0.18)
    : '';
  const rightWingPath = lm.rightWing.points.length >= 2
    ? pointsToSmoothOpenPath(lm.rightWing.points, 0.18)
    : '';

  // 4. Subtle anatomical nostrils (delicate crescent shapes, NOT oversized dark beans)
  const nl = lm.leftNostril;
  const leftNostrilCurve: Vec2[] = [
    { x: nl.x - 4, y: nl.y + 1 },
    { x: nl.x, y: nl.y - 1.5 },
    { x: nl.x + 4, y: nl.y + 1 },
    { x: nl.x, y: nl.y + 2 },
  ];
  const leftNostrilPath = pointsToSmoothClosedPath(leftNostrilCurve, 0.20);

  const nr = lm.rightNostril;
  const rightNostrilCurve: Vec2[] = [
    { x: nr.x - 4, y: nr.y + 1 },
    { x: nr.x, y: nr.y - 1.5 },
    { x: nr.x + 4, y: nr.y + 1 },
    { x: nr.x, y: nr.y + 2 },
  ];
  const rightNostrilPath = pointsToSmoothClosedPath(rightNostrilCurve, 0.20);

  const alarWidth = Math.round(lm.alarWidth * 10) / 10;
  const bridgeLength = Math.round(distance(lm.nasion, lm.tip) * 10) / 10;
  const tipProtrusion = Math.round(distance(lm.tip, lm.subnasale) * 10) / 10;

  return {
    bridgePath,
    tipPath,
    leftWingPath,
    rightWingPath,
    leftNostrilPath,
    rightNostrilPath,
    nostrilColor: evidence.nostrilColor,
    metrics: {
      alarWidth,
      bridgeLength,
      tipProtrusion,
    },
  };
}

/**
 * Reconstructs accurate mouth geometry with Cupid's bow, parting line, and evidence-based teeth
 */
function reconstructMouth(
  analysis: FacialAnalysisResultV2,
  evidence: ImageEvidenceResult
): ReconstructedMouthGeometry {
  const lm = analysis.landmarks!.mouth;

  // 1. Upper lip vermilion closed path (Cupid's bow outer contour + stomion line)
  const upperLipPoints = [
    ...lm.upperLipOuter.points,
    ...lm.upperLipInner.points.slice().reverse(),
  ];
  const upperLipPath = pointsToSmoothClosedPath(upperLipPoints, 0.16);

  // 2. Lower lip vermilion closed path
  const lowerLipPoints = [
    ...lm.lowerLipOuter.points,
    ...lm.lowerLipInner.points.slice().reverse(),
  ];
  const lowerLipPath = pointsToSmoothClosedPath(lowerLipPoints, 0.16);

  // 3. Oral fissure parting line
  const partingLinePts: Vec2[] = [
    lm.commissureLeft,
    ...lm.upperLipInner.points.slice(1, -1),
    lm.commissureRight,
  ];
  const partingLinePath = pointsToSmoothOpenPath(partingLinePts, 0.16);

  const mouthWidth = Math.round(distance(lm.commissureLeft, lm.commissureRight) * 10) / 10;

  // Smile cant angle
  const dx = lm.commissureRight.x - lm.commissureLeft.x;
  const dy = lm.commissureRight.y - lm.commissureLeft.y;
  const smileCantDegrees = Math.round((Math.atan2(dy, Math.abs(dx)) * 180 / Math.PI) * 10) / 10;

  // Opening gap
  const midUpperInner = lm.upperLipInner.points[Math.floor(lm.upperLipInner.points.length / 2)] || lm.center;
  const midLowerInner = lm.lowerLipInner.points[Math.floor(lm.lowerLipInner.points.length / 2)] || lm.center;
  const openingGap = Math.max(0, Math.round((midLowerInner.y - midUpperInner.y) * 10) / 10);

  // Lip thickness
  const midUpperOuter = lm.upperLipOuter.points[Math.floor(lm.upperLipOuter.points.length / 2)] || midUpperInner;
  const midLowerOuter = lm.lowerLipOuter.points[Math.floor(lm.lowerLipOuter.points.length / 2)] || midLowerInner;
  const upperLipThickness = Math.round(distance(midUpperOuter, midUpperInner) * 10) / 10;
  const lowerLipThickness = Math.round(distance(midLowerOuter, midLowerInner) * 10) / 10;

  // 4. Evidence-based Teeth & Oral Cavity
  let teethPath: string | null = null;
  let oralCavityPath: string | null = null;

  if (evidence.mouthEvidence.isOpen && openingGap >= 5) {
    // Form oral aperture polygon
    const aperturePoints = [
      ...lm.upperLipInner.points,
      ...lm.lowerLipInner.points.slice().reverse(),
    ];
    oralCavityPath = pointsToSmoothClosedPath(aperturePoints, 0.16);

    if (evidence.mouthEvidence.hasTeeth) {
      // Build subtle curved dental arc
      const teethArc: Vec2[] = [
        { x: lm.center.x - mouthWidth * 0.28, y: midUpperInner.y + 1 },
        { x: lm.center.x - mouthWidth * 0.15, y: midUpperInner.y + openingGap * 0.75 },
        { x: lm.center.x, y: midUpperInner.y + openingGap * 0.82 },
        { x: lm.center.x + mouthWidth * 0.15, y: midUpperInner.y + openingGap * 0.75 },
        { x: lm.center.x + mouthWidth * 0.28, y: midUpperInner.y + 1 },
      ];
      teethPath = pointsToSmoothClosedPath(teethArc, 0.18);
    }
  }

  return {
    upperLipPath,
    lowerLipPath,
    partingLinePath,
    teethPath,
    oralCavityPath,
    vermilionColor: evidence.vermilionColor,
    metrics: {
      mouthWidth,
      upperLipThickness,
      lowerLipThickness,
      openingGap,
      smileCantDegrees,
      hasTeeth: evidence.mouthEvidence.hasTeeth,
      isSmileOpen: evidence.mouthEvidence.isOpen,
    },
  };
}

/**
 * Main Phase 3 Reconstruction Engine:
 * Transforms raw MediaPipe landmarks into anatomical, proportional vector facial feature geometry.
 */
export function reconstructFeatureGeometry(
  analysis: FacialAnalysisResultV2,
  evidence: ImageEvidenceResult
): FacialFeaturesGeometryV2 {
  const lm = analysis.landmarks;
  if (!lm) {
    throw new Error('Cannot reconstruct facial features: missing landmarks in analysis');
  }

  // PART A: Eyes
  const leftEye = reconstructEye(
    lm.leftEye.contour.points,
    lm.leftEye.upperLid.points,
    lm.leftEye.lowerLid.points,
    lm.leftEye.pupil,
    lm.leftEye.irisRadius,
    true,
    evidence
  );

  const rightEye = reconstructEye(
    lm.rightEye.contour.points,
    lm.rightEye.upperLid.points,
    lm.rightEye.lowerLid.points,
    lm.rightEye.pupil,
    lm.rightEye.irisRadius,
    false,
    evidence
  );

  // PART B: Eyebrows
  const leftEyebrow = reconstructEyebrow(
    lm.leftEyebrow.contour.points,
    lm.leftEyebrow.upper.points,
    lm.leftEyebrow.lower.points,
    lm.leftEye.pupil.y,
    evidence.leftEyebrowColor,
    true
  );

  const rightEyebrow = reconstructEyebrow(
    lm.rightEyebrow.contour.points,
    lm.rightEyebrow.upper.points,
    lm.rightEyebrow.lower.points,
    lm.rightEye.pupil.y,
    evidence.rightEyebrowColor,
    false
  );

  // PART C: Nose
  const nose = reconstructNose(analysis, evidence);

  // PART D: Mouth
  const mouth = reconstructMouth(analysis, evidence);

  // PART E: Proportions & Asymmetry
  const interpupillaryDistance = Math.round(distance(lm.leftEye.pupil, lm.rightEye.pupil) * 10) / 10;
  const intercanthalDistance = Math.round(distance(leftEye.innerCanthus, rightEye.innerCanthus) * 10) / 10;
  const meanEyeWidth = (leftEye.metrics.fissureWidth + rightEye.metrics.fissureWidth) / 2;
  const eyeSpacingRatio = Math.round((intercanthalDistance / Math.max(1, meanEyeWidth)) * 100) / 100;

  const eyeAsymmetry = {
    heightDifference: Math.round(Math.abs(leftEye.metrics.fissureHeight - rightEye.metrics.fissureHeight) * 10) / 10,
    tiltDifference: Math.round(Math.abs(leftEye.metrics.tiltAngleDegrees - rightEye.metrics.tiltAngleDegrees) * 10) / 10,
    widthDifference: Math.round(Math.abs(leftEye.metrics.fissureWidth - rightEye.metrics.fissureWidth) * 10) / 10,
  };

  const eyebrowAsymmetry = {
    heightDifference: Math.round(Math.abs(leftEyebrow.arch.y - rightEyebrow.arch.y) * 10) / 10,
    thicknessDifference: Math.round(Math.abs(leftEyebrow.metrics.thickness - rightEyebrow.metrics.thickness) * 10) / 10,
    archDifference: Math.round(Math.abs(leftEyebrow.metrics.archElevation - rightEyebrow.metrics.archElevation) * 10) / 10,
  };

  const mouthAsymmetry = {
    smileCantDegrees: mouth.metrics.smileCantDegrees,
    commissureHeightDifference: Math.round(Math.abs(lm.mouth.commissureLeft.y - lm.mouth.commissureRight.y) * 10) / 10,
  };

  return {
    leftEye,
    rightEye,
    leftEyebrow,
    rightEyebrow,
    nose,
    mouth,
    proportions: {
      interpupillaryDistance,
      intercanthalDistance,
      eyeSpacingRatio,
      eyeAsymmetry,
      eyebrowAsymmetry,
      mouthAsymmetry,
    },
    diagnosticStatus: 'FULL_DETAIL_RECONSTRUCTED',
  };
}
