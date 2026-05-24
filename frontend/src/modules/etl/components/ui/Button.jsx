import React from 'react';
import './Button.css';

export function Button({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isFullWidth,
  className = '', 
  ...props 
}) {
  return (
    <button 
      className={`btn btn-${variant} btn-${size} ${isFullWidth ? 'btn-full' : ''} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
