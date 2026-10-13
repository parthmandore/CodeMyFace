/**
 * CodeMyFace — Master SVG Vector Portrait Renderer
 *
 * Implements high-quality, stylized digital vector portraiture directly
 * matching the product vision:
 * - Solid warm peach canvas (#DEAA88)
 * - Large, auto-centered, perfectly framed floating head
 * - STRICTLY FACE ONLY: No neck, no shoulders, no torso, no circular badge
 * - ZERO ASPECT RATIO DISTORTION: Uses isotropic coordinate projection
 * - Volumetric organic cranial hair dome with natural forehead fringe curls
 * - Volumetric SVG gradients for skin, hair, eyes, and beard
 * - Anatomical vector eyebrows and expressive radial-gradient eyes
 * - Smooth dorsal nose highlight with anatomical lobule and alar wings
 * - Natural smile dental arch with incisor dividers and vermilion lips
 * - Mandibular beard and sculpted mustache seamlessly framing the jaw
 * - Semantic, readable element IDs ready for live code typing
 * - Modular builder architecture with shape provenance tracking
 *
 * Output: 100% standalone, valid SVG with zero raster image embeds.
 */
import {
  FaceAnalysis,
  PortraitLayer,
  PortraitModel,
  Vec2,
} from '../types/portrait';
import {
  createFaceProjection,
  extractReliableFacePoints,
  computeIllustrationViewBox,
} from './coordinateTransform';
import { svgNum } from './geometry';
import {
  BuilderContext,
  buildGradients,
  buildClipDefs,
  buildBackgroundLayer,
  buildEarsLayer,
  buildFaceSilhouetteLayer,
  buildHairLayer,
  buildFacialShadowsLayer,
  buildEyesLayer,
  buildNoseLayer,
  buildMouthLayer,
  buildFacialHairLayer,
  buildHighlightsLayer,
} from './builders';

/**
 * Builds the complete 10-layer PortraitModel from face analysis
 */
export function buildPortraitModel(
  analysis: FaceAnalysis,
  canvasWidth: number = 1000,
  canvasHeight: number = 1000
): PortraitModel {
  const { features, palette, hairEstimate, facialHairEstimate } = analysis;
  const w = canvasWidth;
  const h = canvasHeight;

  const imgDim = {
    width: analysis.imageWidth || 1000,
    height: analysis.imageHeight || 1000,
  };

  // Derive the face coordinate system STRICTLY from reliable facial landmarks.
  // Hair, back hair, neck, and synthetic crown points NEVER influence face scale or translation!
  const reliableFacePoints = extractReliableFacePoints(features);

  // Calculate ISOTROPIC face-only projection (aspect-ratio preserved!)
  const projection = createFaceProjection(reliableFacePoints, imgDim, {
    width: w,
    height: h,
  });
  const { toCanvas, scale } = projection;

  // Calculate outer illustration canvas bounds (face, ears, hair, beard) to manage viewBox
  const illustrationCanvasPoints: Vec2[] = [];
  const addPoints = (pts?: Vec2[]) => {
    if (pts) {
      for (const p of pts) {
        illustrationCanvasPoints.push(toCanvas(p));
      }
    }
  };
  addPoints(features.faceOutline);
  addPoints(features.leftEar);
  addPoints(features.rightEar);
  addPoints(hairEstimate.silhouettePoints);
  addPoints(hairEstimate.backHairPoints);
  if (facialHairEstimate.hasBeard) {
    addPoints(facialHairEstimate.beardRegion);
  }

  // Compute viewBox that accommodates the full illustration without clipping,
  // while preserving default [0, 0, w, h] when shapes fit comfortably within artboard.
  const viewBox = computeIllustrationViewBox(illustrationCanvasPoints, w, h, 40);

  const isLightLeft = palette.lightDirection === 'left';
  const isLightRight = palette.lightDirection === 'right';

  const ctx: BuilderContext = {
    analysis,
    features,
    palette,
    hairEstimate,
    facialHairEstimate,
    canvasWidth: w,
    canvasHeight: h,
    viewBox,
    imgDim,
    toCanvas,
    scale,
    isLightLeft,
    isLightRight,
  };

  // Build gradients
  const gradientDefs = buildGradients(ctx);

  // Build all 10 semantic portrait layers modularly
  const layer1 = buildBackgroundLayer(ctx);
  const layer2 = buildEarsLayer(ctx);
  const layer3 = buildFaceSilhouetteLayer(ctx);
  const layer4 = buildHairLayer(ctx);
  const layer5 = buildFacialShadowsLayer(ctx);
  const { layer: layer6, leftScleraPath, rightScleraPath } = buildEyesLayer(ctx);
  const layer7 = buildNoseLayer(ctx);
  const layer8 = buildMouthLayer(ctx);
  const layer9 = buildFacialHairLayer(ctx);
  const layer10 = buildHighlightsLayer(ctx);

  // Build clip definitions (sclera clip paths for eyes)
  const clipDefs = buildClipDefs(leftScleraPath, rightScleraPath);

  const layers: PortraitLayer[] = [
    layer1,
    layer2,
    layer3,
    layer4,
    layer5,
    layer6,
    layer7,
    layer8,
    layer9,
    layer10,
  ];

  return {
    version: '2.0.0',
    timestamp: Date.now(),
    canvasWidth: w,
    canvasHeight: h,
    viewBox,
    layers,
    palette,
    analysis,
    clipDefs,
    gradientDefs,
  };
}

/**
 * Converts a PortraitModel to a clean, valid standalone SVG string
 */
export function renderPortraitSvg(model: PortraitModel): string {
  const { canvasWidth, canvasHeight, viewBox, layers, clipDefs, gradientDefs } = model;
  const vb = viewBox || { minX: 0, minY: 0, width: canvasWidth, height: canvasHeight };

  const lines: string[] = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${svgNum(vb.minX)} ${svgNum(vb.minY)} ${svgNum(vb.width)} ${svgNum(vb.height)}" width="100%" height="100%">`
  );
  lines.push(`  <title>CodeMyFace Vector Portrait</title>`);
  lines.push(`  <desc>Original stylized geometric vector portrait generated client-side by CodeMyFace</desc>`);

  if ((clipDefs && clipDefs.length > 0) || (gradientDefs && gradientDefs.length > 0)) {
    lines.push(`  <defs>`);
    if (gradientDefs) {
      for (const grad of gradientDefs) {
        lines.push(`    ${grad}`);
      }
    }
    if (clipDefs) {
      for (const def of clipDefs) {
        lines.push(`    <clipPath id="${def.id}">`);
        lines.push(`      <path d="${def.pathData}" />`);
        lines.push(`    </clipPath>`);
      }
    }
    lines.push(`  </defs>`);
  }

  for (const layer of layers) {
    if (!layer.visible || layer.shapes.length === 0) continue;

    lines.push(`  <!-- Layer ${layer.order}: ${layer.name} -->`);
    lines.push(`  <g id="${layer.id}">`);

    for (const shape of layer.shapes) {
      const strokeAttr = shape.stroke ? ` stroke="${shape.stroke}" stroke-width="${shape.strokeWidth || 1}"` : '';
      const opacityAttr = shape.opacity < 1 ? ` opacity="${svgNum(shape.opacity)}"` : '';
      const clipAttr = shape.clipPath ? ` clip-path="url(#${shape.clipPath})"` : '';
      const provenanceAttr = shape.provenance ? ` data-provenance="${shape.provenance}"` : '';

      if (shape.type === 'path' && shape.pathData) {
        lines.push(`    <path id="${shape.id}" d="${shape.pathData}" fill="${shape.fill}"${strokeAttr}${opacityAttr}${clipAttr}${provenanceAttr} />`);
      } else if (shape.type === 'circle' && shape.cx !== undefined && shape.cy !== undefined && shape.r !== undefined) {
        lines.push(
          `    <circle id="${shape.id}" cx="${svgNum(shape.cx)}" cy="${svgNum(shape.cy)}" r="${svgNum(shape.r)}" fill="${shape.fill}"${strokeAttr}${opacityAttr}${clipAttr}${provenanceAttr} />`
        );
      }
    }

    lines.push(`  </g>`);
  }

  lines.push(`</svg>`);
  return lines.join('\n');
}
