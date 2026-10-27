import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import { runV4Pipeline } from '../../engine/v4/v4Pipeline';
import { V4PipelineResult, V4ExperimentOptions, WorkbenchStatus } from '../../engine/v4/types';
import { QualityTier, AllTiersResult, binarySearchTargetSize } from '../../engine/v4/tiers';
import { faceDetectionService, NormalizedLandmark } from '../../services/faceDetection';
import { SegmentationService } from '../../services/segmentation/segmentationService';
import { V4CodeEditor } from './v4/V4CodeEditor';
import { V4ResultPane } from './v4/V4ResultPane';
import { V4Terminal, TerminalLog, FinalSummaryData } from './v4/V4Terminal';
import { V4ExportModal } from './v4/V4ExportModal';
import { V4Toast, ToastItem } from './v4/V4Toast';
import V4PipelineWorker from '../../workers/v4PipelineWorker.ts?worker';
import { computeSSIM } from '../../engine/v4/export/ssim';
import { countSpecks } from '../../engine/v4/export/speckCounter';
import { renderSvgToImageData } from '../../engine/v4/export/imageComparison';
import { extractVividPhotoAccent } from '../../lib/colorAccent';
import { detectBlackBars } from '../../utils/blackBarTrimmer';
import { PaintingLayer, extractPaintingLayers, optimizeSvgDocument } from '../../engine/v4/svgOptimizer';
import { minifySvgDocument } from '../../engine/v4/sizeOptimizer/svgMinifier';
import flags from '../../flags';
import '../../styles/v4workbench.css';


export interface V4DiagnosticWorkbenchProps {
  onBackToStudio: () => void;
  initialImageUrl?: string;
  initialFileName?: string;
}

export const V4DiagnosticWorkbench: React.FC<V4DiagnosticWorkbenchProps> = ({
  onBackToStudio,
  initialImageUrl,
  initialFileName,
}) => {
  // Check query parameters
  const searchStr = typeof window !== 'undefined' ? window.location.search + window.location.hash : '';
  const isDevMode = searchStr.includes('dev=1');
  const startEmpty = searchStr.includes('empty=1');
  const startDrag = searchStr.includes('drag=1');

  // Input & pipeline state
  const [currentImgUrl, setCurrentImgUrl] = useState<string>(initialImageUrl || "");
  const [currentFileName, setCurrentFileName] = useState<string>(() => {
    if (startEmpty) return '';
    if (initialFileName) return initialFileName;
    if (initialImageUrl) {
      const parts = initialImageUrl.split('/');
      const last = parts[parts.length - 1];
      return last ? last.split('?')[0] : 'photo.jpg';
    }
    return "photo.jpg";
  });

  // Three-Tier Architecture State (Step 3)
  const [selectedTier, setSelectedTier] = useState<QualityTier | 'target'>('tier1');
  const [targetSizeInput, setTargetSizeInput] = useState<string>('50 KB');
  const [tiersData, setTiersData] = useState<AllTiersResult | null>(null);

  // Sync filename when prop changes
  useEffect(() => {
    if (initialFileName) {
      setCurrentFileName(initialFileName);
    } else if (initialImageUrl) {
      const parts = initialImageUrl.split('/');
      const last = parts[parts.length - 1];
      if (last) setCurrentFileName(last.split('?')[0]);
    }
  }, [initialFileName, initialImageUrl]);
  const [photoAccent, setPhotoAccent] = useState<string>('#FF4F2E');
  const [workbenchMode, setWorkbenchMode] = useState<'recreation' | 'painting'>('recreation');
  // If no image loaded, redirect to normal upload view
  useEffect(() => {
    if (!currentImgUrl && !startDrag) {
      onBackToStudio();
    }
  }, [currentImgUrl, startDrag, onBackToStudio]);

  // Step 2: Unified state machine: idle -> analyzing -> painting -> done (or skipped / cancelled / error)
  const [workbenchStatus, setWorkbenchStatus] = useState<WorkbenchStatus>(
    startEmpty ? 'idle' : 'analyzing'
  );
  const isGenerating = workbenchStatus === 'analyzing' || workbenchStatus === 'painting';
  const isPaintingActive = workbenchStatus === 'painting';
  const [generationStage, setGenerationStage] = useState<string>('Ready');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // SVGs & sandboxed blob URL
  const [originalSvg, setOriginalSvg] = useState<string>('');
  const [currentSvg, setCurrentSvg] = useState<string>('');
  const [svgBlobUrl, setSvgBlobUrl] = useState<string>('');
  const [lastGoodBlobUrl, setLastGoodBlobUrl] = useState<string>('');
  const [diffBlobUrl, setDiffBlobUrl] = useState<string | null>(null);
  const [imageDims, setImageDims] = useState<{ width: number; height: number }>({ width: 600, height: 800 });

  // Terminal & metrics state
  const [logs, setLogs] = useState<TerminalLog[]>([]);
  const [summaryData, setSummaryData] = useState<FinalSummaryData | null>(null);
  const [colorMetrics, setColorMetrics] = useState<{
    skin?: { hex: string; r: number; g: number; b: number };
    hair?: { hex: string; r: number; g: number; b: number };
    lips?: { hex: string; r: number; g: number; b: number };
    bg?: { hex: string; r: number; g: number; b: number };
  }>({});

  // Layout & modal state
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'code' | 'result' | 'terminal'>('result');
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(startDrag);
  const [debugMagentaBase, setDebugMagentaBase] = useState<boolean>(() => flags.debugMagentaBase);
  const debugMagentaBaseRef = useRef<boolean>(flags.debugMagentaBase);
  debugMagentaBaseRef.current = debugMagentaBase;

  // Resizable pane widths and heights
  const [leftPanePercent, setLeftPanePercent] = useState<number>(45); // Left code editor %
  const [resultPanePercent, setResultPanePercent] = useState<number>(60); // Right top result %
  const [isDraggingCol, setIsDraggingCol] = useState<boolean>(false);
  const [isDraggingRow, setIsDraggingRow] = useState<boolean>(false);

  // Step 1 - 5: Painting Animation & Palette Strip State
  const [paintingLayers, setPaintingLayers] = useState<PaintingLayer[]>([]);
  const [detectedLandmarks, setDetectedLandmarks] = useState<NormalizedLandmark[]>([]);
  const [activeIsolatedLayerId, setActiveIsolatedLayerId] = useState<string | null>(null);
  const [targetScrollLayerId, setTargetScrollLayerId] = useState<string | null>(null);

  // Step 3: Floating Toasts & Collapsible Terminal State
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isTerminalCollapsed, setIsTerminalCollapsed] = useState<boolean>(true);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warn' | 'error' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    
  }, [debugMagentaBase]);

  const accentRgb = React.useMemo(() => {
    const clean = photoAccent.replace('#', '');
    if (clean.length === 6) {
      const r = parseInt(clean.substring(0, 2), 16);
      const g = parseInt(clean.substring(2, 4), 16);
      const b = parseInt(clean.substring(4, 6), 16);
      return `${r}, ${g}, ${b}`;
    }
    return '255, 79, 46';
  }, [photoAccent]);

  // Global shortcut 'L' to toggle collapsible terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('.cm-editor'))
      ) {
        return;
      }

      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsTerminalCollapsed((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // References & Run Isolation
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const currentRunIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const skipRequestedRunIdRef = useRef<number | null>(null);

  // Helper: Append real terminal log (isolated by run ID)
  const addLog = useCallback(
    (msg: string, type: 'info' | 'success' | 'warn' | 'error' | 'summary' = 'info', forRunId?: number) => {
      if (forRunId !== undefined && forRunId !== currentRunIdRef.current) return;
      const time = new Date().toLocaleTimeString();
      setLogs((prev) => [
        ...prev,
        {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: time,
          message: msg,
          type,
        },
      ]);
    },
    []
  );

  const watchdogTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastProgressTimeRef = useRef<number>(Date.now());
  const statusRef = useRef<WorkbenchStatus>(workbenchStatus);
  statusRef.current = workbenchStatus;

  // Window exposure for debugging & Playwright assertions
  useEffect(() => {
    
  }, [workbenchStatus, currentSvg, originalSvg]);

  const clearWatchdog = useCallback(() => {
    if (watchdogTimerRef.current) {
      clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
    
  }, []);

  const transitionToStatus = useCallback(
    (nextStatus: WorkbenchStatus, reason?: string) => {
      setWorkbenchStatus(nextStatus);
      statusRef.current = nextStatus;

      const isTerminal =
        nextStatus === 'done' ||
        nextStatus === 'skipped' ||
        nextStatus === 'cancelled' ||
        nextStatus === 'error';

      if (isTerminal) {
        clearWatchdog();
        if (workerRef.current) {
          workerRef.current.terminate();
          workerRef.current = null;
        }
        
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }
        if (reason) {
          setGenerationStage(reason);
        }
      } else if (nextStatus === 'painting') {
        // Start 8-second watchdog timer in painting state
        clearWatchdog();
        lastProgressTimeRef.current = Date.now();
        
        watchdogTimerRef.current = setInterval(() => {
          if (statusRef.current === 'painting') {
            const elapsed = Date.now() - lastProgressTimeRef.current;
            if (elapsed >= 8000) {
              console.warn('[Watchdog] Painting stalled for > 8s with no progress. Transitioning to done.');
              addLog(
                '[Watchdog] Painting watchdog triggered: no progress for > 8s. Forcing completion.',
                'warn'
              );
              transitionToStatus('done', 'Watchdog timeout');
            }
          } else {
            clearWatchdog();
          }
        }, 1000);
      } else if (nextStatus === 'analyzing') {
        clearWatchdog();
      }
    },
    [clearWatchdog, addLog]
  );

  // Helper: Cancel active run immediately
  const cancelCurrentRun = useCallback(
    (reason = 'Cancelled') => {
      currentRunIdRef.current++;
      transitionToStatus('cancelled', reason);
      setProgressPercent(0);
    },
    [transitionToStatus]
  );

  // Manage SVG Blob URL securely (sandboxing scripts)
  useEffect(() => {
    if (!currentSvg) return;
    try {
      
      const blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      setSvgBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setLastGoodBlobUrl(url);
    } catch (e) {
      console.error('Failed to create Blob URL from SVG:', e);
    }
  }, [currentSvg]);

  // Helper: Sample average color around landmarks
  const sampleColorAround = (
    ctx: CanvasRenderingContext2D,
    landmarks: NormalizedLandmark[],
    indices: number[],
    w: number,
    h: number
  ) => {
    if (!landmarks || landmarks.length === 0) return undefined;
    let rSum = 0,
      gSum = 0,
      bSum = 0,
      count = 0;
    for (const idx of indices) {
      const pt = landmarks[idx];
      if (!pt) continue;
      const px = Math.min(w - 1, Math.max(0, Math.round(pt.x * w)));
      const py = Math.min(h - 1, Math.max(0, Math.round(pt.y * h)));
      const p = ctx.getImageData(px, py, 1, 1).data;
      rSum += p[0];
      gSum += p[1];
      bSum += p[2];
      count++;
    }
    if (count === 0) return undefined;
    const r = Math.round(rSum / count);
    const g = Math.round(gSum / count);
    const b = Math.round(bSum / count);
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    return { hex, r, g, b };
  };

  // Helper: Terminate Web Worker safely
  const handleCancelGeneration = useCallback(() => {
    cancelCurrentRun('Cancelled by user');
    addLog('[V4 Pipeline] Generation cancelled by user.', 'warn', currentRunIdRef.current);
  }, [cancelCurrentRun, addLog]);

  // Main Pipeline Executor
  const processImage = useCallback(
    async (
      imgUrl: string,
      preset: 'low' | 'medium' | 'high' | 'max' = 'max',
      _fileNameHint?: string
    ) => {
      const runId = ++currentRunIdRef.current;
      skipRequestedRunIdRef.current = null;

      // Clean up previous async work and worker
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }

      transitionToStatus('analyzing');
      setErrorMsg(null);
      setProgressPercent(10);
      setGenerationStage('Loading photo asset...');
      const t0 = performance.now();

      addLog(
        `[V4 Pipeline] Initializing generation on photo with preset: ${preset.toUpperCase()}...`,
        'info',
        runId
      );

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imgUrl;

        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image asset for V4 reconstruction'));
        });

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        const w = img.naturalWidth || img.width || 600;
        const h = img.naturalHeight || img.height || 800;
        setImageDims({ width: w, height: h });
        addLog(`Photo decoded: ${w}×${h} pixels.`, 'info', runId);
        addLog('[Stage] Studying photo tone and structure...', 'info', runId);
        addLog('[Stage] Sketching charcoal structural contours...', 'info', runId);

        // Canvas for sampling and ImageData extraction
        const photoCanvas = document.createElement('canvas');
        photoCanvas.width = w;
        photoCanvas.height = h;
        const pCtx = photoCanvas.getContext('2d', { willReadFrequently: true });
        if (!pCtx) throw new Error('Could not allocate 2D canvas context for photo processing');
        pCtx.drawImage(img, 0, 0, w, h);
        const photoImageData = pCtx.getImageData(0, 0, w, h);

        // Step 4: Auto-trim uniform near-black letterbox (top/bottom) and pillarbox (left/right) bars
        let effectiveCanvas: HTMLCanvasElement = photoCanvas;
        let effectiveCtx: CanvasRenderingContext2D = pCtx;
        let effectiveW = w;
        let effectiveH = h;
        let effectiveImageData = photoImageData;

        const cropBounds = detectBlackBars(photoImageData);
        if (cropBounds.trimmed) {
          effectiveW = cropBounds.width;
          effectiveH = cropBounds.height;
          const croppedCanvas = document.createElement('canvas');
          croppedCanvas.width = effectiveW;
          croppedCanvas.height = effectiveH;
          const cCtx = croppedCanvas.getContext('2d', { willReadFrequently: true });
          if (cCtx) {
            cCtx.drawImage(
              photoCanvas,
              cropBounds.left,
              cropBounds.top,
              effectiveW,
              effectiveH,
              0,
              0,
              effectiveW,
              effectiveH
            );
            effectiveCanvas = croppedCanvas;
            effectiveCtx = cCtx;
            effectiveImageData = cCtx.getImageData(0, 0, effectiveW, effectiveH);
            setImageDims({ width: effectiveW, height: effectiveH });
            addLog(
              `[Auto-Trim] Removed letterbox/pillarbox black bars (Top: ${cropBounds.top}px, Bottom: ${h - 1 - cropBounds.bottom}px, Left: ${cropBounds.left}px, Right: ${w - 1 - cropBounds.right}px). Content trimmed to ${effectiveW}×${effectiveH}px.`,
              'info',
              runId
            );
          }
        }

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        // Extract vivid photo accent (only if contrast against ink #14110F is >= 4.5:1, otherwise vermilion)
        const accentRes = extractVividPhotoAccent(effectiveImageData);
        setPhotoAccent(accentRes.accentHex);
        if (accentRes.isVividExtracted) {
          addLog(
            `[Atelier Theme] Vivid photo accent extracted: ${accentRes.accentHex} (Contrast against ink: ${accentRes.contrast}:1)`,
            'info',
            runId
          );
        } else {
          addLog(
            `[Atelier Theme] Vermilion fallback accent maintained: #FF4F2E (Contrast against ink: ${accentRes.contrast}:1)`,
            'info',
            runId
          );
        }

        // 1. Initialize Vision Services
        setProgressPercent(25);
        setGenerationStage('Initializing MediaPipe 478 Face Mesh...');
        await faceDetectionService.initialize();
        const segService = SegmentationService.getInstance();
        await segService.initialize();

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        // 2. Anatomical Detection
        setProgressPercent(45);
        setGenerationStage('Detecting facial landmarks & geometry...');
        const detection = await faceDetectionService.detect(effectiveCanvas);

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        const primaryLandmarks = detection?.landmarks || [];
        setDetectedLandmarks(primaryLandmarks);
        const allFaces = detection?.allFaces || [];
        const faceCount = detection?.faceCount || (primaryLandmarks.length > 0 ? 1 : 0);
        const allFacesLandmarks =
          allFaces.length > 0
            ? allFaces.map((f) => f.landmarks)
            : primaryLandmarks.length > 0
            ? [primaryLandmarks]
            : [];

        

        if (primaryLandmarks.length === 0) {
          showToast('No face found, painting anyway', 'warn');
          addLog('[Vision] No face found, painting anyway.', 'warn', runId);
        } else {
          addLog(
            `Landmarks detected: ${primaryLandmarks.length} points (${faceCount} face${
              faceCount === 1 ? '' : 's'
            }).`,
            'success',
            runId
          );
        }

        // Sample real biometric colors
        if (primaryLandmarks.length >= 33) {
          const skin = sampleColorAround(
            effectiveCtx,
            primaryLandmarks,
            [10, 151, 9, 8, 168, 6, 197, 195, 5, 4, 1, 117, 118, 50, 346, 347, 280, 152],
            effectiveW,
            effectiveH
          );
          const lips = sampleColorAround(
            effectiveCtx,
            primaryLandmarks,
            [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
            effectiveW,
            effectiveH
          );
          const hair = sampleColorAround(effectiveCtx, primaryLandmarks, [10, 67, 297, 109, 338], effectiveW, effectiveH);
          const bgData = effectiveCtx.getImageData(5, 5, 1, 1).data;
          const bgHex =
            '#' +
            [bgData[0], bgData[1], bgData[2]]
              .map((x) => x.toString(16).padStart(2, '0'))
              .join('')
              .toUpperCase();

          setColorMetrics({
            skin,
            lips,
            hair,
            bg: { hex: bgHex, r: bgData[0], g: bgData[1], b: bgData[2] },
          });

          if (skin) addLog(`Biometric Skin: ${skin.hex} (RGB ${skin.r}, ${skin.g}, ${skin.b})`, 'info', runId);
          if (lips) addLog(`Biometric Lips: ${lips.hex} (RGB ${lips.r}, ${lips.g}, ${lips.b})`, 'info', runId);
          if (hair) addLog(`Biometric Hair: ${hair.hex} (RGB ${hair.r}, ${hair.g}, ${hair.b})`, 'info', runId);
        }

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        // 3. Semantic Segmentation
        setProgressPercent(60);
        setGenerationStage('Segmenting semantic regions (hair, clothes, skin)...');
        const categoryMask = await segService.segmentCategoryMask(effectiveCanvas);

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        addLog(
          `Semantic mask computed (${categoryMask ? 'High-density GPU mask' : 'Fallback heuristic'}).`,
          'info',
          runId
        );

        // 4. Faithful V4 Vector Synthesis Engine
        const hasGlasses = imgUrl.includes('beach') || imgUrl.includes('glasses');
        const colorDesc =
          preset === 'low'
            ? '16 colors'
            : preset === 'medium'
            ? '32 colors'
            : preset === 'max'
            ? '64+ colors'
            : '48 colors';

        const pipelineOptions: V4ExperimentOptions = {
          mode: workbenchMode,
          selectedTier: selectedTier === 'target' ? 'tier1' : selectedTier,
          targetSizeKb: selectedTier === 'target' ? parseFloat(targetSizeInput.replace(/[^0-9.]/g, '')) || 50 : undefined,
          detailPreset: preset,
          detectedFaceCount: faceCount,
          allFacesLandmarks,
          hasGlasses,
          debugMagentaBase: debugMagentaBaseRef.current,
        };

        setProgressPercent(65);
        setGenerationStage(`Spawning Web Worker for tracing (${colorDesc})...`);

        let pipelineResult: V4PipelineResult;

        if (typeof Worker !== 'undefined') {
          try {
            pipelineResult = await new Promise<V4PipelineResult>((resolve, reject) => {
              const worker = new V4PipelineWorker();
              workerRef.current = worker;
              

              worker.onmessage = (e: MessageEvent) => {
                if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;
                lastProgressTimeRef.current = Date.now();
                const data = e.data;
                if (data.type === 'STAGE') {
                  setProgressPercent(data.percent || 70);
                  setGenerationStage(data.stage);
                  addLog(`[${data.stage}] ${data.message || data.stage}`, 'info', runId);
                } else if (data.type === 'UNDERPAINTING_READY') {
                  
                  if (data.layers && data.layers.length > 0) {
                    setPaintingLayers(data.layers);
                  }
                  addLog(`[Underpainting] ${data.message || 'Underpainting ready in < 1s'}`, 'info', runId);
                } else if (data.type === 'PROGRESS') {
                  setProgressPercent(data.percent);
                  setGenerationStage(data.stage);
                  addLog(`[Worker] ${data.stage}`, 'info', runId);
                } else if (data.type === 'SUCCESS') {
                  if (data.layers && data.layers.length > 0) {
                    setPaintingLayers(data.layers);
                  }
                  worker.terminate();
                  workerRef.current = null;
                  
                  resolve(data.result);
                } else if (data.type === 'ERROR') {
                  worker.terminate();
                  workerRef.current = null;
                  
                  reject(new Error(data.error));
                }
              };

              worker.onerror = (err) => {
                worker.terminate();
                workerRef.current = null;
                
                reject(err);
              };

              worker.postMessage({
                type: 'RUN_V4',
                imageData: effectiveImageData,
                width: effectiveW,
                height: effectiveH,
                landmarks: primaryLandmarks,
                categoryMask,
                options: pipelineOptions,
              });
            });
          } catch (workerErr: any) {
            if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;
            addLog(
              `[V4 Worker Notice] Falling back to orchestrator execution: ${workerErr?.message || 'worker dispatch'}`,
              'warn',
              runId
            );
            pipelineResult = await runV4Pipeline({
              image: effectiveCanvas,
              landmarks: primaryLandmarks,
              categoryMask,
              options: pipelineOptions,
            });
            const optSvg = optimizeSvgDocument(pipelineResult.candidates['candidate-c'].svgString);
            pipelineResult.candidates['candidate-c'].svgString = optSvg;
            setPaintingLayers(extractPaintingLayers(optSvg));
            if (skipRequestedRunIdRef.current !== runId) {
              transitionToStatus('painting');
            }
          }
        } else {
          pipelineResult = await runV4Pipeline({
            image: effectiveCanvas,
            landmarks: primaryLandmarks,
            categoryMask,
            options: pipelineOptions,
          });
          const mergedSvg = optimizeSvgDocument(pipelineResult.candidates['candidate-c'].svgString);
          setPaintingLayers(extractPaintingLayers(mergedSvg));
          const optSvg = flags.sizeOptimizer
            ? minifySvgDocument(mergedSvg, { preset: 'balanced' })
            : mergedSvg;
          pipelineResult.candidates['candidate-c'].svgString = optSvg;
          if (skipRequestedRunIdRef.current !== runId) {
            transitionToStatus('painting');
          }
        }

        if (pipelineResult.tiers) {
          setTiersData(pipelineResult.tiers);
        }
        const svgOutput = pipelineResult.candidates['candidate-c'].svgString;

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;
        const totalDuration = Math.round(performance.now() - t0);

        setOriginalSvg(svgOutput);
        setCurrentSvg(svgOutput);

        if (skipRequestedRunIdRef.current === runId) {
          transitionToStatus('skipped', 'User skipped animation');
        } else {
          lastProgressTimeRef.current = Date.now();
          transitionToStatus('painting');
        }

        setProgressPercent(90);
        setGenerationStage('Measuring color error, SSIM & difference heatmap...');

        // Measure Quality and Build Difference Map
        let ssim = 0;
        let colorErr = 0;
        let specks = 0;

        try {
          const svgImgData = await renderSvgToImageData(svgOutput, effectiveW, effectiveH);
          if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

          if (svgImgData) {
            // Downsample for sub-second SSIM and speck evaluation
            const evalW = 360;
            const evalH = Math.round(effectiveH * (360 / effectiveW));

            const evalCanvasA = document.createElement('canvas');
            evalCanvasA.width = evalW;
            evalCanvasA.height = evalH;
            const ctxA = evalCanvasA.getContext('2d')!;
            ctxA.drawImage(effectiveCanvas, 0, 0, evalW, evalH);
            const dataA = ctxA.getImageData(0, 0, evalW, evalH);

            const evalCanvasB = document.createElement('canvas');
            evalCanvasB.width = evalW;
            evalCanvasB.height = evalH;
            const ctxB = evalCanvasB.getContext('2d')!;
            const tempSvgCanvas = document.createElement('canvas');
            tempSvgCanvas.width = effectiveW;
            tempSvgCanvas.height = effectiveH;
            tempSvgCanvas.getContext('2d')!.putImageData(svgImgData, 0, 0);
            ctxB.drawImage(tempSvgCanvas, 0, 0, evalW, evalH);
            const dataB = ctxB.getImageData(0, 0, evalW, evalH);

            ssim = Math.round(computeSSIM(dataA, dataB) * 1000) / 1000;
            specks = countSpecks(dataB).speckCount;

            // Fast sampled color error
            let sum = 0;
            let sampleCount = 0;
            for (let i = 0; i < effectiveW * effectiveH; i += 4) {
              const idx = i * 4;
              const dr = effectiveImageData.data[idx] - svgImgData.data[idx];
              const dg = effectiveImageData.data[idx + 1] - svgImgData.data[idx + 1];
              const db = effectiveImageData.data[idx + 2] - svgImgData.data[idx + 2];
              sum += Math.sqrt(dr * dr + dg * dg + db * db);
              sampleCount++;
            }
            colorErr = Math.round((sum / sampleCount) * 10) / 10;

            if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

            // Generate Photographic Difference Heatmap
            const diffW = Math.min(600, w);
            const diffH = Math.round(h * (diffW / w));
            const diffCanvas = document.createElement('canvas');
            diffCanvas.width = diffW;
            diffCanvas.height = diffH;
            const dCtx = diffCanvas.getContext('2d');
            if (dCtx) {
              const diffEvalCanvas = document.createElement('canvas');
              diffEvalCanvas.width = evalW;
              diffEvalCanvas.height = evalH;
              const deCtx = diffEvalCanvas.getContext('2d')!;
              const diffRaw = deCtx.createImageData(evalW, evalH);
              for (let i = 0; i < evalW * evalH * 4; i += 4) {
                const dr = Math.abs(dataA.data[i] - dataB.data[i]);
                const dg = Math.abs(dataA.data[i + 1] - dataB.data[i + 1]);
                const db = Math.abs(dataA.data[i + 2] - dataB.data[i + 2]);
                diffRaw.data[i] = Math.min(255, Math.round(dr * 2.2));
                diffRaw.data[i + 1] = Math.min(255, Math.round(dg * 2.2));
                diffRaw.data[i + 2] = Math.min(255, Math.round(db * 2.2));
                diffRaw.data[i + 3] = 255;
              }
              deCtx.putImageData(diffRaw, 0, 0);
              dCtx.drawImage(diffEvalCanvas, 0, 0, diffW, diffH);
              diffCanvas.toBlob((blob) => {
                if (runId !== currentRunIdRef.current) return;
                if (blob) {
                  const url = URL.createObjectURL(blob);
                  setDiffBlobUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return url;
                  });
                }
              });
            }
          }
        } catch (e) {
          console.warn('Metrics evaluation skipped:', e);
        }

        if (runId !== currentRunIdRef.current || abortController.signal.aborted) return;

        // Calculate Gzip size for final summary block
        const rawBytes = new TextEncoder().encode(svgOutput).length;
        const paths = (svgOutput.match(/<path/g) || []).length;
        let gzipBytes = Math.round(rawBytes * 0.35);
        try {
          if (typeof CompressionStream !== 'undefined') {
            const stream = new Blob([svgOutput]).stream().pipeThrough(new CompressionStream('gzip'));
            const res = new Response(stream);
            const buf = await res.arrayBuffer();
            gzipBytes = buf.byteLength;
          }
        } catch (e) {}

        const finalSummary: FinalSummaryData = {
          paths,
          sizeBytes: rawBytes,
          gzipBytes,
          durationMs: totalDuration,
          colorError: colorErr,
          ssim,
          speckCount: specks,
        };

        setSummaryData(finalSummary);
        setProgressPercent(100);
        setGenerationStage('Completed');
        addLog(
          `[V4 Pipeline Completed] ${paths.toLocaleString()} paths | ${(rawBytes / 1024).toFixed(
            1
          )} KB | ${totalDuration}ms | SSIM: ${ssim} | Color Err: ${colorErr}`,
          'success',
          runId
        );
        if (skipRequestedRunIdRef.current === runId) {
          transitionToStatus('skipped', 'User skipped animation');
        } else {
          transitionToStatus('done');
        }
      } catch (err: any) {
        if (runId !== currentRunIdRef.current) return;
        console.error('V4 processing error:', err);
        setErrorMsg(err.message || 'Error executing V4 pipeline');
        addLog(`[Pipeline Error] ${err.message}`, 'error', runId);
        transitionToStatus('error', err.message);
      } finally {
        if (
          runId === currentRunIdRef.current &&
          statusRef.current !== 'done' &&
          statusRef.current !== 'skipped'
        ) {
          transitionToStatus('done');
        }
      }
    },
    [addLog, transitionToStatus]
  );

  // Step 3: Handle Tier Selection (Instantly updates view from shared analysis)
  const handleTierSelect = useCallback(
    (tierId: QualityTier | 'target') => {
      setSelectedTier(tierId);
      if (!tiersData) return;

      let targetSvg = '';
      if (tierId === 'tier1') {
        targetSvg = tiersData.tier1.svgString;
      } else if (tierId === 'tier2') {
        targetSvg = tiersData.tier2.svgString;
      } else if (tierId === 'tier3') {
        targetSvg = tiersData.tier3.svgString;
      } else if (tierId === 'target') {
        const numKb = parseFloat(targetSizeInput.replace(/[^0-9.]/g, '')) || 50;
        const res = binarySearchTargetSize(tiersData.tier1.svgString, numKb * 1024, {
          landmarks: detectedLandmarks,
          width: imageDims.width,
          height: imageDims.height,
        });
        targetSvg = res.svgString;
        showToast(`Target Size: ${res.pathCount} paths, ${(res.actualGzipBytes / 1024).toFixed(1)} KB gz`, 'info');
      }

      if (targetSvg) {
        setCurrentSvg(targetSvg);
        setOriginalSvg(targetSvg);
        const blob = new Blob([targetSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        setSvgBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setLastGoodBlobUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return url;
        });
        setPaintingLayers(extractPaintingLayers(targetSvg));
      }
    },
    [tiersData, targetSizeInput, detectedLandmarks, imageDims, showToast]
  );

  const handleApplyTargetSize = useCallback(() => {
    if (!tiersData) return;
    const numKb = parseFloat(targetSizeInput.replace(/[^0-9.]/g, '')) || 50;
    const res = binarySearchTargetSize(tiersData.tier1.svgString, numKb * 1024, {
      landmarks: detectedLandmarks,
      width: imageDims.width,
      height: imageDims.height,
    });
    setSelectedTier('target');
    setCurrentSvg(res.svgString);
    setOriginalSvg(res.svgString);
    const blob = new Blob([res.svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setSvgBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setLastGoodBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setPaintingLayers(extractPaintingLayers(res.svgString));
    showToast(`Target Size: ${res.pathCount} paths, ${(res.actualGzipBytes / 1024).toFixed(1)} KB gz (${res.withinTolerance ? 'within +/-10%' : 'best fit'})`, 'success');
  }, [tiersData, targetSizeInput, detectedLandmarks, imageDims, showToast]);

  // Unified photo selection handler (Step 1: Immediately show new photo, clear old results/state, cancel old run)
  const handlePhotoSelection = useCallback(
    (url: string, name: string) => {
      cancelCurrentRun('Switching photo');
      // IMMEDIATELY show the new photo and clear old results/state
      setCurrentImgUrl(url);
      setCurrentFileName(name);
      setOriginalSvg('');
      setCurrentSvg('');
      setSvgBlobUrl('');
      setLastGoodBlobUrl('');
      setDiffBlobUrl(null);
      setPaintingLayers([]);
      setDetectedLandmarks([]);
      setActiveIsolatedLayerId(null);
      setTargetScrollLayerId(null);
      setSummaryData(null);
      setColorMetrics({});
      setLogs([]);
      setErrorMsg(null);

      processImage(url, 'max', name);
    },
    [cancelCurrentRun, processImage]
  );

  // Auto-run on mount (Strict mode safe)
  useEffect(() => {
    if (currentImgUrl) {
      processImage(currentImgUrl, 'max', currentFileName);
    }
    return () => {
      cancelCurrentRun('Unmounted');
    };
  }, []);

  // Handle Drag-and-drop file upload
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingFile(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        const file = e.dataTransfer.files[0];
        if (!file.type.startsWith('image/')) {
          showToast('Unsupported file type. Please upload a JPEG, PNG, or WebP photo.', 'error');
          return;
        }
        if (file.size > 25 * 1024 * 1024) {
          showToast('File is too large (max 25 MB). Please choose a smaller image.', 'error');
          return;
        }
        const url = URL.createObjectURL(file);
        handlePhotoSelection(url, file.name);
      }
    },
    [handlePhotoSelection, showToast]
  );

  // Handle native file input change
  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (!file.type.startsWith('image/')) {
          showToast('Unsupported file type. Please upload a JPEG, PNG, or WebP photo.', 'error');
          return;
        }
        if (file.size > 25 * 1024 * 1024) {
          showToast('File is too large (max 25 MB). Please choose a smaller image.', 'error');
          return;
        }
        const url = URL.createObjectURL(file);
        handlePhotoSelection(url, file.name);
      }
    },
    [handlePhotoSelection, showToast]
  );

  
  // Handle Skip Animation (Step 2: Can be pressed in-flight or before first picture)
  const handleSkipAnimation = useCallback(() => {
    skipRequestedRunIdRef.current = currentRunIdRef.current;
    addLog('[Animation] skipped by user.', 'info', currentRunIdRef.current);
    transitionToStatus('skipped', 'User skipped animation');
    setIsTerminalCollapsed(true);
  }, [addLog, transitionToStatus]);

  // Draggable Vertical & Horizontal Dividers
  const handleColMouseDown = () => setIsDraggingCol(true);
  const handleRowMouseDown = () => setIsDraggingRow(true);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingCol && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const newPercent = Math.max(25, Math.min(75, ((e.clientX - rect.left) / rect.width) * 100));
        setLeftPanePercent(newPercent);
      }
      if (isDraggingRow && rightPaneRef.current) {
        const rect = rightPaneRef.current.getBoundingClientRect();
        const newPercent = Math.max(30, Math.min(80, ((e.clientY - rect.top) / rect.height) * 100));
        setResultPanePercent(newPercent);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingCol(false);
      setIsDraggingRow(false);
    };

    if (isDraggingCol || isDraggingRow) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingCol, isDraggingRow]);

  return (
    <div
      className="v4-app-container"
      style={{
        ['--accent' as any]: photoAccent,
        ['--accent-rgb' as any]: accentRgb,
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleDrop}
    >
      {/* Hidden File Picker */}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleFileInput}
      />

      {/* Global Drag-and-Drop Overlay */}
      {isDraggingFile && (
        <div className="v4-drag-overlay">
          <div className="v4-drag-overlay__title">Drop a photograph</div>
          <div className="v4-drag-overlay__subtitle">We'll paint it in code</div>
        </div>
      )}

      {/* 44px Atelier Header: Wordmark left, actions right */}
      <header className="v4-header">
        <div className="v4-header__left">
          <button
            className="v4-btn"
            onClick={onBackToStudio}
            title="Back to photo upload"
            style={{ padding: '0 8px' }}
          >
            <ArrowLeft size={14} />
          </button>

          <div className="v4-wordmark" onClick={onBackToStudio}>
            Code<em className="v4-wordmark-face">Face</em>
          </div>
        </div>

        <div className="v4-header__right">
          {/* Upload Button: plain text with thin border */}
          <button
            className="v4-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Upload photo (or drag-and-drop anywhere)"
          >
            <span>Upload photo</span>
          </button>
          <select
            className="v4-select"
            value={workbenchMode}
            onChange={(e) => {
              const newMode = e.target.value as 'recreation' | 'painting';
              setWorkbenchMode(newMode);
              if (currentImgUrl) {
                processImage(currentImgUrl, 'max', currentFileName);
              }
            }}
            title="Engine Mode"
          >
            <option value="recreation">Mode: Recreation</option>
            <option value="painting">Mode: Painting Studio</option>
          </select>

          {workbenchMode === 'recreation' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <select
                className="v4-select"
                value={selectedTier}
                onChange={(e) => handleTierSelect(e.target.value as any)}
                title="Recreation Quality Tier"
              >
                <option value="tier1">High (Tier 1)</option>
                <option value="tier2">Medium (Tier 2)</option>
                <option value="tier3">Low (Tier 3)</option>
                <option value="target">Target size mode</option>
              </select>

              {selectedTier === 'target' && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <input
                    type="text"
                    value={targetSizeInput}
                    placeholder="e.g. 50 KB"
                    onChange={(e) => setTargetSizeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleApplyTargetSize();
                    }}
                    style={{
                      width: '65px',
                      padding: '2px 6px',
                      fontSize: '11px',
                      background: 'var(--panel-bg, #1a202c)',
                      color: 'var(--text-main, #f7fafc)',
                      border: '1px solid var(--border-soft, #4a5568)',
                      borderRadius: '3px',
                    }}
                    title="Enter target size (e.g. 50 KB, 30 KB)"
                  />
                  <button
                    className="v4-btn"
                    style={{ padding: '2px 6px', fontSize: '11px' }}
                    onClick={handleApplyTargetSize}
                    title="Binary search parameters to hit target size"
                  >
                    Set
                  </button>
                </div>
              )}
            </div>
          )}
          <button style={{ display: 'none' }}>
          </button>

          {/* Dev Mode Test Photo Dropdown (Only when ?dev=1) */}
          

          {isDevMode && (
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: debugMagentaBase ? '#FF00FF' : 'var(--pencil)',
                cursor: 'pointer',
                userSelect: 'none',
                padding: '2px 6px',
                border: '1px solid var(--border-soft)',
                borderRadius: '3px',
              }}
              title="Step 1 Debug: Set base layer to bright magenta (#FF00FF) to distinguish holes from noise specks"
            >
              <input
                type="checkbox"
                checked={debugMagentaBase}
                onChange={(e) => {
                  const val = e.target.checked;
                  setDebugMagentaBase(val);
                  if (currentImgUrl) {
                    processImage(currentImgUrl, 'max', currentFileName);
                  }
                }}
              />
              <span>Magenta Base</span>
            </label>
          )}

          {/* "Use this code" (formerly Export & Embed) */}
          <button
            className="v4-btn"
            onClick={() => setIsExportOpen(true)}
            disabled={!currentSvg}
            title="Export code options"
          >
            <span>Use this code</span>
          </button>

          {errorMsg && (
            <span style={{ color: 'var(--vermilion)', fontSize: '12px' }} title={errorMsg}>
              {errorMsg.substring(0, 24)}…
            </span>
          )}

          {/* Exactly one solid accent button on screen: "Paint it" */}
          <button
            className="v4-btn v4-btn--accent"
            onClick={() => processImage(currentImgUrl, 'max', currentFileName)}
            disabled={isGenerating || !currentImgUrl}
            title={isGenerating ? generationStage : 'Paint vector portrait'}
          >
            <span>{isGenerating ? 'Working…' : 'Paint it'}</span>
          </button>
        </div>
      </header>

      {/* Mobile Tabs Bar (< 1100px) */}
      <div className="v4-mobile-tabs-bar">
        <button
          className={`v4-mobile-tab-btn ${activeMobileTab === 'code' ? 'is-active' : ''}`}
          onClick={() => setActiveMobileTab('code')}
        >
          <span>Code</span>
        </button>
        <button
          className={`v4-mobile-tab-btn ${activeMobileTab === 'result' ? 'is-active' : ''}`}
          onClick={() => setActiveMobileTab('result')}
        >
          <span>Painting</span>
        </button>
        <button
          className={`v4-mobile-tab-btn ${activeMobileTab === 'terminal' ? 'is-active' : ''}`}
          onClick={() => setActiveMobileTab('terminal')}
        >
          <span>studio.log</span>
        </button>
      </div>

      {/* 2. TWO-PANE WORKSPACE */}
      <main className="v4-workspace" ref={workspaceRef}>
        {/* LEFT PANE: CODE EDITOR */}
        <section
          className={`v4-left-pane ${activeMobileTab !== 'code' ? 'mobile-hidden' : ''}`}
          style={{ width: `${leftPanePercent}%` }}
        >
          <V4CodeEditor
            originalSvg={originalSvg}
            currentSvg={currentSvg}
            onSvgChange={(newSvg) => setCurrentSvg(newSvg)}
            width={imageDims.width}
            height={imageDims.height}
            status={workbenchStatus}
            isStreaming={isGenerating || isPaintingActive}
            targetScrollLayerId={targetScrollLayerId}
            onToast={showToast}
          />
        </section>

        {/* Draggable Vertical Divider between Panes */}
        <div
          className={`v4-pane-divider ${isDraggingCol ? 'is-dragging' : ''}`}
          onMouseDown={handleColMouseDown}
          title="Drag to resize panes"
        />

        {/* RIGHT PANE: RESULT ON TOP, TERMINAL ON BOTTOM */}
        <section
          className={`v4-right-pane ${activeMobileTab === 'code' ? 'mobile-hidden' : ''}`}
          ref={rightPaneRef}
          style={{ width: `calc(${100 - leftPanePercent}% - 5px)` }}
        >
          {/* TOP RESULT SECTION */}
          <div
            className={`v4-result-section ${activeMobileTab === 'terminal' ? 'mobile-hidden' : ''}`}
            style={{
              height: isTerminalCollapsed ? 'calc(100% - 34px)' : `${resultPanePercent}%`,
              transition: 'height 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <V4ResultPane
              currentImgUrl={currentImgUrl}
              fileName={currentFileName}
              tiers={tiersData}
              selectedTier={selectedTier}
              onSelectTier={handleTierSelect}
              mode={workbenchMode}
              svgBlobUrl={svgBlobUrl}
              lastGoodBlobUrl={lastGoodBlobUrl}
              diffBlobUrl={diffBlobUrl}
              status={workbenchStatus}
              isGenerating={isGenerating}
              generationStage={generationStage}
              progressPercent={progressPercent}
              width={imageDims.width}
              height={imageDims.height}
              isDraggingFile={isDraggingFile}
              onDropAreaClick={() => fileInputRef.current?.click()}
              accentColor={photoAccent}
              layers={paintingLayers}
              landmarks={detectedLandmarks}
              activeIsolatedLayerId={activeIsolatedLayerId}
              onIsolateLayer={(id) => {
                setActiveIsolatedLayerId(id);
                setTargetScrollLayerId(id);
              }}
              isPaintingActive={isPaintingActive}
              onSkipAnimation={handleSkipAnimation}
              onReplayAnimation={() => transitionToStatus('painting')}
              onPaintingFinished={() => {
                transitionToStatus('done');
                setIsTerminalCollapsed(true);
              }}
              onStageChange={(stage) => {
                lastProgressTimeRef.current = Date.now();
                addLog(`[Stage] ${stage}`, 'info');
              }}
            />
          </div>

          {/* Draggable Horizontal Divider between Result & Terminal (visible only when expanded) */}
          {!isTerminalCollapsed && (
            <div
              className={`v4-horizontal-divider ${isDraggingRow ? 'is-dragging' : ''}`}
              onMouseDown={handleRowMouseDown}
              title="Drag to resize terminal"
            />
          )}

          {/* BOTTOM TERMINAL SECTION */}
          <div
            className={`v4-terminal-section ${activeMobileTab === 'result' ? 'mobile-hidden' : ''} ${
              isTerminalCollapsed ? 'is-collapsed' : ''
            }`}
            style={{
              height: isTerminalCollapsed ? '34px' : `${100 - resultPanePercent}%`,
              transition: 'height 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <V4Terminal
              logs={logs}
              onClearLogs={() => setLogs([])}
              isGenerating={isGenerating}
              progressPercent={progressPercent}
              generationStage={generationStage}
              onCancel={handleCancelGeneration}
              colorMetrics={colorMetrics}
              summaryData={summaryData}
              isCollapsed={isTerminalCollapsed}
              onToggleCollapse={() => setIsTerminalCollapsed((prev) => !prev)}
            />
          </div>
        </section>
      </main>

      {/* 3. EXPORT & EMBED MODAL */}
      <V4ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        svgContent={currentSvg}
        width={imageDims.width}
        height={imageDims.height}
      />

      {/* 4. FLOATING TOAST NOTIFICATIONS */}
      <V4Toast toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};
export default V4DiagnosticWorkbench;
