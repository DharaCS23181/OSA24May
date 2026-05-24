import React from 'react';
import { useToast } from '../context/ToastContext';
import { FiCheck, FiX, FiInfo, FiAlertTriangle } from 'react-icons/fi';

const iconMap = {
  success: <FiCheck size={16} />,
  error: <FiX size={16} />,
  info: <FiInfo size={16} />,
  warning: <FiAlertTriangle size={16} />,
};

const colorMap = {
  success: { bg: 'var(--df-success-soft, #D1FAE5)', color: 'var(--df-success, #059669)', border: 'var(--df-success, #059669)' },
  error: { bg: 'var(--df-danger-soft, #FEE2E2)', color: 'var(--df-danger, #DC2626)', border: 'var(--df-danger, #DC2626)' },
  info: { bg: 'var(--df-accent-soft)', color: 'var(--df-icon-accent)', border: 'var(--df-accent)' },
  warning: { bg: 'var(--df-warning-soft, #FEF3C7)', color: 'var(--df-warning, #D97706)', border: 'var(--df-warning, #D97706)' },
};

const ToastContainer = () => {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column-reverse',
      gap: '8px',
      pointerEvents: 'none',
    }}>
      {toasts.map(toast => {
        const colors = colorMap[toast.type] || colorMap.info;
        return (
          <div
            key={toast.id}
            className="animate-fadeIn"
            style={{
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '12px',
              backgroundColor: 'var(--df-card-bg)',
              border: `1px solid ${colors.border}`,
              boxShadow: 'var(--df-shadow-lg)',
              minWidth: '280px',
              maxWidth: '420px',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              backgroundColor: colors.bg,
              color: colors.color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              {iconMap[toast.type]}
            </div>
            <span style={{
              flex: 1,
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--df-strong)',
              lineHeight: 1.4,
            }}>
              {toast.message}
            </span>
            <button
              onClick={() => removeToast(toast.id)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '6px',
                color: 'var(--df-text-muted)',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--df-surface)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <FiX size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default ToastContainer;
