/**
 * CodeMyFace V3 — High-Fidelity Geometry Engine Types
 *
 * Defines explicit data contracts for:
 * - 2D geometry primitives (Points, Bounds, Cubic Béziers)
 * - Image-derived contours and topological paths
 * - Reconstruction candidates (A: Edge Contours, B: Semantic Mask, C: Landmark-Constrained, D: Hybrid Adaptive)
 * - Diagnostic inspection models and geometry statistics
 */

export interface Point2D {
  x: number;
  y: number;
}

export interface Size2D {
  width: number;
  height: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface CubicBezierSegment {
  p0: Point2D;
  cp1: Point2D;
  cp2: Point2D;
  p3: Point2D;
}

export type V3SemanticRegion =
  | 'background'
  | 'silhouette'
  | 'hair-back'
  | 'hair-main'
  | 'hair-wisp'
  | 'face-silhouette'
  | 'face-interior'
  | 'left-eyebrow'
  | 'right-eyebrow'
  | 'left-eye-sclera'
  | 'left-eye-iris'
  | 'left-eye-pupil'
  | 'left-eye-lid'
  | 'right-eye-sclera'
  | 'right-eye-iris'
  | 'right-eye-pupil'
  | 'right-eye-lid'
  | 'nose-bridge'
  | 'nose-wings'
  | 'nose-tip'
  | 'nostrils'
  | 'upper-lip'
  | 'lower-lip'
  | 'mouth-parting'
  | 'teeth'
  | 'facial-hair-mustache'
  | 'facial-hair-beard'
  | 'glasses'
  | 'ears'
  | 'neck'
  | 'clothing'
  | 'structural-edge';

export interface VectorPath {
  id: string;
  name: string;
  semanticRegion: V3SemanticRegion;
  d: string;
  points: Point2D[];
  segments?: CubicBezierSegment[];
  isClosed: boolean;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinecap?: 'round' | 'butt' | 'square';
  strokeLinejoin?: 'round' | 'bevel' | 'miter';
  opacity?: number;
  zIndex: number;
}

export interface Contour {
  points: Point2D[];
  isClosed: boolean;
  area: number;
  perimeter: number;
  bbox: BoundingBox;
  isHole: boolean;
  semanticClass?: number;
}

export type CandidateId =
  | 'candidate-a' // Image Edge Contour Tracing
  | 'candidate-b' // Semantic Mask Contour Tracing
  | 'candidate-c' // Landmark-Constrained Edge Contours
  | 'candidate-d'; // Hybrid Adaptive Geometry

export interface GeometryStats {
  totalPaths: number;
  totalNodes: number;
  totalBezierCurves: number;
  totalPolygons: number;
  totalAreaCovered: number;
  boundingBox: BoundingBox;
  svgByteSize: number;
}

export interface V3CandidateResult {
  candidateId: CandidateId;
  name: string;
  shortDescription: string;
  svgString: string;
  paths: VectorPath[];
  stats: GeometryStats;
  timings: {
    totalMs: number;
    [stage: string]: number;
  };
}

export interface V3DiagnosticData {
  originalDimensions: Size2D;
  canonicalDimensions: Size2D;
  landmarksDetected: boolean;
  landmarkCount: number;
  headPose?: { pitch: number; yaw: number; roll: number };
  segmentationAvailable: boolean;
  segmentationResolution?: Size2D;
  hairPixelCount?: number;
  facePixelCount?: number;
  extractedContoursCount: number;
  filteredContoursCount: number;
  cannyEdgeDataUri?: string;
  candidates: Record<CandidateId, V3CandidateResult>;
  timings: Record<string, number>;
  warnings: string[];
}

export interface V3ReconstructionOptions {
  simplificationTolerance: number; // e.g. 1.2 px
  hairDetailLevel: 'fine' | 'medium' | 'coarse';
  edgeThresholdLow: number; // e.g. 25
  edgeThresholdHigh: number; // e.g. 75
  minContourArea: number; // e.g. 20 px^2
  enableGlassesDetection: boolean;
  enableFacialHairDetection: boolean;
  diagnosticColorMode: boolean; // if true, uses color-coded semantic layers
}

export const DEFAULT_V3_OPTIONS: V3ReconstructionOptions = {
  simplificationTolerance: 1.2,
  hairDetailLevel: 'medium',
  edgeThresholdLow: 25,
  edgeThresholdHigh: 75,
  minContourArea: 16,
  enableGlassesDetection: true,
  enableFacialHairDetection: true,
  diagnosticColorMode: true,
};
