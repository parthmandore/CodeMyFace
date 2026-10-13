import { describe, it, expect } from 'vitest';
import { generatePortrait } from '../portraitPipeline';
import { FaceDetectionResult, NormalizedLandmark } from '../../services/faceDetection/types';

function createMockLandmarks(): NormalizedLandmark[] {
  const landmarks: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    landmarks.push({ x: 0.5, y: 0.5, z: 0 });
  }

  // Set oval
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    landmarks[i] = {
      x: 0.5 + Math.cos(angle) * 0.2,
      y: 0.5 + Math.sin(angle) * 0.25,
      z: 0,
    };
  }

  // Key landmarks
  landmarks[10] = { x: 0.5, y: 0.25, z: 0 }; // Forehead top
  landmarks[152] = { x: 0.5, y: 0.78, z: 0 }; // Chin tip
  landmarks[127] = { x: 0.32, y: 0.45, z: 0 }; // Temple left
  landmarks[356] = { x: 0.68, y: 0.45, z: 0 }; // Temple right
  landmarks[468] = { x: 0.40, y: 0.43, z: 0 }; // Left pupil
  landmarks[473] = { x: 0.60, y: 0.43, z: 0 }; // Right pupil
  landmarks[4] = { x: 0.5, y: 0.52, z: 0 }; // Nose tip
  landmarks[13] = { x: 0.5, y: 0.64, z: 0 }; // Mouth center
  landmarks[0] = { x: 0.5, y: 0.61, z: 0 }; // Upper lip outer
  landmarks[17] = { x: 0.5, y: 0.67, z: 0 }; // Lower lip outer
  landmarks[94] = { x: 0.46, y: 0.54, z: 0 }; // Left nostril
  landmarks[370] = { x: 0.54, y: 0.54, z: 0 }; // Right nostril

  return landmarks;
}

describe('multi-stage portrait pipeline (Stages A-M)', () => {
  it('fails gracefully when no face is detected in input', async () => {
    const mockImg = {
      complete: true,
      naturalWidth: 800,
      naturalHeight: 1000,
      width: 800,
      height: 1000,
    } as unknown as HTMLImageElement;

    const noFaceResult: FaceDetectionResult = {
      detected: false,
      faceCount: 0,
      timestamp: Date.now(),
    };

    const res = await generatePortrait(mockImg, noFaceResult);
    expect(res.success).toBe(false);
    expect(res.error).toContain('No face landmarks detected');
  });

  it('fails gracefully when image is not decoded', async () => {
    const incompleteImg = {
      complete: false,
      naturalWidth: 0,
      naturalHeight: 0,
      width: 0,
      height: 0,
    } as unknown as HTMLImageElement;

    const detectionResult: FaceDetectionResult = {
      detected: true,
      faceCount: 1,
      landmarks: createMockLandmarks(),
      timestamp: Date.now(),
    };

    const res = await generatePortrait(incompleteImg, detectionResult);
    expect(res.success).toBe(false);
    expect(res.error).toContain('invalid or not yet decoded');
  });
});
