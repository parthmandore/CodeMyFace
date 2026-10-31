import React from 'react';
import { FullImageGeometryData } from '../../../services/geometry/imageGeometryService';
import { NormalizedLandmark } from '../../../services/faceDetection';
import { ChevronDown, EyeOff, GitCommit, Layers, Orbit, Sparkles } from 'lucide-react';
import '../../../styles/geometryOverlay.css';

export type GeometryOverlayMode = 'none' | 'geometry' | 'contours' | 'landmarks' | 'paths';

export interface GeometryOverlayProps {
  width: number;
  height: number;
  mode: GeometryOverlayMode;
  geometryData: FullImageGeometryData | null;
  landmarks?: NormalizedLandmark[];
  svgPaths?: Array<{ d: string; colorHex?: string }>;
  accentColor?: string;
  className?: string;
}

export const GeometryOverlay: React.FC<GeometryOverlayProps> = ({
  width,
  height,
  mode,
  geometryData,
  landmarks = [],
  svgPaths = [],
  accentColor = '#FF4F2E',
  className = '',
}) => {
  if (mode === 'none' || (!geometryData && landmarks.length === 0 && svgPaths.length === 0)) {
    return null;
  }

  return (
    <div
      className={`geometry-overlay-container ${className}`}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: '100%' }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* OVERLAY 1: Full-Image Geometry Mesh */}
        {mode === 'geometry' && geometryData && (
          <g className="geometry-layer-mesh">
            {/* Structural edge contours across hair, body, clothing, and scene */}
            {geometryData.edgeContours.map((c) => (
              <path
                key={`geo-contour-${c.id}`}
                d={c.d}
                className="geo-line--contour-base"
              />
            ))}

            {/* Delaunay & proximity mesh lines across entire image */}
            {geometryData.meshLines.map((ln, idx) => (
              <line
                key={`mesh-ln-${idx}`}
                x1={ln.x1}
                y1={ln.y1}
                x2={ln.x2}
                y2={ln.y2}
                className={`geo-line ${
                  ln.type === 'edge'
                    ? 'geo-line--edge'
                    : ln.type === 'landmark'
                    ? 'geo-line--landmark'
                    : 'geo-line--grid'
                }`}
              />
            ))}

            {/* Junction Nodes */}
            {geometryData.meshNodes.map((pt, idx) => (
              <circle
                key={`mesh-pt-${idx}`}
                cx={pt.x}
                cy={pt.y}
                r={pt.isKey ? 2.5 : 1.5}
                className={`geo-node ${pt.isKey ? 'geo-node--key' : 'geo-node--subtle'}`}
              />
            ))}

            {/* Biometric Feature Highlights if Landmarks Available */}
            {geometryData.facialLandmarksAvailable && landmarks.length >= 33 && (
              <g className="geometry-layer-facial-biometrics">
                {[10, 152, 33, 263, 61, 291, 1, 4, 168, 197].map((lIdx) => {
                  const pt = landmarks[lIdx];
                  if (!pt) return null;
                  return (
                    <circle
                      key={`bio-key-${lIdx}`}
                      cx={pt.x * width}
                      cy={pt.y * height}
                      r={2.5}
                      className="geo-landmark-dot--major"
                    />
                  );
                })}
              </g>
            )}
          </g>
        )}

        {/* OVERLAY 2: Edge Contours across Whole Image */}
        {mode === 'contours' && geometryData && (
          <g className="geometry-layer-contours">
            {geometryData.edgeContours.map((c) => (
              <path
                key={c.id}
                d={c.d}
                className={`geo-contour-path ${c.isKey ? 'geo-contour-path--key' : ''}`}
              />
            ))}
          </g>
        )}

        {/* OVERLAY 3: Facial Landmarks (Optional biometric analysis overlay) */}
        {mode === 'landmarks' && landmarks.length > 0 && (
          <g className="geometry-layer-landmarks">
            {landmarks.map((pt, idx) => {
              const isMajor = idx % 8 === 0 || idx === 1 || idx === 10 || idx === 152;
              return (
                <circle
                  key={`lm-${idx}`}
                  cx={pt.x * width}
                  cy={pt.y * height}
                  r={isMajor ? 2.8 : 1.2}
                  className={`geo-landmark-dot ${isMajor ? 'geo-landmark-dot--major' : ''}`}
                />
              );
            })}
          </g>
        )}

        {/* OVERLAY 4: Final SVG Reconstructed Paths */}
        {mode === 'paths' && svgPaths.length > 0 && (
          <g className="geometry-layer-paths">
            {svgPaths.slice(0, 180).map((p, idx) => (
              <path
                key={`svg-p-${idx}`}
                d={p.d}
                fill="none"
                stroke={p.colorHex || accentColor}
                strokeWidth={0.8}
                strokeOpacity={0.85}
                className="geo-vector-wireframe"
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
};

/* --------------------------------------------------------------------------
   Visualization Controls Toolbar
   -------------------------------------------------------------------------- */
export interface GeometryOverlayControlsProps {
  activeMode: GeometryOverlayMode;
  onModeChange: (mode: GeometryOverlayMode) => void;
  hasLandmarks?: boolean;
  hasSvgPaths?: boolean;
  className?: string;
}

export const GeometryOverlayControls: React.FC<GeometryOverlayControlsProps> = ({
  activeMode,
  onModeChange,
  hasLandmarks = false,
  hasSvgPaths = false,
  className = '',
}) => {
  return (
    <div className={`geometry-controls-bar ${className}`} role="toolbar" aria-label="Geometry visualization overlays">
      <div className="geometry-controls-label mono">
        <span>OVERLAYS:</span>
      </div>

      <div className="geometry-controls-group">
        <button
          type="button"
          className={`v4-btn geo-ctrl-btn ${activeMode === 'none' ? 'is-active' : ''}`}
          onClick={() => onModeChange('none')}
          title="Hide all overlays — view clean photograph or vector result"
        >
          <EyeOff size={12} />
          <span>None</span>
        </button>

        <button
          type="button"
          className={`v4-btn geo-ctrl-btn ${activeMode === 'geometry' ? 'is-active' : ''}`}
          onClick={() => onModeChange(activeMode === 'geometry' ? 'none' : 'geometry')}
          title="Full-image geometry mesh covering hair, body, clothing, and background objects"
        >
          <Orbit size={12} />
          <span>Full Geometry</span>
        </button>

        <button
          type="button"
          className={`v4-btn geo-ctrl-btn ${activeMode === 'contours' ? 'is-active' : ''}`}
          onClick={() => onModeChange(activeMode === 'contours' ? 'none' : 'contours')}
          title="Genuine edge contours derived from gradient analysis across the whole scene"
        >
          <GitCommit size={12} />
          <span>Edge Contours</span>
        </button>

        <button
          type="button"
          className={`v4-btn geo-ctrl-btn ${activeMode === 'landmarks' ? 'is-active' : ''}`}
          onClick={() => onModeChange(activeMode === 'landmarks' ? 'none' : 'landmarks')}
          disabled={!hasLandmarks}
          title={hasLandmarks ? 'Facial landmarks analysis overlay (478 biometric points)' : 'No face landmarks detected in this image'}
        >
          <Sparkles size={12} />
          <span>Landmarks{hasLandmarks ? '' : ' (N/A)'}</span>
        </button>

        {hasSvgPaths && (
          <button
            type="button"
            className={`v4-btn geo-ctrl-btn ${activeMode === 'paths' ? 'is-active' : ''}`}
            onClick={() => onModeChange(activeMode === 'paths' ? 'none' : 'paths')}
            title="Final reconstructed SVG path wireframe outlines"
          >
            <Layers size={12} />
            <span>SVG Paths</span>
          </button>
        )}
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------
   Inspect Popover Menu (Collapsed Single Control in Result Header)
   -------------------------------------------------------------------------- */
export interface InspectPopoverProps {
  activeMode: GeometryOverlayMode;
  onModeChange: (mode: GeometryOverlayMode) => void;
  hasLandmarks?: boolean;
  hasSvgPaths?: boolean;
}

export const InspectPopover: React.FC<InspectPopoverProps> = ({
  activeMode,
  onModeChange,
  hasLandmarks = false,
  hasSvgPaths = false,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const hasActiveOverlay = activeMode !== 'none';

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectOption = (mode: GeometryOverlayMode) => {
    onModeChange(mode);
    setIsOpen(false);
  };

  const options: Array<{
    id: GeometryOverlayMode;
    label: string;
    disabled?: boolean;
    disabledHint?: string;
  }> = [
    { id: 'none', label: 'None' },
    { id: 'geometry', label: 'Full Geometry' },
    { id: 'contours', label: 'Edge Contours' },
    {
      id: 'landmarks',
      label: hasLandmarks ? 'Facial Landmarks' : 'Facial Landmarks (N/A)',
      disabled: !hasLandmarks,
      disabledHint: 'No facial landmarks detected in photo',
    },
    {
      id: 'paths',
      label: hasSvgPaths ? 'SVG Paths' : 'SVG Paths (N/A)',
      disabled: !hasSvgPaths,
      disabledHint: 'SVG paths not yet generated',
    },
  ];

  return (
    <div className="v4-inspect-popover-container" ref={containerRef}>
      <button
        type="button"
        className={`v4-btn v4-inspect-trigger ${hasActiveOverlay ? 'has-active-overlay' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title="Toggle inspection overlays"
      >
        <span
          style={{
            color: hasActiveOverlay ? 'var(--vermilion)' : 'inherit',
            fontWeight: hasActiveOverlay ? 500 : 400,
          }}
        >
          Inspect
        </span>
        <ChevronDown size={12} style={{ marginLeft: '4px' }} />
      </button>

      {isOpen && (
        <div className="v4-inspect-menu" role="menu" aria-label="Inspection overlays">
          <div className="v4-inspect-menu__header mono">OVERLAYS</div>
          {options.map((opt) => (
            <label
              key={opt.id}
              className={`v4-inspect-menu__item ${activeMode === opt.id ? 'is-selected' : ''} ${
                opt.disabled ? 'is-disabled' : ''
              }`}
              title={opt.disabled ? opt.disabledHint : opt.label}
              onClick={(e) => {
                if (opt.disabled) {
                  e.preventDefault();
                  return;
                }
                selectOption(opt.id);
              }}
            >
              <input
                type="radio"
                name="inspect-overlay-radio"
                checked={activeMode === opt.id}
                disabled={opt.disabled}
                onChange={() => selectOption(opt.id)}
                className="v4-inspect-radio"
              />
              <span className="v4-inspect-menu__label">{opt.label}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
