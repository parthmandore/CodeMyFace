import { describe, it, expect } from 'vitest';
import { Color, Vec2 } from '../../../types/portrait';
import {
  rgbToOklab,
  oklabToRgb,
  deriveOklabSkinShadow,
  deriveOklabSkinHighlight,
  applyControlledBeautification,
  deltaEOklab,
} from '../oklab';
import { extractV2Palette } from '../paletteExtractor';
import { detectFacialHair } from '../facialHairDetector';
import { buildPhase4Portrait } from '../phase4SvgRenderer';
import { FacialAnalysisResultV2 } from '../types';

describe('Engine V2 Phase 4: Color and Vector Styling', () => {
  describe('Part A — OKLab Color Space Transformations', () => {
    it('accurately converts sRGB to OKLab and back with minimal delta', () => {
      const original: Color = { r: 215, g: 160, b: 130 }; // Typical skin tone
      const lab = rgbToOklab(original);
      const roundtrip = oklabToRgb(lab);

      expect(Math.abs(roundtrip.r - original.r)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundtrip.g - original.g)).toBeLessThanOrEqual(1);
      expect(Math.abs(roundtrip.b - original.b)).toBeLessThanOrEqual(1);
      expect(deltaEOklab(original, roundtrip)).toBeLessThan(0.005);
    });

    it('derives warm perceptual skin shadows without muddy graying', () => {
      const skinBase: Color = { r: 210, g: 165, b: 135 };
      const shadow = deriveOklabSkinShadow(skinBase, 0.22);

      // Lightness decreases
      const baseLab = rgbToOklab(skinBase);
      const shadowLab = rgbToOklab(shadow);
      expect(shadowLab.L).toBeLessThan(baseLab.L);

      // Chroma stays warm (positive a and b)
      expect(shadowLab.a).toBeGreaterThan(0.02);
      expect(shadowLab.b).toBeGreaterThan(0.02);

      // Color components valid
      expect(shadow.r).toBeLessThan(skinBase.r);
      expect(shadow.g).toBeLessThan(skinBase.g);
      expect(shadow.b).toBeLessThan(skinBase.b);
    });

    it('derives natural diffuse skin highlights', () => {
      const skinBase: Color = { r: 200, g: 155, b: 125 };
      const highlight = deriveOklabSkinHighlight(skinBase, 0.12);

      const baseLab = rgbToOklab(skinBase);
      const highlightLab = rgbToOklab(highlight);
      expect(highlightLab.L).toBeGreaterThan(baseLab.L);
      expect(highlight.r).toBeGreaterThanOrEqual(skinBase.r);
      expect(highlight.g).toBeGreaterThanOrEqual(skinBase.g);
    });

    it('controlled beautification leaves color unchanged at neutral defaults', () => {
      const color: Color = { r: 180, g: 140, b: 110 };
      const untouched = applyControlledBeautification(color, {
        brightnessBoost: 0,
        warmth: 0,
        vibrance: 1.0,
      });

      expect(untouched.r).toBe(color.r);
      expect(untouched.g).toBe(color.g);
      expect(untouched.b).toBe(color.b);
    });
  });

  // Helper to build realistic mock analysis
  function createMockAnalysis(): FacialAnalysisResultV2 {
    const mockLandmarks: any = {
      totalCount: 478,
      allPoints: Array.from({ length: 478 }, () => ({ x: 500, y: 500 })),
      faceOutline: { name: 'faceOutline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
      jawline: { name: 'jawline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
      leftEye: {
        contour: { name: 'leftEye', points: [{ x: 390, y: 440 }, { x: 450, y: 440 }, { x: 420, y: 450 }], rawPoints: [], indices: [] },
        upperLid: { name: 'leftEyeUpper', points: [{ x: 390, y: 440 }, { x: 420, y: 430 }, { x: 450, y: 440 }], rawPoints: [], indices: [] },
        lowerLid: { name: 'leftEyeLower', points: [{ x: 390, y: 440 }, { x: 420, y: 450 }, { x: 450, y: 440 }], rawPoints: [], indices: [] },
        pupil: { x: 420, y: 440 },
        irisRadius: 14.5,
        fissureWidth: 60,
        fissureHeight: 20,
      },
      rightEye: {
        contour: { name: 'rightEye', points: [{ x: 550, y: 440 }, { x: 610, y: 440 }, { x: 580, y: 450 }], rawPoints: [], indices: [] },
        upperLid: { name: 'rightEyeUpper', points: [{ x: 550, y: 440 }, { x: 580, y: 430 }, { x: 610, y: 440 }], rawPoints: [], indices: [] },
        lowerLid: { name: 'rightEyeLower', points: [{ x: 550, y: 440 }, { x: 580, y: 450 }, { x: 610, y: 440 }], rawPoints: [], indices: [] },
        pupil: { x: 580, y: 440 },
        irisRadius: 14.5,
        fissureWidth: 60,
        fissureHeight: 20,
      },
      leftEyebrow: {
        contour: { name: 'leftEyebrow', points: [{ x: 370, y: 405 }, { x: 415, y: 390 }, { x: 460, y: 410 }], rawPoints: [], indices: [] },
        upper: { name: 'leftEyebrowUpper', points: [{ x: 370, y: 405 }, { x: 415, y: 390 }, { x: 460, y: 410 }], rawPoints: [], indices: [] },
        lower: { name: 'leftEyebrowLower', points: [{ x: 370, y: 415 }, { x: 415, y: 402 }, { x: 460, y: 415 }], rawPoints: [], indices: [] },
        head: { x: 460, y: 410 },
        arch: { x: 415, y: 390 },
        tail: { x: 370, y: 405 },
      },
      rightEyebrow: {
        contour: { name: 'rightEyebrow', points: [{ x: 540, y: 410 }, { x: 585, y: 390 }, { x: 630, y: 405 }], rawPoints: [], indices: [] },
        upper: { name: 'rightEyebrowUpper', points: [{ x: 540, y: 410 }, { x: 585, y: 390 }, { x: 630, y: 405 }], rawPoints: [], indices: [] },
        lower: { name: 'rightEyebrowLower', points: [{ x: 540, y: 415 }, { x: 585, y: 402 }, { x: 630, y: 415 }], rawPoints: [], indices: [] },
        head: { x: 540, y: 410 },
        arch: { x: 585, y: 390 },
        tail: { x: 630, y: 405 },
      },
      nose: {
        bridge: { name: 'noseBridge', points: [{ x: 500, y: 460 }, { x: 500, y: 510 }], rawPoints: [], indices: [] },
        tip: { x: 500, y: 535 },
        subnasale: { x: 500, y: 555 },
        nasion: { x: 500, y: 440 },
        leftWing: { name: 'leftWing', points: [{ x: 470, y: 540 }, { x: 485, y: 550 }], rawPoints: [], indices: [] },
        rightWing: { name: 'rightWing', points: [{ x: 530, y: 540 }, { x: 515, y: 550 }], rawPoints: [], indices: [] },
        leftNostril: { x: 485, y: 548 },
        rightNostril: { x: 515, y: 548 },
        alarWidth: 60,
      },
      mouth: {
        upperLipOuter: { name: 'upperLipOuter', points: [{ x: 440, y: 640 }, { x: 500, y: 630 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
        upperLipInner: { name: 'upperLipInner', points: [{ x: 440, y: 640 }, { x: 500, y: 638 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
        lowerLipOuter: { name: 'lowerLipOuter', points: [{ x: 440, y: 640 }, { x: 500, y: 660 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
        lowerLipInner: { name: 'lowerLipInner', points: [{ x: 440, y: 640 }, { x: 500, y: 642 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
        commissureLeft: { x: 440, y: 640 },
        commissureRight: { x: 560, y: 640 },
        center: { x: 500, y: 640 },
        isSmileOpen: false,
      },
      chin: {
        tip: { x: 500, y: 700 },
        crest: { name: 'crest', points: [{ x: 480, y: 700 }, { x: 520, y: 700 }], rawPoints: [], indices: [] },
        leftMandibularCorner: { x: 380, y: 650 },
        rightMandibularCorner: { x: 620, y: 650 },
      },
      forehead: {
        top: { x: 500, y: 280 },
        templeLeft: { x: 350, y: 380 },
        templeRight: { x: 650, y: 380 },
      },
      ears: {
        leftRoot: { x: 320, y: 470 },
        rightRoot: { x: 680, y: 470 },
        estimatedLeftEar: [{ x: 320, y: 430 }, { x: 290, y: 470 }, { x: 320, y: 510 }],
        estimatedRightEar: [{ x: 680, y: 430 }, { x: 710, y: 470 }, { x: 680, y: 510 }],
      },
    };

    return {
      success: true,
      sourceImage: { dimensions: { width: 1000, height: 1000 }, aspectRatio: 1 },
      transform: {
        scale: 1,
        targetFaceWidth: 300,
        sourceFaceWidthPx: 300,
        faceRollRadians: 0,
        faceRollDegrees: 0,
        matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        inverseMatrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
        sourceFaceBoundsPx: { minX: 350, maxX: 650, minY: 300, maxY: 700, width: 300, height: 400, centerX: 500, centerY: 500 },
        canonicalFaceBounds: { minX: 350, maxX: 650, minY: 300, maxY: 700, width: 300, height: 400, centerX: 500, centerY: 500 },
        sourcePxToCanonical: (p: Vec2) => p,
        canonicalToSourcePx: (p: Vec2) => p,
        normalizedSourceToCanonical: (p: Vec2) => ({ x: p.x * 1000, y: p.y * 1000 }),
        canonicalToNormalizedSource: (p: Vec2) => ({ x: p.x / 1000, y: p.y / 1000 }),
      } as any,
      landmarks: mockLandmarks,
      segmentation: {
        maskWidth: 100,
        maskHeight: 100,
        rawMask: new Uint8Array(100 * 100).fill(1),
        categories: {
          hair: { categoryId: 1, name: 'hair', pixelCount: 2000, ratioOfTotal: 0.20 },
          faceSkin: { categoryId: 3, name: 'faceSkin', pixelCount: 3000, ratioOfTotal: 0.30 },
        } as any,
        investigation: {
          bangsCoveringForehead: false,
          longHairDetected: false,
          hairExtendingBelowEars: false,
          darkClothingMistakenForHairRisk: false,
          facialHairDetected: false,
          glassesDetected: false,
          lowContrastBackgroundRisk: false,
          identifiedWeaknesses: [],
        } as any,
      } as any,
      telemetry: { faceDetectionMs: 10, normalizationMs: 1, segmentationMs: 10, totalMs: 21 },
    };
  }

  describe('Part B — Palette Extraction', () => {
    it('extracts all required palette tones with valid hex values', () => {
      const analysis = createMockAnalysis();
      const palette = extractV2Palette(null, analysis);

      expect(palette.skinBase.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.skinShadow.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.skinHighlight.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.hairBase.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.hairShadow.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.iris.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.eyebrows.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.lips.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.clothing.hex).toMatch(/^#[0-9a-f]{6}$/i);
      expect(palette.background.hex).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('Part D — Evidence-Based Facial Hair Detection', () => {
    it('detects clean-shaven when no contrast exists', () => {
      const analysis = createMockAnalysis();
      const palette = extractV2Palette(null, analysis);
      const res = detectFacialHair(null, analysis, palette.hairBase, 'auto');

      expect(res.detected).toBe(false);
      expect(res.style).toBe('none');
      expect(res.beardPath).toBeNull();
      expect(res.mustachePath).toBeNull();
    });

    it('forces facial hair off when mode is off', () => {
      const analysis = createMockAnalysis();
      const palette = extractV2Palette(null, analysis);
      const res = detectFacialHair(null, analysis, palette.hairBase, 'off');

      expect(res.detected).toBe(false);
      expect(res.mode).toBe('off');
    });

    it('forces facial hair on with sensible anatomical path when mode is on', () => {
      const analysis = createMockAnalysis();
      const palette = extractV2Palette(null, analysis);
      const res = detectFacialHair(null, analysis, palette.hairBase, 'on');

      expect(res.detected).toBe(true);
      expect(res.beardPath).not.toBeNull();
      expect(res.beardPath).toContain('M ');
    });
  });

  describe('Part B & F — Shading Planes and Phase 4 SVG Rendering', () => {
    it('generates broad planar shadows and builds complete styled SVG', () => {
      const analysis = createMockAnalysis();
      const portrait = buildPhase4Portrait('test-portrait', analysis, null);

      expect(portrait.styledSvg).toContain('<svg');
      expect(portrait.styledSvg).toContain('id="face-silhouette"');
      expect(portrait.styledSvg).toContain('id="neck-shadow"');
      expect(portrait.styledSvg).toContain('clip-path="url(#clip-face)"');

      // Unstyled Phase 3 SVG is also preserved for regression and comparison
      expect(portrait.phase3Svg).toContain('<svg');
    });
  });
});
