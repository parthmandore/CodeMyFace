/**
 * Interface contract and types for isolated face detection engine
 */

export type FaceDetectionState =
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'detecting'
  | 'error';

export interface NormalizedLandmark {
  x: number; // 0.0 to 1.0 (normalized relative to image width)
  y: number; // 0.0 to 1.0 (normalized relative to image height)
  z: number; // depth landmark
}

export interface BoundingBox {
  xMin: number; // normalized [0, 1]
  yMin: number; // normalized [0, 1]
  width: number; // normalized [0, 1]
  height: number; // normalized [0, 1]
}

export interface DetectedFace {
  index: number;
  landmarks: NormalizedLandmark[];
  boundingBox: BoundingBox;
  area: number;
  centerDistance: number;
}

export interface FaceDetectionResult {
  detected: boolean;
  faceCount: number;
  selectedFaceIndex?: number;
  selectionMessage?: string;
  allFaces?: DetectedFace[];
  landmarks?: NormalizedLandmark[];
  boundingBox?: BoundingBox;
  latencyMs?: number;
  errorMessage?: string;
  timestamp: number;
}

export interface FaceDetectionConfig {
  wasmPath?: string;
  modelAssetPath?: string;
  delegate?: 'GPU' | 'CPU';
  maxFaces?: number;
}

export interface IFaceDetectionService {
  /**
   * Initializes the face landmarker model and WASM runtime
   */
  initialize(config?: FaceDetectionConfig): Promise<boolean>;

  /**
   * Runs face landmark detection on an image element, bitmap, or canvas
   */
  detect(
    source: HTMLImageElement | ImageBitmap | HTMLCanvasElement
  ): Promise<FaceDetectionResult>;

  /**
   * Returns current service state
   */
  getState(): FaceDetectionState;

  /**
   * Returns current error message, if in error state
   */
  getErrorMessage(): string | null;

  /**
   * Releases WASM and model resources
   */
  dispose(): void;

  /**
   * Subscribes to service state changes
   */
  subscribe(
    listener: (state: FaceDetectionState, error: string | null) => void
  ): () => void;
}
