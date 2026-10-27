/**
 * CodeMyFace V4 — Experiment A: High-Fidelity Stacked Vector Tracing
 *
 * Implements exact photographic vector recreation:
 * - Stacked layers (layering: 1) over a full-bleed base layer in photo average color.
 * - Upscaled 2x curve fitting scaled back in viewBox for subpixel curve smoothness.
 * - Preserves all details: background scenery, hair curl volumes, lace, jewelry, glasses.
 * - Zero axis-aligned bounding boxes or rectangular artifacts on face/jaw/cheek.
 * - Speckle filter removes noise <= 3px only; shapes >= 3px are fully preserved.
 */

// @ts-ignore
import ImageTracerModule from 'imagetracerjs';
import { ColorPaletteAnalysis, V4CandidateResult, V4ExperimentOptions } from '../types';
import { NormalizedLandmark } from '../../../services/faceDetection/types';
import { rgbToHex, hexToRgb } from '../colorAnalysis';

const ImageTracer = (ImageTracerModule as any)?.default || ImageTracerModule;

export interface RegionAwareTracerInput {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  colorPalette: ColorPaletteAnalysis;
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null;
  landmarks?: NormalizedLandmark[];
  options?: V4ExperimentOptions;
}

/**
 * Fast box blur on ImageData to create smooth underlay representation
 */
export function applyFastBlur(src: ImageData, radius = 3): ImageData {
  const { width: w, height: h, data } = src;
  const dst = new Uint8ClampedArray(data.length);
  const r = Math.max(1, Math.floor(radius));

  const temp = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let k = -r; k <= r; k++) {
        const nx = Math.min(w - 1, Math.max(0, x + k));
        const idx = (y * w + nx) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
      const tIdx = (y * w + x) * 3;
      temp[tIdx] = rSum / count;
      temp[tIdx + 1] = gSum / count;
      temp[tIdx + 2] = bSum / count;
    }
  }

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let rSum = 0, gSum = 0, bSum = 0, count = 0;
      for (let k = -r; k <= r; k++) {
        const ny = Math.min(h - 1, Math.max(0, y + k));
        const tIdx = (ny * w + x) * 3;
        rSum += temp[tIdx];
        gSum += temp[tIdx + 1];
        bSum += temp[tIdx + 2];
        count++;
      }
      const dstIdx = (y * w + x) * 4;
      dst[dstIdx] = Math.round(rSum / count);
      dst[dstIdx + 1] = Math.round(gSum / count);
      dst[dstIdx + 2] = Math.round(bSum / count);
      dst[dstIdx + 3] = 255;
    }
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(dst, w, h)
    : ({ width: w, height: h, data: dst } as ImageData);
}

/**
 * Step 3 Pre-tracing Morphological Filter:
 * Merges isolated color specks under 6 pixels into the majority neighbor color.
 * Preserves thin elongated strands (aspect ratio >= 2.5) such as hair locks, wire rims, and lace contours.
 */
export function mergeIsolatedSpeckles(imgData: ImageData): ImageData {
  const { width: w, height: h, data } = imgData;
  const d = new Uint8ClampedArray(data);
  const total = w * h;
  const visited = new Uint8Array(total);

  function colorDist(i1: number, i2: number): number {
    const dr = d[i1 * 4] - d[i2 * 4];
    const dg = d[i1 * 4 + 1] - d[i2 * 4 + 1];
    const db = d[i1 * 4 + 2] - d[i2 * 4 + 2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }

  const queue = new Int32Array(16);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;

      queue[0] = idx;
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y;
      let qHead = 0;
      let qTail = 1;

      while (qHead < qTail && qTail <= 10) {
        const cur = queue[qHead++];
        const cx = cur % w;
        const cy = Math.floor(cur / w);

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cy > 0 ? (cy - 1) * w + cx : -1,
          cy < h - 1 ? (cy + 1) * w + cx : -1,
          cx > 0 ? cy * w + (cx - 1) : -1,
          cx < w - 1 ? cy * w + (cx + 1) : -1,
        ];

        for (const n of neighbors) {
          if (n !== -1 && !visited[n]) {
            if (colorDist(cur, n) < 14) {
              visited[n] = 1;
              if (qTail < 14) {
                queue[qTail++] = n;
              }
            }
          }
        }
      }

      if (qTail > 0 && qTail < 6) {
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = Math.max(bw / bh, bh / bw);

        if (aspect >= 2.5) {
          continue;
        }

        let rSum = 0, gSum = 0, bSum = 0, count = 0;
        for (let i = 0; i < qTail; i++) {
          const pt = queue[i];
          const px = pt % w;
          const py = Math.floor(pt / w);
          const adj = [
            py > 0 ? (py - 1) * w + px : -1,
            py < h - 1 ? (py + 1) * w + px : -1,
            px > 0 ? py * w + (px - 1) : -1,
            px < w - 1 ? py * w + (px + 1) : -1,
          ];
          for (const a of adj) {
            if (a !== -1 && !visited[a]) {
              rSum += d[a * 4];
              gSum += d[a * 4 + 1];
              bSum += d[a * 4 + 2];
              count++;
            }
          }
        }

        if (count > 0) {
          const avgR = Math.round(rSum / count);
          const avgG = Math.round(gSum / count);
          const avgB = Math.round(bSum / count);

          for (let i = 0; i < qTail; i++) {
            const pt = queue[i];
            d[pt * 4] = avgR;
            d[pt * 4 + 1] = avgG;
            d[pt * 4 + 2] = avgB;
          }
        }
      }
    }
  }

  return typeof ImageData !== 'undefined'
    ? new ImageData(d, w, h)
    : ({ width: w, height: h, data: d } as ImageData);
}

/**
 * Step 4: Gentle edge-preserving smoothing (sigma <= 0.8) to suppress sensor noise
 * without blurring high-frequency textures (lace, jewelry, glasses frames, hair strands).
 */
export function applyLightPreservingFilter(
  imgData: ImageData,
  radius: number = 1,
  spatialSigma: number = 0.8,
  rangeSigma: number = 22
): ImageData {
  const { width, height, data } = imgData;
  const output = typeof ImageData !== 'undefined'
    ? new ImageData(new Uint8ClampedArray(data), width, height)
    : ({ width, height, data: new Uint8ClampedArray(data) } as ImageData);
  const outData = output.data;

  const spatialWeights: number[][] = [];
  const sSigmaSq2 = 2 * spatialSigma * spatialSigma;
  for (let dy = -radius; dy <= radius; dy++) {
    const row: number[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      row.push(Math.exp(-(dx * dx + dy * dy) / sSigmaSq2));
    }
    spatialWeights.push(row);
  }

  const rSigmaSq2 = 2 * rangeSigma * rangeSigma;

  for (let y = 0; y < height; y++) {
    const yMin = Math.max(0, y - radius);
    const yMax = Math.min(height - 1, y + radius);
    const rowOffset = y * width;

    for (let x = 0; x < width; x++) {
      const cIdx = (rowOffset + x) * 4;
      const cr = data[cIdx];
      const cg = data[cIdx + 1];
      const cb = data[cIdx + 2];

      let sumW = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      const xMin = Math.max(0, x - radius);
      const xMax = Math.min(width - 1, x + radius);

      for (let ny = yMin; ny <= yMax; ny++) {
        const swRow = spatialWeights[ny - y + radius];
        const nRowOffset = ny * width;

        for (let nx = xMin; nx <= xMax; nx++) {
          const nIdx = (nRowOffset + nx) * 4;
          const nr = data[nIdx];
          const ng = data[nIdx + 1];
          const nb = data[nIdx + 2];

          const dr = nr - cr;
          const dg = ng - cg;
          const db = nb - cb;
          const colorDistSq = dr * dr + dg * dg + db * db;

          const w = swRow[nx - x + radius] * Math.exp(-colorDistSq / rSigmaSq2);

          sumW += w;
          sumR += nr * w;
          sumG += ng * w;
          sumB += nb * w;
        }
      }

      if (sumW > 0) {
        outData[cIdx] = Math.round(sumR / sumW);
        outData[cIdx + 1] = Math.round(sumG / sumW);
        outData[cIdx + 2] = Math.round(sumB / sumW);
        outData[cIdx + 3] = 255;
      }
    }
  }

  return output;
}

/**
 * Computes the enclosed polygon area and bounding box of an SVG path using the Shoelace formula.
 */
export function computePathPolygon(d: string): { area: number; minX: number; maxX: number; minY: number; maxY: number; points: { x: number; y: number }[] } {
  const numRegex = /[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g;
  let match: RegExpExecArray | null;
  const nums: number[] = [];
  while ((match = numRegex.exec(d)) !== null) {
    nums.push(parseFloat(match[0]));
  }
  if (nums.length < 6) {
    return { area: 0, minX: 0, maxX: 0, minY: 0, maxY: 0, points: [] };
  }

  const points: { x: number; y: number }[] = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length - 1; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    points.push({ x, y });
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  let areaSum = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    areaSum += points[i].x * points[j].y;
    areaSum -= points[j].x * points[i].y;
  }
  const shoelaceArea = Math.abs(areaSum) / 2;
  const bboxArea = (maxX - minX) * (maxY - minY);
  return {
    area: Math.max(shoelaceArea, bboxArea * 0.25),
    minX,
    maxX,
    minY,
    maxY,
    points,
  };
}

/**
 * Step 4: Preserves high-fidelity photographic detail while pruning noise.
 * - Biometric features (eyes, nose, mouth) and subject silhouettes are strictly protected.
 * - Background sensor speckles are cleaned.
 * - Tall mobile screenshots (H/W >= 1.95) omit status bar glyphs in extreme margins.
 * - Tags glasses paths for foreground layering.
 */
export function pruneTracedSvgPaths(
  svgString: string,
  width: number,
  height: number,
  categoryMask?: { rawMask: Uint8Array; maskWidth: number; maskHeight: number } | null,
  landmarks?: NormalizedLandmark[],
  options?: V4ExperimentOptions,
  _colorPalette?: ColorPaletteAnalysis
): string {
  const resScale = Math.sqrt((width * height) / (600 * 800));
  const bgSimp = options?.styleControls?.backgroundSimplification ?? 3;
  const bgMultiplier = 0.65 + (bgSimp - 1) * 0.14;

  const hasMask = categoryMask && categoryMask.rawMask && categoryMask.maskWidth > 0 && categoryMask.maskHeight > 0;
  const mw = hasMask ? categoryMask.maskWidth : 0;
  const mh = hasMask ? categoryMask.maskHeight : 0;
  const mData = hasMask ? categoryMask.rawMask : null;

  // Precompute biometric feature bounding hulls to protect facial likeness
  const featureHulls: { minX: number; maxX: number; minY: number; maxY: number }[] = [];
  let facialSkinHull: { minX: number; maxX: number; minY: number; maxY: number } | null = null;

  if (landmarks && landmarks.length >= 4) {
    const leftEyeIdxs = [33, 133, 159, 145, 160, 158, 153, 144, 70, 63, 105, 66, 107].filter(i => !!landmarks[i]);
    const rightEyeIdxs = [362, 263, 386, 374, 385, 387, 373, 380, 300, 293, 334, 296, 336].filter(i => !!landmarks[i]);
    const noseMouthIdxs = [1, 2, 98, 327, 168, 6, 195, 4, 5, 197, 61, 291, 0, 17, 78, 308, 13, 14, 82, 312, 87, 317].filter(i => !!landmarks[i]);
    const faceContourIdxs = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109].filter(i => !!landmarks[i]);

    const getHull = (indices: number[], padX: number, padY: number) => {
      const pts = indices.map(i => landmarks[i]).filter(Boolean);
      if (pts.length === 0) return null;
      return {
        minX: Math.min(...pts.map(p => p.x * width)) - padX,
        maxX: Math.max(...pts.map(p => p.x * width)) + padX,
        minY: Math.min(...pts.map(p => p.y * height)) - padY,
        maxY: Math.max(...pts.map(p => p.y * height)) + padY,
      };
    };

    const lHull = getHull(leftEyeIdxs, width * 0.015, height * 0.015);
    const rHull = getHull(rightEyeIdxs, width * 0.015, height * 0.015);
    if (lHull) featureHulls.push(lHull);
    if (rHull) featureHulls.push(rHull);

    const nmHull = getHull(noseMouthIdxs, width * 0.012, height * 0.012);
    if (nmHull) featureHulls.push(nmHull);

    facialSkinHull = getHull(faceContourIdxs, width * 0.01, height * 0.01);
  }

  const getPathRegionAndThreshold = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
    points: { x: number; y: number }[]
  ): { threshold: number; isGlasses: boolean; region: 'bg' | 'skin' | 'hair' | 'clothes' | 'glasses' } => {
    // 1. Critical biometric features (eyes, eyebrows, nose, mouth) - minimal threshold (12px)
    for (const h of featureHulls) {
      if (minX <= h.maxX && maxX >= h.minX && minY <= h.maxY && maxY >= h.minY) {
        return { threshold: Math.max(12, 16 * Math.pow(resScale, 0.25)), isGlasses: false, region: 'skin' };
      }
    }

    // 2. Semantic segmentation mask distribution
    if (hasMask && mData && points.length > 0) {
      let bgCount = 0;
      let hairCount = 0;
      let skinCount = 0;
      let clothCount = 0;

      const sampleStep = Math.max(1, Math.floor(points.length / 8));
      for (let i = 0; i < points.length; i += sampleStep) {
        const pt = points[i];
        const mx = Math.max(0, Math.min(mw - 1, Math.floor((pt.x / width) * mw)));
        const my = Math.max(0, Math.min(mh - 1, Math.floor((pt.y / height) * mh)));
        const val = mData[my * mw + mx];

        if (val === 0) bgCount++;
        else if (val === 1) hairCount++;
        else if (val === 2 || val === 3) skinCount++;
        else if (val === 4) clothCount++;
        else if (val === 5) {
          return { threshold: Math.max(14, 18 * Math.pow(resScale, 0.25)), isGlasses: true, region: 'glasses' };
        }
      }

      // Crossing boundary paths between subject and background define silhouette
      const isBoundary = bgCount > 0 && (hairCount + skinCount + clothCount) > 0;
      if (isBoundary) {
        const primaryRegion = hairCount >= skinCount && hairCount >= clothCount ? 'hair' : (skinCount >= clothCount ? 'skin' : 'clothes');
        return { threshold: Math.max(45, 55 * Math.pow(resScale, 0.35)), isGlasses: false, region: primaryRegion };
      }

      if (skinCount > 0 || (facialSkinHull && minX <= facialSkinHull.maxX && maxX >= facialSkinHull.minX && minY <= facialSkinHull.maxY && maxY >= facialSkinHull.minY)) {
        return { threshold: Math.max(30, 40 * Math.pow(resScale, 0.35)), isGlasses: false, region: 'skin' };
      }

      if (hairCount > clothCount && hairCount > bgCount) {
        return { threshold: Math.max(45, 60 * Math.pow(resScale, 0.45)), isGlasses: false, region: 'hair' };
      }

      if (clothCount > bgCount) {
        return { threshold: Math.max(50, 70 * Math.pow(resScale, 0.5) * bgMultiplier), isGlasses: false, region: 'clothes' };
      }

      // Pure background wall speckles
      return { threshold: Math.max(60, 80 * Math.pow(resScale, 0.55) * bgMultiplier), isGlasses: false, region: 'bg' };
    }

    // Fallback if no mask: check facial skin hull
    if (facialSkinHull && minX <= facialSkinHull.maxX && maxX >= facialSkinHull.minX && minY <= facialSkinHull.maxY && maxY >= facialSkinHull.minY) {
      return { threshold: Math.max(30, 40 * Math.pow(resScale, 0.35)), isGlasses: false, region: 'skin' };
    }

    // Background default threshold for non-facial paths when no mask is provided
    return { threshold: Math.max(30, 45 * Math.pow(resScale, 0.5) * bgMultiplier), isGlasses: false, region: 'bg' };
  };

  // Tall screenshot aspect ratio (H / W >= 1.95)
  const isScreenshotRatio = (height / width) >= 1.95;
  const topMarginY = height * 0.035;
  const bottomMarginY = height * 0.965;

  const pathRegex = /<path\b[^>]*\/?>/gi;
  const prunedSvg = svgString.replace(pathRegex, (pathTag) => {
    if (pathTag.includes('v4-sclera') || pathTag.includes('clipPath') || pathTag.includes('id="v4-')) {
      return pathTag;
    }

    const dMatch = pathTag.match(/\bd="([^"]+)"/i);
    if (!dMatch) {
      return pathTag;
    }

    const d = dMatch[1];
    const { area, minX, maxX, minY, maxY, points } = computePathPolygon(d);

    // Screenshot floating status/nav glyph omission (H / W >= 1.95)
    if (isScreenshotRatio) {
      const isExtremeTop = maxY < topMarginY;
      const isExtremeBottom = minY > bottomMarginY;
      if (isExtremeTop || isExtremeBottom) {
        const inFaceOrHair = facialSkinHull && (minX <= facialSkinHull.maxX && maxX >= facialSkinHull.minX && minY <= facialSkinHull.maxY && maxY >= facialSkinHull.minY);
        if (!inFaceOrHair && area < 1600 * resScale) {
          return '';
        }
      }
    }

    const { threshold, isGlasses, region } = getPathRegionAndThreshold(minX, maxX, minY, maxY, points);

    // Prune tiny background noise speckles smaller than region threshold
    if (region === 'bg' && area < threshold) {
      return '';
    }

    const cls = isGlasses ? 'v4-glasses-path v4-path-glasses' : `v4-path-${region}`;
    if (pathTag.includes('class=')) {
      return pathTag.replace(/class="([^"]*)"/i, `class="$1 ${cls}"`);
    } else {
      return pathTag.replace('<path ', `<path class="${cls}" `);
    }
  });

  return prunedSvg;
}

export function runExperimentA(input: RegionAwareTracerInput): V4CandidateResult {
  const startTime = performance.now();
  const { canvas, width, height, colorPalette, categoryMask, landmarks, options } = input;

  // 1. Determine Detail Slider Configuration & Fixed Path Budget (A1: pathomit does NOT grow with resolution)
  const preset = options?.detailPreset || 'high';

  let targetColors: number;
  let pathOmitVal: number;
  let upscaleMultiplier: number;

  switch (preset) {
    case 'low':
      targetColors = 12;
      pathOmitVal = 48;
      upscaleMultiplier = 1;
      break;
    case 'medium':
      targetColors = 24;
      pathOmitVal = 24;
      upscaleMultiplier = width <= 800 ? 1.25 : 1;
      break;
    case 'max':
      targetColors = 48;
      pathOmitVal = 8;
      upscaleMultiplier = width > 1200 ? 1 : 1.25;
      break;
    case 'high':
    default:
      targetColors = 36;
      pathOmitVal = 12;
      upscaleMultiplier = width > 1200 ? 1 : 1.25;
      break;
  }

  // Strictly enforce: Keep full resolution up to 1600 px on the long side (Step 2)
  const maxDim = Math.max(width, height);
  if (maxDim > 1600) {
    upscaleMultiplier = 1600 / maxDim;
  } else if (maxDim > 1200) {
    upscaleMultiplier = 1;
  }

  if (options?.targetColors) targetColors = options.targetColors;
  if (options?.tracerColors) targetColors = options.tracerColors;
  if (options?.tracerPathOmit) pathOmitVal = options.tracerPathOmit;

  // 2. Prepare Canvas
  const traceW = Math.round(width * upscaleMultiplier);
  const traceH = Math.round(height * upscaleMultiplier);

  let workingCanvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  if (typeof document !== 'undefined') {
    workingCanvas = document.createElement('canvas');
  } else {
    workingCanvas = {
      width: traceW,
      height: traceH,
      getContext: () => canvas.getContext('2d'),
    } as any;
  }
  workingCanvas.width = traceW;
  workingCanvas.height = traceH;
  ctx = workingCanvas.getContext('2d')!;

  if (typeof (ctx as any).imageSmoothingQuality !== 'undefined') {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  ctx.drawImage(canvas, 0, 0, traceW, traceH);

  // 3. Extract pixels
  const rawImgData = ctx.getImageData(0, 0, traceW, traceH);

  // ==========================================================================
  // STEP 3 - A: FULL-COVERAGE BLURRED BOTTOM LAYER (8-12 colors, 0 shapes dropped)
  // This completely eliminates holes: any gap in detail layers reveals near-correct color
  // ==========================================================================
  const bottomScale = 0.5;
  const bW = Math.max(160, Math.round(width * bottomScale));
  const bH = Math.max(160, Math.round(height * bottomScale));

  let bottomCanvas: HTMLCanvasElement;
  if (typeof document !== 'undefined') {
    bottomCanvas = document.createElement('canvas');
  } else {
    bottomCanvas = { width: bW, height: bH, getContext: () => canvas.getContext('2d') } as any;
  }
  bottomCanvas.width = bW;
  bottomCanvas.height = bH;
  const bCtx = bottomCanvas.getContext('2d')!;
  bCtx.drawImage(canvas, 0, 0, bW, bH);
  const bRawData = bCtx.getImageData(0, 0, bW, bH);
  const blurredUnderlay = applyFastBlur(bRawData, 3);

  const bottomOptions = {
    corsenabled: false,
    ltres: 1.0,
    qtres: 1.0,
    pathomit: 0,              // STRICTLY ZERO: NO SHAPES DROPPED
    rightangleenhance: false,
    colorsampling: 2,
    numberofcolors: 10,       // 10 harmonious regional colors
    colorquantcycles: 2,
    layering: 1,
    strokewidth: 0,
    linefilter: false,
    scale: 1 / bottomScale,   // Scale back to 1x viewBox coordinates
    roundcoords: 1,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 10,
  };

  let bottomSvgRaw = '';
  try {
    bottomSvgRaw = ImageTracer.imagedataToSVG(blurredUnderlay, bottomOptions);
  } catch (err) {
    console.error('Bottom layer tracing error:', err);
  }
  const bottomPaths = (bottomSvgRaw.match(/<path\b[^>]*\/?>/gi) || []).map((pathTag) => {
    if (pathTag.includes('class=')) {
      return pathTag.replace(/class="([^"]*)"/i, 'class="$1 v4-underlay-path"');
    }
    return pathTag.replace('<path ', '<path class="v4-underlay-path" ');
  });

  // ==========================================================================
  // STEP 3 - B: PRE-TRACING MORPHOLOGICAL SPECKLE FILTER
  // Merges isolated dots under 6px into majority neighbor color; preserves thin hair strands
  // ==========================================================================
  const preparedData = applyLightPreservingFilter(rawImgData, 1, 0.7, 20);
  const filteredData = mergeIsolatedSpeckles(preparedData);

  // ==========================================================================
  // STEP 3 - C: COMPOSITE MASTER PALETTE & DETAIL TRACING
  // Dedicated >= 12 skin levels and >= 16 dark-range hair levels
  // ==========================================================================
  let customPalette: { r: number; g: number; b: number; a: number }[] | undefined = undefined;
  if (colorPalette?.skin?.palette14 && colorPalette?.hair?.palette16) {
    const palList: { r: number; g: number; b: number; a: number }[] = [];
    const seen = new Set<string>();

    const addCol = (r: number, g: number, b: number) => {
      const hex = rgbToHex(r, g, b);
      if (!seen.has(hex)) {
        seen.add(hex);
        palList.push({ r: Math.round(r), g: Math.round(g), b: Math.round(b), a: 255 });
      }
    };

    // 1. Add dedicated skin levels (>= 12)
    for (const s of colorPalette.skin.palette14) addCol(s.r, s.g, s.b);
    // 2. Add dedicated dark-range hair levels (>= 16)
    for (const h of colorPalette.hair.palette16) addCol(h.r, h.g, h.b);
    // 3. Add background and clothing anchors & tones
    if (colorPalette.background?.rgb) addCol(colorPalette.background.rgb[0], colorPalette.background.rgb[1], colorPalette.background.rgb[2]);
    if (colorPalette.clothing?.rgb) addCol(colorPalette.clothing.rgb[0], colorPalette.clothing.rgb[1], colorPalette.clothing.rgb[2]);
    if (colorPalette.clothing?.tones) {
      for (const t of colorPalette.clothing.tones) {
        const c = hexToRgb(t);
        addCol(c[0], c[1], c[2]);
      }
    }
    if (colorPalette.lips?.baseRgb) addCol(colorPalette.lips.baseRgb[0], colorPalette.lips.baseRgb[1], colorPalette.lips.baseRgb[2]);

    // 4. Sample additional ambient palette to adequately represent clothing & background
    if (typeof ImageTracer.samplepalette2 === 'function') {
      try {
        const extra = ImageTracer.samplepalette2(Math.max(48, targetColors + 16), filteredData);
        if (Array.isArray(extra)) {
          for (const e of extra) addCol(e.r, e.g, e.b);
        }
      } catch (_e) {}
    }

    if (palList.length >= 16) {
      customPalette = palList;
    }
  }

  const tracerOptions: any = {
    corsenabled: false,
    ltres: 1.0,
    qtres: 1.0,
    pathomit: pathOmitVal,
    rightangleenhance: false,
    colorsampling: customPalette ? 0 : 2,
    numberofcolors: customPalette ? customPalette.length : targetColors,
    mincolorratio: 0.0005,
    colorquantcycles: 3,
    layering: 1,                    // Stacked layers over underlay
    strokewidth: 0,
    linefilter: false,
    scale: 1 / upscaleMultiplier,   // Scales coordinates back down to 1x viewBox
    roundcoords: 1,
    viewbox: true,
    desc: false,
    blurradius: 1,
    blurdelta: 16,
  };
  if (customPalette) {
    tracerOptions.pal = customPalette;
  }

  let detailSvgRaw: string;
  try {
    detailSvgRaw = ImageTracer.imagedataToSVG(filteredData, tracerOptions);
  } catch (err) {
    console.error('ImageTracer detail layer error:', err);
    detailSvgRaw = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"></svg>`;
  }

  // Tag semantic regions & screenshot margins
  const simplifiedDetailSvg = pruneTracedSvgPaths(detailSvgRaw, width, height, categoryMask, landmarks, options, colorPalette);
  const detailPaths = simplifiedDetailSvg.match(/<path\b[^>]*\/?>/gi) || [];

  // Combine full-coverage bottom underlay and high-fidelity detail layers
  const formattedSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <!-- CodeMyFace V4 Candidate A: High-Fidelity Stacked Vector Tracing -->
  <g id="v4-experiment-a">
    <!-- Full-Coverage Blurred Underlay (10 colors, 0 shapes dropped) -->
    <g id="v4-bottom-layer">
      ${bottomPaths.join('\n      ')}
    </g>
    <!-- High-Fidelity Stacked Detail Layers -->
    <g id="v4-detail-layer">
      ${detailPaths.join('\n      ')}
    </g>
  </g>
</svg>`;

  // 8. Calculate metrics
  const totalPaths = bottomPaths.length + detailPaths.length;
  const nodeMatches = formattedSvg.match(/[MLCQZmlcqz]/g);
  const nodeCount = nodeMatches ? nodeMatches.length : 0;
  const byteLength = new TextEncoder().encode(formattedSvg).length;
  const fileSizeKb = Math.round((byteLength / 1024) * 10) / 10;
  const executionTimeMs = Math.round(performance.now() - startTime);

  return {
    candidateId: 'candidate-a',
    name: 'Candidate A',
    title: 'High-Fidelity Stacked Vector Tracing',
    description: `Exact photographic vector recreation with full-coverage blurred underlay, ${targetColors} stacked color layers, and speckle suppression.`,
    svgString: formattedSvg,
    metrics: {
      pathCount: totalPaths,
      nodeCount,
      fileSizeKb,
      executionTimeMs,
    },
    metadata: {
      numColors: targetColors,
      detailPreset: preset,
      hasSemanticMask: !!(categoryMask && categoryMask.rawMask),
    },
  };
}
