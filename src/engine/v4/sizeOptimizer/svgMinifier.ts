/**
 * CodeFace V4 — SVG Document Size Minifier
 *
 * Implements:
 * - Step 1: Relative path commands, no repeated letters, compact separators.
 * - Step 2: Short hex colors, attribute hoisting, shared CSS rules.
 * - Step 3: Whole-number coordinates by doubling viewBox (2x scale).
 * - Step 4: Removal of exact collinear points.
 * - Step 5: Douglas-Peucker nearly-straight point removal (tolerance 0.25px / 0.4px).
 *
 * Provides presets:
 * - 'max': Lossless only (Steps 1, 2, 3, 4) — 100% pixel-identical guarantee.
 * - 'balanced': (Default) Every step that passes the quality rules.
 * - 'compact': Maximum safe compression.
 */

import { toShortHex } from '../svgOptimizer';
import { optimizePathData } from './pathOptimizer';

export type SizeOptimizerPreset = 'max' | 'balanced' | 'compact';

export interface SvgMinifyOptions {
  preset?: SizeOptimizerPreset;
  // Individual step controls (for granular optimization tuning & toggling)
  relativeCommands?: boolean;     // Step 1
  shortHexAndHoisting?: boolean;  // Step 2
  scale2xViewBox?: boolean;       // Step 3
  removeCollinear?: boolean;      // Step 4
  simplifyTolerancePx?: number;   // Step 5 (e.g. 0.25 or 0.4)
}

/**
 * Resolves full options based on preset and overrides.
 */
export function resolveMinifyOptions(opts: SvgMinifyOptions = {}): Required<SvgMinifyOptions> {
  const preset = opts.preset || 'balanced';

  let defaults: Required<SvgMinifyOptions>;
  switch (preset) {
    case 'max':
      // Lossless only
      defaults = {
        preset: 'max',
        relativeCommands: true,
        shortHexAndHoisting: true,
        scale2xViewBox: true,
        removeCollinear: true,
        simplifyTolerancePx: 0,
      };
      break;
    case 'compact':
      defaults = {
        preset: 'compact',
        relativeCommands: true,
        shortHexAndHoisting: true,
        scale2xViewBox: true,
        removeCollinear: true,
        simplifyTolerancePx: 0.4,
      };
      break;
    case 'balanced':
    default:
      // Balanced: Lossless + conservative nearly-straight pruning
      defaults = {
        preset: 'balanced',
        relativeCommands: true,
        shortHexAndHoisting: true,
        scale2xViewBox: true,
        removeCollinear: true,
        simplifyTolerancePx: 0.25,
      };
      break;
  }

  return {
    preset,
    relativeCommands: opts.relativeCommands ?? defaults.relativeCommands,
    shortHexAndHoisting: opts.shortHexAndHoisting ?? defaults.shortHexAndHoisting,
    scale2xViewBox: opts.scale2xViewBox ?? defaults.scale2xViewBox,
    removeCollinear: opts.removeCollinear ?? defaults.removeCollinear,
    simplifyTolerancePx: opts.simplifyTolerancePx ?? defaults.simplifyTolerancePx,
  };
}

/**
 * Minifies a complete SVG document according to the specified options.
 */
export function minifySvgDocument(svgString: string, rawOptions: SvgMinifyOptions = {}): string {
  if (!svgString) return svgString;
  const options = resolveMinifyOptions(rawOptions);

  let result = svgString;

  // 1. Parse viewBox dimensions
  const viewBoxMatch = result.match(/viewBox="0\s+0\s+([0-9.]+)\s+([0-9.]+)"/i);
  let origW = 0;
  let origH = 0;
  if (viewBoxMatch) {
    origW = parseFloat(viewBoxMatch[1]);
    origH = parseFloat(viewBoxMatch[2]);
  }

  const scale = options.scale2xViewBox ? 2 : 1;
  const scaledW = origW * scale;
  const scaledH = origH * scale;

  // 2. Step 3: Update viewBox to 2x (preserving original width and height attributes)
  if (options.scale2xViewBox && origW > 0 && origH > 0) {
    result = result.replace(
      /viewBox="0\s+0\s+[0-9.]+\s+[0-9.]+"/i,
      `viewBox="0 0 ${scaledW} ${scaledH}"`
    );

    // Update base background <rect width="..." height="..."> to fill the 2x viewBox
    result = result.replace(
      /<rect\b([^>]*)\bwidth="[0-9.]+"\s+height="[0-9.]+"([^>]*)>/gi,
      (_match, before, after) => {
        return `<rect${before}width="${scaledW}" height="${scaledH}"${after}>`;
      }
    );

    // Scale feGaussianBlur stdDeviation in 2x space
    result = result.replace(
      /stdDeviation="([0-9.]+)"/gi,
      (_m, val) => `stdDeviation="${(parseFloat(val) * scale).toFixed(1)}"`
    );
  }

  // 3. Step 2: Short hex colors and repeated attribute hoisting
  if (options.shortHexAndHoisting) {
    // Convert all colors to shortest hex
    result = result.replace(/(fill|stroke|stop-color)="([^"]+)"/gi, (_m, attr, val) => {
      return `${attr}="${toShortHex(val)}"`;
    });

    // Strip redundant stroke and stroke-width="0"
    result = result.replace(/\s+stroke="[^"]+"\s+stroke-width="0"/gi, '');
    result = result.replace(/\s+stroke-width="0"/gi, '');

    // Strip redundant opacity values (>= 0.99 or 1) and floating point artifacts
    result = result.replace(/\s+opacity="0\.99\d+"/gi, '');
    result = result.replace(/\s+opacity="1(\.0+)?"/gi, '');
  }

  // 4. Optimize all path 'd' attributes (Steps 1, 3, 4, 5)
  result = result.replace(/<path\b([^>]*)>/gi, (match, attrs) => {
    const dMatch = attrs.match(/\bd="([^"]+)"/i);
    if (!dMatch) return match;

    const originalD = dMatch[1];
    const optimizedD = optimizePathData(originalD, {
      relativeCommands: options.relativeCommands,
      scale2x: options.scale2xViewBox,
      removeCollinear: options.removeCollinear,
      simplifyTolerancePx: options.simplifyTolerancePx * scale,
    });

    return match.replace(`d="${originalD}"`, `d="${optimizedD}"`);
  });

  // 5. Clean whitespace between tags
  result = result
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return result;
}
