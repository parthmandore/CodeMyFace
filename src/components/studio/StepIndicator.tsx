import React from 'react';
import { Camera, Eye, Code, Check } from 'lucide-react';

export interface StepIndicatorProps {
  hasImage: boolean;
  faceDetected?: boolean;
  portraitGenerated?: boolean;
  currentView?: 'upload' | 'studio';
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({
  hasImage,
  faceDetected,
  portraitGenerated,
  currentView = 'upload',
}) => {
  const isStudio = currentView === 'studio';

  return (
    <div className="studio-stepper-hud mono" aria-label="Pipeline Stages">
      <div className="studio-stepper-hud__inner">
        {/* Step 1: Input */}
        <div className={`stepper-hud-item ${hasImage ? 'is-complete' : 'is-active'}`}>
          <span className="stepper-hud-marker">
            {hasImage ? <Check size={11} /> : <Camera size={11} />}
          </span>
          <span className="stepper-hud-tag">01 // INPUT</span>
          <span className="stepper-hud-label">
            {hasImage ? 'Photo Ingested' : 'Ingest Photograph'}
          </span>
        </div>

        <span className="stepper-hud-divider" aria-hidden="true">→</span>

        {/* Step 2: Calibration */}
        <div className={`stepper-hud-item ${isStudio || portraitGenerated ? 'is-complete' : hasImage ? 'is-active' : 'is-pending'}`}>
          <span className="stepper-hud-marker">
            {isStudio || portraitGenerated ? <Check size={11} /> : <Eye size={11} />}
          </span>
          <span className="stepper-hud-tag">02 // CALIBRATION</span>
          <span className="stepper-hud-label">
            {hasImage ? (faceDetected ? 'Face & Geometry Calibrated' : 'Scene Geometry Calibrated') : 'Geometry & Tone Mesh'}
          </span>
        </div>

        <span className="stepper-hud-divider" aria-hidden="true">→</span>

        {/* Step 3: Synthesis */}
        <div className={`stepper-hud-item ${isStudio ? 'is-active' : 'is-pending'}`}>
          <span className="stepper-hud-marker">
            <Code size={11} />
          </span>
          <span className="stepper-hud-tag">03 // SYNTHESIS</span>
          <span className="stepper-hud-label">
            {isStudio ? 'Workbench Live' : 'Vector IDE & Output'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default StepIndicator;
