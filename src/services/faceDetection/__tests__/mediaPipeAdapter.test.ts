import { describe, it, expect } from 'vitest';
import { MediaPipeFaceDetectionAdapter } from '../mediaPipeAdapter';

describe('MediaPipeFaceDetectionAdapter', () => {
  it('starts in uninitialized state with no error message', () => {
    const adapter = new MediaPipeFaceDetectionAdapter();
    expect(adapter.getState()).toBe('uninitialized');
    expect(adapter.getErrorMessage()).toBeNull();
  });

  it('notifies subscribers of state changes', () => {
    const adapter = new MediaPipeFaceDetectionAdapter();
    const observedStates: string[] = [];

    const unsubscribe = adapter.subscribe((state) => {
      observedStates.push(state);
    });

    expect(observedStates).toContain('uninitialized');
    adapter.dispose();
    unsubscribe();
  });

  it('handles initialization failure gracefully without crashing', async () => {
    const adapter = new MediaPipeFaceDetectionAdapter();

    // Pass invalid paths that will fail network resolution in test environment
    const success = await adapter.initialize({
      wasmPath: 'https://invalid-non-existent-domain.localhost/wasm',
      modelAssetPath: 'https://invalid-non-existent-domain.localhost/model.task',
    });

    expect(success).toBe(false);
    expect(adapter.getState()).toBe('error');
    expect(adapter.getErrorMessage()).toBeTruthy();
    expect(adapter.getErrorMessage()).toContain('Failed to initialize MediaPipe Face Landmarker');
  });

  it('detect returns clean error if uninitialized and engine fails to load', async () => {
    const adapter = new MediaPipeFaceDetectionAdapter();
    // Simulate detecting without engine ready
    const dummyCanvas = {} as HTMLCanvasElement;
    const result = await adapter.detect(dummyCanvas);

    expect(result.detected).toBe(false);
    expect(result.faceCount).toBe(0);
  });
});
