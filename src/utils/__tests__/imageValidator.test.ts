import { describe, it, expect } from 'vitest';
import { validateImageFile } from '../imageValidator';

describe('imageValidator', () => {
  it('rejects empty file (0 bytes)', async () => {
    const emptyFile = new File([], 'test.jpg', { type: 'image/jpeg' });
    const result = await validateImageFile(emptyFile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('EMPTY_FILE');
    }
  });

  it('rejects oversized files exceeding 10 MB', async () => {
    // 11 MB dummy file
    const largeBuffer = new Uint8Array(11 * 1024 * 1024);
    largeBuffer[0] = 0xff;
    largeBuffer[1] = 0xd8;
    largeBuffer[2] = 0xff;
    const oversizedFile = new File([largeBuffer], 'large.jpg', { type: 'image/jpeg' });

    const result = await validateImageFile(oversizedFile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('FILE_TOO_LARGE');
    }
  });

  it('rejects unsupported file formats like pdf or gif', async () => {
    const pdfBuffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const pdfFile = new File([pdfBuffer], 'doc.pdf', { type: 'application/pdf' });

    const result = await validateImageFile(pdfFile);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('UNSUPPORTED_TYPE');
    }
  });

  it('rejects corrupted image files with mismatched magic bytes', async () => {
    // Text contents renamed to .jpg
    const textBuffer = new TextEncoder().encode('Not a real image file');
    const fakeJpg = new File([textBuffer], 'fake.jpg', { type: 'image/jpeg' });

    const result = await validateImageFile(fakeJpg);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error.code).toBe('CORRUPT_IMAGE');
    }
  });

  it('accepts valid JPEG file with correct magic bytes', async () => {
    const jpegBuffer = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const validJpg = new File([jpegBuffer], 'photo.jpg', { type: 'image/jpeg' });

    const result = await validateImageFile(validJpg);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mimeType).toBe('image/jpeg');
    }
  });

  it('accepts valid PNG file with correct magic bytes', async () => {
    const pngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validPng = new File([pngBuffer], 'photo.png', { type: 'image/png' });

    const result = await validateImageFile(validPng);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mimeType).toBe('image/png');
    }
  });

  it('accepts valid WebP file with correct RIFF...WEBP magic bytes', async () => {
    const webpBuffer = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x00, 0x00, 0x00, // file size
      0x57, 0x45, 0x42, 0x50, // 'WEBP'
      0x56, 0x50, 0x38, 0x20  // 'VP8 '
    ]);
    const validWebp = new File([webpBuffer], 'photo.webp', { type: 'image/webp' });

    const result = await validateImageFile(validWebp);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.mimeType).toBe('image/webp');
    }
  });
});
