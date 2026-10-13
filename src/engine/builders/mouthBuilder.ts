import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex, darken, lighten, svgNum } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
} from '../coordinateTransform';
import { isSmileOpen } from '../faceAnalyzer';
import { BuilderContext } from './types';

/**
 * Layer 8: Mouth and Lips (Curved Smile, Dental Arch, Vermilion Gradient)
 */
export function buildMouthLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, toCanvas, imgDim } = ctx;
  const mouthShapes: PortraitShape[] = [];

  // Philtrum column lines
  const philtrumLeftTop = toCanvas({ x: features.philtrum.x - 0.003, y: features.noseTip.y + 0.008 });
  const philtrumLeftBottom = toCanvas(features.upperLip[2]);
  mouthShapes.push({
    id: 'philtrum-left-line',
    type: 'path',
    pathData: `M ${svgNum(philtrumLeftTop.x)} ${svgNum(philtrumLeftTop.y)} L ${svgNum(philtrumLeftBottom.x)} ${svgNum(philtrumLeftBottom.y)}`,
    fill: 'none',
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 1,
    opacity: 0.4,
    provenance: 'template-generated',
  });

  const philtrumRightTop = toCanvas({ x: features.philtrum.x + 0.003, y: features.noseTip.y + 0.008 });
  const philtrumRightBottom = toCanvas(features.upperLip[8]);
  mouthShapes.push({
    id: 'philtrum-right-line',
    type: 'path',
    pathData: `M ${svgNum(philtrumRightTop.x)} ${svgNum(philtrumRightTop.y)} L ${svgNum(philtrumRightBottom.x)} ${svgNum(philtrumRightBottom.y)}`,
    fill: 'none',
    stroke: colorToHex(palette.skinShadow),
    strokeWidth: 1,
    opacity: 0.4,
    provenance: 'template-generated',
  });

  const smiling = isSmileOpen(features.upperLipInner, features.lowerLipInner, imgDim);

  // If smiling with open teeth: render oral cavity & teeth
  if (smiling) {
    const oralCavity: Vec2[] = [
      ...features.upperLipInner,
      ...[...features.lowerLipInner].reverse(),
    ];
    mouthShapes.push({
      id: 'mouth-oral-cavity',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(oralCavity, toCanvas, 0.18),
      fill: '#240d0f',
      opacity: 0.98,
      provenance: 'landmark-derived',
    });

    // Natural dental arch following the smile curve
    const n = features.upperLipInner.length;
    const bitePoints: Vec2[] = features.upperLipInner.map((uPt, idx) => {
      const lPt = features.lowerLipInner[idx] || uPt;
      // In center incisors, teeth extend ~82% down to meet lower lip;
      // at lateral mouth corners, teeth curve up naturally to ~68%
      const t = idx / (n - 1);
      const archFactor = 0.82 - Math.pow(2 * t - 1, 2) * 0.14;
      return {
        x: uPt.x,
        y: uPt.y + (lPt.y - uPt.y) * archFactor,
      };
    });

    const teethPoly: Vec2[] = [
      ...features.upperLipInner.slice(1, n - 1),
      ...[...bitePoints.slice(1, n - 1)].reverse(),
    ];

    mouthShapes.push({
      id: 'mouth-teeth',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(teethPoly, toCanvas, 0.15),
      fill: 'url(#teeth-dental-grad)',
      stroke: '#ded6d6',
      strokeWidth: 0.8,
      opacity: 0.98,
      provenance: 'template-generated',
    });

    // Incisor dividers: thin vertical dividing lines across teeth arch
    const midIdx = Math.floor(n / 2);
    const incisorIndices = [midIdx - 2, midIdx, midIdx + 2];
    incisorIndices.forEach((tIdx, divIdx) => {
      if (tIdx > 0 && tIdx < n - 1) {
        const topPt = toCanvas(features.upperLipInner[tIdx]);
        const btmPt = toCanvas(bitePoints[tIdx]);
        mouthShapes.push({
          id: `mouth-tooth-div-${divIdx}`,
          type: 'path',
          pathData: `M ${svgNum(topPt.x)} ${svgNum(topPt.y)} L ${svgNum(btmPt.x)} ${svgNum(btmPt.y)}`,
          fill: 'none',
          stroke: '#c8bebe',
          strokeWidth: 0.7,
          opacity: 0.45,
          provenance: 'template-generated',
        });
      }
    });
  }

  // Upper lip polygon (Cupid's bow outer to inner contour)
  const upperLipClosed: Vec2[] = [
    ...features.upperLipOuter,
    ...[...features.upperLipInner].reverse(),
  ];
  mouthShapes.push({
    id: 'upper-lip-facet',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(upperLipClosed, toCanvas, 0.18),
    fill: 'url(#lip-vermilion-grad)',
    stroke: colorToHex(darken(palette.lipColor, 0.18)),
    strokeWidth: 0.9,
    opacity: 1,
    provenance: 'landmark-derived',
  });

  // Lower lip polygon
  const lowerLipClosed: Vec2[] = [
    ...features.lowerLipOuter,
    ...[...features.lowerLipInner].reverse(),
  ];
  mouthShapes.push({
    id: 'lower-lip-facet',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(lowerLipClosed, toCanvas, 0.18),
    fill: colorToHex(lighten(palette.lipColor, 0.08)),
    stroke: colorToHex(darken(palette.lipColor, 0.14)),
    strokeWidth: 0.8,
    opacity: 1,
    provenance: 'landmark-derived',
  });

  // Lower lip central vermilion highlight facet (restrained curved highlight conforming to actual lip geometry)
  const mouthW = Math.abs(features.upperLipOuter[features.upperLipOuter.length - 1].x - features.upperLipOuter[0].x) || 0.13;
  let lipHighlightPlane: Vec2[];

  if (features.lowerLipOuter.length >= 7 && features.lowerLipInner.length >= 7) {
    const nOuter = features.lowerLipOuter.length;
    const nInner = features.lowerLipInner.length;
    const midIdx = Math.floor(nOuter / 2); // Typically index 5

    // Span the central labial cushion (indices midIdx - 2 to midIdx + 2)
    const startIdx = Math.max(1, midIdx - 2);
    const endIdx = Math.min(nOuter - 2, midIdx + 2);

    const topPoints: Vec2[] = [];
    const btmPoints: Vec2[] = [];

    for (let i = startIdx; i <= endIdx; i++) {
      const innerPt = features.lowerLipInner[Math.min(i, nInner - 1)];
      const outerPt = features.lowerLipOuter[i];

      // Lateral pinch factor to taper ends naturally into the lip cushion
      const distFromCenter = Math.abs(i - midIdx) / (endIdx - startIdx || 1);
      const pinch = 1.0 - Math.pow(distFromCenter, 2) * 0.40;

      topPoints.push({
        x: innerPt.x * 0.65 + outerPt.x * 0.35,
        y: innerPt.y * (0.65 + (1 - pinch) * 0.15) + outerPt.y * (0.35 - (1 - pinch) * 0.15),
      });

      btmPoints.push({
        x: innerPt.x * 0.35 + outerPt.x * 0.65,
        y: innerPt.y * (0.35 - (1 - pinch) * 0.15) + outerPt.y * (0.65 + (1 - pinch) * 0.15),
      });
    }

    lipHighlightPlane = [...topPoints, ...btmPoints.reverse()];
  } else {
    // Fallback restrained curved lens conforming to lower lip center
    const lowerLipCenterOuter = features.lowerLipOuter[5] || features.lowerLipOuter[Math.floor(features.lowerLipOuter.length / 2)] || features.lowerLip[0];
    const lowerLipCenterInner = features.lowerLipInner[5] || features.lowerLipInner[Math.floor(features.lowerLipInner.length / 2)] || features.mouthCenter;
    const lowerLipMidY = (lowerLipCenterOuter.y + lowerLipCenterInner.y) * 0.5;
    const lowerLipMidX = (lowerLipCenterOuter.x + lowerLipCenterInner.x) * 0.5;
    const lipH = Math.max(0.008, Math.abs(lowerLipCenterOuter.y - lowerLipCenterInner.y));
    const hlHalfW = Math.max(0.010, Math.min(0.020, mouthW * 0.14));
    const hlHalfH = lipH * 0.22;

    lipHighlightPlane = [
      { x: lowerLipMidX - hlHalfW, y: lowerLipMidY },
      { x: lowerLipMidX - hlHalfW * 0.5, y: lowerLipMidY - hlHalfH * 0.8 },
      { x: lowerLipMidX, y: lowerLipMidY - hlHalfH },
      { x: lowerLipMidX + hlHalfW * 0.5, y: lowerLipMidY - hlHalfH * 0.8 },
      { x: lowerLipMidX + hlHalfW, y: lowerLipMidY },
      { x: lowerLipMidX + hlHalfW * 0.5, y: lowerLipMidY + hlHalfH * 0.8 },
      { x: lowerLipMidX, y: lowerLipMidY + hlHalfH },
      { x: lowerLipMidX - hlHalfW * 0.5, y: lowerLipMidY + hlHalfH * 0.8 },
    ];
  }

  mouthShapes.push({
    id: 'lower-lip-highlight',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(lipHighlightPlane, toCanvas, 0.20),
    fill: colorToHex(palette.lipHighlight),
    opacity: 0.60,
    provenance: 'landmark-derived',
  });

  // Natural commissures at mouth corners (preserving authentic expression without forced smile)
  const leftCorner = features.upperLipOuter[0];
  const rightCorner = features.upperLipOuter[features.upperLipOuter.length - 1];

  if (leftCorner && rightCorner) {
    const leftAdjacent = features.upperLipInner[1] || features.upperLipOuter[1] || leftCorner;
    const rightAdjacent = features.upperLipInner[features.upperLipInner.length - 2] ||
      features.upperLipOuter[features.upperLipOuter.length - 2] || rightCorner;

    // Tangent vectors following actual parting crease through the mouth corners
    const dxL = leftCorner.x - leftAdjacent.x;
    const dyL = leftCorner.y - leftAdjacent.y;
    const lenL = Math.hypot(dxL, dyL) || 0.01;
    const normDxL = dxL / lenL;
    const normDyL = dyL / lenL;

    const dxR = rightCorner.x - rightAdjacent.x;
    const dyR = rightCorner.y - rightAdjacent.y;
    const lenR = Math.hypot(dxR, dyR) || 0.01;
    const normDxR = dxR / lenR;
    const normDyR = dyR / lenR;

    const commissureLen = mouthW * 0.06;

    const leftCommissure: Vec2[] = [
      { x: leftCorner.x - normDxL * commissureLen * 0.35, y: leftCorner.y - normDyL * commissureLen * 0.35 },
      leftCorner,
      { x: leftCorner.x + normDxL * commissureLen * 0.65, y: leftCorner.y + normDyL * commissureLen * 0.65 },
    ];

    const rightCommissure: Vec2[] = [
      { x: rightCorner.x - normDxR * commissureLen * 0.35, y: rightCorner.y - normDyR * commissureLen * 0.35 },
      rightCorner,
      { x: rightCorner.x + normDxR * commissureLen * 0.65, y: rightCorner.y + normDyR * commissureLen * 0.65 },
    ];

    mouthShapes.push({
      id: 'mouth-commissure-left',
      type: 'path',
      pathData: projectOpenCurveToPath(leftCommissure, toCanvas, 0.20),
      fill: 'none',
      stroke: colorToHex(darken(palette.lipColor, 0.25)),
      strokeWidth: 1.3,
      opacity: 0.75,
      provenance: 'landmark-derived',
    });

    mouthShapes.push({
      id: 'mouth-commissure-right',
      type: 'path',
      pathData: projectOpenCurveToPath(rightCommissure, toCanvas, 0.20),
      fill: 'none',
      stroke: colorToHex(darken(palette.lipColor, 0.25)),
      strokeWidth: 1.3,
      opacity: 0.75,
      provenance: 'landmark-derived',
    });
  }

  // Mouth parting line / dark shadow crease (if closed)
  if (!smiling) {
    mouthShapes.push({
      id: 'mouth-parting-crease',
      type: 'path',
      pathData: projectOpenCurveToPath(features.upperLipInner, toCanvas, 0.2),
      fill: 'none',
      stroke: colorToHex(palette.lipShadow),
      strokeWidth: 2,
      opacity: 0.90,
      provenance: 'landmark-derived',
    });
  }

  return {
    id: 'layer-mouth-lips',
    name: '8. Mouth & Lips',
    order: 8,
    shapes: mouthShapes,
    visible: true,
  };
}
