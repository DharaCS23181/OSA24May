import React, { useMemo } from 'react';
import { X, Clock, Activity, CheckCircle2, XCircle, Loader2, Database, Zap, ArrowRightLeft } from 'lucide-react';
import './ExecutionTimeline.css';

export function ExecutionTimeline({ history = [], nodes = [], onClose }) {
  const bars = useMemo(() => {
    if (!history.length) return [];

    const startTimes = {};
    const endTimes = {};
    const errors = {};
    let minTime = new Date(history[0].time).getTime();
    let maxTime = minTime;

    history.forEach(evt => {
      const t = new Date(evt.time).getTime();
      minTime = Math.min(minTime, t);
      maxTime = Math.max(maxTime, t);

      if (evt.status === 'running') {
        startTimes[evt.node_id] = t;
      } else if (evt.status === 'success') {
        endTimes[evt.node_id] = t;
      } else if (evt.status === 'failed') {
        endTimes[evt.node_id] = t;
        errors[evt.node_id] = true;
      }
    });

    const totalDuration = maxTime - minTime || 1;

    return nodes.map(n => {
      const start = startTimes[n.id] || minTime;
      const end = endTimes[n.id] || (startTimes[n.id] ? maxTime : start); 
      
      const widthPct = ((end - start) / totalDuration) * 100;
      const leftPct = ((start - minTime) / totalDuration) * 100;
      const isFailed = errors[n.id];
      const durationMs = end - start;

      return {
        id: n.id,
        label: n.data.label || n.id,
        type: n.type,
        left: leftPct,
        width: Math.max(widthPct, 2), // Ensure tiny executions are visible in the sparkline
        duration: durationMs,
        failed: isFailed,
        started: !!startTimes[n.id],
        completed: !!endTimes[n.id],
        start: start
      };
    }).filter(b => b.started).sort((a, b) => a.start - b.start);
  }, [history, nodes]);

  if (!bars) return null;

  const totalTime = bars.length ? Math.max(...bars.map(b => b.duration + (b.left/100 * Math.max(...bars.map(x=>x.duration))))) / 1000 : 0;

  const getTypeIcon = (type) => {
    switch(type) {
      case 'extract': return <Database size={14} />;
      case 'transform': 
      case 'transform_pandas': return <Zap size={14} />;
      case 'load': return <ArrowRightLeft size={14} />;
      default: return <Activity size={14} />;
    }
  };

  return (
    <div className="et-overlay">
      <div className="et-panel">
        <div className="et-header">
          <div className="et-header-left">
            <div className="et-icon-wrapper">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="et-title">Execution Trace</h3>
              <p className="et-subtitle">Total Duration: {totalTime.toFixed(2)}s</p>
            </div>
          </div>
          <button className="et-close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="et-body">
          {bars.length > 0 ? (
            <div className="et-trace-list">
              {bars.map((bar, index) => {
                const isLast = index === bars.length - 1;
                let StatusIcon = Loader2;
                let statusClass = 'running';
                
                if (bar.failed) {
                  StatusIcon = XCircle;
                  statusClass = 'failed';
                } else if (bar.completed) {
                  StatusIcon = CheckCircle2;
                  statusClass = 'success';
                }

                return (
                  <div key={bar.id} className={`et-step ${statusClass}`}>
                    <div className="et-step-indicator">
                      <div className={`et-status-icon ${statusClass}`}>
                        <StatusIcon size={16} className={statusClass === 'running' ? 'animate-spin' : ''} />
                      </div>
                      {!isLast && <div className={`et-step-line ${bar.completed && !bar.failed ? 'completed' : ''}`} />}
                    </div>
                    
                    <div className="et-step-content">
                      <div className="et-step-header">
                        <span className="et-node-label" title={bar.label}>{bar.label}</span>
                        <span className="et-node-duration">{(bar.duration / 1000).toFixed(2)}s</span>
                      </div>
                      <div className="et-step-details">
                        <span className={`et-type-badge type-${bar.type}`}>
                          {getTypeIcon(bar.type)}
                          {bar.type.replace('_', ' ').toUpperCase()}
                        </span>
                        
                        <div className="et-mini-gantt-wrapper">
                           <div className="et-mini-gantt-track" title="Execution offset relative to total time">
                             <div 
                               className={`et-mini-gantt-bar type-${bar.type} ${bar.failed ? 'failed' : ''}`}
                               style={{ left: `${bar.left}%`, width: `${bar.width}%` }}
                             />
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="et-empty">
              <div className="et-empty-icon-wrapper">
                <Clock size={24} />
              </div>
              <p>No execution data yet.<br/>Run the pipeline to see the trace.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
