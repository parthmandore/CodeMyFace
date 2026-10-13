import { describe, it, expect } from 'vitest';
import { ALL_BASELINE_FIXTURES } from '../__fixtures__/baselineFixtures';
import { buildPortraitModel, renderPortraitSvg } from '../svgRenderer';

describe('Baseline Regression Suite: Preserving Output Parity', () => {
  it('renders deterministic, valid vector portraits for all baseline fixtures', () => {
    for (const fixture of ALL_BASELINE_FIXTURES) {
      const model = buildPortraitModel(fixture, 1000, 1000);
      expect(model.layers.length).toBe(10);

      // Verify layer structure
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

      const svg = renderPortraitSvg(model);

      // Strict validity assertions
      expect(svg.startsWith('<?xml')).toBe(true);
      expect(svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toContain('NaN');
      expect(svg).not.toContain('undefined');
      expect(svg).not.toContain('null');
      expect(svg).not.toContain('<image');
      expect(svg).not.toContain('data:image/');
      expect(svg).not.toContain('base64');

      // Native Vitest snapshot for reproducible geometric regression comparison
      expect(svg.length).toBeGreaterThan(500);
      expect(svg).toMatchSnapshot();
    }
  });

  it('preserves layer-specific geometry rules across fixtures', () => {
    const smileFixture = ALL_BASELINE_FIXTURES.find((f) => f.requestId === 'fixture-smile-teeth');
    expect(smileFixture).toBeDefined();
    const smileModel = buildPortraitModel(smileFixture!, 1000, 1000);
    const smileSvg = renderPortraitSvg(smileModel);
    expect(smileSvg).toContain('id="mouth-teeth"');
    expect(smileSvg).toContain('id="mouth-oral-cavity"');

    const beardFixture = ALL_BASELINE_FIXTURES.find((f) => f.requestId === 'fixture-beard-male');
    expect(beardFixture).toBeDefined();
    const beardModel = buildPortraitModel(beardFixture!, 1000, 1000);
    const beardSvg = renderPortraitSvg(beardModel);
    expect(beardSvg).toContain('id="beard-main"');
    expect(beardSvg).toContain('id="mustache-main"');

    const cleanFixture = ALL_BASELINE_FIXTURES.find((f) => f.requestId === 'fixture-short-clean');
    expect(cleanFixture).toBeDefined();
    const cleanModel = buildPortraitModel(cleanFixture!, 1000, 1000);
    const cleanSvg = renderPortraitSvg(cleanModel);
    expect(cleanSvg).not.toContain('id="beard-main"');
  });

  it('correctly tracks and serializes shape provenance attributes', () => {
    const fixture = ALL_BASELINE_FIXTURES[0];
    const model = buildPortraitModel(fixture, 1000, 1000);
    const svg = renderPortraitSvg(model);

    expect(svg).toContain('data-provenance="template-generated"');
    expect(svg).toContain('data-provenance="landmark-derived"');

    // Confirm specific shapes carry expected provenance
    const faceSilhouette = model.layers[2].shapes.find((s) => s.id === 'face-silhouette');
    expect(faceSilhouette?.provenance).toBe('landmark-derived');

    const eyebrow = model.layers[5].shapes.find((s) => s.id === 'eyebrow-left');
    expect(eyebrow?.provenance).toBe('landmark-derived');

    const background = model.layers[0].shapes.find((s) => s.id === 'canvas-bg');
    expect(background?.provenance).toBe('template-generated');
  });
});
