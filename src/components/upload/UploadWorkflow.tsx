import React, { useState, useRef, useCallback } from 'react';
import { ValidatedImage, UploadError } from '../../types/upload';
import { validateImageFile } from '../../utils/imageValidator';
import { loadImageFromFile, safeRevokeObjectURL } from '../../utils/imageLoader';
import { Dropzone } from './Dropzone';
import { PhotoPreview } from './PhotoPreview';
import { ErrorAlert } from '../common/ErrorAlert';
import { Sparkles, Code2, ShieldAlert } from 'lucide-react';

import { FaceDetectionResult } from '../../services/faceDetection/types';

export interface UploadWorkflowProps {
  currentImage: ValidatedImage | null;
  onImageChange: (image: ValidatedImage | null) => void;
  onContinue: (detectionResult?: FaceDetectionResult, img?: HTMLImageElement) => void;
  isGenerating?: boolean;
}

export const UploadWorkflow: React.FC<UploadWorkflowProps> = ({
  currentImage,
  onImageChange,
  onContinue,
  isGenerating = false,
}) => {
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<UploadError | null>(null);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      setIsValidating(true);
      setError(null);

      try {
        // Step 1: Pre-decoding validation (file existence, size limit, MIME, magic bytes)
        const validationResult = await validateImageFile(file);

        if (!validationResult.valid) {
          setError(validationResult.error);
          setIsValidating(false);
          return;
        }

        // Step 2: In-browser bitmap decoding and dimension check
        const loadResult = await loadImageFromFile(file, validationResult.mimeType);

        if (!loadResult.success) {
          setError(loadResult.error);
          setIsValidating(false);
          return;
        }

        // Step 3: Success — cleanly revoke old object URL if any, and set new image
        if (currentImage?.objectUrl) {
          safeRevokeObjectURL(currentImage.objectUrl);
        }

        onImageChange(loadResult.image);
      } catch (err) {
        console.error('Unhandled upload processing error:', err);
        setError({
          code: 'SYSTEM_ERROR',
          message: 'An unexpected error occurred while processing the image file.',
          details: err instanceof Error ? err.message : String(err),
          timestamp: Date.now(),
        });
      } finally {
        setIsValidating(false);
      }
    },
    [currentImage, onImageChange]
  );

  const handleRemovePhoto = useCallback(() => {
    if (currentImage?.objectUrl) {
      safeRevokeObjectURL(currentImage.objectUrl);
    }
    onImageChange(null);
    setError(null);
  }, [currentImage, onImageChange]);

  const handleTriggerReplace = useCallback(() => {
    replaceFileInputRef.current?.click();
  }, []);

  const handleReplaceInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFile(files[0]);
      }
      e.target.value = '';
    },
    [processFile]
  );

  return (
    <div className="upload-workflow-section">
      {/* Hidden file input for Replace Action */}
      <input
        ref={replaceFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleReplaceInputChange}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Intro hero header explaining photo-to-vector recreation */}
      {!currentImage && (
        <div className="studio-hero">
          <div
            className="studio-hero__badge mono"
            style={{
              borderColor: 'rgba(255, 79, 46, 0.4)',
              background: 'rgba(255, 79, 46, 0.1)',
              color: '#FF4F2E',
            }}
          >
            <Sparkles size={13} style={{ color: '#FF4F2E' }} />
            <span>ENGINE V4 ACTIVE · GEOMETRIC VECTOR PORTRAIT</span>
          </div>
          <h1 className="studio-hero__title">
            Transform Your Portrait into <span className="text-gradient">Original Geometric Vector Code</span>
          </h1>
          <p className="studio-hero__subtitle">
            Upload your selfie to calibrate face geometry. CodeMyFace synthesizes stylized,
            mathematical polygon vectors rendered alongside live SVG code — completely inside your browser with zero cloud storage.
          </p>
        </div>
      )}

      {/* Error alert banner */}
      {error && (
        <div className="workflow-alert-wrapper">
          <ErrorAlert error={error} onDismiss={() => setError(null)} />
        </div>
      )}

      {/* Upload Dropzone (Empty State) or Photo Preview (Loaded State) */}
      {!currentImage ? (
        <>
          <Dropzone
            onFileSelected={processFile}
            isValidating={isValidating}
          />

          {/* Quick Test Sample Fixtures Picker */}
        </>
      ) : (
        <PhotoPreview
          image={currentImage}
          onReplace={handleTriggerReplace}
          onRemove={handleRemovePhoto}
          onContinue={onContinue}
          isGenerating={isGenerating}
        />
      )}

      {/* Feature highlight cards for studio setup */}
      {!currentImage && (
        <div className="studio-features-grid">
          <div className="feature-card">
            <div className="feature-card__icon-box">
              <Sparkles size={18} className="text-accent" />
            </div>
            <h4 className="feature-card__title">Stylized Vector Art</h4>
            <p className="feature-card__description">
              Pure geometric polygon artwork, not photo filters or raster overlays. Every facet is an SVG path.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card__icon-box">
              <Code2 size={18} className="text-cyan" />
            </div>
            <h4 className="feature-card__title">Split-Screen Code Stream</h4>
            <p className="feature-card__description">
              Watch clean, formatted SVG vector markup generate line-by-line beside your portrait canvas.
            </p>
          </div>

          <div className="feature-card">
            <div className="feature-card__icon-box">
              <ShieldAlert size={18} className="text-success" />
            </div>
            <h4 className="feature-card__title">Private & In-Memory</h4>
            <p className="feature-card__description">
              MediaPipe WASM models run locally on your device. Your photo never leaves your machine.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
