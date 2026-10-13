import React, { useState, useEffect } from 'react';
import { ValidatedImage } from './types/upload';
import { PortraitModel } from './types/portrait';
import { FaceDetectionResult } from './services/faceDetection/types';
import { useFaceDetection } from './services/faceDetection';
import { generatePortrait } from './engine/portraitPipeline';
import { Header } from './components/layout/Header';
import { StepIndicator } from './components/studio/StepIndicator';
import { UploadWorkflow } from './components/upload/UploadWorkflow';
import { StudioStage } from './components/studio/StudioStage';
import { safeRevokeObjectURL } from './utils/imageLoader';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';

export const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<'upload' | 'studio'>('upload');
  const [currentImage, setCurrentImage] = useState<ValidatedImage | null>(null);
  const [portraitModel, setPortraitModel] = useState<PortraitModel | null>(null);
  const [svgString, setSvgString] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Cached detection inputs for retry/regenerate
  const [lastDetection, setLastDetection] = useState<FaceDetectionResult | null>(null);
  const [lastImgElement, setLastImgElement] = useState<HTMLImageElement | null>(null);

  // Initialize MediaPipe engine eagerly in background
  const { state: engineState, initialize: initEngine } = useFaceDetection(true);

  // Clean up object URL when app unmounts
  useEffect(() => {
    return () => {
      if (currentImage?.objectUrl) {
        safeRevokeObjectURL(currentImage.objectUrl);
      }
    };
  }, [currentImage]);

  const handleImageChange = (newImage: ValidatedImage | null) => {
    setCurrentImage(newImage);
    setPortraitModel(null);
    setSvgString(null);
    setGenerationError(null);
    setLastDetection(null);
    setLastImgElement(null);
    if (!newImage && currentView === 'studio') {
      setCurrentView('upload');
    }
  };

  const runSynthesis = async (
    detectionResult: FaceDetectionResult,
    imgElement: HTMLImageElement
  ) => {
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const result = await generatePortrait(imgElement, detectionResult);
      if (result.success && result.model && result.svgString) {
        setPortraitModel(result.model);
        setSvgString(result.svgString);
        setCurrentView('studio');
      } else {
        setGenerationError(result.error || 'Face reconstruction pipeline could not generate vector model.');
        setCurrentView('studio');
      }
    } catch (err) {
      console.error('Portrait synthesis failed:', err);
      setGenerationError(err instanceof Error ? err.message : String(err));
      setCurrentView('studio');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleContinueToStudio = async (
    detectionResult?: FaceDetectionResult,
    imgElement?: HTMLImageElement
  ) => {
    if (!currentImage) return;

    if (detectionResult) setLastDetection(detectionResult);
    if (imgElement) setLastImgElement(imgElement);

    // If face detection succeeded and image element is available, run synthesis
    if (detectionResult?.detected && imgElement) {
      await runSynthesis(detectionResult, imgElement);
    } else {
      setGenerationError('No face detected in photo. Please ensure a clear face is visible.');
      setCurrentView('studio');
    }
  };

  const handleRegenerate = async () => {
    if (lastDetection && lastImgElement) {
      await runSynthesis(lastDetection, lastImgElement);
    } else {
      setCurrentView('upload');
    }
  };

  const handleBackToUpload = () => {
    setCurrentView('upload');
  };

  return (
    <div className="codemyface-app">
      <Header
        currentView={currentView}
        onViewChange={(view) => {
          if (view === 'studio' && !currentImage) return;
          setCurrentView(view);
        }}
        hasValidImage={Boolean(currentImage)}
        engineState={engineState}
        onInitEngine={initEngine}
      />

      {currentView === 'upload' && (
        <>
          <StepIndicator
            hasImage={Boolean(currentImage)}
            portraitGenerated={Boolean(portraitModel)}
            currentView={currentView}
          />
          <main className="studio-main-content">
            <div className="studio-page-container">
              <UploadWorkflow
                currentImage={currentImage}
                onImageChange={handleImageChange}
                onContinue={handleContinueToStudio}
                isGenerating={isGenerating}
              />
            </div>
          </main>
        </>
      )}

      {currentView === 'studio' && (
        <main className="studio-main-workspace">
          <StudioStage
            image={currentImage}
            portraitModel={portraitModel}
            svgString={svgString}
            onBackToUpload={handleBackToUpload}
            onRegenerate={handleRegenerate}
            error={generationError}
          />
        </main>
      )}
    </div>
  );
};

export default App;
