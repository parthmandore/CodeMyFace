/**
 * CodeMyFace Engine V2 — Phase 4: Color and Vector Styling Types
 *
 * Strict TypeScript types for:
 * - OKLab-derived palette (skin, hair, iris, eyebrows, lips, clothing, background)
 * - Evidence-based facial hair detection (auto, off, on modes)
 * - Broad planar skin shading (submandibular neck, lateral cheek, nose side)
 * - Controlled beautification settings
 * - Final polished vector portrait result
 */

import { Color } from '../../types/portrait';
import { OklabColor } from './oklab';
import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry, HairSilhouetteGeometry } from './phase2Types';
import { FacialFeaturesGeometryV2 } from './phase3Types';

export interface ColorWithHex {
  color: Color;
  hex: string;
  lab: OklabColor;
}

export interface V2Palette {
  /** Primary skin tones */
  skinBase: ColorWithHex;
  skinShadow: ColorWithHex;
  skinHighlight: ColorWithHex;

  /** Hair tones */
  hairBase: ColorWithHex;
  hairShadow: ColorWithHex;
  hairHighlight: ColorWithHex;

  /** Feature tones */
  iris: ColorWithHex;
  eyebrows: ColorWithHex;
  lips: ColorWithHex;
  nostrilShadow: ColorWithHex;

  /** Context tones */
  clothing: ColorWithHex;
  background: ColorWithHex;
}

export type FacialHairMode = 'auto' | 'off' | 'on';
export type FacialHairStyle = 'none' | 'goatee' | 'mustache' | 'full_beard' | 'stubble';

export interface FacialHairDetectionResult {
  detected: boolean;
  mode: FacialHairMode;
  confidence: number;
  style: FacialHairStyle;
  mustachePath: string | null;
  beardPath: string | null;
  color: ColorWithHex;
  metrics: {
    upperLipContrast: number;
    chinContrast: number;
    jawContrast: number;
  };
}

export type LightingDirection = 'left' | 'right' | 'frontal';

export interface SkinShadingPlanes {
  /** Broad submandibular shadow under jaw casting onto neck */
  jawNeckShadowPath: string;
  /** Broad lateral cheek plane shadow on shadow side */
  cheekShadowPath: string | null;
  /** Soft nasal sidewall shadow */
  noseSideShadowPath: string | null;
  /** Soft forehead planar highlight */
  foreheadHighlightPath: string | null;
  /** Soft cheekbone planar highlight */
  cheekHighlightPath: string | null;
}

export interface BeautificationSettings {
  /** Lightness adjustment in OKLab [-0.2, 0.2], neutral default = 0.0 */
  brightnessBoost: number;
  /** Warmth adjustment in OKLab [-0.1, 0.1], neutral default = 0.0 */
  warmth: number;
  /** Chroma/vibrance adjustment [0.8, 1.3], neutral default = 1.0 */
  vibrance: number;
}

export interface Phase4PortraitResult {
  photoId: string;
  analysis: FacialAnalysisResultV2;
  face: FaceSilhouetteGeometry;
  hair: HairSilhouetteGeometry;
  features: FacialFeaturesGeometryV2;
  palette: V2Palette;
  facialHair: FacialHairDetectionResult;
  lighting: LightingDirection;
  shading: SkinShadingPlanes;
  beautification: BeautificationSettings;
  /** Phase 3 unstyled geometry SVG */
  phase3Svg: string;
  /** Phase 4 styled vector SVG with polished OKLab colors and shading */
  styledSvg: string;
}
