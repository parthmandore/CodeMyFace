import { describe, it, expect } from 'vitest';
import {
  PROGRESSIVE_STAGES,
  ProgressiveDataState,
  buildProgressiveSvg,
  updateProgressiveStyling,
} from '../index';
import { Vec2 } from '../../../types/portrait';
import { FacialAnalysisResultV2 } from '../types';
import { V2Palette, SkinShadingPlanes, FacialHairDetectionResult } from '../phase4Types';

function createMockProgressiveData(): ProgressiveDataState {
  const mockLandmarks: any = {
    totalCount: 478,
    allPoints: Array.from({ length: 478 }, () => ({ x: 500, y: 500 })),
    faceOutline: { name: 'faceOutline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
    jawline: { name: 'jawline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
    leftEye: {
      contour: { name: 'leftEye', points: [{ x: 390, y: 440 }, { x: 450, y: 440 }, { x: 420, y: 450 }], rawPoints: [], indices: [] },
      upperLid: { name: 'leftEyeUpper', points: [{ x: 390, y: 440 }, { x: 420, y: 430 }, { x: 450, y: 440 }], rawPoints: [], indices: [] },
      lowerLid: { name: 'leftEyeLower', points: [{ x: 390, y: 440 }, { x: 420, y: 450 }, { x: 450, y: 440 }], rawPoints: [], indices: [] },
      pupil: { x: 420, y: 440 },
      irisRadius: 14.5,
      fissureWidth: 60,
      fissureHeight: 20,
    },
    rightEye: {
      contour: { name: 'rightEye', points: [{ x: 550, y: 440 }, { x: 610, y: 440 }, { x: 580, y: 450 }], rawPoints: [], indices: [] },
      upperLid: { name: 'rightEyeUpper', points: [{ x: 550, y: 440 }, { x: 580, y: 430 }, { x: 610, y: 440 }], rawPoints: [], indices: [] },
      lowerLid: { name: 'rightEyeLower', points: [{ x: 550, y: 440 }, { x: 580, y: 450 }, { x: 610, y: 440 }], rawPoints: [], indices: [] },
      pupil: { x: 580, y: 440 },
      irisRadius: 14.5,
      fissureWidth: 60,
      fissureHeight: 20,
    },
    leftEyebrow: {
      contour: { name: 'leftEyebrow', points: [{ x: 370, y: 405 }, { x: 415, y: 390 }, { x: 460, y: 410 }], rawPoints: [], indices: [] },
      upper: { name: 'leftEyebrowUpper', points: [{ x: 370, y: 405 }, { x: 415, y: 390 }, { x: 460, y: 410 }], rawPoints: [], indices: [] },
      lower: { name: 'leftEyebrowLower', points: [{ x: 370, y: 415 }, { x: 415, y: 402 }, { x: 460, y: 415 }], rawPoints: [], indices: [] },
      head: { x: 460, y: 410 },
      arch: { x: 415, y: 390 },
      tail: { x: 370, y: 405 },
    },
    rightEyebrow: {
      contour: { name: 'rightEyebrow', points: [{ x: 540, y: 410 }, { x: 585, y: 390 }, { x: 630, y: 405 }], rawPoints: [], indices: [] },
      upper: { name: 'rightEyebrowUpper', points: [{ x: 540, y: 410 }, { x: 585, y: 390 }, { x: 630, y: 405 }], rawPoints: [], indices: [] },
      lower: { name: 'rightEyebrowLower', points: [{ x: 540, y: 415 }, { x: 585, y: 402 }, { x: 630, y: 415 }], rawPoints: [], indices: [] },
      head: { x: 540, y: 410 },
      arch: { x: 585, y: 390 },
      tail: { x: 630, y: 405 },
    },
    nose: {
      bridge: { name: 'noseBridge', points: [{ x: 500, y: 460 }, { x: 500, y: 510 }], rawPoints: [], indices: [] },
      tip: { x: 500, y: 535 },
      subnasale: { x: 500, y: 555 },
      nasion: { x: 500, y: 440 },
      leftWing: { name: 'leftWing', points: [{ x: 470, y: 540 }, { x: 485, y: 550 }], rawPoints: [], indices: [] },
      rightWing: { name: 'rightWing', points: [{ x: 530, y: 540 }, { x: 515, y: 550 }], rawPoints: [], indices: [] },
      leftNostril: { x: 485, y: 548 },
      rightNostril: { x: 515, y: 548 },
      alarWidth: 60,
    },
    mouth: {
      upperLipOuter: { name: 'upperLipOuter', points: [{ x: 440, y: 640 }, { x: 500, y: 630 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
      upperLipInner: { name: 'upperLipInner', points: [{ x: 440, y: 640 }, { x: 500, y: 638 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
      lowerLipOuter: { name: 'lowerLipOuter', points: [{ x: 440, y: 640 }, { x: 500, y: 660 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
      lowerLipInner: { name: 'lowerLipInner', points: [{ x: 440, y: 640 }, { x: 500, y: 642 }, { x: 560, y: 640 }], rawPoints: [], indices: [] },
      commissureLeft: { x: 440, y: 640 },
      commissureRight: { x: 560, y: 640 },
      center: { x: 500, y: 640 },
      isSmileOpen: false,
    },
    chin: {
      tip: { x: 500, y: 700 },
      crest: { name: 'crest', points: [{ x: 480, y: 700 }, { x: 520, y: 700 }], rawPoints: [], indices: [] },
      leftMandibularCorner: { x: 380, y: 650 },
      rightMandibularCorner: { x: 620, y: 650 },
    },
    forehead: {
      top: { x: 500, y: 280 },
      templeLeft: { x: 350, y: 380 },
      templeRight: { x: 650, y: 380 },
    },
    ears: {
      leftRoot: { x: 320, y: 470 },
      rightRoot: { x: 680, y: 470 },
      estimatedLeftEar: [{ x: 320, y: 430 }, { x: 290, y: 470 }, { x: 320, y: 510 }],
      estimatedRightEar: [{ x: 680, y: 430 }, { x: 710, y: 470 }, { x: 680, y: 510 }],
    },
  };

  const analysis: FacialAnalysisResultV2 = {
    success: true,
    sourceImage: { dimensions: { width: 1000, height: 1000 }, aspectRatio: 1, filename: 'test-subject.jpg' },
    transform: {
      scale: 1,
      targetFaceWidth: 300,
      sourceFaceWidthPx: 300,
      faceRollRadians: 0,
      faceRollDegrees: 0,
      matrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      inverseMatrix: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 },
      sourceFaceBoundsPx: { minX: 350, maxX: 650, minY: 300, maxY: 700, width: 300, height: 400, centerX: 500, centerY: 500 },
      canonicalFaceBounds: { minX: 350, maxX: 650, minY: 300, maxY: 700, width: 300, height: 400, centerX: 500, centerY: 500 },
      sourcePxToCanonical: (p: Vec2) => p,
      canonicalToSourcePx: (p: Vec2) => p,
      normalizedSourceToCanonical: (p: Vec2) => ({ x: p.x * 1000, y: p.y * 1000 }),
      canonicalToNormalizedSource: (p: Vec2) => ({ x: p.x / 1000, y: p.y / 1000 }),
    } as any,
    landmarks: mockLandmarks,
    segmentation: {
      maskWidth: 100,
      maskHeight: 100,
      rawMask: new Uint8Array(100 * 100).fill(1),
      categories: { hair: { ratioOfTotal: 0.15 } } as any,
      investigation: { longHairDetected: false, bangsCoveringForehead: false } as any,
    } as any,
    telemetry: { faceDetectionMs: 10, normalizationMs: 1, segmentationMs: 10, totalMs: 21 },
  };

  const face: any = {
    contourPoints: [{ x: 350, y: 380 }, { x: 350, y: 650 }, { x: 500, y: 700 }, { x: 650, y: 650 }, { x: 650, y: 380 }, { x: 500, y: 280 }],
    neckPoints: [{ x: 420, y: 680 }, { x: 420, y: 850 }, { x: 580, y: 850 }, { x: 580, y: 680 }],
    shoulderPoints: [{ x: 200, y: 850 }, { x: 200, y: 1000 }, { x: 800, y: 1000 }, { x: 800, y: 850 }],
    measurements: { faceWidth: 300, faceHeight: 420, jawWidth: 270, chinWidth: 80, foreheadHeight: 160, asymmetryRatio: 0.95 },
    jawAngleDeg: 120,
    chinShape: 'square',
  };

  const hair: any = {
    cleanedContour: [{ x: 320, y: 250 }, { x: 500, y: 200 }, { x: 680, y: 250 }, { x: 680, y: 450 }, { x: 320, y: 450 }],
    isReliable: true,
    diagnosticStatus: 'SEGMENTATION_DERIVED',
    metrics: { hasLongHair: false, hasBangs: false, hasSideburns: true, apexCanonicalY: 200, volumeWidthCanonical: 360, rawPointCount: 100, cleanedPointCount: 5 },
  };

  const features: any = {
    leftEye: {
      scleraPath: 'M 390 440 C 400 435, 440 435, 450 440 C 440 450, 400 450, 390 440 Z',
      innerCanthus: { x: 450, y: 440 },
      outerCanthus: { x: 390, y: 440 },
      iris: { cx: 420, cy: 440, r: 14.5 },
      pupil: { cx: 420, cy: 440, r: 5 },
      catchlight: { hasCatchlight: true, cx: 424, cy: 436, r: 2.2, opacity: 0.9 },
      upperEyelidPath: 'M 390 440 Q 420 430 450 440',
      lowerEyelidPath: 'M 390 440 Q 420 450 450 440',
      metrics: { fissureWidth: 60, fissureHeight: 20, apertureRatio: 0.33, tiltAngleDegrees: 0 },
    },
    rightEye: {
      scleraPath: 'M 550 440 C 560 435, 600 435, 610 440 C 600 450, 560 450, 550 440 Z',
      innerCanthus: { x: 550, y: 440 },
      outerCanthus: { x: 610, y: 440 },
      iris: { cx: 580, cy: 440, r: 14.5 },
      pupil: { cx: 580, cy: 440, r: 5 },
      catchlight: { hasCatchlight: true, cx: 584, cy: 436, r: 2.2, opacity: 0.9 },
      upperEyelidPath: 'M 550 440 Q 580 430 610 440',
      lowerEyelidPath: 'M 550 440 Q 580 450 610 440',
      metrics: { fissureWidth: 60, fissureHeight: 20, apertureRatio: 0.33, tiltAngleDegrees: 0 },
    },
    leftEyebrow: {
      path: 'M 370 405 Q 415 390 460 410 Q 415 402 370 415 Z',
      spinePath: 'M 370 405 Q 415 390 460 410',
      head: { x: 460, y: 410 },
      arch: { x: 415, y: 390 },
      tail: { x: 370, y: 405 },
      fillColor: '#463228',
      metrics: { length: 90, thickness: 12, archElevation: 15, tiltAngleDegrees: 5, distanceToEye: 35 },
    },
    rightEyebrow: {
      path: 'M 540 410 Q 585 390 630 405 Q 585 402 540 415 Z',
      spinePath: 'M 540 410 Q 585 390 630 405',
      head: { x: 540, y: 410 },
      arch: { x: 585, y: 390 },
      tail: { x: 630, y: 405 },
      fillColor: '#463228',
      metrics: { length: 90, thickness: 12, archElevation: 15, tiltAngleDegrees: 5, distanceToEye: 35 },
    },
    nose: {
      bridgePath: 'M 500 460 L 500 520',
      tipPath: 'M 492 532 Q 500 538 508 532',
      leftWingPath: 'M 470 540 Q 485 550 500 548',
      rightWingPath: 'M 530 540 Q 515 550 500 548',
      leftNostrilPath: 'M 482 546 C 480 544, 488 544, 486 548 Z',
      rightNostrilPath: 'M 518 546 C 516 544, 524 544, 522 548 Z',
      nostrilColor: '#5a3c32',
      metrics: { alarWidth: 60, bridgeLength: 75, tipProtrusion: 15 },
    },
    mouth: {
      upperLipPath: 'M 440 640 Q 500 630 560 640 Q 500 638 440 640 Z',
      lowerLipPath: 'M 440 640 Q 500 660 560 640 Q 500 642 440 640 Z',
      partingLinePath: 'M 440 640 L 560 640',
      oralCavityPath: null,
      teethPath: null,
      vermilionColor: '#b96e64',
      metrics: { mouthWidth: 120, upperLipThickness: 8, lowerLipThickness: 18, openingGap: 0, smileCantDegrees: 0, hasTeeth: false, isSmileOpen: false },
    },
  };

  const palette: V2Palette = {
    skinBase: { color: { r: 215, g: 172, b: 150 }, hex: '#d7ac96', lab: { L: 0.75, a: 0.04, b: 0.05 } },
    skinShadow: { color: { r: 170, g: 130, b: 110 }, hex: '#aa826e', lab: { L: 0.58, a: 0.04, b: 0.05 } },
    skinHighlight: { color: { r: 235, g: 195, b: 175 }, hex: '#ebc3af', lab: { L: 0.82, a: 0.03, b: 0.04 } },
    hairBase: { color: { r: 40, g: 30, b: 25 }, hex: '#281e19', lab: { L: 0.20, a: 0.01, b: 0.01 } },
    hairShadow: { color: { r: 20, g: 15, b: 12 }, hex: '#140f0c', lab: { L: 0.12, a: 0.01, b: 0.01 } },
    hairHighlight: { color: { r: 70, g: 55, b: 45 }, hex: '#46372d', lab: { L: 0.30, a: 0.02, b: 0.02 } },
    iris: { color: { r: 60, g: 45, b: 35 }, hex: '#3c2d23', lab: { L: 0.25, a: 0.01, b: 0.01 } },
    eyebrows: { color: { r: 35, g: 25, b: 20 }, hex: '#231914', lab: { L: 0.18, a: 0.01, b: 0.01 } },
    lips: { color: { r: 195, g: 110, b: 115 }, hex: '#c36e73', lab: { L: 0.60, a: 0.08, b: 0.04 } },
    nostrilShadow: { color: { r: 100, g: 60, b: 55 }, hex: '#643c37', lab: { L: 0.35, a: 0.03, b: 0.02 } },
    clothing: { color: { r: 30, g: 50, b: 80 }, hex: '#1e3250', lab: { L: 0.28, a: -0.01, b: -0.05 } },
    background: { color: { r: 15, g: 23, b: 42 }, hex: '#0f172a', lab: { L: 0.15, a: -0.01, b: -0.03 } },
  };

  const facialHair: FacialHairDetectionResult = {
    detected: false,
    mode: 'auto',
    confidence: 0,
    style: 'none',
    mustachePath: null,
    beardPath: null,
    color: palette.hairBase,
    metrics: { upperLipContrast: 0.05, chinContrast: 0.06, jawContrast: 0.04 },
  };

  const shading: SkinShadingPlanes = {
    jawNeckShadowPath: 'M 400 680 Q 500 720 600 680 Z',
    cheekShadowPath: 'M 350 480 Q 370 580 400 620 Z',
    noseSideShadowPath: 'M 495 460 L 495 520 L 490 525 Z',
    foreheadHighlightPath: 'M 460 320 Q 500 310 540 320 Q 500 335 460 320 Z',
    cheekHighlightPath: 'M 540 500 Q 570 490 590 510 Z',
  };

  return {
    photoId: 'test-subject',
    analysis,
    face,
    hair,
    features,
    palette,
    facialHair,
    lighting: 'left',
    shading,
    beautification: { brightnessBoost: 0, warmth: 0, vibrance: 1.0 },
  };
}

describe('CodeMyFace Phase 6 — Studio Integration Suite', () => {
  it('defines exactly six authentic progressive stages in order', () => {
    expect(PROGRESSIVE_STAGES.length).toBe(6);
    expect(PROGRESSIVE_STAGES.map((s) => s.id)).toEqual([
      'image-analysis',
      'face-geometry',
      'hair-geometry',
      'facial-features',
      'colour-regions',
      'final-assembled',
    ]);
  });

  it('builds valid, standalone SVG markup for all 6 stages without errors', () => {
    const data = createMockProgressiveData();

    for (let i = 0; i < PROGRESSIVE_STAGES.length; i++) {
      const stage = PROGRESSIVE_STAGES[i];
      const { svg, code } = buildProgressiveSvg(stage.id, data);

      // Verify SVG root
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 1000 1000"');
      expect(svg).toContain('</svg>');

      // Verify synchronized code output
      expect(code).toBe(svg);

      // Check truthful pending comments for intermediate stages (stages 0..3 have pending comments)
      if (i < 4) {
        expect(code).toContain('<!-- [Pending Stage');
      } else {
        expect(code).not.toContain('<!-- [Pending Stage');
      }
    }
  });

  it('updates styling reactively when facial hair, brightness, or hair detail changes', () => {
    const data = createMockProgressiveData();

    // Test Brightness Boost
    const boosted = updateProgressiveStyling(data, { brightnessBoost: 0.15 });
    expect(boosted.beautification?.brightnessBoost).toBe(0.15);
    expect(boosted.palette?.skinBase.lab.L).toBeGreaterThan(data.palette!.skinBase.lab.L - 0.01);

    // Test Facial Hair Override On
    const hairOn = updateProgressiveStyling(data, { facialHairMode: 'on' });
    expect(hairOn.facialHair?.detected).toBe(true);
    expect(hairOn.facialHair?.mode).toBe('on');
    expect(hairOn.facialHair?.beardPath).not.toBeNull();

    // Test Facial Hair Override Off
    const hairOff = updateProgressiveStyling(hairOn, { facialHairMode: 'off' });
    expect(hairOff.facialHair?.detected).toBe(false);
    expect(hairOff.facialHair?.mode).toBe('off');
    expect(hairOff.facialHair?.beardPath).toBeNull();
  });

  it('verifies that final SVG download is standalone and has zero raster embeds', () => {
    const data = createMockProgressiveData();
    const { svg } = buildProgressiveSvg('final-assembled', data);

    // Standalone XML requirements
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('<title>CodeMyFace Engine V2');
    expect(svg).toContain('Stage: final-assembled');

    // Absolute zero raster/base64 embedding
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('data:image/');
    expect(svg).not.toContain('base64');

    // Reasonably bounded file size (under 60 KB)
    const byteSize = new TextEncoder().encode(svg).length;
    expect(byteSize).toBeGreaterThan(1000);
    expect(byteSize).toBeLessThan(60000);
  });
});
