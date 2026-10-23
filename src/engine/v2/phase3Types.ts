/**
 * CodeMyFace Engine V2 — Phase 3: Facial Feature Reconstruction Types
 *
 * Strict TypeScript types for:
 * - Eyes: contour, lids, iris, pupil, canthi, and evidence-based catchlight
 * - Eyebrows: head, arch, tail, thickness, curvature, and asymmetry
 * - Nose: bridge, tip, alar wings, and anatomical nostrils
 * - Mouth: Cupid's bow, vermilion borders, oral aperture, and evidence-based teeth
 * - Asymmetry and facial proportion metrics
 * - Feature debug overlay geometry
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry, HairSilhouetteGeometry } from './phase2Types';

export interface CatchlightEvidence {
  hasCatchlight: boolean;
  cx: number;
  cy: number;
  r: number;
  opacity: number;
}

export interface ReconstructedEyeGeometry {
  /** Sclera closed boundary path */
  scleraPath: string;
  /** Upper eyelid contour path (primary expressive lid curve) */
  upperEyelidPath: string;
  /** Lower eyelid contour path */
  lowerEyelidPath: string;
  /** Supratarsal eyelid crease line if visible */
  eyelidCreasePath?: string;
  /** Inner canthus (tear duct / medial corner) */
  innerCanthus: Vec2;
  /** Outer canthus (lateral corner) */
  outerCanthus: Vec2;
  /** Iris parameters */
  iris: {
    cx: number;
    cy: number;
    r: number;
  };
  /** Pupil parameters */
  pupil: {
    cx: number;
    cy: number;
    r: number;
  };
  /** Specular catchlight — strictly null if no bright evidence in source */
  catchlight: CatchlightEvidence | null;
  /** Anthropometric metrics */
  metrics: {
    fissureWidth: number;
    fissureHeight: number;
    apertureRatio: number; // height / width
    tiltAngleDegrees: number;
  };
}

export interface ReconstructedEyebrowGeometry {
  /** Complete filled eyebrow polygon/path */
  path: string;
  /** Central spine / arch line */
  spinePath: string;
  /** Medial head anchor near glabella */
  head: Vec2;
  /** Highest apex / arch anchor */
  arch: Vec2;
  /** Lateral tail anchor towards temple */
  tail: Vec2;
  /** Eyebrow color sampled from image evidence */
  fillColor: string;
  /** Anthropometric metrics */
  metrics: {
    length: number;
    thickness: number;
    archElevation: number; // arch.y relative to head.y
    tiltAngleDegrees: number;
    distanceToEye: number;
  };
}

export interface ReconstructedNoseGeometry {
  /** Nasal dorsal bridge line */
  bridgePath: string;
  /** Nose tip lobule curvature */
  tipPath: string;
  /** Left alar wing curve */
  leftWingPath: string;
  /** Right alar wing curve */
  rightWingPath: string;
  /** Left nostril curve/crescent (soft anatomical shadow tone) */
  leftNostrilPath: string;
  /** Right nostril curve/crescent (soft anatomical shadow tone) */
  rightNostrilPath: string;
  /** Subtle side plane shadow path if supported by lighting */
  sideShadowPath?: string;
  /** Nostril fill color (soft anatomical shadow, never pure black) */
  nostrilColor: string;
  /** Anthropometric metrics */
  metrics: {
    alarWidth: number;
    bridgeLength: number;
    tipProtrusion: number;
  };
}

export interface MouthEvidence {
  isOpen: boolean;
  hasTeeth: boolean;
  meanOralLuminance: number;
}

export interface ReconstructedMouthGeometry {
  /** Upper lip vermilion closed path (with Cupid's bow) */
  upperLipPath: string;
  /** Lower lip vermilion closed path */
  lowerLipPath: string;
  /** Oral fissure parting line between lips */
  partingLinePath: string;
  /** Teeth arc path (strictly null if mouth is closed or no bright evidence) */
  teethPath: string | null;
  /** Dark oral cavity path (if mouth open without visible teeth) */
  oralCavityPath: string | null;
  /** Lip fill tone derived from source */
  vermilionColor: string;
  /** Anthropometric metrics */
  metrics: {
    mouthWidth: number;
    upperLipThickness: number;
    lowerLipThickness: number;
    openingGap: number;
    smileCantDegrees: number;
    hasTeeth: boolean;
    isSmileOpen: boolean;
  };
}

export interface FacialFeaturesGeometryV2 {
  leftEye: ReconstructedEyeGeometry;
  rightEye: ReconstructedEyeGeometry;
  leftEyebrow: ReconstructedEyebrowGeometry;
  rightEyebrow: ReconstructedEyebrowGeometry;
  nose: ReconstructedNoseGeometry;
  mouth: ReconstructedMouthGeometry;
  /** Interpupillary and intercanthal distance */
  proportions: {
    interpupillaryDistance: number;
    intercanthalDistance: number;
    eyeSpacingRatio: number; // intercanthal / mean eye width
    eyeAsymmetry: {
      heightDifference: number;
      tiltDifference: number;
      widthDifference: number;
    };
    eyebrowAsymmetry: {
      heightDifference: number;
      thicknessDifference: number;
      archDifference: number;
    };
    mouthAsymmetry: {
      smileCantDegrees: number;
      commissureHeightDifference: number;
    };
  };
  diagnosticStatus: 'FULL_DETAIL_RECONSTRUCTED' | 'SIMPLIFIED_UNCERTAIN_LANDMARKS';
}

export interface Phase3PortraitResult {
  photoId: string;
  analysis: FacialAnalysisResultV2;
  face: FaceSilhouetteGeometry;
  hair: HairSilhouetteGeometry;
  features: FacialFeaturesGeometryV2;
  /** Output 1: Face-only SVG with Phase 3 reconstructed features */
  faceOnlySvg: string;
  /** Output 2: Complete Face + Hair SVG with Phase 3 reconstructed features */
  completeSvg: string;
  /** Output 3: Diagnostic Debug SVG from Phase 2 */
  debugSvg: string;
  /** Output 4: Phase 3 Feature Debug Overlay SVG */
  featureDebugSvg: string;
}
