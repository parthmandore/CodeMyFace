import { describe, it, expect } from 'vitest';
import { extractHairGeometryFromMask } from '../../services/segmentation/contourExtractor';
import { estimateHairstyle } from '../heuristicFeatures';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import { shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';
import { ColorSampler } from '../colorSampler';
import { FaceAnalysis, FacialFeatures } from '../../types/portrait';

/**
 * Creates a blank 256x256 multiclass mask (all 0: Background)
 */
function createBlankMask(w = 256, h = 256): Uint8Array {
  return new Uint8Array(w * h);
}

/**
 * Fills an elliptical region in the mask with a class ID
 */
function fillMaskEllipse(
  mask: Uint8Array,
  w: number,
  h: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  classId: number
) {
  const minX = Math.max(0, Math.floor(cx - rx));
  const maxX = Math.min(w - 1, Math.ceil(cx + rx));
  const minY = Math.max(0, Math.floor(cy - ry));
  const maxY = Math.min(h - 1, Math.ceil(cy + ry));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        mask[y * w + x] = classId;
      }
    }
  }
}

/**
 * Fills a rectangular region in the mask with a class ID
 */
function fillMaskRect(
  mask: Uint8Array,
  w: number,
  h: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  classId: number
) {
  const startX = Math.max(0, Math.min(w - 1, Math.floor(x1)));
  const endX = Math.max(0, Math.min(w - 1, Math.ceil(x2)));
  const startY = Math.max(0, Math.min(h - 1, Math.floor(y1)));
  const endY = Math.max(0, Math.min(h - 1, Math.ceil(y2)));

  for (let y = startY; y <= endY; y++) {
    for (let x = startX; x <= endX; x++) {
      mask[y * w + x] = classId;
    }
  }
}

/**
 * Creates a neutral mock color sampler
 */
function createMockSampler(): ColorSampler {
  return {
    sampleRegion: () => ({ r: 246, g: 222, b: 202 }),
    samplePixel: () => ({ r: 246, g: 222, b: 202 }),
    sampleAt: () => ({ r: 246, g: 222, b: 202 }),
    sampleAverage: () => ({ r: 246, g: 222, b: 202 }),
    sampleAlongPath: () => ({ samples: [], average: { r: 246, g: 222, b: 202 } }),
    isRegionDarkerThan: () => false,
    colorContrastRatio: () => 0,
    probeBoundary: () => ({ x: 0.5, y: 0.2 }),
    estimateLightingDirection: () => 'frontal',
    sampleColorCluster: () => ({
      dominant: { r: 35, g: 25, b: 20 },
      secondary: { r: 55, g: 45, b: 35 },
      variance: 0.05,
    }),
    dispose: () => {},
  } as unknown as ColorSampler;
}

describe('Phase 4: Hair Reconstruction from Segmentation Suite', () => {
  const features: FacialFeatures = shortHairCleanShavenFixture.features;
  const mockSampler = createMockSampler();
  const palette = shortHairCleanShavenFixture.palette;
  const W = 256;
  const H = 256;

  // -------------------------------------------------------------------------
  // Test 1: Dark clothing rejection
  // -------------------------------------------------------------------------
  it('strictly isolates Class 4 (Clothes) and rejects clothing near neck from generating long hair', () => {
    const mask = createBlankMask(W, H);

    // 1. Paint short cranial hair (Class 1) above forehead only
    // Forehead is around y=0.28 (~row 71), chin is around y=0.72 (~row 184)
    fillMaskEllipse(mask, W, H, 128, 65, 45, 35, 1); // Hair Class 1

    // 2. Paint dark clothing (Class 4) below chin around neck and shoulders
    // Rows 180 to 250 across width 60 to 196
    fillMaskRect(mask, W, H, 60, 180, 196, 250, 4); // Clothes Class 4

    const segResult = extractHairGeometryFromMask(mask, W, H, features);

    expect(segResult.hasHair).toBe(true);
    expect(segResult.provenance).toBe('segmentation-mask-derived');
    expect(segResult.metrics?.clothesPixelCountAroundNeck).toBeGreaterThan(100);
    expect(segResult.metrics?.hasLongHair).toBe(false);
    expect(segResult.backHairPoints).toBeUndefined();

    // Run heuristic feature estimator with this segmentation
    const hair = estimateHairstyle(features, mockSampler, palette, segResult);
    expect(hair.detected).toBe(true);
    expect(hair.provenance).toBe('segmentation-mask-derived');
    expect(hair.length).toBe('short');
    expect(hair.hasLongHairSides).toBe(false);
    expect(hair.backHairPoints).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 2: Genuine long hair extraction
  // -------------------------------------------------------------------------
  it('extracts genuine long hair cascading past chin into backHairPoints with correct layering', () => {
    const mask = createBlankMask(W, H);

    // 1. Upper crown hair (Class 1)
    fillMaskEllipse(mask, W, H, 128, 65, 48, 38, 1);

    // 2. Cascading hair sides extending far below the chin (chin is y=0.72 -> row 184)
    // Left curtain down to row 235 (y=0.92)
    fillMaskRect(mask, W, H, 70, 70, 95, 235, 1);
    // Right curtain down to row 235 (y=0.92)
    fillMaskRect(mask, W, H, 161, 70, 186, 235, 1);

    // 3. Clear center face column (Classes 3 Face-skin and 0) so parting is middle
    fillMaskRect(mask, W, H, 105, 75, 151, 235, 0);

    const segResult = extractHairGeometryFromMask(mask, W, H, features);

    expect(segResult.hasHair).toBe(true);
    expect(segResult.metrics?.hasLongHair).toBe(true);
    expect(segResult.metrics?.hasLongHairLeft).toBe(true);
    expect(segResult.metrics?.hasLongHairRight).toBe(true);
    expect(segResult.backHairPoints).toBeDefined();
    expect(segResult.backHairPoints!.length).toBeGreaterThan(6);

    // Verify back hair points contain coordinates significantly below the chin
    const ptsBelowChin = segResult.backHairPoints!.filter((p) => p.y > features.chinTip.y + 0.05);
    expect(ptsBelowChin.length).toBeGreaterThan(0);

    const hair = estimateHairstyle(features, mockSampler, palette, segResult);
    expect(hair.length).toBe('long');
    expect(hair.hasLongHairSides).toBe(true);
    expect(hair.backHairPoints).toBeDefined();

    // Verify SVG portrait synthesis puts back hair in Layer 2 (behind face and ears)
    const analysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: hair,
    };
    const model = buildPortraitModel(analysis, 500, 600);
    const layer2 = model.layers.find((l) => l.id === 'layer-ears');
    expect(layer2).toBeDefined();
    const backHairShape = layer2?.shapes.find((s) => s.id === 'hair-back-silhouette');
    expect(backHairShape).toBeDefined();
    expect(backHairShape?.provenance).toBe('segmentation-mask-derived');
  });

  // -------------------------------------------------------------------------
  // Test 3: Left-right asymmetry preservation
  // -------------------------------------------------------------------------
  it('faithfully preserves natural left-right asymmetry in hair drape and length', () => {
    const mask = createBlankMask(W, H);

    // Crown hair
    fillMaskEllipse(mask, W, H, 128, 65, 48, 38, 1);

    // Left side: long side-swept hair cascading down past chin to row 230 (y ~ 0.90)
    fillMaskRect(mask, W, H, 70, 70, 98, 230, 1);

    // Right side: short / tucked hair terminating at ear level around row 115 (y ~ 0.45)
    fillMaskRect(mask, W, H, 158, 70, 180, 115, 1);

    // Face clear
    fillMaskRect(mask, W, H, 102, 75, 154, 230, 0);

    const segResult = extractHairGeometryFromMask(mask, W, H, features);

    expect(segResult.hasHair).toBe(true);
    expect(segResult.metrics?.hasLongHairLeft).toBe(true);
    expect(segResult.metrics?.hasLongHairRight).toBe(false);
    expect(segResult.metrics?.isAsymmetric).toBe(true);
    expect(segResult.metrics!.leftMaxY).toBeGreaterThan(segResult.metrics!.rightMaxY + 0.25);

    const hair = estimateHairstyle(features, mockSampler, palette, segResult);
    expect(hair.detected).toBe(true);
    expect(hair.length).toBe('long');
    expect(hair.backHairPoints).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Test 4: Middle parting vs. Bangs detection
  // -------------------------------------------------------------------------
  it('correctly distinguishes middle parting from forehead bangs based on center mask occupancy', () => {
    // Case 4A: Middle parting (center forehead clear, hair on sides)
    const middlePartMask = createBlankMask(W, H);
    fillMaskEllipse(middlePartMask, W, H, 128, 65, 48, 38, 1);
    // Cut open the center forehead column
    fillMaskRect(middlePartMask, W, H, 120, 50, 136, 110, 0);

    const midResult = extractHairGeometryFromMask(middlePartMask, W, H, features);
    expect(midResult.metrics?.parting).toBe('middle');

    // Case 4B: Bangs (hair solidly covers the entire forehead down to brow level)
    const bangsMask = createBlankMask(W, H);
    fillMaskEllipse(bangsMask, W, H, 128, 75, 52, 45, 1);
    // Solid fringe across forehead
    fillMaskRect(bangsMask, W, H, 95, 60, 160, 100, 1);

    const bangsResult = extractHairGeometryFromMask(bangsMask, W, H, features);
    expect(bangsResult.metrics?.parting).toBe('bangs');
  });

  // -------------------------------------------------------------------------
  // Test 5: Missing / empty segmentation fallback
  // -------------------------------------------------------------------------
  it('falls back gracefully to conservative landmark geometry with provenance landmark-derived when segmentation is missing or empty', () => {
    // 1. Completely empty mask
    const emptyMask = createBlankMask(W, H);
    const emptyResult = extractHairGeometryFromMask(emptyMask, W, H, features);
    expect(emptyResult.hasHair).toBe(false);
    expect(emptyResult.provenance).toBe('fallback');

    // When passing undefined or fallback segmentation to estimateHairstyle
    const fallbackHair = estimateHairstyle(features, mockSampler, palette, undefined);
    expect(fallbackHair.detected).toBe(true);
    expect(fallbackHair.provenance).toBe('landmark-derived');
    expect(fallbackHair.length).toBe('short');
    expect(fallbackHair.silhouettePoints.length).toBeGreaterThan(0);

    // Verify SVG portrait model builds without throwing
    const analysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: fallbackHair,
    };
    const model = buildPortraitModel(analysis, 500, 600);
    const hairLayer = model.layers.find((l) => l.id === 'layer-hair');
    expect(hairLayer).toBeDefined();
    const hairSilhouette = hairLayer?.shapes.find((s) => s.id === 'hair-silhouette');
    expect(hairSilhouette?.provenance).toBe('landmark-derived');

    // SVG string renders cleanly
    const svgStr = renderPortraitSvg(model);
    expect(svgStr).toContain('<svg');
    expect(svgStr).toContain('hair-silhouette');
  });

  // -------------------------------------------------------------------------
  // Test 6: Face geometry invariance
  // -------------------------------------------------------------------------
  it('guarantees that facial feature coordinates (eyes, nose, mouth, jawline) are 100% invariant between short and long hair', () => {
    // Short hair analysis
    const shortHairAnalysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: {
        ...shortHairCleanShavenFixture.hairEstimate,
        length: 'short',
        silhouettePoints: [
          { x: 0.30, y: 0.35 },
          { x: 0.50, y: 0.18 },
          { x: 0.70, y: 0.35 },
        ],
        backHairPoints: undefined,
        hasLongHairSides: false,
      },
    };

    // Long cascading hair analysis with huge bounding box
    const longHairAnalysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: {
        ...shortHairCleanShavenFixture.hairEstimate,
        length: 'long',
        silhouettePoints: [
          { x: 0.20, y: 0.95 },
          { x: 0.50, y: 0.12 },
          { x: 0.80, y: 0.95 },
        ],
        backHairPoints: [
          { x: 0.15, y: 0.99 },
          { x: 0.50, y: 0.10 },
          { x: 0.85, y: 0.99 },
        ],
        hasLongHairSides: true,
      },
    };

    const shortModel = buildPortraitModel(shortHairAnalysis, 500, 600);
    const longModel = buildPortraitModel(longHairAnalysis, 500, 600);

    // Helper to find shape pathData
    const findPath = (m: typeof shortModel, layerName: string, shapeId: string) => {
      const layer = m.layers.find((l) => l.name === layerName);
      const shape = layer?.shapes.find((s) => s.id === shapeId);
      return shape?.pathData;
    };

    // 1. Face Silhouette must be 100% byte-for-byte identical
    expect(findPath(shortModel, 'Face Silhouette & Jawline', 'face-contour')).toBe(
      findPath(longModel, 'Face Silhouette & Jawline', 'face-contour')
    );

    // 2. Eyes must be 100% byte-for-byte identical
    expect(findPath(shortModel, 'Eyes & Eyebrows', 'eye-left-sclera')).toBe(
      findPath(longModel, 'Eyes & Eyebrows', 'eye-left-sclera')
    );
    expect(findPath(shortModel, 'Eyes & Eyebrows', 'eye-right-sclera')).toBe(
      findPath(longModel, 'Eyes & Eyebrows', 'eye-right-sclera')
    );

    // 3. Eyebrows must be 100% byte-for-byte identical
    expect(findPath(shortModel, 'Eyes & Eyebrows', 'eyebrow-left')).toBe(
      findPath(longModel, 'Eyes & Eyebrows', 'eyebrow-left')
    );
    expect(findPath(shortModel, 'Eyes & Eyebrows', 'eyebrow-right')).toBe(
      findPath(longModel, 'Eyes & Eyebrows', 'eyebrow-right')
    );

    // 4. Nose must be 100% byte-for-byte identical
    expect(findPath(shortModel, 'Nose Structure', 'nose-base')).toBe(
      findPath(longModel, 'Nose Structure', 'nose-base')
    );

    // 5. Mouth must be 100% byte-for-byte identical
    expect(findPath(shortModel, 'Mouth & Lips', 'lip-upper')).toBe(
      findPath(longModel, 'Mouth & Lips', 'lip-upper')
    );
    expect(findPath(shortModel, 'Mouth & Lips', 'lip-lower')).toBe(
      findPath(longModel, 'Mouth & Lips', 'lip-lower')
    );
  });

  // -------------------------------------------------------------------------
  // Test 7: Crown tuck invariance (No crown lobes / cat-ears in Layer 2)
  // -------------------------------------------------------------------------
  it('tucks backHairPoints below forehead level so back hair cannot protrude above cranial apex', () => {
    const mask = createBlankMask(W, H);
    // Upper crown hair (Class 1) peaking at row 50
    fillMaskEllipse(mask, W, H, 128, 65, 48, 38, 1);
    // Long lateral hair extending past chin
    fillMaskRect(mask, W, H, 70, 70, 95, 235, 1);
    fillMaskRect(mask, W, H, 161, 70, 186, 235, 1);
    fillMaskRect(mask, W, H, 105, 75, 151, 235, 0);

    const segResult = extractHairGeometryFromMask(mask, W, H, features);
    expect(segResult.backHairPoints).toBeDefined();

    const tuckY = features.foreheadTop.y + (features.chinTip.y - features.foreheadTop.y) * 0.08;
    // Every single point in backHairPoints must satisfy y >= tuckY
    for (const pt of segResult.backHairPoints!) {
      expect(pt.y).toBeGreaterThanOrEqual(tuckY - 1e-5);
    }
  });

  // -------------------------------------------------------------------------
  // Test 8: Disconnected shoulder cardigan bleed rejection (D3)
  // -------------------------------------------------------------------------
  it('rejects disconnected shoulder clothing clusters (D3) even with >= 80 pixels due to spatial continuity failure', () => {
    const mask = createBlankMask(W, H);
    // Short cranial hair ending at row 95 (well above ears)
    fillMaskEllipse(mask, W, H, 128, 65, 45, 30, 1);

    // Disconnected cluster of 100 pixels on right shoulder / cardigan (rows 210 to 220)
    // There is a vertical gap of > 100 rows between hair at row 95 and cardigan at row 210
    fillMaskRect(mask, W, H, 165, 210, 185, 220, 1); // 21 * 11 = 231 pixels

    const segResult = extractHairGeometryFromMask(mask, W, H, features);
    expect(segResult.metrics?.hasLongHairRight).toBe(false);
    expect(segResult.metrics?.hasLongHair).toBe(false);
    expect(segResult.backHairPoints).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Test 9: Hair strand vector curve styling & highlight deduplication (D2, D4)
  // -------------------------------------------------------------------------
  it('renders hair strands as open vector curves with fill: none and avoids duplicate highlights in Layer 10', () => {
    const hair = estimateHairstyle(features, mockSampler, palette, {
      hasHairSegmentation: true,
      provenance: 'segmentation-mask-derived',
      silhouettePoints: [
        { x: 0.30, y: 0.28 },
        { x: 0.35, y: 0.22 },
        { x: 0.42, y: 0.18 },
        { x: 0.50, y: 0.15 },
        { x: 0.58, y: 0.18 },
        { x: 0.65, y: 0.22 },
        { x: 0.70, y: 0.28 },
        { x: 0.65, y: 0.40 },
        { x: 0.35, y: 0.40 },
      ],
      hairDetectedConfidence: 0.9,
    });

    const analysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: hair,
    };
    const model = buildPortraitModel(analysis, 1000, 1000);

    // 1. Hair strands in Layer 4 must have fill === 'none'
    const hairLayer = model.layers.find((l) => l.id === 'layer-hair');
    expect(hairLayer).toBeDefined();
    const strands = hairLayer!.shapes.filter((s) => s.id.startsWith('hair-facet-'));
    expect(strands.length).toBeGreaterThan(0);
    for (const strand of strands) {
      expect(strand.fill).toBe('none');
      expect(strand.strokeWidth).toBeGreaterThan(1.5);
    }

    // 2. Highlights in Layer 10 must NOT contain hair highlights (only skin/facial highlights)
    const highlightsLayer = model.layers.find((l) => l.id === 'layer-highlights');
    expect(highlightsLayer).toBeDefined();
    const hairShineInLayer10 = highlightsLayer!.shapes.filter((s) => s.id.includes('hair'));
    expect(hairShineInLayer10.length).toBe(0);
  });
});
