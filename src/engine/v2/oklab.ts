/**
 * CodeMyFace Engine V2 — Phase 4: OKLab Perceptual Color Space
 *
 * Implements:
 * - High-precision conversions between sRGB, Linear RGB, and OKLab color space
 * - Perceptual skin shadow and highlight derivation preserving natural chroma and warmth
 * - Perceptual hair shadow and highlight derivation
 * - Controlled, non-clipping palette beautification (brightness, warmth, vibrance)
 * - Perceptual color distance (Delta E OKLab)
 */

import { Color } from '../../types/portrait';

export interface OklabColor {
  L: number; // Lightness [0, 1]
  a: number; // Green (-) to Red (+) [-0.4, 0.4]
  b: number; // Blue (-) to Yellow (+) [-0.4, 0.4]
}

export interface BeautificationParams {
  /** Lightness adjustment [-0.2, 0.2], default 0 */
  brightnessBoost?: number;
  /** Warmth adjustment (shifts b towards yellow) [-0.1, 0.1], default 0 */
  warmth?: number;
  /** Chroma/vibrance adjustment factor [0.8, 1.3], default 1.0 */
  vibrance?: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Converts 8-bit sRGB channel [0-255] to linear channel [0-1] */
export function sRgbToLinear(c: number): number {
  const v = clamp(c / 255, 0, 1);
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Converts linear channel [0-1] to 8-bit sRGB channel [0-255] */
export function linearToSRgb(c: number): number {
  const v = clamp(c, 0, 1);
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1.0 / 2.4) - 0.055;
  return clamp(Math.round(s * 255), 0, 255);
}

/**
 * Converts an sRGB Color to OKLab
 */
export function rgbToOklab(c: Color): OklabColor {
  const r = sRgbToLinear(c.r);
  const g = sRgbToLinear(c.g);
  const b = sRgbToLinear(c.b);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
  };
}

/**
 * Converts an OKLab Color back to sRGB Color
 */
export function oklabToRgb(lab: OklabColor): Color {
  const L = clamp(lab.L, 0, 1);
  const a = lab.a;
  const b = lab.b;

  const l = L + 0.3963377774 * a + 0.2158037573 * b;
  const m = L - 0.1055613458 * a - 0.0638541728 * b;
  const s = L - 0.0894841775 * a - 1.2914855480 * b;

  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;

  const r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const bl = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  return {
    r: linearToSRgb(r),
    g: linearToSRgb(g),
    b: linearToSRgb(bl),
  };
}

export function colorToHex(c: Color): string {
  const toH = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toH(c.r)}${toH(c.g)}${toH(c.b)}`;
}

export function hexToColor(hex: string): Color {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return {
      r: parseInt(clean[0] + clean[0], 16) || 0,
      g: parseInt(clean[1] + clean[1], 16) || 0,
      b: parseInt(clean[2] + clean[2], 16) || 0,
    };
  }
  return {
    r: parseInt(clean.substring(0, 2), 16) || 0,
    g: parseInt(clean.substring(2, 4), 16) || 0,
    b: parseInt(clean.substring(4, 6), 16) || 0,
  };
}

/**
 * Derives natural skin shadow in OKLab color space.
 * Decreases Lightness by `ratio` (default ~22%) while subtly increasing warm chroma
 * so facial shadows stay warm, rich, and never turn ashen or muddy.
 */
export function deriveOklabSkinShadow(base: Color, ratio: number = 0.22): Color {
  const lab = rgbToOklab(base);
  const targetL = Math.max(0.08, lab.L * (1 - clamp(ratio, 0.05, 0.6)));
  // Subtle chroma boost to prevent graying in shadows
  const chroma = Math.hypot(lab.a, lab.b);
  const boostedChroma = Math.min(0.25, chroma * 1.05);
  const angle = Math.atan2(lab.b, lab.a);

  return oklabToRgb({
    L: targetL,
    a: Math.cos(angle) * boostedChroma,
    b: Math.sin(angle) * boostedChroma,
  });
}

/**
 * Derives natural skin highlight in OKLab color space.
 * Increases Lightness by `ratio` (default ~12%) while gently softening chroma.
 */
export function deriveOklabSkinHighlight(base: Color, ratio: number = 0.12): Color {
  const lab = rgbToOklab(base);
  const targetL = Math.min(0.96, lab.L + (1 - lab.L) * clamp(ratio, 0.05, 0.5));
  // Soften chroma slightly for natural diffuse highlight
  const chroma = Math.hypot(lab.a, lab.b);
  const softenedChroma = chroma * 0.92;
  const angle = Math.atan2(lab.b, lab.a);

  return oklabToRgb({
    L: targetL,
    a: Math.cos(angle) * softenedChroma,
    b: Math.sin(angle) * softenedChroma,
  });
}

/**
 * Derives hair shadow in OKLab space
 */
export function deriveOklabHairShadow(base: Color): Color {
  const lab = rgbToOklab(base);
  const targetL = Math.max(0.04, lab.L * 0.65);
  return oklabToRgb({
    L: targetL,
    a: lab.a * 0.9,
    b: lab.b * 0.9,
  });
}

/**
 * Derives subtle hair highlight in OKLab space
 */
export function deriveOklabHairHighlight(base: Color): Color {
  const lab = rgbToOklab(base);
  const targetL = Math.min(0.85, lab.L * 1.35 + 0.05);
  return oklabToRgb({
    L: targetL,
    a: lab.a * 1.05,
    b: lab.b * 1.05,
  });
}

/**
 * Controlled beautification in OKLab space:
 * Shifts lightness, warmth, and vibrance without altering face geometry or clipping.
 */
export function applyControlledBeautification(
  c: Color,
  params: BeautificationParams = {}
): Color {
  const boost = params.brightnessBoost ?? 0;
  const warmth = params.warmth ?? 0;
  const vibrance = params.vibrance ?? 1.0;

  if (boost === 0 && warmth === 0 && vibrance === 1.0) {
    return c;
  }

  const lab = rgbToOklab(c);

  // Apply brightness boost smoothly
  const newL = clamp(lab.L + boost * (1 - lab.L * 0.5), 0.05, 0.98);

  // Apply vibrance (scale chroma)
  const chroma = Math.hypot(lab.a, lab.b);
  const newChroma = clamp(chroma * vibrance, 0, 0.35);
  const angle = Math.atan2(lab.b, lab.a);

  let newA = Math.cos(angle) * newChroma;
  let newB = Math.sin(angle) * newChroma;

  // Apply warmth (subtle yellow shift)
  newB = clamp(newB + warmth * 0.04, -0.4, 0.4);

  return oklabToRgb({
    L: newL,
    a: newA,
    b: newB,
  });
}

/**
 * Perceptual color difference (Delta E OKLab)
 */
export function deltaEOklab(a: Color, b: Color): number {
  const labA = rgbToOklab(a);
  const labB = rgbToOklab(b);
  const dL = labB.L - labA.L;
  const da = labB.a - labA.a;
  const db = labB.b - labA.b;
  return Math.hypot(dL, da, db);
}
