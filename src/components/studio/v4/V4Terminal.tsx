import React, { useRef, useEffect, useState, useCallback } from 'react';

export interface TerminalLog {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error' | 'summary';
}

export interface FinalSummaryData {
  paths: number;
  sizeBytes: number;
  gzipBytes: number;
  durationMs: number;
  colorError: number;
  ssim: number;
  speckCount?: number;
}

export interface V4TerminalProps {
  logs: TerminalLog[];
  onClearLogs: () => void;
  isGenerating: boolean;
  progressPercent: number;
  generationStage: string;
  onCancel: () => void;
  colorMetrics?: {
    skin?: { hex: string; r: number; g: number; b: number };
    lips?: { hex: string; r: number; g: number; b: number };
    hair?: { hex: string; r: number; g: number; b: number };
    bg?: { hex: string; r: number; g: number; b: number };
  };
  summaryData?: FinalSummaryData | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  mode?: 'painting' | 'recreation';
}

export const V4Terminal: React.FC<V4TerminalProps> = ({
  logs,
  onClearLogs,
  isGenerating,
  progressPercent: _progressPercent,
  generationStage,
  onCancel,
  colorMetrics,
  summaryData,
  isCollapsed = false,
  onToggleCollapse,
  mode = 'painting',
}) => {
  const terminalBodyRef = useRef<HTMLDivElement | null>(null);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const startWorkTimeRef = useRef<number>(0);

  useEffect(() => {
    if (isGenerating) {
      startWorkTimeRef.current = performance.now();
      setElapsedSeconds(0);
      const timer = setInterval(() => {
        const sec = (performance.now() - startWorkTimeRef.current) / 1000;
        setElapsedSeconds(sec);
      }, 100);
      return () => clearInterval(timer);
    }
  }, [isGenerating]);

  const handleScroll = useCallback(() => {
    if (!terminalBodyRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = terminalBodyRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight <= 35;
    setAutoScroll(isAtBottom);
  }, []);

  useEffect(() => {
    if (autoScroll && terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
    }
  }, [logs, isGenerating, summaryData, autoScroll]);

  const scrollToBottom = () => {
    if (terminalBodyRef.current) {
      terminalBodyRef.current.scrollTop = terminalBodyRef.current.scrollHeight;
      setAutoScroll(true);
    }
  };

  const handleCopyLogs = () => {
    const text = logs.map((l) => `[${l.timestamp}] ${l.message}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '-';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  if (isCollapsed) {
    let summaryText = 'Choose a photo';
    if (isGenerating) {
      summaryText = `Working... ${elapsedSeconds.toFixed(1)} s`;
    } else if (summaryData) {
      summaryText = `Done · ${formatBytes(summaryData.sizeBytes)} · ${formatBytes(summaryData.gzipBytes)} gzip · ${summaryData.paths.toLocaleString()} paths · ${(summaryData.durationMs / 1000).toFixed(2)}s · [L] open log`;
    }

    return (
      <div
        className="v4-terminal-collapsed-bar"
        onClick={onToggleCollapse}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleCollapse?.();
          }
        }}
        title="Click or press L to open log"
      >
        <div className="v4-terminal-collapsed-left">
          <span className="v4-terminal-collapsed-preview">{summaryText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="v4-terminal-section">
      {/* 1. Atelier Terminal Header: "studio.log" */}
      <div className="v4-terminal-header">
        <div className="v4-terminal-title">
          <span className="v4-terminal-prompt">›</span>
          <span className="v4-terminal-title-name">{mode === 'recreation' ? 'recreation.log' : 'studio.log'}</span>
          {isGenerating ? (
            <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
              Working... {elapsedSeconds.toFixed(1)} s
            </span>
          ) : summaryData ? (
            <span style={{ fontSize: '12px', color: 'var(--moss)' }}>Done</span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--paper-dim)' }}>Choose a photo</span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isGenerating && (
            <button
              className="v4-btn"
              style={{
                height: '24px',
                padding: '0 8px',
                fontSize: '12px',
                borderColor: 'var(--vermilion)',
                color: 'var(--vermilion)',
              }}
              onClick={onCancel}
              title="Cancel background task"
            >
              <span>Cancel</span>
            </button>
          )}

          {!autoScroll && (
            <button
              className="v4-btn"
              style={{
                height: '24px',
                padding: '0 8px',
                fontSize: '12px',
                borderColor: 'var(--accent)',
                color: 'var(--paper)',
              }}
              onClick={scrollToBottom}
              title="Resume automatic scrolling"
            >
              <span>Resume scroll</span>
            </button>
          )}

          <button
            className="v4-btn"
            style={{ height: '24px', padding: '0 8px', fontSize: '12px' }}
            onClick={onClearLogs}
            title="Clear terminal logs"
          >
            <span>Clear</span>
          </button>

          <button
            className="v4-btn"
            style={{ height: '24px', padding: '0 8px', fontSize: '12px' }}
            onClick={handleCopyLogs}
            title="Copy logs"
          >
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          {onToggleCollapse && (
            <button
              className="v4-btn"
              style={{ height: '24px', padding: '0 8px', fontSize: '12px' }}
              onClick={onToggleCollapse}
              title="Collapse terminal to status bar (L)"
            >
              <span>[L] Collapse</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Terminal Body */}
      <div className="v4-terminal-body" ref={terminalBodyRef} onScroll={handleScroll}>
        {/* Real-time Color Palette Card */}
        {colorMetrics && (colorMetrics.skin || colorMetrics.lips || colorMetrics.hair) && (
          <div className="atelier-palette-card">
            <div style={{ color: 'var(--paper-dim)', fontSize: '12px' }}>
              Source colors sampled (biometric anchors):
            </div>
            <div className="atelier-swatches-row">
              {colorMetrics.skin && (
                <div className="atelier-swatch-item">
                  <span className="atelier-swatch-box" style={{ backgroundColor: colorMetrics.skin.hex }} />
                  <span>Skin: {colorMetrics.skin.hex}</span>
                </div>
              )}
              {colorMetrics.lips && (
                <div className="atelier-swatch-item">
                  <span className="atelier-swatch-box" style={{ backgroundColor: colorMetrics.lips.hex }} />
                  <span>Lips: {colorMetrics.lips.hex}</span>
                </div>
              )}
              {colorMetrics.hair && (
                <div className="atelier-swatch-item">
                  <span className="atelier-swatch-box" style={{ backgroundColor: colorMetrics.hair.hex }} />
                  <span>Hair: {colorMetrics.hair.hex}</span>
                </div>
              )}
              {colorMetrics.bg && (
                <div className="atelier-swatch-item">
                  <span className="atelier-swatch-box" style={{ backgroundColor: colorMetrics.bg.hex }} />
                  <span>Background: {colorMetrics.bg.hex}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Final Summary Block: Prominently displayed at top when log is opened */}
        {summaryData && (
          <div className="atelier-summary-card">
            <div className="atelier-summary-header">
              {mode === 'recreation' ? 'Recreation Synthesis Record' : 'Studio Synthesis Record'}
            </div>
            <div className="atelier-summary-grid">
              <div className="atelier-summary-item">
                <span className="atelier-summary-label">Total paths drawn</span>
                <span className="atelier-summary-num">{summaryData.paths.toLocaleString()}</span>
              </div>

              <div className="atelier-summary-item">
                <span className="atelier-summary-label">SVG payload size</span>
                <span className="atelier-summary-num">{formatBytes(summaryData.sizeBytes)}</span>
              </div>

              <div className="atelier-summary-item">
                <span className="atelier-summary-label">Gzip transfer size</span>
                <span className="atelier-summary-num">{formatBytes(summaryData.gzipBytes)}</span>
              </div>

              <div className="atelier-summary-item">
                <span className="atelier-summary-label">Synthesis duration</span>
                <span className="atelier-summary-num">{(summaryData.durationMs / 1000).toFixed(2)}s</span>
              </div>

              <div className="atelier-summary-item">
                <span className="atelier-summary-label">Reconstruction mode</span>
                <span className="atelier-summary-num">{mode === 'recreation' ? 'Recreation' : 'Painting'}</span>
              </div>

              <div className="atelier-summary-item">
                <span className="atelier-summary-label">Synthesis status</span>
                <span className="atelier-summary-num atelier-summary-num--moss">Success</span>
              </div>

              {summaryData.speckCount !== undefined && (
                <div className="atelier-summary-item">
                  <span className="atelier-summary-label">Isolated specks (&lt;10px)</span>
                  <span className="atelier-summary-num">{summaryData.speckCount}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Stage Status (Plain text, no loading bar or spinner) */}
        {isGenerating && (
          <div className="atelier-progress-card" style={{ padding: '6px 10px', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--accent)' }}>
              Working... {elapsedSeconds.toFixed(1)} s — {generationStage}
            </span>
          </div>
        )}

        {/* Timestamped Log Entries */}
        {logs.map((log) => {
          let msgColor = 'var(--paper)';
          if (log.type === 'error') {
            msgColor = 'var(--vermilion)';
          } else if (log.type === 'success') {
            msgColor = 'var(--moss)';
          }

          return (
            <div key={log.id} className="v4-terminal-log">
              <span className="v4-terminal-prompt">›</span>
              <span className="v4-terminal-time">[{log.timestamp}]</span>
              <span className="v4-terminal-msg" style={{ color: msgColor }}>
                {log.message}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
export default V4Terminal;
