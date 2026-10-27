/**
 * CodeMyFace V4 — Pipeline Orchestrator
 *
 * Runs all three V4 experiments in parallel/sequence:
 * - Candidate A: Region-Aware Vector Tracing
 * - Candidate B: Source-Guided Feature Reconstruction
 * - Candidate C: Hybrid Adaptive Vector Reconstruction
 *
 * Derives color and geometry directly from the source image.
 */

import {
  ColorPaletteAnalysis,
  V4CandidateResult,
  V4ExperimentOptions,
  V4PipelineResult,
} from './types';
import { analyzePhotoColors } from './colorAnalysis';
import { runExperimentA } from './experimentA/regionAwareTracer';
import { runExperimentB } from './experimentB/sourceGuidedReconstruction';
import { runExperimentC } from './experimentC/hybridReconstruction';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { optimizeSvgForTier, binarySearchTargetSize, AllTiersResult } from './tiers';

export interface V4PipelineInput {
  image: HTMLImageElement | HTMLCanvasElement;
  landmarks?: NormalizedLandmark[];
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null;
  options?: V4ExperimentOptions;
}

export async function runV4Pipeline(input: V4PipelineInput): Promise<V4PipelineResult> {
  const startTime = performance.now();
  const { image, landmarks = [], categoryMask, options } = input;

  const width = (image as HTMLImageElement).naturalWidth || image.width || 600;
  const height = (image as HTMLImageElement).naturalHeight || image.height || 800;

  // 1. Prepare Canvas
  let canvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
  } else {
    canvas = {
      width,
      height,
      getContext: () => (image as any).getContext?.('2d'),
    } as any;
  }
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  if (typeof (image as any).getContext !== 'function') {
    ctx.drawImage(image as HTMLImageElement, 0, 0, width, height);
  } else {
    // Already a canvas
    ctx.drawImage(image as HTMLCanvasElement, 0, 0);
  }

  // 2. Perform Empirical Color Analysis
  const colorPalette: ColorPaletteAnalysis = analyzePhotoColors(
    ctx,
    width,
    height,
    landmarks,
    categoryMask
  );

  const mode = options?.mode;

  // 3. Execute Candidate A (Region-Aware Vector Tracing)
  const candidateA: V4CandidateResult = runExperimentA({
    canvas,
    width,
    height,
    colorPalette,
    categoryMask,
    landmarks,
    options,
  });

  let candidateB: V4CandidateResult;
  let candidateC: V4CandidateResult;

  let tiersResult: AllTiersResult | undefined = undefined;

  if (mode === 'recreation') {
    // In 'recreation' mode: Candidate A only (no synthetic features, no backdrop, no skin blur)
    // Tier 1: High Quality (full photographic resolution, 48 colors, 24 skin, 20 dark hair, pathomit 8)
    const t1Opt = optimizeSvgForTier(candidateA.svgString, 'tier1', { landmarks, width, height });

    // Tier 2: Medium Quality (~40-60% size, 24 colors, pathomit 24, safe compound merging)
    const candA_tier2 = runExperimentA({
      canvas,
      width,
      height,
      colorPalette,
      categoryMask,
      landmarks,
      options: { ...options, detailPreset: 'medium', targetColors: 24, tracerPathOmit: 24 },
    });
    const t2Opt = optimizeSvgForTier(candA_tier2.svgString, 'tier2', { landmarks, width, height });

    // Tier 3: Low Quality (~10-20% size, 12 colors, pathomit 56, saliency weighting, precision 0)
    const candA_tier3 = runExperimentA({
      canvas,
      width,
      height,
      colorPalette,
      categoryMask,
      landmarks,
      options: { ...options, detailPreset: 'low', targetColors: 12, tracerPathOmit: 56 },
    });
    const t3Opt = optimizeSvgForTier(candA_tier3.svgString, 'tier3', { landmarks, width, height });

    const selectedTierId = options?.selectedTier || 'tier1';
    let activeSvg = t1Opt.svg;
    if (selectedTierId === 'tier2') activeSvg = t2Opt.svg;
    if (selectedTierId === 'tier3') activeSvg = t3Opt.svg;

    if (options?.targetSizeKb && options.targetSizeKb > 0) {
      const targetRes = binarySearchTargetSize(candidateA.svgString, options.targetSizeKb * 1024, { landmarks, width, height });
      activeSvg = targetRes.svgString;
    }

    candidateA.svgString = activeSvg;
    candidateB = candidateA;
    candidateC = candidateA;

    tiersResult = {
      tier1: {
        tier: 'tier1',
        svgString: t1Opt.svg,
        rawBytes: t1Opt.rawBytes,
        gzipBytes: t1Opt.gzipBytes,
        pathCount: t1Opt.pathCount,
        nodeCount: t1Opt.pathCount * 4,
        ssim: 0,
        psnr: 0,
        colorError: 0,
        executionTimeMs: Math.round(performance.now() - startTime),
      },
      tier2: {
        tier: 'tier2',
        svgString: t2Opt.svg,
        rawBytes: t2Opt.rawBytes,
        gzipBytes: t2Opt.gzipBytes,
        pathCount: t2Opt.pathCount,
        nodeCount: t2Opt.pathCount * 4,
        ssim: 0,
        psnr: 0,
        colorError: 0,
        executionTimeMs: Math.round(performance.now() - startTime),
      },
      tier3: {
        tier: 'tier3',
        svgString: t3Opt.svg,
        rawBytes: t3Opt.rawBytes,
        gzipBytes: t3Opt.gzipBytes,
        pathCount: t3Opt.pathCount,
        nodeCount: t3Opt.pathCount * 4,
        ssim: 0,
        psnr: 0,
        colorError: 0,
        executionTimeMs: Math.round(performance.now() - startTime),
      },
      selectedTier: selectedTierId,
    };
  } else {
    // 4. Execute Candidate B (Source-Guided Feature Reconstruction)
    candidateB = runExperimentB({
      width,
      height,
      landmarks,
      colorPalette,
      categoryMask,
      options,
    });

    // 5. Execute Candidate C (Hybrid Adaptive Reconstruction)
    candidateC = runExperimentC({
      canvas,
      width,
      height,
      landmarks,
      colorPalette,
      baseSvg: candidateA.svgString,
      categoryMask,
      options,
    });
  }

  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    candidates: {
      'candidate-a': candidateA,
      'candidate-b': candidateB,
      'candidate-c': candidateC,
    },
    colorPalette,
    dimensions: {
      width,
      height,
    },
    executionTimeMs,
    tiers: tiersResult,
  };
}
