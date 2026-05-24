import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './GlobalLoader.css';

/**
 * GlobalLoader — Fullscreen loading overlay using the ArithFlow logo
 * The orbit ring spins, the inner circle pulses, and the emerald center glows.
 */
export function GlobalLoader({ isVisible }) {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="global-loader-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="global-loader-content">
            {/* Animated ArithFlow logo */}
            <div className="loader-logo-wrap">
              <svg viewBox="0 0 160 160" width="180" height="180" className="loader-svg">
                <defs>
                  <linearGradient id="loaderGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#5B21B6" />
                    <stop offset="50%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#8B7FFF" />
                  </linearGradient>
                  <linearGradient id="loaderGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7C3AED" />
                    <stop offset="100%" stopColor="#A78BFA" />
                  </linearGradient>
                  <filter id="loaderGlow">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* Outer orbit ring — spins */}
                <circle
                  className="loader-orbit"
                  cx="80" cy="80" r="64"
                  fill="none"
                  stroke="url(#loaderGrad1)"
                  strokeWidth="5"
                  strokeDasharray="32 16"
                  strokeLinecap="round"
                />

                {/* Inner filled circle — pulses */}
                <circle
                  className="loader-inner-circle"
                  cx="80" cy="80" r="36"
                  fill="url(#loaderGrad2)"
                  opacity="0.85"
                />

                {/* Center dot — emerald glow */}
                <circle
                  className="loader-center-dot"
                  cx="80" cy="80" r="14"
                  fill="#34D399"
                  filter="url(#loaderGlow)"
                />
              </svg>
            </div>

            {/* Text */}
            <motion.div
              className="loader-text"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <span className="loader-brand">ArithFlow</span>
              <span className="loader-status">Initializing workspace…</span>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
