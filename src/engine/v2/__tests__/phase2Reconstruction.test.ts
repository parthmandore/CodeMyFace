/**
 * CodeMyFace Engine V2 — Phase 2 Test Suite
 *
 * Verifies:
 * 1. Face silhouette reconstruction from landmarks and skin evidence
 * 2. Hair silhouette reconstruction from segmentation masks (no universal dome)
 * 3. Fallback gate: unreliable hair produces face-only result instead of a fake dome
 * 4. Controlled contour cleanup (jitter removal, Douglas-Peucker simplification, loop resolution)
 * 5. Generation of valid SVG outputs: face-only, complete (face+hair), and diagnostic debug
 */

import { describe, it, expect } from 'vitest';
import { reconstructFaceGeometry } from '../faceGeometry';
import { reconstructHairGeometry } from '../hairGeometry';
import { cleanupContour, resolveSelfIntersections, removeQuantizationJitter } from '../contourCleanup';
import { buildPrototypePortrait } from '../prototypeSvgRenderer';
import { buildCoordinateTransform } from '../canonicalFrame';
import { extractNormalizedLandmarks } from '../landmarkAnalyzer';
import { analyzeSegmentationMask } from '../segmentationAnalyzer';
import { FacialAnalysisResultV2 } from '../types';
import { NormalizedLandmark } from '../../../services/faceDetection/types';
import * as LM from '../../landmarkIndices';

function createMockLandmarks(): NormalizedLandmark[] {
  const fw = 0.30;
  const fh = fw * 1.35;
  const cx = 0.50;
  const cy = 0.45;

  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    landmarks.push({ x: cx, y: cy, z: 0 });
  }

  landmarks[LM.FOREHEAD_TOP] = { x: cx, y: cy - fh * 0.5, z: 0 };
  landmarks[LM.CHIN_TIP] = { x: cx, y: cy + fh * 0.5, z: 0 };
  landmarks[LM.TEMPLE_LEFT] = { x: cx - fw * 0.5, y: cy - fh * 0.1, z: 0 };
  landmarks[LM.TEMPLE_RIGHT] = { x: cx + fw * 0.5, y: cy - fh * 0.1, z: 0 };
  landmarks[LM.JAW_BOTTOM_LEFT] = { x: cx - fw * 0.4, y: cy + fh * 0.35, z: 0 };
  landmarks[LM.JAW_BOTTOM_RIGHT] = { x: cx + fw * 0.4, y: cy + fh * 0.35, z: 0 };
  landmarks[LM.LEFT_PREAURICULAR_ANCHOR] = { x: cx - fw * 0.52, y: cy, z: 0 };
  landmarks[LM.RIGHT_PREAURICULAR_ANCHOR] = { x: cx + fw * 0.52, y: cy, z: 0 };

  // Eyes & Irises
  landmarks[LM.LEFT_IRIS_CENTER] = { x: cx - fw * 0.25, y: cy - fh * 0.08, z: 0 };
  landmarks[LM.RIGHT_IRIS_CENTER] = { x: cx + fw * 0.25, y: cy - fh * 0.08, z: 0 };
  landmarks[33] = { x: cx - fw * 0.35, y: cy - fh * 0.08, z: 0 };
  landmarks[263] = { x: cx + fw * 0.35, y: cy - fh * 0.08, z: 0 };

  // Nose
  landmarks[LM.NOSE_TIP] = { x: cx, y: cy + fh * 0.10, z: 0 };
  landmarks[LM.SUBNASALE] = { x: cx, y: cy + fh * 0.16, z: 0 };
  landmarks[LM.NASION] = { x: cx, y: cy - fh * 0.06, z: 0 };
  landmarks[48] = { x: cx - fw * 0.12, y: cy + fh * 0.14, z: 0 };
  landmarks[278] = { x: cx + fw * 0.12, y: cy + fh * 0.14, z: 0 };

  // Mouth
  landmarks[LM.MOUTH_CENTER] = { x: cx, y: cy + fh * 0.26, z: 0 };
  landmarks[LM.CUPIDS_BOW_PEAK_LEFT] = { x: cx - fw * 0.05, y: cy + fh * 0.23, z: 0 };
  landmarks[LM.CUPIDS_BOW_PEAK_RIGHT] = { x: cx + fw * 0.05, y: cy + fh * 0.23, z: 0 };
  landmarks[LM.CUPIDS_BOW_TROUGH] = { x: cx, y: cy + fh * 0.24, z: 0 };

  return landmarks;
}

function createMockAnalysis(options: { hasHair?: boolean; hasBangs?: boolean } = {}): FacialAnalysisResultV2 {
  const imgDim = { width: 1000, height: 1250 };
  const landmarks = createMockLandmarks();
  const transform = buildCoordinateTransform(landmarks, imgDim, 300);
  const structuredLandmarks = extractNormalizedLandmarks(landmarks, transform);

  const maskW = 200;
  const maskH = 200;
  const rawMask = new Uint8Array(maskW * maskH);

  if (options.hasHair !== false) {
    // Fill upper region with hair (class 1)
    for (let y = 10; y < 90; y++) {
      for (let x = 40; x < 160; x++) {
        rawMask[y * maskW + x] = 1;
      }
    }
  }

  // Fill face region with face skin (class 3)
  for (let y = 80; y < 160; y++) {
    for (let x = 60; x < 140; x++) {
      if (rawMask[y * maskW + x] === 0) {
        rawMask[y * maskW + x] = 3;
      }
    }
  }

  const segmentation = analyzeSegmentationMask(
    rawMask,
    maskW,
    maskH,
    structuredLandmarks,
    transform
  );

  if (options.hasBangs) {
    segmentation.investigation.bangsCoveringForehead = true;
  }

  return {
    success: true,
    sourceImage: { dimensions: imgDim, aspectRatio: 0.8 },
    canonicalFrame: {
      width: 1000,
      height: 1000,
      targetFaceWidth: 300,
      faceCenter: { x: 500, y: 480 },
      margins: { top: 240, bottom: 280, left: 350, right: 350 },
    },
    transform,
    landmarks: structuredLandmarks,
    segmentation,
    telemetry: { faceDetectionMs: 10, segmentationMs: 10, normalizationMs: 2, totalMs: 22 },
  };
}

describe('Phase 2: Controlled Contour Cleanup', () => {
  it('removes quantization stair-step micro-jitter while preserving macro shape', () => {
    const rawWithJitter = [
      { x: 100, y: 100 },
      { x: 100.4, y: 100.5 }, // micro jitter
      { x: 110, y: 105 },
      { x: 120, y: 108 },
    ];
    const cleaned = removeQuantizationJitter(rawWithJitter, 1.5);
    expect(cleaned.length).toBeLessThan(rawWithJitter.length);
    expect(cleaned[0].x).toBe(100);
    expect(cleaned[cleaned.length - 1].x).toBe(120);
  });

  it('preserves the raw contour unmutated in cleanup result', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 20, y: 25 },
      { x: 30, y: 15 },
      { x: 40, y: 35 },
      { x: 50, y: 10 },
    ];
    const res = cleanupContour(points, { epsilon: 1.5 });
    expect(res.rawContour.length).toBe(points.length);
    expect(res.cleanedContour.length).toBeLessThanOrEqual(points.length);
  });

  it('detects and resolves self-intersecting loops', () => {
    // Polygon with a small figure-8 self-intersection loop
    const looped = [
      { x: 10, y: 10 },
      { x: 50, y: 50 },
      { x: 10, y: 50 },
      { x: 50, y: 10 }, // crosses segment (10,10)-(50,50)
      { x: 60, y: 30 },
    ];
    const resolved = resolveSelfIntersections(looped);
    expect(resolved.length).toBeLessThan(looped.length);
  });
});

describe('Phase 2: Face Geometry Reconstruction', () => {
  it('reconstructs face silhouette preserving chin apex and jaw angle without forcing a V-shape', () => {
    const analysis = createMockAnalysis();
    const face = reconstructFaceGeometry(analysis);

    expect(face.contourPoints.length).toBeGreaterThanOrEqual(8);
    expect(face.bounds.width).toBeGreaterThanOrEqual(280);
    expect(face.bounds.width).toBeLessThanOrEqual(330);
    expect(face.chinApex.y).toBeGreaterThan(650);
    expect(face.measurements.jawWidth).toBeGreaterThan(150);
    expect(face.measurements.asymmetryRatio).toBeGreaterThan(0.8);
    expect(face.measurements.asymmetryRatio).toBeLessThan(1.2);
  });

  it('adapts forehead height when bangs are present vs absent', () => {
    const noBangsAnalysis = createMockAnalysis({ hasBangs: false });
    const bangsAnalysis = createMockAnalysis({ hasBangs: true });

    const faceNoBangs = reconstructFaceGeometry(noBangsAnalysis);
    const faceBangs = reconstructFaceGeometry(bangsAnalysis);

    // With bangs, forehead arc is held close to landmark 10 rather than elevated
    expect(faceBangs.foreheadArc.length).toBeGreaterThan(3);
    expect(faceNoBangs.bounds.minY).toBeLessThanOrEqual(faceBangs.bounds.minY);
  });
});

describe('Phase 2: Hair Silhouette Geometry Reconstruction', () => {
  it('reconstructs hair geometry directly from segmentation mask without generic parametric dome', () => {
    const analysis = createMockAnalysis({ hasHair: true });
    const hair = reconstructHairGeometry(analysis);

    expect(hair.isReliable).toBe(true);
    expect(hair.diagnosticStatus).toBe('SEGMENTATION_DERIVED');
    expect(hair.rawContour.length).toBeGreaterThan(10);
    expect(hair.cleanedContour.length).toBeGreaterThanOrEqual(4);
    expect(hair.bounds.width).toBeGreaterThan(200);
  });

  it('triggers reliable fallback gate when hair mask is missing, emitting face-only status without fabricated dome', () => {
    const analysis = createMockAnalysis({ hasHair: false });
    const hair = reconstructHairGeometry(analysis);

    expect(hair.isReliable).toBe(false);
    expect(['FACE_ONLY_UNRELIABLE_MASK', 'BALD_OR_CLOSE_CROPPED']).toContain(hair.diagnosticStatus);
    expect(hair.rawContour.length).toBe(0);
    expect(hair.cleanedContour.length).toBe(0);
  });
});

describe('Phase 2: Prototype Flat-Vector SVG Rendering', () => {
  const analysis = createMockAnalysis({ hasHair: true });
  const portrait = buildPrototypePortrait('dev-photo-test', analysis);

  it('renders valid XML SVG with 1000x1000 viewBox for all three output modes', () => {
    expect(portrait.faceOnlySvg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"');
    expect(portrait.completeSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"');
    expect(portrait.debugSvg).toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000"');

    expect(portrait.faceOnlySvg).not.toContain('NaN');
    expect(portrait.completeSvg).not.toContain('NaN');
    expect(portrait.debugSvg).not.toContain('NaN');
  });

  it('face-only SVG excludes hair silhouette while complete SVG includes it', () => {
    expect(portrait.faceOnlySvg).not.toContain('id="hair-silhouette"');
    expect(portrait.completeSvg).toContain('id="hair-silhouette"');
    expect(portrait.completeSvg).toContain('id="face-silhouette"');
  });

  it('debug SVG includes color-coded diagnostic paths and landmarks', () => {
    expect(portrait.debugSvg).toContain('Target Face Bounds:');
    expect(portrait.debugSvg).toContain('Reconstructed Face');
    expect(portrait.debugSvg).toContain('Cleaned Hair');
    expect(portrait.debugSvg).toContain('Landmarks (478)');
  });
});
