import { ValidatedImage, UploadError } from '../types/upload';
import { SupportedMimeType, createUploadError } from './imageValidator';

/**
 * Image loader and object URL lifecycle management
 */

/**
 * Safely releases an object URL from browser memory
 */
export function safeRevokeObjectURL(url: string | null | undefined): void {
  if (url && typeof url === 'string' && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignored if already revoked
    }
  }
}

/**
 * Loads an image from a File using an Object URL and validates image decoding
 */
export async function loadImageFromFile(
  file: File,
  mimeType: SupportedMimeType
): Promise<{ success: true; image: ValidatedImage } | { success: false; error: UploadError }> {
  let objectUrl: string | null = null;

  try {
    objectUrl = URL.createObjectURL(file);
    const img = new Image();

    // Prevent cross-origin taint issues
    img.crossOrigin = 'anonymous';

    const loadPromise = new Promise<{ width: number; height: number }>((resolve, reject) => {
      img.onload = () => {
        resolve({
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      };

      img.onerror = () => {
        reject(new Error('Failed to decode image data into bitmap'));
      };
    });

    img.src = objectUrl;
    const { width, height } = await loadPromise;

    if (!width || !height || width <= 0 || height <= 0) {
      safeRevokeObjectURL(objectUrl);
      return {
        success: false,
        error: createUploadError(
          'CORRUPT_IMAGE',
          'Image dimensions are zero or invalid.',
          'The image file could not be rendered as a graphic bitmap.'
        ),
      };
    }

    const validatedImage: ValidatedImage = {
      file,
      objectUrl,
      width,
      height,
      sizeBytes: file.size,
      mimeType,
      filename: file.name,
      aspectRatio: width / height,
      lastModified: file.lastModified,
    };

    return {
      success: true,
      image: validatedImage,
    };
  } catch {
    if (objectUrl) {
      safeRevokeObjectURL(objectUrl);
    }

    return {
      success: false,
      error: createUploadError(
        'CORRUPT_IMAGE',
        'Corrupted image file: unable to decode bitmap.',
        'The image data is corrupted or cannot be parsed by your browser.'
      ),
    };
  }
}
