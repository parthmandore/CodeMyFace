/**
 * CodeMyFace — Mask Contour Extraction & Path Simplification
 *
 * Converts a raster segmentation mask (Uint8Array multiclass grid) into clean,
 * geometrically faithful polygons for vector portrait rendering.
 *
 * Implements:
 * 1. Plausibility filtering & sanity checks (noise cleaning, clothing isolation).
 * 2. Moore-Neighbor 8-connected boundary tracing for faithful 2D silhouettes.
 * 3. Douglas-Peucker polyline simplification to eliminate pixel stair-steps.
 * 4. Separate front hairline vs. back cascading hair extraction.
 * 5. Left-right asymmetry preservation.
 */
import { Vec2, FacialFeatures } from '../../types/portrait';

/**
 * Computes perpendicular distance from a point to a line segment
 */
function perpendicularDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    const px = point.x - lineStart.x;
    const py = point.y - lineStart.y;
    return Math.sqrt(px * px + py * py);
  }
  const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
  const clampedU = Math.max(0, Math.min(1, u));
  const projX = lineStart.x + clampedU * dx;
  const projY = lineStart.y + clampedU * dy;
  const distDx = point.x - projX;
  const distDy = point.y - projY;
  return Math.sqrt(distDx * distDx + distDy * distDy);
}

/**
 * Douglas-Peucker algorithm to simplify a polygon/polyline
 * epsilon: max allowable deviation in coordinate units
 */
export function douglasPeucker(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, left.length - 1), ...right];
  } else {
    return [start, end];
  }
}

/**
 * Traces the external 8-connected boundary of a binary region
 * using Moore-Neighbor boundary tracing algorithm.
 */
export function mooreNeighborBoundaryTrace(
  isInside: (x: number, y: number) => boolean,
  startX: number,
  startY: number,
  maxSteps: number = 3500
): Vec2[] {
  // 8-directional offsets in clockwise order:
  // 0: N, 1: NE, 2: E, 3: SE, 4: S, 5: SW, 6: W, 7: NW
  const DIRS = [
    { dx: 0, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: -1 },
  ];

  const points: Vec2[] = [{ x: startX, y: startY }];
  let curX = startX;
  let curY = startY;
  // Since startY is minHairY, (startX, startY - 1) is guaranteed outside
  let bx = startX;
  let by = startY - 1;

  for (let step = 0; step < maxSteps; step++) {
    // Find direction index from cur to b
    const relX = bx - curX;
    const relY = by - curY;
    let bDir = 0;
    for (let d = 0; d < 8; d++) {
      if (DIRS[d].dx === relX && DIRS[d].dy === relY) {
        bDir = d;
        break;
      }
    }

    let foundNext = false;
    let nextX = curX;
    let nextY = curY;
    let nextBx = bx;
    let nextBy = by;

    // Scan clockwise starting from b
    for (let i = 0; i < 8; i++) {
      const testDir = (bDir + i) % 8;
      const tx = curX + DIRS[testDir].dx;
      const ty = curY + DIRS[testDir].dy;

      if (isInside(tx, ty)) {
        nextX = tx;
        nextY = ty;
        // The background pixel for next step is the pixel tested immediately before
        const prevDir = (testDir + 7) % 8;
        nextBx = curX + DIRS[prevDir].dx;
        nextBy = curY + DIRS[prevDir].dy;
        foundNext = true;
        break;
      }
    }

    if (!foundNext) break;

    // Loop closure: return to start pixel after traversing perimeter
    if (nextX === startX && nextY === startY && points.length > 2) {
      break;
    }

    curX = nextX;
    curY = nextY;
    bx = nextBx;
    by = nextBy;
    points.push({ x: curX, y: curY });
  }

  return points;
}

/**
 * Result structure of full hair mask geometry extraction
 */
export interface MaskHairGeometry {
  hasHair: boolean;
  hasHairSegmentation: boolean;
  provenance: 'segmentation-mask-derived' | 'fallback';
  silhouettePoints: Vec2[];
  backHairPoints?: Vec2[];
  hairlinePoints?: Vec2[];
  confidence: number;
  metrics: {
    hairPixelCount: number;
    totalPixels: number;
    hairRatio: number;
    hasLongHair: boolean;
    hasLongHairLeft: boolean;
    hasLongHairRight: boolean;
    leftMaxY: number;
    rightMaxY: number;
    apexY: number;
    isAsymmetric: boolean;
    parting: 'middle' | 'side' | 'open' | 'bangs';
    clothesPixelCountAroundNeck: number;
  };
}

/**
 * Extracts faithful vector hair geometry directly from a multiclass segmentation mask.
 *
 * MediaPipe Selfie Multiclass classes:
 * 0: Background
 * 1: Hair
 * 2: Body-skin
 * 3: Face-skin
 * 4: Clothes
 * 5: Others
 */
export function extractHairGeometryFromMask(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  features: FacialFeatures,
  targetHairClass: number = 1,
  targetClothesClass: number = 4
): MaskHairGeometry {
  const headCenterX = (features.templeLeft.x + features.templeRight.x) / 2;
  const faceHeight = Math.max(0.08, features.chinTip.y - features.foreheadTop.y);
  const faceWidthNorm = Math.abs(features.templeRight.x - features.templeLeft.x) || (faceHeight * 0.62);

  const cxPx = headCenterX * maskW;

  // 1. Plausibility Bounding Box (around head and shoulders)
  // Hair must be within reasonable anatomical proximity of the skull
  const minPlausibleX = Math.max(0, Math.floor((headCenterX - faceWidthNorm * 1.50) * maskW));
  const maxPlausibleX = Math.min(maskW - 1, Math.ceil((headCenterX + faceWidthNorm * 1.50) * maskW));
  const minPlausibleY = 0;
  const maxPlausibleY = Math.min(maskH - 1, Math.ceil((features.chinTip.y + faceHeight * 1.10) * maskH));

  // 2. Scan and validate mask pixels
  let hairPixelCount = 0;
  let clothesPixelCountAroundNeck = 0;
  let minHairX = maskW, maxHairX = 0;
  let minHairY = maskH, maxHairY = 0;
  let leftMaxY = 0, rightMaxY = 0;
  let leftLongHairPixels = 0;
  let rightLongHairPixels = 0;

  const isHairInBounds = (x: number, y: number): boolean => {
    if (x < minPlausibleX || x > maxPlausibleX || y < minPlausibleY || y > maxPlausibleY) {
      return false;
    }
    return mask[y * maskW + x] === targetHairClass;
  };

  const neckStartRow = Math.floor((features.chinTip.y - faceHeight * 0.05) * maskH);
  const chinLevelY = (features.chinTip.y + faceHeight * 0.04) * maskH;

  for (let y = minPlausibleY; y <= maxPlausibleY; y++) {
    for (let x = minPlausibleX; x <= maxPlausibleX; x++) {
      const val = mask[y * maskW + x];
      if (val === targetHairClass) {
        hairPixelCount++;
        if (x < minHairX) minHairX = x;
        if (x > maxHairX) maxHairX = x;
        if (y < minHairY) minHairY = y;
        if (y > maxHairY) maxHairY = y;

        if (x < cxPx) {
          if (y > leftMaxY) leftMaxY = y;
          if (y > chinLevelY) leftLongHairPixels++;
        } else {
          if (y > rightMaxY) rightMaxY = y;
          if (y > chinLevelY) rightLongHairPixels++;
        }
      } else if (val === targetClothesClass && y >= neckStartRow) {
        clothesPixelCountAroundNeck++;
      }
    }
  }

  const totalPixels = maskW * maskH;
  const hairRatio = hairPixelCount / totalPixels;

  // 3. Sanity checks: Empty mask, bald, or flooded mask
  if (hairPixelCount < 120 || hairRatio < 0.002) {
    // Implausibly small or bald: no hair
    return {
      hasHair: false,
      hasHairSegmentation: false,
      provenance: 'fallback',
      silhouettePoints: [],
      confidence: 0,
      metrics: {
        hairPixelCount,
        totalPixels,
        hairRatio,
        hasLongHair: false,
        hasLongHairLeft: false,
        hasLongHairRight: false,
        leftMaxY: leftMaxY / maskH,
        rightMaxY: rightMaxY / maskH,
        apexY: minHairY / maskH,
        isAsymmetric: false,
        parting: 'open',
        clothesPixelCountAroundNeck,
      },
    };
  }

  if (hairRatio > 0.65) {
    // Mask flooded by background segmentation failure: fallback needed
    return {
      hasHair: false,
      hasHairSegmentation: false,
      provenance: 'fallback',
      silhouettePoints: [],
      confidence: 0,
      metrics: {
        hairPixelCount,
        totalPixels,
        hairRatio,
        hasLongHair: false,
        hasLongHairLeft: false,
        hasLongHairRight: false,
        leftMaxY: leftMaxY / maskH,
        rightMaxY: rightMaxY / maskH,
        apexY: minHairY / maskH,
        isAsymmetric: false,
        parting: 'open',
        clothesPixelCountAroundNeck,
      },
    };
  }

  // 4. Hair Length & Left-Right Asymmetry Evaluation
  // Threshold: long hair extends significantly below chin/ears with sufficient density
  const longHairThresholdY = (features.chinTip.y + faceHeight * 0.04) * maskH;

  // Spatial continuity check: verify hair connects continuously from mid-face/ear level down to chin level
  // without large vertical gaps (rejects isolated clothing patches or shoulder collar bleed)
  const checkContinuousDrape = (side: 'left' | 'right'): boolean => {
    const startY = Math.round((features.foreheadTop.y + faceHeight * 0.40) * maskH);
    const endY = Math.round(chinLevelY);
    if (startY >= endY) return false;

    let maxConsecutiveEmptyRows = 0;
    let currentEmptyRows = 0;
    let hairRowCount = 0;

    const xMin = side === 'left' ? minPlausibleX : Math.round(cxPx);
    const xMax = side === 'left' ? Math.round(cxPx) : maxPlausibleX;

    for (let y = startY; y <= endY; y++) {
      let hasHairInRow = false;
      for (let x = xMin; x <= xMax; x++) {
        if (mask[y * maskW + x] === targetHairClass) {
          hasHairInRow = true;
          break;
        }
      }
      if (hasHairInRow) {
        hairRowCount++;
        currentEmptyRows = 0;
      } else {
        currentEmptyRows++;
        if (currentEmptyRows > maxConsecutiveEmptyRows) {
          maxConsecutiveEmptyRows = currentEmptyRows;
        }
      }
    }

    const totalRows = endY - startY + 1;
    const maxAllowedGap = Math.max(4, Math.round(faceHeight * maskH * 0.10));
    return maxConsecutiveEmptyRows <= maxAllowedGap && hairRowCount >= totalRows * 0.45;
  };

  const hasLongHairLeft = leftMaxY > longHairThresholdY && leftLongHairPixels >= 80 && checkContinuousDrape('left');
  const hasLongHairRight = rightMaxY > longHairThresholdY && rightLongHairPixels >= 80 && checkContinuousDrape('right');
  const hasLongHair = hasLongHairLeft || hasLongHairRight;
  const asymmetryDelta = Math.abs(leftMaxY - rightMaxY) / Math.max(1, faceHeight * maskH);
  const isAsymmetric = asymmetryDelta > 0.08;

  // 5. Forehead Hairline & Parting Detection
  // Check center column at forehead level for exposed skin vs. fringe bangs
  const foreheadCenterCheckY = Math.round((features.foreheadTop.y + faceHeight * 0.04) * maskH);
  const isForeheadCenterHair = (foreheadCenterCheckY >= 0 && foreheadCenterCheckY < maskH)
    ? mask[foreheadCenterCheckY * maskW + Math.round(cxPx)] === targetHairClass
    : false;

  let parting: 'middle' | 'side' | 'open' | 'bangs' = 'open';
  if (!isForeheadCenterHair) {
    parting = 'middle';
  } else {
    // Check if hair covers down across the brows (bangs) or only on one side
    const leftForeheadHair = mask[foreheadCenterCheckY * maskW + Math.round(features.templeLeft.x * maskW + faceWidthNorm * 0.2 * maskW)] === targetHairClass;
    const rightForeheadHair = mask[foreheadCenterCheckY * maskW + Math.round(features.templeRight.x * maskW - faceWidthNorm * 0.2 * maskW)] === targetHairClass;
    if (leftForeheadHair && rightForeheadHair) {
      parting = 'bangs';
    } else {
      parting = 'side';
    }
  }

  // 6. Trace Outer Boundary Contour using Moore-Neighbor Algorithm
  // Find apex starting pixel
  let startX = Math.round(cxPx);
  let startY = minHairY;
  // If (cxPx, minHairY) is not hair, find the closest hair pixel on row minHairY
  if (!isHairInBounds(startX, startY)) {
    let closestDist = Infinity;
    for (let x = minHairX; x <= maxHairX; x++) {
      if (isHairInBounds(x, minHairY)) {
        const d = Math.abs(x - cxPx);
        if (d < closestDist) {
          closestDist = d;
          startX = x;
        }
      }
    }
  }

  const rawBoundaryPts = mooreNeighborBoundaryTrace(isHairInBounds, startX, startY, 3500);

  // Convert raw boundary to normalized coordinates [0, 1]
  const normBoundaryPts: Vec2[] = rawBoundaryPts.map((p) => ({
    x: p.x / maskW,
    y: p.y / maskH,
  }));

  // Douglas-Peucker simplification (0.007 tolerance for clean, smooth vector lines)
  const simplifiedContour = normBoundaryPts.length >= 6
    ? douglasPeucker(normBoundaryPts, 0.007)
    : normBoundaryPts;

  // 7. Extract Forehead Hairline Points
  // Scan columns across forehead from templeLeft to templeRight to find bottom hair edge
  const hairlinePoints: Vec2[] = [];
  const templeLeftCol = Math.floor(features.templeLeft.x * maskW);
  const templeRightCol = Math.ceil(features.templeRight.x * maskW);
  const foreheadScanMinY = Math.max(0, Math.floor((features.foreheadTop.y - faceHeight * 0.05) * maskH));
  const foreheadScanMaxY = Math.min(maskH - 1, Math.ceil((features.foreheadTop.y + faceHeight * 0.16) * maskH));

  for (let x = templeRightCol; x >= templeLeftCol; x -= Math.max(1, Math.round(maskW / 36))) {
    let bottomHairY = -1;
    for (let y = foreheadScanMaxY; y >= foreheadScanMinY; y--) {
      if (isHairInBounds(x, y)) {
        bottomHairY = y;
        break;
      }
    }
    if (bottomHairY > 0) {
      hairlinePoints.push({
        x: x / maskW,
        y: bottomHairY / maskH,
      });
    }
  }

  // 8. Assemble Layer Shapes:
  // Back Hair (Layer 2): if long hair extends past ears/shoulders, cascading hair sits behind face.
  // We tuck upper cranial points down below forehead level so back hair never protrudes above crown.
  let backHairPoints: Vec2[] | undefined;
  if (hasLongHair && simplifiedContour.length >= 4) {
    const tuckY = features.foreheadTop.y + faceHeight * 0.08;
    backHairPoints = simplifiedContour.map((p) => ({
      x: p.x,
      y: p.y < tuckY ? tuckY : p.y,
    }));
  }

  // Front Hair (Layer 4): frames forehead and crown
  // The simplifiedContour traced by Moore-Neighbor algorithm is already a clean, complete closed loop.
  const silhouettePoints: Vec2[] = simplifiedContour.length >= 4 ? [...simplifiedContour] : [];
  const finalSilhouette = silhouettePoints.length >= 4 ? silhouettePoints : simplifiedContour;

  return {
    hasHair: true,
    hasHairSegmentation: true,
    provenance: 'segmentation-mask-derived',
    silhouettePoints: finalSilhouette,
    backHairPoints,
    hairlinePoints: hairlinePoints.length >= 3 ? hairlinePoints : undefined,
    confidence: Math.min(1, hairRatio * 8),
    metrics: {
      hairPixelCount,
      totalPixels,
      hairRatio,
      hasLongHair,
      hasLongHairLeft,
      hasLongHairRight,
      leftMaxY: leftMaxY / maskH,
      rightMaxY: rightMaxY / maskH,
      apexY: minHairY / maskH,
      isAsymmetric,
      parting,
      clothesPixelCountAroundNeck,
    },
  };
}

/**
 * Scans radial rays outward from head center through a mask to extract
 * a coherent closed boundary contour (retained for backward compatibility).
 */
export function extractRadialMaskContour(
  mask: Uint8Array,
  maskW: number,
  maskH: number,
  centerNorm: Vec2,
  targetValue: number = 1,
  numRays: number = 32,
  maxRadiusNorm: number = 0.55
): Vec2[] {
  const points: Vec2[] = [];
  const cx = centerNorm.x * maskW;
  const cy = centerNorm.y * maskH;
  const maxR = maxRadiusNorm * Math.max(maskW, maskH);

  const angleStart = Math.PI * 0.95;
  const angleEnd = Math.PI * 2.05;
  const angleStep = (angleEnd - angleStart) / (numRays - 1);

  for (let i = 0; i < numRays; i++) {
    const angle = angleStart + i * angleStep;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let lastHitX = cx;
    let lastHitY = cy;
    let found = false;

    const maxSteps = Math.floor(maxR / 1.5);
    for (let step = 1; step <= maxSteps; step++) {
      const rx = Math.round(cx + cosA * step * 1.5);
      const ry = Math.round(cy + sinA * step * 1.5);

      if (rx < 0 || rx >= maskW || ry < 0 || ry >= maskH) break;

      const val = mask[ry * maskW + rx];
      if (val === targetValue) {
        lastHitX = rx;
        lastHitY = ry;
        found = true;
      } else if (found) {
        break;
      }
    }

    if (found) {
      points.push({
        x: lastHitX / maskW,
        y: lastHitY / maskH,
      });
    }
  }

  if (points.length >= 4) {
    return douglasPeucker(points, 0.012);
  }

  return points;
}
