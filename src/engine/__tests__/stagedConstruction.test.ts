import { describe, it, expect } from 'vitest';
import { ALL_BASELINE_FIXTURES, shortHairCleanShavenFixture } from '../__fixtures__/baselineFixtures';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';
import {
  CONSTRUCTION_STAGES,
  buildStagedPortraitModel,
} from '../stagedConstruction';

describe('Phase 8: Staged SVG Construction Suite', () => {
  it('defines 8 authentic construction stages corresponding to real pipeline layers', () => {
    expect(CONSTRUCTION_STAGES.length).toBe(8);

    const stageIds = CONSTRUCTION_STAGES.map((s) => s.id);
    expect(stageIds).toEqual([
      'stage-calibration',
      'stage-face-silhouette',
      'stage-hair-silhouette',
      'stage-eyes-eyebrows',
      'stage-nose-mouth',
      'stage-facial-hair',
      'stage-shading-highlights',
      'stage-final-assembly',
    ]);

    for (let i = 0; i < CONSTRUCTION_STAGES.length; i++) {
      const stage = CONSTRUCTION_STAGES[i];
      expect(stage.stepNumber).toBe(i + 1);
      expect(stage.name.length).toBeGreaterThan(0);
      expect(stage.shortName.length).toBeGreaterThan(0);
      expect(stage.description.length).toBeGreaterThan(0);
      expect(stage.includedLayerIds.length).toBeGreaterThan(0);
      expect(stage.badgeText.length).toBeGreaterThan(0);
    }
  });

  it('guarantees monotonic layer addition and genuine SVG fidelity (no fake code)', () => {
    const fixture = shortHairCleanShavenFixture;
    const fullModel = buildPortraitModel(fixture, 1000, 1000);
    const finalSvg = renderPortraitSvg(fullModel);

    let prevLayerCount = 0;

    for (let i = 0; i < CONSTRUCTION_STAGES.length; i++) {
      const result = buildStagedPortraitModel(fullModel, i);
      expect(result.stageIndex).toBe(i);
      expect(result.totalStages).toBe(8);
      expect(result.activeLayerCount).toBeGreaterThanOrEqual(prevLayerCount);
      prevLayerCount = result.activeLayerCount;

      // Rendered SVG validity assertions
      const svg = result.stagedSvgString;
      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('data:image/');
      expect(svg).not.toContain('base64');

      // Verify authentic stage contents
      if (i === 0) {
        expect(svg).toContain('id="canvas-bg"');
        expect(svg).not.toContain('id="face-silhouette"');
      } else if (i === 1) {
        expect(svg).toContain('id="face-silhouette"');
        expect(svg).not.toContain('id="layer-hair"');
      } else if (i === 2) {
        expect(svg).toContain('id="layer-hair"');
        expect(svg).not.toContain('id="layer-eyebrows-eyes"');
      } else if (i === 3) {
        expect(svg).toContain('id="layer-eyebrows-eyes"');
        expect(svg).not.toContain('id="layer-nose"');
      } else if (i === 4) {
        expect(svg).toContain('id="layer-nose"');
        expect(svg).toContain('id="layer-mouth-lips"');
      } else if (i === 7) {
        // Final stage must match full model SVG identically
        expect(result.isComplete).toBe(true);
        expect(result.activeLayerCount).toBe(fullModel.layers.filter((l) => l.visible).length);
        expect(svg).toBe(finalSvg);
      }
    }
  });

  it('safely clamps out-of-bounds stage indices', () => {
    const fixture = shortHairCleanShavenFixture;
    const fullModel = buildPortraitModel(fixture, 1000, 1000);

    const negativeResult = buildStagedPortraitModel(fullModel, -5);
    expect(negativeResult.stageIndex).toBe(0);

    const overflowResult = buildStagedPortraitModel(fullModel, 999);
    expect(overflowResult.stageIndex).toBe(7);
    expect(overflowResult.isComplete).toBe(true);
  });

  it('executes staged construction consistently across all baseline fixtures', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const fullModel = buildPortraitModel(fixture, 1000, 1000);

      // Verify initial canvas stage
      const startResult = buildStagedPortraitModel(fullModel, 0);
      expect(startResult.activeLayerCount).toBe(1);
      expect(startResult.stagedSvgString).toContain('id="canvas-bg"');

      // Verify mid construction stage (features in place)
      const midResult = buildStagedPortraitModel(fullModel, 4);
      expect(midResult.activeLayerCount).toBeGreaterThanOrEqual(6);
      expect(midResult.stagedSvgString).toContain('id="face-silhouette"');

      // Verify final assembly matches full model
      const endResult = buildStagedPortraitModel(fullModel, 7);
      expect(endResult.isComplete).toBe(true);
      expect(endResult.activeLayerCount).toBe(fullModel.layers.filter((l) => l.visible).length);
      expect(endResult.stagedSvgString).toBe(renderPortraitSvg(fullModel));
    }
  });
});
