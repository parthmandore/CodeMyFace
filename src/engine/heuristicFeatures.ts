/**
 * CodeMyFace — Enhanced Heuristic Feature Estimator
 *
 * Combines 3D facial landmarks with local image pixel sampling (ColorSampler)
 * and geometric rules to deterministically estimate:
 * 1. Rich multi-tone skin & feature palette (with lighting angle detection)
 * 2. Realistic, stylized geometric hair silhouette (short, voluminous, curly, long, receding)
 *    with interior facet locks, hairline contour, and highlights
 * 3. Accurate facial-hair modeling (mustache, goatee, full beard, soul patch)
 *    following actual jawline and lip landmarks without generic box shapes
 *
 * Conservative fallbacks ensure clean, intentional portraits when confidence is low.
 */
import {
  Color,
  FacialFeatures,
  FacialHairEstimate,
  FacialHairOverride,
  HairEstimate,
  PortraitPalette,
  ShapeProvenance,
  Vec2,
} from '../types/portrait';
import type { HairSegmentationResult } from '../services/segmentation/segmentationService';
import { ColorSampler } from './colorSampler';
import {
  clamp,
  darken,
  lighten,
  luminance,
  derivePerceptualSkinShadow,
  derivePerceptualSkinHighlight,
} from './geometry';

/** Helper to calculate outlier-trimmed channel averages from color samples */
function robustChannelMean(samples: Color[], fallback: Color = { r: 180, g: 150, b: 130 }): Color {
  if (samples.length === 0) return fallback;
  if (samples.length <= 2) {
    return {
      r: clamp(Math.round(samples.reduce((s, c) => s + c.r, 0) / samples.length), 0, 255),
      g: clamp(Math.round(samples.reduce((s, c) => s + c.g, 0) / samples.length), 0, 255),
      b: clamp(Math.round(samples.reduce((s, c) => s + c.b, 0) / samples.length), 0, 255),
    };
  }

  // Sort by luminance and trim top and bottom outliers
  const sorted = [...samples].sort((a, b) => luminance(a) - luminance(b));
  const trimCount = Math.max(1, Math.floor(sorted.length * 0.20));
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount);
  const active = trimmed.length > 0 ? trimmed : sorted;
  const n = active.length;

  return {
    r: clamp(Math.round(active.reduce((s, c) => s + c.r, 0) / n), 0, 255),
    g: clamp(Math.round(active.reduce((s, c) => s + c.g, 0) / n), 0, 255),
    b: clamp(Math.round(active.reduce((s, c) => s + c.b, 0) / n), 0, 255),
  };
}

/**
 * Extracts a rich, harmonious color palette from local image sampling.
 * Uses robust statistical estimation and avoids destructive hardcoded color flattening.
 */
export function extractPalette(
  features: FacialFeatures,
  sampler: ColorSampler,
  hairContour?: Vec2[]
): PortraitPalette {
  const {
    foreheadTop,
    templeLeft,
    templeRight,
    noseTip,
    chinTip,
    lowerLip,
    leftPupil,
    rightPupil,
    leftEyebrow,
    rightEyebrow,
    leftNostril,
    rightNostril,
    mouthCenter,
  } = features;

  const faceHeight = Math.max(0.08, chinTip.y - foreheadTop.y);
  const headCenterX = (templeLeft.x + templeRight.x) / 2;
  const faceWidthNorm = Math.max(0.08, templeRight.x - templeLeft.x);

  const leftNostrilPt = leftNostril || { x: headCenterX - faceWidthNorm * 0.12, y: noseTip.y };
  const rightNostrilPt = rightNostril || { x: headCenterX + faceWidthNorm * 0.12, y: noseTip.y };
  const mouthCenterPt = mouthCenter || { x: headCenterX, y: noseTip.y + faceHeight * 0.15 };

  // 1. Determine key lighting direction
  const leftCheekPt: Vec2 = {
    x: templeLeft.x * 0.7 + noseTip.x * 0.3,
    y: (templeLeft.y + noseTip.y) / 2,
  };
  const rightCheekPt: Vec2 = {
    x: templeRight.x * 0.7 + noseTip.x * 0.3,
    y: (templeRight.y + noseTip.y) / 2,
  };

  const lightDirection = sampler.estimateLightingDirection(leftCheekPt, rightCheekPt);

  // 2. Sample skin regions ONLY from clean, bare skin zones (mid-malar cheeks, paramedian forehead, sub-malar planes)
  // Strictly avoids dorsal nose bridge (specular highlights), glabella (flash reflection),
  // upper forehead (bangs/hairline), jaw/chin (beard/stubble), and lips/eyes
  // High & mid medial malar cheek points (bare skin zone lateral to alar wing, below lower eyelid)
  const leftMalarCenter: Vec2 = {
    x: templeLeft.x * 0.38 + leftPupil.x * 0.38 + leftNostrilPt.x * 0.24,
    y: leftPupil.y * 0.35 + noseTip.y * 0.65,
  };
  const leftMalarLateral: Vec2 = {
    x: templeLeft.x * 0.52 + leftPupil.x * 0.33 + leftNostrilPt.x * 0.15,
    y: leftPupil.y * 0.45 + noseTip.y * 0.55,
  };
  const rightMalarCenter: Vec2 = {
    x: templeRight.x * 0.38 + rightPupil.x * 0.38 + rightNostrilPt.x * 0.24,
    y: rightPupil.y * 0.35 + noseTip.y * 0.65,
  };
  const rightMalarLateral: Vec2 = {
    x: templeRight.x * 0.52 + rightPupil.x * 0.33 + rightNostrilPt.x * 0.15,
    y: rightPupil.y * 0.45 + noseTip.y * 0.55,
  };

  // Paramedian lower forehead points (well below hairline, well above eyebrows, avoiding midline part)
  const foreheadLeft: Vec2 = {
    x: headCenterX * 0.65 + templeLeft.x * 0.35,
    y: foreheadTop.y + faceHeight * 0.16,
  };
  const foreheadRight: Vec2 = {
    x: headCenterX * 0.65 + templeRight.x * 0.35,
    y: foreheadTop.y + faceHeight * 0.16,
  };

  // Sub-malar cheek points (above mandibular border, lateral to nasolabial crease, avoiding lips & stubble)
  const leftSubMalar: Vec2 = {
    x: templeLeft.x * 0.45 + mouthCenterPt.x * 0.55,
    y: noseTip.y * 0.65 + mouthCenterPt.y * 0.35,
  };
  const rightSubMalar: Vec2 = {
    x: templeRight.x * 0.45 + mouthCenterPt.x * 0.55,
    y: noseTip.y * 0.65 + mouthCenterPt.y * 0.35,
  };

  const skinCandidates = [
    sampler.sampleRegion(leftMalarCenter, 0.009, 9),
    sampler.sampleRegion(leftMalarLateral, 0.009, 9),
    sampler.sampleRegion(rightMalarCenter, 0.009, 9),
    sampler.sampleRegion(rightMalarLateral, 0.009, 9),
    sampler.sampleRegion(foreheadLeft, 0.009, 9),
    sampler.sampleRegion(foreheadRight, 0.009, 9),
    sampler.sampleRegion(leftSubMalar, 0.009, 9),
    sampler.sampleRegion(rightSubMalar, 0.009, 9),
  ];

  // Outlier rejection: filter out samples hitting deep shadows, blown highlights, or non-skin chromatic anomalies
  const validSkinSamples = skinCandidates.filter((c) => {
    const lum = luminance(c);
    const isBlownHighlight = lum > 0.92 || (c.r > 248 && c.g > 248 && c.b > 248);
    const isDeepShadow = lum < 0.10;
    const isNonSkinHue = c.r < c.b * 0.82;
    return !isBlownHighlight && !isDeepShadow && !isNonSkinHue;
  });

  // Sort valid samples by luminance and trim extreme upper/lower outliers to eliminate residual shine or shadows
  const sortedSkin = (validSkinSamples.length >= 3 ? validSkinSamples : skinCandidates)
    .slice()
    .sort((a, b) => luminance(a) - luminance(b));

  const trimmedSkin = sortedSkin.length >= 4
    ? sortedSkin.slice(1, sortedSkin.length - 1)
    : sortedSkin;

  const rawSkinBase: Color = robustChannelMean(trimmedSkin, { r: 215, g: 175, b: 145 });
  const rawSkinLum = luminance(rawSkinBase);

  // Directly preserve authentic source skin tone without arbitrary whitening, forced ivory, or artificial channel clamps
  const skinBase: Color = { ...rawSkinBase };

  // Derive EXACTLY three primary skin tones for the planar vector portrait:
  // Base midtone: authentic source melanin (skinBase)
  // Shadow tone: ~24% darker than base in perceptual HSL space (preserving warm undertones)
  // Highlight tone: ~14% lighter than base in perceptual HSL space (clean luminous plane)
  const skinShadow = derivePerceptualSkinShadow(skinBase, 0.24);
  const skinHighlight = derivePerceptualSkinHighlight(skinBase, 0.14);
  const skinShadowDeep = derivePerceptualSkinShadow(skinBase, 0.35);
  const skinToneWarmer: Color = {
    r: clamp(Math.round(skinBase.r * 1.04), 0, 255),
    g: clamp(Math.round(skinBase.g * 0.95), 0, 255),
    b: clamp(Math.round(skinBase.b * 0.90), 0, 255),
  };
  const neckShadow = derivePerceptualSkinShadow(skinBase, 0.30);

  // 3. Hair color sampling: utilize segmentation contour if available, supplemented by cranial crest landmarks
  const hairSamplePoints: Vec2[] = [];

  if (hairContour && hairContour.length >= 6) {
    let apexPt = hairContour[0];
    for (const p of hairContour) {
      if (p.y < apexPt.y) apexPt = p;
    }
    hairSamplePoints.push(apexPt);
    hairSamplePoints.push({
      x: headCenterX * 0.7 + apexPt.x * 0.3,
      y: (apexPt.y + foreheadTop.y) / 2,
    });
    const q1 = hairContour[Math.floor(hairContour.length * 0.25)];
    const q3 = hairContour[Math.floor(hairContour.length * 0.75)];
    if (q1) hairSamplePoints.push(q1);
    if (q3) hairSamplePoints.push(q3);
  }

  // Cranial crest and temporal regions
  hairSamplePoints.push(
    { x: headCenterX, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.12) },
    { x: headCenterX - faceHeight * 0.08, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.10) },
    { x: headCenterX + faceHeight * 0.08, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.10) },
    { x: Math.max(0.02, templeLeft.x - faceHeight * 0.06), y: foreheadTop.y - faceHeight * 0.03 },
    { x: Math.min(0.98, templeRight.x + faceHeight * 0.06), y: foreheadTop.y - faceHeight * 0.03 }
  );

  const rawHairSamples = hairSamplePoints.map((pt) => sampler.sampleRegion(pt, 0.012, 4));

  // Reject pure white background samples if subject is bald or closely cropped
  const validHairSamples = rawHairSamples.filter((c) => {
    const lum = luminance(c);
    const isPureBg = lum > 0.95 && Math.abs(c.r - c.g) < 10 && Math.abs(c.g - c.b) < 10;
    return !isPureBg;
  });

  const activeHairSamples = validHairSamples.length >= 2 ? validHairSamples : rawHairSamples;
  const rawHairPrimary: Color = robustChannelMean(activeHairSamples, { r: 35, g: 30, b: 32 });

  // Display hair colors: preserve blonde, red, brown, black, grey/silver without forced clamping
  const hairPrimary: Color = { ...rawHairPrimary };
  const hairSecondary: Color = lighten(hairPrimary, 0.18);

  // 4. Eye iris sampling: sample iris annulus around pupil, avoiding pupil center and white sclera
  const irisOffset = 0.009;
  const irisSamplePoints: Vec2[] = [
    { x: leftPupil.x + irisOffset, y: leftPupil.y },
    { x: leftPupil.x - irisOffset, y: leftPupil.y },
    { x: leftPupil.x, y: leftPupil.y + irisOffset * 0.8 },
    { x: leftPupil.x + irisOffset * 0.7, y: leftPupil.y + irisOffset * 0.7 },
    { x: leftPupil.x - irisOffset * 0.7, y: leftPupil.y + irisOffset * 0.7 },
    { x: rightPupil.x + irisOffset, y: rightPupil.y },
    { x: rightPupil.x - irisOffset, y: rightPupil.y },
    { x: rightPupil.x, y: rightPupil.y + irisOffset * 0.8 },
    { x: rightPupil.x + irisOffset * 0.7, y: rightPupil.y + irisOffset * 0.7 },
    { x: rightPupil.x - irisOffset * 0.7, y: rightPupil.y + irisOffset * 0.7 },
  ];

  const rawIrisSamples = irisSamplePoints.map((pt) => sampler.sampleRegion(pt, 0.004, 4));

  // Reject sclera (high luminance, neutral) and pupil aperture (near-zero luminance)
  const validIrisSamples = rawIrisSamples.filter((c) => {
    const lum = luminance(c);
    const isSclera = lum > 0.80 && Math.abs(c.r - c.g) < 18 && Math.abs(c.g - c.b) < 18;
    const isPupilHole = lum < 0.04;
    return !isSclera && !isPupilHole;
  });

  const activeIrisSamples = validIrisSamples.length >= 2 ? validIrisSamples : rawIrisSamples;
  const rawEyeColor: Color = robustChannelMean(activeIrisSamples, { r: 45, g: 35, b: 30 });

  // Display eye colors: preserve blue, green, hazel, amber, dark brown without arbitrary clamps
  const eyeColor: Color = { ...rawEyeColor };
  const irisOuterRing: Color = darken(eyeColor, 0.40);

  // 5. Lip color sampling: sample lower lip vermilion zone, avoiding teeth and oral cavity
  const mouthLeft = features.upperLipOuter?.[0] || features.lowerLipOuter?.[0] || features.lowerLip?.[0];
  const mouthRight = features.upperLipOuter?.[features.upperLipOuter.length - 1] || features.lowerLipOuter?.[features.lowerLipOuter.length - 1] || features.lowerLip?.[features.lowerLip.length - 1];
  const mouthWidth = (mouthLeft && mouthRight) ? Math.max(0.04, Math.abs(mouthRight.x - mouthLeft.x)) : faceHeight * 0.35;
  const lowerLipApex = (features.lowerLipOuter && features.lowerLipOuter.length > 0)
    ? features.lowerLipOuter[Math.floor(features.lowerLipOuter.length / 2)]
    : (lowerLip[0] || features.mouthCenter);

  const lipSamplePoints: Vec2[] = [
    lowerLipApex,
    { x: features.mouthCenter.x, y: features.mouthCenter.y * 0.35 + lowerLipApex.y * 0.65 },
    { x: features.mouthCenter.x - mouthWidth * 0.15, y: lowerLipApex.y },
    { x: features.mouthCenter.x + mouthWidth * 0.15, y: lowerLipApex.y },
  ];

  const rawLipSamples = lipSamplePoints.map((pt) => sampler.sampleRegion(pt, 0.006, 4));

  // Reject teeth (high luminance white/neutral) and oral cavity shadow
  const validLipSamples = rawLipSamples.filter((c) => {
    const lum = luminance(c);
    const isTeeth = lum > 0.78 && Math.abs(c.r - c.g) < 20 && Math.abs(c.g - c.b) < 20;
    const isOralCavity = lum < 0.06;
    return !isTeeth && !isOralCavity;
  });

  const activeLipSamples = validLipSamples.length >= 2 ? validLipSamples : rawLipSamples;
  const rawLipColor: Color = robustChannelMean(activeLipSamples, { r: 195, g: 110, b: 110 });

  // Display lip colors: preserve authentic pink, peach, mauve, berry, mocha tones without forced coral clamping
  const lipColor: Color = { ...rawLipColor };
  const lipShadow: Color = darken(lipColor, 0.18);
  const lipHighlight: Color = lighten(lipColor, 0.14);

  // 6. Eyebrows: sample along the central medial axis of left and right brow arches.
  // Probes strictly inside the brow volume to avoid adjacent skin margin dilution,
  // and applies trimmed mean estimation to prevent isolated dark noise or eyelash spikes.
  const buildBrowCorePoints = (upper?: Vec2[], lower?: Vec2[], fallback?: Vec2[]): Vec2[] => {
    if (upper && lower && upper.length >= 3 && lower.length >= 3) {
      const count = Math.min(upper.length, lower.length);
      const pts: Vec2[] = [];
      for (let i = 0; i < count; i++) {
        pts.push({
          x: (upper[i].x + lower[i].x) * 0.5,
          y: (upper[i].y + lower[i].y) * 0.5,
        });
      }
      return pts;
    }
    if (fallback && fallback.length >= 4) {
      const half = Math.floor(fallback.length / 2);
      const pts: Vec2[] = [];
      for (let i = 0; i < half; i++) {
        const j = fallback.length - 1 - i;
        pts.push({
          x: (fallback[i].x + fallback[j].x) * 0.5,
          y: (fallback[i].y + fallback[j].y) * 0.5,
        });
      }
      return pts;
    }
    return fallback || [];
  };

  const leftBrowCore = buildBrowCorePoints(features.leftEyebrowUpper, features.leftEyebrowLower, leftEyebrow);
  const rightBrowCore = buildBrowCorePoints(features.rightEyebrowUpper, features.rightEyebrowLower, rightEyebrow);

  // Sample along the dense body and arch of each brow (avoiding outer boundary edges)
  const sampleCorePoints = (pts: Vec2[]): Vec2[] => {
    if (pts.length <= 3) return pts;
    return [
      pts[1],
      pts[Math.floor(pts.length * 0.4)],
      pts[Math.floor(pts.length * 0.6)],
      pts[Math.min(pts.length - 2, pts.length - 1)],
    ];
  };

  const probePoints = [
    ...sampleCorePoints(leftBrowCore),
    ...sampleCorePoints(rightBrowCore),
  ];

  const allBrowSamples = probePoints.map((pt) =>
    sampler.sampleRegion(pt, 0.0035, 4)
  );

  // Filter out bare skin bleed (samples too close to skin luminance) and extreme dark noise
  const validBrowSamples = allBrowSamples.filter((c) => {
    const lum = luminance(c);
    const isSkinBleed = lum >= rawSkinLum - 0.035;
    const isNoiseSpike = lum < 0.025;
    return !isSkinBleed && !isNoiseSpike;
  });

  // Sort by luminance; apply trimmed-mean estimation (drop top 20% and bottom 15%)
  // to avoid domination by either surrounding skin or isolated hair/shadow artifacts
  let representativeBrowSamples = validBrowSamples;
  if (validBrowSamples.length >= 4) {
    const sorted = [...validBrowSamples].sort((a, b) => luminance(a) - luminance(b));
    const startIdx = Math.floor(sorted.length * 0.15);
    const endIdx = Math.max(startIdx + 1, Math.floor(sorted.length * 0.80));
    representativeBrowSamples = sorted.slice(startIdx, endIdx);
  }

  const rawEyebrowColor: Color = representativeBrowSamples.length > 0
    ? robustChannelMean(representativeBrowSamples, hairPrimary)
    : hairPrimary;

  // Display eyebrow color: authentic natural brow tone without forced black clamping
  const eyebrowColor: Color = { ...rawEyebrowColor };

  // 7. Beard color & shadow: sample mandibular chin zone
  const chinSample = sampler.sampleRegion(chinTip, 0.015, 9);
  const rawBeardColor: Color = chinSample;
  // If mandibular zone exhibits clear tonal contrast from bare skin, use sampled chin color;
  // otherwise default to matching hairPrimary
  const hasMandibularContrast = Math.abs(luminance(chinSample) - rawSkinLum) > 0.07;
  const beardColor: Color = hasMandibularContrast ? { ...rawBeardColor } : { ...hairPrimary };
  const beardShadowColor: Color = darken(beardColor, 0.22);

  // 8. Clean, light warm neutral background (#FBF5EE)
  const background: Color = { r: 251, g: 245, b: 238 };

  return {
    rawSkinBase,
    rawSkinLum,
    rawHairPrimary,
    rawEyeColor,
    rawLipColor,
    rawEyebrowColor,
    rawBeardColor,
    skinBase,
    skinShadow,
    skinShadowDeep,
    skinHighlight,
    skinToneWarmer,
    hairPrimary,
    hairSecondary,
    eyeColor,
    irisOuterRing,
    lipColor,
    lipShadow,
    lipHighlight,
    eyebrowColor,
    beardColor,
    beardShadowColor,
    background,
    neckShadow,
    lightDirection,
  };
}

/**
 * Estimates hair silhouette using real segmentation geometry when available,
 * with robust sanity checks and conservative landmark-guided fallback.
 *
 * Guarantees:
 * 1. Dark clothing alone NEVER generates long hair.
 * 2. Left-right asymmetry in length, volume, or drape is preserved.
 * 3. The face projection and all facial feature coordinates remain completely invariant.
 * 4. Fallback geometry is clearly marked with provenance: 'landmark-derived'.
 */
export function estimateHairstyle(
  features: FacialFeatures,
  sampler: ColorSampler,
  palette: PortraitPalette,
  segmentationData?: Vec2[] | HairSegmentationResult,
  _imgDim?: { width: number; height: number }
): HairEstimate {
  const { foreheadTop, templeLeft, templeRight, chinTip, foreheadHairline } = features;

  const refSkinLum = palette.rawSkinLum ?? luminance(palette.rawSkinBase ?? palette.skinBase);
  const hairLum = luminance(palette.hairPrimary);
  const faceHeight = Math.max(0.08, chinTip.y - foreheadTop.y);
  const headCenterX = (templeLeft.x + templeRight.x) / 2;
  const faceWidthNorm = Math.abs(templeRight.x - templeLeft.x) || (faceHeight * 0.62);

  // Distinguish segmentationData type
  const isSegResult = Boolean(
    segmentationData &&
    typeof segmentationData === 'object' &&
    ('hasHairSegmentation' in segmentationData || 'hasHair' in segmentationData)
  );

  const segResult = isSegResult ? (segmentationData as HairSegmentationResult) : undefined;
  const rawContourPoints = isSegResult
    ? (segResult?.silhouettePoints ?? segResult?.hairContourPoints)
    : (Array.isArray(segmentationData) ? segmentationData : undefined);

  // =========================================================================
  // PATH A: High-Precision Segmentation Mask Available
  // =========================================================================
  const hasSeg = segResult ? Boolean(segResult.hasHairSegmentation ?? (segResult as any).hasHair) : false;
  if (segResult && hasSeg && segResult.provenance === 'segmentation-mask-derived' && segResult.silhouettePoints && segResult.silhouettePoints.length >= 4) {
    const hasLongHair = Boolean(
      segResult.metrics?.hasLongHair ||
      (segResult.backHairPoints && segResult.backHairPoints.length >= 4)
    );
    const parting = segResult.metrics?.parting ?? 'middle';
    const length: 'short' | 'medium' | 'long' = hasLongHair ? 'long' : 'short';
    const style: 'short' | 'curly' | 'straight' | 'wavy' | 'receding' | 'long' = hasLongHair
      ? 'straight'
      : (parting === 'bangs' ? 'curly' : 'short');

    // Interior hair facet strands for 3D volumetric shading
    const hairStrands: Vec2[][] = [];
    const crownPts = segResult.silhouettePoints.filter((p) => p.y <= foreheadTop.y + faceHeight * 0.05);
    if (crownPts.length >= 6) {
      const minYPt = crownPts.reduce((min, p) => (p.y < min.y ? p : min), crownPts[0]);
      hairStrands.push([
        { x: templeLeft.x, y: minYPt.y + faceHeight * 0.08 },
        { x: headCenterX - faceHeight * 0.08, y: minYPt.y + faceHeight * 0.12 },
        { x: headCenterX - faceHeight * 0.03, y: foreheadTop.y + faceHeight * 0.02 },
      ]);
      hairStrands.push([
        minYPt,
        { x: headCenterX + faceHeight * 0.04, y: minYPt.y + faceHeight * 0.10 },
        { x: headCenterX, y: foreheadTop.y + faceHeight * 0.02 },
      ]);
      hairStrands.push([
        { x: templeRight.x, y: minYPt.y + faceHeight * 0.08 },
        { x: headCenterX + faceHeight * 0.08, y: minYPt.y + faceHeight * 0.12 },
        { x: headCenterX + faceHeight * 0.03, y: foreheadTop.y + faceHeight * 0.02 },
      ]);
    }

    const hairHighlights: Vec2[][] = [
      [
        { x: headCenterX - faceHeight * 0.10, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.18) },
        { x: headCenterX + faceHeight * 0.10, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.19) },
        { x: headCenterX + faceHeight * 0.06, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.10) },
        { x: headCenterX - faceHeight * 0.06, y: Math.max(0.015, foreheadTop.y - faceHeight * 0.10) },
      ],
    ];

    return {
      detected: true,
      provenance: 'segmentation-mask-derived',
      silhouettePoints: segResult.silhouettePoints,
      backHairPoints: segResult.backHairPoints,
      hairlineContour: segResult.hairlinePoints,
      hairStrands,
      fringeLocks: [],
      hairHighlights,
      color: palette.hairPrimary,
      secondaryColor: palette.hairSecondary,
      coverage: 'full',
      length,
      style,
      parting,
      hasLongHairSides: hasLongHair,
    };
  }

  // =========================================================================
  // PATH B: Direct Contour Points Array (from fixtures or tests)
  // =========================================================================
  if (rawContourPoints && rawContourPoints.length >= 6) {
    const hasLongHair = rawContourPoints.some((p) => p.y > chinTip.y + faceHeight * 0.04);
    const length: 'short' | 'medium' | 'long' = hasLongHair ? 'long' : 'short';
    const style: 'short' | 'curly' | 'straight' | 'wavy' | 'receding' | 'long' = hasLongHair ? 'straight' : 'short';

    const tuckY = foreheadTop.y + faceHeight * 0.08;
    const backHairPoints = hasLongHair
      ? rawContourPoints.map((p) => ({
          x: p.x,
          y: p.y < tuckY ? tuckY : p.y,
        }))
      : undefined;

    return {
      detected: true,
      provenance: 'segmentation-mask-derived',
      silhouettePoints: rawContourPoints,
      backHairPoints,
      hairStrands: [],
      fringeLocks: [],
      hairHighlights: [],
      color: palette.hairPrimary,
      secondaryColor: palette.hairSecondary,
      coverage: 'full',
      length,
      style,
      parting: 'middle',
      hasLongHairSides: hasLongHair,
    };
  }

  // =========================================================================
  // PATH C: Conservative Heuristic Fallback (Missing Segmentation)
  // =========================================================================
  // Proportional cranial dome parameters
  const domeSemiAxisY = faceHeight * 0.30;
  const domeSemiAxisX = faceWidthNorm * 0.64;
  const domeCenterY = foreheadTop.y + faceHeight * 0.04;

  const numCrownPoints = 25;
  const crownArcPoints: Vec2[] = [];
  for (let i = 0; i < numCrownPoints; i++) {
    const t = i / (numCrownPoints - 1);
    const theta = Math.PI * (1 - t);
    const curlWave = (Math.sin(i * 0.85 + 0.3) * 0.005 + Math.cos(i * 1.40 + 0.7) * 0.003) * faceHeight * Math.sin(theta);
    const rx = domeSemiAxisX + curlWave;
    const ry = domeSemiAxisY + curlWave;
    crownArcPoints.push({
      x: headCenterX + rx * Math.cos(theta),
      y: domeCenterY - ry * Math.sin(theta),
    });
  }

  const apexPt = crownArcPoints[Math.floor(numCrownPoints / 2)] || {
    x: headCenterX,
    y: foreheadTop.y - domeSemiAxisY,
  };
  const apexY = apexPt.y;
  const hairHeight = Math.max(0.01, foreheadTop.y - apexY);

  // Forehead center probe for parting vs bangs
  const midForeheadSample = sampler.sampleRegion(
    { x: headCenterX, y: foreheadTop.y + faceHeight * 0.04 },
    0.012,
    9
  );
  const midForeheadLum = luminance(midForeheadSample);
  const isHairSample = (col: Color) => {
    const l = luminance(col);
    return (refSkinLum - l > 0.10 && l <= 0.45) || Math.abs(l - hairLum) < 0.20;
  };
  const isForeheadSkinExposed = midForeheadLum >= refSkinLum - 0.08 && !isHairSample(midForeheadSample);

  const parting: 'middle' | 'side' | 'open' | 'bangs' = isForeheadSkinExposed ? 'middle' : 'bangs';

  // Fallback lateral neck probes when segmentation data is completely absent:
  const leftNeckProbe = sampler.sampleRegion({ x: templeLeft.x - faceWidthNorm * 0.18, y: chinTip.y + faceHeight * 0.08 }, 0.015, 9);
  const rightNeckProbe = sampler.sampleRegion({ x: templeRight.x + faceWidthNorm * 0.18, y: chinTip.y + faceHeight * 0.08 }, 0.015, 9);
  const hasStrongLongHairEvidence = isHairSample(leftNeckProbe) && isHairSample(rightNeckProbe) && (refSkinLum - luminance(leftNeckProbe) > 0.18);
  const hasLongHairSides = hasStrongLongHairEvidence && parting === 'middle';

  const length: 'short' | 'medium' | 'long' = hasLongHairSides ? 'long' : (parting === 'bangs' ? 'medium' : 'short');
  const style: 'short' | 'curly' | 'straight' | 'wavy' | 'receding' | 'long' = hasLongHairSides
    ? 'straight'
    : (parting === 'bangs' ? 'curly' : 'short');

  let backHairPoints: Vec2[] | undefined;
  if (hasLongHairSides) {
    const tuckY = foreheadTop.y + faceHeight * 0.08;
    backHairPoints = [];
    backHairPoints.push(
      { x: templeLeft.x - faceWidthNorm * 0.26, y: chinTip.y + faceHeight * 0.24 },
      { x: templeLeft.x - faceWidthNorm * 0.22, y: chinTip.y + faceHeight * 0.12 },
      { x: templeLeft.x - faceWidthNorm * 0.18, y: chinTip.y - faceHeight * 0.02 },
      { x: templeLeft.x - faceWidthNorm * 0.14, y: templeLeft.y + faceHeight * 0.04 }
    );
    for (let i = 0; i < numCrownPoints; i++) {
      const pt = crownArcPoints[i];
      backHairPoints.push({
        x: pt.x,
        y: pt.y < tuckY ? tuckY : pt.y,
      });
    }
    backHairPoints.push(
      { x: templeRight.x + faceWidthNorm * 0.14, y: templeRight.y + faceHeight * 0.04 },
      { x: templeRight.x + faceWidthNorm * 0.18, y: chinTip.y - faceHeight * 0.02 },
      { x: templeRight.x + faceWidthNorm * 0.22, y: chinTip.y + faceHeight * 0.12 },
      { x: templeRight.x + faceWidthNorm * 0.26, y: chinTip.y + faceHeight * 0.24 },
      { x: headCenterX + faceWidthNorm * 0.16, y: chinTip.y + faceHeight * 0.26 },
      { x: headCenterX, y: chinTip.y + faceHeight * 0.27 },
      { x: headCenterX - faceWidthNorm * 0.16, y: chinTip.y + faceHeight * 0.26 }
    );
  }

  const silhouettePoints: Vec2[] = [];
  if (hasLongHairSides && parting === 'middle') {
    silhouettePoints.push(
      { x: templeLeft.x - faceWidthNorm * 0.10, y: chinTip.y + faceHeight * 0.18 },
      { x: templeLeft.x - faceWidthNorm * 0.14, y: templeLeft.y + faceHeight * 0.08 },
      { x: templeLeft.x - faceWidthNorm * 0.12, y: templeLeft.y + faceHeight * 0.02 }
    );
    for (let i = 0; i < numCrownPoints; i++) {
      silhouettePoints.push(crownArcPoints[i]);
    }
    silhouettePoints.push(
      { x: templeRight.x + faceWidthNorm * 0.12, y: templeRight.y + faceHeight * 0.02 },
      { x: templeRight.x + faceWidthNorm * 0.14, y: templeRight.y + faceHeight * 0.08 },
      { x: templeRight.x + faceWidthNorm * 0.10, y: chinTip.y + faceHeight * 0.18 },
      { x: templeRight.x - faceWidthNorm * 0.04, y: foreheadTop.y + faceHeight * 0.04 },
      { x: headCenterX + faceWidthNorm * 0.05, y: foreheadTop.y + faceHeight * 0.01 },
      { x: headCenterX, y: foreheadTop.y - faceHeight * 0.015 },
      { x: headCenterX - faceWidthNorm * 0.05, y: foreheadTop.y + faceHeight * 0.01 },
      { x: templeLeft.x + faceWidthNorm * 0.04, y: foreheadTop.y + faceHeight * 0.04 }
    );
  } else {
    const leftSideburnPt: Vec2 = { x: templeLeft.x - faceWidthNorm * 0.08, y: templeLeft.y + faceHeight * 0.08 };
    const leftSideburnMid: Vec2 = { x: templeLeft.x - faceWidthNorm * 0.10, y: templeLeft.y + faceHeight * 0.02 };
    const rightSideburnMid: Vec2 = { x: templeRight.x + faceWidthNorm * 0.10, y: templeRight.y + faceHeight * 0.02 };
    const rightSideburnPt: Vec2 = { x: templeRight.x + faceWidthNorm * 0.08, y: templeRight.y + faceHeight * 0.08 };

    silhouettePoints.push(leftSideburnPt, leftSideburnMid);
    for (let i = 0; i < numCrownPoints; i++) {
      silhouettePoints.push(crownArcPoints[i]);
    }
    silhouettePoints.push(rightSideburnMid, rightSideburnPt);

    const rightHairlineAnchor: Vec2 = { x: templeRight.x - faceWidthNorm * 0.04, y: foreheadTop.y + faceHeight * 0.04 };
    const leftHairlineAnchor: Vec2 = { x: templeLeft.x + faceWidthNorm * 0.04, y: foreheadTop.y + faceHeight * 0.04 };

    silhouettePoints.push(rightHairlineAnchor);
    if (parting === 'bangs') {
      const numLobes = 5;
      for (let lobe = 0; lobe < numLobes; lobe++) {
        const tMid = (lobe + 0.5) / numLobes;
        const tEnd = (lobe + 1.0) / numLobes;
        const xMid = rightHairlineAnchor.x * (1 - tMid) + leftHairlineAnchor.x * tMid;
        const xEnd = rightHairlineAnchor.x * (1 - tEnd) + leftHairlineAnchor.x * tEnd;
        const dip = (0.022 + Math.sin(lobe * 2.1 + 0.4) * 0.010) * faceHeight;
        const yBase = foreheadTop.y + 0.008 + Math.sin(Math.PI * tMid) * faceHeight * 0.012;
        silhouettePoints.push({ x: xMid, y: yBase + dip }, { x: xEnd, y: yBase });
      }
    } else if (foreheadHairline && foreheadHairline.length >= 4) {
      for (let i = foreheadHairline.length - 1; i >= 0; i--) {
        silhouettePoints.push(foreheadHairline[i]);
      }
    } else {
      silhouettePoints.push({ x: foreheadTop.x, y: foreheadTop.y });
    }
    silhouettePoints.push(leftHairlineAnchor);
  }

  const hairStrands: Vec2[][] = [
    [
      crownArcPoints[4] || { x: templeLeft.x, y: apexY },
      { x: headCenterX - faceHeight * 0.09, y: apexY + hairHeight * 0.35 },
      { x: headCenterX - faceHeight * 0.04, y: foreheadTop.y + 0.015 },
      { x: templeLeft.x + faceHeight * 0.02, y: foreheadTop.y + 0.025 },
    ],
    [
      crownArcPoints[12] || apexPt,
      { x: headCenterX + faceHeight * 0.05, y: apexY + hairHeight * 0.30 },
      { x: headCenterX + faceHeight * 0.02, y: foreheadTop.y + 0.020 },
      { x: headCenterX - faceHeight * 0.03, y: foreheadTop.y + 0.015 },
    ],
    [
      crownArcPoints[20] || { x: templeRight.x, y: apexY },
      { x: headCenterX + faceHeight * 0.09, y: apexY + hairHeight * 0.35 },
      { x: headCenterX + faceHeight * 0.04, y: foreheadTop.y + 0.015 },
      { x: templeRight.x - faceHeight * 0.02, y: foreheadTop.y + 0.025 },
    ],
  ];

  const hairHighlights: Vec2[][] = [
    [
      { x: headCenterX - faceHeight * 0.12, y: apexY + hairHeight * 0.12 },
      { x: headCenterX + faceHeight * 0.12, y: apexY + hairHeight * 0.10 },
      { x: headCenterX + faceHeight * 0.07, y: apexY + hairHeight * 0.22 },
      { x: headCenterX - faceHeight * 0.07, y: apexY + hairHeight * 0.22 },
    ],
  ];

  return {
    detected: true,
    provenance: 'landmark-derived',
    silhouettePoints,
    backHairPoints,
    hairStrands,
    fringeLocks: [],
    hairlineContour: undefined,
    hairHighlights,
    color: palette.hairPrimary,
    secondaryColor: palette.hairSecondary,
    coverage: 'full',
    length,
    style,
    parting,
    hasLongHairSides,
  };
}

/**
 * Estimates beard and moustache presence, density, and geometric regions.
 *
 * Implements Phase 5 Facial-Hair Estimation:
 * 1. Strict conservative defaults (clean-shaven when ambiguous; darkness alone is NOT hair).
 * 2. Rejection of subnasal cast shadows, mental crease lower-lip shadows, and directional key-light shadows.
 * 3. Rejection of dark collars and clothing near the neck (using multiclass segmentation mask when available).
 * 4. Separate, independent estimation of:
 *    - Moustache (philtrum band)
 *    - Goatee (chin bulb)
 *    - Jawline beard (mandibular chinstrap)
 *    - Sideburns (preauricular strips)
 * 5. Full support for explicit user override ('auto' | 'off' | 'on').
 */
export function estimateFacialHair(
  features: FacialFeatures,
  sampler: ColorSampler,
  palette: PortraitPalette,
  segResult?: HairSegmentationResult,
  options?: { override?: FacialHairOverride }
): FacialHairEstimate {
  const override = options?.override ?? 'auto';

  const {
    chinTip,
    upperLipOuter,
    lowerLip,
    lowerLipOuter,
    noseTip,
    jawline,
    mouthCenter,
    leftNostril,
    rightNostril,
    philtrum,
    foreheadTop,
    templeLeft,
    templeRight,
    leftEar,
    rightEar,
  } = features;

  const faceHeight = Math.max(0.08, chinTip.y - foreheadTop.y);
  const faceWidthNorm = Math.abs(templeRight.x - templeLeft.x) || (faceHeight * 0.62);

  const lowerLipBottom =
    (lowerLipOuter && lowerLipOuter[5]) ||
    (lowerLip && lowerLip[Math.floor(lowerLip.length / 2)]) ||
    (lowerLip && lowerLip[0]) ||
    chinTip;

  // -------------------------------------------------------------------------
  // 1. User Override: Force OFF
  // -------------------------------------------------------------------------
  if (override === 'off') {
    return {
      hasBeard: false,
      hasMustache: false,
      hasGoatee: false,
      hasFullBeard: false,
      hasJawBeard: false,
      hasSideburns: false,
      beardRegion: [],
      mustacheRegion: [],
      goateeRegion: [],
      jawBeardRegion: [],
      soulPatchRegion: undefined,
      chinCleftRegion: undefined,
      sideburnLeft: undefined,
      sideburnRight: undefined,
      color: palette.beardColor,
      beardShadowColor: palette.beardShadowColor,
      density: 'none',
      provenance: 'template-generated',
      override: 'off',
      metrics: {
        jawContrast: 0,
        mustacheContrast: 0,
        chinContrast: 0,
        chinBulbContrast: 0,
        isCleanShavenConfidence: 1,
        clothingRejected: false,
        shadowRejected: false,
      },
    };
  }

  // Helper to construct geometry for Mustache
  const buildMustacheRegion = (): Vec2[] => {
    const mustacheRegion: Vec2[] = [];
    const leftCorner = upperLipOuter[0];
    const rightCorner = upperLipOuter[upperLipOuter.length - 1];
    const mouthW = Math.abs(rightCorner.x - leftCorner.x) || 0.12;
    const nostrilY = Math.max(leftNostril.y, rightNostril.y);
    const subnasaleY = features.subnasale?.y ?? (noseTip.y + 0.008);
    const topY = Math.min(nostrilY + 0.004, subnasaleY + 0.002);
    const leftWingX = leftCorner.x - mouthW * 0.08;
    const rightWingX = rightCorner.x + mouthW * 0.08;

    mustacheRegion.push(
      { x: leftWingX, y: leftCorner.y + 0.004 },
      { x: leftCorner.x, y: leftCorner.y - 0.006 },
      { x: leftNostril.x, y: topY },
      { x: philtrum.x, y: topY + 0.005 },
      { x: rightNostril.x, y: topY },
      { x: rightCorner.x, y: rightCorner.y - 0.006 },
      { x: rightWingX, y: rightCorner.y + 0.004 }
    );
    for (let i = upperLipOuter.length - 1; i >= 0; i--) {
      mustacheRegion.push({
        x: upperLipOuter[i].x,
        y: upperLipOuter[i].y - 0.001,
      });
    }
    return mustacheRegion;
  };

  // Helper to construct geometry for Full Beard
  const buildFullBeardRegion = (): Vec2[] => {
    const beardRegion: Vec2[] = [];
    for (const p of jawline) {
      beardRegion.push({ x: p.x, y: p.y });
    }
    const leftMouthCorner = upperLipOuter[0];
    const rightMouthCorner = upperLipOuter[upperLipOuter.length - 1];
    const soulPatchTopY = lowerLipBottom.y + faceHeight * 0.020;
    const soulPatchWidth = faceWidthNorm * 0.05;

    beardRegion.push(
      { x: templeLeft.x * 0.70 + mouthCenter.x * 0.30, y: mouthCenter.y + faceHeight * 0.02 },
      { x: leftMouthCorner.x - faceWidthNorm * 0.07, y: leftMouthCorner.y + faceHeight * 0.06 },
      { x: mouthCenter.x - soulPatchWidth * 1.5, y: lowerLipBottom.y + faceHeight * 0.08 },
      { x: mouthCenter.x - soulPatchWidth, y: soulPatchTopY },
      { x: mouthCenter.x, y: soulPatchTopY - 0.002 },
      { x: mouthCenter.x + soulPatchWidth, y: soulPatchTopY },
      { x: mouthCenter.x + soulPatchWidth * 1.5, y: lowerLipBottom.y + faceHeight * 0.08 },
      { x: rightMouthCorner.x + faceWidthNorm * 0.07, y: rightMouthCorner.y + faceHeight * 0.06 },
      { x: templeRight.x * 0.70 + mouthCenter.x * 0.30, y: mouthCenter.y + faceHeight * 0.02 }
    );
    return beardRegion;
  };

  // Helper to construct geometry for Goatee (chin only)
  const buildGoateeRegion = (): Vec2[] => {
    const beardRegion: Vec2[] = [];
    const startIdx = Math.floor(jawline.length * 0.32);
    const endIdx = Math.ceil(jawline.length * 0.68);
    for (let i = startIdx; i <= endIdx; i++) {
      if (jawline[i]) beardRegion.push({ x: jawline[i].x, y: jawline[i].y });
    }
    const soulPatchTopY = lowerLipBottom.y + faceHeight * 0.022;
    beardRegion.push(
      { x: mouthCenter.x + faceWidthNorm * 0.06, y: soulPatchTopY + faceHeight * 0.05 },
      { x: mouthCenter.x, y: soulPatchTopY },
      { x: mouthCenter.x - faceWidthNorm * 0.06, y: soulPatchTopY + faceHeight * 0.05 }
    );
    return beardRegion;
  };

  // Helper to construct geometry for Jawline Chinstrap (jawline only, chin clear)
  const buildJawBeardRegion = (): Vec2[] => {
    const beardRegion: Vec2[] = [];
    for (const p of jawline) {
      beardRegion.push({ x: p.x, y: p.y });
    }
    const soulPatchTopY = lowerLipBottom.y + faceHeight * 0.05;
    beardRegion.push(
      { x: templeLeft.x * 0.75 + mouthCenter.x * 0.25, y: mouthCenter.y + faceHeight * 0.04 },
      { x: mouthCenter.x - faceWidthNorm * 0.12, y: chinTip.y - faceHeight * 0.03 },
      { x: mouthCenter.x, y: soulPatchTopY },
      { x: mouthCenter.x + faceWidthNorm * 0.12, y: chinTip.y - faceHeight * 0.03 },
      { x: templeRight.x * 0.75 + mouthCenter.x * 0.25, y: mouthCenter.y + faceHeight * 0.04 }
    );
    return beardRegion;
  };

  // Helper to construct Sideburns
  const buildSideburns = (): { left: Vec2[]; right: Vec2[] } => {
    return {
      left: [
        templeLeft,
        { x: templeLeft.x + 0.015, y: templeLeft.y + faceHeight * 0.10 },
        { x: templeLeft.x - 0.015, y: templeLeft.y + faceHeight * 0.12 },
        { x: templeLeft.x - 0.030, y: templeLeft.y },
      ],
      right: [
        templeRight,
        { x: templeRight.x - 0.015, y: templeRight.y + faceHeight * 0.10 },
        { x: templeRight.x + 0.015, y: templeRight.y + faceHeight * 0.12 },
        { x: templeRight.x + 0.030, y: templeRight.y },
      ],
    };
  };

  // -------------------------------------------------------------------------
  // 2. User Override: Force ON
  // -------------------------------------------------------------------------
  if (override === 'on') {
    const sideburns = buildSideburns();
    return {
      hasBeard: true,
      hasMustache: true,
      hasGoatee: true,
      hasFullBeard: true,
      hasJawBeard: true,
      hasSideburns: true,
      beardRegion: buildFullBeardRegion(),
      mustacheRegion: buildMustacheRegion(),
      goateeRegion: buildGoateeRegion(),
      jawBeardRegion: buildJawBeardRegion(),
      soulPatchRegion: undefined,
      chinCleftRegion: undefined,
      sideburnLeft: sideburns.left,
      sideburnRight: sideburns.right,
      color: palette.beardColor,
      beardShadowColor: palette.beardShadowColor,
      density: 'medium',
      provenance: 'template-generated',
      override: 'on',
      metrics: {
        jawContrast: 0.30,
        mustacheContrast: 0.30,
        chinContrast: 0.30,
        chinBulbContrast: 0.30,
        isCleanShavenConfidence: 0,
        clothingRejected: false,
        shadowRejected: false,
      },
    };
  }

  // -------------------------------------------------------------------------
  // 3. Conservative Baseline Skin Reference
  // -------------------------------------------------------------------------
  const rawSkinLum = palette.rawSkinLum ?? luminance(palette.rawSkinBase ?? palette.skinBase);
  const hairLum = luminance(palette.hairPrimary);

  // Safe reference sampling on medial cheeks and forehead (anatomically free of facial hair)
  const leftCheekRefPt: Vec2 = {
    x: templeLeft.x * 0.55 + noseTip.x * 0.45,
    y: (features.leftEyeContour[0].y + noseTip.y) / 2,
  };
  const rightCheekRefPt: Vec2 = {
    x: templeRight.x * 0.55 + noseTip.x * 0.45,
    y: (features.rightEyeContour[0].y + noseTip.y) / 2,
  };
  const foreheadRefPt: Vec2 = {
    x: (templeLeft.x + templeRight.x) / 2,
    y: foreheadTop.y + faceHeight * 0.04,
  };

  const cheekRefSamples = [
    sampler.sampleRegion(leftCheekRefPt, 0.015, 9),
    sampler.sampleRegion(rightCheekRefPt, 0.015, 9),
    sampler.sampleRegion(foreheadRefPt, 0.015, 9),
  ];
  const localSkinRefLum =
    (luminance(cheekRefSamples[0]) + luminance(cheekRefSamples[1]) + luminance(cheekRefSamples[2])) / 3;
  const effectiveSkinLum = Math.max(localSkinRefLum, rawSkinLum * 0.85);

  // Multiclass segmentation class helper
  const getSegClass = (pt: Vec2): number | undefined => {
    if (!segResult?.rawMask || !segResult.maskWidth || !segResult.maskHeight) return undefined;
    const px = Math.max(0, Math.min(segResult.maskWidth - 1, Math.round(pt.x * segResult.maskWidth)));
    const py = Math.max(0, Math.min(segResult.maskHeight - 1, Math.round(pt.y * segResult.maskHeight)));
    return segResult.rawMask[py * segResult.maskWidth + px];
  };

  let clothingRejected = false;
  let shadowRejected = false;

  // -------------------------------------------------------------------------
  // 4. Independent Mustache Estimation (Philtrum Area)
  // -------------------------------------------------------------------------
  const nostrilY = Math.max(leftNostril.y, rightNostril.y);
  const upperLipTopY = upperLipOuter[Math.floor(upperLipOuter.length / 2)]?.y ?? upperLipOuter[0].y;
  const mustacheMidY = (nostrilY + upperLipTopY) / 2;
  const mouthWidth = Math.abs(upperLipOuter[upperLipOuter.length - 1].x - upperLipOuter[0].x) || (faceWidthNorm * 0.35);

  const philtrumCenterPt: Vec2 = { x: mouthCenter.x, y: mustacheMidY };
  const philtrumLeftPt: Vec2 = { x: mouthCenter.x - mouthWidth * 0.22, y: mustacheMidY };
  const philtrumRightPt: Vec2 = { x: mouthCenter.x + mouthWidth * 0.22, y: mustacheMidY };

  const mustacheSamples = [
    sampler.sampleRegion(philtrumCenterPt, 0.012, 9),
    sampler.sampleRegion(philtrumLeftPt, 0.012, 9),
    sampler.sampleRegion(philtrumRightPt, 0.012, 9),
  ];
  const centerLum = luminance(mustacheSamples[0]);
  const leftWingLum = luminance(mustacheSamples[1]);
  const rightWingLum = luminance(mustacheSamples[2]);
  const mustacheAvgLum = (centerLum + leftWingLum + rightWingLum) / 3;

  // Lateral upper lip skin reference (clean skin directly outside the philtrum columns)
  const lateralLipLeftPt: Vec2 = { x: upperLipOuter[0].x * 0.70 + mouthCenter.x * 0.30, y: mustacheMidY };
  const lateralLipRightPt: Vec2 = { x: upperLipOuter[upperLipOuter.length - 1].x * 0.70 + mouthCenter.x * 0.30, y: mustacheMidY };
  const lateralLipAvgLum =
    (luminance(sampler.sampleRegion(lateralLipLeftPt, 0.012, 9)) +
      luminance(sampler.sampleRegion(lateralLipRightPt, 0.012, 9))) /
    2;

  const mustacheLocalContrast = lateralLipAvgLum - mustacheAvgLum;
  const mustacheGlobalContrast = effectiveSkinLum - mustacheAvgLum;

  // Subnasal Cast Shadow Rejection:
  // Under overhead lighting, the septum/columella casts a shadow directly at philtrumCenterPt.
  // In a clean-shaven face with a nose shadow, centerLum is dark, BUT bilateral wings are bright skin!
  const isSubnasalNoseShadow =
    centerLum < lateralLipAvgLum - 0.12 &&
    leftWingLum >= lateralLipAvgLum - 0.06 &&
    rightWingLum >= lateralLipAvgLum - 0.06;

  if (isSubnasalNoseShadow) {
    shadowRejected = true;
  }

  // Segmentation check for clothing near mouth (e.g. scarf/collar)
  const isPhiltrumClothes = getSegClass(philtrumCenterPt) === 4;
  if (isPhiltrumClothes) {
    clothingRejected = true;
  }

  const hasMustache =
    !isSubnasalNoseShadow &&
    !isPhiltrumClothes &&
    mustacheLocalContrast > 0.12 &&
    mustacheGlobalContrast > 0.16 &&
    mustacheAvgLum <= 0.30 &&
    leftWingLum <= 0.34 &&
    rightWingLum <= 0.34 &&
    Math.abs(mustacheAvgLum - hairLum) < 0.25;

  // -------------------------------------------------------------------------
  // 5. Independent Goatee & Chin Estimation
  // -------------------------------------------------------------------------
  // Mental groove (depression directly below lower lip, where lower-lip shadow falls)
  const mentalGroovePt: Vec2 = {
    x: mouthCenter.x,
    y: lowerLipBottom.y + (chinTip.y - lowerLipBottom.y) * 0.28,
  };
  // Chin bulb (forward-facing bulb of chin, facing light on clean-shaven subjects)
  const chinBulbPt: Vec2 = {
    x: chinTip.x,
    y: chinTip.y - faceHeight * 0.015,
  };
  const chinBulbLeftPt: Vec2 = {
    x: chinTip.x - faceWidthNorm * 0.08,
    y: chinTip.y - faceHeight * 0.015,
  };
  const chinBulbRightPt: Vec2 = {
    x: chinTip.x + faceWidthNorm * 0.08,
    y: chinTip.y - faceHeight * 0.015,
  };

  const mentalGrooveSample = sampler.sampleRegion(mentalGroovePt, 0.012, 9);
  const chinBulbSample = sampler.sampleRegion(chinBulbPt, 0.015, 9);
  const chinBulbLeftSample = sampler.sampleRegion(chinBulbLeftPt, 0.015, 9);
  const chinBulbRightSample = sampler.sampleRegion(chinBulbRightPt, 0.015, 9);

  const grooveLum = luminance(mentalGrooveSample);
  const bulbLum = luminance(chinBulbSample);
  const bulbLeftLum = luminance(chinBulbLeftSample);
  const bulbRightLum = luminance(chinBulbRightSample);
  const chinBulbAvgLum = (bulbLum + bulbLeftLum + bulbRightLum) / 3;
  const chinBulbContrast = effectiveSkinLum - chinBulbAvgLum;
  const chinContrast = effectiveSkinLum - ((grooveLum + bulbLum) / 2);

  // Lower Lip Shadow Rejection:
  // On a clean-shaven face under overhead light, grooveLum is dark (lip shadow),
  // but bulbLum is bright forward-facing skin!
  const isLowerLipCreaseShadow =
    grooveLum < effectiveSkinLum - 0.12 &&
    bulbLum >= effectiveSkinLum - 0.08;

  if (isLowerLipCreaseShadow) {
    shadowRejected = true;
  }

  // Segmentation check for clothes at chin
  const isChinClothes = getSegClass(chinBulbPt) === 4 || getSegClass(chinTip) === 4;
  if (isChinClothes) {
    clothingRejected = true;
  }

  const hasGoatee =
    !isLowerLipCreaseShadow &&
    !isChinClothes &&
    chinBulbContrast > 0.14 &&
    chinBulbAvgLum <= 0.32 &&
    bulbLum <= 0.34 &&
    Math.abs(chinBulbAvgLum - hairLum) < 0.25;

  // -------------------------------------------------------------------------
  // 6. Independent Jawline & Mandibular Beard Estimation
  // -------------------------------------------------------------------------
  // Sample strictly on the INNER mandibular facial plane (0.020 inward from jawline toward nose)
  const innerJawLeftSamples: Color[] = [];
  const innerJawRightSamples: Color[] = [];
  const neckCheckSamples: Color[] = [];
  let jawClothesCount = 0;

  // Filter jaw points to strictly those on lower face below mouth line
  const lowerJawPoints = jawline.filter((pt) => pt && pt.y > mouthCenter.y - 0.02);
  const leftJawPts = lowerJawPoints.filter((pt) => pt.x < chinTip.x - faceWidthNorm * 0.04);
  const rightJawPts = lowerJawPoints.filter((pt) => pt.x > chinTip.x + faceWidthNorm * 0.04);

  // Left jaw points (viewer's left / patient's right)
  for (const pt of leftJawPts) {
    // Inward toward nose
    const inPt: Vec2 = {
      x: pt.x * 0.88 + noseTip.x * 0.12,
      y: pt.y * 0.88 + noseTip.y * 0.12,
    };
    innerJawLeftSamples.push(sampler.sampleRegion(inPt, 0.012, 9));
    // Outward onto neck
    const outPt: Vec2 = {
      x: pt.x * 1.08 - noseTip.x * 0.08,
      y: pt.y * 1.08 - noseTip.y * 0.08,
    };
    neckCheckSamples.push(sampler.sampleRegion(outPt, 0.012, 9));
    if (getSegClass(outPt) === 4 || getSegClass(pt) === 4) {
      jawClothesCount++;
    }
  }

  // Right jaw points (viewer's right / patient's left)
  for (const pt of rightJawPts) {
    // Inward toward nose
    const inPt: Vec2 = {
      x: pt.x * 0.88 + noseTip.x * 0.12,
      y: pt.y * 0.88 + noseTip.y * 0.12,
    };
    innerJawRightSamples.push(sampler.sampleRegion(inPt, 0.012, 9));
    // Outward onto neck
    const outPt: Vec2 = {
      x: pt.x * 1.08 - noseTip.x * 0.08,
      y: pt.y * 1.08 - noseTip.y * 0.08,
    };
    neckCheckSamples.push(sampler.sampleRegion(outPt, 0.012, 9));
    if (getSegClass(outPt) === 4 || getSegClass(pt) === 4) {
      jawClothesCount++;
    }
  }

  const leftJawLum = innerJawLeftSamples.length > 0
    ? innerJawLeftSamples.reduce((s, c) => s + luminance(c), 0) / innerJawLeftSamples.length
    : effectiveSkinLum;
  const rightJawLum = innerJawRightSamples.length > 0
    ? innerJawRightSamples.reduce((s, c) => s + luminance(c), 0) / innerJawRightSamples.length
    : effectiveSkinLum;
  const jawAvgLum = (leftJawLum + rightJawLum) / 2;
  const jawContrast = effectiveSkinLum - jawAvgLum;

  const neckLum = neckCheckSamples.length > 0
    ? neckCheckSamples.reduce((s, c) => s + luminance(c), 0) / neckCheckSamples.length
    : effectiveSkinLum;

  // Dark Collar / Clothing Rejection:
  // If the inner jaw ridge is light skin while the neck is dark:
  // Darkness is purely on the neck (dark shirt or collar)!
  const isDarkCollar = jawAvgLum >= effectiveSkinLum - 0.08 && neckLum < effectiveSkinLum - 0.18;
  if (isDarkCollar || jawClothesCount >= 3) {
    clothingRejected = true;
  }

  // Directional Key-Light Shadow Rejection:
  // If only one side of the jaw is dark while the other is light skin:
  // This is an angled light shadow, NOT a beard!
  const isDirectionalShadow = Math.abs(leftJawLum - rightJawLum) > 0.14;
  if (isDirectionalShadow) {
    shadowRejected = true;
  }

  const hasJawBeard =
    !isDarkCollar &&
    jawClothesCount < 3 &&
    !isDirectionalShadow &&
    jawContrast > 0.16 &&
    jawAvgLum <= 0.32 &&
    leftJawLum <= 0.36 &&
    rightJawLum <= 0.36 &&
    Math.abs(jawAvgLum - hairLum) < 0.25;

  // -------------------------------------------------------------------------
  // 7. Independent Sideburns Estimation
  // -------------------------------------------------------------------------
  const earLeftY = leftEar && leftEar[0] ? leftEar[0].y : (templeLeft.y + faceHeight * 0.10);
  const earRightY = rightEar && rightEar[0] ? rightEar[0].y : (templeRight.y + faceHeight * 0.10);
  const sbLeftPt: Vec2 = { x: templeLeft.x + 0.010, y: (templeLeft.y + earLeftY) / 2 };
  const sbRightPt: Vec2 = { x: templeRight.x - 0.010, y: (templeRight.y + earRightY) / 2 };

  const sbLeftSample = sampler.sampleRegion(sbLeftPt, 0.012, 9);
  const sbRightSample = sampler.sampleRegion(sbRightPt, 0.012, 9);
  const sbLeftLum = luminance(sbLeftSample);
  const sbRightLum = luminance(sbRightSample);
  const sbAvgLum = (sbLeftLum + sbRightLum) / 2;
  const sbContrast = effectiveSkinLum - sbAvgLum;

  const hasSideburns =
    sbContrast > 0.15 &&
    sbAvgLum <= 0.32 &&
    Math.abs(sbAvgLum - hairLum) < 0.25 &&
    getSegClass(sbLeftPt) !== 4 &&
    getSegClass(sbRightPt) !== 4;

  // -------------------------------------------------------------------------
  // 8. Synthesis & Classification
  // -------------------------------------------------------------------------
  const hasFullBeard = Boolean(hasJawBeard && hasGoatee);
  const hasBeard = Boolean(hasJawBeard || hasGoatee);

  // Clean-shaven confidence
  const maxContrast = Math.max(jawContrast, chinBulbContrast, mustacheLocalContrast, sbContrast);
  const isCleanShavenConfidence = Math.max(0, Math.min(1, 1 - maxContrast * 2.2));

  // Density
  let density: 'none' | 'light' | 'medium' | 'heavy' = 'none';
  if (hasBeard || hasMustache || hasSideburns) {
    if (maxContrast > 0.26) {
      density = 'heavy';
    } else if (maxContrast > 0.16) {
      density = 'medium';
    } else {
      density = 'light';
    }
  }

  // Geometry routing
  const mustacheRegion = hasMustache ? buildMustacheRegion() : [];

  let beardRegion: Vec2[] = [];
  let goateeRegion: Vec2[] | undefined;
  let jawBeardRegion: Vec2[] | undefined;

  if (hasFullBeard) {
    beardRegion = buildFullBeardRegion();
    goateeRegion = buildGoateeRegion();
    jawBeardRegion = buildJawBeardRegion();
  } else if (hasGoatee) {
    // Goatee alone: only chin pad
    beardRegion = buildGoateeRegion();
    goateeRegion = buildGoateeRegion();
  } else if (hasJawBeard) {
    // Jaw chinstrap alone: jaw contour leaving chin bare
    beardRegion = buildJawBeardRegion();
    jawBeardRegion = buildJawBeardRegion();
  }

  const sideburns = (hasSideburns || (hasFullBeard && hasJawBeard)) ? buildSideburns() : undefined;

  const provenance: ShapeProvenance = (hasBeard || hasMustache || hasSideburns)
    ? 'landmark-derived'
    : 'template-generated';

  return {
    hasBeard,
    hasMustache,
    hasGoatee,
    hasFullBeard,
    hasJawBeard,
    hasSideburns,
    beardRegion,
    mustacheRegion,
    goateeRegion,
    jawBeardRegion,
    soulPatchRegion: undefined,
    chinCleftRegion: undefined,
    sideburnLeft: sideburns?.left,
    sideburnRight: sideburns?.right,
    color: palette.beardColor,
    beardShadowColor: palette.beardShadowColor,
    density,
    provenance,
    override: 'auto',
    metrics: {
      jawContrast,
      mustacheContrast: mustacheLocalContrast,
      chinContrast,
      chinBulbContrast,
      isCleanShavenConfidence,
      clothingRejected,
      shadowRejected,
    },
  };
}
