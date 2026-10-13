/**
 * CodeMyFace — Deterministic Baseline Test Fixtures
 *
 * Provides calibrated, reproducible reference datasets representing varied:
 * 1. Hairstyles (short, long with middle parting, wavy, full volume)
 * 2. Facial hair (clean-shaven, full mandibular beard + mustache)
 * 3. Skin tones (fair ivory, warm tan, deep melanin, neutral)
 * 4. Facial shapes (oval, oblong, round, square, heart)
 * 5. Facial expressions (neutral, closed smile, open-mouth smile with teeth)
 *
 * PRIVACY NOTICE:
 * All coordinates and metrics are synthetically generated or calibrated from public
 * anatomical reference templates. No private personal user photographs are stored
 * or committed in this repository.
 */
import { FaceAnalysis, FacialFeatures, Vec2 } from '../../types/portrait';

/**
 * Helper to generate a 36-point parametric face oval
 */
function generateFaceOval(cx: number, cy: number, rx: number, ry: number, jawScale: number = 1.0): Vec2[] {
  const points: Vec2[] = [];
  for (let i = 0; i < 36; i++) {
    const angle = (i / 36) * Math.PI * 2;
    const isLower = Math.sin(angle) > 0.2;
    const curRx = rx * (isLower ? jawScale : 1.0);
    points.push({
      x: cx + Math.cos(angle) * curRx,
      y: cy + Math.sin(angle) * ry,
    });
  }
  return points;
}

/**
 * Generates an anatomical set of facial features
 */
function createFixtureFeatures(options: {
  cx?: number;
  cy?: number;
  faceWidth?: number;
  faceHeight?: number;
  jawScale?: number;
  isSmileOpen?: boolean;
}): FacialFeatures {
  const cx = options.cx ?? 0.50;
  const cy = options.cy ?? 0.48;
  const fw = options.faceWidth ?? 0.36;
  const fh = options.faceHeight ?? 0.44;
  const jawScale = options.jawScale ?? 1.0;
  const openSmile = options.isSmileOpen ?? false;

  const halfW = fw / 2;
  const halfH = fh / 2;

  const foreheadTop: Vec2 = { x: cx, y: cy - halfH };
  const chinTip: Vec2 = { x: cx, y: cy + halfH };
  const templeLeft: Vec2 = { x: cx - halfW, y: cy - halfH * 0.2 };
  const templeRight: Vec2 = { x: cx + halfW, y: cy - halfH * 0.2 };

  const faceOutline = generateFaceOval(cx, cy, halfW, halfH, jawScale);
  const jawline = faceOutline.slice(8, 29);

  // Eyes & Eyebrows
  const eyeY = cy - halfH * 0.15;
  const eyeSpacing = halfW * 0.55;
  const leftPupil: Vec2 = { x: cx - eyeSpacing, y: eyeY };
  const rightPupil: Vec2 = { x: cx + eyeSpacing, y: eyeY };

  // 16-point anatomical eye contour matching MediaPipe indices (0: outer, 8: inner for left eye)
  const makeEyeContour = (pupil: Vec2): Vec2[] => {
    // For left eye (viewer's perspective), index 0 is outer (-0.045), index 8 is inner (+0.045)
    // For right eye, index 0 is inner (-0.045), index 8 is outer (+0.045)
    const xMin = pupil.x - 0.045;
    const xMax = pupil.x + 0.045;
    const yCenter = pupil.y;
    return [
      { x: xMin, y: yCenter },                         // 0
      { x: pupil.x - 0.038, y: yCenter + 0.008 },      // 1
      { x: pupil.x - 0.030, y: yCenter + 0.014 },      // 2
      { x: pupil.x - 0.015, y: yCenter + 0.017 },      // 3
      { x: pupil.x, y: yCenter + 0.018 },              // 4
      { x: pupil.x + 0.015, y: yCenter + 0.018 },      // 5
      { x: pupil.x + 0.030, y: yCenter + 0.015 },      // 6
      { x: pupil.x + 0.038, y: yCenter + 0.009 },      // 7
      { x: xMax, y: yCenter },                         // 8
      { x: pupil.x + 0.038, y: yCenter - 0.009 },      // 9
      { x: pupil.x + 0.030, y: yCenter - 0.015 },      // 10
      { x: pupil.x + 0.015, y: yCenter - 0.019 },      // 11
      { x: pupil.x, y: yCenter - 0.022 },              // 12
      { x: pupil.x - 0.015, y: yCenter - 0.021 },      // 13
      { x: pupil.x - 0.030, y: yCenter - 0.018 },      // 14
      { x: pupil.x - 0.038, y: yCenter - 0.010 },      // 15
    ];
  };

  const leftEyeContour = makeEyeContour(leftPupil);
  const rightEyeContour = makeEyeContour(rightPupil);
  const leftEyeLower = leftEyeContour.slice(0, 9);
  const leftEyeUpper = [
    leftEyeContour[0],
    leftEyeContour[15],
    leftEyeContour[14],
    leftEyeContour[13],
    leftEyeContour[12],
    leftEyeContour[11],
    leftEyeContour[10],
    leftEyeContour[9],
    leftEyeContour[8],
  ];
  const rightEyeLower = rightEyeContour.slice(0, 9);
  const rightEyeUpper = [
    rightEyeContour[0],
    rightEyeContour[15],
    rightEyeContour[14],
    rightEyeContour[13],
    rightEyeContour[12],
    rightEyeContour[11],
    rightEyeContour[10],
    rightEyeContour[9],
    rightEyeContour[8],
  ];

  const browY = eyeY - 0.045;
  const leftEyebrowUpper: Vec2[] = [
    { x: leftPupil.x - 0.055, y: browY + 0.005 },
    { x: leftPupil.x - 0.025, y: browY - 0.008 },
    { x: leftPupil.x, y: browY - 0.010 },
    { x: leftPupil.x + 0.035, y: browY - 0.002 },
  ];
  const leftEyebrowLower: Vec2[] = [
    { x: leftPupil.x - 0.050, y: browY + 0.015 },
    { x: leftPupil.x, y: browY + 0.004 },
    { x: leftPupil.x + 0.032, y: browY + 0.008 },
  ];
  const rightEyebrowUpper: Vec2[] = [
    { x: rightPupil.x - 0.035, y: browY - 0.002 },
    { x: rightPupil.x, y: browY - 0.010 },
    { x: rightPupil.x + 0.025, y: browY - 0.008 },
    { x: rightPupil.x + 0.055, y: browY + 0.005 },
  ];
  const rightEyebrowLower: Vec2[] = [
    { x: rightPupil.x - 0.032, y: browY + 0.008 },
    { x: rightPupil.x, y: browY + 0.004 },
    { x: rightPupil.x + 0.050, y: browY + 0.015 },
  ];

  // Nose
  const nasion: Vec2 = { x: cx, y: eyeY - 0.02 };
  const noseTip: Vec2 = { x: cx, y: cy + halfH * 0.18 };
  const noseBridge: Vec2[] = [
    nasion,
    { x: cx, y: (nasion.y + noseTip.y) * 0.45 },
    { x: cx, y: (nasion.y + noseTip.y) * 0.75 },
    noseTip,
  ];
  const leftNostril: Vec2 = { x: cx - 0.032, y: noseTip.y + 0.008 };
  const rightNostril: Vec2 = { x: cx + 0.032, y: noseTip.y + 0.008 };
  const subnasale: Vec2 = { x: cx, y: noseTip.y + 0.016 };

  // Mouth & Lips
  const mouthCenterY = cy + halfH * 0.52;
  const mouthCenter: Vec2 = { x: cx, y: mouthCenterY };
  const mouthHalfW = 0.065;
  const mouthOpenDelta = openSmile ? 0.035 : 0.002;

  const upperLipOuter: Vec2[] = [
    { x: cx - mouthHalfW, y: mouthCenterY },
    { x: cx - mouthHalfW * 0.7, y: mouthCenterY - 0.012 },
    { x: cx - mouthHalfW * 0.4, y: mouthCenterY - 0.024 },
    { x: cx - mouthHalfW * 0.2, y: mouthCenterY - 0.022 },
    { x: cx - mouthHalfW * 0.08, y: mouthCenterY - 0.019 },
    { x: cx, y: mouthCenterY - 0.018 },
    { x: cx + mouthHalfW * 0.08, y: mouthCenterY - 0.019 },
    { x: cx + mouthHalfW * 0.2, y: mouthCenterY - 0.022 },
    { x: cx + mouthHalfW * 0.4, y: mouthCenterY - 0.024 },
    { x: cx + mouthHalfW * 0.7, y: mouthCenterY - 0.012 },
    { x: cx + mouthHalfW, y: mouthCenterY },
  ];
  const upperLipInner: Vec2[] = [
    { x: cx - mouthHalfW, y: mouthCenterY },
    { x: cx - mouthHalfW * 0.8, y: mouthCenterY - 0.003 },
    { x: cx - mouthHalfW * 0.6, y: mouthCenterY - 0.006 },
    { x: cx - mouthHalfW * 0.4, y: mouthCenterY - 0.008 },
    { x: cx - mouthHalfW * 0.2, y: mouthCenterY - 0.007 },
    { x: cx, y: mouthCenterY - 0.005 },
    { x: cx + mouthHalfW * 0.2, y: mouthCenterY - 0.007 },
    { x: cx + mouthHalfW * 0.4, y: mouthCenterY - 0.008 },
    { x: cx + mouthHalfW * 0.6, y: mouthCenterY - 0.006 },
    { x: cx + mouthHalfW * 0.8, y: mouthCenterY - 0.003 },
    { x: cx + mouthHalfW, y: mouthCenterY },
  ];
  const lowerLipOuter: Vec2[] = [
    { x: cx - mouthHalfW, y: mouthCenterY },
    { x: cx - mouthHalfW * 0.8, y: mouthCenterY + (0.015 + mouthOpenDelta * 0.5) },
    { x: cx - mouthHalfW * 0.6, y: mouthCenterY + (0.024 + mouthOpenDelta * 0.5) },
    { x: cx - mouthHalfW * 0.4, y: mouthCenterY + (0.030 + mouthOpenDelta * 0.5) },
    { x: cx - mouthHalfW * 0.2, y: mouthCenterY + (0.033 + mouthOpenDelta * 0.5) },
    { x: cx, y: mouthCenterY + (0.034 + mouthOpenDelta * 0.5) },
    { x: cx + mouthHalfW * 0.2, y: mouthCenterY + (0.033 + mouthOpenDelta * 0.5) },
    { x: cx + mouthHalfW * 0.4, y: mouthCenterY + (0.030 + mouthOpenDelta * 0.5) },
    { x: cx + mouthHalfW * 0.6, y: mouthCenterY + (0.024 + mouthOpenDelta * 0.5) },
    { x: cx + mouthHalfW * 0.8, y: mouthCenterY + (0.015 + mouthOpenDelta * 0.5) },
    { x: cx + mouthHalfW, y: mouthCenterY },
  ];
  const lowerLipInner: Vec2[] = [
    { x: cx - mouthHalfW, y: mouthCenterY },
    { x: cx - mouthHalfW * 0.8, y: mouthCenterY + mouthOpenDelta * 0.3 },
    { x: cx - mouthHalfW * 0.6, y: mouthCenterY + mouthOpenDelta * 0.6 },
    { x: cx - mouthHalfW * 0.4, y: mouthCenterY + mouthOpenDelta * 0.85 },
    { x: cx - mouthHalfW * 0.2, y: mouthCenterY + mouthOpenDelta * 0.95 },
    { x: cx, y: mouthCenterY + mouthOpenDelta },
    { x: cx + mouthHalfW * 0.2, y: mouthCenterY + mouthOpenDelta * 0.95 },
    { x: cx + mouthHalfW * 0.4, y: mouthCenterY + mouthOpenDelta * 0.85 },
    { x: cx + mouthHalfW * 0.6, y: mouthCenterY + mouthOpenDelta * 0.6 },
    { x: cx + mouthHalfW * 0.8, y: mouthCenterY + mouthOpenDelta * 0.3 },
    { x: cx + mouthHalfW, y: mouthCenterY },
  ];

  // Ears
  const leftEar: Vec2[] = [
    { x: templeLeft.x, y: eyeY - 0.02 },
    { x: templeLeft.x - 0.035, y: eyeY + 0.02 },
    { x: templeLeft.x - 0.040, y: noseTip.y - 0.02 },
    { x: templeLeft.x - 0.025, y: noseTip.y + 0.02 },
    { x: templeLeft.x, y: noseTip.y },
  ];
  const rightEar: Vec2[] = [
    { x: templeRight.x, y: eyeY - 0.02 },
    { x: templeRight.x + 0.035, y: eyeY + 0.02 },
    { x: templeRight.x + 0.040, y: noseTip.y - 0.02 },
    { x: templeRight.x + 0.025, y: noseTip.y + 0.02 },
    { x: templeRight.x, y: noseTip.y },
  ];

  return {
    faceOutline,
    jawline,
    leftEyeContour,
    rightEyeContour,
    leftEyeUpper,
    leftEyeLower,
    rightEyeUpper,
    rightEyeLower,
    leftPupil,
    rightPupil,
    leftIrisRadius: 0.016,
    rightIrisRadius: 0.016,
    leftEyebrow: [...leftEyebrowUpper, ...leftEyebrowLower],
    rightEyebrow: [...rightEyebrowUpper, ...rightEyebrowLower],
    leftEyebrowUpper,
    leftEyebrowLower,
    rightEyebrowUpper,
    rightEyebrowLower,
    noseBridge,
    noseTip,
    noseBottom: [leftNostril, subnasale, rightNostril],
    leftNostril,
    rightNostril,
    leftAlarWing: [leftNostril, { x: cx - 0.038, y: noseTip.y }, { x: cx - 0.020, y: noseTip.y - 0.010 }],
    rightAlarWing: [rightNostril, { x: cx + 0.038, y: noseTip.y }, { x: cx + 0.020, y: noseTip.y - 0.010 }],
    subnasale,
    nasion,
    upperLip: upperLipOuter,
    lowerLip: lowerLipOuter,
    upperLipOuter,
    upperLipInner,
    lowerLipOuter,
    lowerLipInner,
    mouthCenter,
    leftEar,
    rightEar,
    foreheadTop,
    foreheadHairline: [
      { x: templeLeft.x + 0.02, y: foreheadTop.y + 0.03 },
      { x: cx, y: foreheadTop.y },
      { x: templeRight.x - 0.02, y: foreheadTop.y + 0.03 },
    ],
    templeLeft,
    templeRight,
    chinTip,
    chinCrest: [chinTip],
    leftCheekPlane: [templeLeft, leftPupil, noseTip],
    rightCheekPlane: [templeRight, rightPupil, noseTip],
    leftMandibularCorner: jawline[jawline.length - 1] || templeLeft,
    rightMandibularCorner: jawline[0] || templeRight,
    neckLeft: { x: cx - halfW * 0.7, y: chinTip.y + 0.10 },
    neckRight: { x: cx + halfW * 0.7, y: chinTip.y + 0.10 },
    glabella: { x: cx, y: eyeY - 0.03 },
    philtrum: { x: cx, y: noseTip.y + 0.02 },
    allLandmarks: faceOutline,
  };
}

/**
 * Fixture 1: Short Hair, Clean-Shaven, Fair Skin, Oval Face
 */
export const shortHairCleanShavenFixture: FaceAnalysis = {
  requestId: 'fixture-short-clean',
  totalLandmarksDetected: 478,
  consumedLandmarkCount: 478,
  faceShape: 'oval',
  faceCenter: { x: 0.50, y: 0.48 },
  faceWidth: 0.36,
  faceHeight: 0.44,
  faceAngle: 0,
  imageWidth: 900,
  imageHeight: 1600,
  selectedFaceIndex: 0,
  totalFacesDetected: 1,
  analysisTimeMs: 20,
  features: createFixtureFeatures({ faceWidth: 0.36, faceHeight: 0.44 }),
  palette: {
    skinBase: { r: 246, g: 222, b: 202 },
    skinShadow: { r: 220, g: 195, b: 175 },
    skinShadowDeep: { r: 195, g: 170, b: 150 },
    skinHighlight: { r: 255, g: 238, b: 222 },
    skinToneWarmer: { r: 250, g: 215, b: 185 },
    hairPrimary: { r: 22, g: 20, b: 24 },
    hairSecondary: { r: 48, g: 44, b: 54 },
    eyeColor: { r: 45, g: 35, b: 30 },
    irisOuterRing: { r: 24, g: 18, b: 16 },
    lipColor: { r: 215, g: 135, b: 130 },
    lipShadow: { r: 175, g: 105, b: 100 },
    lipHighlight: { r: 235, g: 165, b: 160 },
    eyebrowColor: { r: 32, g: 30, b: 32 },
    beardColor: { r: 22, g: 20, b: 24 },
    beardShadowColor: { r: 16, g: 14, b: 18 },
    background: { r: 251, g: 245, b: 238 },
    neckShadow: { r: 185, g: 160, b: 140 },
    lightDirection: 'frontal',
  },
  hairEstimate: {
    detected: true,
    length: 'short',
    style: 'short',
    coverage: 'full',
    silhouettePoints: [
      { x: 0.30, y: 0.38 },
      { x: 0.34, y: 0.26 },
      { x: 0.50, y: 0.18 },
      { x: 0.66, y: 0.26 },
      { x: 0.70, y: 0.38 },
      { x: 0.65, y: 0.42 },
      { x: 0.35, y: 0.42 },
    ],
    color: { r: 22, g: 20, b: 24 },
    secondaryColor: { r: 48, g: 44, b: 54 },
  },
  facialHairEstimate: {
    hasBeard: false,
    hasMustache: false,
    hasGoatee: false,
    hasFullBeard: false,
    density: 'none',
    beardRegion: [],
    mustacheRegion: [],
    color: { r: 22, g: 20, b: 24 },
    beardShadowColor: { r: 16, g: 14, b: 18 },
  },
};

/**
 * Fixture 2: Long Hair, Middle Parting, Tan Skin, Female Portrait
 */
export const longHairFemaleFixture: FaceAnalysis = {
  requestId: 'fixture-long-female',
  totalLandmarksDetected: 478,
  consumedLandmarkCount: 478,
  faceShape: 'oblong',
  faceCenter: { x: 0.50, y: 0.48 },
  faceWidth: 0.34,
  faceHeight: 0.48,
  faceAngle: 0,
  imageWidth: 900,
  imageHeight: 1600,
  selectedFaceIndex: 0,
  totalFacesDetected: 1,
  analysisTimeMs: 20,
  features: createFixtureFeatures({ faceWidth: 0.34, faceHeight: 0.48 }),
  palette: {
    skinBase: { r: 235, g: 195, b: 165 },
    skinShadow: { r: 205, g: 165, b: 135 },
    skinShadowDeep: { r: 175, g: 135, b: 105 },
    skinHighlight: { r: 250, g: 215, b: 185 },
    skinToneWarmer: { r: 240, g: 185, b: 150 },
    hairPrimary: { r: 20, g: 18, b: 22 },
    hairSecondary: { r: 45, g: 40, b: 48 },
    eyeColor: { r: 40, g: 30, b: 25 },
    irisOuterRing: { r: 22, g: 16, b: 14 },
    lipColor: { r: 210, g: 120, b: 125 },
    lipShadow: { r: 170, g: 90, b: 95 },
    lipHighlight: { r: 230, g: 150, b: 155 },
    eyebrowColor: { r: 30, g: 28, b: 30 },
    beardColor: { r: 20, g: 18, b: 22 },
    beardShadowColor: { r: 15, g: 13, b: 17 },
    background: { r: 251, g: 245, b: 238 },
    neckShadow: { r: 170, g: 130, b: 100 },
    lightDirection: 'left',
  },
  hairEstimate: {
    detected: true,
    length: 'long',
    style: 'straight',
    parting: 'middle',
    hasLongHairSides: true,
    coverage: 'full',
    silhouettePoints: [
      { x: 0.28, y: 0.65 },
      { x: 0.26, y: 0.45 },
      { x: 0.32, y: 0.24 },
      { x: 0.50, y: 0.16 },
      { x: 0.68, y: 0.24 },
      { x: 0.74, y: 0.45 },
      { x: 0.72, y: 0.65 },
      { x: 0.64, y: 0.32 },
      { x: 0.50, y: 0.26 },
      { x: 0.36, y: 0.32 },
    ],
    backHairPoints: [
      { x: 0.22, y: 0.75 },
      { x: 0.25, y: 0.55 },
      { x: 0.34, y: 0.22 },
      { x: 0.50, y: 0.15 },
      { x: 0.66, y: 0.22 },
      { x: 0.75, y: 0.55 },
      { x: 0.78, y: 0.75 },
      { x: 0.50, y: 0.78 },
    ],
    color: { r: 20, g: 18, b: 22 },
    secondaryColor: { r: 45, g: 40, b: 48 },
  },
  facialHairEstimate: {
    hasBeard: false,
    hasMustache: false,
    hasGoatee: false,
    hasFullBeard: false,
    density: 'none',
    beardRegion: [],
    mustacheRegion: [],
    color: { r: 20, g: 18, b: 22 },
    beardShadowColor: { r: 15, g: 13, b: 17 },
  },
};

/**
 * Fixture 3: Heavy Full Mandibular Beard, Mustache, Square Face
 */
export const fullBeardMaleFixture: FaceAnalysis = {
  requestId: 'fixture-beard-male',
  totalLandmarksDetected: 478,
  consumedLandmarkCount: 478,
  faceShape: 'square',
  faceCenter: { x: 0.50, y: 0.48 },
  faceWidth: 0.40,
  faceHeight: 0.42,
  faceAngle: 0,
  imageWidth: 900,
  imageHeight: 1600,
  selectedFaceIndex: 0,
  totalFacesDetected: 1,
  analysisTimeMs: 20,
  features: createFixtureFeatures({ faceWidth: 0.40, faceHeight: 0.42, jawScale: 1.15 }),
  palette: {
    skinBase: { r: 240, g: 215, b: 195 },
    skinShadow: { r: 210, g: 185, b: 165 },
    skinShadowDeep: { r: 180, g: 155, b: 135 },
    skinHighlight: { r: 255, g: 235, b: 215 },
    skinToneWarmer: { r: 245, g: 205, b: 175 },
    hairPrimary: { r: 18, g: 16, b: 20 },
    hairSecondary: { r: 42, g: 38, b: 46 },
    eyeColor: { r: 55, g: 40, b: 30 },
    irisOuterRing: { r: 26, g: 20, b: 18 },
    lipColor: { r: 205, g: 130, b: 125 },
    lipShadow: { r: 165, g: 100, b: 95 },
    lipHighlight: { r: 225, g: 155, b: 150 },
    eyebrowColor: { r: 28, g: 26, b: 28 },
    beardColor: { r: 18, g: 16, b: 20 },
    beardShadowColor: { r: 12, g: 10, b: 14 },
    background: { r: 251, g: 245, b: 238 },
    neckShadow: { r: 175, g: 150, b: 130 },
    lightDirection: 'right',
  },
  hairEstimate: {
    detected: true,
    length: 'short',
    style: 'short',
    coverage: 'full',
    silhouettePoints: [
      { x: 0.28, y: 0.38 },
      { x: 0.32, y: 0.24 },
      { x: 0.50, y: 0.16 },
      { x: 0.68, y: 0.24 },
      { x: 0.72, y: 0.38 },
      { x: 0.68, y: 0.44 },
      { x: 0.32, y: 0.44 },
    ],
    color: { r: 18, g: 16, b: 20 },
    secondaryColor: { r: 42, g: 38, b: 46 },
  },
  facialHairEstimate: {
    hasBeard: true,
    hasMustache: true,
    hasGoatee: true,
    hasFullBeard: true,
    density: 'heavy',
    beardRegion: [
      { x: 0.30, y: 0.46 },
      { x: 0.34, y: 0.62 },
      { x: 0.50, y: 0.72 },
      { x: 0.66, y: 0.62 },
      { x: 0.70, y: 0.46 },
      { x: 0.62, y: 0.54 },
      { x: 0.54, y: 0.60 },
      { x: 0.46, y: 0.60 },
      { x: 0.38, y: 0.54 },
    ],
    mustacheRegion: [
      { x: 0.42, y: 0.54 },
      { x: 0.50, y: 0.52 },
      { x: 0.58, y: 0.54 },
      { x: 0.56, y: 0.57 },
      { x: 0.50, y: 0.56 },
      { x: 0.44, y: 0.57 },
    ],
    soulPatchRegion: [
      { x: 0.48, y: 0.61 },
      { x: 0.52, y: 0.61 },
      { x: 0.51, y: 0.65 },
      { x: 0.49, y: 0.65 },
    ],
    color: { r: 18, g: 16, b: 20 },
    beardShadowColor: { r: 12, g: 10, b: 14 },
  },
};

/**
 * Fixture 4: Open Smile with Visible Teeth Arch, Deep Melanin Tone, Round Face
 */
export const openSmileTeethFixture: FaceAnalysis = {
  requestId: 'fixture-smile-teeth',
  totalLandmarksDetected: 478,
  consumedLandmarkCount: 478,
  faceShape: 'round',
  faceCenter: { x: 0.50, y: 0.48 },
  faceWidth: 0.42,
  faceHeight: 0.42,
  faceAngle: 0,
  imageWidth: 900,
  imageHeight: 1600,
  selectedFaceIndex: 0,
  totalFacesDetected: 1,
  analysisTimeMs: 20,
  features: createFixtureFeatures({ faceWidth: 0.42, faceHeight: 0.42, isSmileOpen: true }),
  palette: {
    skinBase: { r: 165, g: 110, b: 85 },
    skinShadow: { r: 135, g: 85, b: 65 },
    skinShadowDeep: { r: 105, g: 65, b: 45 },
    skinHighlight: { r: 195, g: 140, b: 110 },
    skinToneWarmer: { r: 175, g: 115, b: 80 },
    hairPrimary: { r: 15, g: 15, b: 16 },
    hairSecondary: { r: 35, g: 35, b: 38 },
    eyeColor: { r: 40, g: 28, b: 22 },
    irisOuterRing: { r: 20, g: 14, b: 12 },
    lipColor: { r: 180, g: 95, b: 90 },
    lipShadow: { r: 140, g: 70, b: 65 },
    lipHighlight: { r: 205, g: 120, b: 115 },
    eyebrowColor: { r: 25, g: 25, b: 26 },
    beardColor: { r: 15, g: 15, b: 16 },
    beardShadowColor: { r: 10, g: 10, b: 12 },
    background: { r: 251, g: 245, b: 238 },
    neckShadow: { r: 115, g: 75, b: 55 },
    lightDirection: 'frontal',
  },
  hairEstimate: {
    detected: true,
    length: 'short',
    style: 'curly',
    coverage: 'full',
    silhouettePoints: [
      { x: 0.26, y: 0.40 },
      { x: 0.30, y: 0.22 },
      { x: 0.50, y: 0.14 },
      { x: 0.70, y: 0.22 },
      { x: 0.74, y: 0.40 },
      { x: 0.68, y: 0.45 },
      { x: 0.32, y: 0.45 },
    ],
    color: { r: 15, g: 15, b: 16 },
    secondaryColor: { r: 35, g: 35, b: 38 },
  },
  facialHairEstimate: {
    hasBeard: false,
    hasMustache: false,
    hasGoatee: false,
    hasFullBeard: false,
    density: 'none',
    beardRegion: [],
    mustacheRegion: [],
    color: { r: 15, g: 15, b: 16 },
    beardShadowColor: { r: 10, g: 10, b: 12 },
  },
};

/**
 * Fixture 5: Eyeglass Frames, Heart Shape, Wavy Hair
 */
export const wavyHairHeartShapeFixture: FaceAnalysis = {
  requestId: 'fixture-wavy-heart',
  totalLandmarksDetected: 478,
  consumedLandmarkCount: 478,
  faceShape: 'heart',
  faceCenter: { x: 0.50, y: 0.48 },
  faceWidth: 0.38,
  faceHeight: 0.44,
  faceAngle: 0,
  imageWidth: 900,
  imageHeight: 1600,
  selectedFaceIndex: 0,
  totalFacesDetected: 1,
  analysisTimeMs: 20,
  features: createFixtureFeatures({ faceWidth: 0.38, faceHeight: 0.44, jawScale: 0.85 }),
  palette: {
    skinBase: { r: 248, g: 226, b: 210 },
    skinShadow: { r: 225, g: 200, b: 180 },
    skinShadowDeep: { r: 198, g: 172, b: 152 },
    skinHighlight: { r: 255, g: 242, b: 230 },
    skinToneWarmer: { r: 252, g: 218, b: 192 },
    hairPrimary: { r: 42, g: 30, b: 24 },
    hairSecondary: { r: 75, g: 55, b: 42 },
    eyeColor: { r: 60, g: 45, b: 35 },
    irisOuterRing: { r: 30, g: 22, b: 18 },
    lipColor: { r: 218, g: 132, b: 126 },
    lipShadow: { r: 178, g: 98, b: 92 },
    lipHighlight: { r: 238, g: 158, b: 152 },
    eyebrowColor: { r: 45, g: 35, b: 28 },
    beardColor: { r: 42, g: 30, b: 24 },
    beardShadowColor: { r: 25, g: 18, b: 15 },
    background: { r: 251, g: 245, b: 238 },
    neckShadow: { r: 185, g: 158, b: 138 },
    lightDirection: 'left',
  },
  hairEstimate: {
    detected: true,
    length: 'medium',
    style: 'wavy',
    coverage: 'full',
    silhouettePoints: [
      { x: 0.28, y: 0.42 },
      { x: 0.29, y: 0.25 },
      { x: 0.50, y: 0.17 },
      { x: 0.71, y: 0.25 },
      { x: 0.72, y: 0.42 },
      { x: 0.66, y: 0.45 },
      { x: 0.34, y: 0.45 },
    ],
    color: { r: 42, g: 30, b: 24 },
    secondaryColor: { r: 75, g: 55, b: 42 },
  },
  facialHairEstimate: {
    hasBeard: false,
    hasMustache: false,
    hasGoatee: false,
    hasFullBeard: false,
    density: 'none',
    beardRegion: [],
    mustacheRegion: [],
    color: { r: 42, g: 30, b: 24 },
    beardShadowColor: { r: 25, g: 18, b: 15 },
  },
};

/**
 * Array of all baseline fixtures for automated regression testing
 */
export const ALL_BASELINE_FIXTURES: FaceAnalysis[] = [
  shortHairCleanShavenFixture,
  longHairFemaleFixture,
  fullBeardMaleFixture,
  openSmileTeethFixture,
  wavyHairHeartShapeFixture,
];
