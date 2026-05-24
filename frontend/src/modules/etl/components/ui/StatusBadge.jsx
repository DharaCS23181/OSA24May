import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Clock, Minus } from 'lucide-react';
import './StatusBadge.css';

const STATUS_MAP = {
  running: { label: 'Running', type: 'info', icon: Loader2, animate: true },
  success: { label: 'Success', type: 'success', icon: CheckCircle },
  failed:  { label: 'Failed', type: 'danger', icon: XCircle },
  pending: { label: 'Pending', type: 'warning', icon: Clock, animate: true },
  active:  { label: 'Active', type: 'success', icon: CheckCircle },
  draft:   { label: 'Draft', type: 'neutral', icon: Minus },
  archived:{ label: 'Archived', type: 'neutral', icon: Minus },
  partial: { label: 'Partial', type: 'warning', icon: Clock },
  cancelled: { label: 'Cancelled', type: 'neutral', icon: XCircle },
};

export function StatusBadge({ status, textOverride }) {
  const normStatus = (status || '').toLowerCase();
  if (!normStatus || normStatus === 'draft') return null;
  const config = STATUS_MAP[normStatus] || STATUS_MAP.draft;
  const label = textOverride || config.label;

  return (
    <motion.div 
      className={`status-badge badge-${config.type}`}
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
    >
      <span className="status-label">{label}</span>
    </motion.div>
  );
}
