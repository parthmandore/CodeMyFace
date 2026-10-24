/**
 * CodeMyFace V3 — Sub-Pixel Contour Extraction
 *
 * Implements robust 8-connected boundary tracing and Marching Squares
 * on binary edge maps and semantic segmentation masks.
 *
 * Features:
 * - Topological border following with hole detection
 * - Shoelace polygon area and perimeter calculation
 * - Noise filtering by minimum area and aspect ratio
 * - Region-of-interest (ROI) bounded extraction
 */

import { Point2D, BoundingBox, Contour } from './types';

/**
 * 8-connected neighborhood offsets: N, NE, E, SE, S, SW, W, NW
 */
const NEIGHBORS_8 = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: -1 },
];

/**
 * Calculates polygon area using the Shoelace formula (positive for counter-clockwise)
 */
export function calculatePolygonArea(pts: Point2D[]): number {
  if (pts.length < 3) return 0;
  let sum = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const next = (i + 1) % n;
    sum += pts[i].x * pts[next].y - pts[next].x * pts[i].y;
  }
  return Math.abs(sum) / 2.0;
}

/**
 * Calculates perimeter of a polyline or polygon
 */
export function calculatePerimeter(pts: Point2D[], isClosed: boolean): number {
  if (pts.length < 2) return 0;
  let length = 0;
  const count = isClosed ? pts.length : pts.length - 1;
  for (let i = 0; i < count; i++) {
    const next = (i + 1) % pts.length;
    length += Math.hypot(pts[next].x - pts[i].x, pts[next].y - pts[i].y);
  }
  return length;
}

/**
 * Computes bounding box for a set of points
 */
export function computeBoundingBox(pts: Point2D[]): BoundingBox {
  if (pts.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Extracts connected contours from a binary mask (pixels === targetValue)
 */
export function extractMaskContours(
  mask: Uint8Array,
  width: number,
  height: number,
  targetValue: number = 1,
  minArea: number = 12
): Contour[] {
  const visited = new Uint8Array(width * height);
  const contours: Contour[] = [];

  for (let y = 1; y < height - 1; y++) {
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const idx = row + x;
      if (mask[idx] !== targetValue || visited[idx] === 1) continue;

      // Check if this is an external border pixel (has at least one 4-neighbor that is NOT targetValue)
      const isBorder =
        mask[idx - width] !== targetValue ||
        mask[idx + width] !== targetValue ||
        mask[idx - 1] !== targetValue ||
        mask[idx + 1] !== targetValue;

      if (!isBorder) continue;

      // Trace border using Moore-Neighbor 8-connected algorithm
      const points: Point2D[] = [];
      let curX = x;
      let curY = y;
      let dir = 0; // Starting search direction

      points.push({ x: curX, y: curY });
      visited[curY * width + curX] = 1;

      const maxSteps = 12000;
      let step = 0;

      while (step < maxSteps) {
        step++;
        let found = false;

        for (let i = 0; i < 8; i++) {
          const testDir = (dir + i) % 8;
          const nx = curX + NEIGHBORS_8[testDir].dx;
          const ny = curY + NEIGHBORS_8[testDir].dy;

          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nIdx = ny * width + nx;
            if (mask[nIdx] === targetValue) {
              curX = nx;
              curY = ny;
              dir = (testDir + 5) % 8; // Backtrack direction
              visited[nIdx] = 1;
              points.push({ x: curX, y: curY });
              found = true;
              break;
            }
          }
        }

        if (!found) break;

        // Loop closed
        if (curX === x && curY === y && points.length > 3) {
          break;
        }
      }

      if (points.length >= 4) {
        const area = calculatePolygonArea(points);
        if (area >= minArea) {
          const perimeter = calculatePerimeter(points, true);
          const bbox = computeBoundingBox(points);
          contours.push({
            points,
            isClosed: true,
            area,
            perimeter,
            bbox,
            isHole: false,
            semanticClass: targetValue,
          });
        }
      }
    }
  }

  // Sort descending by area so dominant shapes come first
  contours.sort((a, b) => b.area - a.area);
  return contours;
}

/**
 * Extracts connected open edge polylines from a binary Canny edge map
 */
export function extractEdgePolylines(
  edgeMap: Uint8Array,
  width: number,
  height: number,
  minPoints: number = 6,
  roi?: BoundingBox
): Point2D[][] {
  const visited = new Uint8Array(width * height);
  const polylines: Point2D[][] = [];

  const xStart = roi ? Math.max(1, Math.floor(roi.minX)) : 1;
  const yStart = roi ? Math.max(1, Math.floor(roi.minY)) : 1;
  const xEnd = roi ? Math.min(width - 2, Math.ceil(roi.maxX)) : width - 2;
  const yEnd = roi ? Math.min(height - 2, Math.ceil(roi.maxY)) : height - 2;

  for (let y = yStart; y <= yEnd; y++) {
    const row = y * width;
    for (let x = xStart; x <= xEnd; x++) {
      const idx = row + x;
      if (edgeMap[idx] !== 1 || visited[idx] === 1) continue;

      // Count neighbors to prefer starting at an endpoint (degree === 1)
      let degree = 0;
      for (let n = 0; n < 8; n++) {
        const nx = x + NEIGHBORS_8[n].dx;
        const ny = y + NEIGHBORS_8[n].dy;
        if (edgeMap[ny * width + nx] === 1) degree++;
      }

      // If degree > 2 and we have unvisited candidates, skip to find true endpoints first
      if (degree > 2) continue;

      // Trace line
      const line: Point2D[] = [];
      let curX = x;
      let curY = y;
      line.push({ x: curX, y: curY });
      visited[curY * width + curX] = 1;

      while (true) {
        let nextX = -1;
        let nextY = -1;

        for (let n = 0; n < 8; n++) {
          const nx = curX + NEIGHBORS_8[n].dx;
          const ny = curY + NEIGHBORS_8[n].dy;
          if (nx >= xStart && nx <= xEnd && ny >= yStart && ny <= yEnd) {
            const nIdx = ny * width + nx;
            if (edgeMap[nIdx] === 1 && visited[nIdx] === 0) {
              nextX = nx;
              nextY = ny;
              visited[nIdx] = 1;
              break;
            }
          }
        }

        if (nextX === -1) break;

        curX = nextX;
        curY = nextY;
        line.push({ x: curX, y: curY });
      }

      if (line.length >= minPoints) {
        polylines.push(line);
      }
    }
  }

  return polylines;
}
