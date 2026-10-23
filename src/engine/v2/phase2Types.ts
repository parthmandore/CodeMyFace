/**
 * CodeMyFace Engine V2 — Phase 2: Face, Hair, and Silhouette Reconstruction Types
 *
 * Strict TypeScript types for:
 * - Face silhouette reconstruction and hairline adaptation
 * - Hair boundary extraction, connected components, and multi-lock tracing
 * - Controlled contour simplification (raw vs cleaned)
 * - Prototype flat-vector SVG generation (face-only vs complete vs debug)
 */

import { Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';

export interface ContourPoint extends Vec2 {
  /** Tangent or curvature estimate if available */
  curvature?: number;
}

export interface HairSilhouetteGeometry {
  /** Whether hair segmentation was sufficiently reliable to reconstruct */
  isReliable: boolean;
  diagnosticStatus: 'SEGMENTATION_DERIVED' | 'FACE_ONLY_UNRELIABLE_MASK' | 'BALD_OR_CLOSE_CROPPED';

  /** Unsmoothed, un-decimated raw pixel perimeter in canonical units */
  rawContour: Vec2[];

  /** Cleaned, simplified boundary polygon preserving curls and volume */
  cleanedContour: Vec2[];

  /** Separate back-hair polygon for long hair flowing behind the neck/shoulders */
  backHairContour?: Vec2[];

  /** Front hairline / bangs contour framing forehead */
  hairlineContour?: Vec2[];

  /** Detected internal hollows (e.g. ear cutouts or background gaps) */
  holes?: Vec2[][];

  /** Bounding box of hair in canonical units */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };

  /** Geometric descriptors */
  metrics: {
    hasLongHair: boolean;
    hasBangs: boolean;
    hasSideburns: boolean;
    apexCanonicalY: number;
    volumeWidthCanonical: number;
    rawPointCount: number;
    cleanedPointCount: number;
  };
}

export interface FaceSilhouetteGeometry {
  /** Primary facial skull & flesh perimeter polygon */
  contourPoints: Vec2[];

  /** Forehead upper arc (adapted to hairline evidence or bangs) */
  foreheadArc: Vec2[];

  /** Jawline polygon from temple to temple via chin */
  jawlinePoints: Vec2[];

  /** Chin apex point */
  chinApex: Vec2;

  /** Left and right mandibular corner points */
  leftMandible: Vec2;
  rightMandible: Vec2;

  /** Neck boundary polygon (only if supported by body skin/clothes evidence) */
  neckPoints?: Vec2[];

  /** Shoulders contour if visible */
  shoulderPoints?: Vec2[];

  /** Bounding box of face in canonical units */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  };

  /** Anthropometric measurements in canonical units */
  measurements: {
    faceWidth: number;
    faceHeight: number;
    jawWidth: number;
    chinWidth: number;
    foreheadHeight: number;
    asymmetryRatio: number; // left width vs right width ratio
  };
}

export interface FeatureGeometryV2 {
  leftEye: string;   // SVG path d
  rightEye: string;
  leftIris: { cx: number; cy: number; r: number };
  rightIris: { cx: number; cy: number; r: number };
  leftPupil: { cx: number; cy: number; r: number };
  rightPupil: { cx: number; cy: number; r: number };
  leftEyebrow: string;
  rightEyebrow: string;
  nose: string;
  mouth: string;
  ears?: { left: string; right: string };
}

export interface PrototypePortraitResult {
  photoId: string;
  analysis: FacialAnalysisResultV2;
  face: FaceSilhouetteGeometry;
  hair: HairSilhouetteGeometry;
  features: FeatureGeometryV2;

  /** Output 1: Face-only SVG vector string */
  faceOnlySvg: string;

  /** Output 2: Complete Face + Hair SVG vector string */
  completeSvg: string;

  /** Output 3: Diagnostic Debug SVG (raw vs cleaned contours, bounds, landmarks) */
  debugSvg: string;
}
