import { describe, it, expect } from 'vitest';
import {
  clamp,
  lerp,
  distance,
  midpoint,
  scaleFromCenter,
  rotateAround,
  angleBetween,
  centroid,
  boundingBox,
  smoothPolygon,
  subdividePolygon,
  polygonToPath,
  smoothCurvePath,
  openCurvePath,
  colorToHex,
  darken,
  lighten,
  mixColors,
  luminance,
  svgNum,
  rgbToHsl,
  hslToRgb,
  derivePerceptualSkinShadow,
  derivePerceptualSkinHighlight,
} from '../geometry';
import { Vec2, Color } from '../../types/portrait';

describe('geometry utilities', () => {
  describe('math and vector calculations', () => {
    it('clamps values correctly within range', () => {
      expect(clamp(5, 0, 10)).toBe(5);
      expect(clamp(-5, 0, 10)).toBe(0);
      expect(clamp(15, 0, 10)).toBe(10);
    });

    it('interpolates linearly between values', () => {
      expect(lerp(10, 20, 0.5)).toBe(15);
      expect(lerp(0, 100, 0)).toBe(0);
      expect(lerp(0, 100, 1)).toBe(100);
    });

    it('calculates Euclidean distance between points', () => {
      const a: Vec2 = { x: 0, y: 0 };
      const b: Vec2 = { x: 3, y: 4 };
      expect(distance(a, b)).toBe(5);
    });

    it('computes midpoint between points', () => {
      const a: Vec2 = { x: 2, y: 4 };
      const b: Vec2 = { x: 6, y: 8 };
      expect(midpoint(a, b)).toEqual({ x: 4, y: 6 });
    });

    it('scales points from center', () => {
      const p: Vec2 = { x: 2, y: 2 };
      const c: Vec2 = { x: 0, y: 0 };
      expect(scaleFromCenter(p, c, 2)).toEqual({ x: 4, y: 4 });
    });

    it('rotates points around a center', () => {
      const p: Vec2 = { x: 1, y: 0 };
      const c: Vec2 = { x: 0, y: 0 };
      const rotated = rotateAround(p, c, Math.PI / 2);
      expect(rotated.x).toBeCloseTo(0);
      expect(rotated.y).toBeCloseTo(1);
    });

    it('computes angle between two points', () => {
      const a: Vec2 = { x: 0, y: 0 };
      const b: Vec2 = { x: 1, y: 0 };
      expect(angleBetween(a, b)).toBe(0);
    });

    it('calculates polygon centroid', () => {
      const triangle: Vec2[] = [
        { x: 0, y: 0 },
        { x: 6, y: 0 },
        { x: 3, y: 6 },
      ];
      expect(centroid(triangle)).toEqual({ x: 3, y: 2 });
    });

    it('calculates bounding box', () => {
      const points: Vec2[] = [
        { x: 0.2, y: 0.3 },
        { x: 0.8, y: 0.7 },
      ];
      const box = boundingBox(points);
      expect(box.min).toEqual({ x: 0.2, y: 0.3 });
      expect(box.max).toEqual({ x: 0.8, y: 0.7 });
      expect(box.width).toBeCloseTo(0.6);
      expect(box.height).toBeCloseTo(0.4);
    });

    it('smooths and subdivides polygons without NaN', () => {
      const square: Vec2[] = [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ];
      const subdivided = subdividePolygon(square);
      expect(subdivided.length).toBe(8);

      const smoothed = smoothPolygon(subdivided, 2);
      expect(smoothed.length).toBe(8);
      for (const pt of smoothed) {
        expect(isFinite(pt.x)).toBe(true);
        expect(isFinite(pt.y)).toBe(true);
      }
    });
  });

  describe('SVG path generation', () => {
    it('generates valid closed polygon paths', () => {
      const poly: Vec2[] = [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ];
      const path = polygonToPath(poly, 1000, 1000);
      expect(path).toContain('M 100 100');
      expect(path).toContain('L 900 100');
      expect(path).toContain('L 500 900');
      expect(path.endsWith('Z')).toBe(true);
    });

    it('generates smooth cubic bezier curve paths', () => {
      const poly: Vec2[] = [
        { x: 0.1, y: 0.1 },
        { x: 0.9, y: 0.1 },
        { x: 0.5, y: 0.9 },
      ];
      const path = smoothCurvePath(poly, 1000, 1000);
      expect(path.startsWith('M')).toBe(true);
      expect(path).toContain('C');
      expect(path.endsWith('Z')).toBe(true);
    });

    it('generates open curve paths without closing Z', () => {
      const line: Vec2[] = [
        { x: 0.1, y: 0.5 },
        { x: 0.5, y: 0.8 },
        { x: 0.9, y: 0.5 },
      ];
      const path = openCurvePath(line, 1000, 1000);
      expect(path.startsWith('M')).toBe(true);
      expect(path.endsWith('Z')).toBe(false);
    });

    it('formats svg numbers cleanly without NaN', () => {
      expect(svgNum(123.456)).toBe('123.46');
      expect(svgNum(NaN)).toBe('0');
      expect(svgNum(Infinity)).toBe('0');
    });
  });

  describe('color utilities', () => {
    const coral: Color = { r: 255, g: 127, b: 80 };

    it('converts color to hex string', () => {
      expect(colorToHex({ r: 0, g: 0, b: 0 })).toBe('#000000');
      expect(colorToHex({ r: 255, g: 255, b: 255 })).toBe('#ffffff');
      expect(colorToHex(coral)).toBe('#ff7f50');
    });

    it('darkens colors predictably', () => {
      const darkened = darken(coral, 0.5);
      expect(darkened.r).toBeLessThan(coral.r);
      expect(darkened.g).toBeLessThan(coral.g);
      expect(darkened.b).toBeLessThan(coral.b);
    });

    it('lightens colors predictably', () => {
      const lightened = lighten(coral, 0.5);
      expect(lightened.r).toBeGreaterThanOrEqual(coral.r);
      expect(lightened.g).toBeGreaterThan(coral.g);
      expect(lightened.b).toBeGreaterThan(coral.b);
    });

    it('mixes two colors by ratio', () => {
      const black: Color = { r: 0, g: 0, b: 0 };
      const white: Color = { r: 200, g: 200, b: 200 };
      const mid = mixColors(black, white, 0.5);
      expect(mid.r).toBe(100);
      expect(mid.g).toBe(100);
      expect(mid.b).toBe(100);
    });

    it('computes luminance correctly (0 to 1)', () => {
      expect(luminance({ r: 0, g: 0, b: 0 })).toBe(0);
      expect(luminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1.0);
      expect(luminance(coral)).toBeGreaterThan(0.3);
      expect(luminance(coral)).toBeLessThan(0.7);
    });

    it('converts RGB to HSL and back with minimal quantization error', () => {
      const original: Color = { r: 215, g: 165, b: 125 };
      const hsl = rgbToHsl(original);
      expect(hsl.h).toBeGreaterThan(20);
      expect(hsl.h).toBeLessThan(35);
      const reconstructed = hslToRgb(hsl);
      expect(Math.abs(reconstructed.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(reconstructed.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(reconstructed.b - original.b)).toBeLessThanOrEqual(1);
    });

    it('derives perceptual skin shadow approximately 24% darker without unnatural hue shift', () => {
      const base: Color = { r: 215, g: 165, b: 125 };
      const shadow = derivePerceptualSkinShadow(base, 0.24);
      expect(luminance(shadow)).toBeLessThan(luminance(base));
      const ratio = luminance(shadow) / luminance(base);
      expect(ratio).toBeGreaterThan(0.70);
      expect(ratio).toBeLessThan(0.82);
      const baseHsl = rgbToHsl(base);
      const shadowHsl = rgbToHsl(shadow);
      expect(Math.abs(baseHsl.h - shadowHsl.h)).toBeLessThan(1.5);
    });

    it('derives perceptual skin highlight distinctly lighter without unnatural hue shift', () => {
      const base: Color = { r: 215, g: 165, b: 125 };
      const hl = derivePerceptualSkinHighlight(base, 0.14);
      expect(luminance(hl)).toBeGreaterThan(luminance(base));
      const baseHsl = rgbToHsl(base);
      const hlHsl = rgbToHsl(hl);
      expect(Math.abs(baseHsl.h - hlHsl.h)).toBeLessThan(1.5);
    });
  });
});
