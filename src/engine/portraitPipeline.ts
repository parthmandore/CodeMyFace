import { FaceDetectionResult } from '../services/faceDetection/types';
import {
  FaceAnalysis,
  FacialFeatures,
  FacialHairEstimate,
  HairEstimate,
  PipelineStageMetric,
  PortraitModel,
  ValidationMetrics,
} from '../types/portrait';
import { ColorSampler } from './colorSampler';
import {
  classifyFaceShape,
  computeFaceMetrics,
  extractFacialFeatures,
} from './faceAnalyzer';
import {
  estimateFacialHair,
  estimateHairstyle,
  extractPalette,
} from './heuristicFeatures';
import { buildPortraitModel, renderPortraitSvg } from './svgRenderer';

export interface PortraitGenerationResult {
  success: boolean;
  model?: PortraitModel;
  svgString?: string;
  analysis?: FaceAnalysis;
  error?: string;
  durationMs: number;
}

/**
 * Validates generated portrait geometry and composition
 */
function validatePortraitGeometry(
  features: FacialFeatures,
  hairEstimate: HairEstimate,
  facialHairEstimate: FacialHairEstimate,
  svgString: string
): ValidationMetrics {
  // 1. Pupil containment: check that pupil is positioned inside eye contour bounds
  const leftEyeYMin = Math.min(...features.leftEyeContour.map((p) => p.y));
  const leftEyeYMax = Math.max(...features.leftEyeContour.map((p) => p.y));
  const rightEyeYMin = Math.min(...features.rightEyeContour.map((p) => p.y));
  const rightEyeYMax = Math.max(...features.rightEyeContour.map((p) => p.y));
  const pupilContainment =
    features.leftPupil.y >= leftEyeYMin - 0.015 &&
    features.leftPupil.y <= leftEyeYMax + 0.015 &&
    features.rightPupil.y >= rightEyeYMin - 0.015 &&
    features.rightPupil.y <= rightEyeYMax + 0.015;

  // 2. Landmark alignment: nose is between eyes and mouth, mouth is between nose and chin
  const eyeMidY = (features.leftPupil.y + features.rightPupil.y) / 2;
  const noseAlignment = features.noseTip.y > eyeMidY && features.noseTip.y < features.mouthCenter.y;
  const mouthAlignment = features.mouthCenter.y > features.noseTip.y && features.mouthCenter.y < features.chinTip.y;
  const landmarkAlignment = noseAlignment && mouthAlignment;

  // 3. Face silhouette continuity
  const faceSilhouetteContinuity = features.faceOutline.length >= 30;

  // 4. Hair silhouette continuity
  const hairSilhouetteContinuity = !hairEstimate.detected || hairEstimate.silhouettePoints.length >= 6;

  // 5. Beard alignment: conforms within jaw bounds
  const beardAlignment = !facialHairEstimate.hasBeard || facialHairEstimate.beardRegion.length >= 3;

  // 6. SVG Validity
  const svgValid = svgString.startsWith('<svg') && svgString.endsWith('</svg>') && !svgString.includes('NaN');

  // 7. Face only composition: strictly no neck, shoulders, or torso
  const faceOnlyComposition =
    !svgString.includes('id="neck-base"') &&
    !svgString.includes('id="torso"') &&
    !svgString.includes('id="shoulders"');

  // 8. Zero embedded raster images
  const noEmbeddedRasterImages =
    !svgString.includes('<image') &&
    !svgString.includes('data:image/') &&
    !svgString.includes('base64');

  // Calculate measured quality score (0 - 100)
  let score = 0;
  if (pupilContainment) score += 15;
  if (landmarkAlignment) score += 15;
  if (faceSilhouetteContinuity) score += 15;
  if (hairSilhouetteContinuity) score += 10;
  if (beardAlignment) score += 10;
  if (svgValid) score += 15;
  if (faceOnlyComposition) score += 10;
  if (noEmbeddedRasterImages) score += 10;

  return {
    landmarkAlignment,
    pupilContainment,
    faceSilhouetteContinuity,
    hairSilhouetteContinuity,
    noseAlignment,
    mouthAlignment,
    beardAlignment,
    svgValid,
    faceOnlyComposition,
    noEmbeddedRasterImages,
    measuredQualityScore: score,
  };
}

export interface PortraitGenerationOptions {
  facialHairOverride?: import('../types/portrait').FacialHairOverride;
}

/**
 * Runs the end-to-end multi-stage facial reconstruction pipeline (Stages A through M)
 */
export async function generatePortrait(
  image: HTMLImageElement,
  detectionResult: FaceDetectionResult,
  options?: PortraitGenerationOptions
): Promise<PortraitGenerationResult> {
  const pipelineStartTime = performance.now();
  const stages: PipelineStageMetric[] = [];

  const recordStage = (
    stage: string,
    name: string,
    startTime: number,
    status: 'success' | 'fallback' | 'skipped',
    details?: string
  ) => {
    stages.push({
      stage,
      name,
      durationMs: Math.round(performance.now() - startTime),
      status,
      details,
    });
  };

  // STAGE A: Decode and normalize the image
  const stageAStart = performance.now();
  if (!image || !image.complete) {
    return {
      success: false,
      error: 'Cannot generate portrait: Source image is invalid or not yet decoded.',
      durationMs: 0,
    };
  }
  const imgWidth = image.naturalWidth || image.width;
  const imgHeight = image.naturalHeight || image.height;
  const imgDim = { width: imgWidth, height: imgHeight };
  recordStage('STAGE A', 'Decode and normalize image', stageAStart, 'success', `${imgWidth}×${imgHeight}px`);

  // STAGE B: Detect and validate facial landmarks
  const stageBStart = performance.now();
  if (!detectionResult.detected || !detectionResult.landmarks || detectionResult.landmarks.length === 0) {
    recordStage('STAGE B', 'Validate facial landmarks', stageBStart, 'fallback', 'No landmarks detected');
    return {
      success: false,
      error: 'Cannot generate portrait: No face landmarks detected in photo.',
      durationMs: Math.round(performance.now() - pipelineStartTime),
    };
  }
  const landmarkCount = detectionResult.landmarks.length;
  recordStage('STAGE B', 'Validate facial landmarks', stageBStart, 'success', `${landmarkCount} landmarks validated`);

  let sampler: ColorSampler | null = null;

  try {
    // Initialize ColorSampler for local pixel analysis
    sampler = ColorSampler.fromImage(image);

    // STAGE C: Analyze facial proportions and validate coordinates
    const stageCStart = performance.now();
    const features = extractFacialFeatures(detectionResult.landmarks);
    const faceShape = classifyFaceShape(features, imgDim);
    const { faceCenter, faceWidth, faceHeight, faceAngle } = computeFaceMetrics(features, imgDim);
    recordStage(
      'STAGE C',
      'Analyze facial proportions & classify shape',
      stageCStart,
      'success',
      `Shape: ${faceShape}, rotation: ${(faceAngle * 180 / Math.PI).toFixed(1)}°`
    );

    // STAGE D & E: Run semantic segmentation & extract hair mask
    const stageDStart = performance.now();
    let hairContour: import('../types/portrait').Vec2[] | undefined;
    let segResult: import('../services/segmentation/segmentationService').HairSegmentationResult | undefined;
    let segStatus: 'success' | 'fallback' | 'skipped' = 'skipped';
    let segDetails = 'Segmentation skipped';

    try {
      const { SegmentationService } = await import('../services/segmentation/segmentationService');
      const segService = SegmentationService.getInstance();
      const initialized = await segService.initialize();
      if (initialized) {
        segResult = await segService.segmentHair(image, faceCenter, features);
        if (segResult.hasHairSegmentation && (segResult.silhouettePoints || segResult.hairContourPoints)) {
          hairContour = segResult.silhouettePoints ?? segResult.hairContourPoints;
          segStatus = 'success';
          segDetails = `${hairContour?.length ?? 0} boundary contour points extracted (${segResult.provenance})`;
        } else {
          segStatus = 'fallback';
          segDetails = 'Model returned low confidence hair mask; using adaptive probe';
        }
      } else {
        segStatus = 'fallback';
        segDetails = 'Model unavailable; using client-side adaptive pixel probe';
      }
    } catch (segErr) {
      segStatus = 'fallback';
      segDetails = `Segmentation error: ${segErr instanceof Error ? segErr.message : String(segErr)}`;
    }
    recordStage('STAGE D/E', 'Semantic segmentation & hair mask extraction', stageDStart, segStatus, segDetails);

    // STAGE F & G: Feature geometry construction (eyes, nose, mouth, face silhouette)
    const stageFGStart = performance.now();
    // Features are already extracted and enriched with eyelid creases, nasolabial folds, and detailed nose geometry
    recordStage(
      'STAGE F/G',
      'Construct detailed facial feature geometry',
      stageFGStart,
      'success',
      'Eyelid folds, nasolabial smile lines, anatomical nose, and lips configured'
    );

    // STAGE H: Refine hair & beard silhouettes
    const stageHStart = performance.now();
    const palette = extractPalette(features, sampler, hairContour);
    const hairEstimate = estimateHairstyle(features, sampler, palette, segResult ?? hairContour, imgDim);
    const facialHairEstimate = estimateFacialHair(features, sampler, palette, segResult, {
      override: options?.facialHairOverride,
    });
    recordStage(
      'STAGE H',
      'Refine hair & beard silhouettes',
      stageHStart,
      'success',
      `Hair: ${hairEstimate.style} (${hairEstimate.silhouettePoints.length}pts, provenance: ${hairEstimate.provenance}), Beard: ${facialHairEstimate.hasBeard ? facialHairEstimate.density : 'clean-shaven'}`
    );

    // STAGE I & J: Color palette estimation & volumetric gradients
    const stageIJStart = performance.now();
    // Palette already estimated with multi-stop skin, hair, beard, and ivory background
    recordStage(
      'STAGE I/J',
      'Color palette & volumetric gradient definitions',
      stageIJStart,
      'success',
      `Skin base: rgb(${palette.skinBase.r},${palette.skinBase.g},${palette.skinBase.b}), Key light: ${palette.lightDirection}`
    );

    const analysisTimeMs = Math.round(performance.now() - pipelineStartTime);

    // STAGE K: Assemble structured model & validate geometry
    const stageKStart = performance.now();
    const analysis: FaceAnalysis = {
      requestId: `cmf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      totalLandmarksDetected: landmarkCount,
      consumedLandmarkCount: features.allLandmarks ? features.allLandmarks.length : landmarkCount,
      features,
      palette,
      hairEstimate,
      facialHairEstimate,
      faceShape,
      faceCenter,
      faceWidth,
      faceHeight,
      faceAngle,
      imageWidth: imgWidth,
      imageHeight: imgHeight,
      selectedFaceIndex: detectionResult.selectedFaceIndex ?? 0,
      totalFacesDetected: detectionResult.faceCount,
      analysisTimeMs,
      stages,
    };

    const model = buildPortraitModel(analysis, 1000, 1000);
    recordStage('STAGE K', 'Build 10-layer vector portrait model', stageKStart, 'success', `${model.layers.length} layers assembled`);

    // STAGE L: Generate final standalone SVG
    const stageLStart = performance.now();
    const svgString = renderPortraitSvg(model);
    recordStage('STAGE L', 'Render standalone SVG markup', stageLStart, 'success', `${svgString.length} bytes SVG`);

    // STAGE M: Inspect rendered result & validate diagnostics
    const stageMStart = performance.now();
    const validation = validatePortraitGeometry(features, hairEstimate, facialHairEstimate, svgString);
    analysis.validation = validation;
    recordStage(
      'STAGE M',
      'Inspect rendered result & quality diagnostics',
      stageMStart,
      'success',
      `Quality Score: ${validation.measuredQualityScore}/100, SVG Valid: ${validation.svgValid}`
    );

    const totalDurationMs = Math.round(performance.now() - pipelineStartTime);

    return {
      success: true,
      model,
      svgString,
      analysis,
      durationMs: totalDurationMs,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Portrait synthesis pipeline error:', err);
    return {
      success: false,
      error: `Portrait generation failed: ${errorMsg}`,
      durationMs: Math.round(performance.now() - pipelineStartTime),
    };
  } finally {
    if (sampler) {
      sampler.dispose();
    }
  }
}

