import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex } from '../geometry';
import { projectSmoothClosedCurveToPath } from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 10: Final Highlights & Accents
 */
export function buildHighlightsLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, toCanvas, isLightRight } = ctx;
  const highlightShapes: PortraitShape[] = [];

  // Forehead highlight plane
  const foreheadCenter = {
    x: (features.templeLeft.x + features.templeRight.x) / 2,
    y: features.foreheadTop.y + 0.05,
  };
  const foreheadHighlightPoly: Vec2[] = [
    { x: foreheadCenter.x - 0.05, y: features.foreheadTop.y + 0.02 },
    { x: foreheadCenter.x + 0.05, y: features.foreheadTop.y + 0.02 },
    { x: foreheadCenter.x + 0.035, y: features.foreheadTop.y + 0.07 },
    { x: foreheadCenter.x - 0.035, y: features.foreheadTop.y + 0.07 },
  ];
  highlightShapes.push({
    id: 'highlight-forehead',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(foreheadHighlightPoly, toCanvas, 0.22),
    fill: colorToHex(palette.skinHighlight),
    opacity: 0.68,
    provenance: 'template-generated',
  });

  // Cheekbone highlight plane
  const litCheekbone = isLightRight ? features.templeRight : features.templeLeft;
  const eyeRefY = isLightRight && features.rightEyeContour[0]
    ? features.rightEyeContour[0].y
    : features.leftEyeContour[0].y;
  const cheekHighlightPoly: Vec2[] = [
    { x: litCheekbone.x * 0.75 + features.noseTip.x * 0.25, y: eyeRefY + 0.03 },
    { x: litCheekbone.x * 0.85 + features.noseTip.x * 0.15, y: eyeRefY + 0.06 },
    { x: litCheekbone.x * 0.70 + features.noseTip.x * 0.30, y: eyeRefY + 0.07 },
  ];
  highlightShapes.push({
    id: 'highlight-cheekbone',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(cheekHighlightPoly, toCanvas, 0.22),
    fill: colorToHex(palette.skinHighlight),
    opacity: 0.65,
    provenance: 'template-generated',
  });

  // Chin mental prominence highlight plane
  const faceWidthNorm = Math.max(0.08, features.templeRight.x - features.templeLeft.x);
  const faceHeight = Math.max(0.10, features.chinTip.y - features.foreheadTop.y);
  const chinHighlightPoly: Vec2[] = [
    { x: features.chinTip.x - faceWidthNorm * 0.05, y: features.chinTip.y - faceHeight * 0.04 },
    { x: features.chinTip.x + faceWidthNorm * 0.05, y: features.chinTip.y - faceHeight * 0.04 },
    { x: features.chinTip.x + faceWidthNorm * 0.035, y: features.chinTip.y - faceHeight * 0.015 },
    { x: features.chinTip.x - faceWidthNorm * 0.035, y: features.chinTip.y - faceHeight * 0.015 },
  ];
  highlightShapes.push({
    id: 'highlight-chin',
    type: 'path',
    pathData: projectSmoothClosedCurveToPath(chinHighlightPoly, toCanvas, 0.22),
    fill: colorToHex(palette.skinHighlight),
    opacity: 0.55,
    provenance: 'template-generated',
  });



  return {
    id: 'layer-highlights',
    name: '10. Highlights & Accents',
    order: 10,
    shapes: highlightShapes,
    visible: true,
  };
}
