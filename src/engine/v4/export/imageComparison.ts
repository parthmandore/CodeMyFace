/**
 * CodeMyFace V4 — Photographic Image Comparison & Match Verification
 *
 * Compares rendered SVG portraits pixel-by-pixel against the source photograph.
 * Computes:
 * - Match score percentage (derived from Mean Absolute Error & perceptual similarity)
 * - Mean color channel error
 * - High-contrast difference map (bright = deviation, dark = exact photographic recreation)
 */

export interface ComparisonMetrics {
  matchScore: number;       // 0% - 100% (e.g. 94.2%)
  avgColorError: number;    // 0 - 255 (average per-channel difference)
  diffDataUrl?: string;     // PNG data URL of visual difference map
  pixelCount: number;
}

/**
 * Computes pixel-by-pixel color error between source photo and rendered vector portrait.
 */
export function computeImageDiff(
  photoData: ImageData,
  svgData: ImageData,
  generateMap: boolean = true
): { metrics: ComparisonMetrics; diffImageData?: ImageData } {
  const width = photoData.width;
  const height = photoData.height;
  const pixelCount = width * height;
  const pData = photoData.data;
  const sData = svgData.data;

  let totalDiff = 0;
  const diffImage = generateMap && typeof ImageData !== 'undefined'
    ? new ImageData(width, height)
    : (generateMap ? ({ width, height, data: new Uint8ClampedArray(pixelCount * 4) } as ImageData) : undefined);

  const dData = diffImage?.data;

  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const pr = pData[idx];
    const pg = pData[idx + 1];
    const pb = pData[idx + 2];

    const sr = sData[idx];
    const sg = sData[idx + 1];
    const sb = sData[idx + 2];

    const dr = Math.abs(pr - sr);
    const dg = Math.abs(pg - sg);
    const db = Math.abs(pb - sb);

    const pixelError = (dr + dg + db) / 3;
    totalDiff += pixelError;

    if (dData) {
      // Amplify difference by 2.2x so discrepancies are vividly visible
      dData[idx] = Math.min(255, Math.round(dr * 2.2));
      dData[idx + 1] = Math.min(255, Math.round(dg * 2.2));
      dData[idx + 2] = Math.min(255, Math.round(db * 2.2));
      dData[idx + 3] = 255;
    }
  }

  const avgColorError = totalDiff / pixelCount;
  // Score formula: 100% when error is 0, descending monotonically
  // 1 - (avgError / 255) yields high accuracy representation
  const matchScore = Math.max(0, Math.min(100, Math.round((1 - (avgColorError / 180)) * 1000) / 10));

  return {
    metrics: {
      matchScore,
      avgColorError: Math.round(avgColorError * 10) / 10,
      pixelCount,
    },
    diffImageData: diffImage,
  };
}

/**
 * Headless or in-browser SVG renderer into an ImageData buffer for measurement.
 */
export async function renderSvgToImageData(
  svgString: string,
  width: number,
  height: number
): Promise<ImageData | null> {
  if (typeof document === 'undefined') {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve(null);
    }, 10000);

    img.onload = () => {
      clearTimeout(timer);
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      try {
        const data = ctx.getImageData(0, 0, width, height);
        resolve(data);
      } catch (err) {
        console.error('Failed to get SVG ImageData:', err);
        resolve(null);
      }
    };
    img.onerror = () => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
