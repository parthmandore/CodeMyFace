/**
 * CodeMyFace Engine V2 — Phase 1: Image Normalization and Facial Analysis Types
 *
 * Strict TypeScript interface contracts for:
 * - Canonical image framing and coordinate transformations
 * - Dense normalized facial landmarks and anatomical groups
 * - Multiclass semantic segmentation analysis and confidence metrics
 * - Failure diagnosis and image artifact investigation
 */

import { Vec2, HeadPose } from '../../types/portrait';
import { BoundingBox } from '../../services/faceDetection/types';

// ==========================================
// Part A: Canonical Coordinate System Types
// ==========================================

export interface ImageDimensions {
  width: number;
  height: number;
}

export interface FaceBoundsPx {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
}

/**
 * 2D Affine Transformation Matrix:
 * | a  c  tx |
 * | b  d  ty |
 * | 0  0  1  |
 */
export interface AffineMatrix2D {
  a: number;  // scaleX * cos(rot)
  b: number;  // scaleX * sin(rot)
  c: number;  // -scaleY * sin(rot)
  d: number;  // scaleY * cos(rot)
  tx: number; // translateX
  ty: number; // translateY
}

export interface CoordinateTransform2D {
  /** Forward mapping: physical source image pixel -> canonical frame coordinate */
  sourcePxToCanonical: (p: Vec2) => Vec2;
  /** Inverse mapping: canonical frame coordinate -> physical source image pixel */
  canonicalToSourcePx: (p: Vec2) => Vec2;
  /** Forward mapping: normalized source [0, 1] -> canonical frame coordinate */
  normalizedSourceToCanonical: (p: Vec2) => Vec2;
  /** Inverse mapping: canonical frame coordinate -> normalized source [0, 1] */
  canonicalToNormalizedSource: (p: Vec2) => Vec2;

  /** Affine transform matrix */
  matrix: AffineMatrix2D;
  /** Inverse affine transform matrix */
  inverseMatrix: AffineMatrix2D;

  /** Estimated face roll angle from eye pupils/canthi */
  faceRollRadians: number;
  faceRollDegrees: number;

  /** Isotropic scale factor applied (canonical units per source pixel) */
  scale: number;
  /** Target face width in canonical coordinates (~300 units) */
  targetFaceWidth: number;
  /** Measured face width in source pixels */
  sourceFaceWidthPx: number;

  /** Face bounds in source pixel space */
  sourceFaceBoundsPx: FaceBoundsPx;
  /** Face bounds in canonical frame space */
  canonicalFaceBounds: FaceBoundsPx;
}

export interface CanonicalImageFrame {
  /** Canvas width in canonical logical units (default 1000) */
  width: number;
  /** Canvas height in canonical logical units (default 1000) */
  height: number;
  /** Target face width in canonical logical units (default ~300) */
  targetFaceWidth: number;
  /** Center of face in canonical logical units */
  faceCenter: Vec2;
  /** Margin around face preserving hair, ears, neck, shoulders */
  margins: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

// ==========================================
// Part B: Landmark Analysis Types
// ==========================================

export interface AnatomicalLandmarkGroup {
  name: string;
  /** Canonical coordinates for this group */
  points: Vec2[];
  /** Original normalized MediaPipe landmark coordinates */
  rawPoints: Vec2[];
  /** MediaPipe landmark mesh indices */
  indices: readonly number[];
}

export interface NormalizedFacialLandmarks {
  /** Total valid landmarks parsed (MediaPipe 478 mesh) */
  totalCount: number;
  /** Complete array of 478 landmarks transformed into canonical coordinates */
  allPoints: Vec2[];

  /** Face contour and jawline */
  faceOutline: AnatomicalLandmarkGroup;
  jawline: AnatomicalLandmarkGroup;

  /** Left eye contours, upper/lower lids, and pupil */
  leftEye: {
    contour: AnatomicalLandmarkGroup;
    upperLid: AnatomicalLandmarkGroup;
    lowerLid: AnatomicalLandmarkGroup;
    pupil: Vec2;
    irisContour?: AnatomicalLandmarkGroup;
    irisRadius: number;
    fissureWidth: number;
    fissureHeight: number;
  };

  /** Right eye contours, upper/lower lids, and pupil */
  rightEye: {
    contour: AnatomicalLandmarkGroup;
    upperLid: AnatomicalLandmarkGroup;
    lowerLid: AnatomicalLandmarkGroup;
    pupil: Vec2;
    irisContour?: AnatomicalLandmarkGroup;
    irisRadius: number;
    fissureWidth: number;
    fissureHeight: number;
  };

  /** Left eyebrow */
  leftEyebrow: {
    contour: AnatomicalLandmarkGroup;
    upper: AnatomicalLandmarkGroup;
    lower: AnatomicalLandmarkGroup;
    head: Vec2;
    arch: Vec2;
    tail: Vec2;
  };

  /** Right eyebrow */
  rightEyebrow: {
    contour: AnatomicalLandmarkGroup;
    upper: AnatomicalLandmarkGroup;
    lower: AnatomicalLandmarkGroup;
    head: Vec2;
    arch: Vec2;
    tail: Vec2;
  };

  /** Nose region */
  nose: {
    bridge: AnatomicalLandmarkGroup;
    tip: Vec2;
    subnasale: Vec2;
    nasion: Vec2;
    leftWing: AnatomicalLandmarkGroup;
    rightWing: AnatomicalLandmarkGroup;
    leftNostril: Vec2;
    rightNostril: Vec2;
    leftSidewall: AnatomicalLandmarkGroup;
    rightSidewall: AnatomicalLandmarkGroup;
    alarWidth: number;
  };

  /** Mouth and lips */
  mouth: {
    upperLipOuter: AnatomicalLandmarkGroup;
    upperLipInner: AnatomicalLandmarkGroup;
    lowerLipOuter: AnatomicalLandmarkGroup;
    lowerLipInner: AnatomicalLandmarkGroup;
    cupidsBowLeft: Vec2;
    cupidsBowRight: Vec2;
    cupidsBowTrough: Vec2;
    commissureLeft: Vec2;
    commissureRight: Vec2;
    center: Vec2;
    isSmileOpen: boolean;
  };

  /** Chin & jaw */
  chin: {
    tip: Vec2;
    crest: AnatomicalLandmarkGroup;
    leftMandibularCorner: Vec2;
    rightMandibularCorner: Vec2;
  };

  /** Forehead & hairline anchors (note: NOT hair silhouette) */
  forehead: {
    top: Vec2;
    hairline: AnatomicalLandmarkGroup;
    templeLeft: Vec2;
    templeRight: Vec2;
    glabella: Vec2;
  };

  /** Preauricular facial boundary anchors (ear root anchors) */
  ears: {
    leftRoot: Vec2;
    rightRoot: Vec2;
    estimatedLeftEar: Vec2[];
    estimatedRightEar: Vec2[];
  };
}

// ==========================================
// Part C: Segmentation Analysis Types
// ==========================================

export type SemanticCategory =
  | 'background' // 0
  | 'hair'       // 1
  | 'bodySkin'   // 2
  | 'faceSkin'   // 3
  | 'clothes'    // 4
  | 'others';    // 5

export interface CategoryMetric {
  id: number;
  name: SemanticCategory;
  label: string;
  colorHex: string;
  pixelCount: number;
  ratioOfTotal: number;
}

export interface SegmentationInvestigation {
  /** Hair extends below earlobe level */
  hairExtendingBelowEars: boolean;
  /** Hair reaches neck/shoulder boundary (long hair) */
  longHairDetected: boolean;
  /** Hair detected over forehead area below landmark 10 (bangs/fringe) */
  bangsCoveringForehead: boolean;
  /** Risk of dark clothing near neck being conflated with hair */
  darkClothingMistakenForHairRisk: boolean;
  /** Facial hair pixels detected on chin/jaw region */
  facialHairDetected: boolean;
  /** Spectacles/glasses occlusion detected around eye bridge */
  glassesDetected: boolean;
  /** Low color contrast between hair/skin and background */
  lowContrastBackgroundRisk: boolean;
  /** Specific diagnostic weaknesses noted */
  identifiedWeaknesses: string[];
}

export interface SegmentationAnalysisV2 {
  available: boolean;
  provenance: 'mediapipe-multiclass' | 'fallback-heuristic';
  maskWidth: number;
  maskHeight: number;
  rawMask?: Uint8Array;
  categories: Record<SemanticCategory, CategoryMetric>;
  investigation: SegmentationInvestigation;
  /** Confidence score of hair segmentation [0, 1] */
  hairConfidence: number;
  /** Confidence score of face skin segmentation [0, 1] */
  faceSkinConfidence: number;
}

// ==========================================
// Part E: Multi-pass Experiment Types
// ==========================================

export interface CropPassMetrics {
  passType: 'single-full' | 'tight-face' | 'loose-canonical';
  cropBounds: BoundingBox;
  landmarksDetected: number;
  landmarkDriftMeanPx: number;
  hairPixelCount: number;
  latencyMs: number;
}

export interface MultiPassBenchmarkResult {
  singlePass: CropPassMetrics;
  tightCropPass: CropPassMetrics;
  looseCropPass: CropPassMetrics;
  recommendation: 'single-pass' | 'multi-pass';
  rationale: string;
  latencyOverheadMs: number;
}

// ==========================================
// Part F: Top-Level Facial Analysis Result
// ==========================================

export type AnalysisErrorCode =
  | 'NO_FACE_DETECTED'
  | 'INVALID_IMAGE'
  | 'IMAGE_TOO_SMALL'
  | 'UNSUPPORTED_FORMAT'
  | 'INITIALIZATION_FAILED';

export interface FacialAnalysisResultV2 {
  success: boolean;
  errorCode?: AnalysisErrorCode;
  errorMessage?: string;

  /** Original source image metadata */
  sourceImage: {
    dimensions: ImageDimensions;
    aspectRatio: number;
    filename?: string;
  };

  /** Canonical framing and coordinate transformation */
  canonicalFrame?: CanonicalImageFrame;
  transform?: CoordinateTransform2D;

  /** Structured anatomical landmarks */
  landmarks?: NormalizedFacialLandmarks;

  /** Multiclass semantic segmentation analysis */
  segmentation?: SegmentationAnalysisV2;

  /** Estimated head pose angles */
  pose?: HeadPose;

  /** Multi-pass benchmark results */
  multiPassBenchmark?: MultiPassBenchmarkResult;

  /** Processing timing breakdown in milliseconds */
  telemetry: {
    faceDetectionMs: number;
    segmentationMs: number;
    normalizationMs: number;
    totalMs: number;
  };
}
