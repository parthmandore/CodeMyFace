/**
 * CodeMyFace V4 — Pipeline Orchestrator
 *
 * Runs the simplified Two-Mode Pipeline:
 * - Option A: Painting (Organic Painterly Vector Studio — zero synthetic stamps, zero blur)
 * - Option B: Recreation (High-Fidelity Photographic Vector Reconstruction — zero downscale, zero holes)
 *
 * Each mode generates two dedicated quality levels: High and Low.
 */

import {
  ColorPaletteAnalysis,
  V4CandidateResult,
  V4ExperimentOptions,
  V4PipelineResult,
} from './types';
import { analyzePhotoColors } from './colorAnalysis';
import { runPaintingEngine } from './paintingEngine';
import { runRecreationEngine } from './recreationEngine';
import { NormalizedLandmark } from '../../services/faceDetection/types';
import { AllTiersResult } from './tiers';

export interface V4PipelineInput {
  image: HTMLImageElement | HTMLCanvasElement;
  landmarks?: NormalizedLandmark[];
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null;
  options?: V4ExperimentOptions;
}

export async function runV4Pipeline(input: V4PipelineInput): Promise<V4PipelineResult> {
  const startTime = performance.now();
  const { image, landmarks, categoryMask, options } = input;

  // 1. Establish Uniform Canvas
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  if (typeof HTMLCanvasElement !== 'undefined' && image instanceof HTMLCanvasElement) {
    canvas = image;
    ctx = canvas.getContext('2d')!;
  } else if (typeof document !== 'undefined') {
    canvas = document.createElement('canvas');
    canvas.width = (image as any).naturalWidth || (image as any).width || 800;
    canvas.height = (image as any).naturalHeight || (image as any).height || 1000;
    ctx = canvas.getContext('2d')!;
    ctx.drawImage(image as any, 0, 0);
  } else {
    // Worker / node environment: duck-type fallback
    canvas = image as any;
    ctx = (image as any).getContext('2d');
  }

  const width = canvas.width;
  const height = canvas.height;

  // 2. Perform Empirical Color Analysis
  const colorPalette: ColorPaletteAnalysis = analyzePhotoColors(
    ctx,
    width,
    height,
    landmarks,
    categoryMask
  );

  const mode = options?.mode || 'painting';

  let candidateA: V4CandidateResult;
  let candidateB: V4CandidateResult;
  let candidateC: V4CandidateResult;

  let tiersResult: AllTiersResult | undefined = undefined;

  // Resolve active quality: 'high' (default) vs 'low'
  const activeQuality = (options?.quality || (options?.selectedTier === 'low' || options?.selectedTier === 'tier2' || options?.selectedTier === 'tier3' ? 'low' : 'high')) as 'high' | 'low';

  if (mode === 'recreation') {
    // =========================================================================
    // OPTION B: HIGH-FIDELITY RECREATION ENGINE
    // Maximum photographic vector fidelity, preserves stripes, lace, wire rims, zero holes
    // =========================================================================
    const recResults = runRecreationEngine({
      canvas,
      width,
      height,
      colorPalette,
      options,
    });

    const activeSvg = activeQuality === 'low' ? recResults.low.svgString : recResults.high.svgString;
    const activePaths = activeQuality === 'low' ? recResults.low.pathCount : recResults.high.pathCount;
    const activeBytes = activeQuality === 'low' ? recResults.low.rawBytes : recResults.high.rawBytes;
    const activeTime = activeQuality === 'low' ? recResults.low.executionTimeMs : recResults.high.executionTimeMs;

    candidateA = {
      candidateId: 'candidate-a',
      name: 'Recreation',
      title: 'High-Fidelity Photographic Vector Recreation',
      description: 'Faithful photographic vector reconstruction with multi-scale architecture, zero holes, and razor-sharp contour fidelity.',
      svgString: activeSvg,
      metrics: {
        pathCount: activePaths,
        nodeCount: activePaths * 4,
        fileSizeKb: Math.round((activeBytes / 1024) * 10) / 10,
        executionTimeMs: activeTime,
      },
    };
    candidateB = candidateA;
    candidateC = candidateA;

    const highResult = {
      quality: 'high' as const,
      svgString: recResults.high.svgString,
      rawBytes: recResults.high.rawBytes,
      gzipBytes: recResults.high.gzipBytes,
      pathCount: recResults.high.pathCount,
      nodeCount: recResults.high.pathCount * 4,
      ssim: 0,
      psnr: 0,
      colorError: 0,
      executionTimeMs: recResults.high.executionTimeMs,
    };

    const lowResult = {
      quality: 'low' as const,
      svgString: recResults.low.svgString,
      rawBytes: recResults.low.rawBytes,
      gzipBytes: recResults.low.gzipBytes,
      pathCount: recResults.low.pathCount,
      nodeCount: recResults.low.pathCount * 4,
      ssim: 0,
      psnr: 0,
      colorError: 0,
      executionTimeMs: recResults.low.executionTimeMs,
    };

    tiersResult = {
      high: highResult,
      low: lowResult,
      selectedQuality: activeQuality,
      // Compatibility aliases
      tier1: highResult,
      tier2: lowResult,
      tier3: lowResult,
      selectedTier: activeQuality,
    };
  } else {
    // =========================================================================
    // OPTION A: ORGANIC PAINTING STUDIO ENGINE
    // Cohesive planar vector art, zero synthetic stamps, zero blur, authentic likeness
    // =========================================================================
    const paintResults = runPaintingEngine({
      canvas,
      width,
      height,
      colorPalette,
      categoryMask,
      landmarks,
      options,
    });

    const activeSvg = activeQuality === 'low' ? paintResults.low.svgString : paintResults.high.svgString;
    const activePaths = activeQuality === 'low' ? paintResults.low.pathCount : paintResults.high.pathCount;
    const activeBytes = activeQuality === 'low' ? paintResults.low.rawBytes : paintResults.high.rawBytes;
    const activeTime = activeQuality === 'low' ? paintResults.low.executionTimeMs : paintResults.high.executionTimeMs;

    candidateC = {
      candidateId: 'candidate-c',
      name: 'Painting Studio',
      title: 'Organic Digital Painting',
      description: 'Authentic painterly vector portrait with organic planar modeling. Zero synthetic stamps, zero blur.',
      svgString: activeSvg,
      metrics: {
        pathCount: activePaths,
        nodeCount: activePaths * 4,
        fileSizeKb: Math.round((activeBytes / 1024) * 10) / 10,
        executionTimeMs: activeTime,
      },
    };
    candidateA = candidateC;
    candidateB = candidateC;

    const highResult = {
      quality: 'high' as const,
      svgString: paintResults.high.svgString,
      rawBytes: paintResults.high.rawBytes,
      gzipBytes: paintResults.high.gzipBytes,
      pathCount: paintResults.high.pathCount,
      nodeCount: paintResults.high.pathCount * 4,
      ssim: 0,
      psnr: 0,
      colorError: 0,
      executionTimeMs: paintResults.high.executionTimeMs,
    };

    const lowResult = {
      quality: 'low' as const,
      svgString: paintResults.low.svgString,
      rawBytes: paintResults.low.rawBytes,
      gzipBytes: paintResults.low.gzipBytes,
      pathCount: paintResults.low.pathCount,
      nodeCount: paintResults.low.pathCount * 4,
      ssim: 0,
      psnr: 0,
      colorError: 0,
      executionTimeMs: paintResults.low.executionTimeMs,
    };

    tiersResult = {
      high: highResult,
      low: lowResult,
      selectedQuality: activeQuality,
      // Compatibility aliases
      tier1: highResult,
      tier2: lowResult,
      tier3: lowResult,
      selectedTier: activeQuality,
    };
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
