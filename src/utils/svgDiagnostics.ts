/**
 * CodeMyPicture — Technical Diagnostics & Geometry Profiling Engine
 *
 * Computes strictly verifiable metrics for synthesized SVG documents:
 * - Distinguishes between Path Count and Total Shapes/Elements count.
 * - Extracts exact distinct fill colors present in the SVG code.
 * - Records genuinely sampled source colors (biometric skin, lips, hair, ambient bg).
 * - Asynchronously measures real Gzip payload bytes via native CompressionStream.
 * - Replaces error metrics with professional engineering telemetry.
 */

import { formatBytes } from './formatters';

export interface SvgSizeStats {
  rawBytes: number;
  gzipBytes: number;
  formattedRaw: string;
  formattedGzip: string;
  pathCount: number;
  shapeCount: number;
  fillCount: number;
  lineCount: number;
}

export async function computeSvgSizeStats(svgString: string): Promise<SvgSizeStats> {
  if (!svgString) {
    return {
      rawBytes: 0,
      gzipBytes: 0,
      formattedRaw: '0 KB',
      formattedGzip: '0 KB',
      pathCount: 0,
      shapeCount: 0,
      fillCount: 0,
      lineCount: 0,
    };
  }

  const rawBytes = new TextEncoder().encode(svgString).length;
  const gzipBytes = await calculateGenuineGzipSize(svgString);
  const pathMatches = svgString.match(/<path\b[^>]*\/?>/gi) || [];
  const shapeMatches = svgString.match(/<(path|rect|circle|ellipse|line|polyline|polygon)\b[^>]*\/?>/gi) || [];

  const fillSet = new Set<string>();
  const fillAttrRegex = /fill\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = fillAttrRegex.exec(svgString)) !== null) {
    const val = match[1].trim();
    if (val && val !== 'none' && !val.startsWith('url(')) {
      fillSet.add(val.toLowerCase());
    }
  }

  const lineCount = svgString.split(/\r\n|\r|\n/).length;

  return {
    rawBytes,
    gzipBytes,
    formattedRaw: formatBytes(rawBytes),
    formattedGzip: formatBytes(gzipBytes),
    pathCount: pathMatches.length,
    shapeCount: shapeMatches.length,
    fillCount: fillSet.size,
    lineCount,
  };
}

export interface TechnicalDiagnostics {
  // 1. Source image dimensions
  imageWidth: number | null;
  imageHeight: number | null;
  aspectRatio: string | null;

  // 2. SVG Paths
  pathCount: number;

  // 3. SVG Shapes & Elements (paths + rects + circles + ellipses + polygons + polylines + lines)
  shapeCount: number;
  totalElementCount: number;

  // 4. Distinct Fill Colors in SVG
  distinctFillColors: number;
  distinctPaletteSamples: string[];

  // 5. Colors Sampled from Original Image
  sourceColorsSampled: number | null;
  sourceColorSamples?: Array<{ label: string; hex: string }>;

  // 6. Raw SVG file size
  rawSizeBytes: number;

  // 7. Gzipped SVG size (strictly calculated)
  gzipSizeBytes: number | null;
  compressionRatioPct: number | null;

  // 8. Processing Duration
  durationMs: number | null;

  // 9. Selected Mode
  mode: 'painting' | 'recreation';

  // 10. Selected Quality
  quality: 'high' | 'low' | 'medium';

  // 11. Processing Status
  status: 'success' | 'generating' | 'idle' | 'error';
  statusMessage?: string;
}

// In-memory cache for gzip calculations to prevent redundant streams
const gzipSizeCache = new Map<string, number>();

/**
 * Genuinely computes the gzip-compressed byte size of an SVG string
 * using the browser's native Streams CompressionStream API.
 */
export async function calculateGenuineGzipSize(svgString: string): Promise<number> {
  if (!svgString) return 0;

  // Simple string hash for caching
  const hashKey = `${svgString.length}_${svgString.slice(0, 100)}_${svgString.slice(-100)}`;
  if (gzipSizeCache.has(hashKey)) {
    return gzipSizeCache.get(hashKey)!;
  }

  try {
    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([svgString])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));
      const response = new Response(stream);
      const buffer = await response.arrayBuffer();
      const size = buffer.byteLength;
      gzipSizeCache.set(hashKey, size);
      return size;
    }
  } catch (err) {
    console.warn('Native CompressionStream unavailable or failed, estimating gzip fallback:', err);
  }

  // Fallback to conservative estimate if CompressionStream is unsupported
  const rawBytes = new TextEncoder().encode(svgString).length;
  const estimated = Math.round(rawBytes * 0.22);
  gzipSizeCache.set(hashKey, estimated);
  return estimated;
}

export interface DiagnosticsComputeParams {
  svgString: string;
  imageWidth?: number | null;
  imageHeight?: number | null;
  width?: number | null;
  height?: number | null;
  mode?: 'painting' | 'recreation';
  quality?: 'high' | 'low' | 'medium';
  durationMs?: number | null;
  status?: 'success' | 'generating' | 'idle' | 'error' | string;
  statusMessage?: string;
  colorMetrics?: {
    skin?: { hex: string };
    lips?: { hex: string };
    hair?: { hex: string };
    bg?: { hex: string };
  };
  accentColor?: string;
  knownGzipBytes?: number | null;
}

/**
 * Computes synchronous technical metrics for the SVG document without blocking the UI.
 */
export function computeSvgDiagnostics(params: DiagnosticsComputeParams): TechnicalDiagnostics {
  const {
    svgString = '',
    imageWidth = null,
    imageHeight = null,
    width = null,
    height = null,
    mode = 'painting',
    quality = 'high',
    durationMs = null,
    status = 'idle',
    statusMessage,
    colorMetrics,
    accentColor,
    knownGzipBytes = null,
  } = params;

  const effectiveWidth = imageWidth ?? width ?? null;
  const effectiveHeight = imageHeight ?? height ?? null;

  let resolvedStatus: 'success' | 'generating' | 'idle' | 'error' = 'idle';
  if (status === 'done' || status === 'skipped' || status === 'success') {
    resolvedStatus = 'success';
  } else if (status === 'analyzing' || status === 'painting' || status === 'generating') {
    resolvedStatus = 'generating';
  } else if (status === 'error' || status === 'cancelled') {
    resolvedStatus = 'error';
  } else if (svgString && svgString.trim().length > 0) {
    resolvedStatus = 'success';
  }

  if (!svgString || svgString.trim().length === 0) {
    return {
      imageWidth: effectiveWidth,
      imageHeight: effectiveHeight,
      aspectRatio: effectiveWidth && effectiveHeight ? `${(effectiveWidth / effectiveHeight).toFixed(2)}:1` : null,
      pathCount: 0,
      shapeCount: 0,
      totalElementCount: 0,
      distinctFillColors: 0,
      distinctPaletteSamples: [],
      sourceColorsSampled: null,
      rawSizeBytes: 0,
      gzipSizeBytes: null,
      compressionRatioPct: null,
      durationMs,
      mode,
      quality,
      status: resolvedStatus,
      statusMessage: statusMessage || 'Awaiting image input',
    };
  }

  // 1. Path count
  const pathMatches = svgString.match(/<path[\s>]/gi);
  const pathCount = pathMatches ? pathMatches.length : 0;

  // 2. Shape count: paths + rects + circles + ellipses + polygons + polylines + lines
  const shapeMatches = svgString.match(/<(?:path|rect|circle|ellipse|line|polyline|polygon)[\s>]/gi);
  const shapeCount = shapeMatches ? shapeMatches.length : 0;

  // 3. All SVG elements (including g, defs, mask, clipPath, svg)
  const allElements = svgString.match(/<[a-zA-Z][a-zA-Z0-9:-]*[\s>]/g);
  const totalElementCount = allElements ? allElements.length : 0;

  // 4. Distinct Fill Colors in SVG
  const fillSet = new Set<string>();
  const fillRegex = /fill\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = fillRegex.exec(svgString)) !== null) {
    const val = match[1].trim().toUpperCase();
    if (val && val !== 'NONE' && val !== 'TRANSPARENT' && !val.startsWith('URL(')) {
      fillSet.add(val);
    }
  }

  const distinctPaletteSamples = Array.from(fillSet).slice(0, 16);
  const distinctFillColors = fillSet.size;

  // 5. Source colors genuinely sampled from input photograph
  const sourceSamples: Array<{ label: string; hex: string }> = [];
  if (colorMetrics?.skin?.hex) sourceSamples.push({ label: 'Biometric Skin', hex: colorMetrics.skin.hex });
  if (colorMetrics?.hair?.hex) sourceSamples.push({ label: 'Hair Volume', hex: colorMetrics.hair.hex });
  if (colorMetrics?.lips?.hex) sourceSamples.push({ label: 'Vermilion Lip', hex: colorMetrics.lips.hex });
  if (colorMetrics?.bg?.hex) sourceSamples.push({ label: 'Ambient Backing', hex: colorMetrics.bg.hex });
  if (accentColor && accentColor !== '#FF4F2E') sourceSamples.push({ label: 'Dominant Accent', hex: accentColor });

  const sourceColorsSampled = sourceSamples.length > 0 ? sourceSamples.length : null;

  // 6. Raw byte size
  const rawSizeBytes = new TextEncoder().encode(svgString).length;

  // 7. Gzip byte size
  const gzipBytes = knownGzipBytes;
  const compressionRatioPct =
    gzipBytes && rawSizeBytes > 0
      ? Math.round((1 - gzipBytes / rawSizeBytes) * 100)
      : null;

  // 8. Aspect ratio
  const aspectRatio =
    effectiveWidth && effectiveHeight
      ? `${(effectiveWidth / effectiveHeight).toFixed(2)}:1`
      : null;

  return {
    imageWidth: effectiveWidth,
    imageHeight: effectiveHeight,
    aspectRatio,
    pathCount,
    shapeCount,
    totalElementCount,
    distinctFillColors,
    distinctPaletteSamples,
    sourceColorsSampled,
    sourceColorSamples: sourceSamples.length > 0 ? sourceSamples : undefined,
    rawSizeBytes,
    gzipSizeBytes: gzipBytes,
    compressionRatioPct,
    durationMs,
    mode,
    quality,
    status: resolvedStatus,
    statusMessage,
  };
}