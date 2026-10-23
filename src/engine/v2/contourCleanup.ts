/**
 * CodeMyFace Engine V2 — Phase 2: Controlled Contour Cleanup
 *
 * Implements Part C:
 * 1. Preserves meaningful changes in direction (curls, bangs, volume lobes).
 * 2. Removes tiny mask quantization stair-step artifacts from 256x256 raster masks.
 * 3. Avoids excessive smoothing that destroys hairstyle personality.
 * 4. Resolves self-intersections and tiny loops.
 * 5. Retains the complete raw contour for diagnostic overlay comparisons.
 */

import { Vec2 } from '../../types/portrait';

/**
 * Calculates perpendicular distance from a point to a line segment
 */
function perpendicularDistance(p: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const px = p.x - lineStart.x;
    const py = p.y - lineStart.y;
    return Math.sqrt(px * px + py * py);
  }
  const u = Math.max(0, Math.min(1, ((p.x - lineStart.x) * dx + (p.y - lineStart.y) * dy) / lenSq));
  const projX = lineStart.x + u * dx;
  const projY = lineStart.y + u * dy;
  const distDx = p.x - projX;
  const distDy = p.y - projY;
  return Math.sqrt(distDx * distDx + distDy * distDy);
}

/**
 * Douglas-Peucker polyline simplification algorithm
 */
export function douglasPeucker(points: Vec2[], epsilon: number): Vec2[] {
  if (points.length <= 2) return [...points];

  let maxDist = 0;
  let maxIdx = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], start, end);
    if (d > maxDist) {
      maxDist = d;
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
 * Removes 1-pixel quantization stair-steps and colinear micro-jitter
 */
export function removeQuantizationJitter(points: Vec2[], minDistance: number = 1.2): Vec2[] {
  if (points.length <= 3) return [...points];

  const result: Vec2[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = result[result.length - 1];
    const curr = points[i];
    const d = Math.hypot(curr.x - prev.x, curr.y - prev.y);

    if (d >= minDistance) {
      result.push(curr);
    }
  }

  // Ensure closure if start and end were connected
  const first = result[0];
  const last = result[result.length - 1];
  if (Math.hypot(first.x - last.x, first.y - last.y) < minDistance && result.length > 3) {
    result[result.length - 1] = { ...first };
  }

  return result;
}

/**
 * Checks if two line segments (p1-p2 and p3-p4) intersect
 */
function segmentsIntersect(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): boolean {
  const ccw = (a: Vec2, b: Vec2, c: Vec2) =>
    (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);

  return (
    ccw(p1, p3, p4) !== ccw(p2, p3, p4) &&
    ccw(p1, p2, p3) !== ccw(p1, p2, p4)
  );
}

/**
 * Detects and clips small self-intersecting loops from the polygon perimeter
 */
export function resolveSelfIntersections(points: Vec2[]): Vec2[] {
  if (points.length < 5) return points;

  const result: Vec2[] = [...points];
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 5) {
    changed = false;
    iterations++;

    for (let i = 0; i < result.length - 3; i++) {
      const a1 = result[i];
      const a2 = result[i + 1];

      // Check against subsequent non-adjacent segments (limit search window to 15 to avoid false global cuts)
      const maxJ = Math.min(result.length - 1, i + 15);
      for (let j = i + 2; j < maxJ; j++) {
        if (i === 0 && j === result.length - 1) continue; // adjacent in closed polygon

        const b1 = result[j];
        const b2 = result[(j + 1) % result.length];

        if (segmentsIntersect(a1, a2, b1, b2)) {
          // Remove the self-intersecting loop between i+1 and j
          result.splice(i + 1, j - i);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }

  return result;
}

export interface CleanupResult {
  rawContour: Vec2[];
  cleanedContour: Vec2[];
  pointCountReduction: number;
}

/**
 * Controlled contour cleanup pipeline:
 * 1. Preserves raw points intact.
 * 2. Removes raster quantization micro-jitter.
 * 3. Applies adaptive Douglas-Peucker simplification tuned for curls and waves.
 * 4. Resolves self-intersecting micro-loops.
 */
export function cleanupContour(
  rawPoints: Vec2[],
  options: { epsilon?: number; minPointSpacing?: number } = {}
): CleanupResult {
  if (!rawPoints || rawPoints.length < 3) {
    return {
      rawContour: rawPoints ? [...rawPoints] : [],
      cleanedContour: rawPoints ? [...rawPoints] : [],
      pointCountReduction: 0,
    };
  }

  const rawCopy = rawPoints.map(p => ({ x: p.x, y: p.y }));

  // Step 1: Remove raster step noise
  const deJittered = removeQuantizationJitter(rawCopy, options.minPointSpacing ?? 1.5);

  // Step 2: Adaptive Douglas-Peucker simplification (default epsilon = 1.8 units, preserving curls)
  const epsilon = options.epsilon ?? 1.8;
  const simplified = douglasPeucker(deJittered, epsilon);

  // Step 3: Resolve self-intersections
  const cleaned = resolveSelfIntersections(simplified);

  return {
    rawContour: rawCopy,
    cleanedContour: cleaned,
    pointCountReduction: rawCopy.length - cleaned.length,
  };
}
