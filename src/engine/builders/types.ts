import {
  FaceAnalysis,
  FacialFeatures,
  PortraitPalette,
  HairEstimate,
  FacialHairEstimate,
  Vec2,
  PortraitViewBox,
} from '../../types/portrait';

export interface BuilderContext {
  analysis: FaceAnalysis;
  features: FacialFeatures;
  palette: PortraitPalette;
  hairEstimate: HairEstimate;
  facialHairEstimate: FacialHairEstimate;
  canvasWidth: number;
  canvasHeight: number;
  viewBox: PortraitViewBox;
  imgDim: { width: number; height: number };
  toCanvas: (p: Vec2) => Vec2;
  scale: number;
  isLightLeft: boolean;
  isLightRight: boolean;
}
