import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}) => {
  const baseClasses = `studio-btn studio-btn--${variant} studio-btn--${size} ${className}`;

  return (
    <button
      className={baseClasses}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <span className="studio-btn__spinner" aria-hidden="true" />
      ) : (
        leftIcon && <span className="studio-btn__icon-left">{leftIcon}</span>
      )}
      <span className="studio-btn__text">{children}</span>
      {!isLoading && rightIcon && (
        <span className="studio-btn__icon-right">{rightIcon}</span>
      )}
    </button>
  );
};
