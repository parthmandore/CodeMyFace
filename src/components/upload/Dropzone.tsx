import React, { useRef, useState, useCallback } from 'react';
import { UploadCloud, Image as ImageIcon, Sparkles } from 'lucide-react';
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
    // Only deactivate if leaving target entirely
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
    // Reset file input value so selecting the same file again triggers change
    e.target.value = '';
  };

  return (
    <div
      className={`studio-dropzone ${isDragOver ? 'is-drag-over' : ''} ${isValidating ? 'is-validating' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label="Upload photo area. Drag and drop a photo or click to browse files"
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

      <div className="studio-dropzone__glow" aria-hidden="true" />

      <div className="studio-dropzone__content">
        <div className="studio-dropzone__icon-wrapper">
          {isValidating ? (
            <div className="studio-dropzone__spinner" />
          ) : isDragOver ? (
            <UploadCloud size={36} className="studio-dropzone__icon pulse-scale" />
          ) : (
            <ImageIcon size={36} className="studio-dropzone__icon" />
          )}
        </div>

        <div className="studio-dropzone__text-group">
          <h3 className="studio-dropzone__heading">
            {isValidating
              ? 'Verifying and decoding photo...'
              : isDragOver
              ? 'Drop your selfie here'
              : 'Choose a selfie or drop it here'}
          </h3>
          <p className="studio-dropzone__subheading">
            Drag and drop or tap to browse your local device files
          </p>
        </div>

        <div className="studio-dropzone__specs-badge mono">
          <span className="spec-item">JPEG · PNG · WebP</span>
          <span className="spec-dot">•</span>
          <span className="spec-item">Up to {formatBytes(maxSizeBytes)}</span>
          <span className="spec-dot">•</span>
          <span className="spec-item">Processed strictly in-memory</span>
        </div>

        <button
          type="button"
          className="studio-btn studio-btn--secondary studio-btn--md studio-dropzone__button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          disabled={isValidating}
        >
          <UploadCloud size={16} />
          <span>Browse File</span>
        </button>
      </div>

      <div className="studio-dropzone__tips">
        <div className="dropzone-tip">
          <Sparkles size={14} className="dropzone-tip__icon" />
          <span>Best results: Single face, forward-facing angle, and good lighting</span>
        </div>
      </div>
    </div>
  );
};
