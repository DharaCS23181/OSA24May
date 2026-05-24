import React from 'react';
import { DatabaseZap } from 'lucide-react';
import './EmptyState.css';

export function EmptyState({ 
  icon: Icon = DatabaseZap, 
  title, 
  description, 
  action 
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">
        <Icon size={32} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      <p className="empty-state-desc">{description}</p>
      {action && (
        <div className="empty-state-action">
          {action}
        </div>
      )}
    </div>
  );
}
