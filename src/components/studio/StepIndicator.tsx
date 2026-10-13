import React from 'react';
import { Camera, Shapes, Terminal, Check } from 'lucide-react';

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
    <div className="stepper-bar">
      {/* Step 1 */}
      <div className={`stepper-item ${hasImage ? 'is-complete' : 'is-active'}`}>
        <div className="stepper-item__marker">
          {hasImage ? <Check size={14} /> : <Camera size={14} />}
        </div>
        <div className="stepper-item__content">
          <span className="stepper-item__tag mono">PHASE 1</span>
          <span className="stepper-item__title">
            {hasImage ? (faceDetected ? 'Face Landmark Ready' : 'Photo Calibrated') : 'Photo & Face Input'}
          </span>
        </div>
      </div>

      <div className="stepper-divider" />

      {/* Step 2 */}
      <div className={`stepper-item ${isStudio || portraitGenerated ? 'is-complete' : hasImage ? 'is-active' : 'is-future'}`}>
        <div className="stepper-item__marker">
          {isStudio || portraitGenerated ? <Check size={14} /> : <Shapes size={14} />}
        </div>
        <div className="stepper-item__content">
          <span className="stepper-item__tag mono">PHASE 2</span>
          <span className="stepper-item__title">
            {portraitGenerated ? 'Face Likeness Analyzed' : 'Geometric Landmark Analysis'}
          </span>
        </div>
      </div>

      <div className="stepper-divider" />

      {/* Step 3 */}
      <div className={`stepper-item ${portraitGenerated && !isStudio ? 'is-complete' : isStudio ? 'is-active' : 'is-future'}`}>
        <div className="stepper-item__marker">
          {portraitGenerated ? <Check size={14} /> : <Terminal size={14} />}
        </div>
        <div className="stepper-item__content">
          <span className="stepper-item__tag mono">PHASE 3 (ACTIVE)</span>
          <span className="stepper-item__title">Staged Vector Synthesis & Live SVG Code</span>
        </div>
      </div>
    </div>
  );
};
