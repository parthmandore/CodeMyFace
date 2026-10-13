/**
 * Upload domain types and data contracts
 */

export type UploadErrorCode = 
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'CORRUPT_IMAGE'
  | 'EMPTY_FILE'
  | 'READ_ERROR'
  | 'SYSTEM_ERROR';

export interface UploadError {
  code: UploadErrorCode;
  message: string;
  details?: string;
  timestamp: number;
}

export interface ValidatedImage {
  file: File;
  objectUrl: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  filename: string;
  aspectRatio: number; // width / height
  lastModified: number;
}

export type UploadWorkflowStatus = 'idle' | 'validating' | 'ready' | 'error';
