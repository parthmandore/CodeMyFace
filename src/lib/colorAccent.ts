/**
 * Atelier Color Accent & WCAG Contrast Utilities
 * 
 * Extracts the most vivid color from a photo and checks WCAG contrast
 * against the Atelier ink background (#14110F). If contrast >= 4.5:1,
 * it returns the vivid color; otherwise, falls back to Vermilion (#FF4F2E).
 */

export const INK_HEX = '#14110F';
export const VERMILION_HEX = '#FF4F2E';

export function sRGBtoLinear(channel255: number): number {
  const c = Math.max(0, Math.min(255, channel255)) / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return (
    0.2126 * sRGBtoLinear(r) +
    0.7152 * sRGBtoLinear(g) +
    0.0722 * sRGBtoLinear(b)
  );
}

export function calculateContrastRatio(lumA: number, lumB: number): number {
  const l1 = Math.max(lumA, lumB);
  const l2 = Math.min(lumA, lumB);
  return (l1 + 0.05) / (l2 + 0.05);
}

export function getHexContrastAgainstInk(hex: string): number {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return 1;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  const lumColor = relativeLuminance(r, g, b);
  const lumInk = relativeLuminance(20, 17, 15); // #14110F
  return calculateContrastRatio(lumColor, lumInk);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hR = Math.max(0, Math.min(255, Math.round(r))).toString(16).padStart(2, '0');
  const hG = Math.max(0, Math.min(255, Math.round(g))).toString(16).padStart(2, '0');
  const hB = Math.max(0, Math.min(255, Math.round(b))).toString(16).padStart(2, '0');
  return `#${hR}${hG}${hB}`.toUpperCase();
}

/**
 * Extracts the most vivid color from an HTMLImageElement or Canvas with contrast >= 4.5:1 against #14110F.
 */
export function extractVividPhotoAccent(
  source: HTMLImageElement | HTMLCanvasElement | ImageData
): { accentHex: string; contrast: number; isVividExtracted: boolean } {
  try {
    let imgData: ImageData;

    if (source instanceof ImageData) {
      imgData = source;
    } else {
      const sampleW = 64;
      const sampleH = 64;
      const canvas = document.createElement('canvas');
      canvas.width = sampleW;
      canvas.height = sampleH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return { accentHex: VERMILION_HEX, contrast: getHexContrastAgainstInk(VERMILION_HEX), isVividExtracted: false };
      }
      ctx.drawImage(source, 0, 0, sampleW, sampleH);
      imgData = ctx.getImageData(0, 0, sampleW, sampleH);
    }

    const data = imgData.data;
    const lumInk = relativeLuminance(20, 17, 15); // #14110F

    let bestHex = VERMILION_HEX;
    let bestScore = -1;
    let bestContrast = getHexContrastAgainstInk(VERMILION_HEX);

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 128) continue; // Skip transparent

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      const lum = relativeLuminance(r, g, b);
      const contrast = calculateContrastRatio(lum, lumInk);

      // Must strictly meet 4.5:1 WCAG contrast against ink
      if (contrast < 4.5) continue;

      const rN = r / 255;
      const gN = g / 255;
      const bN = b / 255;
      const max = Math.max(rN, gN, bN);
      const min = Math.min(rN, gN, bN);
      const delta = max - min;

      if (delta < 0.15) continue; // Skip achromatic / grays

      const lightness = (max + min) / 2;
      // Saturation in HSL
      const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

      // Vividness score: higher saturation + vibrant range, penalize extreme whites
      const vividnessScore = saturation * delta * (1 - Math.abs(lightness - 0.55) * 0.4);

      if (vividnessScore > bestScore) {
        bestScore = vividnessScore;
        bestHex = rgbToHex(r, g, b);
        bestContrast = contrast;
      }
    }

    if (bestScore > 0.18) {
      return {
        accentHex: bestHex,
        contrast: Math.round(bestContrast * 10) / 10,
        isVividExtracted: true,
      };
    }
  } catch (e) {
    console.warn('Could not extract vivid accent from photo:', e);
  }

  return {
    accentHex: VERMILION_HEX,
    contrast: Math.round(getHexContrastAgainstInk(VERMILION_HEX) * 10) / 10,
    isVividExtracted: false,
  };
}
