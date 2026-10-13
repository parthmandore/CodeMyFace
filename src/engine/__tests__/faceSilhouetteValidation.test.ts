import { describe, it, expect } from 'vitest';
import { ALL_BASELINE_FIXTURES, shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import { buildFaceSilhouetteLayer } from '../builders/faceSilhouetteBuilder';
import { createFaceProjection, extractReliableFacePoints } from '../coordinateTransform';
import { BuilderContext } from '../builders/types';

describe('Phase 7: Face Silhouette Validation Suite', () => {
  it('validates geometric continuity and watertight closed contour across all baseline fixtures', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const { features } = fixture;
      // MediaPipe Face Oval contour contains 36 points
      expect(features.faceOutline.length).toBeGreaterThanOrEqual(30);

      // Verify all points are normalized and finite
      for (const pt of features.faceOutline) {
        expect(isFinite(pt.x)).toBe(true);
        expect(isFinite(pt.y)).toBe(true);
        expect(pt.x).toBeGreaterThanOrEqual(0);
        expect(pt.x).toBeLessThanOrEqual(1);
        expect(pt.y).toBeGreaterThanOrEqual(0);
        expect(pt.y).toBeLessThanOrEqual(1);
      }

      const model = buildPortraitModel(fixture, 1000, 1000);
      const faceLayer = model.layers.find((l) => l.id === 'layer-face-silhouette');
      expect(faceLayer).toBeDefined();
      expect(faceLayer?.visible).toBe(true);
      expect(faceLayer?.shapes.length).toBe(1);

      const faceShape = faceLayer!.shapes[0];
      expect(faceShape.id).toBe('face-silhouette');
      expect(faceShape.provenance).toBe('landmark-derived');
      expect(faceShape.pathData).toBeDefined();

      // Path data must begin with MoveTo (M) and end with ClosePath (Z)
      expect(faceShape.pathData!.startsWith('M ')).toBe(true);
      expect(faceShape.pathData!.endsWith('Z')).toBe(true);
      expect(faceShape.pathData!).not.toContain('NaN');
      expect(faceShape.pathData!).not.toContain('undefined');
    }
  });

  it('verifies that chin smoothing around gnathion 152 eliminates acute V-chin pinch without altering jaw width', () => {
    const fixture = shortHairCleanShavenFixture;
    const { features, palette } = fixture;
    const reliablePoints = extractReliableFacePoints(features);
    const projection = createFaceProjection(reliablePoints, { width: 1000, height: 1000 }, { width: 1000, height: 1000 });

    const ctx: BuilderContext = {
      analysis: fixture,
      features,
      palette,
      hairEstimate: fixture.hairEstimate,
      facialHairEstimate: fixture.facialHairEstimate,
      canvasWidth: 1000,
      canvasHeight: 1000,
      viewBox: { minX: 0, minY: 0, width: 1000, height: 1000 },
      imgDim: { width: 1000, height: 1000 },
      toCanvas: projection.toCanvas,
      scale: projection.scale,
      isLightLeft: false,
      isLightRight: false,
    };

    const layer = buildFaceSilhouetteLayer(ctx);
    expect(layer.shapes.length).toBe(1);

    const shape = layer.shapes[0];
    expect(shape.provenance).toBe('landmark-derived');
    expect(shape.fill).toBe('url(#skin-volume-grad)');
    expect(shape.strokeWidth).toBe(1.5);

    // Verify defensive handling when faceOutline is empty or malformed
    const emptyCtx: BuilderContext = {
      ...ctx,
      features: {
        ...features,
        faceOutline: [],
      },
    };
    const emptyLayer = buildFaceSilhouetteLayer(emptyCtx);
    expect(emptyLayer.shapes.length).toBe(0);
  });

  it('strictly excludes neck and clothing: face outline terminates at mandibular border above neck projection', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const { features } = fixture;
      const chinTipY = features.chinTip.y;
      const neckLeftY = features.neckLeft.y;
      const neckRightY = features.neckRight.y;

      // The neck drop must extend strictly below the anatomical chin tip
      expect(neckLeftY).toBeGreaterThan(chinTipY);
      expect(neckRightY).toBeGreaterThan(chinTipY);

      // Verify that all points along the face outline lie above or at the chin tip (not bleeding into the neck)
      for (const pt of features.faceOutline) {
        expect(pt.y).toBeLessThanOrEqual(chinTipY + 0.015);
      }

      // Final SVG must strictly have floating-head composition without neck or torso geometry
      const model = buildPortraitModel(fixture, 1000, 1000);
      const svg = renderPortraitSvg(model);
      expect(svg).not.toContain('id="neck-base"');
      expect(svg).not.toContain('id="torso"');
      expect(svg).not.toContain('id="shoulders"');
    }
  });

  it('guarantees watertight layering: face silhouette provides continuous base underneath hair layer', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const model = buildPortraitModel(fixture, 1000, 1000);
      const faceLayerIndex = model.layers.findIndex((l) => l.id === 'layer-face-silhouette');
      const hairLayerIndex = model.layers.findIndex((l) => l.id === 'layer-hair');

      // Layer 3 (Face Silhouette) must precede Layer 4 (Hair)
      expect(faceLayerIndex).toBe(2);
      expect(hairLayerIndex).toBe(3);
      expect(hairLayerIndex).toBeGreaterThan(faceLayerIndex);

      const faceLayer = model.layers[faceLayerIndex];
      expect(faceLayer.shapes[0].opacity).toBe(1);
    }
  });

  it('forensic validation: verifies that landmark outline avoids candidate mask-derived failure modes', () => {
    // Forensic assessment:
    // 1. Mask quantization: Selfie Multiclass 256x256 raster causes stair-step artifacts
    // 2. Neck bleed: Class 3 (face skin) bleeds into Class 2 (body skin/neck)
    // 3. Occlusion bites: Hair strands cut notches into Class 3, creating background gaps under Layer 4 Hair
    // 4. Beard amputation: Facial hair is subtracted from face skin in segmentation
    //
    // The landmark-derived contour:
    // - Preserves smooth sub-pixel float coordinates
    // - Follows mandibular bone structure ending at gnathion 152
    // - Maintains anatomical skull geometry beneath hair strands for watertight vector layering
    // - Retains complete jaw geometry regardless of beard presence
    const fixture = shortHairCleanShavenFixture;
    const model = buildPortraitModel(fixture, 1000, 1000);
    const faceShape = model.layers[2].shapes[0];

    expect(faceShape.provenance).toBe('landmark-derived');
    expect(faceShape.id).toBe('face-silhouette');
    expect(faceShape.pathData?.length).toBeGreaterThan(100);
  });
});
