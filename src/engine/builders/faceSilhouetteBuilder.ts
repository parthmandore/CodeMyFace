import { PortraitLayer, PortraitShape } from '../../types/portrait';
import { colorToHex, darken } from '../geometry';
import { projectSmoothClosedCurveToPath } from '../coordinateTransform';
import { BuilderContext } from './types';

/**
 * Layer 3: Main Face Silhouette (Smooth Mandibular Geometric Contour)
 */
export function buildFaceSilhouetteLayer(ctx: BuilderContext): PortraitLayer {
  const { features, palette, toCanvas } = ctx;

  if (!features.faceOutline || features.faceOutline.length < 3) {
    return {
      id: 'layer-face-silhouette',
      name: '3. Face Silhouette',
      order: 3,
      shapes: [],
      visible: true,
    };
  }

  // Smooth chin mental crest points (indices 16 to 20 around 152) to avoid acute V-chin pinching
  const smoothedFaceOutline = features.faceOutline.map((pt, i, arr) => {
    if (i >= 16 && i <= 20) {
      const prev = arr[(i - 1 + arr.length) % arr.length];
      const next = arr[(i + 1) % arr.length];
      return {
        x: 0.20 * prev.x + 0.60 * pt.x + 0.20 * next.x,
        y: 0.20 * prev.y + 0.60 * pt.y + 0.20 * next.y,
      };
    }
    return pt;
  });

  const faceOutlinePath = projectSmoothClosedCurveToPath(smoothedFaceOutline, toCanvas, 0.20);
  const faceShapes: PortraitShape[] = [
    {
      id: 'face-silhouette',
      type: 'path',
      pathData: faceOutlinePath,
      fill: 'url(#skin-volume-grad)',
      stroke: colorToHex(darken(palette.skinBase, 0.16)),
      strokeWidth: 1.5,
      opacity: 1,
      provenance: 'landmark-derived',
    },
  ];

  return {
    id: 'layer-face-silhouette',
    name: '3. Face Silhouette',
    order: 3,
    shapes: faceShapes,
    visible: true,
  };
}
