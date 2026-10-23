/**
 * CodeMyFace Engine V2 — Phase 4: Evidence-Based Facial Hair Detector
 *
 * Implements Part D:
 * - Evidence-based detection comparing lower-face zones against reference skin
 * - Disentangles beards from dark skin, neck shadows, and scalp hair
 * - Supports explicit modes: 'auto' (default), 'off', 'on'
 * - Conservative thresholds: avoids fabricating heavy beards when evidence is uncertain
 * - Generates smooth anatomical mustache and chin beard paths anchored to real landmarks
 */

import { Color, Vec2 } from '../../types/portrait';
import { FacialAnalysisResultV2 } from './types';
import { FacialHairMode, FacialHairDetectionResult, FacialHairStyle, ColorWithHex } from './phase4Types';
import { rgbToOklab } from './oklab';

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function getPixel(imgData: ImageData, x: number, y: number): Color {
  const ix = clamp(Math.round(x), 0, imgData.width - 1);
  const iy = clamp(Math.round(y), 0, imgData.height - 1);
  const idx = (iy * imgData.width + ix) * 4;
  return {
    r: imgData.data[idx],
    g: imgData.data[idx + 1],
    b: imgData.data[idx + 2],
  };
}

function meanLightness(imgData: ImageData | null, points: Vec2[]): number {
  if (!imgData || points.length === 0) return 0.5;
  let sumL = 0;
  for (const p of points) {
    const c = getPixel(imgData, p.x, p.y);
    sumL += rgbToOklab(c).L;
  }
  return sumL / points.length;
}

function sampleRegionL(imgData: ImageData | null, center: Vec2, radius: number = 8): number {
  if (!imgData) return 0.5;
  const pts: Vec2[] = [center];
  for (let r = 3; r <= radius; r += 3) {
    pts.push(
      { x: center.x - r, y: center.y },
      { x: center.x + r, y: center.y },
      { x: center.x, y: center.y - r },
      { x: center.x, y: center.y + r }
    );
  }
  return meanLightness(imgData, pts);
}

function pointsToSmoothClosedPath(pts: Vec2[], tension: number = 0.18): string {
  if (!pts || pts.length < 3) return '';
  const n = pts.length;
  let d = `M ${Math.round(pts[0].x * 10) / 10} ${Math.round(pts[0].y * 10) / 10}`;

  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${Math.round(cp1x * 10) / 10} ${Math.round(cp1y * 10) / 10}, ${Math.round(cp2x * 10) / 10} ${Math.round(cp2y * 10) / 10}, ${Math.round(p2.x * 10) / 10} ${Math.round(p2.y * 10) / 10}`;
  }
  return `${d} Z`;
}

export function detectFacialHair(
  normCanvas: HTMLCanvasElement | null,
  analysis: FacialAnalysisResultV2,
  hairBaseColor: ColorWithHex,
  mode: FacialHairMode = 'auto',
  skinBaseColor?: ColorWithHex
): FacialHairDetectionResult {
  const defaultEmpty: FacialHairDetectionResult = {
    detected: false,
    mode,
    confidence: 0,
    style: 'none',
    mustachePath: null,
    beardPath: null,
    color: hairBaseColor,
    metrics: { upperLipContrast: 0, chinContrast: 0, jawContrast: 0 },
  };

  if (mode === 'off') {
    return defaultEmpty;
  }

  let imgData: ImageData | null = null;
  if (normCanvas) {
    try {
      const ctx = normCanvas.getContext('2d');
      if (ctx) imgData = ctx.getImageData(0, 0, normCanvas.width, normCanvas.height);
    } catch (_) {
      imgData = null;
    }
  }

  const lm = analysis.landmarks;
  if (!lm) return defaultEmpty;

  // Multiclass segmentation class helper (if available)
  const seg = analysis.segmentation;
  const getSegClass = (pt: Vec2): number | undefined => {
    if (!seg?.rawMask || !seg.maskWidth || !seg.maskHeight || !analysis.transform) return undefined;
    // Map canonical pt to normalized source, then to mask coords
    const norm = analysis.transform.canonicalToNormalizedSource(pt);
    const px = Math.max(0, Math.min(seg.maskWidth - 1, Math.round(norm.x * seg.maskWidth)));
    const py = Math.max(0, Math.min(seg.maskHeight - 1, Math.round(norm.y * seg.maskHeight)));
    return seg.rawMask[py * seg.maskWidth + px];
  };

  const hairLum = hairBaseColor.lab.L;

  // 1. Safe reference skin sampling on medial cheeks and lower forehead (free of facial hair and specular glints)
  const leftCheekRefPt: Vec2 = {
    x: lm.forehead.templeLeft.x * 0.55 + lm.nose.tip.x * 0.45,
    y: (lm.leftEye.pupil.y + lm.nose.tip.y) / 2,
  };
  const rightCheekRefPt: Vec2 = {
    x: lm.forehead.templeRight.x * 0.55 + lm.nose.tip.x * 0.45,
    y: (lm.rightEye.pupil.y + lm.nose.tip.y) / 2,
  };
  const lowerForeheadRefPt: Vec2 = {
    x: 500,
    y: lm.forehead.top.y + 40,
  };

  const leftCheekL = sampleRegionL(imgData, leftCheekRefPt, 10);
  const rightCheekL = sampleRegionL(imgData, rightCheekRefPt, 10);
  const foreheadL = sampleRegionL(imgData, lowerForeheadRefPt, 10);
  const localSkinRefL = (leftCheekL + rightCheekL + foreheadL) / 3;

  const rawSkinBaseL = skinBaseColor ? skinBaseColor.lab.L : localSkinRefL;
  const effectiveSkinL = Math.max(localSkinRefL, rawSkinBaseL * 0.88);

  // 2. Mustache / Philtrum Analysis with Subnasal Cast Shadow Rejection
  const subnasale = lm.nose.subnasale;
  const upperLipTopY = lm.mouth.upperLipOuter.points[5]?.y || (subnasale.y + 28);
  const mustacheMidY = (subnasale.y + upperLipTopY) / 2;
  const mouthWidth = Math.max(40, lm.mouth.commissureRight.x - lm.mouth.commissureLeft.x);

  const philtrumCenterPt: Vec2 = { x: lm.mouth.center.x, y: mustacheMidY };
  const philtrumLeftPt: Vec2 = { x: lm.mouth.center.x - mouthWidth * 0.22, y: mustacheMidY };
  const philtrumRightPt: Vec2 = { x: lm.mouth.center.x + mouthWidth * 0.22, y: mustacheMidY };

  const centerL = sampleRegionL(imgData, philtrumCenterPt, 6);
  const leftWingL = sampleRegionL(imgData, philtrumLeftPt, 6);
  const rightWingL = sampleRegionL(imgData, philtrumRightPt, 6);
  const mustacheAvgL = (centerL + leftWingL + rightWingL) / 3;

  // Lateral upper lip skin reference (clean skin directly lateral to philtrum columns)
  const lateralLipLeftPt: Vec2 = { x: lm.mouth.commissureLeft.x * 0.70 + lm.mouth.center.x * 0.30, y: mustacheMidY };
  const lateralLipRightPt: Vec2 = { x: lm.mouth.commissureRight.x * 0.70 + lm.mouth.center.x * 0.30, y: mustacheMidY };
  const lateralLipAvgL = (sampleRegionL(imgData, lateralLipLeftPt, 6) + sampleRegionL(imgData, lateralLipRightPt, 6)) / 2;

  const mustacheLocalContrast = lateralLipAvgL - mustacheAvgL;
  const mustacheGlobalContrast = effectiveSkinL - mustacheAvgL;

  // Subnasal Cast Shadow Rejection:
  // Under overhead lighting, the septum/columella casts a shadow directly at philtrumCenterPt.
  // In a clean-shaven face with a nose shadow, centerL is dark, BUT bilateral wings are bright skin!
  const isSubnasalNoseShadow =
    centerL < lateralLipAvgL - 0.10 &&
    leftWingL >= lateralLipAvgL - 0.05 &&
    rightWingL >= lateralLipAvgL - 0.05;

  const isPhiltrumSkinSeg = getSegClass(philtrumCenterPt) === 2; // Class 2: Face skin
  const isPhiltrumHairSeg = getSegClass(philtrumCenterPt) === 1; // Class 1: Hair

  const hasMustache =
    !isSubnasalNoseShadow &&
    (isPhiltrumHairSeg || !isPhiltrumSkinSeg || mustacheAvgL <= 0.25) &&
    mustacheLocalContrast > 0.12 &&
    mustacheGlobalContrast > 0.16 &&
    mustacheAvgL <= 0.32 &&
    leftWingL <= 0.36 &&
    rightWingL <= 0.36 &&
    Math.abs(mustacheAvgL - hairLum) < 0.25;

  // 3. Goatee / Chin Analysis with Lower Lip Crease Shadow Rejection
  const lowerLipBottomY = lm.mouth.lowerLipOuter.points[5]?.y || (lm.mouth.center.y + 18);
  const chinTip = lm.chin.tip;

  // Mental groove (depression directly below lower lip, where lower-lip shadow falls)
  const mentalGroovePt: Vec2 = {
    x: lm.mouth.center.x,
    y: lowerLipBottomY + (chinTip.y - lowerLipBottomY) * 0.28,
  };
  // Chin bulb (forward-facing bulb of chin, facing light on clean-shaven subjects)
  const chinBulbPt: Vec2 = {
    x: chinTip.x,
    y: chinTip.y - 12,
  };
  const chinBulbLeftPt: Vec2 = {
    x: chinTip.x - 25,
    y: chinTip.y - 12,
  };
  const chinBulbRightPt: Vec2 = {
    x: chinTip.x + 25,
    y: chinTip.y - 12,
  };

  const grooveL = sampleRegionL(imgData, mentalGroovePt, 6);
  const bulbL = sampleRegionL(imgData, chinBulbPt, 8);
  const bulbLeftL = sampleRegionL(imgData, chinBulbLeftPt, 8);
  const bulbRightL = sampleRegionL(imgData, chinBulbRightPt, 8);
  const chinBulbAvgL = (bulbL + bulbLeftL + bulbRightL) / 3;
  const chinBulbContrast = effectiveSkinL - chinBulbAvgL;

  // Lower Lip Shadow Rejection:
  // On a clean-shaven face under overhead light, grooveL is dark (lip shadow),
  // but bulbL is bright forward-facing skin!
  const isLowerLipCreaseShadow =
    grooveL < effectiveSkinL - 0.10 &&
    bulbL >= effectiveSkinL - 0.07;

  const isChinSkinSeg = getSegClass(chinBulbPt) === 2;
  const isChinHairSeg = getSegClass(chinBulbPt) === 1;

  const hasGoatee =
    !isLowerLipCreaseShadow &&
    (isChinHairSeg || !isChinSkinSeg || chinBulbAvgL <= 0.26) &&
    chinBulbContrast > 0.15 &&
    chinBulbAvgL <= 0.33 &&
    bulbL <= 0.35 &&
    Math.abs(chinBulbAvgL - hairLum) < 0.25;

  // 4. Jawline / Mandibular Beard Analysis
  const jawLeftPt: Vec2 = {
    x: (lm.chin.leftMandibularCorner.x + chinTip.x) / 2,
    y: (lm.chin.leftMandibularCorner.y + chinTip.y) / 2,
  };
  const jawRightPt: Vec2 = {
    x: (lm.chin.rightMandibularCorner.x + chinTip.x) / 2,
    y: (lm.chin.rightMandibularCorner.y + chinTip.y) / 2,
  };
  // Sample inner jaw plane (inward toward nose) vs neck (outward)
  const innerJawLeftL = sampleRegionL(imgData, { x: jawLeftPt.x * 0.88 + lm.nose.tip.x * 0.12, y: jawLeftPt.y * 0.88 + lm.nose.tip.y * 0.12 }, 8);
  const innerJawRightL = sampleRegionL(imgData, { x: jawRightPt.x * 0.88 + lm.nose.tip.x * 0.12, y: jawRightPt.y * 0.88 + lm.nose.tip.y * 0.12 }, 8);
  const jawAvgL = (innerJawLeftL + innerJawRightL) / 2;
  const jawContrast = effectiveSkinL - jawAvgL;

  // Directional Shadow Rejection: If one side of jaw is dark but other is bright skin, it's angled light!
  const isDirectionalShadow = Math.abs(innerJawLeftL - innerJawRightL) > 0.15;

  const hasJawBeard =
    !isDirectionalShadow &&
    jawContrast > 0.18 &&
    jawAvgL <= 0.32 &&
    innerJawLeftL <= 0.36 &&
    innerJawRightL <= 0.36 &&
    Math.abs(jawAvgL - hairLum) < 0.25;

  console.log(`[detectFacialHair] effectiveSkinL=${effectiveSkinL.toFixed(3)}, hairLum=${hairLum.toFixed(3)}, mustacheAvgL=${mustacheAvgL.toFixed(3)} (contrast=${mustacheGlobalContrast.toFixed(2)}, isSubnasalShadow=${isSubnasalNoseShadow}), chinBulbAvgL=${chinBulbAvgL.toFixed(3)} (contrast=${chinBulbContrast.toFixed(2)}, isLowerLipShadow=${isLowerLipCreaseShadow}), jawAvgL=${jawAvgL.toFixed(3)} (contrast=${jawContrast.toFixed(2)})`);

  let detected = (hasMustache || hasGoatee || hasJawBeard);
  let style: FacialHairStyle = 'none';

  if (mode === 'on') {
    detected = true;
    style = 'goatee';
  } else if (detected) {
    if (hasMustache && (hasGoatee || hasJawBeard)) {
      style = hasJawBeard ? 'full_beard' : 'goatee';
    } else if (hasGoatee) {
      style = 'goatee';
    } else if (hasMustache) {
      style = 'mustache';
    } else {
      style = 'goatee';
    }
  }

  let mustachePath: string | null = null;
  let beardPath: string | null = null;

  // Build anatomical mustache polygon strictly when detected
  if (detected && (style === 'mustache' || style === 'goatee' || style === 'full_beard')) {
    const mw = Math.min(65, mouthWidth * 0.90);
    const subnasaleX = subnasale.x;
    const subnasaleY = subnasale.y;
    const mustachePoly: Vec2[] = [
      { x: subnasaleX - mw * 0.42, y: upperLipTopY - 2 },
      { x: subnasaleX - mw * 0.20, y: subnasaleY + 4 },
      { x: subnasaleX, y: subnasaleY + 7 },
      { x: subnasaleX + mw * 0.20, y: subnasaleY + 4 },
      { x: subnasaleX + mw * 0.42, y: upperLipTopY - 2 },
      { x: subnasaleX + mw * 0.25, y: upperLipTopY + 1 },
      { x: subnasaleX, y: upperLipTopY - 1 },
      { x: subnasaleX - mw * 0.25, y: upperLipTopY + 1 },
    ];
    mustachePath = pointsToSmoothClosedPath(mustachePoly, 0.18);
  }

  // Build anatomical chin beard polygon strictly when detected
  if (detected && (style === 'goatee' || style === 'full_beard')) {
    const cw = Math.min(75, mouthWidth * 1.05);
    const chinCenterX = chinTip.x;
    const chinTipY = chinTip.y;
    const chinPoly: Vec2[] = [
      { x: chinCenterX - cw * 0.42, y: lowerLipBottomY + 12 },
      { x: chinCenterX, y: lowerLipBottomY + 16 },
      { x: chinCenterX + cw * 0.42, y: lowerLipBottomY + 12 },
      { x: chinCenterX + cw * 0.48, y: chinTipY - 6 },
      { x: chinCenterX + cw * 0.32, y: chinTipY + 4 },
      { x: chinCenterX, y: chinTipY + 8 },
      { x: chinCenterX - cw * 0.32, y: chinTipY + 4 },
      { x: chinCenterX - cw * 0.48, y: chinTipY - 6 },
    ];
    beardPath = pointsToSmoothClosedPath(chinPoly, 0.18);
  }

  const upperLipContrast = Math.max(0, mustacheGlobalContrast);
  const chinContrast = Math.max(0, chinBulbContrast);
  const confidence = Math.round(Math.max(upperLipContrast, chinContrast, jawContrast) * 100) / 100;

  return {
    detected,
    mode,
    confidence: detected ? confidence : 0,
    style,
    mustachePath,
    beardPath,
    color: hairBaseColor,
    metrics: {
      upperLipContrast: Math.round(upperLipContrast * 100) / 100,
      chinContrast: Math.round(chinContrast * 100) / 100,
      jawContrast: Math.round(jawContrast * 100) / 100,
    },
  };
}

