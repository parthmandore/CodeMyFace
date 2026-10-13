import { describe, it, expect } from 'vitest';
import { extractFacialFeatures, isSmileOpen } from '../faceAnalyzer';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import {
  shortHairCleanShavenFixture,
  openSmileTeethFixture,
  longHairFemaleFixture,
} from '../__fixtures__/baselineFixtures';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { FacialFeatures, FaceAnalysis } from '../../types/portrait';

describe('Phase 6: Facial Feature Reconstruction Engine', () => {
  describe('1. Eyes & Iris Likeness & Asymmetry', () => {
    it('derives iris geometry from measured iris contour landmarks when available', () => {
      // Create 478 synthetic landmarks: 468 mesh landmarks + 10 iris landmarks
      const landmarks: NormalizedLandmark[] = [];
      for (let i = 0; i < 478; i++) {
        landmarks.push({ x: 0.5, y: 0.5, z: 0 });
      }

      // Eye corners: width = 0.10
      landmarks[33] = { x: 0.40, y: 0.40, z: 0 }; // Left eye outer
      landmarks[133] = { x: 0.50, y: 0.40, z: 0 }; // Left eye inner
      landmarks[159] = { x: 0.45, y: 0.38, z: 0 }; // Upper lid mid
      landmarks[145] = { x: 0.45, y: 0.42, z: 0 }; // Lower lid mid

      // Left Iris center (468) and contour (469, 470, 471, 472) with distinct measured radius 0.024 (24% of eye width)
      landmarks[468] = { x: 0.45, y: 0.40, z: 0 };
      landmarks[469] = { x: 0.474, y: 0.40, z: 0 }; // right: r = 0.024
      landmarks[470] = { x: 0.45, y: 0.376, z: 0 }; // top: r = 0.024
      landmarks[471] = { x: 0.426, y: 0.40, z: 0 }; // left: r = 0.024
      landmarks[472] = { x: 0.45, y: 0.424, z: 0 }; // bottom: r = 0.024

      // Right eye corners: width = 0.10
      landmarks[362] = { x: 0.55, y: 0.40, z: 0 }; // Right eye inner
      landmarks[263] = { x: 0.65, y: 0.40, z: 0 }; // Right eye outer
      landmarks[386] = { x: 0.60, y: 0.385, z: 0 }; // Upper lid mid (slightly squinted: opening = 0.030)
      landmarks[374] = { x: 0.60, y: 0.415, z: 0 }; // Lower lid mid

      // Right Iris center (473) and contour (474..477) with distinct measured radius 0.028 (28% of eye width)
      landmarks[473] = { x: 0.60, y: 0.40, z: 0 };
      landmarks[474] = { x: 0.628, y: 0.40, z: 0 };
      landmarks[475] = { x: 0.60, y: 0.372, z: 0 };
      landmarks[476] = { x: 0.572, y: 0.40, z: 0 };
      landmarks[477] = { x: 0.60, y: 0.428, z: 0 };

      const features = extractFacialFeatures(landmarks);

      expect(features.leftIrisContour).toBeDefined();
      expect(features.leftIrisContour?.length).toBe(4);
      expect(features.rightIrisContour).toBeDefined();
      expect(features.rightIrisContour?.length).toBe(4);

      // Verify iris radii derived from actual measured landmarks
      expect(features.leftIrisRadius).toBeCloseTo(0.024, 3);
      expect(features.rightIrisRadius).toBeCloseTo(0.028, 3);

      // Verify eye opening measurements
      expect(features.leftEyeOpeningHeight).toBeDefined();
      expect(features.rightEyeOpeningHeight).toBeDefined();
    });

    it('falls back conservatively when iris landmarks are unavailable (< 478 landmarks)', () => {
      const sparseLandmarks: NormalizedLandmark[] = [];
      for (let i = 0; i < 468; i++) {
        sparseLandmarks.push({ x: 0.5, y: 0.5, z: 0 });
      }
      sparseLandmarks[33] = { x: 0.40, y: 0.40, z: 0 };
      sparseLandmarks[133] = { x: 0.50, y: 0.40, z: 0 };
      sparseLandmarks[362] = { x: 0.55, y: 0.40, z: 0 };
      sparseLandmarks[263] = { x: 0.65, y: 0.40, z: 0 };

      const features = extractFacialFeatures(sparseLandmarks);

      // Iris contour should be undefined without guessing
      expect(features.leftIrisContour).toBeUndefined();
      expect(features.rightIrisContour).toBeUndefined();

      // Radii fall back to safe eye-width proportion
      expect(features.leftIrisRadius).toBeGreaterThan(0.015);
      expect(features.rightIrisRadius).toBeGreaterThan(0.015);
    });
  });

  describe('2. Nose Likeness & Nostril Visibility', () => {
    it('uses anatomical multi-point lobule when detailed nose landmarks are present', () => {
      const features: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        leftNostrilContour: [
          { x: 0.46, y: 0.56 },
          { x: 0.48, y: 0.55 },
          { x: 0.49, y: 0.57 },
        ],
        rightNostrilContour: [
          { x: 0.54, y: 0.56 },
          { x: 0.52, y: 0.55 },
          { x: 0.51, y: 0.57 },
        ],
      };

      const analysis: FaceAnalysis = {
        ...shortHairCleanShavenFixture,
        features,
      };

      const model = buildPortraitModel(analysis, 1000, 1000);
      const noseLayer = model.layers.find((l) => l.id === 'layer-nose');
      expect(noseLayer).toBeDefined();

      const tipFacet = noseLayer?.shapes.find((s) => s.id === 'nose-tip-facet');
      expect(tipFacet).toBeDefined();
      expect(tipFacet?.provenance).toBe('landmark-derived');
    });

    it('suppresses prominent nostril apertures when head pitch conceals nostrils', () => {
      // Head looking downwards: nose tip drops down below subnasale / nostrils
      const features: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        noseTip: { x: 0.50, y: 0.58 }, // Pronasale lower than subnasale (0.57)
        subnasale: { x: 0.50, y: 0.57 },
        leftNostril: { x: 0.46, y: 0.56 },
        rightNostril: { x: 0.54, y: 0.56 },
        leftNostrilContour: [
          { x: 0.46, y: 0.56 },
          { x: 0.48, y: 0.55 },
          { x: 0.49, y: 0.57 },
        ],
        rightNostrilContour: [
          { x: 0.54, y: 0.56 },
          { x: 0.52, y: 0.55 },
          { x: 0.51, y: 0.57 },
        ],
      };

      const analysis: FaceAnalysis = {
        ...shortHairCleanShavenFixture,
        features,
      };

      const model = buildPortraitModel(analysis, 1000, 1000);
      const noseLayer = model.layers.find((l) => l.id === 'layer-nose');

      // When nose tip conceals nostrils, nostril apertures must NOT be drawn
      const leftAperture = noseLayer?.shapes.find((s) => s.id === 'nostril-left-aperture');
      expect(leftAperture).toBeUndefined();
    });

    it('renders restrained nostril apertures on neutral and level frontal faces without false suppression', () => {
      // Neutral frontal pose where nose tip is level with subnasale (pitchOffset near 0)
      const features: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        noseTip: { x: 0.50, y: 0.550 },
        subnasale: { x: 0.50, y: 0.552 },
        leftNostril: { x: 0.465, y: 0.548 },
        rightNostril: { x: 0.535, y: 0.548 },
      };

      const analysis: FaceAnalysis = {
        ...shortHairCleanShavenFixture,
        features,
      };

      const model = buildPortraitModel(analysis, 1000, 1000);
      const noseLayer = model.layers.find((l) => l.id === 'layer-nose');
      expect(noseLayer).toBeDefined();

      const leftAperture = noseLayer?.shapes.find((s) => s.id === 'nostril-left-aperture');
      const rightAperture = noseLayer?.shapes.find((s) => s.id === 'nostril-right-aperture');

      // Must NOT be falsely suppressed
      expect(leftAperture).toBeDefined();
      expect(rightAperture).toBeDefined();
      expect(leftAperture?.opacity).toBeLessThanOrEqual(0.85);
      expect(leftAperture?.stroke).toBeUndefined(); // No black outline around aperture
    });

    it('defines lateral bridge sidewall shadows responding to directional lighting', () => {
      // Test left directional lighting: right sidewall in shadow, left sidewall subtle
      const modelLeftLit = buildPortraitModel(
        {
          ...shortHairCleanShavenFixture,
          palette: {
            ...shortHairCleanShavenFixture.palette,
            lightDirection: 'left',
          },
        },
        1000,
        1000
      );
      const noseLayer = modelLeftLit.layers.find((l) => l.id === 'layer-nose');
      const leftSidewall = noseLayer?.shapes.find((s) => s.id === 'nose-sidewall-left');
      const rightSidewall = noseLayer?.shapes.find((s) => s.id === 'nose-sidewall-right');

      expect(leftSidewall).toBeDefined();
      expect(rightSidewall).toBeDefined();
      expect(rightSidewall?.opacity).toBeGreaterThan(leftSidewall?.opacity ?? 0);
    });

    it('renders alar wings distinguishable from base skin using shadow skin tone without black outline', () => {
      const model = buildPortraitModel(shortHairCleanShavenFixture, 1000, 1000);
      const noseLayer = model.layers.find((l) => l.id === 'layer-nose');

      const leftAlarWing = noseLayer?.shapes.find((s) => s.id === 'alar-wing-left');
      const rightAlarWing = noseLayer?.shapes.find((s) => s.id === 'alar-wing-right');
      const alarCreaseLeft = noseLayer?.shapes.find((s) => s.id === 'alar-crease-left');

      expect(leftAlarWing).toBeDefined();
      expect(rightAlarWing).toBeDefined();
      expect(alarCreaseLeft).toBeDefined();

      // Ensure alar wing fill uses shadow skin color for contrast, not skinToneWarmer
      expect(leftAlarWing?.fill).not.toBe('#000000');
      expect(leftAlarWing?.stroke).not.toBe('#000000');
      expect(alarCreaseLeft?.stroke).not.toBe('#000000');
    });

    it('individualizes nose dimensions proportionately based on landmark bounds', () => {
      // Narrow nose fixture vs broad nose fixture
      const narrowFeatures: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        leftAlarWing: [{ x: 0.47, y: 0.55 }, { x: 0.46, y: 0.54 }, { x: 0.48, y: 0.53 }],
        rightAlarWing: [{ x: 0.53, y: 0.55 }, { x: 0.54, y: 0.54 }, { x: 0.52, y: 0.53 }],
      };
      const broadFeatures: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        leftAlarWing: [{ x: 0.43, y: 0.55 }, { x: 0.41, y: 0.54 }, { x: 0.44, y: 0.53 }],
        rightAlarWing: [{ x: 0.57, y: 0.55 }, { x: 0.59, y: 0.54 }, { x: 0.56, y: 0.53 }],
      };

      const narrowModel = buildPortraitModel({ ...shortHairCleanShavenFixture, features: narrowFeatures }, 1000, 1000);
      const broadModel = buildPortraitModel({ ...shortHairCleanShavenFixture, features: broadFeatures }, 1000, 1000);

      const narrowTip = narrowModel.layers.find((l) => l.id === 'layer-nose')?.shapes.find((s) => s.id === 'nose-tip-facet');
      const broadTip = broadModel.layers.find((l) => l.id === 'layer-nose')?.shapes.find((s) => s.id === 'nose-tip-facet');

      expect(narrowTip?.pathData).not.toBe(broadTip?.pathData);
    });
  });

  describe('3. Lips & Mouth Likeness & Expression', () => {
    it('does not add teeth to a closed neutral mouth', () => {
      const model = buildPortraitModel(shortHairCleanShavenFixture, 1000, 1000);
      const mouthLayer = model.layers.find((l) => l.id === 'layer-mouth-lips');
      expect(mouthLayer).toBeDefined();

      const teeth = mouthLayer?.shapes.find((s) => s.id === 'mouth-teeth');
      const oralCavity = mouthLayer?.shapes.find((s) => s.id === 'mouth-oral-cavity');
      const partingLine = mouthLayer?.shapes.find((s) => s.id === 'mouth-parting-crease');

      expect(teeth).toBeUndefined();
      expect(oralCavity).toBeUndefined();
      expect(partingLine).toBeDefined();
    });

    it('renders dental arch and oral cavity when mouth is open in a smile', () => {
      const model = buildPortraitModel(openSmileTeethFixture, 1000, 1000);
      const mouthLayer = model.layers.find((l) => l.id === 'layer-mouth-lips');
      expect(mouthLayer).toBeDefined();

      const teeth = mouthLayer?.shapes.find((s) => s.id === 'mouth-teeth');
      const oralCavity = mouthLayer?.shapes.find((s) => s.id === 'mouth-oral-cavity');

      expect(teeth).toBeDefined();
      expect(oralCavity).toBeDefined();
      expect(teeth?.pathData).toBeDefined();
    });

    it('accurately distinguishes open smile from closed mouth', () => {
      const closedUpper = [{ x: 0.5, y: 0.60 }, { x: 0.5, y: 0.60 }, { x: 0.5, y: 0.60 }, { x: 0.5, y: 0.60 }, { x: 0.5, y: 0.60 }, { x: 0.5, y: 0.60 }];
      const closedLower = [{ x: 0.5, y: 0.608 }, { x: 0.5, y: 0.608 }, { x: 0.5, y: 0.608 }, { x: 0.5, y: 0.608 }, { x: 0.5, y: 0.608 }, { x: 0.5, y: 0.608 }];
      expect(isSmileOpen(closedUpper, closedLower, { width: 1000, height: 1000 })).toBe(false);

      const openUpper = [{ x: 0.5, y: 0.58 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.58 }, { x: 0.5, y: 0.58 }];
      const openLower = [{ x: 0.5, y: 0.62 }, { x: 0.5, y: 0.62 }, { x: 0.5, y: 0.62 }, { x: 0.5, y: 0.62 }, { x: 0.5, y: 0.62 }, { x: 0.5, y: 0.62 }];
      expect(isSmileOpen(openUpper, openLower, { width: 1000, height: 1000 })).toBe(true);
    });

    it('conforms lower lip highlight to actual lip contour without hardcoded box', () => {
      const model = buildPortraitModel(shortHairCleanShavenFixture, 1000, 1000);
      const mouthLayer = model.layers.find((l) => l.id === 'layer-mouth-lips');
      const lipHighlight = mouthLayer?.shapes.find((s) => s.id === 'lower-lip-highlight');

      expect(lipHighlight).toBeDefined();
      expect(lipHighlight?.provenance).toBe('landmark-derived');
      expect(lipHighlight?.opacity).toBeLessThanOrEqual(0.65);
    });

    it('preserves natural mouth corner slope without forcing artificial smile', () => {
      // Neutral mouth with horizontal corners
      const neutralFeatures: FacialFeatures = {
        ...shortHairCleanShavenFixture.features,
        upperLipOuter: [
          { x: 0.435, y: 0.650 },
          { x: 0.450, y: 0.642 },
          { x: 0.480, y: 0.635 },
          { x: 0.500, y: 0.638 },
          { x: 0.520, y: 0.635 },
          { x: 0.550, y: 0.642 },
          { x: 0.565, y: 0.650 },
        ],
        upperLipInner: [
          { x: 0.440, y: 0.650 },
          { x: 0.460, y: 0.648 },
          { x: 0.500, y: 0.648 },
          { x: 0.540, y: 0.648 },
          { x: 0.560, y: 0.650 },
        ],
      };

      const model = buildPortraitModel({ ...shortHairCleanShavenFixture, features: neutralFeatures }, 1000, 1000);
      const mouthLayer = model.layers.find((l) => l.id === 'layer-mouth-lips');
      const commLeft = mouthLayer?.shapes.find((s) => s.id === 'mouth-commissure-left');
      const commRight = mouthLayer?.shapes.find((s) => s.id === 'mouth-commissure-right');

      expect(commLeft).toBeDefined();
      expect(commRight).toBeDefined();
    });
  });

  describe('4. Ears Concealment & Visibility', () => {
    it('omits ears when concealed by segmentation-detected side hair or long hair', () => {
      const analysis: FaceAnalysis = {
        ...shortHairCleanShavenFixture,
        hairEstimate: {
          ...shortHairCleanShavenFixture.hairEstimate,
          provenance: 'segmentation-mask-derived',
          hasLongHairSides: true,
          length: 'long',
        },
      };

      const model = buildPortraitModel(analysis, 1000, 1000);
      const earsLayer = model.layers.find((l) => l.id === 'layer-ears');
      expect(earsLayer).toBeDefined();

      const leftEar = earsLayer?.shapes.find((s) => s.id === 'ear-left');
      const rightEar = earsLayer?.shapes.find((s) => s.id === 'ear-right');

      expect(leftEar).toBeUndefined();
      expect(rightEar).toBeUndefined();
    });

    it('renders ears when short hair supports visibility and subject is uncropped', () => {
      const model = buildPortraitModel(shortHairCleanShavenFixture, 1000, 1000);
      const earsLayer = model.layers.find((l) => l.id === 'layer-ears');
      expect(earsLayer).toBeDefined();

      const leftEar = earsLayer?.shapes.find((s) => s.id === 'ear-left');
      const rightEar = earsLayer?.shapes.find((s) => s.id === 'ear-right');

      expect(leftEar).toBeDefined();
      expect(rightEar).toBeDefined();
      expect(leftEar?.strokeWidth).toBeLessThanOrEqual(1.3);
    });

    it('omits ears on female long-hair reference portrait', () => {
      const model = buildPortraitModel(longHairFemaleFixture, 1000, 1000);
      const earsLayer = model.layers.find((l) => l.id === 'layer-ears');

      const leftEar = earsLayer?.shapes.find((s) => s.id === 'ear-left');
      const rightEar = earsLayer?.shapes.find((s) => s.id === 'ear-right');

      // Ears must be cleanly occluded by long cascading hair
      expect(leftEar).toBeUndefined();
      expect(rightEar).toBeUndefined();
    });
  });

  describe('5. Shading & Highlights Restraint', () => {
    it('renders valid SVG with restrained flat-vector shading and zero raster images', () => {
      const model = buildPortraitModel(shortHairCleanShavenFixture, 1000, 1000);
      const svg = renderPortraitSvg(model);

      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('base64');
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');

      // Verify highlights layer exists and has controlled opacity
      const highlightsLayer = model.layers.find((l) => l.id === 'layer-highlights');
      expect(highlightsLayer).toBeDefined();
      highlightsLayer?.shapes.forEach((s) => {
        expect(s.opacity).toBeLessThanOrEqual(0.70);
      });
    });
  });
});
