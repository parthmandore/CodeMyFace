import React, { useRef, useState, useCallback } from 'react';
import { Upload, Image as ImageIcon, Sparkles, CheckCircle2 } from 'lucide-react';
import { formatBytes } from '../../utils/formatters';
import { DEFAULT_MAX_FILE_SIZE_BYTES } from '../../utils/imageValidator';

export interface DropzoneProps {
  onFileSelected: (file: File) => void;
  isValidating: boolean;
  maxSizeBytes?: number;
}

export const Dropzone: React.FC<DropzoneProps> = ({
  onFileSelected,
  isValidating,
  maxSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  }, [isDragOver]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (isValidating) return;

      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        onFileSelected(files[0]);
      }
    },
    [isValidating, onFileSelected]
  );

  const handleClick = () => {
    if (isValidating) return;
    fileInputRef.current?.click();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelected(files[0]);
    }
    e.target.value = '';
  };

  return (
    <div
      className={`studio-dropzone-chamber ${isDragOver ? 'is-drag-over' : ''} ${isValidating ? 'is-validating' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label="Upload photo area. Drag and drop a photograph or click to browse files"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleInputChange}
        className="sr-only"
        aria-hidden="true"
        disabled={isValidating}
      />

      <div className="dropzone-chamber__content">
        <div className="dropzone-chamber__icon-box">
          {isValidating ? (
            <div className="dropzone-chamber__spinner" aria-hidden="true" />
          ) : isDragOver ? (
            <Upload size={30} style={{ color: 'var(--accent)' }} />
          ) : (
            <ImageIcon size={30} style={{ color: 'var(--paper-dim)' }} />
          )}
        </div>

        <div className="dropzone-chamber__text-group">
          <h2 className="dropzone-chamber__heading">
            {isValidating
              ? 'Verifying and calibrating image buffer…'
              : isDragOver
              ? 'Release to ingest photograph'
              : 'Drop a photograph here, or browse files'}
          </h2>
          <p className="dropzone-chamber__subheading">
            Drag and drop anywhere, or select an image from your local drive
          </p>
        </div>

        <div className="dropzone-chamber__specs mono">
          <span className="spec-item">FORMATS: JPEG · PNG · WebP</span>
          <span className="spec-sep" aria-hidden="true">|</span>
          <span className="spec-item">LIMIT: {formatBytes(maxSizeBytes)}</span>
          <span className="spec-sep" aria-hidden="true">|</span>
          <span className="spec-item" style={{ color: 'var(--moss)' }}>
            <CheckCircle2 size={11} style={{ display: 'inline', marginRight: '4px' }} />
            IN-MEMORY ONLY
          </span>
        </div>

        <button
          type="button"
          className="v4-btn dropzone-chamber__action-btn"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          disabled={isValidating}
        >
          <Upload size={13} style={{ marginRight: '6px' }} />
          <span>Select Photograph</span>
        </button>
      </div>

      <div className="dropzone-chamber__footer mono">
        <div className="dropzone-chamber__tip">
          <Sparkles size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span>Recommendation: Forward-facing portraits, figures, or compositions with balanced contrast yield optimal vector contour tracking.</span>
        </div>
      </div>
    </div>
  );
};

export default Dropzone;
