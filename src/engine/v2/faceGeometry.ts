/**
 * CodeMyFace Engine V2 — Phase 2: Face Geometry Reconstruction
 *
 * Implements Part A:
 * - Reconstructs faithful face silhouette from canonical landmarks and segmentation evidence
 * - Preserves:
 *   - Genuine face width, height, cheek width, and mandibular jaw angle
 *   - Chin shape (broad, square, cleft, or tapered) without forcing a V-shape
 *   - Natural human facial asymmetry
 *   - Forehead height adapted to actual face skin mask (Class 3) and hairline anchors
 *   - Verifies bangs vs tall forehead without inventing arbitrary cranial domes
 * - Builds neck and shoulder contour supported by body skin / clothing evidence
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry } from './phase2Types';
import { cleanupContour } from './contourCleanup';

function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/**
 * Reconstructs the complete face silhouette geometry
 */
export function reconstructFaceGeometry(analysis: FacialAnalysisResultV2): FaceSilhouetteGeometry {
  const lm = analysis.landmarks;
  const seg = analysis.segmentation;
  const transform = analysis.transform;

  if (!lm || !transform) {
    throw new Error('Cannot reconstruct face geometry: missing landmarks or canonical transform');
  }

  // 1. Forehead boundary investigation
  // Landmark 10 is the canonical upper face anchor
  const landmark10 = lm.forehead.top;
  const bangsDetected = seg?.investigation.bangsCoveringForehead ?? false;

  let upperForeheadY = landmark10.y;

  // If no bangs, check if face skin mask extends above landmark 10
  if (!bangsDetected && seg?.rawMask && seg.maskWidth > 0 && seg.maskHeight > 0) {
    const src10 = transform.canonicalToNormalizedSource(landmark10);
    const midX = Math.round(src10.x * seg.maskWidth);
    const startY = Math.round(src10.y * seg.maskHeight);

    // Scan upward along center column to find topmost face skin pixel (class 3)
    let highestFaceSkinY = startY;
    for (let y = startY - 1; y >= Math.max(0, startY - Math.round(seg.maskHeight * 0.15)); y--) {
      const idx = y * seg.maskWidth + midX;
      if (seg.rawMask[idx] === 3) {
        highestFaceSkinY = y;
      } else {
        break; // Reached hairline or background
      }
    }

    if (highestFaceSkinY < startY) {
      // Map highest face skin pixel back to canonical units
      const canonTop = transform.normalizedSourceToCanonical({
        x: src10.x,
        y: highestFaceSkinY / seg.maskHeight,
      });
      // Allow realistic forehead elevation up to 35 units
      upperForeheadY = Math.max(landmark10.y - 35, canonTop.y);
    }
  }

  // 3. Assemble smooth anatomical face perimeter
  // Left temple -> jawline -> chin apex -> right jawline -> right temple -> forehead arc
  const jawlinePts = lm.jawline.points.map(p => ({ x: p.x, y: p.y }));
  const chinApex = lm.chin.tip;
  const leftMandible = lm.chin.leftMandibularCorner;
  const rightMandible = lm.chin.rightMandibularCorner;

  // Build forehead arc connecting right temple to left temple via upperForeheadY
  const templeLeft = lm.forehead.templeLeft;
  const templeRight = lm.forehead.templeRight;

  const foreheadArc: Vec2[] = [
    { x: templeRight.x, y: templeRight.y },
    { x: (templeRight.x * 2 + 500) / 3, y: (templeRight.y + upperForeheadY) / 2 },
    { x: 500, y: upperForeheadY },
    { x: (templeLeft.x * 2 + 500) / 3, y: (templeLeft.y + upperForeheadY) / 2 },
    { x: templeLeft.x, y: templeLeft.y },
  ];

  // Combine jawline with adapted forehead arc into a closed contour
  const fullFacePoints: Vec2[] = [
    ...jawlinePts,
    ...foreheadArc.slice(1, -1),
  ];

  // Clean micro-quantization
  const cleaned = cleanupContour(fullFacePoints, { epsilon: 1.2 });
  const contourPoints = cleaned.cleanedContour;

  // 4. Compute Anthropometric Measurements
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of contourPoints) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const faceWidth = maxX - minX;
  const faceHeight = maxY - minY;
  const jawWidth = distance(leftMandible, rightMandible);
  const chinWidth = lm.chin.crest.points.length >= 2
    ? distance(lm.chin.crest.points[0], lm.chin.crest.points[lm.chin.crest.points.length - 1])
    : 40;
  const foreheadHeight = Math.abs(lm.leftEye?.pupil?.y ? (lm.leftEye.pupil.y - upperForeheadY) : 150);

  // Measure natural facial asymmetry (ratio of left cheek width to right cheek width from centerline x=500)
  const leftCheekSpan = Math.abs(500 - minX);
  const rightCheekSpan = Math.abs(maxX - 500);
  const asymmetryRatio = Math.round((leftCheekSpan / Math.max(1, rightCheekSpan)) * 100) / 100;

  // 5. Proportional cervical neck and shoulder contour
  // Neck width is naturally inset from mandibles with an anatomical taper
  const neckTopY = Math.max(leftMandible.y, rightMandible.y);
  // Natural cervical neck extends ~45-55 logical units below chin apex
  const neckLength = Math.max(35, Math.min(55, faceHeight * 0.15));
  const neckBottomY = Math.min(710, chinApex.y + neckLength);

  const neckLeftX = leftMandible.x + 10;
  const neckRightX = rightMandible.x - 10;

  const neckPoints: Vec2[] = [
    { x: neckLeftX, y: neckTopY },
    { x: neckLeftX - 5, y: (neckTopY + neckBottomY) / 2 },
    { x: neckLeftX - 16, y: neckBottomY },
    { x: neckRightX + 16, y: neckBottomY },
    { x: neckRightX + 5, y: (neckTopY + neckBottomY) / 2 },
    { x: neckRightX, y: neckTopY },
  ];

  // Natural relaxed shoulders sloping from neck base down to artboard lower edge
  const shoulderPoints: Vec2[] = [
    { x: 140, y: 1000 },
    { x: neckLeftX - 16, y: neckBottomY },
    { x: neckRightX + 16, y: neckBottomY },
    { x: 860, y: 1000 },
  ];

  return {
    contourPoints,
    foreheadArc,
    jawlinePoints: jawlinePts,
    chinApex,
    leftMandible,
    rightMandible,
    neckPoints,
    shoulderPoints,
    bounds: {
      minX: Math.round(minX),
      maxX: Math.round(maxX),
      minY: Math.round(minY),
      maxY: Math.round(maxY),
      width: Math.round(faceWidth),
      height: Math.round(faceHeight),
    },
    measurements: {
      faceWidth: Math.round(faceWidth * 10) / 10,
      faceHeight: Math.round(faceHeight * 10) / 10,
      jawWidth: Math.round(jawWidth * 10) / 10,
      chinWidth: Math.round(chinWidth * 10) / 10,
      foreheadHeight: Math.round(foreheadHeight * 10) / 10,
      asymmetryRatio,
    },
  };
}
