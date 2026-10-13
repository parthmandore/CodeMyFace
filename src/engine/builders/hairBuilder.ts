import { PortraitLayer, PortraitShape } from '../../types/portrait';
import { colorToHex, darken, lighten } from '../geometry';
import {
  projectSmoothClosedCurveToPath,
  projectOpenCurveToPath,
} from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 4: Hair (Volumetric Cranial Dome, Hairline Framing, Fringe Curls)
 */
export function buildHairLayer(ctx: BuilderContext): PortraitLayer {
  const { hairEstimate, toCanvas } = ctx;
  const hairShapes: PortraitShape[] = [];

  if (hairEstimate.silhouettePoints.length >= 3) {
    // Main volumetric hair silhouette
    hairShapes.push({
      id: 'hair-silhouette',
      type: 'path',
      pathData: projectSmoothClosedCurveToPath(hairEstimate.silhouettePoints, toCanvas, 0.20),
      fill: 'url(#hair-base-grad)',
      stroke: colorToHex(darken(hairEstimate.color, 0.3)),
      strokeWidth: 2,
      opacity: 1,
      provenance: hairEstimate.provenance || 'template-generated',
    });

    // Interior hair strand lock accents (directional volume strokes)
    if (hairEstimate.hairStrands) {
      hairEstimate.hairStrands.forEach((strand, idx) => {
        if (strand.length >= 3) {
          hairShapes.push({
            id: `hair-facet-${idx === 0 ? 'left' : idx === 1 ? 'right' : idx}`,
            type: 'path',
            pathData: projectOpenCurveToPath(strand, toCanvas, 0.22),
            fill: 'none',
            stroke: colorToHex(lighten(hairEstimate.secondaryColor, 0.15)),
            strokeWidth: 2.2,
            opacity: 0.50,
            provenance: 'template-generated',
          });
        }
      });
    }

    // Hair specular highlight facets across 3D crown curvature
    if (hairEstimate.hairHighlights) {
      hairEstimate.hairHighlights.forEach((hl, idx) => {
        if (hl.length >= 3) {
          hairShapes.push({
            id: `hair-sheen-${idx}`,
            type: 'path',
            pathData: projectSmoothClosedCurveToPath(hl, toCanvas, 0.22),
            fill: colorToHex(lighten(hairEstimate.secondaryColor, 0.20)),
            opacity: 0.35,
            provenance: 'template-generated',
          });
        }
      });
    }

    // Fringe lock accents (if explicitly configured or passed in analysis)
    if (hairEstimate.fringeLocks) {
      hairEstimate.fringeLocks.forEach((lock, idx) => {
        if (lock.length >= 3) {
          hairShapes.push({
            id: `hair-fringe-${idx}`,
            type: 'path',
            pathData: projectSmoothClosedCurveToPath(lock, toCanvas, 0.22),
            fill: 'url(#hair-base-grad)',
            stroke: colorToHex(darken(hairEstimate.color, 0.30)),
            strokeWidth: 1.0,
            opacity: 0.90,
            provenance: 'template-generated',
          });
        }
      });
    }

    // Hairline contour trim (crisp edge framing forehead only for template fixtures)
    if (hairEstimate.hairlineContour && hairEstimate.hairlineContour.length >= 3 && hairEstimate.provenance !== 'segmentation-mask-derived') {
      hairShapes.push({
        id: 'hair-hairline-trim',
        type: 'path',
        pathData: projectOpenCurveToPath(hairEstimate.hairlineContour, toCanvas, 0.2),
        fill: 'none',
        stroke: colorToHex(darken(hairEstimate.color, 0.35)),
        strokeWidth: 1.5,
        opacity: 0.7,
        provenance: 'template-generated',
      });
    }
  }

  return {
    id: 'layer-hair',
    name: '4. Hair',
    order: 4,
    shapes: hairShapes,
    visible: true,
  };
}
