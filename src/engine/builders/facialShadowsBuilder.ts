import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
} from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 5: Facial Shadows & Contours (Volumetric Curved Aesthetic)
 */
export function buildFacialShadowsLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, toCanvas, isLightLeft, isLightRight } = ctx;
  const shadowShapes: PortraitShape[] = [];

  // Cheekbone planar shadow facets (smooth curved contours)
  if (isLightLeft || palette.lightDirection === 'frontal') {
    const rightCheekShadow: Vec2[] = [
      features.templeRight,
      { x: features.templeRight.x * 0.75 + features.noseTip.x * 0.25, y: features.templeRight.y * 0.40 + features.noseTip.y * 0.60 },
      { x: features.templeRight.x * 0.65 + features.mouthCenter.x * 0.35, y: features.noseTip.y * 0.70 + features.mouthCenter.y * 0.30 },
      { x: features.templeRight.x * 0.75 + features.chinTip.x * 0.25, y: features.chinTip.y - 0.04 },
      features.rightMandibularCorner,
    ];
    shadowShapes.push({
      id: 'facet-right-cheek-shadow',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(rightCheekShadow, toCanvas, 0.25),
      fill: colorToHex(palette.skinShadow),
      opacity: isLightLeft ? 0.80 : 0.35,
      provenance: 'template-generated',
    });
  }

  if (isLightRight || palette.lightDirection === 'frontal') {
    const leftCheekShadow: Vec2[] = [
      features.templeLeft,
      { x: features.templeLeft.x * 0.75 + features.noseTip.x * 0.25, y: features.templeLeft.y * 0.40 + features.noseTip.y * 0.60 },
      { x: features.templeLeft.x * 0.65 + features.mouthCenter.x * 0.35, y: features.noseTip.y * 0.70 + features.mouthCenter.y * 0.30 },
      { x: features.templeLeft.x * 0.75 + features.chinTip.x * 0.25, y: features.chinTip.y - 0.04 },
      features.leftMandibularCorner,
    ];
    shadowShapes.push({
      id: 'facet-left-cheek-shadow',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(leftCheekShadow, toCanvas, 0.25),
      fill: colorToHex(palette.skinShadow),
      opacity: isLightRight ? 0.80 : 0.35,
      provenance: 'template-generated',
    });
  }

  // Eye socket depressions (subtle orbital recess)
  const leftEyeSocket: Vec2[] = [
    features.leftEyebrow[0],
    features.leftEyebrow[Math.floor(features.leftEyebrow.length / 2)],
    features.leftEyebrow[features.leftEyebrow.length - 1],
    features.leftEyeContour[8],
    features.leftEyeContour[0],
  ];
  shadowShapes.push({
    id: 'facet-left-eye-socket',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(leftEyeSocket, toCanvas, 0.22),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.45,
    provenance: 'template-generated',
  });

  const rightEyeSocket: Vec2[] = [
    features.rightEyebrow[0],
    features.rightEyebrow[Math.floor(features.rightEyebrow.length / 2)],
    features.rightEyebrow[features.rightEyebrow.length - 1],
    features.rightEyeContour[8],
    features.rightEyeContour[0],
  ];
  shadowShapes.push({
    id: 'facet-right-eye-socket',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(rightEyeSocket, toCanvas, 0.22),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.45,
    provenance: 'template-generated',
  });

  // Soft lateral nose bridge shadow (defines nasal elevation without crossing bridge)
  const noseShadowSide = isLightRight ? -1 : 1;
  const noseBridgeShadow: Vec2[] = [
    features.noseBridge[0],
    features.noseBridge[features.noseBridge.length - 1],
    { x: features.noseTip.x + 0.016 * noseShadowSide, y: features.noseTip.y },
    { x: features.noseBridge[0].x + 0.012 * noseShadowSide, y: features.noseBridge[0].y },
  ];
  shadowShapes.push({
    id: 'facet-nose-bridge-shadow',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(noseBridgeShadow, toCanvas, 0.20),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.55,
    provenance: 'template-generated',
  });

  // Labiomental groove shadow (chin shelf definition - placed below lower lip)
  const lowerLipBottomForShadow =
    features.lowerLipOuter[5] ||
    features.lowerLip[Math.floor(features.lowerLip.length / 2)] ||
    features.lowerLip[0];
  const underLipShadow: Vec2[] = [
    { x: features.mouthCenter.x - 0.026, y: lowerLipBottomForShadow.y + 0.006 },
    { x: features.mouthCenter.x + 0.026, y: lowerLipBottomForShadow.y + 0.006 },
    { x: features.mouthCenter.x + 0.016, y: lowerLipBottomForShadow.y + 0.022 },
    { x: features.mouthCenter.x - 0.016, y: lowerLipBottomForShadow.y + 0.022 },
  ];
  shadowShapes.push({
    id: 'facet-underlip-shadow',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(underLipShadow, toCanvas, 0.20),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.72,
    provenance: 'template-generated',
  });

  // Submental jaw and chin shelf definition (separates mandibular border from neck)
  const faceWidthNorm = Math.max(0.08, features.templeRight.x - features.templeLeft.x);
  const faceHeight = Math.max(0.10, features.chinTip.y - features.foreheadTop.y);
  const chinShelfShadow: Vec2[] = [
    { x: features.chinTip.x - faceWidthNorm * 0.14, y: features.chinTip.y - faceHeight * 0.012 },
    { x: features.chinTip.x + faceWidthNorm * 0.14, y: features.chinTip.y - faceHeight * 0.012 },
    { x: features.chinTip.x + faceWidthNorm * 0.10, y: features.chinTip.y + faceHeight * 0.020 },
    { x: features.chinTip.x - faceWidthNorm * 0.10, y: features.chinTip.y + faceHeight * 0.020 },
  ];
  shadowShapes.push({
    id: 'facet-chin-shelf-shadow',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(chinShelfShadow, toCanvas, 0.20),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.65,
    provenance: 'template-generated',
  });

  // Nasolabial folds (smile lines framing expression)
  if (features.leftNasolabial && features.leftNasolabial.length >= 3) {
    shadowShapes.push({
      id: 'crease-nasolabial-left',
      type: 'path',
      pathData: projectOpenCurveToPath(features.leftNasolabial, toCanvas, 0.22),
      fill: 'none',
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.4,
      opacity: 0.55,
      provenance: 'landmark-derived',
    });
  }
  if (features.rightNasolabial && features.rightNasolabial.length >= 3) {
    shadowShapes.push({
      id: 'crease-nasolabial-right',
      type: 'path',
      pathData: projectOpenCurveToPath(features.rightNasolabial, toCanvas, 0.22),
      fill: 'none',
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.4,
      opacity: 0.55,
      provenance: 'landmark-derived',
    });
  }

  // Mental crease (chin shelf contour)
  if (features.mentalCrease && features.mentalCrease.length >= 3) {
    shadowShapes.push({
      id: 'crease-mental-groove',
      type: 'path',
      pathData: projectOpenCurveToPath(features.mentalCrease, toCanvas, 0.22),
      fill: 'none',
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.4,
      opacity: 0.50,
      provenance: 'landmark-derived',
    });
  }

  return {
    id: 'layer-facial-shadows',
    name: '5. Facial Shadows',
    order: 5,
    shapes: shadowShapes,
    visible: true,
  };
}
