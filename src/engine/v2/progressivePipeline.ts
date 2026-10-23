/**
 * CodeMyFace Engine V2 — Phase 5: Progressive Pipeline Runner
 *
 * Implements real-time progressive reconstruction without artificial delays:
 * - Emits authentic updates as each mathematical stage finishes
 * - Yields execution to the browser paint loop for smooth UI responsiveness
 * - Supports prefersReducedMotion and immediate execution modes
 * - Error resilient: catches failures gracefully with partial state preservation
 */

import { IFaceDetectionService } from '../../services/faceDetection/types';
import { SegmentationService } from '../../services/segmentation/segmentationService';
import {
  ProgressiveStageId,
  PROGRESSIVE_STAGES,
  ProgressiveDataState,
  ProgressiveStageUpdate,
  ProgressiveCallback,
  ProgressiveRenderOptions,
} from './phase5Types';
import { analyzeFaceV2 } from './index';
import { reconstructFaceGeometry } from './faceGeometry';
import { reconstructHairGeometry } from './hairGeometry';
import { buildPhase3Portrait } from './phase3SvgRenderer';
import { extractV2Palette } from './paletteExtractor';
import { detectFacialHair } from './facialHairDetector';
import { detectLightingDirection, generateSkinShadingPlanes } from './skinShadingGenerator';
import { buildProgressiveSvg } from './progressiveSvgGenerator';

/**
 * Yields execution to the browser event loop so the DOM and canvas can repaint
 */
async function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

export function renderNormalizedCanvas(img: HTMLImageElement, transform: any): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1000, 1000);

  const m = transform.matrix;
  ctx.save();
  ctx.setTransform(m.a, m.b, m.c, m.d, m.tx, m.ty);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  return canvas;
}

export async function executeProgressivePortraitPipeline(
  photoId: string,
  image: HTMLImageElement,
  detector: IFaceDetectionService,
  segmenter?: SegmentationService,
  onStageUpdate?: ProgressiveCallback,
  options: ProgressiveRenderOptions = {}
): Promise<ProgressiveStageUpdate> {
  const tGlobalStart = performance.now();
  const shouldYield = options.yieldToBrowser !== false && !options.immediate;
  const reducedMotion = options.prefersReducedMotion || false;

  const data: ProgressiveDataState = {
    photoId,
    beautification: options.beautification || { brightnessBoost: 0, warmth: 0, vibrance: 1.0 },
  };

  const emit = (
    stageId: ProgressiveStageId,
    status: 'active' | 'completed' | 'failed',
    stageDurationMs: number,
    error?: string
  ): ProgressiveStageUpdate => {
    const stageIndex = PROGRESSIVE_STAGES.findIndex(s => s.id === stageId);
    const stageDef = PROGRESSIVE_STAGES[stageIndex];
    const isComplete = stageId === 'final-assembled' && status === 'completed';

    const { svg, code } = buildProgressiveSvg(stageId, data);
    const update: ProgressiveStageUpdate = {
      stageId,
      stageDef,
      status,
      svg,
      code,
      stageIndex,
      totalStages: PROGRESSIVE_STAGES.length,
      stageDurationMs: Math.round(stageDurationMs),
      cumulativeDurationMs: Math.round(performance.now() - tGlobalStart),
      isComplete,
      error,
      data: { ...data },
    };

    if (onStageUpdate) {
      // In reduced-motion mode, only emit the final completed stage
      if (!reducedMotion || isComplete || status === 'failed') {
        onStageUpdate(update);
      }
    }
    return update;
  };

  let lastUpdate: ProgressiveStageUpdate | null = null;

  try {
    // -------------------------------------------------------------
    // STAGE 1: Image Analysis & Canonical Framing
    // -------------------------------------------------------------
    let t0 = performance.now();
    const analysis = options.precomputedAnalysis || await analyzeFaceV2(image, detector, segmenter, {
      runMultiPassExperiment: false,
    });
    data.analysis = analysis;
    const normCanvas = renderNormalizedCanvas(image, analysis.transform);

    lastUpdate = emit('image-analysis', 'completed', performance.now() - t0);
    if (shouldYield && !reducedMotion) await yieldToBrowser();

    // -------------------------------------------------------------
    // STAGE 2: Face & Structural Contour
    // -------------------------------------------------------------
    t0 = performance.now();
    const face = reconstructFaceGeometry(analysis);
    data.face = face;

    lastUpdate = emit('face-geometry', 'completed', performance.now() - t0);
    if (shouldYield && !reducedMotion) await yieldToBrowser();

    // -------------------------------------------------------------
    // STAGE 3: Hair Silhouette & Cranial Volume
    // -------------------------------------------------------------
    t0 = performance.now();
    const hair = reconstructHairGeometry(analysis, {
      allowFallbackDome: true,
      epsilon: options.hairDecimationEpsilon,
    });
    data.hair = hair;

    lastUpdate = emit('hair-geometry', 'completed', performance.now() - t0);
    if (shouldYield && !reducedMotion) await yieldToBrowser();

    // -------------------------------------------------------------
    // STAGE 4: Anatomical Facial Features
    // -------------------------------------------------------------
    t0 = performance.now();
    const phase3 = buildPhase3Portrait(photoId, analysis, normCanvas);
    data.features = phase3.features;

    lastUpdate = emit('facial-features', 'completed', performance.now() - t0);
    if (shouldYield && !reducedMotion) await yieldToBrowser();

    // -------------------------------------------------------------
    // STAGE 5: OKLab Palettes & Planar Shading
    // -------------------------------------------------------------
    t0 = performance.now();
    const palette = extractV2Palette(normCanvas, analysis, data.beautification);
    data.palette = palette;

    const facialHair = detectFacialHair(
      normCanvas,
      analysis,
      palette.hairBase,
      options.facialHairMode || 'auto',
      palette.skinBase
    );
    data.facialHair = facialHair;

    const leftCheek = { x: 420, y: analysis.landmarks!.leftEye.pupil.y + 40 };
    const rightCheek = { x: 580, y: analysis.landmarks!.rightEye.pupil.y + 40 };
    const lighting = detectLightingDirection(normCanvas, leftCheek, rightCheek);
    data.lighting = lighting;

    const shading = generateSkinShadingPlanes(analysis, face, lighting);
    data.shading = shading;

    lastUpdate = emit('colour-regions', 'completed', performance.now() - t0);
    if (shouldYield && !reducedMotion) await yieldToBrowser();

    // -------------------------------------------------------------
    // STAGE 6: Final Vector SVG Assembly
    // -------------------------------------------------------------
    t0 = performance.now();
    lastUpdate = emit('final-assembled', 'completed', performance.now() - t0);

    return lastUpdate;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Progressive portrait pipeline failed:', errorMsg);
    // Emit failure update
    const failedStage = lastUpdate ? lastUpdate.stageId : 'image-analysis';
    return emit(failedStage, 'failed', 0, errorMsg);
  }
}

export interface UpdateProgressiveStylingOptions {
  normCanvas?: HTMLCanvasElement | null;
  facialHairMode?: 'auto' | 'off' | 'on';
  brightnessBoost?: number;
  hairDecimationEpsilon?: number;
}

/**
 * Re-derives styling and geometric parameters on already analyzed data in milliseconds
 */
export function updateProgressiveStyling(
  data: ProgressiveDataState,
  options: UpdateProgressiveStylingOptions
): ProgressiveDataState {
  if (!data.analysis) return data;
  const analysis = data.analysis;
  const updated: ProgressiveDataState = { ...data };

  // 1. Update hair decimation if requested
  if (options.hairDecimationEpsilon !== undefined && options.hairDecimationEpsilon > 0) {
    updated.hair = reconstructHairGeometry(analysis, { epsilon: options.hairDecimationEpsilon });
  }

  // 2. Update palette & beautification if brightnessBoost changed
  const boost = options.brightnessBoost !== undefined ? options.brightnessBoost : (data.beautification?.brightnessBoost ?? 0);
  updated.beautification = {
    brightnessBoost: boost,
    warmth: data.beautification?.warmth ?? 0,
    vibrance: data.beautification?.vibrance ?? 1.0,
  };

  const normCanvas = options.normCanvas || null;
  const palette = extractV2Palette(normCanvas, analysis, updated.beautification);
  updated.palette = palette;

  // 3. Update facial hair mode
  const hairMode = options.facialHairMode ?? data.facialHair?.mode ?? 'auto';
  updated.facialHair = detectFacialHair(
    normCanvas,
    analysis,
    palette.hairBase,
    hairMode,
    palette.skinBase
  );

  return updated;
}
