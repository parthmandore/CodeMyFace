/**
 * CodeMyFace — Color Sampler
 *
 * Samples pixel colors from the source image by rendering it to an
 * off-screen canvas and reading pixel data. Uses normalized coordinates
 * so it works identically regardless of image resolution.
 *
 * Never logs or stores the image data beyond the transient canvas.
 */
import { Vec2, Color } from '../types/portrait';
import { clamp } from './geometry';

const ANALYSIS_MAX_DIMENSION = 512;

export class ColorSampler {
  private imageData: ImageData | null;
  private w: number;
  private h: number;

  private constructor(
    imageData: ImageData,
    w: number,
    h: number
  ) {
    this.imageData = imageData;
    this.w = w;
    this.h = h;
  }

  /**
   * Creates a ColorSampler from an HTMLImageElement.
   * Resizes large images down for efficient pixel sampling.
   */
  static fromImage(img: HTMLImageElement): ColorSampler {
    const srcW = img.naturalWidth || img.width;
    const srcH = img.naturalHeight || img.height;

    // Scale down for analysis performance
    let w = srcW;
    let h = srcH;
    const maxDim = Math.max(w, h);
    if (maxDim > ANALYSIS_MAX_DIMENSION) {
      const scale = ANALYSIS_MAX_DIMENSION / maxDim;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    w = Math.max(1, w);
    h = Math.max(1, h);

    let canvas: OffscreenCanvas | HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d')!;
    } else {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext('2d')!;
    }

    ctx.drawImage(img, 0, 0, w, h);
    const imageData = ctx.getImageData(0, 0, w, h);

    return new ColorSampler(imageData, w, h);
  }

  /** Sample a single pixel color at normalized coordinates (0-1) */
  samplePixel(nx: number, ny: number): Color {
    if (!this.imageData) return { r: 180, g: 150, b: 130 };
    const px = clamp(Math.round(nx * (this.w - 1)), 0, this.w - 1);
    const py = clamp(Math.round(ny * (this.h - 1)), 0, this.h - 1);
    const idx = (py * this.w + px) * 4;
    return {
      r: this.imageData.data[idx],
      g: this.imageData.data[idx + 1],
      b: this.imageData.data[idx + 2],
    };
  }

  /** Sample a point using Vec2 normalized coordinates */
  sampleAt(point: Vec2): Color {
    return this.samplePixel(point.x, point.y);
  }

  /**
   * Sample and average colors from multiple normalized points.
   * Filters out extreme outliers to get a stable representative color.
   */
  sampleAverage(points: Vec2[]): Color {
    if (points.length === 0) return { r: 180, g: 150, b: 130 };

    const colors = points.map(p => this.sampleAt(p));
    return averageColors(colors);
  }

  /**
   * Sample a region around a normalized center point.
   * Samples a grid of pixels within a small radius.
   */
  sampleRegion(center: Vec2, radiusNorm: number = 0.02, samples: number = 9): Color {
    const points: Vec2[] = [];
    const gridSide = Math.ceil(Math.sqrt(samples));
    for (let gy = 0; gy < gridSide; gy++) {
      for (let gx = 0; gx < gridSide; gx++) {
        const ox = (gx / (gridSide - 1) - 0.5) * 2 * radiusNorm;
        const oy = (gy / (gridSide - 1) - 0.5) * 2 * radiusNorm;
        points.push({
          x: clamp(center.x + ox, 0, 1),
          y: clamp(center.y + oy, 0, 1),
        });
      }
    }
    return this.sampleAverage(points);
  }

  /**
   * Sample colors along a path defined by points.
   * Returns individual samples and overall average.
   */
  sampleAlongPath(points: Vec2[], samplesPerSegment: number = 3): { samples: Color[]; average: Color } {
    const allSamples: Color[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      for (let t = 0; t <= 1; t += 1 / samplesPerSegment) {
        const px = points[i].x + (points[i + 1].x - points[i].x) * t;
        const py = points[i].y + (points[i + 1].y - points[i].y) * t;
        allSamples.push(this.samplePixel(px, py));
      }
    }
    return { samples: allSamples, average: averageColors(allSamples) };
  }

  /**
   * Estimate whether a region is significantly darker than a reference color.
   * Used for beard/shadow/hair detection.
   */
  isRegionDarkerThan(center: Vec2, referenceColor: Color, threshold: number = 0.15): boolean {
    const regionColor = this.sampleRegion(center, 0.015, 9);
    const refLum = (0.299 * referenceColor.r + 0.587 * referenceColor.g + 0.114 * referenceColor.b) / 255;
    const regLum = (0.299 * regionColor.r + 0.587 * regionColor.g + 0.114 * regionColor.b) / 255;
    return refLum - regLum > threshold;
  }

  /**
   * Estimate whether a region has a significantly different hue from a reference.
   * Used for detecting hair vs skin.
   */
  colorContrastRatio(a: Color, b: Color): number {
    const lumA = (0.299 * a.r + 0.587 * a.g + 0.114 * a.b) / 255;
    const lumB = (0.299 * b.r + 0.587 * b.g + 0.114 * b.b) / 255;
    return Math.abs(lumA - lumB);
  }

  /**
   * Probes outward along a direction vector to find where a color boundary occurs.
   * Useful for finding real hair volume boundary and beard edges.
   */
  probeBoundary(
    start: Vec2,
    direction: Vec2,
    maxDistance: number,
    isInside: (col: Color) => boolean,
    steps: number = 16
  ): Vec2 {
    let lastInside: Vec2 = { ...start };
    const len = Math.hypot(direction.x, direction.y) || 1;
    const dx = (direction.x / len) * (maxDistance / steps);
    const dy = (direction.y / len) * (maxDistance / steps);

    for (let i = 1; i <= steps; i++) {
      const cur: Vec2 = {
        x: clamp(start.x + dx * i, 0, 1),
        y: clamp(start.y + dy * i, 0, 1),
      };
      const col = this.sampleRegion(cur, 0.012, 4);
      if (isInside(col)) {
        lastInside = cur;
      } else {
        // Boundary found: interpolate between lastInside and cur
        return {
          x: (lastInside.x + cur.x) / 2,
          y: (lastInside.y + cur.y) / 2,
        };
      }
    }
    return lastInside;
  }

  /**
   * Compares left and right facial luminance to determine primary lighting angle.
   */
  estimateLightingDirection(leftCheek: Vec2, rightCheek: Vec2): 'left' | 'right' | 'frontal' {
    const leftCol = this.sampleRegion(leftCheek, 0.02, 9);
    const rightCol = this.sampleRegion(rightCheek, 0.02, 9);
    const lumLeft = (0.299 * leftCol.r + 0.587 * leftCol.g + 0.114 * leftCol.b) / 255;
    const lumRight = (0.299 * rightCol.r + 0.587 * rightCol.g + 0.114 * rightCol.b) / 255;

    const delta = lumLeft - lumRight;
    if (delta > 0.06) return 'left';
    if (delta < -0.06) return 'right';
    return 'frontal';
  }

  /**
   * Samples a cluster of points and extracts dominant and highlight tones.
   */
  sampleColorCluster(points: Vec2[]): { dominant: Color; secondary: Color; variance: number } {
    if (points.length === 0) {
      const fallback: Color = { r: 180, g: 150, b: 130 };
      return { dominant: fallback, secondary: fallback, variance: 0 };
    }

    const colors = points.map((p) => this.sampleAt(p));
    const dominant = averageColors(colors);

    // Sort by luminance
    const sorted = [...colors].sort((a, b) => {
      const la = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
      const lb = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
      return la - lb;
    });

    const darkest = sorted[0];
    const lightest = sorted[sorted.length - 1];
    const variance =
      Math.abs(
        0.299 * (lightest.r - darkest.r) +
          0.587 * (lightest.g - darkest.g) +
          0.114 * (lightest.b - darkest.b)
      ) / 255;

    // Secondary is either light highlight or shadow accent
    const secondary = variance > 0.15 ? lightest : dominant;

    return { dominant, secondary, variance };
  }

  /** Release canvas resources */
  dispose(): void {
    this.imageData = null;
  }
}

/** Average an array of colors, filtering out extreme outliers */
function averageColors(colors: Color[]): Color {
  if (colors.length === 0) return { r: 180, g: 150, b: 130 };
  if (colors.length <= 3) {
    let r = 0, g = 0, b = 0;
    for (const c of colors) {
      r += c.r; g += c.g; b += c.b;
    }
    const n = colors.length;
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  }

  // Sort by luminance and trim outliers (remove top/bottom 15%)
  const sorted = [...colors].sort((a, b) => {
    const la = 0.299 * a.r + 0.587 * a.g + 0.114 * a.b;
    const lb = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
    return la - lb;
  });

  const trimCount = Math.max(1, Math.floor(sorted.length * 0.15));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  if (trimmed.length === 0) return averageColors(colors.slice(0, 3));

  let r = 0, g = 0, b = 0;
  for (const c of trimmed) {
    r += c.r; g += c.g; b += c.b;
  }
  const n = trimmed.length;
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}
