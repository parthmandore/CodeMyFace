/**
 * CodeMyFace Engine V2 — Phase 2: Prototype SVG Renderer
 *
 * Implements Part D, E, F:
 * - Generates clean flat-vector SVG portraits on a 1000x1000 canonical artboard
 * - Output 1: Face-Only geometry (face silhouette + neck + eyes + brows + nose + mouth)
 * - Output 2: Complete Face + Hair geometry (derived directly from image evidence)
 * - Output 3: Diagnostic Debug SVG (raw hair vs cleaned hair, raw face vs reconstructed face, landmarks)
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import {
  PrototypePortraitResult,
  FaceSilhouetteGeometry,
  HairSilhouetteGeometry,
  FeatureGeometryV2,
} from './phase2Types';
import { reconstructFaceGeometry } from './faceGeometry';
import { reconstructHairGeometry } from './hairGeometry';

function svgNum(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

/**
 * Converts a series of 2D points into an SVG polygon path 'd'
 */
function pointsToSvgPolygon(pts: Vec2[]): string {
  if (!pts || pts.length < 2) return '';
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${svgNum(p.x)} ${svgNum(p.y)}`).join(' ');
  return `${d} Z`;
}

/**
 * Converts a series of 2D points into a smooth Catmull-Rom/Bezier closed SVG path
 */
function pointsToSmoothClosedPath(pts: Vec2[], tension: number = 0.20): string {
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

/**
 * Builds SVG path data for facial features directly from canonical landmarks
 */
function buildFeatureGeometry(analysis: FacialAnalysisResultV2): FeatureGeometryV2 {
  const lm = analysis.landmarks!;

  // Eyebrows
  const leftEyebrow = pointsToSvgPolygon(lm.leftEyebrow.contour.points);
  const rightEyebrow = pointsToSvgPolygon(lm.rightEyebrow.contour.points);

  // Eyes (sclera)
  const leftEye = pointsToSvgPolygon(lm.leftEye.contour.points);
  const rightEye = pointsToSvgPolygon(lm.rightEye.contour.points);

  // Pupils & Irises
  const leftIris = { cx: lm.leftEye.pupil.x, cy: lm.leftEye.pupil.y, r: lm.leftEye.irisRadius };
  const rightIris = { cx: lm.rightEye.pupil.x, cy: lm.rightEye.pupil.y, r: lm.rightEye.irisRadius };
  const leftPupil = { cx: lm.leftEye.pupil.x, cy: lm.leftEye.pupil.y, r: lm.leftEye.irisRadius * 0.45 };
  const rightPupil = { cx: lm.rightEye.pupil.x, cy: lm.rightEye.pupil.y, r: lm.rightEye.irisRadius * 0.45 };

  // Nose (bridge line, alar wings, nostrils)
  let nosePath = `M ${svgNum(lm.nose.nasion.x)} ${svgNum(lm.nose.nasion.y)}`;
  lm.nose.bridge.points.forEach(p => {
    nosePath += ` L ${svgNum(p.x)} ${svgNum(p.y)}`;
  });
  if (lm.nose.leftWing.points.length > 0) {
    nosePath += ` M ${svgNum(lm.nose.leftWing.points[0].x)} ${svgNum(lm.nose.leftWing.points[0].y)}`;
    lm.nose.leftWing.points.forEach(p => { nosePath += ` L ${svgNum(p.x)} ${svgNum(p.y)}`; });
  }
  if (lm.nose.rightWing.points.length > 0) {
    nosePath += ` M ${svgNum(lm.nose.rightWing.points[0].x)} ${svgNum(lm.nose.rightWing.points[0].y)}`;
    lm.nose.rightWing.points.forEach(p => { nosePath += ` L ${svgNum(p.x)} ${svgNum(p.y)}`; });
  }

  // Mouth (upper vermilion + lower vermilion)
  const upperLip = pointsToSvgPolygon(lm.mouth.upperLipOuter.points);
  const lowerLip = pointsToSvgPolygon(lm.mouth.lowerLipOuter.points);
  const mouthPath = `${upperLip} ${lowerLip}`;

  // Ears
  const leftEar = pointsToSvgPolygon(lm.ears.estimatedLeftEar);
  const rightEar = pointsToSvgPolygon(lm.ears.estimatedRightEar);

  return {
    leftEye,
    rightEye,
    leftIris,
    rightIris,
    leftPupil,
    rightPupil,
    leftEyebrow,
    rightEyebrow,
    nose: nosePath,
    mouth: mouthPath,
    ears: { left: leftEar, right: rightEar },
  };
}

/**
 * Builds the complete Phase 2 Prototype Portrait Result
 */
export function buildPrototypePortrait(
  photoId: string,
  analysis: FacialAnalysisResultV2
): PrototypePortraitResult {
  const face: FaceSilhouetteGeometry = reconstructFaceGeometry(analysis);
  const hair: HairSilhouetteGeometry = reconstructHairGeometry(analysis);
  const features: FeatureGeometryV2 = buildFeatureGeometry(analysis);

  const facePath = pointsToSmoothClosedPath(face.contourPoints, 0.16);
  const hairPath = hair.isReliable ? pointsToSmoothClosedPath(hair.cleanedContour, 0.18) : '';
  const neckPath = face.neckPoints ? pointsToSvgPolygon(face.neckPoints) : '';
  const shouldersPath = face.shoulderPoints ? pointsToSvgPolygon(face.shoulderPoints) : '';

  // 1. Output 1: Face-Only SVG
  const faceOnlySvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Prototype — Face Only (${photoId})</title>
  <defs>
    <clipPath id="clip-left-sclera"><path d="${features.leftEye}" /></clipPath>
    <clipPath id="clip-right-sclera"><path d="${features.rightEye}" /></clipPath>
  </defs>
  <!-- Background -->
  <rect width="1000" height="1000" fill="#f8fafc" />
  <!-- Shoulders & Neck -->
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5" />` : ''}
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#d4a38d" stroke="#b28470" stroke-width="1.5" />` : ''}
  <!-- Ears -->
  ${features.ears ? `
    <path id="ear-left" d="${features.ears.left}" fill="#e2b69e" stroke="#c29b87" stroke-width="1.5" />
    <path id="ear-right" d="${features.ears.right}" fill="#e2b69e" stroke="#c29b87" stroke-width="1.5" />
  ` : ''}
  <!-- Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="#e2b69e" stroke="#c29b87" stroke-width="2" />
  <!-- Eyebrows -->
  <path id="eyebrow-left" d="${features.leftEyebrow}" fill="#3b2f2f" />
  <path id="eyebrow-right" d="${features.rightEyebrow}" fill="#3b2f2f" />
  <!-- Eyes -->
  <path id="eye-left" d="${features.leftEye}" fill="#ffffff" stroke="#715446" stroke-width="1.5" />
  <path id="eye-right" d="${features.rightEye}" fill="#ffffff" stroke="#715446" stroke-width="1.5" />
  <!-- Irises & Pupils -->
  <circle cx="${features.leftIris.cx}" cy="${features.leftIris.cy}" r="${features.leftIris.r}" fill="#4a3728" clip-path="url(#clip-left-sclera)" />
  <circle cx="${features.rightIris.cx}" cy="${features.rightIris.cy}" r="${features.rightIris.r}" fill="#4a3728" clip-path="url(#clip-right-sclera)" />
  <circle cx="${features.leftPupil.cx}" cy="${features.leftPupil.cy}" r="${features.leftPupil.r}" fill="#0f172a" clip-path="url(#clip-left-sclera)" />
  <circle cx="${features.rightPupil.cx}" cy="${features.rightPupil.cy}" r="${features.rightPupil.r}" fill="#0f172a" clip-path="url(#clip-right-sclera)" />
  <circle cx="${features.leftPupil.cx + 2}" cy="${features.leftPupil.cy - 2}" r="${features.leftPupil.r * 0.4}" fill="#ffffff" opacity="0.9" clip-path="url(#clip-left-sclera)" />
  <circle cx="${features.rightPupil.cx + 2}" cy="${features.rightPupil.cy - 2}" r="${features.rightPupil.r * 0.4}" fill="#ffffff" opacity="0.9" clip-path="url(#clip-right-sclera)" />
  <!-- Nose -->
  <path id="nose" d="${features.nose}" fill="none" stroke="#aa6545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  <!-- Mouth -->
  <path id="mouth" d="${features.mouth}" fill="#c4786f" stroke="#8b4d45" stroke-width="1.5" />
</svg>`;

  // 2. Output 2: Complete Face + Hair SVG
  const completeSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Prototype — Complete (${photoId})</title>
  <defs>
    <clipPath id="clip-left-sclera-c"><path d="${features.leftEye}" /></clipPath>
    <clipPath id="clip-right-sclera-c"><path d="${features.rightEye}" /></clipPath>
  </defs>
  <!-- Background -->
  <rect width="1000" height="1000" fill="#f8fafc" />
  <!-- Shoulders & Neck -->
  ${shouldersPath ? `<path id="shoulders" d="${shouldersPath}" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1.5" />` : ''}
  ${neckPath ? `<path id="neck" d="${neckPath}" fill="#d4a38d" stroke="#b28470" stroke-width="1.5" />` : ''}
  <!-- Ears -->
  ${features.ears ? `
    <path id="ear-left" d="${features.ears.left}" fill="#e2b69e" stroke="#c29b87" stroke-width="1.5" />
    <path id="ear-right" d="${features.ears.right}" fill="#e2b69e" stroke="#c29b87" stroke-width="1.5" />
  ` : ''}
  <!-- Face Silhouette -->
  <path id="face-silhouette" d="${facePath}" fill="#e2b69e" stroke="#c29b87" stroke-width="2" />
  <!-- Eyebrows -->
  <path id="eyebrow-left" d="${features.leftEyebrow}" fill="#3b2f2f" />
  <path id="eyebrow-right" d="${features.rightEyebrow}" fill="#3b2f2f" />
  <!-- Eyes -->
  <path id="eye-left" d="${features.leftEye}" fill="#ffffff" stroke="#715446" stroke-width="1.5" />
  <path id="eye-right" d="${features.rightEye}" fill="#ffffff" stroke="#715446" stroke-width="1.5" />
  <!-- Irises & Pupils -->
  <circle cx="${features.leftIris.cx}" cy="${features.leftIris.cy}" r="${features.leftIris.r}" fill="#4a3728" clip-path="url(#clip-left-sclera-c)" />
  <circle cx="${features.rightIris.cx}" cy="${features.rightIris.cy}" r="${features.rightIris.r}" fill="#4a3728" clip-path="url(#clip-right-sclera-c)" />
  <circle cx="${features.leftPupil.cx}" cy="${features.leftPupil.cy}" r="${features.leftPupil.r}" fill="#0f172a" clip-path="url(#clip-left-sclera-c)" />
  <circle cx="${features.rightPupil.cx}" cy="${features.rightPupil.cy}" r="${features.rightPupil.r}" fill="#0f172a" clip-path="url(#clip-right-sclera-c)" />
  <circle cx="${features.leftPupil.cx + 2}" cy="${features.leftPupil.cy - 2}" r="${features.leftPupil.r * 0.4}" fill="#ffffff" opacity="0.9" clip-path="url(#clip-left-sclera-c)" />
  <circle cx="${features.rightPupil.cx + 2}" cy="${features.rightPupil.cy - 2}" r="${features.rightPupil.r * 0.4}" fill="#ffffff" opacity="0.9" clip-path="url(#clip-right-sclera-c)" />
  <!-- Nose -->
  <path id="nose" d="${features.nose}" fill="none" stroke="#aa6545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
  <!-- Mouth -->
  <path id="mouth" d="${features.mouth}" fill="#c4786f" stroke="#8b4d45" stroke-width="1.5" />
  <!-- Hair Silhouette (Image Evidence Derived) -->
  ${hair.isReliable ? `<path id="hair-silhouette" d="${hairPath}" fill="#241e24" stroke="#120e12" stroke-width="2.5" />` : `
    <text x="50" y="80" font-family="monospace" font-size="14" fill="#ef4444" font-weight="bold">[DIAGNOSTIC: ${hair.diagnosticStatus}]</text>
  `}
</svg>`;

  // 3. Output 3: Diagnostic Debug SVG
  const rawHairPath = hair.rawContour.length > 2 ? pointsToSvgPolygon(hair.rawContour) : '';
  const rawFacePath = pointsToSvgPolygon(analysis.landmarks!.faceOutline.points);
  const bounds = analysis.transform!.canonicalFaceBounds;

  const debugSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%">
  <title>CodeMyFace Engine V2 Prototype — Debug Diagnostics (${photoId})</title>
  <!-- Background -->
  <rect width="1000" height="1000" fill="#0b0f19" />
  
  <!-- Target Face Width Box (300 units) -->
  <rect x="${bounds.minX}" y="${bounds.minY}" width="${bounds.width}" height="${bounds.height}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-dasharray="6 4" />
  <text x="${bounds.minX}" y="${bounds.minY - 10}" fill="#38bdf8" font-family="monospace" font-size="12">Target Face Bounds: ${bounds.width}u × ${Math.round(bounds.height)}u</text>

  <!-- Raw MediaPipe Face Outline (Cyan dashed) -->
  <path d="${rawFacePath}" fill="none" stroke="#06b6d4" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.7" />

  <!-- Reconstructed Face Contour (Solid Green) -->
  <path d="${facePath}" fill="rgba(16, 185, 129, 0.15)" stroke="#10b981" stroke-width="2.5" />

  <!-- Raw Hair Contour (Red dotted) -->
  ${rawHairPath ? `<path d="${rawHairPath}" fill="none" stroke="#ef4444" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.6" />` : ''}

  <!-- Cleaned Hair Contour (Solid Purple) -->
  ${hairPath ? `<path d="${hairPath}" fill="rgba(168, 85, 247, 0.20)" stroke="#a855f7" stroke-width="2.5" />` : ''}

  <!-- Facial Landmarks Dots (Yellow) -->
  ${analysis.landmarks!.allPoints.map(p => `<circle cx="${svgNum(p.x)}" cy="${svgNum(p.y)}" r="1.8" fill="#eab308" opacity="0.8" />`).join('\n  ')}

  <!-- Legend Bar -->
  <rect x="20" y="940" width="960" height="40" rx="6" fill="#111827" stroke="#1f2937" />
  <circle cx="40" cy="960" r="5" fill="#10b981" /><text x="52" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Reconstructed Face</text>
  <circle cx="210" cy="960" r="5" fill="#a855f7" /><text x="222" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Cleaned Hair (${hair.metrics.cleanedPointCount} pts)</text>
  <circle cx="410" cy="960" r="5" fill="#ef4444" /><text x="422" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Raw Hair (${hair.metrics.rawPointCount} pts)</text>
  <circle cx="590" cy="960" r="5" fill="#eab308" /><text x="602" y="964" fill="#9ca3af" font-family="monospace" font-size="11">Landmarks (478)</text>
  <text x="750" y="964" fill="#38bdf8" font-family="monospace" font-size="11">Status: ${hair.diagnosticStatus}</text>
</svg>`;

  return {
    photoId,
    analysis,
    face,
    hair,
    features,
    faceOnlySvg,
    completeSvg,
    debugSvg,
  };
}
