/**
 * CodeMyFace — Staged SVG Portrait Construction Engine
 *
 * Implements truthful, step-by-step vector portrait construction
 * mapping directly to real pipeline computation and SVG layer assembly:
 *
 * 1. Image Calibration & Artboard (layer-background)
 * 2. Face Silhouette (layer-face-silhouette)
 * 3. Hair Silhouette & Ears (layer-ears, layer-hair)
 * 4. Eyes & Eyebrows (layer-eyebrows-eyes)
 * 5. Nose & Mouth (layer-nose, layer-mouth-lips)
 * 6. Facial Hair (layer-facial-hair)
 * 7. Restrained Shading & Highlights (layer-facial-shadows, layer-highlights)
 * 8. Final SVG Assembly & Diagnostics (all 10 layers)
 *
 * All displayed SVG markup is 100% genuine rendered XML corresponding
 * to the exact vector shapes active at each stage.
 */
import { PortraitModel, PortraitLayer } from '../types/portrait';
import { renderPortraitSvg } from './svgRenderer';

export interface ConstructionStageDef {
  id: string;
  name: string;
  shortName: string;
  stepNumber: number;
  description: string;
  includedLayerIds: readonly string[];
  badgeText: string;
}

export const CONSTRUCTION_STAGES: readonly ConstructionStageDef[] = [
  {
    id: 'stage-calibration',
    name: '1. Image Calibration & Artboard',
    shortName: 'Canvas',
    stepNumber: 1,
    description: 'Calibrating 478 landmarks, isotropic coordinate projection, and vector artboard',
    includedLayerIds: ['layer-background'],
    badgeText: 'CANVAS INITIALIZED',
  },
  {
    id: 'stage-face-silhouette',
    name: '2. Face Silhouette',
    shortName: 'Face',
    stepNumber: 2,
    description: 'Constructing mandibular jawline and cranial perimeter smoothed at gnathion',
    includedLayerIds: ['layer-background', 'layer-face-silhouette'],
    badgeText: 'MANDIBULAR CONTOUR',
  },
  {
    id: 'stage-hair-silhouette',
    name: '3. Hair Silhouette & Cranial Volume',
    shortName: 'Hair',
    stepNumber: 3,
    description: 'Deriving organic hair silhouette, part line, and cranial volume from segmentation',
    includedLayerIds: ['layer-background', 'layer-ears', 'layer-face-silhouette', 'layer-hair'],
    badgeText: 'HAIR SILHOUETTE',
  },
  {
    id: 'stage-eyes-eyebrows',
    name: '4. Eyes & Eyebrows',
    shortName: 'Eyes',
    stepNumber: 4,
    description: 'Reconstructing measured iris contours, asymmetrical apertures, and expressive brows',
    includedLayerIds: ['layer-background', 'layer-ears', 'layer-face-silhouette', 'layer-hair', 'layer-eyebrows-eyes'],
    badgeText: 'OCULAR GEOMETRY',
  },
  {
    id: 'stage-nose-mouth',
    name: '5. Nose & Mouth',
    shortName: 'Nose & Mouth',
    stepNumber: 5,
    description: 'Synthesizing anatomical nasal lobule, dorsal ridge, and vermilion lips',
    includedLayerIds: [
      'layer-background',
      'layer-ears',
      'layer-face-silhouette',
      'layer-hair',
      'layer-eyebrows-eyes',
      'layer-nose',
      'layer-mouth-lips',
    ],
    badgeText: 'FACIAL FEATURES',
  },
  {
    id: 'stage-facial-hair',
    name: '6. Facial Hair Framing',
    shortName: 'Facial Hair',
    stepNumber: 6,
    description: 'Evaluating mandibular beard and sculpted mustache (clean-shaven if none detected)',
    includedLayerIds: [
      'layer-background',
      'layer-ears',
      'layer-face-silhouette',
      'layer-hair',
      'layer-eyebrows-eyes',
      'layer-nose',
      'layer-mouth-lips',
      'layer-facial-hair',
    ],
    badgeText: 'MANDIBULAR FRAMING',
  },
  {
    id: 'stage-shading-highlights',
    name: '7. Restrained Shading & Highlights',
    shortName: 'Shading',
    stepNumber: 7,
    description: 'Applying planar facial shadows, cheekbone highlights, and volumetric lighting',
    includedLayerIds: [
      'layer-background',
      'layer-ears',
      'layer-face-silhouette',
      'layer-hair',
      'layer-facial-shadows',
      'layer-eyebrows-eyes',
      'layer-nose',
      'layer-mouth-lips',
      'layer-facial-hair',
      'layer-highlights',
    ],
    badgeText: 'VOLUMETRIC SHADING',
  },
  {
    id: 'stage-final-assembly',
    name: '8. Final SVG Assembly & Diagnostics',
    shortName: 'Complete',
    stepNumber: 8,
    description: 'Validating geometric integrity, closing paths, and outputting standalone vector SVG',
    includedLayerIds: [
      'layer-background',
      'layer-ears',
      'layer-face-silhouette',
      'layer-hair',
      'layer-facial-shadows',
      'layer-eyebrows-eyes',
      'layer-nose',
      'layer-mouth-lips',
      'layer-facial-hair',
      'layer-highlights',
    ],
    badgeText: '100% STANDALONE SVG',
  },
];

export interface StagedConstructionResult {
  stage: ConstructionStageDef;
  stageIndex: number;
  totalStages: number;
  stagedModel: PortraitModel;
  stagedSvgString: string;
  isComplete: boolean;
  activeLayerCount: number;
  totalLayerCount: number;
  activeShapesCount: number;
}

/**
 * Builds the portrait model and real SVG string for a specific construction stage
 */
export function buildStagedPortraitModel(
  fullModel: PortraitModel,
  stageIndex: number
): StagedConstructionResult {
  const safeStageIdx = Math.max(0, Math.min(CONSTRUCTION_STAGES.length - 1, stageIndex));
  const stage = CONSTRUCTION_STAGES[safeStageIdx];
  const isComplete = safeStageIdx === CONSTRUCTION_STAGES.length - 1;

  const allowedIds = new Set(stage.includedLayerIds);

  // Construct staged layers with visibility toggled based on the stage specification
  const stagedLayers: PortraitLayer[] = fullModel.layers.map((layer) => ({
    ...layer,
    visible: allowedIds.has(layer.id) && layer.visible,
  }));

  const stagedModel: PortraitModel = {
    ...fullModel,
    layers: stagedLayers,
  };

  const stagedSvgString = renderPortraitSvg(stagedModel);

  const activeLayers = stagedLayers.filter((l) => l.visible);
  const activeShapesCount = activeLayers.reduce((sum, l) => sum + l.shapes.length, 0);

  return {
    stage,
    stageIndex: safeStageIdx,
    totalStages: CONSTRUCTION_STAGES.length,
    stagedModel,
    stagedSvgString,
    isComplete,
    activeLayerCount: activeLayers.length,
    totalLayerCount: fullModel.layers.length,
    activeShapesCount,
  };
}
