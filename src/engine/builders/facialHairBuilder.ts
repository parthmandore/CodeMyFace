import { PortraitLayer, PortraitShape } from '../../types/portrait';
import { colorToHex, darken } from '../geometry';
import { projectSmoothClosedCurveToPath } from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 9: Beard & Mustache (Smooth Mandibular Contour with Volumetric Gradient)
 */
export function buildFacialHairLayer(ctx: BuilderContext): PortraitLayer {
  const { facialHairEstimate, toCanvas } = ctx;
  const facialHairShapes: PortraitShape[] = [];
  const shapeProvenance = facialHairEstimate.provenance || 'template-generated';

  // Mustache
  if (facialHairEstimate.hasMustache && facialHairEstimate.mustacheRegion.length >= 3) {
    facialHairShapes.push({
      id: 'mustache-main',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.mustacheRegion, toCanvas, 0.18),
      fill: 'url(#beard-body-grad)',
      stroke: colorToHex(darken(facialHairEstimate.color, 0.2)),
      strokeWidth: 1.2,
      opacity: facialHairEstimate.density === 'heavy' ? 0.98 : 0.90,
      provenance: shapeProvenance,
    });
  }

  // Soul patch (comfortably positioned below lower lip in labiomental groove)
  if (facialHairEstimate.soulPatchRegion && facialHairEstimate.soulPatchRegion.length >= 3) {
    facialHairShapes.push({
      id: 'soul-patch-facet',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.soulPatchRegion, toCanvas, 0.18),
      fill: 'url(#beard-body-grad)',
      opacity: 0.90,
      provenance: shapeProvenance,
    });
  }

  // Beard (Main contour: jawline / goatee / full beard)
  if (facialHairEstimate.hasBeard && facialHairEstimate.beardRegion.length >= 3) {
    facialHairShapes.push({
      id: 'beard-main',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.beardRegion, toCanvas, 0.20),
      fill: 'url(#beard-body-grad)',
      stroke: colorToHex(darken(facialHairEstimate.color, 0.20)),
      strokeWidth: 1.2,
      opacity: facialHairEstimate.density === 'heavy' ? 0.92 : 0.86,
      provenance: shapeProvenance,
    });
  }

  // Chin cleft / mandibular accent
  if (facialHairEstimate.chinCleftRegion && facialHairEstimate.chinCleftRegion.length >= 3) {
    facialHairShapes.push({
      id: 'chin-cleft-accent',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.chinCleftRegion, toCanvas, 0.20),
      fill: colorToHex(facialHairEstimate.beardShadowColor),
      opacity: 0.50,
      provenance: shapeProvenance,
    });
  }

  // Sideburns
  if (facialHairEstimate.sideburnLeft && facialHairEstimate.sideburnLeft.length >= 3) {
    facialHairShapes.push({
      id: 'sideburn-left',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.sideburnLeft, toCanvas, 0.20),
      fill: 'url(#beard-body-grad)',
      opacity: 0.90,
      provenance: shapeProvenance,
    });
  }
  if (facialHairEstimate.sideburnRight && facialHairEstimate.sideburnRight.length >= 3) {
    facialHairShapes.push({
      id: 'sideburn-right',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(facialHairEstimate.sideburnRight, toCanvas, 0.20),
      fill: 'url(#beard-body-grad)',
      opacity: 0.90,
      provenance: shapeProvenance,
    });
  }

  return {
    id: 'layer-facial-hair',
    name: '9. Facial Hair',
    order: 9,
    shapes: facialHairShapes,
    visible: facialHairShapes.length > 0,
  };
}
