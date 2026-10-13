import { PortraitLayer, PortraitShape } from '../../types/portrait';
import { colorToHex } from '../geometry';
import { BuilderContext } from './types';

/**
 * Layer 1: Background (Solid Warm Canvas)
 */
export function buildBackgroundLayer(ctx: BuilderContext): PortraitLayer {
  const { viewBox, palette } = ctx;

  const bgShapes: PortraitShape[] = [
    {
      id: 'canvas-bg',
      type: 'path',
      pathData: `M ${viewBox.minX} ${viewBox.minY} L ${viewBox.minX + viewBox.width} ${viewBox.minY} L ${viewBox.minX + viewBox.width} ${viewBox.minY + viewBox.height} L ${viewBox.minX} ${viewBox.minY + viewBox.height} Z`,
      fill: colorToHex(palette.background),
      opacity: 1,
      provenance: 'template-generated',
    },
  ];

  return {
    id: 'layer-background',
    name: '1. Background',
    order: 1,
    shapes: bgShapes,
    visible: true,
  };
}
