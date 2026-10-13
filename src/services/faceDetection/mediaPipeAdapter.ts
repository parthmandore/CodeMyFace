import {
  FilesetResolver,
  FaceLandmarker,
} from '@mediapipe/tasks-vision';
import {
  DetectedFace,
  FaceDetectionConfig,
  FaceDetectionResult,
  FaceDetectionState,
  IFaceDetectionService,
  NormalizedLandmark,
} from './types';

// Default configuration endpoints for MediaPipe Face Landmarker
const DEFAULT_WASM_PATH =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.0/wasm';

const DEFAULT_MODEL_PATH =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class MediaPipeFaceDetectionAdapter implements IFaceDetectionService {
  private state: FaceDetectionState = 'uninitialized';
  private errorMessage: string | null = null;
  private landmarker: FaceLandmarker | null = null;
  private listeners: Set<(state: FaceDetectionState, error: string | null) => void> = new Set();
  private initPromise: Promise<boolean> | null = null;

  public getState(): FaceDetectionState {
    return this.state;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public subscribe(
    listener: (state: FaceDetectionState, error: string | null) => void
  ): () => void {
    this.listeners.add(listener);
    // Notify immediately of current state
    listener(this.state, this.errorMessage);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(state: FaceDetectionState, error: string | null = null): void {
    this.state = state;
    this.errorMessage = error;
    this.listeners.forEach((listener) => {
      try {
        listener(this.state, this.errorMessage);
      } catch (err) {
        console.error('Error in face detection state listener:', err);
      }
    });
  }

  public async initialize(config: FaceDetectionConfig = {}): Promise<boolean> {
    // If already initialized, return immediately
    if (this.state === 'ready' && this.landmarker) {
      return true;
    }

    // If an initialization is in flight, reuse it
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.doInitialize(config);
    try {
      const success = await this.initPromise;
      return success;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInitialize(config: FaceDetectionConfig): Promise<boolean> {
    this.setState('initializing', null);

    const wasmPath = config.wasmPath || DEFAULT_WASM_PATH;
    const modelAssetPath = config.modelAssetPath || DEFAULT_MODEL_PATH;
    const preferredDelegate = config.delegate || 'GPU';
    const maxFaces = config.maxFaces || 4;

    try {
      // 1. Resolve WASM vision fileset
      const vision = await FilesetResolver.forVisionTasks(wasmPath);

      // 2. Attempt to create FaceLandmarker with GPU delegate first
      let landmarkerInstance: FaceLandmarker | null = null;
      let lastErr: unknown = null;

      try {
        landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath,
            delegate: preferredDelegate,
          },
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
          runningMode: 'IMAGE',
          numFaces: maxFaces,
        });
      } catch (gpuError) {
        lastErr = gpuError;
        // Fallback to CPU delegate if GPU delegate is unavailable
        if (preferredDelegate === 'GPU') {
          try {
            landmarkerInstance = await FaceLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath,
                delegate: 'CPU',
              },
              outputFaceBlendshapes: false,
              outputFacialTransformationMatrixes: false,
              runningMode: 'IMAGE',
              numFaces: maxFaces,
            });
          } catch (cpuError) {
            lastErr = cpuError;
          }
        }
      }

      if (!landmarkerInstance) {
        throw lastErr || new Error('Failed to create FaceLandmarker instance');
      }

      this.landmarker = landmarkerInstance;
      this.setState('ready', null);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.landmarker = null;
      this.setState(
        'error',
        `Failed to initialize MediaPipe Face Landmarker: ${msg}. Check network connectivity to model and WASM assets.`
      );
      return false;
    }
  }

  public async detect(
    source: HTMLImageElement | ImageBitmap | HTMLCanvasElement
  ): Promise<FaceDetectionResult> {
    if (this.state !== 'ready' || !this.landmarker) {
      // Attempt lazy initialization if uninitialized
      if (this.state === 'uninitialized') {
        const initialized = await this.initialize();
        if (!initialized || !this.landmarker) {
          return {
            detected: false,
            faceCount: 0,
            errorMessage: this.errorMessage || 'Face detection engine is not initialized.',
            timestamp: Date.now(),
          };
        }
      } else {
        return {
          detected: false,
          faceCount: 0,
          errorMessage: this.errorMessage || 'Face detection engine is not ready.',
          timestamp: Date.now(),
        };
      }
    }

    const previousState = this.state;
    this.setState('detecting', null);
    const startTime = performance.now();

    try {
      const detectionResult = this.landmarker.detect(source);
      const latencyMs = Math.round(performance.now() - startTime);

      const rawLandmarks = detectionResult.faceLandmarks;
      if (!rawLandmarks || rawLandmarks.length === 0) {
        this.setState(previousState, null);
        return {
          detected: false,
          faceCount: 0,
          latencyMs,
          timestamp: Date.now(),
        };
      }

      const detectedFaces: (DetectedFace & { score: number })[] = rawLandmarks.map((facePts, idx) => {
        const lms: NormalizedLandmark[] = facePts.map((pt) => ({
          x: pt.x,
          y: pt.y,
          z: pt.z,
        }));

        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        for (const pt of lms) {
          if (pt.x < minX) minX = pt.x;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.y > maxY) maxY = pt.y;
        }

        const margin = 0.04;
        const bMinX = Math.max(0, minX - margin);
        const bMinY = Math.max(0, minY - margin);
        const bMaxX = Math.min(1, maxX + margin);
        const bMaxY = Math.min(1, maxY + margin);
        const width = bMaxX - bMinX;
        const height = bMaxY - bMinY;
        const area = width * height;
        const centerX = bMinX + width / 2;
        const centerY = bMinY + height / 2;
        const centerDistance = Math.hypot(centerX - 0.5, centerY - 0.5);

        // Deterministic score: large foreground faces near center score highest
        const score = area * 10 - centerDistance;

        return {
          index: idx,
          landmarks: lms,
          boundingBox: {
            xMin: bMinX,
            yMin: bMinY,
            width,
            height,
          },
          area,
          centerDistance,
          score,
        };
      });

      // Sort deterministically
      detectedFaces.sort((a, b) => b.score - a.score);
      const selectedFace = detectedFaces[0];

      const selectionMessage =
        rawLandmarks.length > 1
          ? `Detected ${rawLandmarks.length} faces. Selected primary foreground face #${selectedFace.index + 1} (${Math.round(selectedFace.area * 100)}% of frame).`
          : undefined;

      this.setState('ready', null);

      return {
        detected: true,
        faceCount: rawLandmarks.length,
        selectedFaceIndex: selectedFace.index,
        selectionMessage,
        allFaces: detectedFaces.map(({ index, landmarks, boundingBox, area, centerDistance }) => ({
          index,
          landmarks,
          boundingBox,
          area,
          centerDistance,
        })),
        landmarks: selectedFace.landmarks,
        boundingBox: selectedFace.boundingBox,
        latencyMs,
        timestamp: Date.now(),
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.setState('ready', null);
      return {
        detected: false,
        faceCount: 0,
        errorMessage: `Face landmark inference failed: ${msg}`,
        timestamp: Date.now(),
      };
    }
  }

  public dispose(): void {
    if (this.landmarker) {
      try {
        this.landmarker.close();
      } catch {
        // Ignored during shutdown
      }
      this.landmarker = null;
    }
    this.setState('uninitialized', null);
  }
}
