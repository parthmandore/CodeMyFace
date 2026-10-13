import React, { useState, useEffect, useRef } from 'react';
import {
  Trash2,
  RefreshCw,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Sparkles,
  Users,
} from 'lucide-react';
import { ValidatedImage } from '../../types/upload';
import { formatBytes, formatDimensions, formatAspectRatio } from '../../utils/formatters';
import { FaceDetectionResult } from '../../services/faceDetection/types';
import { useFaceDetection } from '../../services/faceDetection';
import { Button } from '../common/Button';

export interface PhotoPreviewProps {
  image: ValidatedImage;
  onReplace: () => void;
  onRemove: () => void;
  onContinue: (detectionResult?: FaceDetectionResult, img?: HTMLImageElement) => void;
  isGenerating?: boolean;
}

export const PhotoPreview: React.FC<PhotoPreviewProps> = ({
  image,
  onReplace,
  onRemove,
  onContinue,
  isGenerating = false,
}) => {
  const [showMeshOverlay, setShowMeshOverlay] = useState(true);
  const [detectionResult, setDetectionResult] = useState<FaceDetectionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const { detect, isReady, initialize, state: engineState, errorMessage: engineError } = useFaceDetection(true);

  // Run face landmark detection when image or engine is ready
  useEffect(() => {
    let isCancelled = false;

    async function runDetection() {
      if (!imgRef.current) return;
      setIsAnalyzing(true);

      try {
        if (!isReady && engineState === 'uninitialized') {
          await initialize();
        }

        if (imgRef.current && imgRef.current.complete) {
          const result = await detect(imgRef.current);
          if (!isCancelled) {
            setDetectionResult(result);
          }
        }
      } catch (err) {
        console.error('Detection execution error:', err);
      } finally {
        if (!isCancelled) {
          setIsAnalyzing(false);
        }
      }
    }

    // If image is already loaded, run detection
    if (imgRef.current && imgRef.current.complete) {
      runDetection();
    }

    return () => {
      isCancelled = true;
    };
  }, [image.objectUrl, isReady, engineState, detect, initialize]);

  const handleImageLoad = async () => {
    if (imgRef.current) {
      setIsAnalyzing(true);
      try {
        const result = await detect(imgRef.current);
        setDetectionResult(result);
      } catch (err) {
        console.error('Detection load error:', err);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleContinueClick = () => {
    onContinue(detectionResult || undefined, imgRef.current || undefined);
  };

  const hasFace = detectionResult?.detected && (detectionResult.faceCount > 0);

  return (
    <div className="preview-container">
      {/* Top action toolbar */}
      <div className="preview-toolbar">
        <div className="preview-toolbar__meta mono">
          <span className="preview-chip format-chip">{image.mimeType.replace('image/', '').toUpperCase()}</span>
          <span className="preview-chip">{formatBytes(image.sizeBytes)}</span>
          <span className="preview-chip">{formatDimensions(image.width, image.height)}</span>
          <span className="preview-chip">{formatAspectRatio(image.width, image.height)}</span>
        </div>

        <div className="preview-toolbar__actions">
          <Button
            variant="ghost"
            size="sm"
            onClick={onReplace}
            leftIcon={<RefreshCw size={14} />}
            title="Choose a different image file"
            disabled={isGenerating}
          >
            Replace Photo
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={onRemove}
            leftIcon={<Trash2 size={14} />}
            title="Remove current photo"
            disabled={isGenerating}
          >
            Remove
          </Button>
        </div>
      </div>

      {/* Main Preview Canvas Viewport */}
      <div className="preview-viewport-card">
        <div className="preview-image-stage">
          {/* Base Photographic Image */}
          <img
            ref={imgRef}
            src={image.objectUrl}
            alt="Source selfie portrait for vector recreation"
            className="preview-image"
            onLoad={handleImageLoad}
          />

          {/* MediaPipe Mesh & Bounding Box Landmark Overlay */}
          {showMeshOverlay && detectionResult?.landmarks && detectionResult.landmarks.length > 0 && (
            <svg
              className="preview-mesh-overlay"
              viewBox="0 0 1000 1000"
              preserveAspectRatio="none"
              aria-label="MediaPipe Face Landmark Mesh Visualization"
            >
              {/* Optional bounding box */}
              {detectionResult.boundingBox && (
                <rect
                  x={detectionResult.boundingBox.xMin * 1000}
                  y={detectionResult.boundingBox.yMin * 1000}
                  width={detectionResult.boundingBox.width * 1000}
                  height={detectionResult.boundingBox.height * 1000}
                  className="mesh-bounding-box"
                />
              )}

              {/* 478 Landmark Points */}
              {detectionResult.landmarks.map((pt, idx) => (
                <circle
                  key={idx}
                  cx={pt.x * 1000}
                  cy={pt.y * 1000}
                  r={idx % 10 === 0 ? 3 : 1.5}
                  className={idx % 10 === 0 ? 'mesh-point-key' : 'mesh-point-subtle'}
                />
              ))}
            </svg>
          )}

          {/* Overlay Toggle Switch (if landmarks are available) */}
          {detectionResult?.landmarks && detectionResult.landmarks.length > 0 && (
            <button
              type="button"
              className="mesh-toggle-btn"
              onClick={() => setShowMeshOverlay((v) => !v)}
              title={showMeshOverlay ? 'Hide Landmark Mesh' : 'Show Landmark Mesh'}
            >
              {showMeshOverlay ? <EyeOff size={14} /> : <Eye size={14} />}
              <span>{showMeshOverlay ? 'Hide Landmark Mesh' : 'Show Landmark Mesh'}</span>
            </button>
          )}

          {/* Analyzing HUD Badge */}
          {isAnalyzing && (
            <div className="analyzing-hud">
              <div className="analyzing-hud__spinner" />
              <span>Analyzing face geometry...</span>
            </div>
          )}
        </div>

        {/* Technical Calibration & Face Detection Report Card */}
        <div className="calibration-report">
          <div className="calibration-report__header">
            <div className="calibration-report__title-row">
              <span className="calibration-icon-box">
                {hasFace ? (
                  <CheckCircle2 size={18} className="text-success" />
                ) : isAnalyzing ? (
                  <Cpu size={18} className="text-warning pulse-spin" />
                ) : (
                  <AlertTriangle size={18} className="text-warning" />
                )}
              </span>
              <div>
                <h4 className="calibration-title">
                  {hasFace
                    ? 'Face Geometry Verified'
                    : isAnalyzing
                    ? 'Processing MediaPipe Face Landmarker...'
                    : 'No Distinct Face Detected'}
                </h4>
                <p className="calibration-description">
                  {hasFace
                    ? `Identified ${detectionResult?.landmarks?.length || 478} 3D facial landmark points across eye contours, jawline, and nose bridge.`
                    : isAnalyzing
                    ? 'Evaluating facial orientation and landmark points using browser WASM runtime...'
                    : 'The model could not detect a clear human face in this photo. You can still continue to the studio shell or replace the photo with a clearer selfie.'}
                </p>
              </div>
            </div>

            {detectionResult?.latencyMs !== undefined && (
              <span className="latency-badge mono">
                Inference: {detectionResult.latencyMs} ms
              </span>
            )}
          </div>

          {/* Multiple faces detected notification */}
          {detectionResult?.selectionMessage && (
            <div className="multi-face-notice mono">
              <Users size={14} className="text-cyan" />
              <span>{detectionResult.selectionMessage}</span>
            </div>
          )}

          {engineError && (
            <div className="engine-error-notice">
              <AlertTriangle size={15} />
              <span>{engineError}</span>
            </div>
          )}

          {/* Primary Action Button */}
          <div className="calibration-cta-row">
            <div className="calibration-cta-hint">
              <Sparkles size={14} className="text-accent" />
              <span>
                Phase 2 Vector Engine: Converts calibrated geometry into a stylized 10-layer geometric vector portrait.
              </span>
            </div>

            <Button
              variant="primary"
              size="lg"
              onClick={handleContinueClick}
              rightIcon={<ArrowRight size={18} />}
              className="primary-continue-btn"
              isLoading={isGenerating}
              disabled={isAnalyzing}
            >
              {isGenerating ? 'Synthesizing Vector Portrait...' : 'Generate Vector Portrait'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
