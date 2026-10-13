import { describe, it, expect } from 'vitest';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { extractFacialFeatures, classifyFaceShape } from '../faceAnalyzer';
import { estimateFacialHair, estimateHairstyle } from '../heuristicFeatures';
import { ColorSampler } from '../colorSampler';
import { PortraitPalette } from '../../types/portrait';

function createDummyLandmarks(): NormalizedLandmark[] {
  const lms: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    lms.push({ x: 0.5, y: 0.5, z: 0 });
  }
  lms[10] = { x: 0.5, y: 0.25, z: 0 }; // forehead top
  lms[152] = { x: 0.5, y: 0.80, z: 0 }; // chin tip
  lms[127] = { x: 0.3, y: 0.45, z: 0 }; // temple left
  lms[356] = { x: 0.7, y: 0.45, z: 0 }; // temple right
  lms[468] = { x: 0.4, y: 0.44, z: 0 }; // left iris
  lms[473] = { x: 0.6, y: 0.44, z: 0 }; // right iris
  lms[4] = { x: 0.5, y: 0.52, z: 0 }; // nose tip
  lms[13] = { x: 0.5, y: 0.64, z: 0 }; // mouth center
  lms[0] = { x: 0.5, y: 0.62, z: 0 }; // upper lip
  lms[17] = { x: 0.5, y: 0.66, z: 0 }; // lower lip
  return lms;
}

const mockPalette: PortraitPalette = {
  skinBase: { r: 215, g: 170, b: 140 },
  skinShadow: { r: 165, g: 130, b: 105 },
  skinShadowDeep: { r: 135, g: 100, b: 80 },
  skinHighlight: { r: 240, g: 200, b: 175 },
  skinToneWarmer: { r: 225, g: 175, b: 145 },
  hairPrimary: { r: 35, g: 25, b: 20 },
  hairSecondary: { r: 65, g: 50, b: 40 },
  eyeColor: { r: 50, g: 35, b: 25 },
  irisOuterRing: { r: 25, g: 18, b: 12 },
  lipColor: { r: 180, g: 85, b: 80 },
  lipShadow: { r: 130, g: 55, b: 50 },
  lipHighlight: { r: 210, g: 110, b: 105 },
  eyebrowColor: { r: 30, g: 22, b: 18 },
  beardColor: { r: 32, g: 24, b: 20 },
  beardShadowColor: { r: 18, g: 14, b: 10 },
  background: { r: 18, g: 22, b: 30 },
  neckShadow: { r: 140, g: 105, b: 80 },
  lightDirection: 'frontal',
};

describe('heuristic features and conservative fallbacks', () => {
  it('applies conservative fallbacks when sampler cannot detect hair or facial hair', () => {
    const lms = createDummyLandmarks();
    const features = extractFacialFeatures(lms);

    // Mock color sampler that returns uniform skin color everywhere
    const uniformSampler = {
      sampleRegion: () => ({ r: 215, g: 170, b: 140 }),
      samplePixel: () => ({ r: 215, g: 170, b: 140 }),
      sampleAt: () => ({ r: 215, g: 170, b: 140 }),
      sampleAverage: () => ({ r: 215, g: 170, b: 140 }),
      sampleAlongPath: () => ({ samples: [], average: { r: 215, g: 170, b: 140 } }),
      isRegionDarkerThan: () => false,
      colorContrastRatio: () => 0,
      probeBoundary: () => ({ x: 0.5, y: 0.2 }),
      estimateLightingDirection: () => 'frontal' as const,
      sampleColorCluster: () => ({
        dominant: { r: 35, g: 25, b: 20 },
        secondary: { r: 65, g: 50, b: 40 },
        variance: 0.05,
      }),
      dispose: () => {},
    } as unknown as ColorSampler;

    // Hairstyle should gracefully construct short default silhouette
    const hair = estimateHairstyle(features, uniformSampler, mockPalette);
    expect(hair.silhouettePoints.length).toBeGreaterThan(0);
    expect(hair.length).toBe('short');

    // Facial hair should conservatively report clean-shaven (no random beard)
    const facialHair = estimateFacialHair(features, uniformSampler, mockPalette);
    expect(facialHair.hasBeard).toBe(false);
    expect(facialHair.hasMustache).toBe(false);
    expect(facialHair.density).toBe('none');
  });

  it('handles low-quality or partially out-of-bounds landmarks gracefully without throwing', () => {
    // Malformed/sparse landmark array
    const sparseLandmarks: NormalizedLandmark[] = [
      { x: 0.5, y: 0.5, z: 0 },
      { x: 0.4, y: 0.4, z: 0 },
    ];

    const features = extractFacialFeatures(sparseLandmarks);
    expect(features.faceOutline).toBeDefined();
    expect(features.chinTip.x).toBeGreaterThanOrEqual(0);
    expect(features.chinTip.x).toBeLessThanOrEqual(1);

    const shape = classifyFaceShape(features);
    expect(['oval', 'round', 'square', 'heart', 'oblong']).toContain(shape);
  });
});
