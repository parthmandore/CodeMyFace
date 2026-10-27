import React, { useState, useEffect } from 'react';
import { ValidatedImage } from './types/upload';
import { FaceDetectionResult } from './services/faceDetection/types';
import { useFaceDetection } from './services/faceDetection';
import { SegmentationService } from './services/segmentation/segmentationService';
import { Header } from './components/layout/Header';
import { StepIndicator } from './components/studio/StepIndicator';
import { UploadWorkflow } from './components/upload/UploadWorkflow';
import { V4DiagnosticWorkbench } from './components/studio/V4DiagnosticWorkbench';
import { safeRevokeObjectURL } from './utils/imageLoader';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'upload' | 'studio'>('upload');
  const [currentImage, setCurrentImage] = useState<ValidatedImage | null>(null);

  // Initialize MediaPipe engines eagerly in background
  const { state: engineState, initialize: initEngine } = useFaceDetection(true);

  // Direct route detection for #v4-workbench, #studio, etc.
  useEffect(() => {
    const checkHash = () => {
      if (
        window.location.hash.includes('v4') ||
        window.location.hash.includes('studio') ||
        window.location.search.includes('view=v4') ||
        window.location.search.includes('v4=1')
      ) {
        if (currentImage) {
          setCurrentView('studio');
        } else {
          setCurrentView('upload');
        }
      }
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, [currentImage]);

  useEffect(() => {
    SegmentationService.getInstance().initialize().catch((err) => {
      console.warn('Failed to eagerly initialize SegmentationService:', err);
    });
  }, []);

  // Clean up object URL when app unmounts
  useEffect(() => {
    return () => {
      if (currentImage?.objectUrl) {
        safeRevokeObjectURL(currentImage.objectUrl);
      }
    };
  }, [currentImage]);

  const handleImageChange = (newImage: ValidatedImage | null) => {
    if (currentImage?.objectUrl) {
      safeRevokeObjectURL(currentImage.objectUrl);
    }
    setCurrentImage(newImage);
  };

  const handleContinueToStudio = (
    _detectionResult?: FaceDetectionResult,
    _imgElement?: HTMLImageElement
  ) => {
    setCurrentView('studio');
  };

  const handleViewChange = (view: 'upload' | 'studio') => {
    if (view === 'studio' && !currentImage) {
      setCurrentView('upload');
      return;
    }
    setCurrentView(view);
  };

  return (
    <div className="codemyface-app">
      {currentView === 'upload' && (
        <>
          <Header
            currentView={currentView}
            onViewChange={handleViewChange}
            hasValidImage={Boolean(currentImage)}
            engineState={engineState}
            onInitEngine={initEngine}
          />
          <StepIndicator
            hasImage={Boolean(currentImage)}
            portraitGenerated={false}
            currentView={currentView}
          />
          <main className="studio-main-content">
            <div className="studio-page-container">
              <UploadWorkflow
                currentImage={currentImage}
                onImageChange={handleImageChange}
                onContinue={handleContinueToStudio}
                isGenerating={false}
              />
            </div>
          </main>
        </>
      )}

      {currentView === 'studio' && (
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
          <V4DiagnosticWorkbench
            onBackToStudio={() => {
              setCurrentImage(null);
              setCurrentView('upload');
            }}
            initialImageUrl={currentImage?.objectUrl}
            initialFileName={currentImage?.file?.name}
          />
        </main>
      )}
    </div>
  );
};

export default App;
