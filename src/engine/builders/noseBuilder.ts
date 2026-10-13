import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
} from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 7: Nose (High-Precision Anatomical Reconstruction)
 */
export function buildNoseLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, toCanvas, isLightLeft, isLightRight } = ctx;
  const noseShapes: PortraitShape[] = [];

  // Individualized nose dimensions derived strictly from landmarks
  const alarLeftX = (features.leftAlarWing && features.leftAlarWing.length > 0)
    ? Math.min(...features.leftAlarWing.map((p) => p.x))
    : features.leftNostril.x;
  const alarRightX = (features.rightAlarWing && features.rightAlarWing.length > 0)
    ? Math.max(...features.rightAlarWing.map((p) => p.x))
    : features.rightNostril.x;

  const totalAlarWidth = Math.max(0.045, Math.abs(alarRightX - alarLeftX));
  const bridgeHalfW = totalAlarWidth * 0.14;
  const subnasalePt = features.subnasale || {
    x: features.noseTip.x,
    y: features.noseTip.y + totalAlarWidth * 0.18,
  };
  const nasionPt = features.nasion || features.noseBridge[0] || {
    x: features.noseTip.x,
    y: features.noseTip.y - totalAlarWidth * 0.85,
  };

  const bridgePoints = features.noseBridge.length >= 2
    ? features.noseBridge
    : [nasionPt, features.noseTip];
  const midBridgePt = bridgePoints[Math.floor(bridgePoints.length / 2)] || {
    x: (nasionPt.x + features.noseTip.x) * 0.5,
    y: (nasionPt.y + features.noseTip.y) * 0.5,
  };

  // 1. Lateral Nasal Sidewall Shadows (dimensional planar transitions)
  // Constructed from bridge to alar margins, visible but restrained using palette.skinShadow
  const leftSidewallPts: Vec2[] = (features.leftNasalSidewall && features.leftNasalSidewall.length >= 3)
    ? features.leftNasalSidewall
    : [
        { x: nasionPt.x - bridgeHalfW * 0.80, y: nasionPt.y },
        { x: nasionPt.x - bridgeHalfW * 2.30, y: nasionPt.y + (features.noseTip.y - nasionPt.y) * 0.28 },
        { x: features.leftNostril.x - totalAlarWidth * 0.10, y: features.noseTip.y - (features.noseTip.y - nasionPt.y) * 0.12 },
        { x: features.noseTip.x - bridgeHalfW * 1.10, y: features.noseTip.y - 0.006 },
        { x: midBridgePt.x - bridgeHalfW * 0.90, y: midBridgePt.y },
      ];

  const rightSidewallPts: Vec2[] = (features.rightNasalSidewall && features.rightNasalSidewall.length >= 3)
    ? features.rightNasalSidewall
    : [
        { x: nasionPt.x + bridgeHalfW * 0.80, y: nasionPt.y },
        { x: midBridgePt.x + bridgeHalfW * 0.90, y: midBridgePt.y },
        { x: features.noseTip.x + bridgeHalfW * 1.10, y: features.noseTip.y - 0.006 },
        { x: features.rightNostril.x + totalAlarWidth * 0.10, y: features.noseTip.y - (features.noseTip.y - nasionPt.y) * 0.12 },
        { x: nasionPt.x + bridgeHalfW * 2.30, y: nasionPt.y + (features.noseTip.y - nasionPt.y) * 0.28 },
      ];

  const leftSidewallOpacity = isLightRight ? 0.60 : isLightLeft ? 0.25 : 0.35;
  const rightSidewallOpacity = isLightLeft ? 0.60 : isLightRight ? 0.25 : 0.35;

  noseShapes.push({
    id: 'nose-sidewall-left',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(leftSidewallPts, toCanvas, 0.22),
    fill: colorToHex(palette.skinShadow),
    opacity: leftSidewallOpacity,
    provenance: 'landmark-derived',
  });

  noseShapes.push({
    id: 'nose-sidewall-right',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(rightSidewallPts, toCanvas, 0.22),
    fill: colorToHex(palette.skinShadow),
    opacity: rightSidewallOpacity,
    provenance: 'landmark-derived',
  });

  // 2. Dorsal bridge highlight strip (luminous forward facet along the nasal ridge)
  const noseBridgePoints: Vec2[] = [
    { x: nasionPt.x - bridgeHalfW * 0.75, y: nasionPt.y },
    { x: midBridgePt.x - bridgeHalfW * 0.85, y: midBridgePt.y },
    { x: features.noseTip.x - bridgeHalfW * 1.10, y: features.noseTip.y - 0.008 },
    { x: features.noseTip.x + bridgeHalfW * 1.10, y: features.noseTip.y - 0.008 },
    { x: midBridgePt.x + bridgeHalfW * 0.85, y: midBridgePt.y },
    { x: nasionPt.x + bridgeHalfW * 0.75, y: nasionPt.y },
  ];
  noseShapes.push({
    id: 'nose-dorsum-plane',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(noseBridgePoints, toCanvas, 0.16),
    fill: 'url(#nose-dorsum-grad)',
    opacity: 0.88,
    provenance: 'landmark-derived',
  });

  // 3. Nose bridge structural ridge contour (subtle shadow accent along the ridge)
  noseShapes.push({
    id: 'nose-bridge-line',
    type: 'path',
    pathData: projectOpenCurveToPath(features.noseBridge, toCanvas, 0.20),
    fill: 'none',
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 1.1,
    opacity: 0.50,
    provenance: 'landmark-derived',
  });

  // 4. Alar wings (Left and Right Alae with clear contrast from base skin)
  if (features.leftAlarWing && features.leftAlarWing.length >= 3) {
    noseShapes.push({
      id: 'alar-wing-left',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(features.leftAlarWing, toCanvas, 0.20),
      fill: colorToHex(palette.skinShadow),
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.0,
      opacity: isLightRight ? 0.65 : isLightLeft ? 0.38 : 0.48,
      provenance: 'landmark-derived',
    });
    noseShapes.push({
      id: 'alar-crease-left',
      type: 'path',
      pathData: projectOpenCurveToPath(features.leftAlarWing, toCanvas, 0.20),
      fill: 'none',
      stroke: colorToHex(palette.skinShadowDeep),
      strokeWidth: 1.3,
      opacity: 0.75,
      provenance: 'landmark-derived',
    });
  }

  if (features.rightAlarWing && features.rightAlarWing.length >= 3) {
    noseShapes.push({
      id: 'alar-wing-right',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(features.rightAlarWing, toCanvas, 0.20),
      fill: colorToHex(palette.skinShadow),
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.0,
      opacity: isLightLeft ? 0.65 : isLightRight ? 0.38 : 0.48,
      provenance: 'landmark-derived',
    });
    noseShapes.push({
      id: 'alar-crease-right',
      type: 'path',
      pathData: projectOpenCurveToPath(features.rightAlarWing, toCanvas, 0.20),
      fill: 'none',
      stroke: colorToHex(palette.skinShadowDeep),
      strokeWidth: 1.3,
      opacity: 0.75,
      provenance: 'landmark-derived',
    });
  }

  // 5. Infratip & Columella shadow (separating tip lobule from philtrum and upper lip)
  const tipRadiusX = totalAlarWidth * 0.24;
  const tipRadiusY = Math.min(0.012, Math.max(0.007, totalAlarWidth * 0.16));

  const columellaShadow: Vec2[] = [
    { x: features.noseTip.x - tipRadiusX * 0.65, y: features.noseTip.y + tipRadiusY * 0.30 },
    { x: subnasalePt.x - totalAlarWidth * 0.14, y: subnasalePt.y },
    { x: subnasalePt.x + totalAlarWidth * 0.14, y: subnasalePt.y },
    { x: features.noseTip.x + tipRadiusX * 0.65, y: features.noseTip.y + tipRadiusY * 0.30 },
  ];
  noseShapes.push({
    id: 'nose-columella-shadow',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(columellaShadow, toCanvas, 0.18),
    fill: colorToHex(palette.skinShadow),
    opacity: 0.65,
    provenance: 'landmark-derived',
  });

  // 6. Nose tip rounded anatomical lobule (Pronasale highlight facet - NEVER a 4-point diamond)
  const tipPoints: Vec2[] = [];
  const numLobulePts = 8;
  for (let i = 0; i < numLobulePts; i++) {
    const angle = (i / numLobulePts) * Math.PI * 2;
    tipPoints.push({
      x: features.noseTip.x + Math.cos(angle) * tipRadiusX,
      y: features.noseTip.y + Math.sin(angle) * tipRadiusY,
    });
  }

  noseShapes.push({
    id: 'nose-tip-facet',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(tipPoints, toCanvas, 0.20),
    fill: colorToHex(palette.skinHighlight),
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 0.85,
    opacity: 0.85,
    provenance: 'landmark-derived',
  });

  // 7. Anatomical nostril apertures (organic crescent/bean apertures with geometry-aware pitch handling)
  // Downward head tilt occludes nostrils only when pronasale physically drops significantly past subnasale
  const pitchOffset = features.noseTip.y - subnasalePt.y;
  const isPitchDownOccluded = pitchOffset >= 0.007;

  if (!isPitchDownOccluded) {
    const visibilityFactor = pitchOffset <= 0
      ? 1.0
      : Math.max(0.40, 1.0 - (pitchOffset / 0.007) * 0.60);

    const wNostril = totalAlarWidth * 0.13;
    const hNostril = Math.max(0.002, totalAlarWidth * 0.065 * visibilityFactor);

    // Left nostril aperture (tilted diagonally upward toward columella apex)
    const leftAnchor = {
      x: features.leftNostril.x,
      y: Math.min(features.leftNostril.y, subnasalePt.y - 0.001),
    };
    const leftNostrilPts: Vec2[] = [
      { x: leftAnchor.x - wNostril * 0.50, y: leftAnchor.y + hNostril * 0.20 },
      { x: leftAnchor.x - wNostril * 0.20, y: leftAnchor.y - hNostril * 0.40 },
      { x: leftAnchor.x + wNostril * 0.45, y: leftAnchor.y - hNostril * 0.45 },
      { x: leftAnchor.x + wNostril * 0.50, y: leftAnchor.y - hNostril * 0.10 },
      { x: leftAnchor.x + wNostril * 0.15, y: leftAnchor.y + hNostril * 0.45 },
      { x: leftAnchor.x - wNostril * 0.35, y: leftAnchor.y + hNostril * 0.40 },
    ];

    // Right nostril aperture
    const rightAnchor = {
      x: features.rightNostril.x,
      y: Math.min(features.rightNostril.y, subnasalePt.y - 0.001),
    };
    const rightNostrilPts: Vec2[] = [
      { x: rightAnchor.x + wNostril * 0.50, y: rightAnchor.y + hNostril * 0.20 },
      { x: rightAnchor.x + wNostril * 0.20, y: rightAnchor.y - hNostril * 0.40 },
      { x: rightAnchor.x - wNostril * 0.45, y: rightAnchor.y - hNostril * 0.45 },
      { x: rightAnchor.x - wNostril * 0.50, y: rightAnchor.y - hNostril * 0.10 },
      { x: rightAnchor.x - wNostril * 0.15, y: rightAnchor.y + hNostril * 0.45 },
      { x: rightAnchor.x + wNostril * 0.35, y: rightAnchor.y + hNostril * 0.40 },
    ];

    const nostrilFill = colorToHex(palette.skinShadowDeep);
    const nostrilOpacity = Math.min(0.85, 0.55 + 0.25 * visibilityFactor);

    noseShapes.push({
      id: 'nostril-left-aperture',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(leftNostrilPts, toCanvas, 0.18),
      fill: nostrilFill,
      opacity: nostrilOpacity,
      provenance: 'landmark-derived',
    });
    noseShapes.push({
      id: 'nostril-right-aperture',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(rightNostrilPts, toCanvas, 0.18),
      fill: nostrilFill,
      opacity: nostrilOpacity,
      provenance: 'landmark-derived',
    });
  }

  return {
    id: 'layer-nose',
    name: '7. Nose',
    order: 7,
    shapes: noseShapes,
    visible: true,
  };
}
