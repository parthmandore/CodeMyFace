/**
 * CodeMyFace Engine V2 — Phase 1: Canonical Image Frame & Isotropic Normalization
 *
 * Implements Part A:
 * 1. Corrects image orientation and geometry
 * 2. Detects available faces and selects the most appropriate face
 * 3. Gracefully handles photos with no detectable face
 * 4. Uses eye landmarks to estimate face roll angle
 * 5. Normalizes orientation without distorting facial proportions (strict isotropic similarity transform)
 * 6. Establishes a consistent face coordinate system
 * 7. Enforces target face width of ~300 logical units in canonical frame
 * 8. Preserves ample surrounding space for hair, ears, neck, and shoulders
 * 9. Avoids clipping long hair or voluminous hairstyles
 * 10. Records invertible transformation between source coordinates and canonical coordinates
 */

import { Vec2 } from '../../types/portrait';
import { NormalizedLandmark, FaceDetectionResult, DetectedFace } from '../../services/faceDetection/types';
import {
  CanonicalImageFrame,
  CoordinateTransform2D,
  FaceBoundsPx,
  ImageDimensions,
  AffineMatrix2D,
} from './types';
import * as LM from '../landmarkIndices';

export const CANONICAL_CANVAS_WIDTH = 1000;
export const CANONICAL_CANVAS_HEIGHT = 1000;
export const TARGET_FACE_WIDTH = 300;
export const CANONICAL_FACE_CENTER_X = 500;
export const CANONICAL_FACE_CENTER_Y = 480;

/**
 * Computes bounding box of points in physical pixel coordinates
 */
export function computePhysicalBounds(points: Vec2[], imgDim: ImageDimensions): FaceBoundsPx {
  if (points.length === 0) {
    return {
      minX: 0,
      maxX: imgDim.width,
      minY: 0,
      maxY: imgDim.height,
      width: imgDim.width,
      height: imgDim.height,
      centerX: imgDim.width / 2,
      centerY: imgDim.height / 2,
    };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    const px = pt.x * imgDim.width;
    const py = pt.y * imgDim.height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  return {
    minX,
    maxX,
    minY,
    maxY,
    width,
    height,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

/**
 * Selects the most appropriate face from multiple detections based on
 * area dominance and proximity to image center.
 */
export function selectBestFace(detectionResult: FaceDetectionResult): {
  face: DetectedFace | null;
  landmarks: NormalizedLandmark[];
  index: number;
} {
  if (!detectionResult.detected || !detectionResult.landmarks || detectionResult.landmarks.length === 0) {
    return { face: null, landmarks: [], index: -1 };
  }

  if (detectionResult.allFaces && detectionResult.allFaces.length > 0) {
    // If multiple faces, rank by composite score: 70% area, 30% center proximity
    let bestFace = detectionResult.allFaces[0];
    let bestScore = -Infinity;
    let bestIndex = 0;

    for (let i = 0; i < detectionResult.allFaces.length; i++) {
      const f = detectionResult.allFaces[i];
      const areaScore = f.area;
      const centerScore = 1.0 - Math.min(1.0, f.centerDistance * 1.4);
      const compositeScore = areaScore * 0.70 + centerScore * 0.30;

      if (compositeScore > bestScore) {
        bestScore = compositeScore;
        bestFace = f;
        bestIndex = i;
      }
    }

    return {
      face: bestFace,
      landmarks: bestFace.landmarks || detectionResult.landmarks,
      index: bestIndex,
    };
  }

  return {
    face: null,
    landmarks: detectionResult.landmarks,
    index: 0,
  };
}

/**
 * Estimates facial roll angle in radians using bilateral eye landmarks (pupils and eye canthi).
 * Positive angle indicates clockwise tilt; negative indicates counter-clockwise tilt.
 */
export function estimateFaceRoll(
  landmarks: NormalizedLandmark[],
  imgDim: ImageDimensions
): { rollRadians: number; rollDegrees: number } {
  if (!landmarks || landmarks.length < 468) {
    return { rollRadians: 0, rollDegrees: 0 };
  }

  // Primary: Iris centers if available (indices 468 and 473)
  const leftPupil = landmarks[LM.LEFT_IRIS_CENTER];
  const rightPupil = landmarks[LM.RIGHT_IRIS_CENTER];

  // Secondary: Outer eye corners (indices 33 and 263)
  const leftCanthus = landmarks[33];
  const rightCanthus = landmarks[263];

  let pLeft = leftPupil || leftCanthus;
  let pRight = rightPupil || rightCanthus;

  if (!pLeft || !pRight) {
    return { rollRadians: 0, rollDegrees: 0 };
  }

  // Physical pixel coordinates
  const lx = pLeft.x * imgDim.width;
  const ly = pLeft.y * imgDim.height;
  const rx = pRight.x * imgDim.width;
  const ry = pRight.y * imgDim.height;

  const dx = rx - lx;
  const dy = ry - ly;

  const rollRadians = Math.atan2(dy, dx);
  const rollDegrees = (rollRadians * 180) / Math.PI;

  return { rollRadians, rollDegrees };
}

/**
 * Calculates isotropic coordinate transformation between physical source image pixels
 * and the canonical 1000x1000 logical artboard space.
 *
 * Implements strict isotropic similarity:
 * Canonical = Translate(500, 480) * Scale(S) * Rotate(-Roll) * Translate(-cx, -cy)
 */
export function buildCoordinateTransform(
  landmarks: NormalizedLandmark[],
  imgDim: ImageDimensions,
  targetFaceWidth: number = TARGET_FACE_WIDTH
): CoordinateTransform2D {
  const { rollRadians, rollDegrees } = estimateFaceRoll(landmarks, imgDim);

  // Measure skull/facial bounds in physical pixels
  // Filter landmarks strictly to cranial/facial skull anchors (excluding hair)
  const reliablePoints: Vec2[] = [];
  const skullIndices = [
    LM.FOREHEAD_TOP,
    LM.CHIN_TIP,
    LM.TEMPLE_LEFT,
    LM.TEMPLE_RIGHT,
    LM.LEFT_PREAURICULAR_ANCHOR,
    LM.RIGHT_PREAURICULAR_ANCHOR,
    ...LM.JAWLINE,
  ];

  for (const idx of skullIndices) {
    if (idx >= 0 && idx < landmarks.length) {
      reliablePoints.push(landmarks[idx]);
    }
  }

  const sourceFaceBoundsPx = computePhysicalBounds(
    reliablePoints.length > 0 ? reliablePoints : landmarks,
    imgDim
  );

  // Temple-to-temple physical width (or zygomatic width)
  const templeL = landmarks[LM.TEMPLE_LEFT] || { x: 0.35, y: 0.38, z: 0 };
  const templeR = landmarks[LM.TEMPLE_RIGHT] || { x: 0.65, y: 0.38, z: 0 };
  const templeDx = (templeR.x - templeL.x) * imgDim.width;
  const templeDy = (templeR.y - templeL.y) * imgDim.height;
  const measuredFaceWidthPx = Math.max(20, Math.sqrt(templeDx * templeDx + templeDy * templeDy));

  // Isotropic scale: ensures exactly `targetFaceWidth` (~300 units) in canonical coordinates
  const scale = targetFaceWidth / measuredFaceWidthPx;

  // Rotation center: mid-point between eyes & nose root (glabella region)
  const cx = sourceFaceBoundsPx.centerX;
  const cy = sourceFaceBoundsPx.centerY;

  // Canonical placement
  const targetX = CANONICAL_FACE_CENTER_X;
  const targetY = CANONICAL_FACE_CENTER_Y;

  // Forward affine matrix components:
  // Rotation angle applied is -rollRadians to level the face horizontally
  const cosTheta = Math.cos(-rollRadians);
  const sinTheta = Math.sin(-rollRadians);

  const a = scale * cosTheta;
  const b = scale * sinTheta;
  const c = -scale * sinTheta;
  const d = scale * cosTheta;
  const tx = targetX - (a * cx + c * cy);
  const ty = targetY - (b * cx + d * cy);

  const matrix: AffineMatrix2D = { a, b, c, d, tx, ty };

  // Inverse affine matrix:
  const det = a * d - b * c;
  const invA = d / det;
  const invB = -b / det;
  const invC = -c / det;
  const invD = a / det;
  const invTx = (c * ty - d * tx) / det;
  const invTy = (b * tx - a * ty) / det;

  const inverseMatrix: AffineMatrix2D = {
    a: invA,
    b: invB,
    c: invC,
    d: invD,
    tx: invTx,
    ty: invTy,
  };

  const sourcePxToCanonical = (p: Vec2): Vec2 => ({
    x: a * p.x + c * p.y + tx,
    y: b * p.x + d * p.y + ty,
  });

  const canonicalToSourcePx = (p: Vec2): Vec2 => ({
    x: invA * p.x + invC * p.y + invTx,
    y: invB * p.x + invD * p.y + invTy,
  });

  const normalizedSourceToCanonical = (p: Vec2): Vec2 => {
    const px = p.x * imgDim.width;
    const py = p.y * imgDim.height;
    return sourcePxToCanonical({ x: px, y: py });
  };

  const canonicalToNormalizedSource = (p: Vec2): Vec2 => {
    const srcPx = canonicalToSourcePx(p);
    return {
      x: srcPx.x / Math.max(1, imgDim.width),
      y: srcPx.y / Math.max(1, imgDim.height),
    };
  };

  // Canonical bounds
  const canonicalFaceBounds: FaceBoundsPx = {
    minX: targetX - targetFaceWidth / 2,
    maxX: targetX + targetFaceWidth / 2,
    minY: targetY - (sourceFaceBoundsPx.height * scale) / 2,
    maxY: targetY + (sourceFaceBoundsPx.height * scale) / 2,
    width: targetFaceWidth,
    height: sourceFaceBoundsPx.height * scale,
    centerX: targetX,
    centerY: targetY,
  };

  return {
    sourcePxToCanonical,
    canonicalToSourcePx,
    normalizedSourceToCanonical,
    canonicalToNormalizedSource,
    matrix,
    inverseMatrix,
    faceRollRadians: rollRadians,
    faceRollDegrees: Math.round(rollDegrees * 100) / 100,
    scale,
    targetFaceWidth,
    sourceFaceWidthPx: Math.round(measuredFaceWidthPx * 10) / 10,
    sourceFaceBoundsPx,
    canonicalFaceBounds,
  };
}

/**
 * Creates canonical image frame metadata
 */
export function createCanonicalFrame(
  targetFaceWidth: number = TARGET_FACE_WIDTH
): CanonicalImageFrame {
  return {
    width: CANONICAL_CANVAS_WIDTH,
    height: CANONICAL_CANVAS_HEIGHT,
    targetFaceWidth,
    faceCenter: { x: CANONICAL_FACE_CENTER_X, y: CANONICAL_FACE_CENTER_Y },
    margins: {
      top: 240,    // Plenty of headroom for high updos / voluminous curls
      bottom: 280, // Neck and shoulders margin
      left: 350,   // Side volume and wide hairstyles
      right: 350,
    },
  };
}
