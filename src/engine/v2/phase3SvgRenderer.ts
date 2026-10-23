/**
 * CodeMyFace Engine V2 — Phase 3: SVG Feature Renderer
 *
 * Implements:
 * - PART D: Output 1 (Face-Only SVG), Output 2 (Complete Face+Hair SVG) with Phase 3 feature geometry
 * - PART F: Output 4 (Feature Debug Overlay SVG) displaying landmarks, canthi, Cupid's bow, and contours
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry, HairSilhouetteGeometry } from './phase2Types';
import { FacialFeaturesGeometryV2, Phase3PortraitResult } from './phase3Types';
import { reconstructFaceGeometry } from './faceGeometry';
import { reconstructHairGeometry } from './hairGeometry';
import { extractImageEvidence } from './imageEvidenceSampler';
import { reconstructFeatureGeometry } from './featureGeometry';

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

export function buildPhase3Portrait(
  photoId: string,
  analysis: FacialAnalysisResultV2,
  normCanvas: HTMLCanvasElement | null = null
): Phase3PortraitResult {
  const lm = analysis.landmarks!;
  const face: FaceSilhouetteGeometry = reconstructFaceGeometry(analysis);
  const hair: HairSilhouetteGeometry = reconstructHairGeometry(analysis);

  // Extract evidence from source canonical canvas
  const mouthGap = Math.max(0, lm.mouth.lowerLipInner.points[5]?.y - lm.mouth.upperLipInner.points[5]?.y || 0);
  const evidence = extractImageEvidence(
    normCanvas,
    lm.leftEye.pupil,
    lm.leftEye.irisRadius,
    lm.rightEye.pupil,
    lm.rightEye.irisRadius,
    lm.mouth.center,
    lm.mouth.isSmileOpen,
    mouthGap,
    lm.leftEyebrow.contour.points,
    lm.rightEyebrow.contour.points,
    [...lm.mouth.upperLipOuter.points, ...lm.mouth.lowerLipOuter.points],
    [...lm.nose.leftWing.points, ...lm.nose.rightWing.points]
  );

  // Reconstruct anatomical features
  const feat: FacialFeaturesGeometryV2 = reconstructFeatureGeometry(analysis, evidence);

  const facePath = pointsToSmoothClosedPath(face.contourPoints, 0.16);
  const hairPath = hair.isReliable ? pointsToSmoothClosedPath(hair.cleanedContour, 0.18) : '';
  const neckPath = face.neckPoints ? pointsToSvgPolygon(face.neckPoints) : '';
  const shouldersPath = face.shoulderPoints ? pointsToSvgPolygon(face.shoulderPoints) : '';

  // Feature SVG snippet shared between Output 1 and Output 2
  const featuresSvgContent = `
    <!-- Eyebrows -->
    <path id="eyebrow-left" d="${feat.leftEyebrow.path}" fill="${feat.leftEyebrow.fillColor}" stroke="${feat.leftEyebrow.fillColor}" stroke-width="0.8" />
    <path id="eyebrow-right" d="${feat.rightEyebrow.path}" fill="${feat.rightEyebrow.fillColor}" stroke="${feat.rightEyebrow.fillColor}" stroke-width="0.8" />

    <!-- Left Eye -->
    <path id="sclera-left" d="${feat.leftEye.scleraPath}" fill="#ffffff" stroke="#715446" stroke-width="1.2" />
    <circle cx="${feat.leftEye.iris.cx}" cy="${feat.leftEye.iris.cy}" r="${feat.leftEye.iris.r}" fill="#3f2e22" clip-path="url(#clip-sclera-l)" />
    <circle cx="${feat.leftEye.pupil.cx}" cy="${feat.leftEye.pupil.cy}" r="${feat.leftEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-l)" />
    ${feat.leftEye.catchlight?.hasCatchlight ? `
      <circle cx="${feat.leftEye.catchlight.cx}" cy="${feat.leftEye.catchlight.cy}" r="${feat.leftEye.catchlight.r}" fill="#ffffff" opacity="${feat.leftEye.catchlight.opacity}" clip-path="url(#clip-sclera-l)" />
    ` : ''}
    <path id="upper-lid-left" d="${feat.leftEye.upperEyelidPath}" fill="none" stroke="#3d2720" stroke-width="2.2" stroke-linecap="round" />
    <path id="lower-lid-left" d="${feat.leftEye.lowerEyelidPath}" fill="none" stroke="#7d594b" stroke-width="1.0" opacity="0.7" stroke-linecap="round" />

    <!-- Right Eye -->
    <path id="sclera-right" d="${feat.rightEye.scleraPath}" fill="#ffffff" stroke="#715446" stroke-width="1.2" />
    <circle cx="${feat.rightEye.iris.cx}" cy="${feat.rightEye.iris.cy}" r="${feat.rightEye.iris.r}" fill="#3f2e22" clip-path="url(#clip-sclera-r)" />
    <circle cx="${feat.rightEye.pupil.cx}" cy="${feat.rightEye.pupil.cy}" r="${feat.rightEye.pupil.r}" fill="#0f172a" clip-path="url(#clip-sclera-r)" />
    ${feat.rightEye.catchlight?.hasCatchlight ? `
      <circle cx="${feat.rightEye.catchlight.cx}" cy="${feat.rightEye.catchlight.cy}" r="${feat.rightEye.catchlight.r}" fill="#ffffff" opacity="${feat.rightEye.catchlight.opacity}" clip-path="url(#clip-sclera-r)" />
    ` : ''}
    <path id="upper-lid-right" d="${feat.rightEye.upperEyelidPath}" fill="none" stroke="#3d2720" stroke-width="2.2" stroke-linecap="round" />
    <path id="lower-lid-right" d="${feat.rightEye.lowerEyelidPath}" fill="none" stroke="#7d594b" stroke-width="1.0" opacity="0.7" stroke-linecap="round" />

    <!-- Nose -->
    <path id="nose-bridge" d="${feat.nose.bridgePath}" fill="none" stroke="#aa6545" stroke-width="1.8" stroke-linecap="round" opacity="0.85" />
    <path id="nose-tip" d="${feat.nose.tipPath}" fill="none" stroke="#965639" stroke-width="1.8" stroke-linecap="round" />
    ${feat.nose.leftWingPath ? `<path id="alar-left" d="${feat.nose.leftWingPath}" fill="none" stroke="#aa6545" stroke-width="1.5" stroke-linecap="round" />` : ''}
    ${feat.nose.rightWingPath ? `<path id="alar-right" d="${feat.nose.rightWingPath}" fill="none" stroke="#aa6545" stroke-width="1.5" stroke-linecap="round" />` : ''}
    <path id="nostril-left" d="${feat.nose.leftNostrilPath}" fill="${feat.nose.nostrilColor}" opacity="0.85" />
    <path id="nostril-right" d="${feat.nose.rightNostrilPath}" fill="${feat.nose.nostrilColor}" opacity="0.85" />

    <!-- Mouth -->
    ${feat.mouth.oralCavityPath ? `<path id="oral-cavity" d="${feat.mouth.oralCavityPath}" fill="#381616" />` : ''}
    ${feat.mouth.teethPath ? `<path id="teeth" d="${feat.mouth.teethPath}" fill="#f1eee9" stroke="#d5cebe" stroke-width="0.8" />` : ''}
    <path id="upper-lip" d="${feat.mouth.upperLipPath}" fill="${feat.mouth.vermilionColor}" stroke="#8b4d45" stroke-width="1.2" />
    <path id="lower-lip" d="${feat.mouth.lowerLipPath}" fill="${feat.mouth.vermilionColor}" stroke="#8b4d45" stroke-width="1.2" />
    <path id="oral-parting" d="${feat.mouth.partingLinePath}" fill="none" stroke="#662d25" stroke-width="1.4" stroke-linecap="round" />
  `;

  // 1. Output 1: Face-Only SVG
  const faceOnlySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 3 — Face Only (${photoId})</title>
  <defs>
    <clipPath id="clip-sclera-l"><path d="${feat.leftEye.scleraPath}" /></clipPath>
    <clipPath id="clip-sclera-r"><path d="${feat.rightEye.scleraPath}" /></clipPath>
  </defs>
  <rect width="1000" height="1000" fill="#f8fafc" />
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5" />` : ''}
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#d4a38d" stroke="#b28470" stroke-width="1.5" />` : ''}
  <path id="face-silhouette" d="${facePath}" fill="#e2b69e" stroke="#c29b87" stroke-width="2" />
  ${featuresSvgContent}
</svg>`;

  // 2. Output 2: Complete Face + Hair SVG
  const completeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 3 — Complete Portrait (${photoId})</title>
  <defs>
    <clipPath id="clip-sclera-l"><path d="${feat.leftEye.scleraPath}" /></clipPath>
    <clipPath id="clip-sclera-r"><path d="${feat.rightEye.scleraPath}" /></clipPath>
  </defs>
  <rect width="1000" height="1000" fill="#f8fafc" />
  ${hair.isReliable ? `<path id="hair-silhouette-back" d="${hairPath}" fill="#241e24" stroke="#120e12" stroke-width="2.5" />` : ''}
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5" />` : ''}
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#d4a38d" stroke="#b28470" stroke-width="1.5" />` : ''}
  <path id="face-silhouette" d="${facePath}" fill="#e2b69e" stroke="#c29b87" stroke-width="2" />
  ${hair.isReliable ? `<path id="hair-silhouette-front" d="${hairPath}" fill="#241e24" stroke="#120e12" stroke-width="2.5" />` : `
    <text x="50" y="80" font-family="monospace" font-size="14" fill="#ef4444" font-weight="bold">[DIAGNOSTIC: ${hair.diagnosticStatus}]</text>
  `}
  ${featuresSvgContent}
</svg>`;

  // 3. Output 3: Diagnostic Debug SVG (Preserving Phase 2 debug format)
  const rawHairPath = hair.rawContour.length > 2 ? pointsToSvgPolygon(hair.rawContour) : '';
  const rawFacePath = pointsToSvgPolygon(lm.faceOutline.points);
  const bounds = analysis.transform!.canonicalFaceBounds;

  const debugSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 2/3 Debug Diagnostics (${photoId})</title>
  <rect width="1000" height="1000" fill="#0b0f19" />
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 4" />
  <text x="${bounds.minX}" y="${bounds.minY - 10}" fill="#38bdf8" font-family="monospace" font-size="12">Target Face Bounds: ${bounds.width}u × ${Math.round(bounds.height)}u</text>
  <path d="${rawFacePath}" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7" />
  <path d="${facePath}" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="2.5" />
  ${rawHairPath ? `<path d="${rawHairPath}" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6" />` : ''}
  ${hairPath ? `<path d="${hairPath}" fill="rgba(168, 85, 247, 0.20)" stroke="#a855f7" stroke-width="2.5" />` : ''}
  ${lm.allPoints.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#eab308" opacity="0.8" />`).join('\n  ')}
  <rect x="20" y="940" width="960" height="40" rx="6" fill="#111827" stroke="#1f2937" />
  <circle cx="40" cy="960" r="5" fill="#10b981" /><text x="52" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Reconstructed Face</text>
  <circle cx="210" cy="960" r="5" fill="#a855f7" /><text x="222" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Cleaned Hair (${hair.metrics.cleanedPointCount} pts)</text>
  <circle cx="410" cy="960" r="5" fill="#ef4444" /><text x="422" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Raw Hair (${hair.metrics.rawPointCount} pts)</text>
  <circle cx="590" cy="960" r="5" fill="#eab308" /><text x="602" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Landmarks (478)</text>
  <text x="750" y="964" fill="#38bdf8" font-family="monospace" font-size="11">Status: ${hair.diagnosticStatus}</text>
</svg>`;

  // 4. Output 4: Phase 3 Feature Debug Overlay SVG
  const featureDebugSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Phase 3 Feature Debug Overlay (${photoId})</title>
  <rect width="1000" height="1000" fill="#090d16" />

  <!-- Face Silhouette Contour (Subtle Green) -->
  <path d="${facePath}" fill="rgba(16, 185, 129, 0.08)" stroke="#10b981" stroke-width="2" stroke-dasharray="4 3" />

  <!-- Target Face Width Box (Blue dashed) -->
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#38bdf8" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.6" />

  <!-- Eyebrows Region: MediaPipe Raw Points (Emerald) + Reconstructed Paths -->
  ${lm.leftEyebrow.contour.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="2.2" fill="#34d399" />`).join('')}
  ${lm.rightEyebrow.contour.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="2.2" fill="#34d399" />`).join('')}
  <path d="${feat.leftEyebrow.path}" fill="none" stroke="#10b981" stroke-width="2.5" />
  <path d="${feat.rightEyebrow.path}" fill="none" stroke="#10b981" stroke-width="2.5" />
  <path d="${feat.leftEyebrow.spinePath}" fill="none" stroke="#a7f3d0" stroke-width="1.5" stroke-dasharray="3 2" />
  <path d="${feat.rightEyebrow.spinePath}" fill="none" stroke="#a7f3d0" stroke-width="1.5" stroke-dasharray="3 2" />

  <!-- Eyes Region: Raw Contours + Reconstructed Sclera/Lids + Pupil/Catchlight -->
  ${lm.leftEye.contour.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#38bdf8" />`).join('')}
  ${lm.rightEye.contour.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#38bdf8" />`).join('')}
  <path d="${feat.leftEye.scleraPath}" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="2" />
  <path d="${feat.rightEye.scleraPath}" fill="rgba(56, 189, 248, 0.12)" stroke="#38bdf8" stroke-width="2" />
  <circle cx="${feat.leftEye.iris.cx}" cy="${feat.leftEye.iris.cy}" r="${feat.leftEye.iris.r}" fill="none" stroke="#0284c7" stroke-width="1.5" />
  <circle cx="${feat.rightEye.iris.cx}" cy="${feat.rightEye.iris.cy}" r="${feat.rightEye.iris.r}" fill="none" stroke="#0284c7" stroke-width="1.5" />
  <circle cx="${feat.leftEye.pupil.cx}" cy="${feat.leftEye.pupil.cy}" r="${feat.leftEye.pupil.r}" fill="#0284c7" />
  <circle cx="${feat.rightEye.pupil.cx}" cy="${feat.rightEye.pupil.cy}" r="${feat.rightEye.pupil.r}" fill="#0284c7" />
  ${feat.leftEye.catchlight?.hasCatchlight ? `
    <circle cx="${feat.leftEye.catchlight.cx}" cy="${feat.leftEye.catchlight.cy}" r="3" fill="#ffffff" stroke="#38bdf8" stroke-width="1" />
  ` : ''}
  ${feat.rightEye.catchlight?.hasCatchlight ? `
    <circle cx="${feat.rightEye.catchlight.cx}" cy="${feat.rightEye.catchlight.cy}" r="3" fill="#ffffff" stroke="#38bdf8" stroke-width="1" />
  ` : ''}

  <!-- Canthi Indicators -->
  <circle cx="${feat.leftEye.innerCanthus.x}" cy="${feat.leftEye.innerCanthus.y}" r="3" fill="#f43f5e" />
  <circle cx="${feat.leftEye.outerCanthus.x}" cy="${feat.leftEye.outerCanthus.y}" r="3" fill="#f43f5e" />
  <circle cx="${feat.rightEye.innerCanthus.x}" cy="${feat.rightEye.innerCanthus.y}" r="3" fill="#f43f5e" />
  <circle cx="${feat.rightEye.outerCanthus.x}" cy="${feat.rightEye.outerCanthus.y}" r="3" fill="#f43f5e" />

  <!-- Nose Region: Bridge, Alar Wings, Nostrils -->
  ${lm.nose.bridge.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="2" fill="#fbbf24" />`).join('')}
  <circle cx="${lm.nose.tip.x}" cy="${lm.nose.tip.y}" r="3.5" fill="#f59e0b" />
  <path d="${feat.nose.bridgePath}" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" />
  <path d="${feat.nose.tipPath}" fill="none" stroke="#f59e0b" stroke-width="2.2" />
  <path d="${feat.nose.leftWingPath}" fill="none" stroke="#fbbf24" stroke-width="1.8" />
  <path d="${feat.nose.rightWingPath}" fill="none" stroke="#fbbf24" stroke-width="1.8" />
  <path d="${feat.nose.leftNostrilPath}" fill="#ea580c" stroke="#c2410c" stroke-width="1" />
  <path d="${feat.nose.rightNostrilPath}" fill="#ea580c" stroke="#c2410c" stroke-width="1" />

  <!-- Mouth Region: Cupid's bow, Vermilion, Parting line, Teeth -->
  ${lm.mouth.upperLipOuter.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#f472b6" />`).join('')}
  ${lm.mouth.lowerLipOuter.points.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#f472b6" />`).join('')}
  <path d="${feat.mouth.upperLipPath}" fill="rgba(244, 63, 94, 0.15)" stroke="#f43f5e" stroke-width="2" />
  <path d="${feat.mouth.lowerLipPath}" fill="rgba(244, 63, 94, 0.15)" stroke="#f43f5e" stroke-width="2" />
  <path d="${feat.mouth.partingLinePath}" fill="none" stroke="#fb7185" stroke-width="2" stroke-linecap="round" />
  ${feat.mouth.teethPath ? `<path d="${feat.mouth.teethPath}" fill="none" stroke="#ffffff" stroke-width="2" />` : ''}

  <!-- Telemetry Bar -->
  <rect x="20" y="930" width="960" height="50" rx="8" fill="#111827" stroke="#1f2937" />
  <text x="36" y="952" fill="#38bdf8" font-family="monospace" font-size="12">Eyes: ${feat.leftEye.metrics.fissureWidth}u / ${feat.rightEye.metrics.fissureWidth}u (Spacing: ${feat.proportions.interpupillaryDistance}u) | Catchlight: L=${feat.leftEye.catchlight?.hasCatchlight ? 'YES' : 'NO'}, R=${feat.rightEye.catchlight?.hasCatchlight ? 'YES' : 'NO'}</text>
  <text x="36" y="970" fill="#a7f3d0" font-family="monospace" font-size="11">Brows: T=${feat.leftEyebrow.metrics.thickness}u / ${feat.rightEyebrow.metrics.thickness}u | Nose: Alar=${feat.nose.metrics.alarWidth}u | Mouth: ${feat.mouth.metrics.mouthWidth}u (Teeth: ${feat.mouth.metrics.hasTeeth ? 'YES' : 'NO'}, Open: ${feat.mouth.metrics.isSmileOpen ? 'YES' : 'NO'})</text>
</svg>`;

  return {
    photoId,
    analysis,
    face,
    hair,
    features: feat,
    faceOnlySvg,
    completeSvg,
    debugSvg,
    featureDebugSvg,
  };
}
