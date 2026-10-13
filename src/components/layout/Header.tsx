import React from 'react';
import { Cpu, ShieldCheck, Code, Layers } from 'lucide-react';
import { StatusPill, StatusPillVariant } from '../common/StatusPill';
import { FaceDetectionState } from '../../services/faceDetection/types';

export interface HeaderProps {
  currentView: 'upload' | 'studio';
  onViewChange: (view: 'upload' | 'studio') => void;
  hasValidImage: boolean;
  engineState: FaceDetectionState;
  onInitEngine?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onViewChange,
  hasValidImage,
  engineState,
  onInitEngine,
}) => {
  // Determine engine badge status
  let engineVariant: StatusPillVariant = 'neutral';
  let engineLabel = 'Engine: Offline';

  if (engineState === 'ready') {
    engineVariant = 'success';
    engineLabel = 'MediaPipe Ready';
  } else if (engineState === 'initializing' || engineState === 'detecting') {
    engineVariant = 'warning';
    engineLabel = engineState === 'detecting' ? 'Analyzing Face...' : 'Loading WASM...';
  } else if (engineState === 'error') {
    engineVariant = 'error';
    engineLabel = 'Engine Error';
  } else if (engineState === 'uninitialized') {
    engineVariant = 'neutral';
    engineLabel = 'MediaPipe Idle';
  }

  return (
    <header className="studio-header">
      <div className="studio-header__left">
        <div className="brand-logo" onClick={() => onViewChange('upload')} role="button" tabIndex={0}>
          <div className="brand-logo__glyph">
            {/* Geometric SVG Face Icon */}
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <polygon
                points="12,2 21,7 21,17 12,22 3,17 3,7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinejoin="round"
                className="glyph-hexagon"
              />
              <polyline
                points="12,2 12,12 21,17"
                stroke="currentColor"
                strokeWidth="1.25"
                opacity="0.8"
              />
              <polyline
                points="12,12 3,17"
                stroke="currentColor"
                strokeWidth="1.25"
                opacity="0.8"
              />
              <polyline
                points="7.5,9.5 12,12 16.5,9.5"
                stroke="var(--accent-secondary)"
                strokeWidth="1.5"
              />
              <circle cx="9" cy="8" r="1.2" fill="var(--accent-secondary)" />
              <circle cx="15" cy="8" r="1.2" fill="var(--accent-secondary)" />
              <circle cx="12" cy="14" r="1.2" fill="var(--accent-primary)" />
            </svg>
          </div>
          <div className="brand-logo__text">
            <span className="brand-logo__name">
              Code<span className="accent-gradient">MyFace</span>
            </span>
            <span className="brand-logo__badge mono">PHASE 1 · FOUNDATION</span>
          </div>
        </div>
      </div>

      <div className="studio-header__center">
        <nav className="studio-nav" aria-label="Workflow Navigation">
          <button
            type="button"
            className={`studio-nav__item ${currentView === 'upload' ? 'is-active' : ''}`}
            onClick={() => onViewChange('upload')}
          >
            <Layers size={16} />
            <span>Photo Input</span>
          </button>
          <button
            type="button"
            className={`studio-nav__item ${currentView === 'studio' ? 'is-active' : ''}`}
            onClick={() => onViewChange('studio')}
            disabled={!hasValidImage}
            title={!hasValidImage ? 'Upload and validate a photo first' : 'Open Workspace Shell'}
          >
            <Code size={16} />
            <span>Studio Shell</span>
            {!hasValidImage && <span className="studio-nav__lock-tag">Locked</span>}
          </button>
        </nav>
      </div>

      <div className="studio-header__right">
        {/* Local Privacy Guarantee */}
        <div className="privacy-pill" title="All processing occurs strictly inside your browser memory. No photos are ever uploaded.">
          <ShieldCheck size={14} className="privacy-pill__icon" />
          <span className="privacy-pill__text">100% Client-Side</span>
        </div>

        {/* MediaPipe Engine Status Indicator */}
        <div
          className="engine-status-container"
          onClick={engineState === 'uninitialized' || engineState === 'error' ? onInitEngine : undefined}
          style={{ cursor: engineState === 'uninitialized' || engineState === 'error' ? 'pointer' : 'default' }}
          title={engineState === 'error' ? 'Click to retry engine initialization' : 'MediaPipe Face Landmarker status'}
        >
          <StatusPill
            label={engineLabel}
            variant={engineVariant}
            icon={<Cpu size={13} />}
            pulse={engineState === 'initializing' || engineState === 'detecting'}
          />
        </div>
      </div>
    </header>
  );
};
