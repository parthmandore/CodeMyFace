import React from 'react';

export type StatusPillVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export interface StatusPillProps {
  label: string;
  variant?: StatusPillVariant;
  icon?: React.ReactNode;
  pulse?: boolean;
  className?: string;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  label,
  variant = 'neutral',
  icon,
  pulse = false,
  className = '',
}) => {
  return (
    <span className={`status-pill status-pill--${variant} ${className}`}>
      {pulse && <span className="status-pill__pulse" aria-hidden="true" />}
      {icon ? <span className="status-pill__icon">{icon}</span> : <span className="status-pill__dot" />}
      <span className="status-pill__label">{label}</span>
    </span>
  );
};
