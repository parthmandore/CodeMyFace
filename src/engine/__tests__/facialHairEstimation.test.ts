import { describe, it, expect } from 'vitest';
import { estimateFacialHair } from '../heuristicFeatures';
import { Color, FacialFeatures, PortraitPalette, Vec2 } from '../../types/portrait';
import { ColorSampler } from '../colorSampler';
import { shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';
import type { HairSegmentationResult } from '../../services/segmentation/segmentationService';

/**
 * Creates a calibrated test palette
 */
function createTestPalette(options?: {
  skin?: Color;
  hair?: Color;
  beard?: Color;
}): PortraitPalette {
  const skin = options?.skin ?? { r: 235, g: 200, b: 180 }; // lum ~ 0.80
  const hair = options?.hair ?? { r: 35, g: 30, b: 30 }; // lum ~ 0.12
  const beard = options?.beard ?? hair;

  return {
    skinBase: skin,
    rawSkinBase: skin,
    rawSkinLum: 0.80,
    hairPrimary: hair,
    hairSecondary: { r: hair.r + 10, g: hair.g + 10, b: hair.b + 10 },
    beardColor: beard,
    beardShadowColor: { r: 20, g: 15, b: 15 },
    skinShadow: { r: 200, g: 165, b: 145 },
    skinShadowDeep: { r: 170, g: 135, b: 115 },
    skinHighlight: { r: 250, g: 220, b: 205 },
    skinToneWarmer: { r: 235, g: 190, b: 170 },
    eyeColor: { r: 50, g: 35, b: 25 },
    irisOuterRing: { r: 25, g: 18, b: 15 },
    lipColor: { r: 195, g: 115, b: 110 },
    lipShadow: { r: 160, g: 85, b: 80 },
    lipHighlight: { r: 220, g: 140, b: 135 },
    eyebrowColor: { r: 40, g: 35, b: 35 },
    background: { r: 245, g: 245, b: 245 },
    neckShadow: { r: 180, g: 145, b: 125 },
    lightDirection: 'frontal',
  };
}

/**
 * Helper to construct an exact, spatially-aware mock ColorSampler
 * mapping anatomical facial landmark zones to specific color probes.
 */
function createFacialHairSampler(options: {
  features: FacialFeatures;
  skinColor?: Color;
  mustacheCenterColor?: Color;
  mustacheWingsColor?: Color;
  lateralLipColor?: Color;
  mentalGrooveColor?: Color;
  chinBulbColor?: Color;
  innerJawLeftColor?: Color;
  innerJawRightColor?: Color;
  neckColor?: Color;
  sideburnLeftColor?: Color;
  sideburnRightColor?: Color;
}): ColorSampler {
  const { features } = options;
  const skin = options.skinColor ?? { r: 235, g: 200, b: 180 };
  const faceHeight = Math.max(0.08, features.chinTip.y - features.foreheadTop.y);
  const faceWidthNorm = Math.abs(features.templeRight.x - features.templeLeft.x) || (faceHeight * 0.62);

  const lowerLipBottom =
    (features.lowerLipOuter && features.lowerLipOuter[5]) ||
    (features.lowerLip && features.lowerLip[Math.floor(features.lowerLip.length / 2)]) ||
    (features.lowerLip && features.lowerLip[0]) ||
    features.chinTip;

  const nostrilY = Math.max(features.leftNostril.y, features.rightNostril.y);
  const upperLipTopY = features.upperLipOuter[Math.floor(features.upperLipOuter.length / 2)]?.y ?? features.upperLipOuter[0].y;
  const mustacheMidY = (nostrilY + upperLipTopY) / 2;
  const mouthWidth = Math.abs(features.upperLipOuter[features.upperLipOuter.length - 1].x - features.upperLipOuter[0].x) || (faceWidthNorm * 0.35);

  const philtrumCenterPt: Vec2 = { x: features.mouthCenter.x, y: mustacheMidY };
  const philtrumLeftPt: Vec2 = { x: features.mouthCenter.x - mouthWidth * 0.22, y: mustacheMidY };
  const philtrumRightPt: Vec2 = { x: features.mouthCenter.x + mouthWidth * 0.22, y: mustacheMidY };

  const lateralLipLeftPt: Vec2 = { x: features.upperLipOuter[0].x * 0.70 + features.mouthCenter.x * 0.30, y: mustacheMidY };
  const lateralLipRightPt: Vec2 = { x: features.upperLipOuter[features.upperLipOuter.length - 1].x * 0.70 + features.mouthCenter.x * 0.30, y: mustacheMidY };

  const mentalGroovePt: Vec2 = {
    x: features.mouthCenter.x,
    y: lowerLipBottom.y + (features.chinTip.y - lowerLipBottom.y) * 0.28,
  };
  const chinBulbPt: Vec2 = {
    x: features.chinTip.x,
    y: features.chinTip.y - faceHeight * 0.015,
  };
  const chinBulbLeftPt: Vec2 = {
    x: features.chinTip.x - faceWidthNorm * 0.08,
    y: features.chinTip.y - faceHeight * 0.015,
  };
  const chinBulbRightPt: Vec2 = {
    x: features.chinTip.x + faceWidthNorm * 0.08,
    y: features.chinTip.y - faceHeight * 0.015,
  };

  const earLeftY = features.leftEar && features.leftEar[0] ? features.leftEar[0].y : (features.templeLeft.y + faceHeight * 0.10);
  const earRightY = features.rightEar && features.rightEar[0] ? features.rightEar[0].y : (features.templeRight.y + faceHeight * 0.10);
  const sbLeftPt: Vec2 = { x: features.templeLeft.x + 0.010, y: (features.templeLeft.y + earLeftY) / 2 };
  const sbRightPt: Vec2 = { x: features.templeRight.x - 0.010, y: (features.templeRight.y + earRightY) / 2 };

  const lowerJawPoints = features.jawline.filter((pt) => pt && pt.y > features.mouthCenter.y - 0.02);
  const leftJawPts = lowerJawPoints.filter((pt) => pt.x < features.chinTip.x - faceWidthNorm * 0.04);
  const rightJawPts = lowerJawPoints.filter((pt) => pt.x > features.chinTip.x + faceWidthNorm * 0.04);
  const dist = (p1: Vec2, p2: Vec2) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

  const samplePoint = (pt: Vec2): Color => {
    // 1. Philtrum center
    if (dist(pt, philtrumCenterPt) < 0.010) {
      return options.mustacheCenterColor ?? skin;
    }
    // 2. Lateral lips (must be checked with tight radius before wings)
    if (dist(pt, lateralLipLeftPt) < 0.012 || dist(pt, lateralLipRightPt) < 0.012) {
      return options.lateralLipColor ?? skin;
    }
    // 3. Philtrum wings
    if (dist(pt, philtrumLeftPt) < 0.010 || dist(pt, philtrumRightPt) < 0.010) {
      return options.mustacheWingsColor ?? skin;
    }
    // 4. Mental groove
    if (dist(pt, mentalGroovePt) < 0.012) {
      return options.mentalGrooveColor ?? skin;
    }
    // 5. Chin bulb
    if (
      dist(pt, chinBulbPt) < 0.018 ||
      dist(pt, chinBulbLeftPt) < 0.018 ||
      dist(pt, chinBulbRightPt) < 0.018
    ) {
      return options.chinBulbColor ?? skin;
    }
    // 6. Sideburns
    if (dist(pt, sbLeftPt) < 0.018) {
      return options.sideburnLeftColor ?? skin;
    }
    if (dist(pt, sbRightPt) < 0.018) {
      return options.sideburnRightColor ?? skin;
    }

    // 7. Outer neck probes
    const isNeck = lowerJawPoints.some((jPt) => {
      const outPt: Vec2 = {
        x: jPt.x * 1.08 - features.noseTip.x * 0.08,
        y: jPt.y * 1.08 - features.noseTip.y * 0.08,
      };
      return dist(pt, outPt) < 0.015;
    });
    if (isNeck && options.neckColor) {
      return options.neckColor;
    }

    // 8. Inner left jaw (viewer's left / patient's right)
    const isLeftJaw = leftJawPts.some((jPt) => {
      const inPt: Vec2 = {
        x: jPt.x * 0.88 + features.noseTip.x * 0.12,
        y: jPt.y * 0.88 + features.noseTip.y * 0.12,
      };
      return dist(pt, inPt) < 0.015;
    });
    if (isLeftJaw && options.innerJawLeftColor) {
      return options.innerJawLeftColor;
    }

    // 9. Inner right jaw (viewer's right / patient's left)
    const isRightJaw = rightJawPts.some((jPt) => {
      const inPt: Vec2 = {
        x: jPt.x * 0.88 + features.noseTip.x * 0.12,
        y: jPt.y * 0.88 + features.noseTip.y * 0.12,
      };
      return dist(pt, inPt) < 0.015;
    });
    if (isRightJaw && options.innerJawRightColor) {
      return options.innerJawRightColor;
    }

    // Default skin for cheeks, forehead, etc.
    return skin;
  };

  return {
    sampleRegion: (center: Vec2) => samplePoint(center),
    samplePixel: (x: number, y: number) => samplePoint({ x, y }),
    sampleAt: (pt: Vec2) => samplePoint(pt),
    sampleAverage: (pts: Vec2[]) => {
      const colors = pts.map(p => samplePoint(p));
      return {
        r: Math.round(colors.reduce((s, c) => s + c.r, 0) / colors.length),
        g: Math.round(colors.reduce((s, c) => s + c.g, 0) / colors.length),
        b: Math.round(colors.reduce((s, c) => s + c.b, 0) / colors.length),
      };
    },
    estimateLightingDirection: () => 'frontal',
  } as unknown as ColorSampler;
}

/**
 * Creates a mock multi-class segmentation result
 */
function createMockSegmentationResult(options?: {
  maskWidth?: number;
  maskHeight?: number;
  clothesRegions?: Array<{ x: number; y: number; radius: number }>;
}): HairSegmentationResult {
  const maskWidth = options?.maskWidth ?? 256;
  const maskHeight = options?.maskHeight ?? 256;
  const rawMask = new Uint8Array(maskWidth * maskHeight);
  rawMask.fill(3); // default face-skin (Class 3)

  if (options?.clothesRegions) {
    for (const region of options.clothesRegions) {
      const cx = Math.round(region.x * maskWidth);
      const cy = Math.round(region.y * maskHeight);
      const r = Math.round(region.radius * maskWidth);
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy <= r * r) {
            const px = Math.max(0, Math.min(maskWidth - 1, cx + dx));
            const py = Math.max(0, Math.min(maskHeight - 1, cy + dy));
            rawMask[py * maskWidth + px] = 4; // Class 4: Clothes
          }
        }
      }
    }
  }

  return {
    hasHairSegmentation: true,
    provenance: 'segmentation-mask-derived',
    maskWidth,
    maskHeight,
    rawMask,
  };
}

describe('Phase 5: Facial-Hair Estimation Engine', () => {
  const features = shortHairCleanShavenFixture.features;
  const palette = createTestPalette();

  describe('1. Clean-Shaven Face Baseline', () => {
    it('reliably returns clean-shaven status with high confidence when skin is uniform', () => {
      const sampler = createFacialHairSampler({ features });
      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasBeard).toBe(false);
      expect(estimate.hasMustache).toBe(false);
      expect(estimate.hasGoatee).toBe(false);
      expect(estimate.hasFullBeard).toBe(false);
      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.hasSideburns).toBe(false);
      expect(estimate.density).toBe('none');
      expect(estimate.metrics?.isCleanShavenConfidence).toBeGreaterThan(0.70);
      expect(estimate.beardRegion).toHaveLength(0);
      expect(estimate.mustacheRegion).toHaveLength(0);
      expect(estimate.provenance).toBe('template-generated');
    });
  });

  describe('2. Rejection of Facial Shadows (Darkness Alone != Hair)', () => {
    it('rejects subnasal nose shadow under overhead lighting and preserves clean-shaven status', () => {
      // Overhead shadow directly under columella/septum, but lateral lip is bright skin
      const darkUmbra: Color = { r: 50, g: 45, b: 40 }; // lum ~ 0.18
      const brightSkin: Color = { r: 235, g: 200, b: 180 }; // lum ~ 0.80

      const sampler = createFacialHairSampler({
        features,
        mustacheCenterColor: darkUmbra,
        mustacheWingsColor: brightSkin,
        lateralLipColor: brightSkin,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasMustache).toBe(false);
      expect(estimate.metrics?.shadowRejected).toBe(true);
      expect(estimate.mustacheRegion).toHaveLength(0);
    });

    it('rejects mental crease anatomical lower-lip shadow when forward chin bulb is bright skin', () => {
      // Depression below lower lip is in shadow, but chin bulb faces light
      const darkCrease: Color = { r: 55, g: 48, b: 42 }; // lum ~ 0.20
      const brightSkin: Color = { r: 235, g: 200, b: 180 }; // lum ~ 0.80

      const sampler = createFacialHairSampler({
        features,
        mentalGrooveColor: darkCrease,
        chinBulbColor: brightSkin,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasGoatee).toBe(false);
      expect(estimate.hasBeard).toBe(false);
      expect(estimate.metrics?.shadowRejected).toBe(true);
      expect(estimate.beardRegion).toHaveLength(0);
    });

    it('rejects directional key-light shadow where only one side of the jaw is dark', () => {
      // Angled light casting a shadow on left jaw, while right jaw is illuminated skin
      const darkSide: Color = { r: 45, g: 40, b: 38 }; // lum ~ 0.16
      const lightSide: Color = { r: 235, g: 200, b: 180 }; // lum ~ 0.80

      const sampler = createFacialHairSampler({
        features,
        innerJawLeftColor: darkSide,
        innerJawRightColor: lightSide,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.hasBeard).toBe(false);
      expect(estimate.metrics?.shadowRejected).toBe(true);
    });
  });

  describe('3. Rejection of Dark Collars & Clothing (Semantic Class 4 & Neck Contrast)', () => {
    it('rejects dark collar when inner jaw is skin tone while neck below is dark clothing', () => {
      const darkShirtCollar: Color = { r: 25, g: 25, b: 30 }; // lum ~ 0.10
      const innerSkin: Color = { r: 235, g: 200, b: 180 }; // lum ~ 0.80

      const sampler = createFacialHairSampler({
        features,
        innerJawLeftColor: innerSkin,
        innerJawRightColor: innerSkin,
        neckColor: darkShirtCollar,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.hasBeard).toBe(false);
      expect(estimate.metrics?.clothingRejected).toBe(true);
    });

    it('rejects facial hair when multi-class segmentation labels outer jawline as Class 4 (Clothes)', () => {
      const darkCollar: Color = { r: 35, g: 30, b: 30 };
      const sampler = createFacialHairSampler({
        features,
        innerJawLeftColor: darkCollar,
        innerJawRightColor: darkCollar,
      });

      // Semantic segmentation mask indicating clothing overlapping the jawline/neck
      const segResult = createMockSegmentationResult({
        clothesRegions: [
          { x: features.chinTip.x, y: features.chinTip.y + 0.01, radius: 0.08 },
          { x: features.templeLeft.x * 0.90, y: features.chinTip.y, radius: 0.08 },
          { x: features.templeRight.x * 1.10, y: features.chinTip.y, radius: 0.08 },
        ],
      });

      const estimate = estimateFacialHair(features, sampler, palette, segResult);

      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.metrics?.clothingRejected).toBe(true);
    });
  });

  describe('4. Accurate Full Beard Estimation', () => {
    it('detects a genuine full mandibular beard with dark inner jaw and dark chin bulb', () => {
      const beardColor: Color = { r: 35, g: 30, b: 30 }; // lum ~ 0.12, matches dark hair
      const sampler = createFacialHairSampler({
        features,
        innerJawLeftColor: beardColor,
        innerJawRightColor: beardColor,
        chinBulbColor: beardColor,
        mentalGrooveColor: beardColor,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasBeard).toBe(true);
      expect(estimate.hasFullBeard).toBe(true);
      expect(estimate.hasJawBeard).toBe(true);
      expect(estimate.hasGoatee).toBe(true);
      expect(estimate.beardRegion.length).toBeGreaterThan(0);
      expect(estimate.provenance).toBe('landmark-derived');
      expect(estimate.density).not.toBe('none');
    });
  });

  describe('5. Independent Moustache Estimation', () => {
    it('detects moustache alone when philtrum is dark and jaw/chin are clean-shaven', () => {
      const mustacheColor: Color = { r: 35, g: 30, b: 30 }; // lum ~ 0.12
      const skin: Color = { r: 235, g: 200, b: 180 };

      const sampler = createFacialHairSampler({
        features,
        mustacheCenterColor: mustacheColor,
        mustacheWingsColor: mustacheColor,
        lateralLipColor: skin,
        chinBulbColor: skin,
        mentalGrooveColor: skin,
        innerJawLeftColor: skin,
        innerJawRightColor: skin,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasMustache).toBe(true);
      expect(estimate.hasBeard).toBe(false);
      expect(estimate.hasGoatee).toBe(false);
      expect(estimate.hasFullBeard).toBe(false);
      expect(estimate.mustacheRegion.length).toBeGreaterThan(0);
      expect(estimate.beardRegion).toHaveLength(0);
      expect(estimate.provenance).toBe('landmark-derived');
    });
  });

  describe('6. Independent Goatee Estimation', () => {
    it('detects goatee alone when chin bulb is dark but jaw chinstrap is bare', () => {
      const goateeColor: Color = { r: 35, g: 30, b: 30 };
      const skin: Color = { r: 235, g: 200, b: 180 };

      const sampler = createFacialHairSampler({
        features,
        chinBulbColor: goateeColor,
        mentalGrooveColor: goateeColor,
        mustacheCenterColor: skin,
        mustacheWingsColor: skin,
        innerJawLeftColor: skin,
        innerJawRightColor: skin,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasGoatee).toBe(true);
      expect(estimate.hasBeard).toBe(true);
      expect(estimate.hasFullBeard).toBe(false);
      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.hasMustache).toBe(false);
      expect(estimate.goateeRegion?.length).toBeGreaterThan(0);
      expect(estimate.beardRegion.length).toBeGreaterThan(0);
    });
  });

  describe('7. Independent Sideburns Estimation', () => {
    it('detects sideburns when preauricular strip is dark', () => {
      const sideburnColor: Color = { r: 35, g: 30, b: 30 };
      const skin: Color = { r: 235, g: 200, b: 180 };

      const sampler = createFacialHairSampler({
        features,
        sideburnLeftColor: sideburnColor,
        sideburnRightColor: sideburnColor,
        chinBulbColor: skin,
        mentalGrooveColor: skin,
        mustacheCenterColor: skin,
        mustacheWingsColor: skin,
        innerJawLeftColor: skin,
        innerJawRightColor: skin,
      });

      const estimate = estimateFacialHair(features, sampler, palette);

      expect(estimate.hasSideburns).toBe(true);
      expect(estimate.sideburnLeft).toBeDefined();
      expect(estimate.sideburnLeft!.length).toBeGreaterThan(0);
      expect(estimate.sideburnRight).toBeDefined();
      expect(estimate.sideburnRight!.length).toBeGreaterThan(0);
      expect(estimate.hasBeard).toBe(false);
      expect(estimate.provenance).toBe('landmark-derived');
    });
  });

  describe('8. Explicit Manual User Override', () => {
    it('override "off" forces clean-shaven portrait even when image presents dark facial hair', () => {
      const darkBeard: Color = { r: 30, g: 25, b: 25 };
      const sampler = createFacialHairSampler({
        features,
        innerJawLeftColor: darkBeard,
        innerJawRightColor: darkBeard,
        chinBulbColor: darkBeard,
        mustacheCenterColor: darkBeard,
        mustacheWingsColor: darkBeard,
      });

      const estimate = estimateFacialHair(features, sampler, palette, undefined, { override: 'off' });

      expect(estimate.hasBeard).toBe(false);
      expect(estimate.hasMustache).toBe(false);
      expect(estimate.hasGoatee).toBe(false);
      expect(estimate.hasFullBeard).toBe(false);
      expect(estimate.hasJawBeard).toBe(false);
      expect(estimate.hasSideburns).toBe(false);
      expect(estimate.density).toBe('none');
      expect(estimate.override).toBe('off');
      expect(estimate.beardRegion).toHaveLength(0);
      expect(estimate.mustacheRegion).toHaveLength(0);
    });

    it('override "on" forces stylized facial hair synthesis even on a clean-shaven face', () => {
      const sampler = createFacialHairSampler({ features }); // completely clean-shaven skin

      const estimate = estimateFacialHair(features, sampler, palette, undefined, { override: 'on' });

      expect(estimate.hasBeard).toBe(true);
      expect(estimate.hasMustache).toBe(true);
      expect(estimate.hasFullBeard).toBe(true);
      expect(estimate.hasGoatee).toBe(true);
      expect(estimate.hasJawBeard).toBe(true);
      expect(estimate.density).toBe('medium');
      expect(estimate.override).toBe('on');
      expect(estimate.beardRegion.length).toBeGreaterThan(0);
      expect(estimate.mustacheRegion.length).toBeGreaterThan(0);
      expect(estimate.sideburnLeft).toBeDefined();
      expect(estimate.sideburnRight).toBeDefined();
    });
  });
});
