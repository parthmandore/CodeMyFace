import { describe, it, expect } from 'vitest';
import { formatBytes, formatDimensions, formatAspectRatio } from '../formatters';

describe('formatters', () => {
  describe('formatBytes', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('formats bytes, kilobytes, and megabytes', () => {
      expect(formatBytes(500)).toBe('500 Bytes');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
    });
  });

  describe('formatDimensions', () => {
    it('formats width and height as localized px string', () => {
      expect(formatDimensions(1920, 1080)).toContain('1,920');
      expect(formatDimensions(1920, 1080)).toContain('1,080');
      expect(formatDimensions(1920, 1080)).toContain('px');
    });
  });

  describe('formatAspectRatio', () => {
    it('identifies 1:1 Square', () => {
      expect(formatAspectRatio(1000, 1000)).toBe('1:1 Square');
    });

    it('identifies 3:4 and 4:5 portraits', () => {
      expect(formatAspectRatio(750, 1000)).toBe('3:4 Portrait');
      expect(formatAspectRatio(800, 1000)).toBe('4:5 Portrait');
    });

    it('identifies 16:9 Landscape', () => {
      expect(formatAspectRatio(1920, 1080)).toBe('16:9 Landscape');
    });
  });
});
