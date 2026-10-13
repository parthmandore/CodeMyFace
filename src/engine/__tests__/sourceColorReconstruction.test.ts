import { describe, it, expect } from 'vitest';
import { extractPalette } from '../heuristicFeatures';
import { Vec2, Color, FacialFeatures } from '../../types/portrait';
import { ColorSampler } from '../colorSampler';
import { luminance } from '../geometry';
import { shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';

/**
 * Creates a mock sampler returning programmatic colors based on spatial feature zones.
 */
function createMockSampler(
  features: FacialFeatures,
  colorMap: {
    skin: Color;
    hair: Color;
    eye: Color;
    lip: Color;
    eyebrow?: Color;
    chin?: Color;
  }
): ColorSampler {
  return {
    estimateLightingDirection: () => 'frontal',
    sampleRegion: (pt: Vec2) => {
      // 1. Eyes: around leftPupil and rightPupil
      if (
        Math.hypot(pt.x - features.leftPupil.x, pt.y - features.leftPupil.y) < 0.025 ||
        Math.hypot(pt.x - features.rightPupil.x, pt.y - features.rightPupil.y) < 0.025
      ) {
        return colorMap.eye;
      }

      // 2. Eyebrows: around eyebrow centers
      const leftBrowCenter = features.leftEyebrow[Math.floor(features.leftEyebrow.length / 2)];
      const rightBrowCenter = features.rightEyebrow[Math.floor(features.rightEyebrow.length / 2)];
      if (
        (leftBrowCenter && Math.hypot(pt.x - leftBrowCenter.x, pt.y - leftBrowCenter.y) < 0.025) ||
        (rightBrowCenter && Math.hypot(pt.x - rightBrowCenter.x, pt.y - rightBrowCenter.y) < 0.025)
      ) {
        return colorMap.eyebrow ?? colorMap.hair;
      }

      // 3. Lips: around mouth center and lips
      if (
        Math.abs(pt.x - features.mouthCenter.x) < 0.08 &&
        Math.abs(pt.y - features.mouthCenter.y) < 0.06
      ) {
        return colorMap.lip;
      }

      // 4. Chin
      if (Math.hypot(pt.x - features.chinTip.x, pt.y - features.chinTip.y) < 0.03) {
        return colorMap.chin ?? colorMap.skin;
      }

      // 5. Hair: above forehead top or outside temples
      if (
        pt.y < features.foreheadTop.y - 0.01 ||
        pt.x < features.templeLeft.x - 0.02 ||
        pt.x > features.templeRight.x + 0.02
      ) {
        return colorMap.hair;
      }

      // 6. Bare skin zone (nose bridge, medial cheeks, glabella)
      return colorMap.skin;
    },
    samplePixel: (x: number, y: number) => {
      return (createMockSampler(features, colorMap) as any).sampleRegion({ x, y });
    },
    sampleColorCluster: () => {
      const dominant = colorMap.hair;
      return { dominant, secondary: dominant, variance: 0 };
    },
  } as unknown as ColorSampler;
}

describe('Phase 3: Source-Based Colour Reconstruction', () => {
  const features = shortHairCleanShavenFixture.features;

  describe('1. Removal of Destructive Skin Clamping & Accurate Reconstruction', () => {
    it('accurately reconstructs deep melanin skin tone without lightening to ivory', () => {
      const deepSkinColor: Color = { r: 92, g: 58, b: 42 }; // Rich dark brown skin
      const sampler = createMockSampler(features, {
        skin: deepSkinColor,
        hair: { r: 20, g: 18, b: 22 },
        eye: { r: 40, g: 30, b: 24 },
        lip: { r: 110, g: 65, b: 60 },
      });

      const palette = extractPalette(features, sampler);

      // Verify that deep skin is NOT lightened to ivory (#F6DECA) or forced to [240..255]
      expect(palette.skinBase.r).toBeLessThan(120);
      expect(palette.skinBase.g).toBeLessThan(80);
      expect(palette.skinBase.b).toBeLessThan(60);
      expect(luminance(palette.skinBase)).toBeLessThan(0.35);

      // Verify raw sampled skin is retained
      expect(palette.rawSkinBase).toBeDefined();
      expect(palette.rawSkinBase!.r).toBeCloseTo(deepSkinColor.r, -1);
      expect(palette.rawSkinLum).toBeLessThan(0.35);

      // Verify planar tones scale proportionally from skinBase
      expect(luminance(palette.skinHighlight)).toBeGreaterThan(luminance(palette.skinBase));
      expect(luminance(palette.skinShadow)).toBeLessThan(luminance(palette.skinBase));
      expect(luminance(palette.skinShadowDeep)).toBeLessThan(luminance(palette.skinShadow));
      expect(luminance(palette.neckShadow)).toBeLessThan(luminance(palette.skinBase));
    });

    it('preserves warm tan / golden skin tone without forced channel gap clamping', () => {
      const tanSkinColor: Color = { r: 215, g: 165, b: 125 };
      const sampler = createMockSampler(features, {
        skin: tanSkinColor,
        hair: { r: 35, g: 25, b: 20 },
        eye: { r: 55, g: 40, b: 30 },
        lip: { r: 190, g: 110, b: 110 },
      });

      const palette = extractPalette(features, sampler);

      expect(palette.skinBase.r).toBe(tanSkinColor.r);
      expect(palette.skinBase.g).toBe(tanSkinColor.g);
      expect(palette.skinBase.b).toBe(tanSkinColor.b);

      // Must not be forced to ivory (r=246, g=222, b=202)
      expect(palette.skinBase.r).not.toBe(246);
    });

    it('preserves olive skin undertones without forced channel redistribution', () => {
      const oliveSkinColor: Color = { r: 198, g: 168, b: 130 };
      const sampler = createMockSampler(features, {
        skin: oliveSkinColor,
        hair: { r: 30, g: 25, b: 25 },
        eye: { r: 50, g: 45, b: 35 },
        lip: { r: 180, g: 115, b: 115 },
      });

      const palette = extractPalette(features, sampler);
      expect(palette.skinBase.r).toBe(oliveSkinColor.r);
      expect(palette.skinBase.g).toBe(oliveSkinColor.g);
      expect(palette.skinBase.b).toBe(oliveSkinColor.b);
    });
  });

  describe('2. Removal of Destructive Hair Clamping & Accurate Reconstruction', () => {
    it('preserves blonde hair without collapsing to espresso-black (<= 22)', () => {
      const blondeColor: Color = { r: 220, g: 190, b: 125 };
      const sampler = createMockSampler(features, {
        skin: { r: 245, g: 220, b: 200 },
        hair: blondeColor,
        eye: { r: 45, g: 110, b: 170 },
        lip: { r: 220, g: 135, b: 140 },
      });

      const palette = extractPalette(features, sampler);

      // Previously lines 201-205 forced hairPrimary.r <= 22!
      expect(palette.hairPrimary.r).toBeGreaterThan(180);
      expect(palette.hairPrimary.g).toBeGreaterThan(150);
      expect(palette.hairPrimary.b).toBeGreaterThan(100);

      // Verify hairSecondary is a lighter luminous blonde highlight
      expect(palette.hairSecondary.r).toBeGreaterThanOrEqual(palette.hairPrimary.r);
      expect(luminance(palette.hairSecondary)).toBeGreaterThan(luminance(palette.hairPrimary));
    });

    it('preserves auburn/red hair with prominent warm saturation', () => {
      const redHairColor: Color = { r: 185, g: 75, b: 40 };
      const sampler = createMockSampler(features, {
        skin: { r: 242, g: 218, b: 198 },
        hair: redHairColor,
        eye: { r: 55, g: 125, b: 70 },
        lip: { r: 215, g: 120, b: 125 },
      });

      const palette = extractPalette(features, sampler);

      // Verify red channel dominates without being crushed to <= 22
      expect(palette.hairPrimary.r).toBeGreaterThan(150);
      expect(palette.hairPrimary.r).toBeGreaterThan(palette.hairPrimary.g * 1.8);
    });

    it('preserves silver/grey hair without darkening to near-black', () => {
      const silverColor: Color = { r: 185, g: 185, b: 190 };
      const sampler = createMockSampler(features, {
        skin: { r: 235, g: 205, b: 185 },
        hair: silverColor,
        eye: { r: 60, g: 70, b: 85 },
        lip: { r: 200, g: 130, b: 135 },
      });

      const palette = extractPalette(features, sampler);
      expect(palette.hairPrimary.r).toBeGreaterThan(150);
      expect(luminance(palette.hairPrimary)).toBeGreaterThan(0.60);
    });
  });

  describe('3. Removal of Destructive Eye/Iris Clamping & Accurate Reconstruction', () => {
    it('preserves blue eyes with high blue channel dominance', () => {
      const blueIrisColor: Color = { r: 42, g: 105, b: 178 };
      const sampler = createMockSampler(features, {
        skin: { r: 240, g: 215, b: 195 },
        hair: { r: 50, g: 35, b: 28 },
        eye: blueIrisColor,
        lip: { r: 210, g: 130, b: 135 },
      });

      const palette = extractPalette(features, sampler);

      // Previously eyeColor.b was clamped to [18, 42] and eyeColor.r to [28, 65]!
      expect(palette.eyeColor.b).toBeGreaterThan(140);
      expect(palette.eyeColor.b).toBeGreaterThan(palette.eyeColor.r * 2);
      expect(palette.eyeColor.b).toBeGreaterThan(palette.eyeColor.g);

      // Outer ring should be darker limbal ring
      expect(luminance(palette.irisOuterRing)).toBeLessThan(luminance(palette.eyeColor));
    });

    it('preserves green eyes with green channel dominance', () => {
      const greenIrisColor: Color = { r: 52, g: 135, b: 68 };
      const sampler = createMockSampler(features, {
        skin: { r: 240, g: 215, b: 195 },
        hair: { r: 40, g: 30, b: 25 },
        eye: greenIrisColor,
        lip: { r: 205, g: 125, b: 130 },
      });

      const palette = extractPalette(features, sampler);

      // Previously eyeColor.g was clamped to [22, 50]!
      expect(palette.eyeColor.g).toBeGreaterThan(100);
      expect(palette.eyeColor.g).toBeGreaterThan(palette.eyeColor.r);
    });

    it('preserves amber/hazel eyes without crushing to dark espresso', () => {
      const amberIrisColor: Color = { r: 130, g: 95, b: 45 };
      const sampler = createMockSampler(features, {
        skin: { r: 235, g: 200, b: 175 },
        hair: { r: 60, g: 40, b: 30 },
        eye: amberIrisColor,
        lip: { r: 200, g: 120, b: 120 },
      });

      const palette = extractPalette(features, sampler);
      expect(palette.eyeColor.r).toBeGreaterThan(100);
      expect(palette.eyeColor.g).toBeGreaterThan(70);
    });
  });

  describe('4. Removal of Destructive Lip Clamping & Accurate Reconstruction', () => {
    it('preserves deep berry/wine lips without forcing to orange-coral [205..228]', () => {
      const berryLipColor: Color = { r: 145, g: 55, b: 72 };
      const sampler = createMockSampler(features, {
        skin: { r: 240, g: 215, b: 195 },
        hair: { r: 30, g: 25, b: 25 },
        eye: { r: 50, g: 35, b: 30 },
        lip: berryLipColor,
      });

      const palette = extractPalette(features, sampler);

      // Previously lipColor.r was clamped to [205, 228] and g to [125, 148]!
      expect(palette.lipColor.r).toBeLessThan(180);
      expect(palette.lipColor.g).toBeLessThan(90);

      // Highlights and shadows scale proportionally
      expect(luminance(palette.lipHighlight)).toBeGreaterThan(luminance(palette.lipColor));
      expect(luminance(palette.lipShadow)).toBeLessThan(luminance(palette.lipColor));
    });

    it('preserves deep mocha/brown lips', () => {
      const mochaLipColor: Color = { r: 120, g: 75, b: 65 };
      const sampler = createMockSampler(features, {
        skin: { r: 160, g: 110, b: 85 },
        hair: { r: 20, g: 18, b: 20 },
        eye: { r: 40, g: 30, b: 25 },
        lip: mochaLipColor,
      });

      const palette = extractPalette(features, sampler);
      expect(palette.lipColor.r).toBeLessThan(160);
      expect(palette.lipColor.r).toBeCloseTo(mochaLipColor.r, -1);
    });
  });

  describe('5. Eyebrow and Facial Hair Preservation', () => {
    it('preserves blonde eyebrows without clamping to black (<= 32)', () => {
      const blondeBrow: Color = { r: 165, g: 140, b: 98 };
      const sampler = createMockSampler(features, {
        skin: { r: 245, g: 220, b: 200 },
        hair: { r: 210, g: 185, b: 120 },
        eye: { r: 50, g: 110, b: 170 },
        lip: { r: 220, g: 135, b: 140 },
        eyebrow: blondeBrow,
      });

      const palette = extractPalette(features, sampler);

      // Previously eyebrowColor.r was Math.min(32, ...)
      expect(palette.eyebrowColor.r).toBeGreaterThan(120);
      expect(palette.eyebrowColor.g).toBeGreaterThan(100);
    });

    it('preserves auburn beard without clamping to black (<= 26)', () => {
      const auburnBeard: Color = { r: 145, g: 68, b: 42 };
      const sampler = createMockSampler(features, {
        skin: { r: 238, g: 205, b: 180 },
        hair: { r: 155, g: 72, b: 45 },
        eye: { r: 50, g: 40, b: 32 },
        lip: { r: 205, g: 120, b: 120 },
        chin: auburnBeard,
      });

      const palette = extractPalette(features, sampler);

      // Previously beardColor was Math.min(..., 26)
      expect(palette.beardColor.r).toBeGreaterThan(100);
      expect(palette.beardColor.r).toBeGreaterThan(palette.beardColor.g);
      expect(luminance(palette.beardShadowColor)).toBeLessThan(luminance(palette.beardColor));
    });
  });

  describe('6. Separation of Raw Sampled Values and Display Values', () => {
    it('provides raw sampled values in PortraitPalette distinct from display palette', () => {
      const sampler = createMockSampler(features, {
        skin: { r: 210, g: 165, b: 130 },
        hair: { r: 195, g: 160, b: 105 },
        eye: { r: 40, g: 95, b: 165 },
        lip: { r: 185, g: 95, b: 105 },
      });

      const palette = extractPalette(features, sampler);

      expect(palette.rawSkinBase).toBeDefined();
      expect(palette.rawHairPrimary).toBeDefined();
      expect(palette.rawEyeColor).toBeDefined();
      expect(palette.rawLipColor).toBeDefined();

      expect(palette.rawSkinBase!.r).toBe(210);
      expect(palette.rawHairPrimary!.r).toBe(195);
      expect(palette.rawEyeColor!.b).toBe(165);
      expect(palette.rawLipColor!.r).toBe(185);

      // Display values exist and are populated
      expect(palette.skinBase).toBeDefined();
      expect(palette.hairPrimary).toBeDefined();
      expect(palette.eyeColor).toBeDefined();
      expect(palette.lipColor).toBeDefined();
    });
  });

  describe('7. Phase B: Three-Tone Skin Palette and Perceptual Shading', () => {
    it('derives exactly three primary skin tones adhering to perceptual luminance parameters', () => {
      const skinTones: Color[] = [
        { r: 246, g: 222, b: 202 }, // Fair Ivory
        { r: 215, g: 165, b: 125 }, // Tan
        { r: 198, g: 168, b: 130 }, // Olive
        { r: 92, g: 58, b: 42 },    // Deep Melanin
      ];

      for (const tone of skinTones) {
        const sampler = createMockSampler(features, {
          skin: tone,
          hair: { r: 30, g: 25, b: 20 },
          eye: { r: 40, g: 30, b: 25 },
          lip: { r: 180, g: 100, b: 100 },
        });

        const palette = extractPalette(features, sampler);

        // 1. Base skin faithfully matches authentic source tone
        expect(palette.skinBase.r).toBeCloseTo(tone.r, -1);
        expect(palette.skinBase.g).toBeCloseTo(tone.g, -1);
        expect(palette.skinBase.b).toBeCloseTo(tone.b, -1);

        // 2. Shadow skin is approximately 24% darker in perceptual luminance
        const baseLum = luminance(palette.skinBase);
        const shadowLum = luminance(palette.skinShadow);
        const ratio = shadowLum / baseLum;
        expect(ratio).toBeGreaterThan(0.68);
        expect(ratio).toBeLessThan(0.84);

        // 3. Highlight skin is distinctly lighter than base
        const hlLum = luminance(palette.skinHighlight);
        expect(hlLum).toBeGreaterThan(baseLum);

        // 4. Warm natural hue preservation (no unnatural hue shift)
        const computeHue = (c: Color) => {
          const r = c.r / 255, g = c.g / 255, b = c.b / 255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
          if (d === 0) return 0;
          let h = 0;
          switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
            case g: h = ((b - r) / d + 2) * 60; break;
            case b: h = ((r - g) / d + 4) * 60; break;
          }
          return h;
        };

        const baseH = computeHue(palette.skinBase);
        const shadowH = computeHue(palette.skinShadow);
        const hlH = computeHue(palette.skinHighlight);
        expect(Math.abs(baseH - shadowH)).toBeLessThan(2.0);
        expect(Math.abs(baseH - hlH)).toBeLessThan(2.0);
      }
    });

    it('rejects blown specular highlights from contaminating skinBase', () => {
      // Create a sampler where the nose bridge has a blown specular flash reflection (255, 255, 255)
      // but the cheeks have authentic warm tan skin (210, 160, 120)
      const baseTanSkin: Color = { r: 210, g: 160, b: 120 };
      const baseSampler = createMockSampler(features, {
        skin: baseTanSkin,
        hair: { r: 30, g: 25, b: 20 },
        eye: { r: 40, g: 30, b: 25 },
        lip: { r: 180, g: 100, b: 100 },
      });

      const blownSampler: ColorSampler = {
        ...baseSampler,
        sampleRegion: (pt: Vec2, rad?: number) => {
          // If sampling near dorsal bridge or glabella: blown highlight
          if (Math.abs(pt.x - features.noseTip.x) < 0.02 && pt.y < features.noseTip.y) {
            return { r: 255, g: 255, b: 255 };
          }
          return baseSampler.sampleRegion(pt, rad);
        },
      } as unknown as ColorSampler;

      const palette = extractPalette(features, blownSampler);

      // skinBase must NOT be corrupted to white or blown highlight
      expect(palette.skinBase.r).toBeCloseTo(baseTanSkin.r, -1);
      expect(palette.skinBase.g).toBeCloseTo(baseTanSkin.g, -1);
      expect(palette.skinBase.b).toBeCloseTo(baseTanSkin.b, -1);
      expect(luminance(palette.skinBase)).toBeLessThan(0.75);
    });
  });
});
