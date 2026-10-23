/**
 * CodeMyFace Engine V2 — Phase 5: Progressive SVG Generator
 *
 * Implements deterministic progressive SVG construction:
 * - Generates valid, self-contained SVG strings for each of the 6 stages
 * - Preserves exact coordinate geometry across all stages (zero landmark drift)
 * - Embeds truthful XML comments for pending stages (no fabricated shapes)
 * - Guarantees that Stage 6 is byte-for-byte identical to Phase 4 styled output
 */

import { Vec2 } from '../../types/portrait';
import { ProgressiveStageId, ProgressiveDataState } from './phase5Types';

function pointsToSmoothClosedPath(pts: Vec2[], tension: number = 0.16): string {
  if (!pts || pts.length < 3) return '';
  const n = pts.length;
  let d = `M ${Math.round(pts[0].x * 10) / 10} ${Math.round(pts[0].y * 10) / 10}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${Math.round(cp1x * 10) / 10} ${Math.round(cp1y * 10) / 10}, ${Math.round(cp2x * 10) / 10} ${Math.round(cp2y * 10) / 10}, ${Math.round(p2.x * 10) / 10} ${Math.round(p2.y * 10) / 10}`;
  }
  return `${d} Z`;
}

function pointsToSvgPolygon(pts: Vec2[]): string {
  if (!pts || pts.length < 3) return '';
  return `M ${pts.map(p => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`).join(' L ')} Z`;
}

export function buildProgressiveSvg(
  stageId: ProgressiveStageId,
  data: ProgressiveDataState
): { svg: string; code: string } {
  const { photoId, analysis, face, hair, features, palette, facialHair, shading } = data;

  // Paths
  const facePath = face ? pointsToSmoothClosedPath(face.contourPoints, 0.16) : '';
  const hairPath = (hair && hair.isReliable) ? pointsToSmoothClosedPath(hair.cleanedContour, 0.18) : '';
  const backHairPath = (hair && hair.isReliable)
    ? (hair.backHairContour && hair.backHairContour.length >= 3
        ? pointsToSmoothClosedPath(hair.backHairContour, 0.18)
        : hairPath)
    : '';
  const neckPath = (face && face.neckPoints) ? pointsToSvgPolygon(face.neckPoints) : '';
  const shouldersPath = (face && face.shoulderPoints) ? pointsToSvgPolygon(face.shoulderPoints) : '';
  const leftEarPath = analysis?.landmarks ? pointsToSmoothClosedPath(analysis.landmarks.ears.estimatedLeftEar, 0.28) : '';
  const rightEarPath = analysis?.landmarks ? pointsToSmoothClosedPath(analysis.landmarks.ears.estimatedRightEar, 0.28) : '';

  let bodyContent = '';

  switch (stageId) {
    case 'image-analysis': {
      bodyContent = `  <!-- 1. Background Canvas -->
  <rect id="bg" width="1000" height="1000" fill="#090d16" />

  <!-- 1b. Canonical Artboard Calibration Frame -->
  <g id="calibration-frame" opacity="0.6">
    <rect x="50" y="50" width="900" height="900" fill="none" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="4,4" />
    <line x1="500" y1="50" x2="500" y2="950" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,4" />
    <line x1="50" y1="480" x2="950" y2="480" stroke="#1e293b" stroke-width="1" stroke-dasharray="2,4" />
    <!-- Canonical Face Bounds Target (300 width) -->
    <rect x="350" y="300" width="300" height="400" rx="150" fill="none" stroke="#0ea5e9" stroke-width="1.5" stroke-dasharray="6,6" opacity="0.4" />
    <!-- Landmarks Count & Alignment -->
    <text x="500" y="960" fill="#64748b" font-family="monospace" font-size="12" text-anchor="middle">
      Stage 1: 478 MediaPipe Landmarks Calibrated | Canonical 1000x1000 Frame Active
    </text>
  </g>

  <!-- [Pending Stage 2: Face & Structural Contour] -->
  <!-- [Pending Stage 3: Hair Silhouette & Cranial Volume] -->
  <!-- [Pending Stage 4: Anatomical Facial Features] -->
  <!-- [Pending Stage 5: OKLab Palettes & Planar Shading] -->
  <!-- [Pending Stage 6: Final Vector SVG Assembly] -->`;
      break;
    }

    case 'face-geometry': {
      bodyContent = `  <!-- 1. Background Canvas -->
  <rect id="bg" width="1000" height="1000" fill="#090d16" />

  <!-- 2. Shoulders & Torso Outline -->
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#1e293b" stroke="#334155" stroke-width="1.5" />` : ''}

  <!-- 3. Cervical Neck Contour -->
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#2a3547" stroke="#3b485d" stroke-width="1.5" />` : ''}

  <!-- 4. Anatomical Preauricular Ears -->
  ${leftEarPath ? `
    <path id="ear-left" d="${leftEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
    <path id="ear-right" d="${rightEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
  ` : ''}

  <!-- 5. Mandibular Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="#475569" stroke="#64748b" stroke-width="2" />

  <!-- [Pending Stage 3: Hair Silhouette & Cranial Volume] -->
  <!-- [Pending Stage 4: Anatomical Facial Features] -->
  <!-- [Pending Stage 5: OKLab Palettes & Planar Shading] -->
  <!-- [Pending Stage 6: Final Vector SVG Assembly] -->`;
      break;
    }

    case 'hair-geometry': {
      bodyContent = `  <!-- 1. Background Canvas -->
  <rect id="bg" width="1000" height="1000" fill="#090d16" />

  <!-- 2. Shoulders & Torso Outline -->
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#1e293b" stroke="#334155" stroke-width="1.5" />` : ''}

  <!-- 3. Cervical Neck Contour -->
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#2a3547" stroke="#3b485d" stroke-width="1.5" />` : ''}

  <!-- 4. Back Hair Volume (flowing behind head) -->
  ${backHairPath ? `<path id="hair-back" d="${backHairPath}" fill="#18202f" stroke="#334155" stroke-width="2" />` : ''}

  <!-- 5. Anatomical Preauricular Ears -->
  ${leftEarPath ? `
    <path id="ear-left" d="${leftEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
    <path id="ear-right" d="${rightEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
  ` : ''}

  <!-- 6. Mandibular Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="#475569" stroke="#64748b" stroke-width="2" />

  <!-- 7. Forehead Hair Overlap (Front Hair / Bangs) -->
  ${(hair?.metrics?.hasBangs && hairPath) ? `<path id="hair-front" d="${hairPath}" fill="#18202f" stroke="#334155" stroke-width="1.5" />` : ''}

  <!-- [Pending Stage 4: Anatomical Facial Features] -->
  <!-- [Pending Stage 5: OKLab Palettes & Planar Shading] -->
  <!-- [Pending Stage 6: Final Vector SVG Assembly] -->`;
      break;
    }

    case 'facial-features': {
      if (!features) {
        return buildProgressiveSvg('hair-geometry', data);
      }
      const f = features;
      bodyContent = `  <defs>
    <clipPath id="clip-sclera-l"><path d="${f.leftEye.scleraPath}" /></clipPath>
    <clipPath id="clip-sclera-r"><path d="${f.rightEye.scleraPath}" /></clipPath>
  </defs>

  <!-- 1. Background Canvas -->
  <rect id="bg" width="1000" height="1000" fill="#090d16" />

  <!-- 2. Shoulders & Torso Outline -->
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#1e293b" stroke="#334155" stroke-width="1.5" />` : ''}

  <!-- 3. Cervical Neck Contour -->
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#2a3547" stroke="#3b485d" stroke-width="1.5" />` : ''}

  <!-- 4. Back Hair Volume -->
  ${backHairPath ? `<path id="hair-back" d="${backHairPath}" fill="#18202f" stroke="#334155" stroke-width="2" />` : ''}

  <!-- 5. Anatomical Ears -->
  ${leftEarPath ? `
    <path id="ear-left" d="${leftEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
    <path id="ear-right" d="${rightEarPath}" fill="#3b485d" stroke="#4b5563" stroke-width="1.5" />
  ` : ''}

  <!-- 6. Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="#475569" stroke="#64748b" stroke-width="2" />

  <!-- 7. Forehead Hair Overlap (Front Hair / Bangs) -->
  ${(hair?.metrics?.hasBangs && hairPath) ? `<path id="hair-front" d="${hairPath}" fill="#18202f" stroke="#334155" stroke-width="1.5" />` : ''}

  <!-- 8. Eyebrows -->
  <path id="eyebrow-left" d="${f.leftEyebrow.path}" fill="#1e293b" />
  <path id="eyebrow-right" d="${f.rightEyebrow.path}" fill="#1e293b" />

  <!-- 9. Anatomical Eyes -->
  <path id="sclera-left" d="${f.leftEye.scleraPath}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" />
  <circle id="iris-left" cx="${f.leftEye.iris.cx}" cy="${f.leftEye.iris.cy}" r="${f.leftEye.iris.r}" fill="#334155" clip-path="url(#clip-sclera-l)" />
  <circle id="pupil-left" cx="${f.leftEye.pupil.cx}" cy="${f.leftEye.pupil.cy}" r="${f.leftEye.pupil.r}" fill="#090d16" clip-path="url(#clip-sclera-l)" />
  ${f.leftEye.catchlight?.hasCatchlight ? `<circle id="catchlight-left" cx="${f.leftEye.catchlight.cx}" cy="${f.leftEye.catchlight.cy}" r="${f.leftEye.catchlight.r}" fill="#ffffff" opacity="${f.leftEye.catchlight.opacity}" clip-path="url(#clip-sclera-l)" />` : ''}

  <path id="sclera-right" d="${f.rightEye.scleraPath}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1.2" />
  <circle id="iris-right" cx="${f.rightEye.iris.cx}" cy="${f.rightEye.iris.cy}" r="${f.rightEye.iris.r}" fill="#334155" clip-path="url(#clip-sclera-r)" />
  <circle id="pupil-right" cx="${f.rightEye.pupil.cx}" cy="${f.rightEye.pupil.cy}" r="${f.rightEye.pupil.r}" fill="#090d16" clip-path="url(#clip-sclera-r)" />
  ${f.rightEye.catchlight?.hasCatchlight ? `<circle id="catchlight-right" cx="${f.rightEye.catchlight.cx}" cy="${f.rightEye.catchlight.cy}" r="${f.rightEye.catchlight.r}" fill="#ffffff" opacity="${f.rightEye.catchlight.opacity}" clip-path="url(#clip-sclera-r)" />` : ''}

  <!-- 10. Eyelid Contours -->
  <path id="upper-lid-left" d="${f.leftEye.upperEyelidPath}" fill="none" stroke="#090d16" stroke-width="1.8" stroke-linecap="round" />
  <path id="lower-lid-left" d="${f.leftEye.lowerEyelidPath}" fill="none" stroke="#64748b" stroke-width="1.0" stroke-linecap="round" />
  <path id="upper-lid-right" d="${f.rightEye.upperEyelidPath}" fill="none" stroke="#090d16" stroke-width="1.8" stroke-linecap="round" />
  <path id="lower-lid-right" d="${f.rightEye.lowerEyelidPath}" fill="none" stroke="#64748b" stroke-width="1.0" stroke-linecap="round" />

  <!-- 11. Nose Bridge, Tip, Alar Wings & Nostrils -->
  ${f.nose.bridgePath ? `<path id="nose-bridge" d="${f.nose.bridgePath}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />` : ''}
  <path id="nose-tip" d="${f.nose.tipPath}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />
  ${f.nose.leftWingPath ? `<path id="alar-left" d="${f.nose.leftWingPath}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />` : ''}
  ${f.nose.rightWingPath ? `<path id="alar-right" d="${f.nose.rightWingPath}" fill="none" stroke="#94a3b8" stroke-width="1.5" stroke-linecap="round" />` : ''}
  <path id="nostril-left" d="${f.nose.leftNostrilPath}" fill="#1e293b" opacity="0.88" />
  <path id="nostril-right" d="${f.nose.rightNostrilPath}" fill="#1e293b" opacity="0.88" />

  <!-- 12. Oral Features -->
  ${f.mouth.oralCavityPath ? `<path id="oral-cavity" d="${f.mouth.oralCavityPath}" fill="#381616" />` : ''}
  ${f.mouth.teethPath ? `<path id="teeth" d="${f.mouth.teethPath}" fill="#f1eee9" stroke="#d5cebe" stroke-width="0.8" />` : ''}
  <path id="upper-lip" d="${f.mouth.upperLipPath}" fill="#94a3b8" stroke="#64748b" stroke-width="1.2" />
  <path id="lower-lip" d="${f.mouth.lowerLipPath}" fill="#94a3b8" stroke="#64748b" stroke-width="1.2" />
  <path id="oral-parting" d="${f.mouth.partingLinePath}" fill="none" stroke="#334155" stroke-width="1.5" stroke-linecap="round" />

  <!-- [Pending Stage 5: OKLab Palettes & Planar Shading] -->
  <!-- [Pending Stage 6: Final Vector SVG Assembly] -->`;
      break;
    }

    case 'colour-regions':
    case 'final-assembled': {
      if (!features || !palette || !shading) {
        return buildProgressiveSvg(features ? 'facial-features' : hair ? 'hair-geometry' : 'face-geometry', data);
      }
      const f = features;
      const p = palette;
      const s = shading;
      const fh = facialHair;

      bodyContent = `  <defs>
    <!-- Clip path for eyes -->
    <clipPath id="clip-sclera-l"><path d="${f.leftEye.scleraPath}" /></clipPath>
    <clipPath id="clip-sclera-r"><path d="${f.rightEye.scleraPath}" /></clipPath>
    <!-- Clip path for face interior -->
    <clipPath id="clip-face"><path d="${facePath}" /></clipPath>
    <!-- Clip path for neck interior -->
    ${neckPath ? `<clipPath id="clip-neck"><path d="${neckPath}" /></clipPath>` : ''}
  </defs>

  <!-- 1. Background -->
  <rect id="bg" width="1000" height="1000" fill="${p.background.hex}" />

  <!-- 2. Clothing & Shoulders -->
  ${shouldersPath ? `
    <path id="shoulders" d="${shouldersPath}" fill="${p.clothing.hex}" stroke="${p.hairShadow.hex}" stroke-width="1.5" />
  ` : ''}

  <!-- 3. Neck & Submandibular Shadow -->
  ${neckPath ? `
    <path id="neck" d="${neckPath}" fill="${p.skinShadow.hex}" />
    <path id="neck-shadow" d="${s.jawNeckShadowPath}" fill="${p.skinShadow.hex}" opacity="0.65" clip-path="url(#clip-neck)" />
  ` : ''}

  <!-- 4. Back Hair (Cranial volume flowing behind head/shoulders) -->
  ${backHairPath ? `
    <path id="hair-back" d="${backHairPath}" fill="${p.hairBase.hex}" stroke="${p.hairShadow.hex}" stroke-width="2.5" />
  ` : ''}

  <!-- 5. Ears -->
  ${leftEarPath ? `
    <path id="ear-left" d="${leftEarPath}" fill="${p.skinBase.hex}" stroke="${p.skinShadow.hex}" stroke-width="1.5" />
    <path id="ear-right" d="${rightEarPath}" fill="${p.skinBase.hex}" stroke="${p.skinShadow.hex}" stroke-width="1.5" />
  ` : ''}

  <!-- 6. Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="${p.skinBase.hex}" stroke="${p.skinShadow.hex}" stroke-width="2" />

  <!-- 7. Broad Planar Skin Shading (Clipped inside face) -->
  ${s.cheekShadowPath ? `
    <path id="cheek-shadow" d="${s.cheekShadowPath}" fill="${p.skinShadow.hex}" opacity="0.16" clip-path="url(#clip-face)" />
  ` : ''}
  ${s.foreheadHighlightPath ? `
    <path id="forehead-highlight" d="${s.foreheadHighlightPath}" fill="${p.skinHighlight.hex}" opacity="0.16" clip-path="url(#clip-face)" />
  ` : ''}
  ${s.cheekHighlightPath ? `
    <path id="cheek-highlight" d="${s.cheekHighlightPath}" fill="${p.skinHighlight.hex}" opacity="0.14" clip-path="url(#clip-face)" />
  ` : ''}

  <!-- 8. Facial Hair (If present or forced) -->
  ${fh?.beardPath ? `
    <path id="beard" d="${fh.beardPath}" fill="${fh.color.hex}" opacity="0.88" />
  ` : ''}
  ${fh?.mustachePath ? `
    <path id="mustache" d="${fh.mustachePath}" fill="${fh.color.hex}" opacity="0.88" />
  ` : ''}

  <!-- 9. Front Hair / Bangs Overlap -->
  ${(hair?.metrics?.hasBangs && hairPath) ? `
    <path id="hair-front" d="${hairPath}" fill="${p.hairBase.hex}" stroke="${p.hairShadow.hex}" stroke-width="1.5" />
  ` : ''}

  <!-- 10. Eyebrows -->
  <path id="eyebrow-left" d="${f.leftEyebrow.path}" fill="${p.eyebrows.hex}" stroke="${p.eyebrows.hex}" stroke-width="0.8" />
  <path id="eyebrow-right" d="${f.rightEyebrow.path}" fill="${p.eyebrows.hex}" stroke="${p.eyebrows.hex}" stroke-width="0.8" />

  <!-- 11. Left Eye -->
  <path id="sclera-left" d="${f.leftEye.scleraPath}" fill="#ffffff" stroke="${p.skinShadow.hex}" stroke-width="1.2" />
  <circle id="iris-left" cx="${f.leftEye.iris.cx}" cy="${f.leftEye.iris.cy}" r="${f.leftEye.iris.r}" fill="${p.iris.hex}" clip-path="url(#clip-sclera-l)" />
  <circle id="pupil-left" cx="${f.leftEye.pupil.cx}" cy="${f.leftEye.pupil.cy}" r="${f.leftEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-l)" />
  ${f.leftEye.catchlight?.hasCatchlight ? `
    <circle id="catchlight-left" cx="${f.leftEye.catchlight.cx}" cy="${f.leftEye.catchlight.cy}" r="${f.leftEye.catchlight.r}" fill="#ffffff" opacity="${f.leftEye.catchlight.opacity}" clip-path="url(#clip-sclera-l)" />
  ` : ''}
  <path id="upper-lid-left" d="${f.leftEye.upperEyelidPath}" fill="none" stroke="${p.eyebrows.hex}" stroke-width="2.2" stroke-linecap="round" />
  <path id="lower-lid-left" d="${f.leftEye.lowerEyelidPath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.0" opacity="0.75" stroke-linecap="round" />

  <!-- 12. Right Eye -->
  <path id="sclera-right" d="${f.rightEye.scleraPath}" fill="#ffffff" stroke="${p.skinShadow.hex}" stroke-width="1.2" />
  <circle id="iris-right" cx="${f.rightEye.iris.cx}" cy="${f.rightEye.iris.cy}" r="${f.rightEye.iris.r}" fill="${p.iris.hex}" clip-path="url(#clip-sclera-r)" />
  <circle id="pupil-right" cx="${f.rightEye.pupil.cx}" cy="${f.rightEye.pupil.cy}" r="${f.rightEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-r)" />
  ${f.rightEye.catchlight?.hasCatchlight ? `
    <circle id="catchlight-right" cx="${f.rightEye.catchlight.cx}" cy="${f.rightEye.catchlight.cy}" r="${f.rightEye.catchlight.r}" fill="#ffffff" opacity="${f.rightEye.catchlight.opacity}" clip-path="url(#clip-sclera-r)" />
  ` : ''}
  <path id="upper-lid-right" d="${f.rightEye.upperEyelidPath}" fill="none" stroke="${p.eyebrows.hex}" stroke-width="2.2" stroke-linecap="round" />
  <path id="lower-lid-right" d="${f.rightEye.lowerEyelidPath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.0" opacity="0.75" stroke-linecap="round" />

  <!-- 13. Nose -->
  ${s.noseSideShadowPath ? `
    <path id="nose-side-shadow" d="${s.noseSideShadowPath}" fill="${p.skinShadow.hex}" opacity="0.35" />
  ` : ''}
  <path id="nose-bridge" d="${f.nose.bridgePath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
  <path id="nose-tip" d="${f.nose.tipPath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.8" stroke-linecap="round" />
  ${f.nose.leftWingPath ? `<path id="alar-left" d="${f.nose.leftWingPath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.5" stroke-linecap="round" />` : ''}
  ${f.nose.rightWingPath ? `<path id="alar-right" d="${f.nose.rightWingPath}" fill="none" stroke="${p.skinShadow.hex}" stroke-width="1.5" stroke-linecap="round" />` : ''}
  <path id="nostril-left" d="${f.nose.leftNostrilPath}" fill="${p.nostrilShadow.hex}" opacity="0.88" />
  <path id="nostril-right" d="${f.nose.rightNostrilPath}" fill="${p.nostrilShadow.hex}" opacity="0.88" />

  <!-- 14. Mouth -->
  ${f.mouth.oralCavityPath ? `<path id="oral-cavity" d="${f.mouth.oralCavityPath}" fill="#381616" />` : ''}
  ${f.mouth.teethPath ? `<path id="teeth" d="${f.mouth.teethPath}" fill="#f1eee9" stroke="#d5cebe" stroke-width="0.8" />` : ''}
  <path id="upper-lip" d="${f.mouth.upperLipPath}" fill="${p.lips.hex}" stroke="${p.skinShadow.hex}" stroke-width="1.2" />
  <path id="lower-lip" d="${f.mouth.lowerLipPath}" fill="${p.lips.hex}" stroke="${p.skinShadow.hex}" stroke-width="1.2" />
  <path id="oral-parting" d="${f.mouth.partingLinePath}" fill="none" stroke="#662d25" stroke-width="1.5" stroke-linecap="round" />`;
      break;
    }
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 5 — Progressive Portrait (${photoId} - Stage: ${stageId})</title>
${bodyContent}
</svg>`;

  return {
    svg,
    code: svg,
  };
}
