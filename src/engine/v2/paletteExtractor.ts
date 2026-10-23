/**
 * CodeMyFace Engine V2 — Phase 4: Image-Informed Palette Extractor
 *
 * Implements Part A:
 * - Samples representative colors for skin, hair, iris, eyebrows, lips, clothing, background
 * - Operates in perceptual OKLab color space for artifact-free averaging
 * - Uses semantic segmentation masks to avoid contaminated boundary pixels
 * - Derives harmonious shadows and highlights with warmth preservation
 * - Supports controlled, non-clipping beautification with neutral defaults
 */

import { Color, Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { V2Palette, ColorWithHex, BeautificationSettings } from './phase4Types';
import {
  rgbToOklab,
  oklabToRgb,
  colorToHex,
  deriveOklabSkinShadow,
  deriveOklabSkinHighlight,
  deriveOklabHairShadow,
  deriveOklabHairHighlight,
  applyControlledBeautification,
} from './oklab';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Samples a pixel from ImageData with bounds safety
 */
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

/**
 * Computes the robust average of a list of colors in OKLab space,
 * trimming the top and bottom 15% lightness outliers to reject specular glints and deep crevices.
 */
function robustOklabMean(colors: Color[], fallback: Color): Color {
  if (colors.length === 0) return fallback;
  if (colors.length <= 2) {
    const oklabs = colors.map(rgbToOklab);
    const meanL = oklabs.reduce((s, c) => s + c.L, 0) / oklabs.length;
    const meanA = oklabs.reduce((s, c) => s + c.a, 0) / oklabs.length;
    const meanB = oklabs.reduce((s, c) => s + c.b, 0) / oklabs.length;
    return oklabToRgb({ L: meanL, a: meanA, b: meanB });
  }

  // Sort by OKLab Lightness L
  const sorted = colors.map(rgbToOklab).sort((a, b) => a.L - b.L);
  const trimCount = Math.max(1, Math.floor(sorted.length * 0.15));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  const active = trimmed.length > 0 ? trimmed : sorted;

  const meanL = active.reduce((s, c) => s + c.L, 0) / active.length;
  const meanA = active.reduce((s, c) => s + c.a, 0) / active.length;
  const meanB = active.reduce((s, c) => s + c.b, 0) / active.length;

  return oklabToRgb({ L: meanL, a: meanA, b: meanB });
}

function samplePoints(imgData: ImageData | null, points: Vec2[], fallback: Color): Color {
  if (!imgData || points.length === 0) return fallback;
  const colors = points.map(p => getPixel(imgData, p.x, p.y));
  return robustOklabMean(colors, fallback);
}

function sampleGrid(
  imgData: ImageData | null,
  center: Vec2,
  radius: number,
  samplesPerAxis: number,
  fallback: Color
): Color {
  if (!imgData) return fallback;
  const points: Vec2[] = [];
  const step = (radius * 2) / Math.max(1, samplesPerAxis - 1);
  for (let dy = -radius; dy <= radius; dy += step) {
    for (let dx = -radius; dx <= radius; dx += step) {
      if (Math.hypot(dx, dy) <= radius) {
        points.push({ x: center.x + dx, y: center.y + dy });
      }
    }
  }
  return samplePoints(imgData, points, fallback);
}

export function extractV2Palette(
  normCanvas: HTMLCanvasElement | null,
  analysis: FacialAnalysisResultV2,
  beautification: BeautificationSettings = { brightnessBoost: 0, warmth: 0, vibrance: 1.0 }
): V2Palette {
  let imgData: ImageData | null = null;
  if (normCanvas) {
    try {
      const ctx = normCanvas.getContext('2d');
      if (ctx) imgData = ctx.getImageData(0, 0, normCanvas.width, normCanvas.height);
    } catch (_) {
      imgData = null;
    }
  }

  const lm = analysis.landmarks!;

  // 1. SKIN BASE COLOR
  // Sample multiple clean, non-occluded anatomical facial regions:
  // - Upper forehead (between temples and mid-forehead)
  // - Left & right cheekbones
  // - Supratip nasal dorsum
  const foreheadCenter = { x: 500, y: Math.max(220, lm.forehead.top.y + 15) };
  const leftCheekbone = { x: (lm.forehead.templeLeft.x + lm.nose.tip.x) / 2 - 15, y: lm.leftEye.pupil.y + 35 };
  const rightCheekbone = { x: (lm.forehead.templeRight.x + lm.nose.tip.x) / 2 + 15, y: lm.rightEye.pupil.y + 35 };
  const noseBridgeSample = { x: 500, y: (lm.nose.nasion.y + lm.nose.tip.y) / 2 };

  const skinSamples: Vec2[] = [];
  const addGrid = (c: Vec2, r: number) => {
    for (let dy = -r; dy <= r; dy += 6) {
      for (let dx = -r; dx <= r; dx += 6) {
        if (Math.hypot(dx, dy) <= r) skinSamples.push({ x: c.x + dx, y: c.y + dy });
      }
    }
  };
  addGrid(foreheadCenter, 22);
  addGrid(leftCheekbone, 18);
  addGrid(rightCheekbone, 18);
  addGrid(noseBridgeSample, 12);

  const rawSkinBase = samplePoints(imgData, skinSamples, { r: 215, g: 172, b: 150 });
  const skinBase = applyControlledBeautification(rawSkinBase, beautification);
  const skinShadow = deriveOklabSkinShadow(skinBase, 0.22);
  const skinHighlight = deriveOklabSkinHighlight(skinBase, 0.12);

  // 2. HAIR PALETTE
  // Prefer pixels verified by segmentation mask (Class 1: Hair), supplemented by temporal/cranial hair roots
  const seg = analysis.segmentation;
  const hairSamples: Vec2[] = [];

  if (seg?.rawMask && seg.maskWidth > 0 && seg.maskHeight > 0 && analysis.transform) {
    const step = Math.max(2, Math.floor(seg.maskWidth / 35));
    for (let my = 0; my < seg.maskHeight; my += step) {
      for (let mx = 0; mx < seg.maskWidth; mx += step) {
        if (seg.rawMask[my * seg.maskWidth + mx] === 1) {
          const normX = mx / seg.maskWidth;
          const normY = my / seg.maskHeight;
          const canon = analysis.transform.normalizedSourceToCanonical({ x: normX, y: normY });
          if (canon.x >= 150 && canon.x <= 850 && canon.y >= 30 && canon.y <= 950) {
            hairSamples.push(canon);
          }
        }
      }
    }
  }

  // If few or no mask hair pixels found, sample temporal hairline roots and paramedian crown points
  if (hairSamples.length < 8) {
    const templeLeft = lm.forehead.templeLeft;
    const templeRight = lm.forehead.templeRight;
    const foreheadTop = lm.forehead.top;
    hairSamples.push(
      { x: templeLeft.x - 20, y: templeLeft.y },
      { x: templeLeft.x - 35, y: templeLeft.y + 20 },
      { x: templeRight.x + 20, y: templeRight.y },
      { x: templeRight.x + 35, y: templeRight.y + 20 },
      { x: 500, y: Math.max(30, foreheadTop.y - 45) },
      { x: 460, y: Math.max(30, foreheadTop.y - 40) },
      { x: 540, y: Math.max(30, foreheadTop.y - 40) }
    );
  }

  // Filter out any samples that land on background wall (lightness > 0.68)
  const validHairSamples = hairSamples.filter(p => {
    if (!imgData) return true;
    const px = getPixel(imgData, p.x, p.y);
    const lab = rgbToOklab(px);
    return lab.L < 0.68;
  });
  const activeHairSamples = validHairSamples.length >= 4 ? validHairSamples : hairSamples;
  const rawHairBase = samplePoints(imgData, activeHairSamples, { r: 34, g: 30, b: 30 });
  const hairBase = applyControlledBeautification(rawHairBase, {
    brightnessBoost: beautification.brightnessBoost * 0.5,
  });
  const hairShadow = deriveOklabHairShadow(hairBase);
  const hairHighlight = deriveOklabHairHighlight(hairBase);

  // 3. IRIS COLOR
  // Sample strictly inside the pupil/iris radius
  const leftIrisSample = sampleGrid(imgData, lm.leftEye.pupil, lm.leftEye.irisRadius * 0.55, 5, { r: 60, g: 45, b: 35 });
  const rightIrisSample = sampleGrid(imgData, lm.rightEye.pupil, lm.rightEye.irisRadius * 0.55, 5, { r: 60, g: 45, b: 35 });
  const iris = robustOklabMean([leftIrisSample, rightIrisSample], { r: 60, g: 45, b: 35 });

  // 4. EYEBROWS COLOR
  const leftBrowColor = samplePoints(imgData, lm.leftEyebrow.contour.points, { r: 42, g: 34, b: 34 });
  const rightBrowColor = samplePoints(imgData, lm.rightEyebrow.contour.points, { r: 42, g: 34, b: 34 });
  const eyebrows = robustOklabMean([leftBrowColor, rightBrowColor], { r: 42, g: 34, b: 34 });

  // 5. LIPS COLOR
  const lipSamples = [
    ...lm.mouth.upperLipOuter.points,
    ...lm.mouth.lowerLipOuter.points,
  ];
  const lips = samplePoints(imgData, lipSamples, { r: 195, g: 118, b: 110 });

  // 6. NOSTRIL SHADOW
  const nostrilShadow = deriveOklabSkinShadow(skinShadow, 0.28);

  // 7. CLOTHING COLOR
  // Sample in lower canvas below neck
  const clothingSamples: Vec2[] = [];
  for (let y = 880; y <= 980; y += 15) {
    for (let x = 200; x <= 800; x += 30) {
      clothingSamples.push({ x, y });
    }
  }
  const clothing = samplePoints(imgData, clothingSamples, { r: 180, g: 190, b: 205 });

  // 8. BACKGROUND COLOR
  // Sample upper corners (clear of face and hair)
  const bgSamples: Vec2[] = [
    { x: 50, y: 50 }, { x: 80, y: 50 }, { x: 50, y: 80 },
    { x: 920, y: 50 }, { x: 950, y: 50 }, { x: 950, y: 80 },
  ];
  const background = samplePoints(imgData, bgSamples, { r: 248, g: 250, b: 252 });

  const toObj = (c: Color): ColorWithHex => ({
    color: c,
    hex: colorToHex(c),
    lab: rgbToOklab(c),
  });

  return {
    skinBase: toObj(skinBase),
    skinShadow: toObj(skinShadow),
    skinHighlight: toObj(skinHighlight),
    hairBase: toObj(hairBase),
    hairShadow: toObj(hairShadow),
    hairHighlight: toObj(hairHighlight),
    iris: toObj(iris),
    eyebrows: toObj(eyebrows),
    lips: toObj(lips),
    nostrilShadow: toObj(nostrilShadow),
    clothing: toObj(clothing),
    background: toObj(background),
  };
}
