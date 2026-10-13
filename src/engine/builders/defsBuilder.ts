import { BuilderContext } from './types';
import { colorToHex, lighten, darken } from '../geometry';

/**
 * Builds SVG gradient definitions for 3D volumetric shading
 */
export function buildGradients(ctx: BuilderContext): string[] {
  const { palette, hairEstimate, facialHairEstimate, isLightLeft, isLightRight } = ctx;

  const skinHex = colorToHex(palette.skinBase);
  const skinShadowHex = colorToHex(palette.skinShadow);
  const skinHighlightHex = colorToHex(palette.skinHighlight);
  const hairHex = colorToHex(hairEstimate.color);
  const hairSecondaryHex = colorToHex(hairEstimate.secondaryColor);
  const beardHex = colorToHex(facialHairEstimate.color);
  const beardShadowHex = colorToHex(facialHairEstimate.beardShadowColor);
  const lipHex = colorToHex(palette.lipColor);
  const eyeHex = colorToHex(palette.eyeColor);
  const irisRingHex = colorToHex(palette.irisOuterRing);

  return [
    // 1. Skin volumetric illumination gradient (directional based on light)
    `<linearGradient id="skin-volume-grad" x1="${isLightLeft ? '20%' : isLightRight ? '80%' : '50%'}" y1="0%" x2="${isLightLeft ? '80%' : isLightRight ? '20%' : '50%'}" y2="100%">
      <stop offset="0%" stop-color="${skinHighlightHex}" />
      <stop offset="55%" stop-color="${skinHex}" />
      <stop offset="100%" stop-color="${skinShadowHex}" />
    </linearGradient>`,

    // 2. Cranial hair dome gradient
    `<linearGradient id="hair-base-grad" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${colorToHex(lighten(hairEstimate.color, 0.12))}" />
      <stop offset="45%" stop-color="${hairHex}" />
      <stop offset="100%" stop-color="${colorToHex(darken(hairEstimate.color, 0.25))}" />
    </linearGradient>`,

    // 3. Hair strand lock gradient
    `<linearGradient id="hair-lock-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${hairSecondaryHex}" stop-opacity="0.85" />
      <stop offset="100%" stop-color="${hairHex}" stop-opacity="0.30" />
    </linearGradient>`,

    // 4. Beard volumetric gradient
    `<linearGradient id="beard-body-grad" x1="50%" y1="0%" x2="50%" y2="100%">
      <stop offset="0%" stop-color="${colorToHex(lighten(facialHairEstimate.color, 0.08))}" stop-opacity="0.95" />
      <stop offset="50%" stop-color="${beardHex}" stop-opacity="0.98" />
      <stop offset="100%" stop-color="${beardShadowHex}" stop-opacity="1" />
    </linearGradient>`,

    // 5. Left and Right Iris Radial Gradients (limbal ring -> warm espresso -> amber/hazel core)
    `<radialGradient id="iris-grad-left" cx="45%" cy="45%" r="52%">
      <stop offset="0%" stop-color="${colorToHex(lighten(palette.eyeColor, 0.18))}" />
      <stop offset="60%" stop-color="${eyeHex}" />
      <stop offset="92%" stop-color="${irisRingHex}" />
      <stop offset="100%" stop-color="${colorToHex(darken(palette.irisOuterRing, 0.3))}" />
    </radialGradient>`,

    `<radialGradient id="iris-grad-right" cx="45%" cy="45%" r="52%">
      <stop offset="0%" stop-color="${colorToHex(lighten(palette.eyeColor, 0.18))}" />
      <stop offset="60%" stop-color="${eyeHex}" />
      <stop offset="92%" stop-color="${irisRingHex}" />
      <stop offset="100%" stop-color="${colorToHex(darken(palette.irisOuterRing, 0.3))}" />
    </radialGradient>`,

    // 6. Dental Arch White Gradient
    `<linearGradient id="teeth-dental-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="80%" stop-color="#f8f4f4" />
      <stop offset="100%" stop-color="#e2d6d6" />
    </linearGradient>`,

    // 7. Lip vermilion gradient
    `<linearGradient id="lip-vermilion-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${colorToHex(lighten(palette.lipColor, 0.12))}" />
      <stop offset="60%" stop-color="${lipHex}" />
      <stop offset="100%" stop-color="${colorToHex(palette.lipShadow)}" />
    </linearGradient>`,

    // 8. Nose dorsum highlight gradient
    `<linearGradient id="nose-dorsum-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${skinHighlightHex}" stop-opacity="0.8" />
      <stop offset="70%" stop-color="${skinHighlightHex}" stop-opacity="0.95" />
      <stop offset="100%" stop-color="${skinHex}" stop-opacity="0.2" />
    </linearGradient>`,
  ];
}

/**
 * Builds SVG clipPath definitions
 */
export function buildClipDefs(
  leftScleraPath: string,
  rightScleraPath: string
): Array<{ id: string; pathData: string }> {
  return [
    { id: 'clip-sclera-left', pathData: leftScleraPath },
    { id: 'clip-sclera-right', pathData: rightScleraPath },
  ];
}
