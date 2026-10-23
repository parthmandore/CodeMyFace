import { describe, it, expect } from 'vitest';
import { Vec2 } from '../../../types/portrait';
import { PROGRESSIVE_STAGES, ProgressiveDataState } from '../phase5Types';
import { buildProgressiveSvg } from '../progressiveSvgGenerator';
import { FacialAnalysisResultV2 } from '../types';
import { V2Palette, SkinShadingPlanes, FacialHairDetectionResult } from '../phase4Types';

describe('Engine V2 Phase 5: Progressive SVG Construction', () => {
  // Helper to construct complete mock data state
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
      sourceImage: { dimensions: { width: 1000, height: 1000 }, aspectRatio: 1 },
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
        categories: {} as any,
        investigation: {} as any,
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
        metrics: { length: 90, thickness: 12, archElevation: 15, tiltAngleDegrees: -5, distanceToEye: 35 },
      },
      nose: {
        bridgePath: 'M 500 460 L 500 535',
        tipPath: 'M 490 535 Q 500 540 510 535',
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
      proportions: {
        interpupillaryDistance: 160,
        intercanthalDistance: 100,
        eyeSpacingRatio: 1.0,
        eyeAsymmetry: { widthDifference: 0, heightDifference: 0, tiltDifference: 0 },
        eyebrowAsymmetry: { thicknessDifference: 0, archDifference: 0, heightDifference: 0 },
        mouthAsymmetry: { commissureHeightDifference: 0, smileCantDegrees: 0 },
      },
    };

    const palette: V2Palette = {
      skinBase: { color: { r: 215, g: 170, b: 150 }, hex: '#d7aa96', lab: { L: 0.77, a: 0.04, b: 0.04 } },
      skinShadow: { color: { r: 160, g: 120, b: 100 }, hex: '#a07864', lab: { L: 0.60, a: 0.04, b: 0.04 } },
      skinHighlight: { color: { r: 225, g: 185, b: 165 }, hex: '#e1b9a5', lab: { L: 0.82, a: 0.03, b: 0.03 } },
      hairBase: { color: { r: 80, g: 50, b: 30 }, hex: '#50321e', lab: { L: 0.35, a: 0.03, b: 0.04 } },
      hairShadow: { color: { r: 50, g: 30, b: 15 }, hex: '#321e0f', lab: { L: 0.22, a: 0.02, b: 0.03 } },
      hairHighlight: { color: { r: 120, g: 80, b: 50 }, hex: '#785032', lab: { L: 0.48, a: 0.04, b: 0.05 } },
      iris: { color: { r: 40, g: 40, b: 40 }, hex: '#282828', lab: { L: 0.25, a: 0, b: 0 } },
      eyebrows: { color: { r: 70, g: 50, b: 40 }, hex: '#463228', lab: { L: 0.32, a: 0.02, b: 0.02 } },
      lips: { color: { r: 185, g: 110, b: 100 }, hex: '#b96e64', lab: { L: 0.61, a: 0.06, b: 0.04 } },
      nostrilShadow: { color: { r: 90, g: 60, b: 50 }, hex: '#5a3c32', lab: { L: 0.38, a: 0.03, b: 0.03 } },
      clothing: { color: { r: 230, g: 235, b: 240 }, hex: '#e6ebf0', lab: { L: 0.94, a: -0.01, b: -0.01 } },
      background: { color: { r: 245, g: 248, b: 250 }, hex: '#f5f8fa', lab: { L: 0.98, a: 0, b: 0 } },
    };

    const facialHair: FacialHairDetectionResult = {
      detected: false,
      mode: 'auto',
      confidence: 0.1,
      style: 'none',
      mustachePath: null,
      beardPath: null,
      color: palette.hairBase,
      metrics: { upperLipContrast: 0.1, chinContrast: 0.1, jawContrast: 0.05 },
    };

    const shading: SkinShadingPlanes = {
      jawNeckShadowPath: 'M 420 680 C 460 720, 540 720, 580 680 L 580 730 C 540 760, 460 760, 420 730 Z',
      cheekShadowPath: 'M 350 450 C 370 520, 370 600, 380 650 C 360 610, 350 540, 350 450 Z',
      noseSideShadowPath: null,
      foreheadHighlightPath: 'M 450 320 C 500 310, 550 310, 550 350 C 500 360, 450 360, 450 320 Z',
      cheekHighlightPath: null,
    };

    return {
      photoId: 'test-progressive',
      analysis,
      face,
      hair,
      features,
      palette,
      facialHair,
      lighting: 'right',
      shading,
      beautification: { brightnessBoost: 0, warmth: 0, vibrance: 1.0 },
    };
  }

  describe('Part A — Render Stages Definition', () => {
    it('defines exactly 6 sequential stages with step numbers 1 to 6', () => {
      expect(PROGRESSIVE_STAGES.length).toBe(6);
      expect(PROGRESSIVE_STAGES.map(s => s.stepNumber)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(PROGRESSIVE_STAGES.map(s => s.id)).toEqual([
        'image-analysis',
        'face-geometry',
        'hair-geometry',
        'facial-features',
        'colour-regions',
        'final-assembled',
      ]);
    });

    it('each stage has descriptive metadata and valid badge texts', () => {
      for (const s of PROGRESSIVE_STAGES) {
        expect(s.name.length).toBeGreaterThan(5);
        expect(s.shortName.length).toBeGreaterThan(2);
        expect(s.description.length).toBeGreaterThan(15);
        expect(s.badgeText.length).toBeGreaterThan(5);
      }
    });
  });

  describe('Part B — Progressive SVG Generation & Determinism', () => {
    it('produces valid SVG strings for every stage without syntax errors', () => {
      const data = createMockProgressiveData();
      for (const stage of PROGRESSIVE_STAGES) {
        const { svg, code } = buildProgressiveSvg(stage.id, data);
        expect(svg).toContain('<svg');
        expect(svg).toContain('viewBox="0 0 1000 1000"');
        expect(svg).toContain('</svg>');
        expect(code).toBe(svg);
      }
    });

    it('Stage 1 renders calibration frame and background without features', () => {
      const data = createMockProgressiveData();
      const { svg } = buildProgressiveSvg('image-analysis', data);

      expect(svg).toContain('id="bg"');
      expect(svg).toContain('id="calibration-frame"');
      expect(svg).not.toContain('id="face-silhouette"');
      expect(svg).not.toContain('id="sclera-left"');
    });

    it('Stage 2 renders face silhouette, neck, and ears without hair or facial features', () => {
      const data = createMockProgressiveData();
      const { svg } = buildProgressiveSvg('face-geometry', data);

      expect(svg).toContain('id="face-silhouette"');
      expect(svg).toContain('id="neck"');
      expect(svg).toContain('id="ear-left"');
      expect(svg).not.toContain('id="hair-back"');
      expect(svg).not.toContain('id="sclera-left"');
    });

    it('Stage 3 introduces hair silhouette without facial features', () => {
      const data = createMockProgressiveData();
      const { svg } = buildProgressiveSvg('hair-geometry', data);

      expect(svg).toContain('id="hair-back"');
      expect(svg).toContain('id="face-silhouette"');
      expect(svg).not.toContain('id="sclera-left"');
      expect(svg).not.toContain('id="upper-lip"');
    });

    it('Stage 4 introduces complete facial features (eyes, brows, nose, mouth)', () => {
      const data = createMockProgressiveData();
      const { svg } = buildProgressiveSvg('facial-features', data);

      expect(svg).toContain('id="sclera-left"');
      expect(svg).toContain('id="iris-left"');
      expect(svg).toContain('id="eyebrow-left"');
      expect(svg).toContain('id="nostril-left"');
      expect(svg).toContain('id="upper-lip"');
    });

    it('Stage 5 & 6 apply OKLab colors, planar shadows, and clip paths', () => {
      const data = createMockProgressiveData();
      const { svg: s5 } = buildProgressiveSvg('colour-regions', data);
      const { svg: s6 } = buildProgressiveSvg('final-assembled', data);

      expect(s5).toContain('fill="#d7aa96"'); // skinBase
      expect(s5).toContain('clip-path="url(#clip-face)"');
      expect(s5).toContain('id="neck-shadow"');

      // Stage 6 has all visual layers present in Stage 5
      expect(s6).toContain('id="neck-shadow"');
      expect(s6).toContain('clip-path="url(#clip-face)"');
      expect(s6).toContain('id="face-silhouette"');
      expect(s6).toContain('Stage: final-assembled');
    });

    it('guarantees deterministic, identical rendering on repeated invocations', () => {
      const data = createMockProgressiveData();
      const renderA = buildProgressiveSvg('final-assembled', data).svg;
      const renderB = buildProgressiveSvg('final-assembled', data).svg;
      expect(renderA).toBe(renderB);
    });
  });

  describe('Part C — Truthful Live Code View', () => {
    it('shows truthful pending comments for incomplete stages rather than fabricated code', () => {
      const data = createMockProgressiveData();

      const stage1 = buildProgressiveSvg('image-analysis', data);
      expect(stage1.code).toContain('<!-- [Pending Stage 2: Face & Structural Contour] -->');
      expect(stage1.code).toContain('<!-- [Pending Stage 4: Anatomical Facial Features] -->');

      const stage2 = buildProgressiveSvg('face-geometry', data);
      expect(stage2.code).not.toContain('<!-- [Pending Stage 2:');
      expect(stage2.code).toContain('<!-- [Pending Stage 3: Hair Silhouette & Cranial Volume] -->');

      const stage4 = buildProgressiveSvg('facial-features', data);
      expect(stage4.code).toContain('<!-- [Pending Stage 5: OKLab Palettes & Planar Shading] -->');

      const stage6 = buildProgressiveSvg('final-assembled', data);
      expect(stage6.code).not.toContain('<!-- [Pending');
    });
  });
});
