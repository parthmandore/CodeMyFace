import { useState, useEffect, useCallback } from 'react';
import { MediaPipeFaceDetectionAdapter } from './mediaPipeAdapter';
import {
  FaceDetectionConfig,
  FaceDetectionResult,
  FaceDetectionState,
  IFaceDetectionService,
} from './types';

// Global singleton instance for the browser session
export const faceDetectionService: IFaceDetectionService = new MediaPipeFaceDetectionAdapter();

export function useFaceDetection(autoInit: boolean = false) {
  const [state, setState] = useState<FaceDetectionState>(faceDetectionService.getState());
  const [errorMessage, setErrorMessage] = useState<string | null>(
    faceDetectionService.getErrorMessage()
  );

  useEffect(() => {
    const unsubscribe = faceDetectionService.subscribe((newState, err) => {
      setState(newState);
      setErrorMessage(err);
    });

    if (autoInit && faceDetectionService.getState() === 'uninitialized') {
      faceDetectionService.initialize();
    }

    return () => {
      unsubscribe();
    };
  }, [autoInit]);

  const initialize = useCallback((config?: FaceDetectionConfig) => {
    return faceDetectionService.initialize(config);
  }, []);

  const detect = useCallback(
    (source: HTMLImageElement | ImageBitmap | HTMLCanvasElement): Promise<FaceDetectionResult> => {
      return faceDetectionService.detect(source);
    },
    []
  );

  return {
    state,
    errorMessage,
    isReady: state === 'ready',
    isInitializing: state === 'initializing',
    isDetecting: state === 'detecting',
    isError: state === 'error',
    initialize,
    detect,
  };
}

export * from './types';
