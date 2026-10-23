/**
 * CodeMyFace Engine V2 — Phase 4: Broad Planar Skin Shading Generator
 *
 * Implements Part B:
 * - Generates broad, intentional anatomical shadow planes derived from image evidence
 * - Avoids muddy micro-patches, decorative cheek stripes, and disconnected highlights
 * - Detects directional lighting angle (left vs right vs frontal)
 * - Constructs:
 *   1. Submandibular jaw-to-neck shadow (casts onto neck below jawline)
 *   2. Lateral cheek plane shadow (on the shadow side of face)
 *   3. Lateral nasal sidewall shadow
 *   4. Broad forehead and cheekbone planar highlights
 */

import { Color, Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry } from './phase2Types';
import { LightingDirection, SkinShadingPlanes } from './phase4Types';
import { rgbToOklab } from './oklab';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getPixel(imgData: ImageData, x: number, y: number): Color {
  const ix = clamp(Math.round(x), 0, imgData.width - 1);
  const iy = clamp(Math.round(y), 0, imgData.height - 1);
  const idx = (iy * imgData.width + ix) * 4;
  return {
    r: imgData.data[idx],
    g: imgData.data[idx + 1],
    b: imgData.data[idx + 2],
  };
}

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

export function detectLightingDirection(
  normCanvas: HTMLCanvasElement | null,
  leftCheek: Vec2,
  rightCheek: Vec2
): LightingDirection {
  if (!normCanvas) return 'frontal';

  try {
    const ctx = normCanvas.getContext('2d');
    if (!ctx) return 'frontal';
    const imgData = ctx.getImageData(0, 0, normCanvas.width, normCanvas.height);

    let lumLeft = 0;
    let lumRight = 0;
    let count = 0;

    for (let dy = -15; dy <= 15; dy += 5) {
      for (let dx = -15; dx <= 15; dx += 5) {
        lumLeft += rgbToOklab(getPixel(imgData, leftCheek.x + dx, leftCheek.y + dy)).L;
        lumRight += rgbToOklab(getPixel(imgData, rightCheek.x + dx, rightCheek.y + dy)).L;
        count++;
      }
    }

    const meanL = count > 0 ? lumLeft / count : 0.5;
    const meanR = count > 0 ? lumRight / count : 0.5;
    const delta = meanL - meanR;

    if (delta > 0.04) return 'left';
    if (delta < -0.04) return 'right';
    return 'frontal';
  } catch (_) {
    return 'frontal';
  }
}

export function generateSkinShadingPlanes(
  analysis: FacialAnalysisResultV2,
  _face: FaceSilhouetteGeometry,
  lighting: LightingDirection
): SkinShadingPlanes {
  const lm = analysis.landmarks!;

  // 1. SUBMANDIBULAR JAW-TO-NECK SHADOW
  // Follows the mandibular line from left jaw corner, under chin tip, to right jaw corner,
  // casting down onto the upper third of the neck.
  const chinApex = lm.chin.tip;
  const leftMandible = lm.chin.leftMandibularCorner;
  const rightMandible = lm.chin.rightMandibularCorner;

  const jawNeckShadowPts: Vec2[] = [
    { x: leftMandible.x - 5, y: leftMandible.y },
    { x: (leftMandible.x + chinApex.x) / 2, y: (leftMandible.y + chinApex.y) / 2 },
    { x: chinApex.x, y: chinApex.y },
    { x: (rightMandible.x + chinApex.x) / 2, y: (rightMandible.y + chinApex.y) / 2 },
    { x: rightMandible.x + 5, y: rightMandible.y },
    // Shadow cast downward onto neck
    { x: rightMandible.x, y: rightMandible.y + 35 },
    { x: chinApex.x, y: chinApex.y + 45 },
    { x: leftMandible.x, y: leftMandible.y + 35 },
  ];
  const jawNeckShadowPath = pointsToSmoothClosedPath(jawNeckShadowPts, 0.18);

  // 2. LATERAL CHEEK PLANE SHADOW
  // If lighting is directional, generate a broad crescent shadow on the unlit side of the face
  let cheekShadowPath: string | null = null;
  const outerCanthusR = lm.rightEye.upperLid.points[lm.rightEye.upperLid.points.length - 1] || { x: 610, y: 440 };
  const outerCanthusL = lm.leftEye.upperLid.points[0] || { x: 390, y: 440 };

  if (lighting === 'left') {
    // Right side of face is shadowed (lateral zygomatic arch and outer jaw border)
    const cheekShadowPts: Vec2[] = [
      { x: lm.forehead.templeRight.x, y: lm.forehead.templeRight.y },
      { x: rightMandible.x, y: rightMandible.y },
      { x: (rightMandible.x * 2 + chinApex.x) / 3, y: (rightMandible.y * 2 + chinApex.y) / 3 },
      { x: rightMandible.x * 0.75 + lm.mouth.center.x * 0.25, y: lm.mouth.center.y },
      { x: outerCanthusR.x + 20, y: lm.rightEye.pupil.y + 25 },
      { x: lm.forehead.templeRight.x - 8, y: lm.forehead.templeRight.y + 25 },
    ];
    cheekShadowPath = pointsToSmoothClosedPath(cheekShadowPts, 0.20);
  } else if (lighting === 'right') {
    // Left side of face is shadowed (lateral zygomatic arch and outer jaw border)
    const cheekShadowPts: Vec2[] = [
      { x: lm.forehead.templeLeft.x, y: lm.forehead.templeLeft.y },
      { x: leftMandible.x, y: leftMandible.y },
      { x: (leftMandible.x * 2 + chinApex.x) / 3, y: (leftMandible.y * 2 + chinApex.y) / 3 },
      { x: leftMandible.x * 0.75 + lm.mouth.center.x * 0.25, y: lm.mouth.center.y },
      { x: outerCanthusL.x - 20, y: lm.leftEye.pupil.y + 25 },
      { x: lm.forehead.templeLeft.x + 8, y: lm.forehead.templeLeft.y + 25 },
    ];
    cheekShadowPath = pointsToSmoothClosedPath(cheekShadowPts, 0.20);
  }

  // 3. LATERAL NOSE SIDEWALL SHADOW
  // Subtle shadow along one side of nasal bridge
  let noseSideShadowPath: string | null = null;
  const shadowSide = lighting === 'left' ? 'right' : 'left';
  const nasion = lm.nose.nasion;
  const tip = lm.nose.tip;
  if (shadowSide === 'right') {
    const noseSidePts: Vec2[] = [
      { x: nasion.x + 4, y: nasion.y + 8 },
      { x: tip.x + 15, y: tip.y - 10 },
      { x: lm.nose.rightNostril.x, y: lm.nose.rightNostril.y },
      { x: tip.x + 5, y: tip.y },
      { x: nasion.x, y: nasion.y + 12 },
    ];
    noseSideShadowPath = pointsToSmoothClosedPath(noseSidePts, 0.18);
  } else {
    const noseSidePts: Vec2[] = [
      { x: nasion.x - 4, y: nasion.y + 8 },
      { x: tip.x - 15, y: tip.y - 10 },
      { x: lm.nose.leftNostril.x, y: lm.nose.leftNostril.y },
      { x: tip.x - 5, y: tip.y },
      { x: nasion.x, y: nasion.y + 12 },
    ];
    noseSideShadowPath = pointsToSmoothClosedPath(noseSidePts, 0.18);
  }

  // 4. BROAD FOREHEAD PLANAR HIGHLIGHT
  const litOffset = lighting === 'left' ? -25 : lighting === 'right' ? 25 : 0;
  const foreheadHlCenterY = Math.max(220, (lm.forehead.top.y + lm.nose.nasion.y) / 2);
  const foreheadHighlightPts: Vec2[] = [
    { x: 500 + litOffset - 40, y: foreheadHlCenterY - 15 },
    { x: 500 + litOffset + 40, y: foreheadHlCenterY - 15 },
    { x: 500 + litOffset + 35, y: foreheadHlCenterY + 15 },
    { x: 500 + litOffset - 35, y: foreheadHlCenterY + 15 },
  ];
  const foreheadHighlightPath = pointsToSmoothClosedPath(foreheadHighlightPts, 0.22);

  // 5. CHEEKBONE PLANAR HIGHLIGHT
  const litCheekX = lighting === 'left' ? (lm.forehead.templeLeft.x + 45) : (lm.forehead.templeRight.x - 45);
  const litCheekY = lm.leftEye.pupil.y + 35;
  const cheekHighlightPts: Vec2[] = [
    { x: litCheekX - 25, y: litCheekY - 10 },
    { x: litCheekX + 25, y: litCheekY - 8 },
    { x: litCheekX + 20, y: litCheekY + 12 },
    { x: litCheekX - 20, y: litCheekY + 10 },
  ];
  const cheekHighlightPath = pointsToSmoothClosedPath(cheekHighlightPts, 0.22);

  return {
    jawNeckShadowPath,
    cheekShadowPath,
    noseSideShadowPath,
    foreheadHighlightPath,
    cheekHighlightPath,
  };
}
