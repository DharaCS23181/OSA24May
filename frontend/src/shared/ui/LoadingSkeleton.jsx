import React from 'react';

/**
 * Reusable shimmer loading skeleton.
 * @param {{ width?: string, height?: string, borderRadius?: string, count?: number, gap?: string }} props
 */
const LoadingSkeleton = ({ width = '100%', height = '16px', borderRadius = '8px', count = 1, gap = '12px' }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="df-skeleton"
          style={{
            width,
            height,
            borderRadius,
            backgroundColor: 'var(--df-surface, #f3f4f6)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(90deg, transparent 0%, var(--df-border, #e5e7eb) 50%, transparent 100%)',
              animation: 'shimmer 1.5s infinite',
            }}
          />
        </div>
      ))}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
};

export default LoadingSkeleton;
