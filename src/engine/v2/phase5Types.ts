/**
 * CodeMyFace Engine V2 — Phase 5: Progressive SVG Construction Types
 *
 * Strict TypeScript types for:
 * - 6 genuine computational reconstruction stages
 * - Progressive stage metadata and status
 * - Stage-specific SVG and live code representation
 * - Non-blocking event callbacks and reduced-motion options
 */

import { FacialAnalysisResultV2 } from './types';
import { FaceSilhouetteGeometry, HairSilhouetteGeometry } from './phase2Types';
import { FacialFeaturesGeometryV2 } from './phase3Types';
import { V2Palette, FacialHairDetectionResult, SkinShadingPlanes, BeautificationSettings, LightingDirection } from './phase4Types';

export type ProgressiveStageId =
  | 'image-analysis'   // 1. Image analysis complete (canonical frame, 478 landmarks, segmentation)
  | 'face-geometry'    // 2. Face geometry ready (jawline, chin, ears, neck, shoulders)
  | 'hair-geometry'    // 3. Hair geometry ready (back hair volume, frontal hairline contour)
  | 'facial-features'  // 4. Facial features ready (anatomical eyes, brows, nose, mouth)
  | 'colour-regions'   // 5. Colour regions ready (OKLab palette, planar shadows, facial hair)
  | 'final-assembled'; // 6. Final SVG assembled (complete vector portrait, title, accessibility defs)

export type StageExecutionStatus = 'pending' | 'active' | 'completed' | 'failed';

export interface ProgressiveStageDef {
  readonly id: ProgressiveStageId;
  readonly stepNumber: number;
  readonly name: string;
  readonly shortName: string;
  readonly description: string;
  readonly badgeText: string;
}

export const PROGRESSIVE_STAGES: readonly ProgressiveStageDef[] = [
  {
    id: 'image-analysis',
    stepNumber: 1,
    name: '1. Image Analysis & Framing',
    shortName: 'Analysis',
    description: 'Calibrating 478 MediaPipe landmarks, isotropic canonical frame, and semantic segmentation',
    badgeText: 'CANONICAL FRAME READY',
  },
  {
    id: 'face-geometry',
    stepNumber: 2,
    name: '2. Face & Structural Contour',
    shortName: 'Face',
    description: 'Constructing mandibular jawline, cranial outline, preauricular ears, neck, and shoulders',
    badgeText: 'CRANIOFACIAL GEOMETRY',
  },
  {
    id: 'hair-geometry',
    stepNumber: 3,
    name: '3. Hair Silhouette & Volume',
    shortName: 'Hair',
    description: 'Deriving cranial hair volume, organic perimeter, and front overlap from segmentation',
    badgeText: 'HAIR SILHOUETTE READY',
  },
  {
    id: 'facial-features',
    stepNumber: 4,
    name: '4. Anatomical Facial Features',
    shortName: 'Features',
    description: 'Reconstructing palpebral canthi, eyelids, thickness-preserved brows, alar wings, and lips',
    badgeText: 'FACIAL FEATURES READY',
  },
  {
    id: 'colour-regions',
    stepNumber: 5,
    name: '5. OKLab Palettes & Planar Shading',
    shortName: 'Shading',
    description: 'Extracting perceptual OKLab palettes, directional planar shadows, and facial hair evidence',
    badgeText: 'PALETTE & SHADING READY',
  },
  {
    id: 'final-assembled',
    stepNumber: 6,
    name: '6. Final Vector SVG Assembly',
    shortName: 'Final',
    description: 'Final assembly of all 14 visual depth layers into a valid, standalone production SVG',
    badgeText: 'PORTRAIT ASSEMBLED',
  },
];

export interface ProgressiveDataState {
  photoId: string;
  analysis?: FacialAnalysisResultV2;
  face?: FaceSilhouetteGeometry;
  hair?: HairSilhouetteGeometry;
  features?: FacialFeaturesGeometryV2;
  palette?: V2Palette;
  facialHair?: FacialHairDetectionResult;
  lighting?: LightingDirection;
  shading?: SkinShadingPlanes;
  beautification?: BeautificationSettings;
}

export interface ProgressiveStageUpdate {
  stageId: ProgressiveStageId;
  stageDef: ProgressiveStageDef;
  status: StageExecutionStatus;
  svg: string;
  code: string;
  stageIndex: number;
  totalStages: number;
  stageDurationMs: number;
  cumulativeDurationMs: number;
  isComplete: boolean;
  error?: string;
  data: ProgressiveDataState;
}

export type ProgressiveCallback = (update: ProgressiveStageUpdate) => void;

export interface ProgressiveRenderOptions {
  beautification?: BeautificationSettings;
  facialHairMode?: 'auto' | 'off' | 'on';
  hairDecimationEpsilon?: number;
  precomputedAnalysis?: FacialAnalysisResultV2;
  prefersReducedMotion?: boolean;
  immediate?: boolean;
  yieldToBrowser?: boolean;
}
