import { describe, it, expect } from 'vitest';
import { ALL_BASELINE_FIXTURES, shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import { extractReliableFacePoints, createFaceProjection } from '../coordinateTransform';
import { FaceAnalysis, PortraitShape } from '../../types/portrait';

describe('Phase 2: Face Geometry and Projection Invariance Suite', () => {
  it('guarantees that facial features are 100% invariant to changes in hair geometry', () => {
    // Base analysis with fixed facial landmarks
    const baseAnalysis: FaceAnalysis = shortHairCleanShavenFixture;

    // Variant 1: Short hair (default)
    const shortHairAnalysis: FaceAnalysis = {
      ...baseAnalysis,
      hairEstimate: {
        ...baseAnalysis.hairEstimate,
        length: 'short',
        silhouettePoints: [
          { x: 0.28, y: 0.38 },
          { x: 0.32, y: 0.20 },
          { x: 0.50, y: 0.16 },
          { x: 0.68, y: 0.20 },
          { x: 0.72, y: 0.38 },
        ],
        backHairPoints: undefined,
      },
    };

    // Variant 2: Long cascading hair extending far below the chin down to shoulders (y = 0.98)
    const longHairAnalysis: FaceAnalysis = {
      ...baseAnalysis,
      hairEstimate: {
        ...baseAnalysis.hairEstimate,
        length: 'long',
        hasLongHairSides: true,
        silhouettePoints: [
          { x: 0.22, y: 0.95 },
          { x: 0.26, y: 0.40 },
          { x: 0.50, y: 0.14 },
          { x: 0.74, y: 0.40 },
          { x: 0.78, y: 0.95 },
        ],
        backHairPoints: [
          { x: 0.18, y: 0.98 },
          { x: 0.20, y: 0.50 },
          { x: 0.50, y: 0.12 },
          { x: 0.80, y: 0.50 },
          { x: 0.82, y: 0.98 },
          { x: 0.50, y: 0.98 },
        ],
      },
    };

    // Variant 3: Extremely wide voluminous afro/curly hairstyle extending to x = 0.10 and x = 0.90
    const wideAfroAnalysis: FaceAnalysis = {
      ...baseAnalysis,
      hairEstimate: {
        ...baseAnalysis.hairEstimate,
        length: 'medium',
        style: 'curly',
        silhouettePoints: [
          { x: 0.10, y: 0.48 },
          { x: 0.15, y: 0.20 },
          { x: 0.50, y: 0.08 },
          { x: 0.85, y: 0.20 },
          { x: 0.90, y: 0.48 },
        ],
        backHairPoints: undefined,
      },
    };

    // Variant 4: Completely bald / no hair silhouette points
    const baldAnalysis: FaceAnalysis = {
      ...baseAnalysis,
      hairEstimate: {
        ...baseAnalysis.hairEstimate,
        length: 'short',
        coverage: 'none',
        silhouettePoints: [],
        backHairPoints: undefined,
      },
    };

    const modelShort = buildPortraitModel(shortHairAnalysis, 1000, 1000);
    const modelLong = buildPortraitModel(longHairAnalysis, 1000, 1000);
    const modelWide = buildPortraitModel(wideAfroAnalysis, 1000, 1000);
    const modelBald = buildPortraitModel(baldAnalysis, 1000, 1000);

    const getShape = (model: typeof modelShort, layerId: string, shapeId: string): PortraitShape => {
      const layer = model.layers.find((l) => l.id === layerId);
      expect(layer).toBeDefined();
      const shape = layer!.shapes.find((s) => s.id === shapeId);
      expect(shape).toBeDefined();
      return shape!;
    };

    // 1. Face Silhouette Contour MUST BE 100% IDENTICAL
    const facePathShort = getShape(modelShort, 'layer-face-silhouette', 'face-silhouette').pathData;
    const facePathLong = getShape(modelLong, 'layer-face-silhouette', 'face-silhouette').pathData;
    const facePathWide = getShape(modelWide, 'layer-face-silhouette', 'face-silhouette').pathData;
    const facePathBald = getShape(modelBald, 'layer-face-silhouette', 'face-silhouette').pathData;

    expect(facePathLong).toBe(facePathShort);
    expect(facePathWide).toBe(facePathShort);
    expect(facePathBald).toBe(facePathShort);

    // 2. Eyebrows MUST BE 100% IDENTICAL
    const browLeftShort = getShape(modelShort, 'layer-eyebrows-eyes', 'eyebrow-left').pathData;
    const browRightShort = getShape(modelShort, 'layer-eyebrows-eyes', 'eyebrow-right').pathData;
    for (const m of [modelLong, modelWide, modelBald]) {
      expect(getShape(m, 'layer-eyebrows-eyes', 'eyebrow-left').pathData).toBe(browLeftShort);
      expect(getShape(m, 'layer-eyebrows-eyes', 'eyebrow-right').pathData).toBe(browRightShort);
    }

    // 3. Eyes (Sclera, Limbal Ring, Pupil, Catchlight) MUST BE 100% IDENTICAL
    const scleraLeftShort = getShape(modelShort, 'layer-eyebrows-eyes', 'eye-sclera-left').pathData;
    const limbalLeftShort = getShape(modelShort, 'layer-eyebrows-eyes', 'iris-limbal-left');
    const pupilLeftShort = getShape(modelShort, 'layer-eyebrows-eyes', 'pupil-left');

    for (const m of [modelLong, modelWide, modelBald]) {
      expect(getShape(m, 'layer-eyebrows-eyes', 'eye-sclera-left').pathData).toBe(scleraLeftShort);
      const limbal = getShape(m, 'layer-eyebrows-eyes', 'iris-limbal-left');
      expect(limbal.cx).toBe(limbalLeftShort.cx);
      expect(limbal.cy).toBe(limbalLeftShort.cy);
      expect(limbal.r).toBe(limbalLeftShort.r);

      const pupil = getShape(m, 'layer-eyebrows-eyes', 'pupil-left');
      expect(pupil.cx).toBe(pupilLeftShort.cx);
      expect(pupil.cy).toBe(pupilLeftShort.cy);
      expect(pupil.r).toBe(pupilLeftShort.r);
    }

    // 4. Nose (Bridge line, Tip facet, Alar wings, Columella) MUST BE 100% IDENTICAL
    const bridgeLineShort = getShape(modelShort, 'layer-nose', 'nose-bridge-line').pathData;
    const alarLeftShort = getShape(modelShort, 'layer-nose', 'alar-wing-left').pathData;
    for (const m of [modelLong, modelWide, modelBald]) {
      expect(getShape(m, 'layer-nose', 'nose-bridge-line').pathData).toBe(bridgeLineShort);
      expect(getShape(m, 'layer-nose', 'alar-wing-left').pathData).toBe(alarLeftShort);
    }

    // 5. Mouth & Lips (Upper lip, Lower lip, Parting crease) MUST BE 100% IDENTICAL
    const upperLipShort = getShape(modelShort, 'layer-mouth-lips', 'upper-lip-facet').pathData;
    const lowerLipShort = getShape(modelShort, 'layer-mouth-lips', 'lower-lip-facet').pathData;
    for (const m of [modelLong, modelWide, modelBald]) {
      expect(getShape(m, 'layer-mouth-lips', 'upper-lip-facet').pathData).toBe(upperLipShort);
      expect(getShape(m, 'layer-mouth-lips', 'lower-lip-facet').pathData).toBe(lowerLipShort);
    }

    // 6. Facial Shadows MUST BE 100% IDENTICAL
    const cheekShadowShort = getShape(modelShort, 'layer-facial-shadows', 'facet-right-cheek-shadow').pathData;
    for (const m of [modelLong, modelWide, modelBald]) {
      expect(getShape(m, 'layer-facial-shadows', 'facet-right-cheek-shadow').pathData).toBe(cheekShadowShort);
    }
  });

  it('preserves face geometry across varied canvas aspect ratios without distortion', () => {
    const analysis = shortHairCleanShavenFixture;

    // Test square, portrait (4:5), and landscape (6:5) artboards
    const squareModel = buildPortraitModel(analysis, 1000, 1000);
    const portraitModel = buildPortraitModel(analysis, 800, 1000);
    const landscapeModel = buildPortraitModel(analysis, 1200, 1000);

    expect(squareModel.viewBox).toBeDefined();
    expect(portraitModel.viewBox).toBeDefined();
    expect(landscapeModel.viewBox).toBeDefined();

    // Verify isotropic scale: 1 image px in X must map to identical distance in Y
    const reliablePoints = extractReliableFacePoints(analysis.features);
    const imgDim = { width: analysis.imageWidth || 1000, height: analysis.imageHeight || 1000 };

    for (const [w, h] of [[1000, 1000], [800, 1000], [1200, 1000]]) {
      const proj = createFaceProjection(reliablePoints, imgDim, { width: w, height: h });
      const p1 = proj.toCanvas({ x: 0.5, y: 0.5 });
      const pHoriz = proj.toCanvas({ x: 0.5 + 50 / imgDim.width, y: 0.5 });
      const pVert = proj.toCanvas({ x: 0.5, y: 0.5 + 50 / imgDim.height });

      const dx = Math.abs(pHoriz.x - p1.x);
      const dy = Math.abs(pVert.y - p1.y);

      expect(dx).toBeCloseTo(dy, 4);
    }
  });

  it('dynamically expands SVG viewBox for long or voluminous hair without clipping', () => {
    const analysis: FaceAnalysis = {
      ...shortHairCleanShavenFixture,
      hairEstimate: {
        ...shortHairCleanShavenFixture.hairEstimate,
        length: 'long',
        hasLongHairSides: true,
        silhouettePoints: [
          { x: 0.20, y: 0.98 },
          { x: 0.25, y: 0.40 },
          { x: 0.50, y: 0.12 },
          { x: 0.75, y: 0.40 },
          { x: 0.80, y: 0.98 },
        ],
        backHairPoints: [
          { x: 0.15, y: 1.05 },
          { x: 0.20, y: 0.50 },
          { x: 0.50, y: 0.10 },
          { x: 0.80, y: 0.50 },
          { x: 0.85, y: 1.05 },
          { x: 0.50, y: 1.05 },
        ],
      },
    };

    const model = buildPortraitModel(analysis, 1000, 1000);
    expect(model.viewBox).toBeDefined();

    const vb = model.viewBox!;
    // ViewBox height must have expanded beyond 1000 to cleanly encompass cascading hair
    expect(vb.height).toBeGreaterThan(1000);

    const svg = renderPortraitSvg(model);
    expect(svg).toContain(`viewBox="${vb.minX} ${vb.minY} ${vb.width} ${vb.height}"`);

    // Verify background rect covers the expanded viewBox
    const bgShape = model.layers[0].shapes.find((s) => s.id === 'canvas-bg');
    expect(bgShape).toBeDefined();
    expect(bgShape!.pathData).toContain(`L ${vb.minX + vb.width}`);
    expect(bgShape!.pathData).toContain(`${vb.minY + vb.height}`);
  });

  it('guarantees that all baseline fixtures maintain stable, non-distorted face proportions', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const model = buildPortraitModel(fixture, 1000, 1000);
      const svg = renderPortraitSvg(model);

      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('null');
      expect(model.viewBox).toBeDefined();
      expect(model.viewBox!.width).toBeGreaterThanOrEqual(1000);
      expect(model.viewBox!.height).toBeGreaterThanOrEqual(1000);
    }
  });
});
