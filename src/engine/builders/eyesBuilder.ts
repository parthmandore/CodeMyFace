import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex, darken } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
  distanceImagePx,
} from '../coordinateTransform';
import { constrainPupilToEyeContour } from '../faceAnalyzer';
import { BuilderContext } from './types';

export interface EyesBuildResult {
  layer: PortraitLayer;
  leftScleraPath: string;
  rightScleraPath: string;
}

/**
 * Layer 6: Eyebrows and Eyes (Anatomical Alignment, Radial Iris, Eyelids)
 */
export function buildEyesLayer(ctx: BuilderContext): EyesBuildResult {
  const { features, palette, toCanvas, scale, imgDim, isLightRight } = ctx;
  const eyeShapes: PortraitShape[] = [];

  // Eyebrows (smooth organic curves preserving natural arch and asymmetry)
  const leftBrowPoints: Vec2[] = [
    ...features.leftEyebrowUpper,
    ...[...features.leftEyebrowLower].reverse(),
  ];
  const rightBrowPoints: Vec2[] = [
    ...features.rightEyebrowUpper,
    ...[...features.rightEyebrowLower].reverse(),
  ];

  eyeShapes.push({
    id: 'eyebrow-left',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(leftBrowPoints, toCanvas, 0.18),
    fill: colorToHex(palette.eyebrowColor),
    stroke: colorToHex(palette.eyebrowColor),
    strokeWidth: 0.8,
    opacity: 1,
    provenance: 'landmark-derived',
  });
  eyeShapes.push({
    id: 'eyebrow-right',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(rightBrowPoints, toCanvas, 0.18),
    fill: colorToHex(palette.eyebrowColor),
    stroke: colorToHex(palette.eyebrowColor),
    strokeWidth: 0.8,
    opacity: 1,
    provenance: 'landmark-derived',
  });

  // Eye Sclera (White base)
  const leftScleraPath = projectSmoothClosedCurveToPath(features.leftEyeContour, toCanvas, 0.20);
  const rightScleraPath = projectSmoothClosedCurveToPath(features.rightEyeContour, toCanvas, 0.20);

  eyeShapes.push({
    id: 'eye-sclera-left',
    type: 'path',
    pathData: leftScleraPath,
    fill: '#f5f6f9',
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 1.2,
    opacity: 1,
    provenance: 'landmark-derived',
  });
  eyeShapes.push({
    id: 'eye-sclera-right',
    type: 'path',
    pathData: rightScleraPath,
    fill: '#f5f6f9',
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 1.2,
    opacity: 1,
    provenance: 'landmark-derived',
  });

  // Calculate physical eye width to establish true proportional iris radius
  const leftEyeWidthPx = distanceImagePx(
    features.leftEyeContour[0],
    features.leftEyeContour[8] || features.leftEyeContour[features.leftEyeContour.length - 1],
    imgDim
  );
  const rightEyeWidthPx = distanceImagePx(
    features.rightEyeContour[0],
    features.rightEyeContour[8] || features.rightEyeContour[features.rightEyeContour.length - 1],
    imgDim
  );

  const leftEyeOuterPt = features.leftEyeContour[0];
  const leftEyeInnerPt = features.leftEyeContour[8] || features.leftEyeContour[features.leftEyeContour.length - 1];
  const leftEyeWNorm = Math.max(0.01, Math.hypot(leftEyeOuterPt.x - leftEyeInnerPt.x, leftEyeOuterPt.y - leftEyeInnerPt.y));

  const rightEyeOuterPt = features.rightEyeContour[8] || features.rightEyeContour[features.rightEyeContour.length - 1];
  const rightEyeInnerPt = features.rightEyeContour[0];
  const rightEyeWNorm = Math.max(0.01, Math.hypot(rightEyeOuterPt.x - rightEyeInnerPt.x, rightEyeOuterPt.y - rightEyeInnerPt.y));

  // Derive iris geometry from measured iris data when available, with conservative 0.28 fallback
  let leftIrisRatio = 0.28;
  let rightIrisRatio = 0.28;
  if (features.leftIrisContour && features.leftIrisContour.length > 0 && features.leftIrisRadius) {
    const r = features.leftIrisRadius / leftEyeWNorm;
    if (r >= 0.16 && r <= 0.42) leftIrisRatio = r;
  }
  if (features.rightIrisContour && features.rightIrisContour.length > 0 && features.rightIrisRadius) {
    const r = features.rightIrisRadius / rightEyeWNorm;
    if (r >= 0.16 && r <= 0.42) rightIrisRatio = r;
  }

  const leftIrisRPx = Math.max(10, leftEyeWidthPx * scale * leftIrisRatio);
  const rightIrisRPx = Math.max(10, rightEyeWidthPx * scale * rightIrisRatio);

  const irisProvenance = (features.leftIrisContour && features.leftIrisContour.length > 0)
    ? 'landmark-derived'
    : 'template-generated';

  // Constrain pupils strictly within eyelid contour
  const leftPupilSafe = constrainPupilToEyeContour(features.leftPupil, features.leftEyeUpper, features.leftEyeLower);
  const rightPupilSafe = constrainPupilToEyeContour(features.rightPupil, features.rightEyeUpper, features.rightEyeLower);

  const leftIrisCenterPx = toCanvas(leftPupilSafe);
  const rightIrisCenterPx = toCanvas(rightPupilSafe);

  // Limbal rings (clipped to eyelid opening)
  eyeShapes.push({
    id: 'iris-limbal-left',
    type: 'circle',
    cx: leftIrisCenterPx.x,
    cy: leftIrisCenterPx.y,
    r: leftIrisRPx,
    fill: colorToHex(palette.irisOuterRing),
    clipPath: 'clip-sclera-left',
    opacity: 1,
    provenance: irisProvenance,
  });
  eyeShapes.push({
    id: 'iris-limbal-right',
    type: 'circle',
    cx: rightIrisCenterPx.x,
    cy: rightIrisCenterPx.y,
    r: rightIrisRPx,
    fill: colorToHex(palette.irisOuterRing),
    clipPath: 'clip-sclera-right',
    opacity: 1,
    provenance: irisProvenance,
  });

  // Inner iris with multi-stop radial gradient (warm hazel-amber to espresso core)
  eyeShapes.push({
    id: 'iris-inner-left',
    type: 'circle',
    cx: leftIrisCenterPx.x,
    cy: leftIrisCenterPx.y,
    r: leftIrisRPx * 0.88,
    fill: 'url(#iris-grad-left)',
    clipPath: 'clip-sclera-left',
    opacity: 1,
    provenance: irisProvenance,
  });
  eyeShapes.push({
    id: 'iris-inner-right',
    type: 'circle',
    cx: rightIrisCenterPx.x,
    cy: rightIrisCenterPx.y,
    r: rightIrisRPx * 0.88,
    fill: 'url(#iris-grad-right)',
    clipPath: 'clip-sclera-right',
    opacity: 1,
    provenance: irisProvenance,
  });

  // Pupils (clipped)
  eyeShapes.push({
    id: 'pupil-left',
    type: 'circle',
    cx: leftIrisCenterPx.x,
    cy: leftIrisCenterPx.y,
    r: leftIrisRPx * 0.44,
    fill: '#0d0e12',
    clipPath: 'clip-sclera-left',
    opacity: 1,
    provenance: irisProvenance,
  });
  eyeShapes.push({
    id: 'pupil-right',
    type: 'circle',
    cx: rightIrisCenterPx.x,
    cy: rightIrisCenterPx.y,
    r: rightIrisRPx * 0.44,
    fill: '#0d0e12',
    clipPath: 'clip-sclera-right',
    opacity: 1,
    provenance: irisProvenance,
  });

  // Specular catchlights (offset towards light source)
  const catchlightOffsetX = isLightRight ? leftIrisRPx * 0.20 : -leftIrisRPx * 0.25;
  const catchlightOffsetY = -leftIrisRPx * 0.25;

  eyeShapes.push({
    id: 'catchlight-left',
    type: 'circle',
    cx: leftIrisCenterPx.x + catchlightOffsetX,
    cy: leftIrisCenterPx.y + catchlightOffsetY,
    r: leftIrisRPx * 0.20,
    fill: '#ffffff',
    clipPath: 'clip-sclera-left',
    opacity: 0.95,
    provenance: irisProvenance,
  });
  eyeShapes.push({
    id: 'catchlight-right',
    type: 'circle',
    cx: rightIrisCenterPx.x + catchlightOffsetX,
    cy: rightIrisCenterPx.y + catchlightOffsetY,
    r: rightIrisRPx * 0.20,
    fill: '#ffffff',
    clipPath: 'clip-sclera-right',
    opacity: 0.95,
    provenance: irisProvenance,
  });

  // Eyelid creases (from detected mesh or upper lid contour)
  const leftCreasePath =
    features.leftEyeCrease && features.leftEyeCrease.length >= 3
      ? projectOpenCurveToPath(features.leftEyeCrease, toCanvas, 0.22)
      : projectOpenCurveToPath(
          features.leftEyeUpper.map((pt) => ({ x: pt.x, y: pt.y - 0.012 })),
          toCanvas,
          0.22
        );
  const rightCreasePath =
    features.rightEyeCrease && features.rightEyeCrease.length >= 3
      ? projectOpenCurveToPath(features.rightEyeCrease, toCanvas, 0.22)
      : projectOpenCurveToPath(
          features.rightEyeUpper.map((pt) => ({ x: pt.x, y: pt.y - 0.012 })),
          toCanvas,
          0.22
        );

  eyeShapes.push({
    id: 'eyelid-crease-left',
    type: 'path',
    pathData: leftCreasePath,
    fill: 'none',
    stroke: colorToHex(palette.skinShadowDeep),
    strokeWidth: 1.2,
    opacity: 0.55,
    provenance: 'landmark-derived',
  });
  eyeShapes.push({
    id: 'eyelid-crease-right',
    type: 'path',
    pathData: rightCreasePath,
    fill: 'none',
    stroke: colorToHex(palette.skinShadowDeep),
    strokeWidth: 1.2,
    opacity: 0.55,
    provenance: 'landmark-derived',
  });

  // Dark upper lash lines (crisp vector graphic definition)
  eyeShapes.push({
    id: 'lash-line-left',
    type: 'path',
    pathData: projectOpenCurveToPath(features.leftEyeUpper, toCanvas, 0.25),
    fill: 'none',
    stroke: colorToHex(darken(palette.eyebrowColor, 0.3)),
    strokeWidth: 2.4,
    opacity: 0.95,
    provenance: 'landmark-derived',
  });
  eyeShapes.push({
    id: 'lash-line-right',
    type: 'path',
    pathData: projectOpenCurveToPath(features.rightEyeUpper, toCanvas, 0.25),
    fill: 'none',
    stroke: colorToHex(darken(palette.eyebrowColor, 0.3)),
    strokeWidth: 2.4,
    opacity: 0.95,
    provenance: 'landmark-derived',
  });

  return {
    layer: {
      id: 'layer-eyebrows-eyes',
      name: '6. Eyebrows & Eyes',
      order: 6,
      shapes: eyeShapes,
      visible: true,
    },
    leftScleraPath,
    rightScleraPath,
  };
}
