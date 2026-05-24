import React from 'react';

const TAG_STYLES = {
  bronze: { bg: '#FDF2E9', color: '#B45309', border: '#FBBF24' },
  silver: { bg: '#F1F5F9', color: '#475569', border: '#94A3B8' },
  gold: { bg: '#FEF9C3', color: '#A16207', border: '#FACC15' },
};

/**
 * Inline tag badge for table tagging (bronze/silver/gold/custom).
 * @param {{ tag: string, onRemove?: () => void, size?: 'sm'|'md' }} props
 */
const TagBadge = ({ tag, onRemove, size = 'sm' }) => {
  const key = tag.toLowerCase();
  const style = TAG_STYLES[key] || { bg: 'var(--df-accent-soft)', color: 'var(--df-icon-accent)', border: 'var(--df-accent)' };
  const fontSize = size === 'sm' ? '9px' : '11px';
  const py = size === 'sm' ? '1px' : '3px';
  const px = size === 'sm' ? '6px' : '10px';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize,
        fontWeight: 800,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: `${py} ${px}`,
        borderRadius: '9999px',
        backgroundColor: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      {tag}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontSize: '10px',
            lineHeight: 1,
            color: style.color,
            opacity: 0.6,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; }}
        >
          ×
        </button>
      )}
    </span>
  );
};

export default TagBadge;
