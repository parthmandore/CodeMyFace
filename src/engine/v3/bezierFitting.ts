/**
 * CodeMyFace V3 — Adaptive Bézier Curve Fitting & Geometry Simplification
 *
 * Implements:
 * 1. Ramer-Douglas-Peucker (RDP) polygon simplification
 * 2. Philip J. Schneider's algorithm (Graphics Gems) for fitting piecewise
 *    cubic Bézier curves to digitized points with configurable tolerance epsilon
 * 3. Exact SVG path serialization
 */

import { Point2D, CubicBezierSegment } from './types';

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function dist(p1: Point2D, p2: Point2D): number {
  return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/**
 * Calculates perpendicular distance from point P to line segment AB
 */
function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return dist(p, a);

  const t = Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Ramer-Douglas-Peucker (RDP) polygon simplification
 */
export function simplifyRDP(points: Point2D[], tolerance: number): Point2D[] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let index = 0;
  const last = points.length - 1;

  for (let i = 1; i < last; i++) {
    const d = perpendicularDistance(points[i], points[0], points[last]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > tolerance) {
    const left = simplifyRDP(points.slice(0, index + 1), tolerance);
    const right = simplifyRDP(points.slice(index), tolerance);
    return left.slice(0, left.length - 1).concat(right);
  } else {
    return [points[0], points[last]];
  }
}

/**
 * Fits a cubic Bézier curve to digitized points using Schneider's algorithm
 */
export function fitCubicBezierCurves(
  points: Point2D[],
  tolerance: number = 1.5
): CubicBezierSegment[] {
  if (points.length < 2) return [];

  if (points.length === 2) {
    // Trivial single line segment represented as flat Bézier
    const p0 = points[0];
    const p3 = points[1];
    return [
      {
        p0,
        cp1: { x: p0.x + (p3.x - p0.x) / 3, y: p0.y + (p3.y - p0.y) / 3 },
        cp2: { x: p0.x + (2 * (p3.x - p0.x)) / 3, y: p0.y + (2 * (p3.y - p0.y)) / 3 },
        p3,
      },
    ];
  }

  // Pre-simplify with small tolerance to remove sub-pixel jitter
  const simplified = points.length > 50 ? simplifyRDP(points, tolerance * 0.4) : points;
  if (simplified.length <= 2) {
    return fitCubicBezierCurves(simplified, tolerance);
  }

  const segments: CubicBezierSegment[] = [];

  // Compute unit tangent vectors at endpoints
  const tHat1 = computeLeftTangent(simplified, 0);
  const tHat2 = computeRightTangent(simplified, simplified.length - 1);

  fitCubicRecursive(simplified, 0, simplified.length - 1, tHat1, tHat2, tolerance, segments);
  return segments;
}

function computeLeftTangent(pts: Point2D[], end: number): Point2D {
  const p0 = pts[end];
  const p1 = pts[end + 1];
  const len = dist(p0, p1) || 1;
  return { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len };
}

function computeRightTangent(pts: Point2D[], end: number): Point2D {
  const p0 = pts[end - 1];
  const p1 = pts[end];
  const len = dist(p0, p1) || 1;
  return { x: (p0.x - p1.x) / len, y: (p0.y - p1.y) / len };
}

function computeCenterTangent(pts: Point2D[], center: number): Point2D {
  const pPrev = pts[center - 1];
  const pNext = pts[center + 1];
  const len = dist(pPrev, pNext) || 1;
  return { x: (pNext.x - pPrev.x) / len, y: (pNext.y - pPrev.y) / len };
}

function chordLengthParameterize(pts: Point2D[], first: number, last: number): number[] {
  const u: number[] = [0];
  for (let i = first + 1; i <= last; i++) {
    u.push(u[i - first - 1] + dist(pts[i], pts[i - 1]));
  }
  const total = u[u.length - 1] || 1;
  for (let i = 0; i < u.length; i++) {
    u[i] /= total;
  }
  return u;
}

function evaluateBezier(bez: CubicBezierSegment, t: number): Point2D {
  const it = 1 - t;
  const it2 = it * it;
  const it3 = it2 * it;
  const t2 = t * t;
  const t3 = t2 * t;

  return {
    x: it3 * bez.p0.x + 3 * it2 * t * bez.cp1.x + 3 * it * t2 * bez.cp2.x + t3 * bez.p3.x,
    y: it3 * bez.p0.y + 3 * it2 * t * bez.cp1.y + 3 * it * t2 * bez.cp2.y + t3 * bez.p3.y,
  };
}

function fitCubicRecursive(
  pts: Point2D[],
  first: number,
  last: number,
  tHat1: Point2D,
  tHat2: Point2D,
  tolerance: number,
  segments: CubicBezierSegment[]
) {
  const nPts = last - first + 1;
  if (nPts === 2) {
    const p0 = pts[first];
    const p3 = pts[last];
    const len = dist(p0, p3) / 3.0;
    segments.push({
      p0,
      cp1: { x: p0.x + tHat1.x * len, y: p0.y + tHat1.y * len },
      cp2: { x: p3.x + tHat2.x * len, y: p3.y + tHat2.y * len },
      p3,
    });
    return;
  }

  // Parameterize points
  const u = chordLengthParameterize(pts, first, last);

  // Generate Bézier control points
  const p0 = pts[first];
  const p3 = pts[last];

  let c11 = 0,
    c12 = 0,
    c21 = 0,
    c22 = 0;
  let x1 = 0,
    x2 = 0;

  for (let i = 0; i < nPts; i++) {
    const t = u[i];
    const it = 1 - t;
    const b0 = it * it * it;
    const b1 = 3 * it * it * t;
    const b2 = 3 * it * t * t;
    const b3 = t * t * t;

    const a1 = { x: tHat1.x * b1, y: tHat1.y * b1 };
    const a2 = { x: tHat2.x * b2, y: tHat2.y * b2 };

    c11 += a1.x * a1.x + a1.y * a1.y;
    c12 += a1.x * a2.x + a1.y * a2.y;
    c21 = c12;
    c22 += a2.x * a2.x + a2.y * a2.y;

    const pt = pts[first + i];
    const pTarget = {
      x: pt.x - (b0 * p0.x + b1 * p0.x + b2 * p3.x + b3 * p3.x),
      y: pt.y - (b0 * p0.y + b1 * p0.y + b2 * p3.y + b3 * p3.y),
    };

    x1 += a1.x * pTarget.x + a1.y * pTarget.y;
    x2 += a2.x * pTarget.x + a2.y * pTarget.y;
  }

  const det = c11 * c22 - c21 * c12;
  let alpha1 = 0;
  let alpha2 = 0;

  if (Math.abs(det) > 1e-6) {
    alpha1 = (x1 * c22 - x2 * c12) / det;
    alpha2 = (c11 * x2 - c21 * x1) / det;
  }

  // If alpha is negative or zero, fall back to proportional length
  const segLen = dist(p0, p3);
  if (alpha1 <= 0 || alpha2 <= 0) {
    alpha1 = segLen / 3.0;
    alpha2 = segLen / 3.0;
  }

  const candidateBez: CubicBezierSegment = {
    p0,
    cp1: { x: p0.x + tHat1.x * alpha1, y: p0.y + tHat1.y * alpha1 },
    cp2: { x: p3.x + tHat2.x * alpha2, y: p3.y + tHat2.y * alpha2 },
    p3,
  };

  // Find max error
  let maxError = 0;
  let splitPoint = Math.floor((first + last) / 2);

  for (let i = 1; i < nPts - 1; i++) {
    const pOnBez = evaluateBezier(candidateBez, u[i]);
    const err = dist(pts[first + i], pOnBez);
    if (err > maxError) {
      maxError = err;
      splitPoint = first + i;
    }
  }

  if (maxError <= tolerance || last - first <= 2) {
    segments.push(candidateBez);
  } else {
    // Split and recurse
    const tCenter = computeCenterTangent(pts, splitPoint);
    const tCenterNeg = { x: -tCenter.x, y: -tCenter.y };

    fitCubicRecursive(pts, first, splitPoint, tHat1, tCenter, tolerance, segments);
    fitCubicRecursive(pts, splitPoint, last, tCenterNeg, tHat2, tolerance, segments);
  }
}

/**
 * Converts cubic Bézier segments into a standard SVG path `d` string
 */
export function bezierSegmentsToPath(
  segments: CubicBezierSegment[],
  isClosed: boolean = false
): string {
  if (segments.length === 0) return '';

  let d = `M ${round1(segments[0].p0.x)} ${round1(segments[0].p0.y)}`;

  for (let i = 0; i < segments.length; i++) {
    const s = segments[i];
    d += ` C ${round1(s.cp1.x)} ${round1(s.cp1.y)}, ${round1(s.cp2.x)} ${round1(s.cp2.y)}, ${round1(s.p3.x)} ${round1(s.p3.y)}`;
  }

  if (isClosed) {
    d += ' Z';
  }

  return d;
}

/**
 * Direct conversion of points to smooth SVG path with specified simplification tolerance
 */
export function pointsToSmoothSvgPath(
  points: Point2D[],
  tolerance: number = 1.5,
  isClosed: boolean = false
): string {
  if (!points || points.length < 2) return '';
  if (points.length === 2) {
    return `M ${round1(points[0].x)} ${round1(points[0].y)} L ${round1(points[1].x)} ${round1(points[1].y)}`;
  }

  const pts = isClosed && dist(points[0], points[points.length - 1]) > 1
    ? [...points, points[0]]
    : points;

  const segments = fitCubicBezierCurves(pts, tolerance);
  return bezierSegmentsToPath(segments, isClosed);
}
