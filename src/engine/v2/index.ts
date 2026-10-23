/**
 * CodeMyFace Engine V2 — Phase 1: Image Normalization and Facial Analysis
 *
 * Public API for Phase 1:
 * - analyzeFaceV2: Complete Phase 1 pipeline from photograph to canonical frame,
 *   dense landmark extraction, multiclass segmentation analysis, and telemetry.
 */

import { IFaceDetectionService } from '../../services/faceDetection/types';
import { SegmentationService } from '../../services/segmentation/segmentationService';
import { FacialAnalysisResultV2, ImageDimensions } from './types';
import {
  selectBestFace,
  buildCoordinateTransform,
  createCanonicalFrame,
  TARGET_FACE_WIDTH,
} from './canonicalFrame';
import { extractNormalizedLandmarks } from './landmarkAnalyzer';
import { analyzeSegmentationMask } from './segmentationAnalyzer';

export * from './types';
export * from './canonicalFrame';
export * from './landmarkAnalyzer';
export * from './segmentationAnalyzer';
export * from './multiPassExperiment';
export * from './phase2Types';
export * from './contourCleanup';
export * from './faceGeometry';
export * from './hairGeometry';
export * from './prototypeSvgRenderer';
export * from './phase3Types';
export * from './imageEvidenceSampler';
export * from './featureGeometry';
export * from './phase3SvgRenderer';
export * from './oklab';
export * from './phase4Types';
export * from './paletteExtractor';
export * from './facialHairDetector';
export * from './skinShadingGenerator';
export * from './phase4SvgRenderer';
export * from './phase5Types';
export * from './progressiveSvgGenerator';
export * from './progressivePipeline';

export interface AnalyzeFaceV2Options {
  runMultiPassExperiment?: boolean;
  targetFaceWidth?: number;
  filename?: string;
}

/**
 * Executes complete Phase 1 Image Normalization and Facial Analysis on an image element
 */
export async function analyzeFaceV2(
  image: HTMLImageElement,
  detector: IFaceDetectionService,
  segmenter?: SegmentationService,
  options: AnalyzeFaceV2Options = {}
): Promise<FacialAnalysisResultV2> {
  const tTotalStart = performance.now();

  const width = image.naturalWidth || image.width || 1000;
  const height = image.naturalHeight || image.height || 1000;
  const imgDim: ImageDimensions = { width, height };

  const sourceMeta = {
    dimensions: imgDim,
    aspectRatio: Math.round((width / height) * 1000) / 1000,
    filename: options.filename,
  };

  // 1. Detect faces using Face Landmarker
  const tDetectStart = performance.now();
  const detectionResult = await detector.detect(image);
  const faceDetectionMs = Math.round(performance.now() - tDetectStart);

  if (!detectionResult.detected || !detectionResult.landmarks || detectionResult.landmarks.length === 0) {
    return {
      success: false,
      errorCode: 'NO_FACE_DETECTED',
      errorMessage: 'No human face detected in image. The photo may be blurry, occluded, or too dark.',
      sourceImage: sourceMeta,
      telemetry: {
        faceDetectionMs,
        segmentationMs: 0,
        normalizationMs: 0,
        totalMs: Math.round(performance.now() - tTotalStart),
      },
    };
  }

  // 2. Select appropriate face (handles multi-face gracefully)
  const { landmarks } = selectBestFace(detectionResult);

  // 3. Build canonical coordinate transform & framing
  const tNormStart = performance.now();
  const targetFaceWidth = options.targetFaceWidth || TARGET_FACE_WIDTH;
  const transform = buildCoordinateTransform(landmarks, imgDim, targetFaceWidth);
  const canonicalFrame = createCanonicalFrame(targetFaceWidth);

  // 4. Extract dense anatomical landmarks in canonical coordinates
  const structuredLandmarks = extractNormalizedLandmarks(landmarks, transform);
  const normalizationMs = Math.round(performance.now() - tNormStart);

  // 5. Run multiclass segmentation
  const tSegStart = performance.now();
  let segmentationResult = undefined;

  if (segmenter) {
    try {
      const headCenter = {
        x: transform.sourceFaceBoundsPx.centerX / width,
        y: transform.sourceFaceBoundsPx.centerY / height,
      };
      const hairSeg = await segmenter.segmentHair(image, headCenter);

      segmentationResult = analyzeSegmentationMask(
        hairSeg.rawMask,
        hairSeg.maskWidth || 256,
        hairSeg.maskHeight || 256,
        structuredLandmarks,
        transform,
        image
      );
    } catch (segErr) {
      console.warn('Segmentation analysis error in Engine V2:', segErr);
    }
  }
  const segmentationMs = Math.round(performance.now() - tSegStart);

  // 6. Optional multi-pass benchmark
  let multiPassBenchmark = undefined;
  if (options.runMultiPassExperiment) {
    try {
      const { runMultiPassBenchmark } = await import('./multiPassExperiment');
      multiPassBenchmark = await runMultiPassBenchmark(image, detector);
    } catch (mpErr) {
      console.warn('Multi-pass experiment skipped:', mpErr);
    }
  }

  const totalMs = Math.round(performance.now() - tTotalStart);

  return {
    success: true,
    sourceImage: sourceMeta,
    canonicalFrame,
    transform,
    landmarks: structuredLandmarks,
    segmentation: segmentationResult,
    pose: detectionResult.pose,
    multiPassBenchmark,
    telemetry: {
      faceDetectionMs,
      segmentationMs,
      normalizationMs,
      totalMs,
    },
  };
}
