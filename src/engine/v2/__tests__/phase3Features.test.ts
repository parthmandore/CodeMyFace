import { describe, it, expect } from 'vitest';
import { Vec2 } from '../../../types/portrait';
import { FacialAnalysisResultV2 } from '../types';
import { extractImageEvidence } from '../imageEvidenceSampler';
import { reconstructFeatureGeometry } from '../featureGeometry';
import { buildPhase3Portrait } from '../phase3SvgRenderer';

describe('Engine V2 Phase 3: Facial Feature Reconstruction', () => {
  // Helper to build realistic mock landmarks
  function createMockAnalysis(options: {
    eyeTiltDeg?: number;
    mouthOpen?: boolean;
    oralLuminance?: number;
    hasCatchlight?: boolean;
  } = {}): FacialAnalysisResultV2 {
    const leftPupil: Vec2 = { x: 420, y: 440 };
    const rightPupil: Vec2 = { x: 580, y: 440 };

    const leftUpperLid: Vec2[] = [
      { x: 390, y: 440 },
      { x: 405, y: 430 },
      { x: 420, y: 428 },
      { x: 435, y: 432 },
      { x: 450, y: 440 },
    ];
    const leftLowerLid: Vec2[] = [
      { x: 390, y: 440 },
      { x: 405, y: 448 },
      { x: 420, y: 450 },
      { x: 435, y: 448 },
      { x: 450, y: 440 },
    ];

    const rightUpperLid: Vec2[] = [
      { x: 550, y: 440 },
      { x: 565, y: 432 },
      { x: 580, y: 428 },
      { x: 595, y: 430 },
      { x: 610, y: 440 + (options.eyeTiltDeg ? 4 : 0) },
    ];
    const rightLowerLid: Vec2[] = [
      { x: 550, y: 440 },
      { x: 565, y: 448 },
      { x: 580, y: 450 },
      { x: 595, y: 448 },
      { x: 610, y: 440 + (options.eyeTiltDeg ? 4 : 0) },
    ];

    const isSmileOpen = options.mouthOpen ?? false;
    const mouthGap = isSmileOpen ? 16 : 0;

    const upperLipOuter = [
      { x: 440, y: 640 },
      { x: 470, y: 628 }, // Cupid peak left
      { x: 500, y: 632 }, // Cupid trough
      { x: 530, y: 628 }, // Cupid peak right
      { x: 560, y: 640 },
    ];
    const upperLipInner = [
      { x: 440, y: 640 },
      { x: 470, y: 638 },
      { x: 500, y: 640 },
      { x: 530, y: 638 },
      { x: 560, y: 640 },
    ];
    const lowerLipInner = [
      { x: 440, y: 640 },
      { x: 470, y: 640 + mouthGap },
      { x: 500, y: 642 + mouthGap },
      { x: 530, y: 640 + mouthGap },
      { x: 560, y: 640 },
    ];
    const lowerLipOuter = [
      { x: 440, y: 640 },
      { x: 470, y: 658 + mouthGap },
      { x: 500, y: 662 + mouthGap },
      { x: 530, y: 658 + mouthGap },
      { x: 560, y: 640 },
    ];

    const mockLandmarks: any = {
      totalCount: 478,
      allPoints: Array.from({ length: 478 }, () => ({ x: 500, y: 500 })),
      faceOutline: { name: 'faceOutline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
      jawline: { name: 'jawline', points: [{ x: 350, y: 450 }, { x: 500, y: 700 }, { x: 650, y: 450 }], rawPoints: [], indices: [] },
      leftEye: {
        contour: { name: 'leftEye', points: [...leftUpperLid, ...leftLowerLid], rawPoints: [], indices: [] },
        upperLid: { name: 'leftEyeUpper', points: leftUpperLid, rawPoints: [], indices: [] },
        lowerLid: { name: 'leftEyeLower', points: leftLowerLid, rawPoints: [], indices: [] },
        pupil: leftPupil,
        irisRadius: 14.5,
        fissureWidth: 60,
        fissureHeight: 22,
      },
      rightEye: {
        contour: { name: 'rightEye', points: [...rightUpperLid, ...rightLowerLid], rawPoints: [], indices: [] },
        upperLid: { name: 'rightEyeUpper', points: rightUpperLid, rawPoints: [], indices: [] },
        lowerLid: { name: 'rightEyeLower', points: rightLowerLid, rawPoints: [], indices: [] },
        pupil: rightPupil,
        irisRadius: 15.0,
        fissureWidth: 60,
        fissureHeight: 22,
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
        upperLipOuter: { name: 'upperLipOuter', points: upperLipOuter, rawPoints: [], indices: [] },
        upperLipInner: { name: 'upperLipInner', points: upperLipInner, rawPoints: [], indices: [] },
        lowerLipOuter: { name: 'lowerLipOuter', points: lowerLipOuter, rawPoints: [], indices: [] },
        lowerLipInner: { name: 'lowerLipInner', points: lowerLipInner, rawPoints: [], indices: [] },
        commissureLeft: { x: 440, y: 640 },
        commissureRight: { x: 560, y: 640 },
        center: { x: 500, y: 640 },
        isSmileOpen,
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

    return {
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
        rawMask: new Uint8Array(100 * 100).fill(1), // hair
        categories: {
          hair: { categoryId: 1, name: 'hair', pixelCount: 2000, ratioOfTotal: 0.20 },
          faceSkin: { categoryId: 3, name: 'faceSkin', pixelCount: 3000, ratioOfTotal: 0.30 },
        } as any,
        investigation: {
          bangsCoveringForehead: false,
          longHairDetected: false,
          hairExtendingBelowEars: false,
          darkClothingMistakenForHairRisk: false,
          facialHairDetected: false,
          glassesDetected: false,
          lowContrastBackgroundRisk: false,
          identifiedWeaknesses: [],
        } as any,
      } as any,
      telemetry: { faceDetectionMs: 10, normalizationMs: 1, segmentationMs: 10, totalMs: 21 },
    };
  }

  describe('Part A — Eyes Geometry Reconstruction', () => {
    it('reconstructs anatomical eyes with separate sclera, iris, pupil, and canthi', () => {
      const analysis = createMockAnalysis();
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.leftEye.scleraPath).toContain('M ');
      expect(features.leftEye.scleraPath).toContain(' Z');
      expect(features.leftEye.upperEyelidPath).toContain('M ');
      expect(features.leftEye.lowerEyelidPath).toContain('M ');

      // Iris & pupil proportioned naturally
      expect(features.leftEye.iris.r).toBeCloseTo(14.5, 1);
      expect(features.leftEye.pupil.r).toBeCloseTo(14.5 * 0.42, 1);

      // Canthi identified
      expect(features.leftEye.innerCanthus.x).toBeGreaterThan(features.leftEye.outerCanthus.x);
      expect(features.rightEye.innerCanthus.x).toBeLessThan(features.rightEye.outerCanthus.x);
    });

    it('strictly omits catchlight when no bright evidence exists in source', () => {
      const analysis = createMockAnalysis({ hasCatchlight: false });
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.leftEye.catchlight).toBeNull();
      expect(features.rightEye.catchlight).toBeNull();

      const portrait = buildPhase3Portrait('test-no-catchlight', analysis, null);
      // Verify complete SVG does not contain fake specular circle
      expect(portrait.completeSvg).not.toContain('r="2.466"');
      expect(portrait.completeSvg).not.toContain('r="2.52"');
    });

    it('preserves eye asymmetry and fissure tilt angles', () => {
      const analysis = createMockAnalysis({ eyeTiltDeg: 5 });
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.proportions.eyeAsymmetry).toBeDefined();
      expect(features.rightEye.metrics.tiltAngleDegrees).not.toBe(features.leftEye.metrics.tiltAngleDegrees);
    });
  });

  describe('Part B — Eyebrows Reconstruction', () => {
    it('preserves eyebrow thickness, arch curvature, and head-to-tail taper', () => {
      const analysis = createMockAnalysis();
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.leftEyebrow.path).toContain('M ');
      expect(features.leftEyebrow.path).toContain(' Z');
      expect(features.leftEyebrow.metrics.thickness).toBeGreaterThan(6);
      expect(features.leftEyebrow.metrics.archElevation).toBeGreaterThan(0);
      expect(features.leftEyebrow.head).toBeDefined();
      expect(features.leftEyebrow.tail).toBeDefined();
    });
  });

  describe('Part C — Nose Reconstruction', () => {
    it('reconstructs bridge, pronasion tip, alar wings, and soft anatomical nostrils', () => {
      const analysis = createMockAnalysis();
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.nose.bridgePath).toContain('M ');
      expect(features.nose.tipPath).toContain('M ');
      expect(features.nose.leftNostrilPath).toContain('M ');
      expect(features.nose.rightNostrilPath).toContain('M ');

      // Nostril color is anatomical shadow tone, never pure black
      expect(features.nose.nostrilColor).not.toBe('#000000');
      expect(features.nose.metrics.alarWidth).toBeCloseTo(60, 1);
    });
  });

  describe('Part D — Mouth Reconstruction', () => {
    it('preserves Cupid bow and parting line for closed mouth with zero teeth', () => {
      const analysis = createMockAnalysis({ mouthOpen: false });
      const evidence = extractImageEvidence(null, { x: 420, y: 440 }, 14.5, { x: 580, y: 440 }, 15.0, { x: 500, y: 640 }, false, 0, [], [], [], []);
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.mouth.upperLipPath).toContain('M ');
      expect(features.mouth.lowerLipPath).toContain('M ');
      expect(features.mouth.partingLinePath).toContain('M ');

      // Closed mouth must have NO teeth
      expect(features.mouth.teethPath).toBeNull();
      expect(features.mouth.metrics.hasTeeth).toBe(false);
      expect(features.mouth.metrics.isSmileOpen).toBe(false);
    });

    it('renders dental arc only when oral cavity has bright evidence', () => {
      const analysis = createMockAnalysis({ mouthOpen: true });
      const evidence: any = {
        leftCatchlight: null,
        rightCatchlight: null,
        mouthEvidence: { isOpen: true, hasTeeth: true, meanOralLuminance: 165 },
        leftEyebrowColor: '#2b2323',
        rightEyebrowColor: '#2b2323',
        vermilionColor: '#be746d',
        nostrilColor: '#5c3527',
      };
      const features = reconstructFeatureGeometry(analysis, evidence);

      expect(features.mouth.teethPath).not.toBeNull();
      expect(features.mouth.teethPath).toContain('M ');
      expect(features.mouth.metrics.hasTeeth).toBe(true);
    });
  });

  describe('Part E & F — Proportions and Debug Output', () => {
    it('maintains common coordinate proportions and emits all 4 required SVGs', () => {
      const analysis = createMockAnalysis();
      const portrait = buildPhase3Portrait('dev-test', analysis, null);

      expect(portrait.faceOnlySvg).toContain('<svg');
      expect(portrait.completeSvg).toContain('<svg');
      expect(portrait.debugSvg).toContain('<svg');
      expect(portrait.featureDebugSvg).toContain('<svg');

      // Verify Output 4 contains feature debug elements
      expect(portrait.featureDebugSvg).toContain('Feature Debug Overlay');
      expect(portrait.featureDebugSvg).toContain('Eyes:');
      expect(portrait.featureDebugSvg).toContain('Cupid');
    });
  });
});
