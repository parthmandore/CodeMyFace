import { describe, it, expect } from 'vitest';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { extractFacialFeatures, classifyFaceShape } from '../faceAnalyzer';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import { FaceAnalysis } from '../../types/portrait';
import { estimateHairstyle, estimateFacialHair } from '../heuristicFeatures';
import { ColorSampler } from '../colorSampler';

/** Creates a synthetic 478-point landmark array with realistic geometric structure */
function createSyntheticLandmarks(options: {
  widthScale?: number;
  heightScale?: number;
  jawWidthScale?: number;
} = {}): NormalizedLandmark[] {
  const ws = options.widthScale ?? 1.0;
  const hs = options.heightScale ?? 1.0;
  const js = options.jawWidthScale ?? 1.0;

  const landmarks: NormalizedLandmark[] = [];

  // Generate 478 points centered around (0.5, 0.5)
  for (let i = 0; i < 478; i++) {
    // Default fallback point near center
    landmarks.push({ x: 0.5, y: 0.5, z: 0 });
  }

  // Face oval points around circumference
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const radX = (0.22 * ws) * (Math.sin(angle) > 0.3 ? js : 1.0);
    const radY = 0.28 * hs;
    const x = 0.5 + Math.cos(angle) * radX;
    const y = 0.5 + Math.sin(angle) * radY;
    landmarks[i] = { x, y, z: 0 };
  }

  // Set key landmarks explicitly
  // Forehead top (index 10)
  landmarks[10] = { x: 0.5, y: 0.5 - 0.25 * hs, z: 0 };
  // Chin tip (index 152)
  landmarks[152] = { x: 0.5, y: 0.5 + 0.30 * hs, z: 0 };
  // Temple left (index 127)
  landmarks[127] = { x: 0.5 - 0.20 * ws, y: 0.45, z: 0 };
  // Temple right (index 356)
  landmarks[356] = { x: 0.5 + 0.20 * ws, y: 0.45, z: 0 };

  // Iris centers (468, 473)
  landmarks[468] = { x: 0.5 - 0.10 * ws, y: 0.44, z: 0 };
  landmarks[473] = { x: 0.5 + 0.10 * ws, y: 0.44, z: 0 };

  // Nose tip (index 4)
  landmarks[4] = { x: 0.5, y: 0.52, z: 0 };
  // Nose bridge top (index 6)
  landmarks[6] = { x: 0.5, y: 0.43, z: 0 };
  // Nostrils (94, 370)
  landmarks[94] = { x: 0.46, y: 0.54, z: 0 };
  landmarks[370] = { x: 0.54, y: 0.54, z: 0 };

  // Mouth center (index 13)
  landmarks[13] = { x: 0.5, y: 0.64, z: 0 };
  // Upper lip (index 0)
  landmarks[0] = { x: 0.5, y: 0.62, z: 0 };
  // Lower lip (index 17)
  landmarks[17] = { x: 0.5, y: 0.66, z: 0 };

  return landmarks;
}

/** Creates synthetic FaceAnalysis object for testing renderer */
function createSyntheticAnalysis(landmarks: NormalizedLandmark[]): FaceAnalysis {
  const features = extractFacialFeatures(landmarks);
  const faceShape = classifyFaceShape(features);

  return {
    features,
    faceShape,
    faceCenter: { x: 0.5, y: 0.5 },
    faceWidth: 0.4,
    faceHeight: 0.55,
    faceAngle: 0,
    imageWidth: 800,
    imageHeight: 1000,
    selectedFaceIndex: 0,
    totalFacesDetected: 1,
    analysisTimeMs: 25,
    palette: {
      skinBase: { r: 220, g: 175, b: 145 },
      skinShadow: { r: 175, g: 135, b: 110 },
      skinShadowDeep: { r: 140, g: 105, b: 85 },
      skinHighlight: { r: 245, g: 205, b: 180 },
      skinToneWarmer: { r: 230, g: 180, b: 150 },
      hairPrimary: { r: 45, g: 35, b: 30 },
      hairSecondary: { r: 75, g: 60, b: 50 },
      eyeColor: { r: 60, g: 45, b: 35 },
      irisOuterRing: { r: 30, g: 22, b: 18 },
      lipColor: { r: 190, g: 90, b: 85 },
      lipShadow: { r: 140, g: 60, b: 55 },
      lipHighlight: { r: 220, g: 120, b: 115 },
      eyebrowColor: { r: 40, g: 30, b: 25 },
      beardColor: { r: 42, g: 32, b: 28 },
      beardShadowColor: { r: 25, g: 18, b: 15 },
      background: { r: 251, g: 245, b: 238 },
      neckShadow: { r: 150, g: 115, b: 90 },
      lightDirection: 'frontal',
    },
    hairEstimate: {
      detected: true,
      silhouettePoints: [
        { x: 0.3, y: 0.3 },
        { x: 0.5, y: 0.15 },
        { x: 0.7, y: 0.3 },
        { x: 0.5, y: 0.28 },
      ],
      color: { r: 45, g: 35, b: 30 },
      secondaryColor: { r: 75, g: 60, b: 50 },
      coverage: 'full',
      length: 'short',
      style: 'short',
    },
    facialHairEstimate: {
      hasBeard: true,
      hasMustache: true,
      hasGoatee: false,
      hasFullBeard: true,
      beardRegion: [
        { x: 0.4, y: 0.75 },
        { x: 0.5, y: 0.82 },
        { x: 0.6, y: 0.75 },
      ],
      mustacheRegion: [
        { x: 0.42, y: 0.60 },
        { x: 0.5, y: 0.58 },
        { x: 0.58, y: 0.60 },
      ],
      color: { r: 42, g: 32, b: 28 },
      beardShadowColor: { r: 25, g: 18, b: 15 },
      density: 'medium',
    },
  };
}

describe('portrait model and vector synthesis', () => {
  it('extracts facial features cleanly with valid coordinates', () => {
    const lms = createSyntheticLandmarks();
    const features = extractFacialFeatures(lms);

    expect(features.faceOutline.length).toBeGreaterThan(10);
    expect(features.leftEyeContour.length).toBeGreaterThan(5);
    expect(features.rightEyeContour.length).toBeGreaterThan(5);
    expect(features.leftPupil.x).toBeGreaterThan(0);
    expect(features.rightPupil.x).toBeGreaterThan(0);
    expect(features.chinTip.y).toBeGreaterThan(features.foreheadTop.y);
  });

  it('classifies distinct face shapes correctly', () => {
    // Standard proportions
    const standardLms = createSyntheticLandmarks({ widthScale: 1.0, heightScale: 1.0 });
    const standardFeatures = extractFacialFeatures(standardLms);
    const standardShape = classifyFaceShape(standardFeatures);
    expect(['oval', 'round', 'square', 'heart', 'oblong']).toContain(standardShape);

    // Oblong (elongated face, narrow width)
    const oblongLms = createSyntheticLandmarks({ widthScale: 0.6, heightScale: 1.4 });
    const oblongFeatures = extractFacialFeatures(oblongLms);
    expect(classifyFaceShape(oblongFeatures)).toBe('oblong');
  });

  it('synthesizes all 10 independent layers in portrait model (strictly face-only)', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);

    expect(model.layers.length).toBe(10);
    expect(model.layers[0].id).toBe('layer-background');
    expect(model.layers[1].id).toBe('layer-ears');
    expect(model.layers[2].id).toBe('layer-face-silhouette');
    expect(model.layers[3].id).toBe('layer-hair');
    expect(model.layers[4].id).toBe('layer-facial-shadows');
    expect(model.layers[5].id).toBe('layer-eyebrows-eyes');
    expect(model.layers[6].id).toBe('layer-nose');
    expect(model.layers[7].id).toBe('layer-mouth-lips');
    expect(model.layers[8].id).toBe('layer-facial-hair');
    expect(model.layers[9].id).toBe('layer-highlights');

    // Strict product rule: NO neck, NO shoulders, NO torso, NO circular halo
    const allShapeIds = model.layers.flatMap((l) => l.shapes.map((s) => s.id));
    expect(allShapeIds).not.toContain('neck-base');
    expect(allShapeIds).not.toContain('neck-underjaw-shadow');
    expect(allShapeIds).not.toContain('bg-accent-halo');
    expect(allShapeIds).not.toContain('hair-back-drape');
  });

  it('renders valid standalone SVG with zero raster image embeds', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    // Verify SVG structure
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 1000 1000"');
    expect(svg).toContain('</svg>');

    // Critical product requirement: Zero photographic / raster image embedding
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('data:image/');
    expect(svg).not.toContain('base64');

    // Strict product requirement: Zero neck, shoulders, or halo decoration
    expect(svg).not.toContain('id="neck-base"');
    expect(svg).not.toContain('id="bg-accent-halo"');

    // Quality requirement: No NaN coordinates or malformed numbers
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('undefined');
    expect(svg).not.toContain('null');

    // Layer groups and semantic IDs present
    expect(svg).toContain('id="layer-background"');
    expect(svg).toContain('id="canvas-bg"');
    expect(svg).toContain('id="layer-face-silhouette"');
    expect(svg).toContain('id="layer-eyebrows-eyes"');
    expect(svg).toContain('id="eyebrow-left"');
    expect(svg).toContain('id="eye-sclera-left"');
    expect(svg).toContain('id="pupil-left"');
    expect(svg).toContain('id="catchlight-left"');
  });

  it('renders SVG defs with eye sclera clipping to prevent unclipped pupil overflow', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(model.clipDefs).toBeDefined();
    expect(model.clipDefs?.length).toBe(2);
    expect(svg).toContain('<defs>');
    expect(svg).toContain('<clipPath id="clip-sclera-left">');
    expect(svg).toContain('<clipPath id="clip-sclera-right">');
    expect(svg).toContain('clip-path="url(#clip-sclera-left)"');
    expect(svg).toContain('clip-path="url(#clip-sclera-right)"');
  });

  it('renders curved dental arch when smiling', () => {
    const lms = createSyntheticLandmarks();
    // Move inner lower lip down to simulate open smile (>14px gap)
    lms[14] = { x: 0.5, y: 0.70, z: 0 };
    for (let i = 0; i < lms.length; i++) {
      if (lms[i].y > 0.64 && lms[i].y < 0.75) {
        lms[i] = { ...lms[i], y: lms[i].y + 0.05 };
      }
    }
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="mouth-oral-cavity"');
    expect(svg).toContain('id="mouth-teeth"');
  });

  it('renders mandibular beard polygon with high density when full beard detected', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    analysis.facialHairEstimate.hasFullBeard = true;
    analysis.facialHairEstimate.density = 'heavy';
    analysis.facialHairEstimate.chinCleftRegion = [
      { x: 0.49, y: 0.78 },
      { x: 0.50, y: 0.77 },
      { x: 0.51, y: 0.78 },
      { x: 0.50, y: 0.80 },
    ];
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="beard-main"');
    expect(svg).toContain('id="chin-cleft-accent"');
    expect(svg).toContain('id="mustache-main"');
  });

  it('renders volumetric gradients in SVG defs for skin, hair, eyes, and beard', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="skin-volume-grad"');
    expect(svg).toContain('id="hair-base-grad"');
    expect(svg).toContain('id="beard-body-grad"');
    expect(svg).toContain('id="iris-grad-left"');
    expect(svg).toContain('id="teeth-dental-grad"');
  });

  it('renders nasolabial smile lines and eyelid creases when present', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    analysis.features.leftNasolabial = [
      { x: 0.46, y: 0.54 },
      { x: 0.44, y: 0.58 },
      { x: 0.42, y: 0.62 },
    ];
    analysis.features.rightNasolabial = [
      { x: 0.54, y: 0.54 },
      { x: 0.56, y: 0.58 },
      { x: 0.58, y: 0.62 },
    ];
    analysis.features.mentalCrease = [
      { x: 0.48, y: 0.70 },
      { x: 0.50, y: 0.71 },
      { x: 0.52, y: 0.70 },
    ];
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="crease-nasolabial-left"');
    expect(svg).toContain('id="crease-nasolabial-right"');
    expect(svg).toContain('id="crease-mental-groove"');
  });

  it('renders forehead fringe curl clusters when hair detected', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    analysis.hairEstimate.detected = true;
    analysis.hairEstimate.fringeLocks = [
      [
        { x: 0.44, y: 0.31 },
        { x: 0.46, y: 0.33 },
        { x: 0.48, y: 0.32 },
        { x: 0.46, y: 0.30 },
      ],
    ];
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);
    expect(svg).toContain('id="hair-fringe-0"');
  });

  it('renders detailed anatomical nose with alar wings, columella, and teardrop nostrils', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    analysis.features.leftNasalSidewall = [
      { x: 0.47, y: 0.46 },
      { x: 0.45, y: 0.50 },
      { x: 0.44, y: 0.53 },
    ];
    analysis.features.rightNasalSidewall = [
      { x: 0.53, y: 0.46 },
      { x: 0.55, y: 0.50 },
      { x: 0.56, y: 0.53 },
    ];
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="nose-dorsum-plane"');
    expect(svg).toContain('id="nose-tip-facet"');
    expect(svg).toContain('id="alar-wing-left"');
    expect(svg).toContain('id="alar-wing-right"');
    expect(svg).toContain('id="alar-crease-left"');
    expect(svg).toContain('id="alar-crease-right"');
    expect(svg).toContain('id="nose-columella-shadow"');
    expect(svg).toContain('id="nostril-left-aperture"');
    expect(svg).toContain('id="nostril-right-aperture"');
    expect(svg).toContain('id="nose-sidewall-left"');
    expect(svg).toContain('id="nose-sidewall-right"');
  });

  it('renders canvas with bright, light, warm ivory background providing clear contrast', () => {
    const lms = createSyntheticLandmarks();
    const analysis = createSyntheticAnalysis(lms);
    const model = buildPortraitModel(analysis, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('id="canvas-bg"');
    expect(model.palette.background).toBeDefined();
    // Verify bright background (luminance > 0.85)
    const bgLum = (0.299 * model.palette.background.r + 0.587 * model.palette.background.g + 0.114 * model.palette.background.b) / 255;
    expect(bgLum).toBeGreaterThan(0.85);
  });

  it('reconstructs voluminous curly hair with high apex and integrated scalloped fringe bangs', () => {
    const lms = createSyntheticLandmarks();
    const features = extractFacialFeatures(lms);
    const mockSampler = {
      sampleRegion: () => ({ r: 25, g: 25, b: 28 }),
      samplePixel: () => ({ r: 25, g: 25, b: 28 }),
      sampleColorCluster: () => ({ dominant: { r: 25, g: 25, b: 28 }, clusters: [] }),
      estimateLightingDirection: () => 'frontal',
      probeBoundary: () => ({ x: 0.5, y: 0.10 }),
    } as unknown as ColorSampler;

    const palette = {
      skinBase: { r: 215, g: 168, b: 135 },
      hairPrimary: { r: 25, g: 25, b: 28 },
    } as any;

    const hair = estimateHairstyle(features, mockSampler, palette);
    expect(hair.detected).toBe(true);
    expect(hair.silhouettePoints.length).toBeGreaterThan(20);

    // Verify crown volume: apex is well above foreheadTop
    const minY = Math.min(...hair.silhouettePoints.map((p) => p.y));
    const faceH = features.chinTip.y - features.foreheadTop.y;
    expect(features.foreheadTop.y - minY).toBeGreaterThanOrEqual(faceH * 0.20);
  });

  it('reconstructs mandibular beard leaving bare skin clearance around lips and soul patch', () => {
    const lms = createSyntheticLandmarks();
    const features = extractFacialFeatures(lms);
    const mockSampler = {
      sampleRegion: () => ({ r: 20, g: 20, b: 22 }),
      samplePixel: () => ({ r: 20, g: 20, b: 22 }),
      sampleColorCluster: () => ({ dominant: { r: 20, g: 20, b: 22 }, clusters: [] }),
      estimateLightingDirection: () => 'frontal',
      probeBoundary: () => ({ x: 0.5, y: 0.70 }),
    } as unknown as ColorSampler;

    const palette = {
      skinBase: { r: 215, g: 168, b: 135 },
      hairPrimary: { r: 25, g: 25, b: 28 },
    } as any;

    const facialHair = estimateFacialHair(features, mockSampler, palette);
    expect(facialHair.hasBeard).toBe(true);
    expect(facialHair.beardRegion.length).toBeGreaterThan(10);

    // Verify beard top boundary stays below lower lip
    const lowerLipY = features.lowerLipOuter[features.lowerLipOuter.length - 1].y;
    const beardCenterPts = facialHair.beardRegion.filter(
      (p) => Math.abs(p.x - features.mouthCenter.x) < 0.08 && p.y > features.mouthCenter.y
    );
    expect(beardCenterPts.length).toBeGreaterThan(0);
    for (const pt of beardCenterPts) {
      expect(pt.y).toBeGreaterThan(lowerLipY);
    }
  });

  it('correctly classifies a clean-shaven person with zero beard or mustache and high confidence', () => {
    const lms = createSyntheticLandmarks();
    const features = extractFacialFeatures(lms);
    // Mock sampler returning uniform fair skin pixels across face, cheeks, philtrum, jawline, and chin
    const mockSampler = {
      sampleRegion: (pt: { x: number; y: number }) => {
        // Crown & neck probes: hair
        if (pt.y < features.foreheadTop.y || pt.y > features.chinTip.y) {
          return { r: 25, g: 25, b: 28 };
        }
        // Face skin
        return { r: 225, g: 185, b: 155 };
      },
      samplePixel: () => ({ r: 225, g: 185, b: 155 }),
      sampleColorCluster: () => ({ dominant: { r: 25, g: 25, b: 28 }, clusters: [] }),
      estimateLightingDirection: () => 'frontal',
      probeBoundary: () => ({ x: 0.5, y: 0.10 }),
    } as unknown as ColorSampler;

    const palette = {
      rawSkinBase: { r: 225, g: 185, b: 155 },
      rawSkinLum: 0.72,
      skinBase: { r: 246, g: 222, b: 202 },
      hairPrimary: { r: 25, g: 25, b: 28 },
    } as any;

    const facialHair = estimateFacialHair(features, mockSampler, palette);
    expect(facialHair.hasBeard).toBe(false);
    expect(facialHair.hasMustache).toBe(false);
    expect(facialHair.hasGoatee).toBe(false);
    expect(facialHair.hasFullBeard).toBe(false);
    expect(facialHair.density).toBe('none');
    expect(facialHair.beardRegion.length).toBe(0);
    expect(facialHair.mustacheRegion.length).toBe(0);
    expect(facialHair.metrics?.isCleanShavenConfidence).toBeGreaterThan(0.70);
  });

  it('detects long hair with middle parting and synthesizes backHairPoints cascading behind face', () => {
    const lms = createSyntheticLandmarks();
    const features = extractFacialFeatures(lms);
    const mockSampler = {
      sampleRegion: (pt: { x: number; y: number }) => {
        // Crown (above foreheadTop): dark hair
        if (pt.y < features.foreheadTop.y) {
          return { r: 22, g: 20, b: 24 };
        }
        // Lateral neck/shoulders: dark long hair
        if (pt.y > features.chinTip.y - 0.05 && (pt.x < 0.40 || pt.x > 0.60)) {
          return { r: 22, g: 20, b: 24 };
        }
        // Forehead center (between foreheadTop and brows): skin (middle part)
        if (Math.abs(pt.x - 0.5) < 0.05 && pt.y >= features.foreheadTop.y && pt.y < features.noseBridge[0].y) {
          return { r: 225, g: 185, b: 155 };
        }
        // Cheeks: skin
        return { r: 225, g: 185, b: 155 };
      },
      samplePixel: () => ({ r: 22, g: 20, b: 24 }),
      sampleColorCluster: () => ({ dominant: { r: 22, g: 20, b: 24 }, clusters: [] }),
      estimateLightingDirection: () => 'frontal',
      probeBoundary: () => ({ x: 0.5, y: 0.10 }),
    } as unknown as ColorSampler;

    const baseAnalysis = createSyntheticAnalysis(lms);
    const palette = {
      ...baseAnalysis.palette,
      rawSkinBase: { r: 225, g: 185, b: 155 },
      rawSkinLum: 0.72,
      skinBase: { r: 246, g: 222, b: 202 },
      hairPrimary: { r: 22, g: 20, b: 24 },
      hairSecondary: { r: 45, g: 40, b: 48 },
    };

    const hair = estimateHairstyle(features, mockSampler, palette);
    expect(hair.detected).toBe(true);
    expect(hair.length).toBe('long');
    expect(hair.parting).toBe('middle');
    expect(hair.hasLongHairSides).toBe(true);
    expect(hair.backHairPoints).toBeDefined();
    expect(hair.backHairPoints!.length).toBeGreaterThan(15);

    // Build portrait model and verify Layer 2 includes hair-back-silhouette and Layer 9 is hidden
    const analysis: FaceAnalysis = {
      features,
      palette,
      hairEstimate: hair,
      facialHairEstimate: {
        hasBeard: false,
        hasMustache: false,
        hasGoatee: false,
        hasFullBeard: false,
        beardRegion: [],
        mustacheRegion: [],
        color: palette.hairPrimary,
        beardShadowColor: palette.hairPrimary,
        density: 'none',
      },
      faceShape: 'oval',
      faceCenter: { x: 0.5, y: 0.5 },
      faceWidth: 0.4,
      faceHeight: 0.55,
      faceAngle: 0,
      imageWidth: 800,
      imageHeight: 1000,
      selectedFaceIndex: 0,
      totalFacesDetected: 1,
      analysisTimeMs: 20,
    };

    const model = buildPortraitModel(analysis, 1000, 1000);
    const layer2 = model.layers.find((l) => l.id === 'layer-ears');
    expect(layer2).toBeDefined();
    const backHairShape = layer2!.shapes.find((s) => s.id === 'hair-back-silhouette');
    expect(backHairShape).toBeDefined();

    const layer9 = model.layers.find((l) => l.id === 'layer-facial-hair');
    expect(layer9).toBeDefined();
    expect(layer9!.shapes.length).toBe(0);
    expect(layer9!.visible).toBe(false);

    const svg = renderPortraitSvg(model);
    expect(svg).toContain('id="hair-back-silhouette"');
    expect(svg).not.toContain('id="beard-main"');
    expect(svg).not.toContain('id="mustache-main"');
  });
});

