/**
 * CodeMyFace V4 — Black Bar & Letterbox Auto-Trimmer (Step 4)
 *
 * Detects uniform near-black letterbox (top/bottom) and pillarbox (left/right) bars
 * caused by screenshots, screen recordings, or phone aspect-ratio padding.
 * Automatically trims content to the true photograph boundaries before vector tracing.
 */

export interface BlackBarCropBounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  trimmed: boolean;
}

export interface BlackBarTrimmerOptions {
  maxLuminance?: number; // Maximum perceived luminance [0-255] to count as black (default: 18)
  maxNonBlackRatio?: number; // Tolerated noise / compression artifacts ratio (default: 0.02)
  minBarThickness?: number; // Minimum pixels of black to consider a genuine bar (default: 8)
}

/**
 * Detects the content bounding box by scanning from image edges inward.
 */
export function detectBlackBars(
  imageData: ImageData | { width: number; height: number; data: Uint8ClampedArray | Uint8Array },
  options: BlackBarTrimmerOptions = {}
): BlackBarCropBounds {
  const { width: w, height: h, data } = imageData;
  const channels = data.length === w * h * 4 ? 4 : 3;
  const maxLum = options.maxLuminance ?? 16;
  const maxNoise = options.maxNonBlackRatio ?? 0.02;
  const minBar = options.minBarThickness ?? 8;

  function isRowBlack(y: number): boolean {
    let lumSum = 0;
    let nonBlack = 0;
    const rowOffset = y * w * channels;
    for (let x = 0; x < w; x++) {
      const idx = rowOffset + x * channels;
      // Standard perceived luminance: 0.299*R + 0.587*G + 0.114*B
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      lumSum += lum;
      if (lum > maxLum) {
        nonBlack++;
      }
    }
    const avgLum = lumSum / w;
    return avgLum <= 8 && nonBlack <= w * maxNoise;
  }

  function isColBlack(x: number): boolean {
    let lumSum = 0;
    let nonBlack = 0;
    const colStep = w * channels;
    let idx = x * channels;
    for (let y = 0; y < h; y++) {
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      lumSum += lum;
      if (lum > maxLum) {
        nonBlack++;
      }
      idx += colStep;
    }
    const avgLum = lumSum / h;
    return avgLum <= 8 && nonBlack <= h * maxNoise;
  }

  let top = 0;
  while (top < h - 50 && isRowBlack(top)) top++;

  let bottom = h - 1;
  while (bottom > top + 50 && isRowBlack(bottom)) bottom--;

  let left = 0;
  while (left < w - 50 && isColBlack(left)) left++;

  let right = w - 1;
  while (right > left + 50 && isColBlack(right)) right--;

  const hasTopBar = top >= minBar;
  const hasBottomBar = h - 1 - bottom >= minBar;
  const hasLeftBar = left >= minBar;
  const hasRightBar = w - 1 - right >= minBar;

  const trimmed = hasTopBar || hasBottomBar || hasLeftBar || hasRightBar;

  const cropTop = hasTopBar ? top : 0;
  const cropBottom = hasBottomBar ? bottom : h - 1;
  const cropLeft = hasLeftBar ? left : 0;
  const cropRight = hasRightBar ? right : w - 1;

  const cropW = cropRight - cropLeft + 1;
  const cropH = cropBottom - cropTop + 1;

  return {
    top: cropTop,
    bottom: cropBottom,
    left: cropLeft,
    right: cropRight,
    width: cropW,
    height: cropH,
    trimmed,
  };
}
