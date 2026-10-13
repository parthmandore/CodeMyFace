import React from 'react';
import { AlertCircle, X } from 'lucide-react';
import { UploadError } from '../../types/upload';

export interface ErrorAlertProps {
  error: UploadError | null;
  onDismiss?: () => void;
  className?: string;
}

export const ErrorAlert: React.FC<ErrorAlertProps> = ({
  error,
  onDismiss,
  className = '',
}) => {
  if (!error) return null;

  return (
    <div className={`error-alert ${className}`} role="alert">
      <div className="error-alert__icon">
        <AlertCircle size={20} />
      </div>
      <div className="error-alert__body">
        <div className="error-alert__header">
          <span className="error-alert__code mono">[{error.code}]</span>
          <span className="error-alert__message">{error.message}</span>
        </div>
        {error.details && (
          <p className="error-alert__details">{error.details}</p>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="error-alert__close"
          aria-label="Dismiss error notification"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
};
