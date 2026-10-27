import React, { useEffect, useState } from 'react';

export interface ToastItem {
  id: string;
  message: string;
  type?: 'info' | 'success' | 'warn' | 'error';
}

export interface V4ToastProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export const V4Toast: React.FC<V4ToastProps> = ({ toasts, onDismiss }) => {
  return (
    <div className="atelier-toast-container" aria-live="polite">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
};

const ToastCard: React.FC<{ toast: ToastItem; onDismiss: () => void }> = ({ toast, onDismiss }) => {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsFading(true);
      setTimeout(onDismiss, 200);
    }, 2500);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const typeClass =
    toast.type === 'warn'
      ? 'atelier-toast--warn'
      : toast.type === 'error'
      ? 'atelier-toast--error'
      : toast.type === 'success'
      ? 'atelier-toast--success'
      : '';

  return (
    <div
      className={`atelier-toast ${typeClass} ${isFading ? 'is-fading' : ''}`}
      onClick={() => {
        setIsFading(true);
        setTimeout(onDismiss, 160);
      }}
      role="alert"
    >
      <span className="atelier-toast-dot" />
      <span className="atelier-toast-msg">{toast.message}</span>
    </div>
  );
};
