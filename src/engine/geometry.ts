/**
 * Geometry utilities for SVG path generation, coordinate transforms,
 * and polygon operations. All coordinates are in normalized [0,1] space
 * unless otherwise noted.
 */
import { Vec2, Color, ColorAlpha } from '../types/portrait';

// === Coordinate and Vector Math ===

/** Clamp a value between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Clamp a Vec2 to [0,1] range */
export function clampVec2(v: Vec2): Vec2 {
  return { x: clamp(v.x, 0, 1), y: clamp(v.y, 0, 1) };
}

/** Linear interpolation between two values */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Linear interpolation between two Vec2 points */
export function lerpVec2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

/** Distance between two Vec2 points */
export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Midpoint of two Vec2 points */
export function midpoint(a: Vec2, b: Vec2): Vec2 {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Scale a Vec2 from a center point */
export function scaleFromCenter(point: Vec2, center: Vec2, scale: number): Vec2 {
  return {
    x: center.x + (point.x - center.x) * scale,
    y: center.y + (point.y - center.y) * scale,
  };
}

/** Rotate a point around a center by angle (radians) */
export function rotateAround(point: Vec2, center: Vec2, angle: number): Vec2 {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

/** Calculate angle between two points in radians */
export function angleBetween(a: Vec2, b: Vec2): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/** Get the normal (perpendicular) direction of a line segment */
export function normalDirection(a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return { x: 0, y: -1 };
  return { x: -dy / len, y: dx / len };
}

/** Offset a point along a normal direction */
export function offsetAlongNormal(point: Vec2, a: Vec2, b: Vec2, amount: number): Vec2 {
  const n = normalDirection(a, b);
  return { x: point.x + n.x * amount, y: point.y + n.y * amount };
}

/** Calculate the centroid of a polygon */
export function centroid(points: Vec2[]): Vec2 {
  if (points.length === 0) return { x: 0.5, y: 0.5 };
  let sx = 0, sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/** Calculate bounding box of a set of points */
export function boundingBox(points: Vec2[]): { min: Vec2; max: Vec2; width: number; height: number; center: Vec2 } {
  if (points.length === 0) {
    return { min: { x: 0, y: 0 }, max: { x: 1, y: 1 }, width: 1, height: 1, center: { x: 0.5, y: 0.5 } };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    width: maxX - minX,
    height: maxY - minY,
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

/** Smooth a polygon by averaging adjacent points (Laplacian smoothing) */
export function smoothPolygon(points: Vec2[], iterations: number = 1, weight: number = 0.5): Vec2[] {
  let result = [...points];
  for (let iter = 0; iter < iterations; iter++) {
    const next: Vec2[] = [];
    for (let i = 0; i < result.length; i++) {
      const prev = result[(i - 1 + result.length) % result.length];
      const curr = result[i];
      const nextP = result[(i + 1) % result.length];
      next.push({
        x: curr.x * (1 - weight) + (prev.x + nextP.x) / 2 * weight,
        y: curr.y * (1 - weight) + (prev.y + nextP.y) / 2 * weight,
      });
    }
    result = next;
  }
  return result;
}

/** Subdivide a polygon by inserting midpoints between each pair */
export function subdividePolygon(points: Vec2[]): Vec2[] {
  if (points.length < 2) return points;
  const result: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    result.push(points[i]);
    const next = points[(i + 1) % points.length];
    result.push(midpoint(points[i], next));
  }
  return result;
}

// === SVG Path Generation ===

/** Convert normalized Vec2 to pixel coordinates */
export function toPixel(v: Vec2, width: number, height: number): Vec2 {
  return { x: v.x * width, y: v.y * height };
}

/** Round a number for SVG output (2 decimal places) */
export function svgNum(n: number): string {
  if (!isFinite(n)) return '0';
  return Number(n.toFixed(2)).toString();
}

/** Generate SVG path 'd' attribute from a closed polygon of normalized points */
export function polygonToPath(points: Vec2[], w: number, h: number): string {
  if (points.length < 2) return '';
  const px = points.map(p => toPixel(clampVec2(p), w, h));
  const parts = [`M ${svgNum(px[0].x)} ${svgNum(px[0].y)}`];
  for (let i = 1; i < px.length; i++) {
    parts.push(`L ${svgNum(px[i].x)} ${svgNum(px[i].y)}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Generate a smooth cubic bezier SVG path from points (closed curve) */
export function smoothCurvePath(points: Vec2[], w: number, h: number, tension: number = 0.3): string {
  if (points.length < 3) return polygonToPath(points, w, h);
  const px = points.map(p => toPixel(clampVec2(p), w, h));
  const n = px.length;
  
  let d = `M ${svgNum(px[0].x)} ${svgNum(px[0].y)}`;
  
  for (let i = 0; i < n; i++) {
    const p0 = px[(i - 1 + n) % n];
    const p1 = px[i];
    const p2 = px[(i + 1) % n];
    const p3 = px[(i + 2) % n];
    
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    
    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  
  d += ' Z';
  return d;
}

/** Generate an open smooth curve path (not closed) */
export function openCurvePath(points: Vec2[], w: number, h: number, tension: number = 0.3): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    const a = toPixel(clampVec2(points[0]), w, h);
    const b = toPixel(clampVec2(points[1]), w, h);
    return `M ${svgNum(a.x)} ${svgNum(a.y)} L ${svgNum(b.x)} ${svgNum(b.y)}`;
  }
  const px = points.map(p => toPixel(clampVec2(p), w, h));
  let d = `M ${svgNum(px[0].x)} ${svgNum(px[0].y)}`;
  
  for (let i = 0; i < px.length - 1; i++) {
    const p0 = px[Math.max(0, i - 1)];
    const p1 = px[i];
    const p2 = px[i + 1];
    const p3 = px[Math.min(px.length - 1, i + 2)];
    
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;
    
    d += ` C ${svgNum(cp1x)} ${svgNum(cp1y)}, ${svgNum(cp2x)} ${svgNum(cp2y)}, ${svgNum(p2.x)} ${svgNum(p2.y)}`;
  }
  
  return d;
}

/** Generate an ellipse path centered at (cx, cy) with rx, ry in normalized coords */
export function ellipsePath(cx: number, cy: number, rx: number, ry: number, w: number, h: number): string {
  const pcx = cx * w, pcy = cy * h;
  const prx = rx * w, pry = ry * h;
  return `M ${svgNum(pcx - prx)} ${svgNum(pcy)} ` +
    `A ${svgNum(prx)} ${svgNum(pry)} 0 1 0 ${svgNum(pcx + prx)} ${svgNum(pcy)} ` +
    `A ${svgNum(prx)} ${svgNum(pry)} 0 1 0 ${svgNum(pcx - prx)} ${svgNum(pcy)} Z`;
}

// === Color Utilities ===

/** Convert Color to hex string */
export function colorToHex(c?: Color | null): string {
  if (!c || typeof c.r !== 'number' || !isFinite(c.r)) {
    return '#808080';
  }
  const r = clamp(Math.round(c.r), 0, 255);
  const g = clamp(Math.round(c.g), 0, 255);
  const b = clamp(Math.round(c.b), 0, 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/** Convert ColorAlpha to rgba string */
export function colorToRgba(c: ColorAlpha): string {
  return `rgba(${clamp(Math.round(c.r), 0, 255)}, ${clamp(Math.round(c.g), 0, 255)}, ${clamp(Math.round(c.b), 0, 255)}, ${clamp(c.a, 0, 1).toFixed(2)})`;
}

/** Darken a color by a factor (0-1, where 0 = unchanged, 1 = black) */
export function darken(c: Color, amount: number): Color {
  const factor = 1 - clamp(amount, 0, 1);
  return {
    r: Math.round(c.r * factor),
    g: Math.round(c.g * factor),
    b: Math.round(c.b * factor),
  };
}

/** Lighten a color by a factor (0-1, where 0 = unchanged, 1 = white) */
export function lighten(c: Color, amount: number): Color {
  const factor = clamp(amount, 0, 1);
  return {
    r: Math.round(c.r + (255 - c.r) * factor),
    g: Math.round(c.g + (255 - c.g) * factor),
    b: Math.round(c.b + (255 - c.b) * factor),
  };
}

/** Mix two colors by ratio t (0 = color a, 1 = color b) */
export function mixColors(a: Color, b: Color, t: number): Color {
  const ct = clamp(t, 0, 1);
  return {
    r: Math.round(lerp(a.r, b.r, ct)),
    g: Math.round(lerp(a.g, b.g, ct)),
    b: Math.round(lerp(a.b, b.b, ct)),
  };
}

/** Calculate luminance of a color (0-1) */
export function luminance(c: Color): number {
  return (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
}

/** Converts an RGB Color [0-255] to HSL: h in [0, 360), s in [0, 1], l in [0, 1] */
export function rgbToHsl(c: Color): { h: number; s: number; l: number } {
  const r = clamp(c.r, 0, 255) / 255;
  const g = clamp(c.g, 0, 255) / 255;
  const b = clamp(c.b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;

  if (d !== 0) {
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
        break;
      case g:
        h = ((b - r) / d + 2) * 60;
        break;
      case b:
        h = ((r - g) / d + 4) * 60;
        break;
    }
    return { h, s, l };
  }
  return { h: 0, s: 0, l };
}

/** Converts HSL (h in [0, 360), s in [0, 1], l in [0, 1]) to an RGB Color [0-255] */
export function hslToRgb(hsl: { h: number; s: number; l: number }): Color {
  const { h, s, l } = hsl;
  if (s <= 0) {
    const v = clamp(Math.round(l * 255), 0, 255);
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hk = ((h % 360 + 360) % 360) / 360;

  return {
    r: clamp(Math.round(hue2rgb(p, q, hk + 1 / 3) * 255), 0, 255),
    g: clamp(Math.round(hue2rgb(p, q, hk) * 255), 0, 255),
    b: clamp(Math.round(hue2rgb(p, q, hk - 1 / 3) * 255), 0, 255),
  };
}

/**
 * Derives a shadow skin tone in perceptual HSL space.
 * Decreases lightness by `targetDarkenRatio` (default 0.24, ~24% darker)
 * while preserving natural hue and maintaining warm saturation so shadowed skin
 * does not turn muddy or gray.
 */
export function derivePerceptualSkinShadow(base: Color, targetDarkenRatio: number = 0.24): Color {
  const hsl = rgbToHsl(base);
  const shadowL = Math.max(0.04, hsl.l * (1 - clamp(targetDarkenRatio, 0, 0.8)));
  const shadowS = Math.min(1.0, hsl.s * 1.03);
  return hslToRgb({ h: hsl.h, s: shadowS, l: shadowL });
}

/**
 * Derives a highlight skin tone in perceptual HSL space.
 * Increases lightness by `targetLightenRatio` (default 0.14, ~14% lighter)
 * while preserving natural hue and gently moderating specular saturation.
 */
export function derivePerceptualSkinHighlight(base: Color, targetLightenRatio: number = 0.14): Color {
  const hsl = rgbToHsl(base);
  const highlightL = Math.min(0.97, hsl.l + (1 - hsl.l) * (clamp(targetLightenRatio, 0, 0.8) * 2.5));
  const highlightS = Math.max(0, hsl.s * 0.92);
  return hslToRgb({ h: hsl.h, s: highlightS, l: highlightL });
}

/** Check if a value is a valid finite number */
export function isValidNum(n: number): boolean {
  return typeof n === 'number' && isFinite(n) && !isNaN(n);
}

/** Validate a Vec2 has valid finite coordinates */
export function isValidVec2(v: Vec2 | null | undefined): v is Vec2 {
  return v != null && isValidNum(v.x) && isValidNum(v.y);
}

/** Validate and clamp a point array, filtering out invalid points */
export function validatePoints(points: Vec2[]): Vec2[] {
  return points.filter(isValidVec2).map(clampVec2);
}
