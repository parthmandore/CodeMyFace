/**
 * CodeMyFace Engine V2 — Phase 1 Test Suite
 *
 * Verifies:
 * 1. Canonical coordinate system and isotropic transformations
 * 2. Mathematical invertibility of affine coordinate mappings
 * 3. Eye roll angle estimation
 * 4. Target face width enforcement (~300 units)
 * 5. Dense anatomical landmark extraction and group categorization
 * 6. Multiclass segmentation metric calculation and edge case investigation
 * 7. Graceful handling of zero faces and error states
 */

import { describe, it, expect } from 'vitest';
import {
  buildCoordinateTransform,
  createCanonicalFrame,
  estimateFaceRoll,
  selectBestFace,
  TARGET_FACE_WIDTH,
  CANONICAL_CANVAS_WIDTH,
  CANONICAL_CANVAS_HEIGHT,
} from '../canonicalFrame';
import { extractNormalizedLandmarks } from '../landmarkAnalyzer';
import { analyzeSegmentationMask, CATEGORY_DEFINITIONS } from '../segmentationAnalyzer';
import { NormalizedLandmark, FaceDetectionResult } from '../../../services/faceDetection/types';
import * as LM from '../../landmarkIndices';

// Synthetic 478-point landmark mesh centered in a portrait image
function createMockLandmarks(options: { tiltDegrees?: number; faceWidth?: number } = {}): NormalizedLandmark[] {
  const tiltRad = ((options.tiltDegrees || 0) * Math.PI) / 180;
  const fw = options.faceWidth || 0.30;
  const fh = fw * 1.35;
  const cx = 0.50;
  const cy = 0.45;

  const cosT = Math.cos(tiltRad);
  const sinT = Math.sin(tiltRad);

  const rotate = (dx: number, dy: number) => ({
    x: cx + dx * cosT - dy * sinT,
    y: cy + dx * sinT + dy * cosT,
    z: 0,
  });

  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    landmarks.push({ x: cx, y: cy, z: 0 });
  }

  // Key skull & facial anchors
  landmarks[LM.FOREHEAD_TOP] = rotate(0, -fh * 0.5);
  landmarks[LM.CHIN_TIP] = rotate(0, fh * 0.5);
  landmarks[LM.TEMPLE_LEFT] = rotate(-fw * 0.5, -fh * 0.1);
  landmarks[LM.TEMPLE_RIGHT] = rotate(fw * 0.5, -fh * 0.1);
  landmarks[LM.LEFT_PREAURICULAR_ANCHOR] = rotate(-fw * 0.52, 0);
  landmarks[LM.RIGHT_PREAURICULAR_ANCHOR] = rotate(fw * 0.52, 0);

  // Eyes
  landmarks[LM.LEFT_IRIS_CENTER] = rotate(-fw * 0.25, -fh * 0.08);
  landmarks[LM.RIGHT_IRIS_CENTER] = rotate(fw * 0.25, -fh * 0.08);
  landmarks[33] = rotate(-fw * 0.35, -fh * 0.08);
  landmarks[263] = rotate(fw * 0.35, -fh * 0.08);

  // Nose
  landmarks[LM.NOSE_TIP] = rotate(0, fh * 0.10);
  landmarks[LM.SUBNASALE] = rotate(0, fh * 0.16);
  landmarks[LM.NASION] = rotate(0, -fh * 0.06);
  landmarks[LM.LEFT_NOSTRIL] = rotate(-fw * 0.08, fh * 0.15);
  landmarks[LM.RIGHT_NOSTRIL] = rotate(fw * 0.08, fh * 0.15);
  landmarks[48] = rotate(-fw * 0.12, fh * 0.14); // Nose left wing anchor
  landmarks[278] = rotate(fw * 0.12, fh * 0.14); // Nose right wing anchor

  // Mouth
  landmarks[LM.MOUTH_CENTER] = rotate(0, fh * 0.26);
  landmarks[LM.CUPIDS_BOW_PEAK_LEFT] = rotate(-fw * 0.05, fh * 0.23);
  landmarks[LM.CUPIDS_BOW_PEAK_RIGHT] = rotate(fw * 0.05, fh * 0.23);
  landmarks[LM.CUPIDS_BOW_TROUGH] = rotate(0, fh * 0.24);
  landmarks[LM.COMMISSURE_LEFT] = rotate(-fw * 0.18, fh * 0.26);
  landmarks[LM.COMMISSURE_RIGHT] = rotate(fw * 0.18, fh * 0.26);

  return landmarks;
}

describe('Phase 1: Canonical Coordinate System & Transformations', () => {
  const imgDim = { width: 1000, height: 1500 };
  const squareDim = { width: 1000, height: 1000 };

  it('establishes a 1000x1000 canonical frame with proper margins', () => {
    const frame = createCanonicalFrame(TARGET_FACE_WIDTH);
    expect(frame.width).toBe(CANONICAL_CANVAS_WIDTH);
    expect(frame.height).toBe(CANONICAL_CANVAS_HEIGHT);
    expect(frame.targetFaceWidth).toBe(300);
    expect(frame.faceCenter.x).toBe(500);
    expect(frame.faceCenter.y).toBe(480);
    expect(frame.margins.top).toBeGreaterThanOrEqual(200);
    expect(frame.margins.left).toBeGreaterThanOrEqual(300);
  });

  it('enforces target face width of exactly ~300 units in canonical space', () => {
    const landmarks = createMockLandmarks({ faceWidth: 0.32 });
    const transform = buildCoordinateTransform(landmarks, imgDim, TARGET_FACE_WIDTH);

    expect(transform.targetFaceWidth).toBe(300);
    expect(transform.canonicalFaceBounds.width).toBe(300);
    expect(transform.canonicalFaceBounds.centerX).toBe(500);
    expect(transform.canonicalFaceBounds.centerY).toBe(480);
  });

  it('guarantees that sourcePxToCanonical and canonicalToSourcePx are exact mathematical inverses', () => {
    const landmarks = createMockLandmarks({ tiltDegrees: 8.5, faceWidth: 0.28 });
    const transform = buildCoordinateTransform(landmarks, imgDim, 300);

    const testPoints = [
      { x: 500, y: 750 },
      { x: 320, y: 480 },
      { x: 680, y: 820 },
      { x: 490, y: 640 },
    ];

    for (const pt of testPoints) {
      const canonical = transform.sourcePxToCanonical(pt);
      const reconstructed = transform.canonicalToSourcePx(canonical);

      expect(reconstructed.x).toBeCloseTo(pt.x, 3);
      expect(reconstructed.y).toBeCloseTo(pt.y, 3);
    }
  });

  it('correctly estimates face roll angle from eye pupils', () => {
    const levelLandmarks = createMockLandmarks({ tiltDegrees: 0 });
    const rollLevel = estimateFaceRoll(levelLandmarks, squareDim);
    expect(rollLevel.rollDegrees).toBeCloseTo(0, 1);

    const tiltedLandmarks = createMockLandmarks({ tiltDegrees: 12.0 });
    const rollTilted = estimateFaceRoll(tiltedLandmarks, squareDim);
    expect(rollTilted.rollDegrees).toBeCloseTo(12.0, 1);
  });

  it('strictly preserves isotropic proportions without horizontal stretching or compression', () => {
    const landmarks = createMockLandmarks();
    const transform = buildCoordinateTransform(landmarks, imgDim, 300);

    // Test a 100x100 square in physical source pixels
    const p1 = transform.sourcePxToCanonical({ x: 500, y: 500 });
    const p2 = transform.sourcePxToCanonical({ x: 600, y: 500 }); // +100px horizontal
    const p3 = transform.sourcePxToCanonical({ x: 500, y: 600 }); // +100px vertical

    const dxCanonical = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const dyCanonical = Math.hypot(p3.x - p1.x, p3.y - p1.y);

    expect(dxCanonical).toBeCloseTo(dyCanonical, 3);
  });
});

describe('Phase 1: Landmark Analysis & Anatomical Groups', () => {
  const imgDim = { width: 1000, height: 1250 };
  const landmarks = createMockLandmarks();
  const transform = buildCoordinateTransform(landmarks, imgDim, 300);
  const extracted = extractNormalizedLandmarks(landmarks, transform);

  it('extracts all 478 landmarks in canonical coordinates without NaN', () => {
    expect(extracted.totalCount).toBe(478);
    expect(extracted.allPoints.length).toBe(478);
    for (const pt of extracted.allPoints) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
  });

  it('extracts valid eye, nose, mouth, and chin anatomical groups', () => {
    expect(extracted.leftEye.pupil.x).toBeLessThan(500);
    expect(extracted.rightEye.pupil.x).toBeGreaterThan(500);
    expect(extracted.leftEye.fissureWidth).toBeGreaterThan(20);
    expect(extracted.rightEye.fissureWidth).toBeGreaterThan(20);

    expect(extracted.nose.tip.x).toBeCloseTo(500, 10);
    expect(extracted.nose.alarWidth).toBeGreaterThan(30);

    expect(extracted.mouth.center.y).toBeGreaterThan(extracted.nose.tip.y);
    expect(extracted.chin.tip.y).toBeGreaterThan(extracted.mouth.center.y);
    expect(extracted.forehead.top.y).toBeLessThan(extracted.leftEye.pupil.y);
  });
});

describe('Phase 1: Multiclass Segmentation & Failure Investigation', () => {
  it('correctly parses all 6 semantic categories and calculates pixel ratios', () => {
    const maskWidth = 200;
    const maskHeight = 200;
    const rawMask = new Uint8Array(maskWidth * maskHeight);

    // Fill categories:
    // 0: background (50%)
    // 1: hair (20%)
    // 3: face skin (20%)
    // 4: clothes (10%)
    for (let i = 0; i < rawMask.length; i++) {
      if (i < 20000) rawMask[i] = 0;
      else if (i < 28000) rawMask[i] = 1;
      else if (i < 36000) rawMask[i] = 3;
      else rawMask[i] = 4;
    }

    const result = analyzeSegmentationMask(rawMask, maskWidth, maskHeight, undefined, undefined);

    expect(result.available).toBe(true);
    expect(result.provenance).toBe('mediapipe-multiclass');
    expect(result.categories.background.ratioOfTotal).toBeCloseTo(0.50, 2);
    expect(result.categories.hair.ratioOfTotal).toBeCloseTo(0.20, 2);
    expect(result.categories.faceSkin.ratioOfTotal).toBeCloseTo(0.20, 2);
    expect(result.categories.clothes.ratioOfTotal).toBeCloseTo(0.10, 2);

    expect(CATEGORY_DEFINITIONS[1].name).toBe('hair');
    expect(CATEGORY_DEFINITIONS[3].name).toBe('faceSkin');
  });

  it('gracefully handles missing or empty segmentation masks', () => {
    const result = analyzeSegmentationMask(undefined, 0, 0, undefined, undefined);
    expect(result.available).toBe(false);
    expect(result.provenance).toBe('fallback-heuristic');
    expect(result.categories.hair.pixelCount).toBe(0);
  });
});

describe('Phase 1: Multi-Face and Edge Case Handling', () => {
  it('gracefully handles zero detected faces', () => {
    const emptyResult: FaceDetectionResult = {
      detected: false,
      faceCount: 0,
      timestamp: Date.now(),
    };
    const { face, landmarks, index } = selectBestFace(emptyResult);
    expect(face).toBeNull();
    expect(landmarks.length).toBe(0);
    expect(index).toBe(-1);
  });

  it('selects the largest, most centered face when multiple faces exist', () => {
    const mockFaceSmall = {
      index: 0,
      landmarks: createMockLandmarks(),
      boundingBox: { xMin: 0.1, yMin: 0.1, width: 0.2, height: 0.2 },
      area: 0.04,
      centerDistance: 0.35,
    };
    const mockFaceLargeCentered = {
      index: 1,
      landmarks: createMockLandmarks(),
      boundingBox: { xMin: 0.3, yMin: 0.2, width: 0.4, height: 0.5 },
      area: 0.20,
      centerDistance: 0.05,
    };

    const multiResult: FaceDetectionResult = {
      detected: true,
      faceCount: 2,
      allFaces: [mockFaceSmall, mockFaceLargeCentered],
      landmarks: mockFaceSmall.landmarks,
      timestamp: Date.now(),
    };

    const { index, face } = selectBestFace(multiResult);
    expect(index).toBe(1);
    expect(face?.area).toBe(0.20);
  });
});
