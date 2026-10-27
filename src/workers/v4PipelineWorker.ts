/**
 * CodeMyFace V4 — Background Pipeline Web Worker
 * Runs heavy vector tracing and layer synthesis off the main thread.
 * Enables zero-lag UI, live progress reporting, fast underpainting streaming, and instant cancellation.
 */

// Worker-side polyfills for browser globals
if (typeof self !== 'undefined') {
  if (typeof (self as any).window === 'undefined') {
    (self as any).window = self;
  }
  if (typeof (self as any).document === 'undefined') {
    (self as any).document = {
      createElement: (tag: string) => {
        if (tag === 'canvas') {
          return new OffscreenCanvas(300, 150);
        }
        return {};
      },
    };
  }
}

// @ts-ignore
import ImageTracerModule from 'imagetracerjs';
import { runV4Pipeline } from '../engine/v4/v4Pipeline';
import { applyFastBlur } from '../engine/v4/experimentA/regionAwareTracer';
import { optimizeSvgDocument, extractPaintingLayers, mergePathsIntoColorLayers } from '../engine/v4/svgOptimizer';
import { minifySvgDocument } from '../engine/v4/sizeOptimizer/svgMinifier';
import flags from '../flags';
import type { V4ExperimentOptions } from '../engine/v4/types';
import type { NormalizedLandmark } from '../services/faceDetection/types';

const ImageTracer = (ImageTracerModule as any)?.default || ImageTracerModule;

self.onmessage = async (e: MessageEvent) => {
  const { type, imageData, width, height, landmarks, categoryMask, options } = e.data;

  if (type === 'RUN_V4') {
    try {
      const startTime = performance.now();

      self.postMessage({
        type: 'STAGE',
        stage: 'Underpainting',
        message: 'Underpainting stage started: computing rapid tonal foundation...',
        percent: 15,
        timeMs: Math.round(performance.now() - startTime),
      });

      // 1. FAST UNDERPAINTING (Appears in < 1 second, typically ~150-250ms)
      const bottomScale = 0.5;
      const bW = Math.max(160, Math.round(width * bottomScale));
      const bH = Math.max(160, Math.round(height * bottomScale));

      const bottomCanvas = new OffscreenCanvas(bW, bH);
      const bCtx = bottomCanvas.getContext('2d')!;
      
      // Draw downscaled image for fast underpainting
      const fullCanvas = new OffscreenCanvas(width, height);
      const fullCtx = fullCanvas.getContext('2d')!;
      fullCtx.putImageData(imageData, 0, 0);

      bCtx.drawImage(fullCanvas, 0, 0, bW, bH);
      const bRawData = bCtx.getImageData(0, 0, bW, bH);
      const blurredUnderlay = applyFastBlur(bRawData, 3);

      const bottomOptions = {
        corsenabled: false,
        ltres: 1.0,
        qtres: 1.0,
        pathomit: 0,
        rightangleenhance: false,
        colorsampling: 2,
        numberofcolors: 10,
        colorquantcycles: 2,
        layering: 1,
        strokewidth: 0,
        linefilter: false,
        scale: 1 / bottomScale,
        roundcoords: 1,
        viewbox: true,
        desc: false,
        blurradius: 0,
        blurdelta: 10,
      };

      let bottomSvg = '';
      try {
        bottomSvg = ImageTracer.imagedataToSVG(blurredUnderlay, bottomOptions);
      } catch (err) {
        console.warn('Fast underpainting trace warning:', err);
      }

      const underPaths = bottomSvg.match(/<path\b[^>]*\/?>/gi) || [];
      const { layers: underLayers } = mergePathsIntoColorLayers(underPaths, 1);
      const underpaintingPaintingLayers = underLayers.map((l, i) => ({
        layerId: l.layerId,
        colorHex: l.colorHex,
        d: l.d,
        opacity: l.opacity ? parseFloat(l.opacity) : 1,
        stage: 'Underpainting' as const,
        layerIndex: i + 1,
      }));

      const underpaintingTimeMs = Math.round(performance.now() - startTime);

      // Post fast underpainting immediately (< 1s guarantee)
      self.postMessage({
        type: 'UNDERPAINTING_READY',
        layers: underpaintingPaintingLayers,
        timeMs: underpaintingTimeMs,
        message: `Underpainting ready in ${underpaintingTimeMs}ms (${underpaintingPaintingLayers.length} base color layers).`,
      });

      self.postMessage({
        type: 'STAGE',
        stage: 'Blocking in',
        message: 'Blocking in major planes and subject silhouettes...',
        percent: 35,
        timeMs: Math.round(performance.now() - startTime),
      });

      // 2. Full High-Fidelity Tracing
      const t0 = performance.now();
      const pipelineResult = await runV4Pipeline({
        image: fullCanvas as any,
        landmarks: landmarks as NormalizedLandmark[],
        categoryMask,
        options: options as V4ExperimentOptions,
      });

      self.postMessage({
        type: 'STAGE',
        stage: 'Modelling',
        message: 'Modelling tonal volumes, facial contours, and skin midtones...',
        percent: 70,
        timeMs: Math.round(performance.now() - startTime),
      });

      // Clean SVG output (Candidate A in 'recreation' mode, Candidate C in 'painting' mode)
      const isRecreation = options?.mode !== 'painting';
      let finalSvg = isRecreation
        ? pipelineResult.candidates['candidate-a'].svgString
        : pipelineResult.candidates['candidate-c'].svgString;

      if (!isRecreation) {
        const mergedSvg = optimizeSvgDocument(finalSvg);
        finalSvg = flags.sizeOptimizer
          ? minifySvgDocument(mergedSvg, { preset: 'balanced' })
          : mergedSvg;
        pipelineResult.candidates['candidate-c'].svgString = finalSvg;
      }

      // Extract all final painting layers in sequential stacking order (1x coordinate space for canvas)
      const allPaintingLayers = extractPaintingLayers(finalSvg);

      self.postMessage({
        type: 'STAGE',
        stage: 'Details',
        message: 'Tracing fine biometric feature detail, eyes, and hair locks...',
        percent: 88,
        timeMs: Math.round(performance.now() - startTime),
      });

      const durationMs = Math.round(performance.now() - t0);

      self.postMessage({
        type: 'STAGE',
        stage: 'Varnish',
        message: 'Varnish: applying protective light sheen across canvas...',
        percent: 96,
        timeMs: Math.round(performance.now() - startTime),
      });

      self.postMessage({
        type: 'SUCCESS',
        result: pipelineResult,
        layers: allPaintingLayers,
        underpaintingTimeMs,
        durationMs,
        totalTimeMs: Math.round(performance.now() - startTime),
      });
    } catch (err: any) {
      console.error('[v4Worker] Error during vector tracing:', err);
      self.postMessage({
        type: 'ERROR',
        error: err?.message || String(err),
      });
    }
  }
};
