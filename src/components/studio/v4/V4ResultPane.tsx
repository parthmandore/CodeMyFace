import React, { useState, useRef, useEffect } from 'react';
import { SplitSquareVertical } from 'lucide-react';
import { WorkbenchStatus } from '../../../engine/v4/types';

export type ResultViewMode = 'result' | 'photo' | 'side-by-side' | 'wipe-slider' | 'diff';

import type { AllTiersResult, QualityTier } from '../../../engine/v4/tiers';

export interface V4ResultPaneProps {
  tiers?: AllTiersResult | null;
  selectedTier?: QualityTier | 'target';
  onSelectTier?: (tier: QualityTier | 'target') => void;
  mode?: 'recreation' | 'painting';
  currentImgUrl: string;
  fileName?: string;
  svgBlobUrl: string;
  lastGoodBlobUrl: string;
  diffBlobUrl?: string | null;
  status?: WorkbenchStatus;
  isGenerating: boolean;
  generationStage?: string;
  progressPercent?: number;
  width: number;
  height: number;
  isDraggingFile?: boolean;
  onDropAreaClick?: () => void;
  accentColor?: string;
  // Kept optional for backward compatibility
  layers?: any[];
  landmarks?: any[];
  onIsolateLayer?: (layerId: string | null) => void;
  activeIsolatedLayerId?: string | null;
  onSkipAnimation?: () => void;
  onReplayAnimation?: () => void;
  isPaintingActive?: boolean;
  onPaintingFinished?: () => void;
  onStageChange?: (stage: string) => void;
}

export const V4ResultPane: React.FC<V4ResultPaneProps> = ({
  currentImgUrl,
  tiers,
  selectedTier = 'tier1',
  onSelectTier,
  mode = 'recreation',
  fileName = 'portrait.jpg',
  svgBlobUrl,
  lastGoodBlobUrl,
  diffBlobUrl,
  status: _status,
  isGenerating = false,
  generationStage: _generationStage = '',
  progressPercent: _progressPercent = 0,
  width,
  height,
  isDraggingFile = false,
  onDropAreaClick,
}) => {
  const [viewMode, setViewMode] = useState<ResultViewMode>('result');
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [sliderPos, setSliderPos] = useState<number>(50);
  const [isFocusMode, setIsFocusMode] = useState<boolean>(false);

  const startPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const startOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const sliderWrapRef = useRef<HTMLDivElement | null>(null);
  const isDraggingSliderRef = useRef<boolean>(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const effectiveSvgUrl = svgBlobUrl || lastGoodBlobUrl;

  const handleZoomIn = () => setZoomLevel((z) => Math.min(500, z + 25));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(25, z - 25));
  const handleResetFit = () => {
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 15 : -15;
    setZoomLevel((z) => Math.max(25, Math.min(500, z + delta)));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'wipe-slider' && sliderWrapRef.current) {
      isDraggingSliderRef.current = true;
      return;
    }

    if (zoomLevel > 100 || e.button === 1 || e.shiftKey) {
      setIsPanning(true);
      startPanRef.current = { x: e.clientX, y: e.clientY };
      startOffsetRef.current = { ...panOffset };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning) {
        const dx = e.clientX - startPanRef.current.x;
        const dy = e.clientY - startPanRef.current.y;
        setPanOffset({
          x: startOffsetRef.current.x + dx,
          y: startOffsetRef.current.y + dy,
        });
      }
      if (isDraggingSliderRef.current && sliderWrapRef.current) {
        const rect = sliderWrapRef.current.getBoundingClientRect();
        const pos = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        setSliderPos(pos);
      }
    };

    const handleMouseUp = () => {
      setIsPanning(false);
      isDraggingSliderRef.current = false;
    };

    if (isPanning || isDraggingSliderRef.current) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  // Reset zoom & pan when image changes
  useEffect(() => {
    setZoomLevel(100);
    setPanOffset({ x: 0, y: 0 });
  }, [currentImgUrl, width, height]);

  // Window resize: reset zoom to 100% (Fit) and pan to center
  useEffect(() => {
    const handleResize = () => {
      setZoomLevel(100);
      setPanOffset({ x: 0, y: 0 });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcut listener: F for Focus Mode, Esc for Exit Focus Mode
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

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setIsFocusMode((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isFocusMode) {
          e.preventDefault();
          setIsFocusMode(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFocusMode]);

  const isEmpty = !currentImgUrl;

  return (
    <div className="v4-result-section">
      {/* 1. Atelier Sub-toolbar */}
      <div className="v4-pane-toolbar">
        <div className="v4-pane-toolbar__left">
          <div className="v4-segmented-group">
            <button
              className={`v4-segmented-item ${viewMode === 'result' ? 'is-active' : ''}`}
              onClick={() => setViewMode('result')}
              title="Vector painting output"
            >
              <span>Painting</span>
            </button>

            <button
              className={`v4-segmented-item ${viewMode === 'photo' ? 'is-active' : ''}`}
              onClick={() => setViewMode('photo')}
              title="Original photograph input"
            >
              <span>Original photo</span>
            </button>

            <button
              className={`v4-segmented-item ${viewMode === 'side-by-side' ? 'is-active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
              title="Side-by-side comparison"
            >
              <span>Side-by-side</span>
            </button>

            <button
              className={`v4-segmented-item ${viewMode === 'wipe-slider' ? 'is-active' : ''}`}
              onClick={() => setViewMode('wipe-slider')}
              title="Interactive wipe slider"
            >
              <span>Slider</span>
            </button>

            <button
              className={`v4-segmented-item ${viewMode === 'diff' ? 'is-active' : ''}`}
              onClick={() => setViewMode('diff')}
              title="Difference error map"
            >
              <span>Diff view</span>
            </button>
          </div>
        </div>

        <div className="v4-pane-toolbar__right">
          <button className="v4-btn" style={{ padding: '0 8px' }} onClick={handleZoomOut} title="Zoom out">
            -
          </button>

          <span
            style={{
              fontSize: '13px',
              color: 'var(--paper-dim)',
              minWidth: '40px',
              textAlign: 'center',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {zoomLevel}%
          </span>

          <button className="v4-btn" style={{ padding: '0 8px' }} onClick={handleZoomIn} title="Zoom in">
            +
          </button>

          <button className="v4-btn" onClick={handleResetFit} title="Reset zoom to 100%">
            <span>Fit</span>
          </button>

          <button
            className={`v4-btn ${isFocusMode ? 'v4-btn--accent' : ''}`}
            onClick={() => setIsFocusMode(!isFocusMode)}
            title="Focus mode (F) — view painting full-screen"
          >
            <span>Focus</span>
          </button>
        </div>
      </div>

      {/* Three-Tier Card Selector Bar (Recreation Mode) */}
      {mode === 'recreation' && tiers && (
        <div
          className="v4-tier-cards-bar"
          style={{
            display: 'flex',
            gap: '8px',
            padding: '6px 12px',
            background: 'var(--panel-alt, #0f172a)',
            borderBottom: '1px solid var(--border-soft, #1e293b)',
            alignItems: 'center',
            overflowX: 'auto',
          }}
        >
          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Tiers:
          </span>
          {[
            { id: 'tier1', label: 'High (Tier 1)', data: tiers.tier1, desc: 'Closest photographic copy' },
            { id: 'tier2', label: 'Medium (Tier 2)', data: tiers.tier2, desc: '40-60% size, safe merging' },
            { id: 'tier3', label: 'Low (Tier 3)', data: tiers.tier3, desc: '10-20% size, saliency weighted' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => onSelectTier?.(t.id as any)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                cursor: 'pointer',
                border: selectedTier === t.id ? '1px solid var(--accent, #3b82f6)' : '1px solid var(--border-soft, #334155)',
                background: selectedTier === t.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                color: selectedTier === t.id ? '#93c5fa' : '#cbd5e1',
              }}
              title={t.desc}
            >
              <strong>{t.label}</strong>
              <span style={{ color: '#94a3b8' }}>
                {(t.data?.gzipBytes ? t.data.gzipBytes / 1024 : 0).toFixed(1)} KB gz · {t.data?.pathCount || 0} paths
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 2. Paper-Grain Viewport Canvas Area */}
      <div
        className="v4-viewport-canvas"
        ref={viewportRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        style={{
          cursor:
            isPanning
              ? 'grabbing'
              : zoomLevel > 100
              ? 'grab'
              : viewMode === 'wipe-slider'
              ? 'ew-resize'
              : 'default',
        }}
      >
        {isEmpty ? (
          /* Empty State */
          <div
            className={`atelier-frame atelier-frame--empty ${isDraggingFile ? 'is-drag-over' : ''}`}
            onClick={onDropAreaClick}
          >
            <div className="atelier-crop-mark atelier-crop-mark--tl" />
            <div className="atelier-crop-mark atelier-crop-mark--tr" />
            <div className="atelier-crop-mark atelier-crop-mark--bl" />
            <div className="atelier-crop-mark atelier-crop-mark--br" />

            <div className="atelier-empty-text">Drop a photo. We'll paint it in code.</div>
            <div className="atelier-empty-subtext">or click to browse local files</div>
          </div>
        ) : (
          /* Populated State */
          <div className={`atelier-frame ${isDraggingFile ? 'is-drag-over' : ''}`}>
            <div className="atelier-crop-mark atelier-crop-mark--tl" />
            <div className="atelier-crop-mark atelier-crop-mark--tr" />
            <div className="atelier-crop-mark atelier-crop-mark--bl" />
            <div className="atelier-crop-mark atelier-crop-mark--br" />

            {/* Picture Content: Zoom and Pan apply strictly to this inner container */}
            <div className="atelier-frame-content">
              <div
                className="atelier-zoom-container"
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel / 100})`,
                  transformOrigin: 'center center',
                  transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                {/* A. Painting Result: Photo initially, instant SVG swap when ready. Nothing else moves. */}
                {viewMode === 'result' && (
                  <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {effectiveSvgUrl ? (
                      <img
                        src={effectiveSvgUrl}
                        alt="Vector painting result"
                        className="v4-preview-img"
                        draggable={false}
                      />
                    ) : currentImgUrl ? (
                      <img
                        src={currentImgUrl}
                        alt="Original photograph"
                        className="v4-preview-img"
                        draggable={false}
                      />
                    ) : (
                      <div
                        style={{
                          padding: '60px 40px',
                          color: 'var(--paper-dim)',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: '12px',
                          fontFamily: 'var(--font-serif)',
                          fontSize: '20px',
                          fontStyle: 'italic',
                        }}
                      >
                        <span>{isGenerating ? 'Working…' : 'Choose a photo'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* B. Original Photo */}
                {viewMode === 'photo' && (
                  <img
                    src={currentImgUrl}
                    alt="Original photograph"
                    className="v4-preview-img"
                    draggable={false}
                  />
                )}

                {/* C. Side-by-Side */}
                {viewMode === 'side-by-side' && (
                  <div className="v4-side-by-side-wrap">
                    <div className="v4-side-pane">
                      <span className="v4-side-pane__label">Original photo</span>
                      <img
                        src={currentImgUrl}
                        alt="Original photograph"
                        className="v4-preview-img"
                        draggable={false}
                      />
                    </div>
                    <div className="v4-side-pane">
                      <span className="v4-side-pane__label">Painting</span>
                      {effectiveSvgUrl ? (
                        <img
                          src={effectiveSvgUrl}
                          alt="Vector painting"
                          className="v4-preview-img"
                          draggable={false}
                        />
                      ) : (
                        <div style={{ color: 'var(--paper-dim)' }}>
                          {isGenerating ? 'Working…' : 'Painting not yet generated'}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* D. Wipe Slider */}
                {viewMode === 'wipe-slider' && (
                  <div className="v4-wipe-slider-wrap" ref={sliderWrapRef}>
                    <img
                      src={currentImgUrl}
                      alt="Original photograph"
                      className="v4-wipe-image-base"
                      draggable={false}
                    />
                    <div
                      className="v4-wipe-overlay"
                      style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}
                    >
                      {effectiveSvgUrl ? (
                        <img
                          src={effectiveSvgUrl}
                          alt="Vector painting"
                          className="v4-wipe-image-base"
                          draggable={false}
                        />
                      ) : null}
                    </div>
                    <div className="v4-wipe-divider-handle" style={{ left: `${sliderPos}%` }}>
                      <div className="v4-wipe-handle-pill">
                        <SplitSquareVertical size={12} />
                      </div>
                    </div>
                  </div>
                )}

                {/* E. Diff View */}
                {viewMode === 'diff' &&
                  (diffBlobUrl ? (
                    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <img
                        src={diffBlobUrl}
                        alt="Difference error map"
                        className="v4-preview-img"
                        draggable={false}
                      />
                      <div
                        style={{
                          position: 'absolute',
                          bottom: 12,
                          backgroundColor: 'var(--ink)',
                          border: '1px solid var(--line)',
                          padding: '4px 10px',
                          fontSize: '12px',
                          color: 'var(--paper-dim)',
                          pointerEvents: 'none',
                        }}
                      >
                        <span style={{ color: 'var(--paper)' }}>Dark</span> = match &nbsp;|&nbsp;{' '}
                        <span style={{ color: 'var(--accent)' }}>Bright</span> = variance (amplified 2.2×)
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding: '40px', color: 'var(--paper-dim)' }}>
                      {isGenerating ? 'Measuring variance…' : 'No difference map available'}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. One-line caption (file name small and dim, pixel size next to it) */}
      <div className="atelier-caption">
        <span className="atelier-caption-filename">{fileName}</span>
        <span className="atelier-caption-dims">{width} × {height} px</span>
      </div>

      {/* 4. Focus Mode Overlay (Full screen with pure painting view) */}
      {isFocusMode && (
        <div className="v4-focus-mode" role="dialog" aria-label="Focus mode">
          <div className="v4-focus-header">
            <span className="v4-focus-title">Focus Mode</span>
            <span className="v4-focus-hint">Press Esc or F to exit</span>
            <button
              className="v4-btn"
              onClick={() => setIsFocusMode(false)}
              title="Exit focus mode (Esc or F)"
            >
              <span>✕</span>
            </button>
          </div>

          <div className="v4-focus-viewport">
            <div className="atelier-frame">
              <div className="atelier-crop-mark atelier-crop-mark--tl" />
              <div className="atelier-crop-mark atelier-crop-mark--tr" />
              <div className="atelier-crop-mark atelier-crop-mark--bl" />
              <div className="atelier-crop-mark atelier-crop-mark--br" />

              <div className="atelier-frame-content">
                {effectiveSvgUrl ? (
                  <img
                    src={effectiveSvgUrl}
                    alt="Vector painting result"
                    className="v4-preview-img"
                    draggable={false}
                  />
                ) : currentImgUrl ? (
                  <img
                    src={currentImgUrl}
                    alt="Original photograph"
                    className="v4-preview-img"
                    draggable={false}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
