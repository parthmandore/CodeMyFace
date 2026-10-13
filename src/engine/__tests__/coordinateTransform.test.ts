import { describe, it, expect } from 'vitest';
import {
  normalizedToImagePx,
  imagePxToNormalized,
  distanceImagePx,
  createIsotropicProjection,
  ImageDimensions,
} from '../coordinateTransform';
import { Vec2 } from '../../types/portrait';

describe('coordinateTransform: isotropic transformation engine', () => {
  it('converts normalized coordinates to image pixels and back accurately', () => {
    const imgDim: ImageDimensions = { width: 900, height: 1600 };
    const norm: Vec2 = { x: 0.5, y: 0.25 };

    const px = normalizedToImagePx(norm, imgDim);
    expect(px.x).toBe(450);
    expect(px.y).toBe(400);

    const back = imagePxToNormalized(px, imgDim);
    expect(back.x).toBeCloseTo(0.5);
    expect(back.y).toBeCloseTo(0.25);
  });

  it('preserves true physical Euclidean distance for non-square aspect ratios', () => {
    // 9:16 portrait image (900 x 1600)
    const imgDim: ImageDimensions = { width: 900, height: 1600 };

    // Point A and Point B separated by 100 physical pixels horizontally
    const a1: Vec2 = { x: 100 / 900, y: 0.5 };
    const b1: Vec2 = { x: 200 / 900, y: 0.5 };
    const distHoriz = distanceImagePx(a1, b1, imgDim);
    expect(distHoriz).toBeCloseTo(100);

    // Point A and Point B separated by 100 physical pixels vertically
    const a2: Vec2 = { x: 0.5, y: 100 / 1600 };
    const b2: Vec2 = { x: 0.5, y: 200 / 1600 };
    const distVert = distanceImagePx(a2, b2, imgDim);
    expect(distVert).toBeCloseTo(100);

    // Both should equal 100 physical pixels
    expect(distHoriz).toBeCloseTo(distVert);
  });

  it('guarantees identical horizontal and vertical scaling (zero pancake distortion)', () => {
    // User's exact 900 x 1600 portrait photo dimensions
    const imgDim: ImageDimensions = { width: 900, height: 1600 };

    // Define a square feature of 100 x 100 physical pixels on the face
    // Center at (450, 800)
    const centerNorm: Vec2 = { x: 450 / 900, y: 800 / 1600 };
    const cornerNorm: Vec2 = { x: (450 + 100) / 900, y: (800 + 100) / 1600 };

    const headPoints: Vec2[] = [
      { x: (450 - 200) / 900, y: (800 - 300) / 1600 },
      { x: (450 + 200) / 900, y: (800 + 300) / 1600 },
    ];

    const projection = createIsotropicProjection(headPoints, imgDim, { width: 1000, height: 1000 });

    const projectedCenter = projection.toCanvas(centerNorm);
    const projectedCorner = projection.toCanvas(cornerNorm);

    const deltaX = Math.abs(projectedCorner.x - projectedCenter.x);
    const deltaY = Math.abs(projectedCorner.y - projectedCenter.y);

    // CRITICAL: deltaX MUST equal deltaY in canvas space because the source feature was a square!
    // In the old broken code, deltaX was 1.78x deltaY, turning squares into wide rectangles!
    expect(deltaX).toBeCloseTo(deltaY, 2);
  });

  it('centers and scales head properly for wide landscape images (1920 x 1080)', () => {
    const imgDim: ImageDimensions = { width: 1920, height: 1080 };

    const headPoints: Vec2[] = [
      { x: 0.4, y: 0.2 },
      { x: 0.6, y: 0.7 },
    ];

    const projection = createIsotropicProjection(headPoints, imgDim, { width: 1000, height: 1000 });

    // Center in canvas should be 500
    expect(projection.canvasCenter.x).toBe(500);
    expect(projection.scale).toBeGreaterThan(0);

    // Delta X for a 100px shift should equal Delta Y for a 100px shift
    const p1 = projection.toCanvas({ x: 0.5, y: 0.5 });
    const pHoriz = projection.toCanvas({ x: 0.5 + 100 / 1920, y: 0.5 });
    const pVert = projection.toCanvas({ x: 0.5, y: 0.5 + 100 / 1080 });

    const dx = Math.abs(pHoriz.x - p1.x);
    const dy = Math.abs(pVert.y - p1.y);
    expect(dx).toBeCloseTo(dy, 2);
  });
});
