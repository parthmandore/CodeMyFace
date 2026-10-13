/**
 * Formatting helpers for file size, dimensions, and visual metadata
 */

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const safeIndex = Math.min(i, sizes.length - 1);

  return `${parseFloat((bytes / Math.pow(k, safeIndex)).toFixed(dm))} ${sizes[safeIndex]}`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width.toLocaleString()} × ${height.toLocaleString()} px`;
}

export function formatAspectRatio(width: number, height: number): string {
  if (!width || !height) return '1:1';

  const ratio = width / height;

  // Check common photographic aspect ratios within 3% tolerance
  if (Math.abs(ratio - 1.0) < 0.05) return '1:1 Square';
  if (Math.abs(ratio - (4 / 5)) < 0.04) return '4:5 Portrait';
  if (Math.abs(ratio - (3 / 4)) < 0.04) return '3:4 Portrait';
  if (Math.abs(ratio - (2 / 3)) < 0.04) return '2:3 Portrait';
  if (Math.abs(ratio - (9 / 16)) < 0.04) return '9:16 Vertical';
  if (Math.abs(ratio - (4 / 3)) < 0.04) return '4:3 Landscape';
  if (Math.abs(ratio - (16 / 9)) < 0.04) return '16:9 Landscape';

  return `${ratio.toFixed(2)}:1`;
}
