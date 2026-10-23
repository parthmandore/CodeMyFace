/**
 * CodeMyFace Engine V2 — Phase 4: Styled Vector Portrait SVG Renderer
 *
 * Implements:
 * - Flat-vector portrait styling with OKLab-derived palette
 * - Deliberate, broad planar skin shadows (submandibular neck, lateral cheek, nasal sidewall)
 * - Evidence-based facial hair styling (mustache, goatee, beard)
 * - Clear visual separation between face, hair, clothing, and background
 * - Emits both unstyled Phase 3 geometry and Phase 4 styled portrait
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import {
  Phase4PortraitResult,
  BeautificationSettings,
  FacialHairMode,
  V2Palette,
} from './phase4Types';
import { buildPhase3Portrait } from './phase3SvgRenderer';
import { extractV2Palette } from './paletteExtractor';
import { detectFacialHair } from './facialHairDetector';
import { detectLightingDirection, generateSkinShadingPlanes } from './skinShadingGenerator';

function svgNum(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

function pointsToSvgPolygon(pts: Vec2[]): string {
  if (!pts || pts.length < 2) return '';
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${svgNum(p.x)} ${svgNum(p.y)}`).join(' ');
  return `${d} Z`;
}

function pointsToSmoothClosedPath(pts: Vec2[], tension: number = 0.16): string {
  if (!pts || pts.length < 3) return pointsToSvgPolygon(pts);
  const n = pts.length;
  let d = `M ${svgNum(pts[0].x)} ${svgNum(pts[0].y)}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  return `${d} Z`;
}

export interface BuildPhase4PortraitOptions {
  beautification?: BeautificationSettings;
  facialHairMode?: FacialHairMode;
}

export function buildPhase4Portrait(
  photoId: string,
  analysis: FacialAnalysisResultV2,
  normCanvas: HTMLCanvasElement | null = null,
  options: BuildPhase4PortraitOptions = {}
): Phase4PortraitResult {
  const beautification: BeautificationSettings = options.beautification || {
    brightnessBoost: 0.0,
    warmth: 0.0,
    vibrance: 1.0,
  };
  const facialHairMode: FacialHairMode = options.facialHairMode || 'auto';

  // 1. Build Phase 3 geometry foundation
  const phase3Result = buildPhase3Portrait(photoId, analysis, normCanvas);
  const { face, hair, features } = phase3Result;

  // 2. Extract OKLab-informed color palette
  const palette: V2Palette = extractV2Palette(normCanvas, analysis, beautification);

  // 3. Detect facial hair
  const facialHair = detectFacialHair(normCanvas, analysis, palette.hairBase, facialHairMode, palette.skinBase);

  // 4. Detect lighting direction and generate broad planar shadows
  const leftCheek = { x: 420, y: analysis.landmarks!.leftEye.pupil.y + 40 };
  const rightCheek = { x: 580, y: analysis.landmarks!.rightEye.pupil.y + 40 };
  const lighting = detectLightingDirection(normCanvas, leftCheek, rightCheek);
  const shading = generateSkinShadingPlanes(analysis, face, lighting);

  const facePath = pointsToSmoothClosedPath(face.contourPoints, 0.16);
  const hairPath = hair.isReliable ? pointsToSmoothClosedPath(hair.cleanedContour, 0.18) : '';
  const neckPath = face.neckPoints ? pointsToSvgPolygon(face.neckPoints) : '';
  const shouldersPath = face.shoulderPoints ? pointsToSvgPolygon(face.shoulderPoints) : '';
  const leftEarPath = pointsToSvgPolygon(analysis.landmarks!.ears.estimatedLeftEar);
  const rightEarPath = pointsToSvgPolygon(analysis.landmarks!.ears.estimatedRightEar);

  // 5. Render final styled flat-vector portrait
  const styledSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 4 — Styled Vector Portrait (${photoId})</title>
  <defs>
    <!-- Clip path for eyes -->
    <clipPath id="clip-sclera-l"><path d="${features.leftEye.scleraPath}" /></clipPath>
    <clipPath id="clip-sclera-r"><path d="${features.rightEye.scleraPath}" /></clipPath>
    <!-- Clip path for face interior -->
    <clipPath id="clip-face"><path d="${facePath}" /></clipPath>
    <!-- Clip path for neck interior -->
    ${neckPath ? `<clipPath id="clip-neck"><path d="${neckPath}" /></clipPath>` : ''}
  </defs>

  <!-- 1. Background -->
  <rect id="bg" width="1000" height="1000" fill="${palette.background.hex}" />

  <!-- 2. Clothing & Shoulders -->
  ${shouldersPath ? `
    <path id="shoulders" d="${shouldersPath}" fill="${palette.clothing.hex}" stroke="${palette.hairShadow.hex}" stroke-width="1.5" />
  ` : ''}

  <!-- 3. Neck & Submandibular Shadow -->
  ${neckPath ? `
    <path id="neck" d="${neckPath}" fill="${palette.skinShadow.hex}" />
    <path id="neck-shadow" d="${shading.jawNeckShadowPath}" fill="${palette.skinShadow.hex}" opacity="0.65" clip-path="url(#clip-neck)" />
  ` : ''}

  <!-- 4. Back Hair (Cranial volume flowing behind head/shoulders) -->
  ${hair.isReliable ? `
    <path id="hair-back" d="${hairPath}" fill="${palette.hairBase.hex}" stroke="${palette.hairShadow.hex}" stroke-width="2.5" />
  ` : ''}

  <!-- 5. Ears -->
  ${leftEarPath ? `
    <path id="ear-left" d="${leftEarPath}" fill="${palette.skinBase.hex}" stroke="${palette.skinShadow.hex}" stroke-width="1.5" />
    <path id="ear-right" d="${rightEarPath}" fill="${palette.skinBase.hex}" stroke="${palette.skinShadow.hex}" stroke-width="1.5" />
  ` : ''}

  <!-- 6. Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="${palette.skinBase.hex}" stroke="${palette.skinShadow.hex}" stroke-width="2" />

  <!-- 7. Broad Planar Skin Shading (Clipped inside face) -->
  ${shading.cheekShadowPath ? `
    <path id="cheek-shadow" d="${shading.cheekShadowPath}" fill="${palette.skinShadow.hex}" opacity="0.40" clip-path="url(#clip-face)" />
  ` : ''}
  ${shading.foreheadHighlightPath ? `
    <path id="forehead-highlight" d="${shading.foreheadHighlightPath}" fill="${palette.skinHighlight.hex}" opacity="0.55" clip-path="url(#clip-face)" />
  ` : ''}
  ${shading.cheekHighlightPath ? `
    <path id="cheek-highlight" d="${shading.cheekHighlightPath}" fill="${palette.skinHighlight.hex}" opacity="0.45" clip-path="url(#clip-face)" />
  ` : ''}

  <!-- 8. Front Hair / Bangs (Over forehead and temples) -->
  ${hair.isReliable ? `
    <path id="hair-front" d="${hairPath}" fill="${palette.hairBase.hex}" stroke="${palette.hairShadow.hex}" stroke-width="2.5" />
  ` : `
    <text x="50" y="80" font-family="monospace" font-size="14" fill="#ef4444" font-weight="bold">[DIAGNOSTIC: ${hair.diagnosticStatus}]</text>
  `}

  <!-- 9. Facial Hair (If detected or enabled) -->
  ${facialHair.beardPath ? `
    <path id="beard" d="${facialHair.beardPath}" fill="${palette.hairBase.hex}" opacity="0.85" />
  ` : ''}
  ${facialHair.mustachePath ? `
    <path id="mustache" d="${facialHair.mustachePath}" fill="${palette.hairBase.hex}" opacity="0.85" />
  ` : ''}

  <!-- 10. Eyebrows -->
  <path id="eyebrow-left" d="${features.leftEyebrow.path}" fill="${palette.eyebrows.hex}" stroke="${palette.eyebrows.hex}" stroke-width="0.8" />
  <path id="eyebrow-right" d="${features.rightEyebrow.path}" fill="${palette.eyebrows.hex}" stroke="${palette.eyebrows.hex}" stroke-width="0.8" />

  <!-- 11. Left Eye -->
  <path id="sclera-left" d="${features.leftEye.scleraPath}" fill="#ffffff" stroke="${palette.skinShadow.hex}" stroke-width="1.2" />
  <circle cx="${features.leftEye.iris.cx}" cy="${features.leftEye.iris.cy}" r="${features.leftEye.iris.r}" fill="${palette.iris.hex}" clip-path="url(#clip-sclera-l)" />
  <circle cx="${features.leftEye.pupil.cx}" cy="${features.leftEye.pupil.cy}" r="${features.leftEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-l)" />
  ${features.leftEye.catchlight?.hasCatchlight ? `
    <circle cx="${features.leftEye.catchlight.cx}" cy="${features.leftEye.catchlight.cy}" r="${features.leftEye.catchlight.r}" fill="#ffffff" opacity="${features.leftEye.catchlight.opacity}" clip-path="url(#clip-sclera-l)" />
  ` : ''}
  <path id="upper-lid-left" d="${features.leftEye.upperEyelidPath}" fill="none" stroke="${palette.eyebrows.hex}" stroke-width="2.2" stroke-linecap="round" />
  <path id="lower-lid-left" d="${features.leftEye.lowerEyelidPath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.0" opacity="0.75" stroke-linecap="round" />

  <!-- 12. Right Eye -->
  <path id="sclera-right" d="${features.rightEye.scleraPath}" fill="#ffffff" stroke="${palette.skinShadow.hex}" stroke-width="1.2" />
  <circle cx="${features.rightEye.iris.cx}" cy="${features.rightEye.iris.cy}" r="${features.rightEye.iris.r}" fill="${palette.iris.hex}" clip-path="url(#clip-sclera-r)" />
  <circle cx="${features.rightEye.pupil.cx}" cy="${features.rightEye.pupil.cy}" r="${features.rightEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-r)" />
  ${features.rightEye.catchlight?.hasCatchlight ? `
    <circle cx="${features.rightEye.catchlight.cx}" cy="${features.rightEye.catchlight.cy}" r="${features.rightEye.catchlight.r}" fill="#ffffff" opacity="${features.rightEye.catchlight.opacity}" clip-path="url(#clip-sclera-r)" />
  ` : ''}
  <path id="upper-lid-right" d="${features.rightEye.upperEyelidPath}" fill="none" stroke="${palette.eyebrows.hex}" stroke-width="2.2" stroke-linecap="round" />
  <path id="lower-lid-right" d="${features.rightEye.lowerEyelidPath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.0" opacity="0.75" stroke-linecap="round" />

  <!-- 13. Nose -->
  ${shading.noseSideShadowPath ? `
    <path id="nose-side-shadow" d="${shading.noseSideShadowPath}" fill="${palette.skinShadow.hex}" opacity="0.35" />
  ` : ''}
  <path id="nose-bridge" d="${features.nose.bridgePath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
  <path id="nose-tip" d="${features.nose.tipPath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.8" stroke-linecap="round" />
  ${features.nose.leftWingPath ? `<path id="alar-left" d="${features.nose.leftWingPath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.5" stroke-linecap="round" />` : ''}
  ${features.nose.rightWingPath ? `<path id="alar-right" d="${features.nose.rightWingPath}" fill="none" stroke="${palette.skinShadow.hex}" stroke-width="1.5" stroke-linecap="round" />` : ''}
  <path id="nostril-left" d="${features.nose.leftNostrilPath}" fill="${palette.nostrilShadow.hex}" opacity="0.88" />
  <path id="nostril-right" d="${features.nose.rightNostrilPath}" fill="${palette.nostrilShadow.hex}" opacity="0.88" />

  <!-- 14. Mouth -->
  ${features.mouth.oralCavityPath ? `<path id="oral-cavity" d="${features.mouth.oralCavityPath}" fill="#381616" />` : ''}
  ${features.mouth.teethPath ? `<path id="teeth" d="${features.mouth.teethPath}" fill="#f1eee9" stroke="#d5cebe" stroke-width="0.8" />` : ''}
  <path id="upper-lip" d="${features.mouth.upperLipPath}" fill="${palette.lips.hex}" stroke="${palette.skinShadow.hex}" stroke-width="1.2" />
  <path id="lower-lip" d="${features.mouth.lowerLipPath}" fill="${palette.lips.hex}" stroke="${palette.skinShadow.hex}" stroke-width="1.2" />
  <path id="oral-parting" d="${features.mouth.partingLinePath}" fill="none" stroke="#662d25" stroke-width="1.5" stroke-linecap="round" />
</svg>`;

  return {
    photoId,
    analysis,
    face,
    hair,
    features,
    palette,
    facialHair,
    lighting,
    shading,
    beautification,
    phase3Svg: phase3Result.completeSvg,
    styledSvg,
  };
}
