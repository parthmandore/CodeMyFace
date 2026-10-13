import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  Layers,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sparkles,
  Cpu,
  FileCode2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Download,
  SplitSquareVertical,
  Sliders,
  CheckSquare,
  Square,
  Users,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RotateCcw,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { ValidatedImage } from '../../types/upload';
import { PortraitModel, FacialHairOverride } from '../../types/portrait';
import { Button } from '../common/Button';
import { formatDimensions } from '../../utils/formatters';
import { colorToHex } from '../../engine/geometry';
import { buildPortraitModel, renderPortraitSvg } from '../../engine/svgRenderer';
import { estimateFacialHair } from '../../engine/heuristicFeatures';
import {
  createFaceProjection,
  extractReliableFacePoints,
} from '../../engine/coordinateTransform';
import {
  CONSTRUCTION_STAGES,
  buildStagedPortraitModel,
} from '../../engine/stagedConstruction';

export interface StudioStageProps {
  image: ValidatedImage | null;
  portraitModel: PortraitModel | null;
  svgString: string | null;
  onBackToUpload: () => void;
  onRegenerate?: () => void;
  error?: string | null;
}

export const StudioStage: React.FC<StudioStageProps> = ({
  image,
  portraitModel,
  svgString,
  onBackToUpload,
  onRegenerate,
  error,
}) => {
  const [zoomLevel, setZoomLevel] = useState(100);
  const [viewMode, setViewMode] = useState<'vector' | 'split' | 'source'>('vector');
  const [activeCodeTab, setActiveCodeTab] = useState<'svg' | 'json'>('svg');
  const [showMeshOverlay, setShowMeshOverlay] = useState(false);
  const [showLayerDrawer, setShowLayerDrawer] = useState(false);
  const [facialHairOverride, setFacialHairOverride] = useState<FacialHairOverride>('auto');
  const [copied, setCopied] = useState(false);

  // Staged construction state (indices 0 to 7)
  const [currentStageIdx, setCurrentStageIdx] = useState<number>(CONSTRUCTION_STAGES.length - 1);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [hasAutoPlayed, setHasAutoPlayed] = useState<boolean>(false);

  // Auto-play through stages smoothly when portraitModel first loads
  useEffect(() => {
    if (portraitModel && !hasAutoPlayed) {
      setCurrentStageIdx(0);
      setIsPlaying(true);
      setHasAutoPlayed(true);
    }
  }, [portraitModel, hasAutoPlayed]);

  // Stage advancement loop
  useEffect(() => {
    if (!isPlaying) return;
    if (currentStageIdx >= CONSTRUCTION_STAGES.length - 1) {
      setIsPlaying(false);
      return;
    }

    const timer = setTimeout(() => {
      setCurrentStageIdx((prev) => {
        if (prev >= CONSTRUCTION_STAGES.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 450);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStageIdx]);

  // Layer visibility state
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() => {
    if (!portraitModel) return {};
    const initial: Record<string, boolean> = {};
    for (const l of portraitModel.layers) {
      initial[l.id] = l.visible;
    }
    return initial;
  });

  // Re-render model and SVG if layer visibility or facial hair override is changed
  const activeModel = useMemo(() => {
    if (!portraitModel) return null;
    if (facialHairOverride === 'auto') {
      const modifiedLayers = portraitModel.layers.map((l) => ({
        ...l,
        visible: layerVisibility[l.id] !== undefined ? layerVisibility[l.id] : l.visible,
      }));
      return { ...portraitModel, layers: modifiedLayers };
    }

    // Recompute facial hair estimate with override
    const { features, palette } = portraitModel.analysis;
    const dummySampler = {
      sampleRegion: () => palette.skinBase,
      samplePixel: () => palette.skinBase,
    } as any;
    const overrideEstimate = estimateFacialHair(features, dummySampler, palette, undefined, {
      override: facialHairOverride,
    });
    const updatedAnalysis = {
      ...portraitModel.analysis,
      facialHairEstimate: overrideEstimate,
    };
    const rebuilt = buildPortraitModel(updatedAnalysis, 1000, 1000);
    const modifiedLayers = rebuilt.layers.map((l) => ({
      ...l,
      visible: l.id === 'layer-facial-hair'
        ? (facialHairOverride === 'off' ? false : (layerVisibility[l.id] !== undefined ? layerVisibility[l.id] : l.visible))
        : (layerVisibility[l.id] !== undefined ? layerVisibility[l.id] : l.visible),
    }));
    return { ...rebuilt, layers: modifiedLayers };
  }, [portraitModel, layerVisibility, facialHairOverride]);

  // Staged model and genuine SVG string corresponding to active stage
  const stagedResult = useMemo(() => {
    if (!activeModel) return null;
    return buildStagedPortraitModel(activeModel, currentStageIdx);
  }, [activeModel, currentStageIdx]);

  const activeSvgString = useMemo(() => {
    if (stagedResult) {
      return stagedResult.stagedSvgString;
    }
    if (!activeModel) return svgString || '';
    return renderPortraitSvg(activeModel);
  }, [stagedResult, activeModel, svgString]);

  const toggleLayer = (layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: prev[layerId] === false ? true : false,
    }));
  };

  const handleCopyCode = async () => {
    const textToCopy =
      activeCodeTab === 'svg'
        ? activeSvgString
        : JSON.stringify(activeModel?.analysis ?? portraitModel?.analysis, null, 2);

    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleDownloadSvg = () => {
    // Always download the complete final SVG (or current stage if not complete)
    const exportSvg = activeModel ? renderPortraitSvg(activeModel) : activeSvgString;
    if (!exportSvg) return;
    const blob = new Blob([exportSvg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${image?.filename.replace(/\.[^/.]+$/, '') || 'portrait'}_vector.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (error || (!portraitModel && image)) {
    return (
      <div className="studio-error-state mono">
        <div className="studio-error-state__icon">
          <AlertTriangle size={24} />
        </div>
        <h3 className="studio-error-state__title">Reconstruction Issue</h3>
        <p className="studio-error-state__desc">
          {error || 'Unable to build vector model from image landmarks. The photo may be partially occluded, blurry, or low light.'}
        </p>
        <div className="studio-error-state__actions">
          <Button variant="secondary" onClick={onBackToUpload} leftIcon={<ArrowLeft size={14} />}>
            Photo Input
          </Button>
          {onRegenerate && (
            <Button variant="primary" onClick={onRegenerate} leftIcon={<RefreshCw size={14} />}>
              Try Again
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (!image) {
    return (
      <div className="studio-empty-stage">
        <p>No photo calibrated yet.</p>
        <Button onClick={onBackToUpload} variant="primary">
          Upload Photo First
        </Button>
      </div>
    );
  }

  const analysis = portraitModel?.analysis;
  const svgLines = activeSvgString ? activeSvgString.split('\n') : [];
  const jsonLines = analysis ? JSON.stringify(analysis, null, 2).split('\n') : [];
  const displayLines = activeCodeTab === 'svg' ? svgLines : jsonLines;

  const projection = useMemo(() => {
    if (!analysis) return null;
    const reliableFacePoints = extractReliableFacePoints(analysis.features);
    const imgDim = {
      width: analysis.imageWidth || image?.width || 1000,
      height: analysis.imageHeight || image?.height || 1000,
    };
    return createFaceProjection(reliableFacePoints, imgDim, {
      width: portraitModel?.canvasWidth || 1000,
      height: portraitModel?.canvasHeight || 1000,
    });
  }, [analysis, image, portraitModel]);

  return (
    <div className="studio-shell-workspace">
      {/* Workspace Sub-header Toolbar */}
      <div className="workspace-toolbar">
        <div className="workspace-toolbar__left">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackToUpload}
            leftIcon={<ArrowLeft size={14} />}
          >
            Photo Input
          </Button>
          <div className="workspace-title-group">
            <span className="workspace-title mono">PHASE 2 VECTOR STUDIO</span>
            <span className="workspace-file-chip mono">
              {image.filename} ({formatDimensions(image.width, image.height)})
            </span>
          </div>

          {analysis && analysis.totalFacesDetected > 1 && (
            <div className="toolbar-multi-face-tag mono" title={analysis.totalFacesDetected + ' faces detected'}>
              <Users size={12} className="text-cyan" />
              <span>Face #{analysis.selectedFaceIndex + 1} of {analysis.totalFacesDetected}</span>
            </div>
          )}
        </div>

        <div className="workspace-toolbar__right">
          {/* View Mode Switcher */}
          <div className="view-mode-toggle">
            <button
              type="button"
              className={`mode-btn ${viewMode === 'vector' ? 'is-active' : ''}`}
              onClick={() => setViewMode('vector')}
              title="Rendered SVG Vector Art"
            >
              <Sparkles size={13} />
              <span>Vector</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${viewMode === 'split' ? 'is-active' : ''}`}
              onClick={() => setViewMode('split')}
              title="Compare Photo and Vector Portrait"
            >
              <SplitSquareVertical size={13} />
              <span>Split</span>
            </button>
            <button
              type="button"
              className={`mode-btn ${viewMode === 'source' ? 'is-active' : ''}`}
              onClick={() => setViewMode('source')}
              title="Original Source Selfie"
            >
              <span>Source</span>
            </button>
          </div>

          {/* Facial Hair Override Controls */}
          <div className="facial-hair-override-controls mono" title="Facial hair override">
            <span className="override-label">BEARD:</span>
            <button
              type="button"
              className={`override-btn ${facialHairOverride === 'auto' ? 'is-active' : ''}`}
              onClick={() => setFacialHairOverride('auto')}
              title="Automatic detection from photo"
            >
              Auto
            </button>
            <button
              type="button"
              className={`override-btn ${facialHairOverride === 'off' ? 'is-active' : ''}`}
              onClick={() => setFacialHairOverride('off')}
              title="Force facial hair off (Clean-shaven)"
            >
              Off
            </button>
            <button
              type="button"
              className={`override-btn ${facialHairOverride === 'on' ? 'is-active' : ''}`}
              onClick={() => setFacialHairOverride('on')}
              title="Force facial hair on"
            >
              On
            </button>
          </div>

          {/* Layer Inspector Toggle */}
          <button
            type="button"
            className={`wireframe-toggle-btn ${showLayerDrawer ? 'is-active' : ''}`}
            onClick={() => setShowLayerDrawer((v) => !v)}
            title="Inspect and toggle individual vector layers"
          >
            <Sliders size={13} />
            <span>Layers ({activeModel?.layers.filter((l) => layerVisibility[l.id] !== false).length ?? 10})</span>
          </button>

          {/* Zoom controls */}
          <div className="zoom-controls mono">
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.max(50, z - 25))}
              title="Zoom out"
            >
              <ZoomOut size={13} />
            </button>
            <span className="zoom-value">{zoomLevel}%</span>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoomLevel((z) => Math.min(200, z + 25))}
              title="Zoom in"
            >
              <ZoomIn size={13} />
            </button>
            <button
              type="button"
              className="zoom-btn"
              onClick={() => setZoomLevel(100)}
              title="Reset Zoom"
            >
              <Maximize2 size={13} />
            </button>
          </div>

          {/* Wireframe Mesh Toggle */}
          <button
            type="button"
            className={`wireframe-toggle-btn ${showMeshOverlay ? 'is-active' : ''}`}
            onClick={() => setShowMeshOverlay((v) => !v)}
            title={showMeshOverlay ? 'Hide Landmark Mesh' : 'Show Landmark Mesh'}
          >
            {showMeshOverlay ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>Mesh</span>
          </button>

          {/* Download SVG */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDownloadSvg}
            leftIcon={<Download size={13} />}
            title="Download clean standalone SVG vector artwork"
          >
            Export SVG
          </Button>
        </div>
      </div>

      {/* Layer Drawer (When toggled open) */}
      {showLayerDrawer && activeModel && (
        <div className="layers-inspector-bar">
          <div className="layers-inspector-bar__title mono">
            <Layers size={13} className="text-accent" />
            <span>PORTRAIT VECTOR LAYERS</span>
          </div>
          <div className="layers-chips-list">
            {activeModel.layers.map((layer) => {
              const isVisible = layerVisibility[layer.id] !== false;
              return (
                <button
                  key={layer.id}
                  type="button"
                  className={`layer-chip mono ${isVisible ? 'is-visible' : 'is-hidden'}`}
                  onClick={() => toggleLayer(layer.id)}
                >
                  {isVisible ? <CheckSquare size={13} /> : <Square size={13} />}
                  <span>{layer.name}</span>
                  <span className="layer-count">({layer.shapes.length})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Staged Construction Bar */}
      {stagedResult && (
        <div className="staged-construction-bar mono">
          <div className="staged-player-group">
            <button
              type="button"
              className="staged-player-btn"
              onClick={() => {
                if (currentStageIdx >= CONSTRUCTION_STAGES.length - 1) {
                  setCurrentStageIdx(0);
                  setIsPlaying(true);
                } else {
                  setIsPlaying(!isPlaying);
                }
              }}
              title={isPlaying ? 'Pause Construction' : 'Play / Replay Staged Construction'}
            >
              {isPlaying ? <Pause size={12} /> : currentStageIdx === CONSTRUCTION_STAGES.length - 1 ? <RotateCcw size={12} /> : <Play size={12} />}
              <span>{isPlaying ? 'Pause' : currentStageIdx === CONSTRUCTION_STAGES.length - 1 ? 'Replay' : 'Play'}</span>
            </button>

            <button
              type="button"
              className="staged-player-btn"
              disabled={currentStageIdx === 0}
              onClick={() => {
                setIsPlaying(false);
                setCurrentStageIdx((prev) => Math.max(0, prev - 1));
              }}
              title="Previous Construction Stage"
            >
              <SkipBack size={12} />
            </button>

            <button
              type="button"
              className="staged-player-btn"
              disabled={currentStageIdx === CONSTRUCTION_STAGES.length - 1}
              onClick={() => {
                setIsPlaying(false);
                setCurrentStageIdx((prev) => Math.min(CONSTRUCTION_STAGES.length - 1, prev + 1));
              }}
              title="Next Construction Stage"
            >
              <SkipForward size={12} />
            </button>

            {currentStageIdx < CONSTRUCTION_STAGES.length - 1 && (
              <button
                type="button"
                className="staged-player-btn text-accent"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStageIdx(CONSTRUCTION_STAGES.length - 1);
                }}
                title="Fast-forward to Final Portrait"
              >
                <span>Skip to Final</span>
              </button>
            )}
          </div>

          <div className="staged-steps-stepper">
            {CONSTRUCTION_STAGES.map((s, idx) => {
              const isActive = idx === currentStageIdx;
              const isPast = idx < currentStageIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`staged-step-pill ${isActive ? 'is-active' : isPast ? 'is-complete' : ''}`}
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStageIdx(idx);
                  }}
                  title={s.description}
                >
                  <span className="staged-step-num">{s.stepNumber}.</span>
                  <span>{s.shortName}</span>
                </button>
              );
            })}
          </div>

          <div className="staged-hud-tag">
            <span className="staged-hud-badge">{stagedResult.stage.badgeText}</span>
            <span className="text-secondary">{stagedResult.stage.description}</span>
          </div>
        </div>
      )}

      {/* Split-screen container */}
      <div className="studio-split-screen">
        {/* Left Pane: Code Generation Editor Shell (Shows real generated SVG) */}
        <div className="studio-pane studio-pane--code">
          <div className="studio-pane__header">
            <div className="pane-tabs">
              <button
                type="button"
                className={`pane-tab ${activeCodeTab === 'svg' ? 'is-active' : 'is-inactive'}`}
                onClick={() => setActiveCodeTab('svg')}
              >
                <FileCode2 size={13} className="text-accent" />
                <span>portrait.svg</span>
              </button>
              <button
                type="button"
                className={`pane-tab ${activeCodeTab === 'json' ? 'is-active' : 'is-inactive'}`}
                onClick={() => setActiveCodeTab('json')}
              >
                <Layers size={13} />
                <span>analysis.json</span>
              </button>
            </div>
            <div className="pane-actions">
              <button
                type="button"
                className="code-copy-btn mono"
                onClick={handleCopyCode}
                title="Copy code to clipboard"
              >
                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div className="code-editor-shell">
            <div className="code-editor-gutter mono" aria-hidden="true">
              {displayLines.slice(0, 120).map((_, i) => (
                <div key={i} className="gutter-line-number">
                  {i + 1}
                </div>
              ))}
            </div>

            <div className="code-editor-content mono">
              {displayLines.slice(0, 120).map((line, i) => {
                // Syntax coloring heuristics
                let lineClass = 'code-line text-secondary';
                if (line.startsWith('<?xml') || line.startsWith('<!--')) {
                  lineClass = 'code-line text-tertiary';
                } else if (line.includes('<svg') || line.includes('</svg>')) {
                  lineClass = 'code-line text-cyan';
                } else if (line.includes('<g') || line.includes('</g>')) {
                  lineClass = 'code-line text-accent';
                } else if (line.includes('<path') || line.includes('<circle')) {
                  lineClass = 'code-line text-primary';
                } else if (line.includes('fill=')) {
                  lineClass = 'code-line text-warning';
                }

                return (
                  <div key={i} className={lineClass}>
                    {line}
                  </div>
                );
              })}
              {displayLines.length > 120 && (
                <div className="code-line text-tertiary">
                  ... ({displayLines.length - 120} more lines in full export)
                </div>
              )}
            </div>
          </div>

          <div className="studio-pane__footer">
            <div className="footer-status-item mono">
              <Cpu size={12} className="text-accent" />
              <span>
                {activeCodeTab === 'svg'
                  ? stagedResult
                    ? `Stage ${stagedResult.stage.stepNumber}/8: ${stagedResult.stage.shortName} · ${stagedResult.activeLayerCount} Active Layers · ${stagedResult.activeShapesCount} Shapes · ${displayLines.length} SVG Lines`
                    : `Pure Vector SVG · ${displayLines.length} Lines · 0 Raster Embeds`
                  : `Face Metrics · Shape: ${analysis?.faceShape || 'oval'} · ${displayLines.length} Lines`}
              </span>
            </div>
          </div>
        </div>

        {/* Right Pane: Live Portrait & Vector Viewport */}
        <div className="studio-pane studio-pane--canvas">
          <div className="studio-pane__header">
            <div className="pane-tabs">
              <span className="pane-title">
                {viewMode === 'vector'
                  ? 'Rendered Vector Portrait'
                  : viewMode === 'split'
                  ? 'Side-by-Side: Photo & Vector'
                  : 'Source Photo'}
              </span>
            </div>
            <div className="pane-actions mono">
              <span className="pane-meta-chip">
                {portraitModel ? `${portraitModel.canvasWidth} × ${portraitModel.canvasHeight} px` : `${image.width} × ${image.height} px`}
              </span>
            </div>
          </div>

          <div className="canvas-viewport-stage">
            <div
              className="canvas-viewport-artboard"
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transition: 'transform 0.15s ease-out',
              }}
            >
              {/* Mode: Vector Portrait */}
              {viewMode === 'vector' && activeSvgString && (
                <div className="canvas-svg-container" style={{ position: 'relative' }}>
                  <div dangerouslySetInnerHTML={{ __html: activeSvgString }} />
                  {showMeshOverlay && projection && analysis?.features && (
                    <svg
                      className="canvas-vector-mesh-overlay"
                      viewBox={
                        portraitModel?.viewBox
                          ? `${portraitModel.viewBox.minX} ${portraitModel.viewBox.minY} ${portraitModel.viewBox.width} ${portraitModel.viewBox.height}`
                          : "0 0 1000 1000"
                      }
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {analysis.features.faceOutline.map((pt, idx) => {
                        const p = projection.toCanvas(pt);
                        return <circle key={`fo-${idx}`} cx={p.x} cy={p.y} r={2.5} className="mesh-point-key" />;
                      })}
                      {analysis.features.leftEyeContour.map((pt, idx) => {
                        const p = projection.toCanvas(pt);
                        return <circle key={`le-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-subtle" />;
                      })}
                      {analysis.features.rightEyeContour.map((pt, idx) => {
                        const p = projection.toCanvas(pt);
                        return <circle key={`re-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-subtle" />;
                      })}
                      {analysis.features.noseBridge.map((pt, idx) => {
                        const p = projection.toCanvas(pt);
                        return <circle key={`nb-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-subtle" />;
                      })}
                      {analysis.features.upperLip.map((pt, idx) => {
                        const p = projection.toCanvas(pt);
                        return <circle key={`ul-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-subtle" />;
                      })}
                    </svg>
                  )}
                </div>
              )}

              {/* Mode: Source Photo */}
              {viewMode === 'source' && (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                  <img
                    src={image.objectUrl}
                    alt="Source selfie portrait"
                    className="canvas-image"
                  />
                  {showMeshOverlay && analysis?.features && (
                    <svg
                      className="canvas-image-mesh-overlay"
                      viewBox={`0 0 ${image.width} ${image.height}`}
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {analysis.features.faceOutline.map((pt, idx) => (
                        <circle key={`fo-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(2, image.width * 0.005)} className="mesh-point-key" />
                      ))}
                      {analysis.features.leftEyeContour.map((pt, idx) => (
                        <circle key={`le-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.5, image.width * 0.0035)} className="mesh-point-subtle" />
                      ))}
                      {analysis.features.rightEyeContour.map((pt, idx) => (
                        <circle key={`re-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.5, image.width * 0.0035)} className="mesh-point-subtle" />
                      ))}
                      {analysis.features.noseBridge.map((pt, idx) => (
                        <circle key={`nb-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.5, image.width * 0.0035)} className="mesh-point-subtle" />
                      ))}
                      {analysis.features.upperLip.map((pt, idx) => (
                        <circle key={`ul-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.5, image.width * 0.0035)} className="mesh-point-subtle" />
                      ))}
                    </svg>
                  )}
                </div>
              )}

              {/* Mode: Split / Side-by-side comparison */}
              {viewMode === 'split' && (
                <div className="canvas-split-container">
                  <div className="split-half" style={{ position: 'relative' }}>
                    <img
                      src={image.objectUrl}
                      alt="Source photo"
                      className="canvas-image-split"
                    />
                    {showMeshOverlay && analysis?.features && (
                      <svg
                        className="canvas-image-mesh-overlay"
                        viewBox={`0 0 ${image.width} ${image.height}`}
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {analysis.features.allLandmarks && analysis.features.allLandmarks.length > 0 ? (
                          analysis.features.allLandmarks.map((pt, idx) => (
                            <circle
                              key={`lm-${idx}`}
                              cx={pt.x * image.width}
                              cy={pt.y * image.height}
                              r={Math.max(1.2, image.width * 0.0025)}
                              className="mesh-point-subtle"
                            />
                          ))
                        ) : (
                          analysis.features.faceOutline.map((pt, idx) => (
                            <circle key={`fo-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(2, image.width * 0.005)} className="mesh-point-key" />
                          ))
                        )}
                        {analysis.features.faceOutline.map((pt, idx) => (
                          <circle key={`kfo-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                        {analysis.features.leftEyeContour.map((pt, idx) => (
                          <circle key={`kle-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                        {analysis.features.rightEyeContour.map((pt, idx) => (
                          <circle key={`kre-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                        {analysis.features.noseBridge.map((pt, idx) => (
                          <circle key={`knb-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                        {analysis.features.upperLip.map((pt, idx) => (
                          <circle key={`kul-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                        {analysis.features.lowerLip.map((pt, idx) => (
                          <circle key={`kll-${idx}`} cx={pt.x * image.width} cy={pt.y * image.height} r={Math.max(1.8, image.width * 0.004)} className="mesh-point-key" />
                        ))}
                      </svg>
                    )}
                  </div>
                  <div className="split-divider-line" />
                  <div className="split-half" style={{ position: 'relative' }}>
                    <div
                      className="canvas-svg-container"
                      dangerouslySetInnerHTML={{ __html: activeSvgString }}
                    />
                    {showMeshOverlay && projection && analysis?.features && (
                      <svg
                        className="canvas-vector-mesh-overlay"
                        viewBox="0 0 1000 1000"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {analysis.features.allLandmarks && analysis.features.allLandmarks.length > 0 ? (
                          analysis.features.allLandmarks.map((pt, idx) => {
                            const p = projection.toCanvas(pt);
                            return <circle key={`v-lm-${idx}`} cx={p.x} cy={p.y} r={1.5} className="mesh-point-subtle" />;
                          })
                        ) : (
                          analysis.features.faceOutline.map((pt, idx) => {
                            const p = projection.toCanvas(pt);
                            return <circle key={`v-fo-${idx}`} cx={p.x} cy={p.y} r={2.5} className="mesh-point-key" />;
                          })
                        )}
                        {analysis.features.faceOutline.map((pt, idx) => {
                          const p = projection.toCanvas(pt);
                          return <circle key={`v-kfo-${idx}`} cx={p.x} cy={p.y} r={2.2} className="mesh-point-key" />;
                        })}
                        {analysis.features.leftEyeContour.map((pt, idx) => {
                          const p = projection.toCanvas(pt);
                          return <circle key={`v-kle-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-key" />;
                        })}
                        {analysis.features.rightEyeContour.map((pt, idx) => {
                          const p = projection.toCanvas(pt);
                          return <circle key={`v-kre-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-key" />;
                        })}
                        {analysis.features.upperLip.map((pt, idx) => {
                          const p = projection.toCanvas(pt);
                          return <circle key={`v-kul-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-key" />;
                        })}
                        {analysis.features.lowerLip.map((pt, idx) => {
                          const p = projection.toCanvas(pt);
                          return <circle key={`v-kll-${idx}`} cx={p.x} cy={p.y} r={2} className="mesh-point-key" />;
                        })}
                      </svg>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Diagnostics and Palette Ribbon */}
          <div className="studio-pane__footer diagnostics-ribbon mono">
            {analysis && (
              <div className="diagnostics-items">
                <span className="diag-chip">
                  <span className="diag-label">Shape:</span>
                  <span className="diag-value text-accent">{analysis.faceShape.toUpperCase()}</span>
                </span>
                <span className="diag-chip">
                  <span className="diag-label">Skin:</span>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: colorToHex(analysis.palette.skinBase) }}
                  />
                  <span className="diag-value">{colorToHex(analysis.palette.skinBase)}</span>
                </span>
                <span className="diag-chip">
                  <span className="diag-label">Hair:</span>
                  <span
                    className="color-swatch"
                    style={{ backgroundColor: colorToHex(analysis.hairEstimate.color) }}
                  />
                  <span className="diag-value">
                    {analysis.hairEstimate.length} ({analysis.hairEstimate.style}{analysis.hairEstimate.parting ? `, ${analysis.hairEstimate.parting}` : ''})
                  </span>
                </span>
                <span className="diag-chip">
                  <span className="diag-label">Beard:</span>
                  <span className={`diag-value ${analysis.facialHairEstimate.hasBeard ? 'text-warning' : 'text-success'}`}>
                    {analysis.facialHairEstimate.hasBeard ? analysis.facialHairEstimate.density : 'clean-shaven'}
                  </span>
                </span>
                <span className="diag-chip">
                  <span className="diag-label">Mesh:</span>
                  <span className="diag-value text-accent">
                    {analysis.totalLandmarksDetected ?? (analysis.features.allLandmarks?.length ?? 478)} pts
                  </span>
                </span>
                <span className="diag-chip">
                  <span className="diag-label">Latency:</span>
                  <span className="diag-value text-success">{analysis.analysisTimeMs} ms</span>
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
