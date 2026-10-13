import { PortraitLayer, PortraitShape, Vec2 } from '../../types/portrait';
import { colorToHex, darken } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
} from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 2: Ears & Back Hair (Back Hair cascades behind face silhouette & ears)
 */
export function buildEarsLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, hairEstimate, toCanvas } = ctx;
  const earShapes: PortraitShape[] = [];

  // Cascading back hair silhouette (flowing behind the head/ears for long-haired subjects)
  if (hairEstimate.backHairPoints && hairEstimate.backHairPoints.length >= 3) {
    earShapes.push({
      id: 'hair-back-silhouette',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(hairEstimate.backHairPoints, toCanvas, 0.20),
      fill: 'url(#hair-base-grad)',
      stroke: colorToHex(darken(hairEstimate.color, 0.3)),
      strokeWidth: 2,
      opacity: 1,
      provenance: hairEstimate.provenance || 'template-generated',
    });
  }

  // Check if ears are concealed by hair (long hair, lateral drape, or side coverage)
  const hasSideHairCover = Boolean(
    hairEstimate.hasLongHairSides ||
    hairEstimate.length === 'long' ||
    hairEstimate.style === 'long'
  );

  const isLeftEarConcealedByHair = Boolean(
    hasSideHairCover ||
    (hairEstimate.length !== 'short' &&
      hairEstimate.silhouettePoints &&
      features.leftEar?.[2] &&
      hairEstimate.silhouettePoints.some(
        (p) => p.x <= features.leftEar![2].x && p.y >= features.leftEar![0].y && p.y <= features.leftEar![4].y
      ))
  );

  const isRightEarConcealedByHair = Boolean(
    hasSideHairCover ||
    (hairEstimate.length !== 'short' &&
      hairEstimate.silhouettePoints &&
      features.rightEar?.[2] &&
      hairEstimate.silhouettePoints.some(
        (p) => p.x >= features.rightEar![2].x && p.y >= features.rightEar![0].y && p.y <= features.rightEar![4].y
      ))
  );

  const isLeftEarCropped = Boolean(
    features.leftEar && features.leftEar.some((p) => p.x <= 0.005 || p.x >= 0.995)
  );
  const isRightEarCropped = Boolean(
    features.rightEar && features.rightEar.some((p) => p.x <= 0.005 || p.x >= 0.995)
  );

  // Left Ear (restrained frontal pinna anchored seamlessly to preauricular contour)
  if (features.leftEar && features.leftEar.length >= 3 && !isLeftEarConcealedByHair && !isLeftEarCropped) {
    earShapes.push({
      id: 'ear-left',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(features.leftEar, toCanvas, 0.20),
      fill: colorToHex(palette.skinBase),
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.2,
      opacity: 1,
      provenance: 'landmark-derived',
    });
    const innerEarLeft: Vec2[] = [
      features.leftEar[0],
      { x: features.leftEar[1].x + 0.005, y: features.leftEar[1].y },
      features.leftEar[2],
    ];
    earShapes.push({
      id: 'ear-left-inner',
      type: 'path',
      pathData: projectOpenCurveToPath(innerEarLeft, toCanvas, 0.18),
      fill: 'none',
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.1,
      opacity: 0.55,
      provenance: 'landmark-derived',
    });
  }

  // Right Ear
  if (features.rightEar && features.rightEar.length >= 3 && !isRightEarConcealedByHair && !isRightEarCropped) {
    earShapes.push({
      id: 'ear-right',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(features.rightEar, toCanvas, 0.20),
      fill: colorToHex(palette.skinBase),
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.2,
      opacity: 1,
      provenance: 'landmark-derived',
    });
    const innerEarRight: Vec2[] = [
      features.rightEar[0],
      { x: features.rightEar[1].x - 0.005, y: features.rightEar[1].y },
      features.rightEar[2],
    ];
    earShapes.push({
      id: 'ear-right-inner',
      type: 'path',
      pathData: projectOpenCurveToPath(innerEarRight, toCanvas, 0.18),
      fill: 'none',
      stroke: colorToHex(palette.skinShadow),
      strokeWidth: 1.1,
      opacity: 0.55,
      provenance: 'landmark-derived',
    });
  }

  return {
    id: 'layer-ears',
    name: '2. Ears',
    order: 2,
    shapes: earShapes,
    visible: true,
  };
}
