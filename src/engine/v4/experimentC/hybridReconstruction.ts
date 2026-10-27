/**
 * CodeMyFace V4 — Experiment C: Hybrid Adaptive Vector Reconstruction (V4.6 Digital Painting)
 *
 * Combines organic volumetric planar segmentation (Exp A) with source-grounded anatomical
 * features (Exp B). Delivers beautiful, recognizable digital portrait paintings with living,
 * expressive eyes, natural smiles, sculptural hair volumes, and harmoniously balanced clothing.
 */

import { ColorPaletteAnalysis, V4CandidateResult, V4ExperimentOptions } from '../types';
import { NormalizedLandmark } from '../../../services/faceDetection/types';
import { pointsToSmoothClosedPath, pointsToSmoothOpenPath } from '../experimentB/sourceGuidedReconstruction';
import { hexToRgb, rgbToHex } from '../colorAnalysis';
import { optimizeSvgDocument } from '../svgOptimizer';

export interface HybridReconstructionInput {
  canvas?: HTMLCanvasElement;
  width: number;
  height: number;
  landmarks: NormalizedLandmark[];
  colorPalette: ColorPaletteAnalysis;
  baseSvg?: string;
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null;
  options?: V4ExperimentOptions;
}

// ============================================================================
// V4.6 Digital Painting Anatomical Constants
// All numbers have explicit units and documented rationale.
// ============================================================================

/** Canonical reference eye fissure width, in pixels, for medium portrait at 600x800 resolution.
 * Reason: 65.0 px represents an authentic human eye width in a typical desktop portrait frame. */
export const REFERENCE_EYE_WIDTH_PX = 65.0;

/** Minimum scaling factor for eye strokes on distant faces.
 * Reason: 0.28 ensures strokes never scale down to 0 while keeping small distant eyes open and distinct. */
export const MIN_EYE_SCALE = 0.28;

/** Maximum scaling factor for eye strokes on extreme close-ups.
 * Reason: 1.35 ensures close-up lash lines maintain delicate painterly quality without heavy ink lines. */
export const MAX_EYE_SCALE = 1.35;

/** Base upper eyelash line stroke width at reference scale, in pixels.
 * Reason: 1.3 px provides clear, elegant lash definition without heavy marker-pen cartoon lines. */
export const UPPER_LASH_STROKE_WIDTH_PX = 1.3;

/** Base lower eyelash line stroke width at reference scale, in pixels.
 * Reason: 0.5 px provides subtle, delicate lower lid framing without drawing dark mascara rings. */
export const LOWER_LASH_STROKE_WIDTH_PX = 0.5;

/** Base upper eyelid crease fold stroke width at reference scale, in pixels.
 * Reason: 0.7 px softly suggests the supratarsal fold without creating a scar-like line. */
export const CREASE_STROKE_WIDTH_PX = 0.7;

/** Iris limbal ring stroke width, in pixels.
 * Reason: 1.0 px defines the outer perimeter of the cornea, giving depth and living vitality. */
export const LIMBAL_RING_STROKE_WIDTH_PX = 1.0;

/** Natural anatomical ratio of iris radius to eye fissure width.
 * Reason: 0.23 matches authentic human facial proportions (cornea ~11.5mm vs fissure ~25-28mm). */
export const IRIS_RADIUS_RATIO = 0.23;

/** Pupil radius ratio relative to iris radius.
 * Reason: 0.38 provides realistic daylight pupil dilation without black doll eyes. */
export const PUPIL_RADIUS_RATIO = 0.38;

/** Specular catchlight radius relative to iris radius.
 * Reason: 0.15 creates a subtle, believable photographic reflection of ambient key light. */
export const CATCHLIGHT_RADIUS_RATIO = 0.15;

/** Under-chin planar anchor shadow opacity in normalized [0, 1] units.
 * Reason: 0.16 softly anchors the jawline against the neck without harsh outlines. */
export const UNDER_CHIN_SHADOW_OPACITY = 0.16;

/** Minimum vertical lip opening gap in pixels to trigger open-mouth smile / teeth rendering.
 * Reason: 4.0 px cleanly differentiates genuinely exposed teeth from closed or resting vermilion contact. */
export const HYBRID_MOUTH_OPEN_THRESHOLD_PX = 4.0;

interface Pt {
  x: number;
  y: number;
}

function toPixel(lm: NormalizedLandmark | undefined, width: number, height: number): Pt {
  if (!lm) return { x: width * 0.5, y: height * 0.5 };
  return {
    x: Math.round(lm.x * width * 10) / 10,
    y: Math.round(lm.y * height * 10) / 10,
  };
}

/**
 * Renders source-grounded anatomical facial features for a single detected face.
 */
function renderSingleFaceFeatures(
  faceLandmarks: NormalizedLandmark[],
  faceIndex: number,
  width: number,
  height: number,
  colorPalette: ColorPaletteAnalysis,
  hasGlasses: boolean,
  options?: V4ExperimentOptions
): { defs: string; markup: string } {
  if (!faceLandmarks || faceLandmarks.length < 33) {
    return { defs: '', markup: '' };
  }

  const ctrl = options?.styleControls;
  const edgeStrength = ctrl?.edgeStrength ?? 3; // 1 to 5

  const baseUpperLashWidth = 0.9 + edgeStrength * 0.16;
  const lowerLashOpacity = (0.18 + edgeStrength * 0.05).toFixed(2);
  const creaseOpacity = (0.14 + edgeStrength * 0.04).toFixed(2);
  const nostrilOpacity = (0.35 + edgeStrength * 0.08).toFixed(2);
  const browOpacity = (0.76 + edgeStrength * 0.05).toFixed(2);

  const toPx = (idx: number) => toPixel(faceLandmarks[idx], width, height);

  // 1. High-Fidelity Anatomical Eyes
  // Left eye landmarks: 33 (inner corner) through 133 (outer corner)
  const leftEyeOuterIndices = [33, 246, 161, 160, 159, 158, 157, 173, 133, 155, 154, 153, 145, 144, 163, 7];
  const leftEyeUpperIndices = [33, 246, 161, 160, 159, 158, 157, 173, 133];
  const leftEyeLowerIndices = [133, 155, 154, 153, 145, 144, 163];
  const leftEyePts = leftEyeOuterIndices.map(toPx);
  const leftEyeUpperPts = leftEyeUpperIndices.map(toPx);
  const leftEyeLowerPts = leftEyeLowerIndices.map(toPx);

  const leftEyeScleraPath = pointsToSmoothClosedPath(leftEyePts, 0.36);
  const leftEyeUpperLash = pointsToSmoothOpenPath(leftEyeUpperPts, 0.38);
  const leftEyeLowerLash = pointsToSmoothOpenPath(leftEyeLowerPts, 0.38);

  // Right eye landmarks: 362 (inner corner) through 263 (outer corner)
  const rightEyeOuterIndices = [362, 398, 384, 385, 386, 387, 388, 466, 263, 249, 390, 373, 374, 380, 381, 382];
  const rightEyeUpperIndices = [362, 398, 384, 385, 386, 387, 388, 466, 263];
  const rightEyeLowerIndices = [263, 249, 390, 373, 374, 380, 381];
  const rightEyePts = rightEyeOuterIndices.map(toPx);
  const rightEyeUpperPts = rightEyeUpperIndices.map(toPx);
  const rightEyeLowerPts = rightEyeLowerIndices.map(toPx);

  const rightEyeScleraPath = pointsToSmoothClosedPath(rightEyePts, 0.36);
  const rightEyeUpperLash = pointsToSmoothOpenPath(rightEyeUpperPts, 0.38);
  const rightEyeLowerLash = pointsToSmoothOpenPath(rightEyeLowerPts, 0.38);

  // Eye dimensions & scale factors
  const leftCornerDist = Math.hypot(toPx(133).x - toPx(33).x, toPx(133).y - toPx(33).y);
  const leftHeightDist = Math.hypot(toPx(159).x - toPx(145).x, toPx(159).y - toPx(145).y);
  const leftEyeWidth = Math.max(leftCornerDist, leftHeightDist * 1.8);
  const leftEyeHeight = Math.max(1.5, leftHeightDist);
  const leftScale = Math.max(MIN_EYE_SCALE, Math.min(MAX_EYE_SCALE, leftEyeWidth / REFERENCE_EYE_WIDTH_PX));

  const rightCornerDist = Math.hypot(toPx(263).x - toPx(362).x, toPx(263).y - toPx(362).y);
  const rightHeightDist = Math.hypot(toPx(386).x - toPx(374).x, toPx(386).y - toPx(374).y);
  const rightEyeWidth = Math.max(rightCornerDist, rightHeightDist * 1.8);
  const rightEyeHeight = Math.max(1.5, rightHeightDist);
  const rightScale = Math.max(MIN_EYE_SCALE, Math.min(MAX_EYE_SCALE, rightEyeWidth / REFERENCE_EYE_WIDTH_PX));

  // Iris centers
  const leftIrisCenter = faceLandmarks[468] ? toPixel(faceLandmarks[468], width, height) : {
    x: (toPx(33).x + toPx(133).x) / 2,
    y: (toPx(159).y + toPx(145).y) / 2,
  };

  let leftIrisRadius = 0;
  if (faceLandmarks[469] && faceLandmarks[471]) {
    leftIrisRadius = Math.hypot(toPx(469).x - toPx(471).x, toPx(469).y - toPx(471).y) / 2;
  }
  const targetLeftIrisR = Math.max(leftEyeWidth * 0.17, Math.min(leftEyeWidth * IRIS_RADIUS_RATIO, leftEyeHeight * 0.68));
  if (leftIrisRadius < leftEyeWidth * 0.12 || leftIrisRadius > leftEyeWidth * 0.32) {
    leftIrisRadius = targetLeftIrisR;
  } else {
    leftIrisRadius = Math.min(leftIrisRadius, leftEyeHeight * 0.70);
  }

  const rightIrisCenter = faceLandmarks[473] ? toPixel(faceLandmarks[473], width, height) : {
    x: (toPx(263).x + toPx(362).x) / 2,
    y: (toPx(386).y + toPx(374).y) / 2,
  };

  let rightIrisRadius = 0;
  if (faceLandmarks[474] && faceLandmarks[476]) {
    rightIrisRadius = Math.hypot(toPx(474).x - toPx(476).x, toPx(474).y - toPx(476).y) / 2;
  }
  const targetRightIrisR = Math.max(rightEyeWidth * 0.17, Math.min(rightEyeWidth * IRIS_RADIUS_RATIO, rightEyeHeight * 0.68));
  if (rightIrisRadius < rightEyeWidth * 0.12 || rightIrisRadius > rightEyeWidth * 0.32) {
    rightIrisRadius = targetRightIrisR;
  } else {
    rightIrisRadius = Math.min(rightIrisRadius, rightEyeHeight * 0.70);
  }

  // Sclera shading tones
  const scleraRgb = colorPalette.sclera.rgb;
  const scleraCornerRgb = [
    Math.max(0, Math.round(scleraRgb[0] * 0.93)),
    Math.max(0, Math.round(scleraRgb[1] * 0.93)),
    Math.max(0, Math.round(scleraRgb[2] * 0.93)),
  ];
  const scleraCornerHex = rgbToHex(scleraCornerRgb[0], scleraCornerRgb[1], scleraCornerRgb[2]);

  // Limbal transitions
  const leftIrisRgb = hexToRgb(colorPalette.iris.leftIrisSampled);
  const rightIrisRgb = hexToRgb(colorPalette.iris.rightIrisSampled);
  const leftLimbalHex = rgbToHex(
    Math.max(15, Math.round(leftIrisRgb[0] * 0.75)),
    Math.max(12, Math.round(leftIrisRgb[1] * 0.75)),
    Math.max(10, Math.round(leftIrisRgb[2] * 0.75))
  );
  const rightLimbalHex = rgbToHex(
    Math.max(15, Math.round(rightIrisRgb[0] * 0.75)),
    Math.max(12, Math.round(rightIrisRgb[1] * 0.75)),
    Math.max(10, Math.round(rightIrisRgb[2] * 0.75))
  );

  let leftUpperLashWidth = (baseUpperLashWidth * leftScale).toFixed(2);
  let leftLowerLashWidth = (LOWER_LASH_STROKE_WIDTH_PX * leftScale).toFixed(2);
  let leftCreaseWidth = (CREASE_STROKE_WIDTH_PX * leftScale).toFixed(2);
  let leftLowerOpacity = (parseFloat(lowerLashOpacity) * Math.min(1.0, leftScale * 1.1)).toFixed(2);
  let leftCreaseOpacity = (parseFloat(creaseOpacity) * Math.min(1.0, leftScale * 1.05)).toFixed(2);

  let rightUpperLashWidth = (baseUpperLashWidth * rightScale).toFixed(2);
  let rightLowerLashWidth = (LOWER_LASH_STROKE_WIDTH_PX * rightScale).toFixed(2);
  let rightCreaseWidth = (CREASE_STROKE_WIDTH_PX * rightScale).toFixed(2);
  let rightLowerOpacity = (parseFloat(lowerLashOpacity) * Math.min(1.0, rightScale * 1.1)).toFixed(2);
  let rightCreaseOpacity = (parseFloat(creaseOpacity) * Math.min(1.0, rightScale * 1.05)).toFixed(2);

  // Distant eye suppression
  const leftCreaseDist = Math.abs(toPx(29).y - toPx(159).y);
  if (leftEyeWidth < 26 || leftCreaseDist < 2.2) {
    leftCreaseOpacity = '0.00';
  }
  const rightCreaseDist = Math.abs(toPx(259).y - toPx(386).y);
  if (rightEyeWidth < 26 || rightCreaseDist < 2.2) {
    rightCreaseOpacity = '0.00';
  }

  // Glasses handling
  if (hasGlasses) {
    leftUpperLashWidth = (parseFloat(leftUpperLashWidth) * 0.75).toFixed(2);
    leftLowerOpacity = (parseFloat(leftLowerOpacity) * 0.25).toFixed(2);
    leftCreaseOpacity = '0.00';

    rightUpperLashWidth = (parseFloat(rightUpperLashWidth) * 0.75).toFixed(2);
    rightLowerOpacity = (parseFloat(rightLowerOpacity) * 0.25).toFixed(2);
    rightCreaseOpacity = '0.00';
  }

  const leftPupilRadius = Math.max(0.65, leftIrisRadius * PUPIL_RADIUS_RATIO);
  const rightPupilRadius = Math.max(0.65, rightIrisRadius * PUPIL_RADIUS_RATIO);
  const leftGlintRx = Math.max(0.55, leftIrisRadius * 0.15);
  const leftGlintRy = Math.max(0.40, leftIrisRadius * 0.11);
  const rightGlintRx = Math.max(0.55, rightIrisRadius * 0.15);
  const rightGlintRy = Math.max(0.40, rightIrisRadius * 0.11);

  const leftCreasePts = [toPx(226), toPx(247), toPx(30), toPx(29), toPx(27)];
  const leftCreasePath = pointsToSmoothOpenPath(leftCreasePts, 0.45);
  const rightCreasePts = [toPx(446), toPx(467), toPx(260), toPx(259), toPx(257)];
  const rightCreasePath = pointsToSmoothOpenPath(rightCreasePts, 0.45);

  // Eyebrows
  const leftBrowIndices = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
  const leftBrowPts = leftBrowIndices.map(toPx);
  const leftBrowPath = pointsToSmoothClosedPath(leftBrowPts, 0.45);

  const rightBrowIndices = [300, 296, 334, 293, 276, 285, 295, 282, 283];
  const rightBrowPts = rightBrowIndices.map(toPx);
  const rightBrowPath = pointsToSmoothClosedPath(rightBrowPts, 0.45);

  // Nose & Nostrils
  const noseTip = toPx(4);
  const noseBottom = toPx(2);
  const noseLeftAlar = toPx(49);
  const noseRightAlar = toPx(279);
  const noseNostrilLeft = toPx(98);
  const noseNostrilRight = toPx(327);

  const leftNostrilPts = [noseLeftAlar, noseNostrilLeft, noseBottom];
  const leftNostrilPath = pointsToSmoothOpenPath(leftNostrilPts, 0.45);
  const rightNostrilPts = [noseRightAlar, noseNostrilRight, noseBottom];
  const rightNostrilPath = pointsToSmoothOpenPath(rightNostrilPts, 0.45);

  const noseBridgePts = [toPx(168), toPx(6), toPx(197), toPx(195), noseTip, { x: noseTip.x + width * 0.012, y: noseTip.y }, toPx(197)];
  const noseBridgeShadow = pointsToSmoothClosedPath(noseBridgePts, 0.45);
  const noseBridgeHighlight = pointsToSmoothOpenPath([toPx(168), toPx(6), toPx(197), toPx(195)], 0.45);

  // Lips & Smile
  const upperLipOuter = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291];
  const upperLipInner = [291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78, 61];
  const upperLipPts = [...upperLipOuter, ...upperLipInner].map(toPx);
  const upperLipPath = pointsToSmoothClosedPath(upperLipPts, 0.45);

  const lowerLipInner = [61, 78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 291];
  const lowerLipOuter = [291, 375, 321, 405, 314, 17, 84, 181, 91, 146, 61];
  const lowerLipPts = [...lowerLipInner, ...lowerLipOuter].map(toPx);
  const lowerLipPath = pointsToSmoothClosedPath(lowerLipPts, 0.45);

  const mouthPartingPts = [61, 78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308, 291].map(toPx);
  const mouthPartingPath = pointsToSmoothOpenPath(mouthPartingPts, 0.50);

  const lipGapPx = Math.hypot(toPx(14).x - toPx(13).x, toPx(14).y - toPx(13).y);
  const isMouthOpen = lipGapPx >= HYBRID_MOUTH_OPEN_THRESHOLD_PX;

  const mouthAperturePts = [
    toPx(61), toPx(78), toPx(95), toPx(88), toPx(178), toPx(87), toPx(14),
    toPx(317), toPx(402), toPx(318), toPx(324), toPx(308), toPx(291),
    toPx(415), toPx(310), toPx(311), toPx(312), toPx(13),
    toPx(82), toPx(81), toPx(80), toPx(191),
  ];
  const mouthAperturePath = pointsToSmoothClosedPath(mouthAperturePts, 0.45);

  const dentalArchPts = [
    toPx(82), toPx(13), toPx(312),
    { x: toPx(312).x, y: toPx(312).y + (toPx(317).y - toPx(312).y) * 0.45 },
    { x: toPx(13).x, y: toPx(13).y + (toPx(14).y - toPx(13).y) * 0.50 },
    { x: toPx(82).x, y: toPx(82).y + (toPx(87).y - toPx(82).y) * 0.45 },
  ];
  const dentalArchPath = pointsToSmoothClosedPath(dentalArchPts, 0.45);

  const idSuffix = faceIndex === 0 ? '' : `-${faceIndex}`;

  const defs = `
    <!-- Face ${faceIndex} Eye Aperture Clips -->
    <clipPath id="v4-c-left-eye-clip${idSuffix}">
      <path d="${leftEyeScleraPath}" />
    </clipPath>
    <clipPath id="v4-c-right-eye-clip${idSuffix}">
      <path d="${rightEyeScleraPath}" />
    </clipPath>
    <!-- Face ${faceIndex} Sclera Shading Gradients -->
    <linearGradient id="v4-sclera-depth-left${idSuffix}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${scleraCornerHex}" />
      <stop offset="35%" stop-color="${colorPalette.sclera.hex}" />
      <stop offset="100%" stop-color="${scleraCornerHex}" />
    </linearGradient>
    <linearGradient id="v4-sclera-depth-right${idSuffix}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${scleraCornerHex}" />
      <stop offset="35%" stop-color="${colorPalette.sclera.hex}" />
      <stop offset="100%" stop-color="${scleraCornerHex}" />
    </linearGradient>
    <!-- Face ${faceIndex} Iris Depth Gradients -->
    <radialGradient id="v4-iris-depth-left${idSuffix}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${colorPalette.iris.leftIrisSampled}" />
      <stop offset="72%" stop-color="${colorPalette.iris.leftIrisSampled}" />
      <stop offset="100%" stop-color="${leftLimbalHex}" stop-opacity="0.90" />
    </radialGradient>
    <radialGradient id="v4-iris-depth-right${idSuffix}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${colorPalette.iris.rightIrisSampled}" />
      <stop offset="72%" stop-color="${colorPalette.iris.rightIrisSampled}" />
      <stop offset="100%" stop-color="${rightLimbalHex}" stop-opacity="0.90" />
    </radialGradient>`;

  const markup = `
    <g id="v4-face${idSuffix ? `-${faceIndex}` : ''}-features">
      <!-- Planar Shading -->
      <g id="v4-c-planar-shading${idSuffix}">
        <path d="${noseBridgeShadow}" fill="${colorPalette.skin.shadow}" opacity="0.08" />
        <path d="${noseBridgeHighlight}" fill="none" stroke="${colorPalette.skin.highlight}" stroke-width="1.5" stroke-linecap="round" opacity="0.30" />
        <ellipse cx="${noseTip.x.toFixed(1)}" cy="${(noseTip.y - 1).toFixed(1)}" rx="${(width * 0.012).toFixed(1)}" ry="${(height * 0.008).toFixed(1)}" fill="${colorPalette.skin.highlight}" opacity="0.22" />
      </g>

      <!-- Left Eye -->
      <g id="v4-c-left-eye${idSuffix}">
        <path d="${leftEyeScleraPath}" fill="url(#v4-sclera-depth-left${idSuffix})" />
        <g clip-path="url(#v4-c-left-eye-clip${idSuffix})">
          <circle cx="${leftIrisCenter.x.toFixed(1)}" cy="${leftIrisCenter.y.toFixed(1)}" r="${leftIrisRadius.toFixed(1)}" fill="url(#v4-iris-depth-left${idSuffix})" />
          <circle cx="${leftIrisCenter.x.toFixed(1)}" cy="${leftIrisCenter.y.toFixed(1)}" r="${leftPupilRadius.toFixed(1)}" fill="#171419" />
          <ellipse cx="${(leftIrisCenter.x - leftIrisRadius * 0.22).toFixed(1)}" cy="${(leftIrisCenter.y - leftIrisRadius * 0.24).toFixed(1)}" rx="${leftGlintRx.toFixed(1)}" ry="${leftGlintRy.toFixed(1)}" fill="#FFFFFF" opacity="0.85" />
          ${leftIrisRadius >= 3.2 ? `<ellipse cx="${(leftIrisCenter.x + leftIrisRadius * 0.18).toFixed(1)}" cy="${(leftIrisCenter.y + leftIrisRadius * 0.20).toFixed(1)}" rx="${(leftIrisRadius * 0.08).toFixed(1)}" ry="${(leftIrisRadius * 0.06).toFixed(1)}" fill="#FFFFFF" opacity="0.26" />` : ''}
        </g>
        <path d="${leftEyeUpperLash}" fill="none" stroke="${colorPalette.brows.hex}" stroke-width="${leftUpperLashWidth}" stroke-linecap="round" />
        <path d="${leftEyeLowerLash}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="${leftLowerLashWidth}" stroke-linecap="round" opacity="${leftLowerOpacity}" />
        ${parseFloat(leftCreaseOpacity) > 0.02 ? `<path d="${leftCreasePath}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="${leftCreaseWidth}" stroke-linecap="round" opacity="${leftCreaseOpacity}" />` : ''}
      </g>

      <!-- Right Eye -->
      <g id="v4-c-right-eye${idSuffix}">
        <path d="${rightEyeScleraPath}" fill="url(#v4-sclera-depth-right${idSuffix})" />
        <g clip-path="url(#v4-c-right-eye-clip${idSuffix})">
          <circle cx="${rightIrisCenter.x.toFixed(1)}" cy="${rightIrisCenter.y.toFixed(1)}" r="${rightIrisRadius.toFixed(1)}" fill="url(#v4-iris-depth-right${idSuffix})" />
          <circle cx="${rightIrisCenter.x.toFixed(1)}" cy="${rightIrisCenter.y.toFixed(1)}" r="${rightPupilRadius.toFixed(1)}" fill="#171419" />
          <ellipse cx="${(rightIrisCenter.x - rightIrisRadius * 0.22).toFixed(1)}" cy="${(rightIrisCenter.y - rightIrisRadius * 0.24).toFixed(1)}" rx="${rightGlintRx.toFixed(1)}" ry="${rightGlintRy.toFixed(1)}" fill="#FFFFFF" opacity="0.85" />
          ${rightIrisRadius >= 3.2 ? `<ellipse cx="${(rightIrisCenter.x + rightIrisRadius * 0.18).toFixed(1)}" cy="${(rightIrisCenter.y + rightIrisRadius * 0.20).toFixed(1)}" rx="${(rightIrisRadius * 0.08).toFixed(1)}" ry="${(rightIrisRadius * 0.06).toFixed(1)}" fill="#FFFFFF" opacity="0.26" />` : ''}
        </g>
        <path d="${rightEyeUpperLash}" fill="none" stroke="${colorPalette.brows.hex}" stroke-width="${rightUpperLashWidth}" stroke-linecap="round" />
        <path d="${rightEyeLowerLash}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="${rightLowerLashWidth}" stroke-linecap="round" opacity="${rightLowerOpacity}" />
        ${parseFloat(rightCreaseOpacity) > 0.02 ? `<path d="${rightCreasePath}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="${rightCreaseWidth}" stroke-linecap="round" opacity="${rightCreaseOpacity}" />` : ''}
      </g>

      <!-- Eyebrows -->
      <g id="v4-c-eyebrows${idSuffix}">
        <path d="${leftBrowPath}" fill="${colorPalette.brows.hex}" opacity="${browOpacity}" />
        <path d="${rightBrowPath}" fill="${colorPalette.brows.hex}" opacity="${browOpacity}" />
      </g>

      <!-- Nostrils -->
      <g id="v4-c-nostrils${idSuffix}">
        <path d="${leftNostrilPath}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="1.1" stroke-linecap="round" opacity="${nostrilOpacity}" />
        <path d="${rightNostrilPath}" fill="none" stroke="${colorPalette.skin.shadow}" stroke-width="1.1" stroke-linecap="round" opacity="${nostrilOpacity}" />
      </g>

      <!-- Lips & Smile -->
      <g id="v4-c-refined-lips${idSuffix}">
        ${isMouthOpen ? `
        <path d="${mouthAperturePath}" fill="#2E1318" />
        <path d="${dentalArchPath}" fill="${colorPalette.teeth?.hex || '#F3EFE9'}" />
        ` : ''}
        <path d="${upperLipPath}" fill="${colorPalette.lips.upper}" opacity="0.92" />
        <path d="${lowerLipPath}" fill="${colorPalette.lips.lower}" opacity="0.92" />
        ${!isMouthOpen ? `<path d="${mouthPartingPath}" fill="none" stroke="${colorPalette.lips.upper}" stroke-width="1.0" stroke-linecap="round" opacity="0.70" />` : ''}
        <ellipse cx="${toPx(17).x.toFixed(1)}" cy="${(toPx(17).y - height * 0.003).toFixed(1)}" rx="${(width * 0.018).toFixed(1)}" ry="${(height * 0.004).toFixed(1)}" fill="${colorPalette.skin.highlight}" opacity="0.18" />
      </g>
    </g>`;

  return { defs, markup };
}

export function runExperimentC(input: HybridReconstructionInput): V4CandidateResult {
  const startTime = performance.now();
  const { width, height, landmarks, colorPalette } = input;

  const ctrl = input.options?.styleControls;
  const bgSimplification = ctrl?.backgroundSimplification ?? 4; // 1 to 5

  // Background Studio Tones modulated by bgSimplification (1 to 5)
  const bgRgb = colorPalette.background.rgb;
  const liftRatio = 1.0 + (bgSimplification * 0.02);
  const vigRatio = Math.max(0.70, 0.98 - bgSimplification * 0.02);
  const lightenedBg = `rgb(${Math.min(255, Math.round(bgRgb[0] * liftRatio + bgSimplification * 3))}, ${Math.min(255, Math.round(bgRgb[1] * liftRatio + bgSimplification * 3))}, ${Math.min(255, Math.round(bgRgb[2] * liftRatio + bgSimplification * 3))})`;
  const vignetteBg = `rgb(${Math.max(0, Math.round(bgRgb[0] * vigRatio))}, ${Math.max(0, Math.round(bgRgb[1] * vigRatio))}, ${Math.max(0, Math.round(bgRgb[2] * vigRatio))})`;

  // Multi-evidence glasses detection
  let hasGlasses = !!input.options?.hasGlasses;
  if (!hasGlasses && input.categoryMask && input.categoryMask.rawMask && landmarks && landmarks.length >= 386) {
    const mw = input.categoryMask.maskWidth;
    const mh = input.categoryMask.maskHeight;
    const mData = input.categoryMask.rawMask;

    const orbitalIndices = [33, 133, 159, 145, 362, 263, 386, 374, 168, 6, 197];
    const orbitalPts = orbitalIndices.map(i => landmarks[i]).filter(Boolean);
    if (orbitalPts.length > 0) {
      const minNormX = Math.min(...orbitalPts.map(p => p.x)) - 0.03;
      const maxNormX = Math.max(...orbitalPts.map(p => p.x)) + 0.03;
      const minNormY = Math.min(...orbitalPts.map(p => p.y)) - 0.04;
      const maxNormY = Math.max(...orbitalPts.map(p => p.y)) + 0.04;

      const startMx = Math.max(0, Math.floor(minNormX * mw));
      const endMx = Math.min(mw - 1, Math.ceil(maxNormX * mw));
      const startMy = Math.max(0, Math.floor(minNormY * mh));
      const endMy = Math.min(mh - 1, Math.ceil(maxNormY * mh));

      let accessoryCount = 0;
      for (let my = startMy; my <= endMy; my++) {
        for (let mx = startMx; mx <= endMx; mx++) {
          if (mData[my * mw + mx] === 5) {
            accessoryCount++;
          }
        }
      }
      if (accessoryCount >= 6) {
        hasGlasses = true;
      }
    }
  }

  if (!hasGlasses && input.baseSvg && input.baseSvg.includes('class="v4-glasses-path"')) {
    hasGlasses = true;
  }

  // Parse and separate base SVG paths into stacked layers & foreground glasses
  let underlayPaths: string[] = [];
  let glassesPaths: string[] = [];
  let bgPaths: string[] = [];
  let clothesPaths: string[] = [];
  let skinPaths: string[] = [];
  let beardPaths: string[] = [];
  let hairPaths: string[] = [];
  let otherPaths: string[] = [];

  if (input.baseSvg) {
    const match = input.baseSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    if (match) {
      let content = match[1];

      // Strip any inner <rect> tags so strictly 1 base <rect> exists in the entire final SVG
      content = content.replace(/<rect\b[^>]*\/?>/gi, '');

      const pathRegex = /<path\b[^>]*\/?>/gi;
      let pMatch: RegExpExecArray | null;
      let matchedAny = false;

      while ((pMatch = pathRegex.exec(content)) !== null) {
        matchedAny = true;
        const pTag = pMatch[0];
        if (pTag.includes('v4-underlay-path')) {
          underlayPaths.push(pTag);
        } else if (pTag.includes('v4-glasses-path')) {
          glassesPaths.push(pTag);
        } else if (pTag.includes('v4-path-bg')) {
          bgPaths.push(pTag);
        } else if (pTag.includes('v4-path-clothes')) {
          clothesPaths.push(pTag);
        } else if (pTag.includes('v4-path-skin')) {
          skinPaths.push(pTag);
        } else if (pTag.includes('v4-path-beard')) {
          beardPaths.push(pTag);
        } else if (pTag.includes('v4-path-hair')) {
          hairPaths.push(pTag);
        } else {
          otherPaths.push(pTag);
        }
      }

      if (!matchedAny && content.trim()) {
        otherPaths.push(content);
      }
    }
  }

  // Multi-face support: detect all available faces or fallback to primary landmarks
  const allFaces: NormalizedLandmark[][] =
    input.options?.allFacesLandmarks && input.options.allFacesLandmarks.length > 0
      ? input.options.allFacesLandmarks
      : (landmarks && landmarks.length >= 33 ? [landmarks] : []);

  let allFaceDefs = '';
  let allFaceMarkup = '';

  allFaces.forEach((faceLms, idx) => {
    const { defs, markup } = renderSingleFaceFeatures(
      faceLms,
      idx,
      width,
      height,
      colorPalette,
      hasGlasses,
      input.options
    );
    allFaceDefs += defs;
    allFaceMarkup += markup;
  });

  const vis = input.options?.layerVisibility || {};

  const isMagentaDebug = !!input.options?.debugMagentaBase;
  const baseFill = isMagentaDebug
    ? '#FF00FF'
    : (input.options?.useAverageColorBase ? (colorPalette.averagePhotoColor || '#808080') : 'url(#v4-studio-bg)');
  // Proven to improve SSIM on 8/8 photos: enable soft skin edge by default unless explicitly disabled
  const useSoftSkin = input.options?.skinSoftEdge !== false;
  const softSkinRadius = input.options?.skinSoftEdgeRadius ?? 1.2;

  // Assemble Final SVG Document with Seamless Stacked Layers (Steps 1, 2, 3)
  const svgString = (input.baseSvg || allFaceMarkup) ? `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- CodeMyFace V4: High-Fidelity Digital Portrait Painting -->
  <defs>
    <!-- Studio Backdrop Gradient -->
    <radialGradient id="v4-studio-bg" cx="50%" cy="38%" r="68%">
      <stop offset="0%" stop-color="${lightenedBg}" />
      <stop offset="70%" stop-color="${colorPalette.background.hex}" />
      <stop offset="100%" stop-color="${vignetteBg}" />
    </radialGradient>
    ${useSoftSkin ? `
    <filter id="v4-skin-soft-edge" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="${softSkinRadius}" />
    </filter>` : ''}
    ${allFaceDefs}
  </defs>

  <!-- 0. Clean Base Layer (Strictly the ONLY base rectangle in document) -->
  ${vis.bg !== false ? `<rect width="${width}" height="${height}" fill="${baseFill}" />` : ''}

  <!-- 1. Traced High-Fidelity Stacked Vector Base -->
  <g id="v4-c-base-vector">
    ${underlayPaths.length > 0 ? `
    <g id="v4-layer-underlay" ${vis.bg === false ? 'style="display:none"' : ''}>
      ${underlayPaths.join('\n    ')}
    </g>` : ''}
    <g id="v4-layer-bg" ${vis.bg === false ? 'style="display:none"' : ''}>
      ${bgPaths.join('\n    ')}
    </g>
    <g id="v4-layer-clothes" ${vis.clothes === false ? 'style="display:none"' : ''}>
      ${clothesPaths.join('\n    ')}
    </g>
    <g id="v4-layer-skin" ${useSoftSkin ? 'filter="url(#v4-skin-soft-edge)"' : ''} ${vis.skin === false ? 'style="display:none"' : ''}>
      ${skinPaths.join('\n    ')}
    </g>
    <g id="v4-layer-beard" ${vis.beard === false ? 'style="display:none"' : ''}>
      ${beardPaths.join('\n    ')}
    </g>
    <g id="v4-layer-hair" ${vis.hair === false ? 'style="display:none"' : ''}>
      ${hairPaths.join('\n    ')}
    </g>
    ${otherPaths.length > 0 ? `
    <g id="v4-layer-other">
      ${otherPaths.join('\n    ')}
    </g>` : ''}
  </g>

  <!-- 2. Facial Features: Source-Grounded Anatomical Vector Features -->
  ${allFaceMarkup && vis.features !== false ? `
  <g id="v4-c-refined-features">
    ${allFaceMarkup}
  </g>` : ''}

  <!-- 3. Foreground Spectacle Frame Overlay (Preserves authentic glasses shape in front of eyes) -->
  ${glassesPaths.length > 0 ? `
  <g id="v4-c-glasses-overlay" ${vis.glasses === false ? 'style="display:none"' : ''}>
    ${glassesPaths.join('\n    ')}
  </g>` : ''}
</svg>` : `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- Fallback minimal SVG -->
  <rect width="${width}" height="${height}" fill="${colorPalette.background.hex}" />
</svg>`;

  const optimizedSvg = optimizeSvgDocument(svgString);
  const pathMatches = optimizedSvg.match(/<path/g);
  const pathCount = pathMatches ? pathMatches.length : 0;
  const nodeMatches = optimizedSvg.match(/[MLCQZmlcqz]/g);
  const nodeCount = nodeMatches ? nodeMatches.length : 0;
  const byteLength = new TextEncoder().encode(optimizedSvg).length;
  const fileSizeKb = Math.round((byteLength / 1024) * 10) / 10;
  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    candidateId: 'candidate-c',
    name: 'Candidate C',
    title: 'Hybrid Adaptive Reconstruction (V4.6)',
    description: 'Fuses cohesive painterly planar vector segmentation with high-definition source-grounded facial anatomy. Delivers living eyes, natural smiles, flowing hair volumes, and harmonized clothing.',
    svgString: optimizedSvg,
    metrics: {
      pathCount,
      nodeCount,
      fileSizeKb,
      executionTimeMs,
    },
  };
}
