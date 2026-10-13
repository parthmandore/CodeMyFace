/**
 * CodeMyFace Portrait Model — Phase 2
 * Structured, typed representation of a geometric vector portrait.
 * Stores normalized geometry, feature layers, palette, and component metadata.
 * All coordinates are normalized [0,1] relative to the portrait canvas.
 */

/** 2D point in normalized space [0,1] */
export interface Vec2 {
  x: number;
  y: number;
}

/** RGB color */
export interface Color {
  r: number; // 0-255
  g: number; // 0-255
  b: number; // 0-255
}

/** Color with optional alpha */
export interface ColorAlpha extends Color {
  a: number; // 0-1
}

/** A sampled color palette extracted from the source image */
export interface PortraitPalette {
  // Raw sampled source color values (unclamped from source image sampling)
  rawSkinBase?: Color;
  rawSkinLum?: number;
  rawHairPrimary?: Color;
  rawEyeColor?: Color;
  rawLipColor?: Color;
  rawEyebrowColor?: Color;
  rawBeardColor?: Color;

  // Final rendered SVG display palette
  skinBase: Color;
  skinShadow: Color;
  skinShadowDeep: Color;
  skinHighlight: Color;
  skinToneWarmer: Color;
  hairPrimary: Color;
  hairSecondary: Color;
  eyeColor: Color;
  irisOuterRing: Color;
  lipColor: Color;
  lipShadow: Color;
  lipHighlight: Color;
  eyebrowColor: Color;
  beardColor: Color; // same as hair if no distinct beard
  beardShadowColor: Color;
  background: Color;
  neckShadow: Color;
  lightDirection: 'left' | 'right' | 'frontal';
}

/** Shape types for SVG rendering */
export type ShapeType = 'path' | 'ellipse' | 'polygon' | 'circle';

/** Provenance metadata tracking the origin of a generated vector shape */
export type ShapeProvenance =
  | 'landmark-derived'
  | 'segmentation-mask-derived'
  | 'source-image-sampled'
  | 'template-generated'
  | 'unknown';

/** A single geometric shape in the portrait */
export interface PortraitShape {
  id: string;
  type: ShapeType;
  /** Internal metadata identifying origin of geometric data (non-rendering) */
  provenance?: ShapeProvenance;
  /** SVG path data string (for type 'path') */
  pathData?: string;
  /** Points array for polygon type */
  points?: Vec2[];
  /** Center and radii for ellipse type */
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
  /** Radius for circle type */
  r?: number;
  /** Fill color as hex string */
  fill: string;
  /** Optional stroke */
  stroke?: string;
  strokeWidth?: number;
  /** Opacity 0-1 */
  opacity: number;
  /** Optional CSS transform */
  transform?: string;
  /** Optional SVG clip-path reference ID */
  clipPath?: string;
}

/** A named layer in the portrait stack */
export interface PortraitLayer {
  id: string;
  name: string;
  order: number; // z-order, lower = behind
  shapes: PortraitShape[];
  visible: boolean;
}

/** Detected facial feature geometry (normalized coordinates) */
export interface FacialFeatures {
  faceOutline: Vec2[];
  jawline: Vec2[];
  leftEyeContour: Vec2[];
  rightEyeContour: Vec2[];
  leftEyeUpper: Vec2[];
  leftEyeLower: Vec2[];
  rightEyeUpper: Vec2[];
  rightEyeLower: Vec2[];
  leftPupil: Vec2;
  rightPupil: Vec2;
  leftIrisRadius: number;
  rightIrisRadius: number;
  leftIrisContour?: Vec2[];
  rightIrisContour?: Vec2[];
  leftEyeOpeningHeight?: number;
  rightEyeOpeningHeight?: number;
  leftEyebrow: Vec2[];
  rightEyebrow: Vec2[];
  leftEyebrowUpper: Vec2[];
  leftEyebrowLower: Vec2[];
  rightEyebrowUpper: Vec2[];
  rightEyebrowLower: Vec2[];
  noseBridge: Vec2[];
  noseTip: Vec2;
  noseBottom: Vec2[];
  leftNostril: Vec2;
  rightNostril: Vec2;
  leftAlarWing: Vec2[];
  rightAlarWing: Vec2[];
  subnasale?: Vec2;
  nasion?: Vec2;
  leftNostrilContour?: Vec2[];
  rightNostrilContour?: Vec2[];
  leftNasalSidewall?: Vec2[];
  rightNasalSidewall?: Vec2[];
  upperLip: Vec2[];
  lowerLip: Vec2[];
  upperLipOuter: Vec2[];
  upperLipInner: Vec2[];
  lowerLipOuter: Vec2[];
  lowerLipInner: Vec2[];
  mouthCenter: Vec2;
  leftEar?: Vec2[];
  rightEar?: Vec2[];
  foreheadTop: Vec2;
  foreheadHairline: Vec2[];
  templeLeft: Vec2;
  templeRight: Vec2;
  chinTip: Vec2;
  chinCrest: Vec2[];
  leftCheekPlane: Vec2[];
  rightCheekPlane: Vec2[];
  leftMandibularCorner: Vec2;
  rightMandibularCorner: Vec2;
  neckLeft: Vec2;
  neckRight: Vec2;
  glabella: Vec2;
  philtrum: Vec2;
  leftEyeCrease?: Vec2[];
  rightEyeCrease?: Vec2[];
  leftNasolabial?: Vec2[];
  rightNasolabial?: Vec2[];
  mentalCrease?: Vec2[];
  allLandmarks?: Vec2[];
}

/** Hair estimation result */
export interface HairEstimate {
  detected: boolean;
  provenance?: 'segmentation-mask-derived' | 'landmark-derived' | 'template-generated';
  silhouettePoints: Vec2[];
  backHairPoints?: Vec2[];
  hairStrands?: Vec2[][];
  fringeLocks?: Vec2[][];
  hairlineContour?: Vec2[];
  hairHighlights?: Vec2[][];
  color: Color;
  secondaryColor: Color;
  coverage: 'full' | 'partial' | 'receding' | 'none';
  length: 'short' | 'medium' | 'long';
  style: 'short' | 'curly' | 'straight' | 'wavy' | 'receding' | 'long';
  parting?: 'middle' | 'side' | 'open' | 'bangs';
  hasLongHairSides?: boolean;
}

export type FacialHairOverride = 'auto' | 'off' | 'on';

/** Beard/mustache estimation result */
export interface FacialHairEstimate {
  hasBeard: boolean;
  hasMustache: boolean;
  hasGoatee: boolean;
  hasFullBeard: boolean;
  hasJawBeard?: boolean;
  hasSideburns?: boolean;
  beardRegion: Vec2[]; // outline if detected
  mustacheRegion: Vec2[]; // outline if detected
  goateeRegion?: Vec2[];
  jawBeardRegion?: Vec2[];
  soulPatchRegion?: Vec2[];
  sideburnLeft?: Vec2[];
  sideburnRight?: Vec2[];
  chinCleftRegion?: Vec2[];
  color: Color;
  beardShadowColor: Color;
  density: 'none' | 'light' | 'medium' | 'heavy';
  provenance?: ShapeProvenance;
  override?: FacialHairOverride;
  metrics?: {
    jawContrast: number;
    mustacheContrast: number;
    chinContrast: number;
    chinBulbContrast?: number;
    isCleanShavenConfidence: number;
    clothingRejected?: boolean;
    shadowRejected?: boolean;
  };
}

/** Face shape classification */
export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'oblong';

export interface PipelineStageMetric {
  stage: string;
  name: string;
  durationMs: number;
  status: 'success' | 'fallback' | 'skipped';
  details?: string;
}

export interface ValidationMetrics {
  landmarkAlignment: boolean;
  pupilContainment: boolean;
  faceSilhouetteContinuity: boolean;
  hairSilhouetteContinuity: boolean;
  noseAlignment: boolean;
  mouthAlignment: boolean;
  beardAlignment: boolean;
  svgValid: boolean;
  faceOnlyComposition: boolean;
  noEmbeddedRasterImages: boolean;
  measuredQualityScore: number;
}

/** Complete analysis result from the face analyzer */
export interface FaceAnalysis {
  requestId?: string;
  features: FacialFeatures;
  palette: PortraitPalette;
  hairEstimate: HairEstimate;
  facialHairEstimate: FacialHairEstimate;
  faceShape: FaceShape;
  faceCenter: Vec2;
  faceWidth: number;  // normalized
  faceHeight: number; // normalized
  faceAngle: number;  // rotation in radians, 0 = upright
  imageWidth: number; // original pixel width
  imageHeight: number; // original pixel height
  /** Index of selected face when multiple detected */
  selectedFaceIndex: number;
  totalFacesDetected: number;
  analysisTimeMs: number;
  stages?: PipelineStageMetric[];
  validation?: ValidationMetrics;
  totalLandmarksDetected?: number;
  consumedLandmarkCount?: number;
}

/** Artboard viewBox dimensions */
export interface PortraitViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

/** The complete portrait model ready for SVG rendering */
export interface PortraitModel {
  version: string;
  timestamp: number;
  canvasWidth: number;
  canvasHeight: number;
  viewBox?: PortraitViewBox;
  layers: PortraitLayer[];
  palette: PortraitPalette;
  analysis: FaceAnalysis;
  clipDefs?: Array<{ id: string; pathData: string }>;
  gradientDefs?: string[];
}

/** Portrait generation status */
export type PortraitGenerationStatus =
  | 'idle'
  | 'analyzing'
  | 'sampling-colors'
  | 'estimating-features'
  | 'generating-geometry'
  | 'rendering'
  | 'complete'
  | 'error';

export interface PortraitGenerationProgress {
  status: PortraitGenerationStatus;
  message: string;
  progress: number; // 0-100
  error?: string;
}
