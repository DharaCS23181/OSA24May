import React from 'react';
import { motion } from 'framer-motion';
import './Card.css';

export function Card({ 
  children, 
  title, 
  subtitle, 
  icon: Icon,
  className = '', 
  hoverable = false,
  glass = false,
  onClick,
  gradient
}) {
  return (
    <motion.div 
      className={`ui-card ${hoverable ? 'hoverable' : ''} ${glass ? 'glass' : ''} ${gradient ? 'gradient-border' : ''} ${className}`}
      onClick={onClick}
      whileHover={hoverable ? { y: -6, transition: { type: 'spring', stiffness: 300, damping: 20 } } : undefined}
      whileTap={hoverable ? { y: -2, scale: 0.99 } : undefined}
    >
      {gradient && <div className="card-gradient-ring" />}
      {(title || Icon) && (
        <div className="card-header">
          {Icon && (
            <motion.div 
              className="card-icon"
              whileHover={{ scale: 1.1, rotate: 5 }}
            >
              <Icon size={20} />
            </motion.div>
          )}
          <div className="card-title-group">
            {title && <h3>{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="card-body">
        {children}
      </div>
    </motion.div>
  );
}
