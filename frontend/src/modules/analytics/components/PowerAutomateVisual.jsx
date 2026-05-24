/**
 * PowerAutomateVisual.jsx
 * ───────────────────────
 * Full Power Automate-like workflow builder card for the Antigravity dashboard.
 *
 * Flow:
 *  idle → builder → running → success (with real PDF download button)
 *                           ↘ history
 *
 * The "Generate Report" action actually calls the backend Playwright service,
 * saves a PDF to exports/, and exposes it at /api/power-automate/download/{id}.
 * The Success screen polls /flow/{id} until has_export=true, then shows the button.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import './PowerAutomateVisual.css';

// Must match the global API_PREFIX in main.jsx — window.open() bypasses the fetch interceptor
const API_PREFIX = '/analytics';

// ── Action catalogue ──────────────────────────────────────────────────────────
const ACTION_CATALOGUE = [
  {
    action_type: 'save_to_db',
    label: 'Save to Database',
    icon: '🗄️',
    description: 'Persist a data snapshot to the analytics database',
    duration: 1000,
  },
  {
    action_type: 'send_email',
    label: 'Send Email Notification',
    icon: '📧',
    description: 'Dispatch an automated email alert to your team',
    duration: 1500,
  },
  {
    action_type: 'generate_report',
    label: 'Generate PDF Report',
    icon: '📊',
    description: 'Capture the dashboard as a downloadable PDF snapshot',
    duration: 5000,   // longer — Playwright needs ~5s to render + export
  },
];

// ── Step progress bar ─────────────────────────────────────────────────────────
const StepProgress = ({ actions, currentStep }) => (
  <div className="pa-step-progress">
    {actions.map((action, idx) => {
      const stepNum  = idx + 1;
      const isDone   = stepNum < currentStep;
      const isActive = stepNum === currentStep;
      return (
        <div key={action.action_type} className="pa-step-row">
          {idx > 0 && <div className={`pa-step-connector ${isDone ? 'done' : ''}`} />}
          <div className={`pa-step-circle ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
            {isDone ? '✓' : action.icon}
          </div>
          <span className={`pa-step-label ${isActive ? 'active' : ''} ${isDone ? 'done' : ''}`}>
            {action.label}
          </span>
          {isActive && <span className="pa-step-spinner" />}
        </div>
      );
    })}
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────────
const PowerAutomateVisual = ({ visualId }) => {
  // View state machine: idle | builder | running | success | history
  const [view, setView] = useState('idle');

  // Builder inputs
  const [flowName, setFlowName] = useState('');
  const [selectedActions, setSelectedActions] = useState(
    ACTION_CATALOGUE.map((a, i) => ({ ...a, execute_order: i + 1, enabled: true }))
  );

  // Running state
  const [currentStep, setCurrentStep]   = useState(0);

  // Result from API
  const [result, setResult]       = useState(null);   // WorkflowResponse
  const [error, setError]         = useState('');

  // PDF polling
  const [pdfReady, setPdfReady]       = useState(false);
  const [pdfPolling, setPdfPolling]   = useState(false);
  const pollTimerRef = useRef(null);

  // History list
  const [flows, setFlows]               = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Prevent drag-and-drop bubble-up while interacting with the card
  const stopBubble = (e) => e.stopPropagation();

  // ── Cleanup poller on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // ── Toggle action on/off ──────────────────────────────────────────────────
  const toggleAction = (actionType) => {
    setSelectedActions(prev =>
      prev.map(a => a.action_type === actionType ? { ...a, enabled: !a.enabled } : a)
    );
  };

  // ── Load flow history ─────────────────────────────────────────────────────
  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res  = await fetch('/api/power-automate/flows');
      const data = await res.json();
      setFlows(Array.isArray(data) ? data : []);
    } catch {
      setFlows([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // ── Poll a workflow until has_export=true ─────────────────────────────────
  const startPollingForPdf = useCallback((workflowId) => {
    setPdfPolling(true);
    setPdfReady(false);

    // Stop any previous poller
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);

    let attempts = 0;
    const MAX_ATTEMPTS = 30; // 30 × 2s = 60s max wait

    pollTimerRef.current = setInterval(async () => {
      attempts++;
      try {
        const res  = await fetch(`/api/power-automate/flow/${workflowId}`);
        const data = await res.json();

        if (data.has_export) {
          clearInterval(pollTimerRef.current);
          setPdfReady(true);
          setPdfPolling(false);
          // Update the result card too
          setResult(prev => ({ ...prev, has_export: true, status: data.status }));
          return;
        }

        if (data.status === 'failed') {
          clearInterval(pollTimerRef.current);
          setPdfPolling(false);
          setPdfReady(false);
          setError('PDF snapshot failed on server. Check backend Playwright/Chromium setup.');
          return;
        }
      } catch {
        /* keep polling on transient errors */
      }

      if (attempts >= MAX_ATTEMPTS) {
        clearInterval(pollTimerRef.current);
        setPdfPolling(false);
        setError('PDF snapshot is taking too long. Please check backend logs and retry.');
      }
    }, 2000);
  }, []);

  // ── Step animation engine ─────────────────────────────────────────────────
  // Runs each step for its own duration so the UI matches backend timing
  const runStepAnimation = async (enabledActions) => {
    for (let i = 0; i < enabledActions.length; i++) {
      setCurrentStep(i + 1);
      await new Promise(r => setTimeout(r, enabledActions[i].duration || 1500));
    }
    setCurrentStep(enabledActions.length + 1); // past last = all done
  };

  // ── Create Flow ───────────────────────────────────────────────────────────
  const handleCreateFlow = async (e) => {
    if (e) e.stopPropagation();

    const enabledActions = selectedActions.filter(a => a.enabled);
    if (!enabledActions.length) {
      setError('Please enable at least one action.');
      return;
    }

    const name = flowName.trim() || `Flow — ${new Date().toLocaleTimeString()}`;
    // Send the FULL current URL (including fileId query params) so Playwright
    // loads the exact same report page the user is looking at right now
    const snapshotUrl = window.location.href;

    setError('');
    setView('running');
    setCurrentStep(0);
    setPdfReady(false);

    // Fire API call + animation concurrently
    const [apiResult] = await Promise.all([
      fetch('/api/power-automate/create-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          trigger_type: 'button_click',
          snapshot_url: snapshotUrl,
          actions: enabledActions.map((a, i) => ({
            action_type: a.action_type,
            label: a.label,
            execute_order: i + 1,
            config: {},
          })),
        }),
      })
        .then(r => r.json())
        .catch(() => null),

      runStepAnimation(enabledActions),
    ]);

    if (apiResult && !apiResult.detail) {
      setResult(apiResult);
      setView('success');

      // If generate_report was enabled, start polling until the PDF is ready
      const hasGenerateReport = enabledActions.some(a => a.action_type === 'generate_report');
      if (hasGenerateReport) {
        startPollingForPdf(apiResult.id);
      }
    } else {
      setError(apiResult?.detail || 'Flow creation failed. Please try again.');
      setView('builder');
    }
  };

  // ── Download PDF ──────────────────────────────────────────────────────────
  const handleDownload = (e) => {
    e.stopPropagation();
    if (!result?.id) return;
    // Trigger a direct file download from the backend
    // NOTE: window.open bypasses the fetch interceptor — prefix must be applied manually
    window.open(`${API_PREFIX}/api/power-automate/download/${result.id}`, '_blank');
  };

  // ── Reset to idle ─────────────────────────────────────────────────────────
  const resetToIdle = (e) => {
    stopBubble(e);
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    setView('idle');
    setFlowName('');
    setResult(null);
    setPdfReady(false);
    setPdfPolling(false);
    setCurrentStep(0);
    setError('');
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWS
  // ═══════════════════════════════════════════════════════════════════════════

  const renderIdle = () => (
    <div className="pa-idle">
      <div className="pa-zap-icon">⚡</div>
      <h3 className="pa-main-title">Power Automate</h3>
      <p className="pa-main-sub">
        Design automated workflows — save data, send alerts &amp; generate PDF snapshots
      </p>
      <div className="pa-idle-actions">
        <button
          className="pa-btn-primary"
          onClick={(e) => { stopBubble(e); setView('builder'); setError(''); }}
          onMouseDown={stopBubble}
        >
          + Create Flow
        </button>
        <button
          className="pa-btn-ghost"
          onClick={(e) => { stopBubble(e); loadHistory(); setView('history'); }}
          onMouseDown={stopBubble}
        >
          📋 View History
        </button>
      </div>
      <p className="pa-idle-hint">Runs in the background — no waiting required</p>
    </div>
  );

  const renderBuilder = () => (
    <div className="pa-builder">
      <div className="pa-section-header">
        <button className="pa-back-btn" onClick={(e) => { stopBubble(e); setView('idle'); }} onMouseDown={stopBubble}>← Back</button>
        <span className="pa-section-title">Configure Flow</span>
      </div>

      <label className="pa-field-label">Flow Name</label>
      <input
        className="pa-input"
        type="text"
        placeholder="e.g. Daily Sales Automation"
        value={flowName}
        onChange={(e) => setFlowName(e.target.value)}
        onMouseDown={stopBubble}
        onClick={stopBubble}
      />

      <div className="pa-trigger-badge">
        <span>⚡</span> Trigger: <strong>Button Click</strong>
      </div>

      <label className="pa-field-label" style={{ marginTop: 12 }}>Pipeline Actions</label>
      <div className="pa-action-list">
        {selectedActions.map((action, idx) => (
          <div
            key={action.action_type}
            className={`pa-action-item ${action.enabled ? 'enabled' : 'disabled'}`}
            onClick={(e) => { stopBubble(e); toggleAction(action.action_type); }}
            onMouseDown={stopBubble}
          >
            <div className="pa-action-left">
              <span className="pa-action-order">{idx + 1}</span>
              <span className="pa-action-icon">{action.icon}</span>
              <div>
                <div className="pa-action-name">{action.label}</div>
                <div className="pa-action-desc">{action.description}</div>
              </div>
            </div>
            <div className={`pa-toggle ${action.enabled ? 'on' : 'off'}`}>
              {action.enabled ? 'ON' : 'OFF'}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="pa-error-msg">{error}</p>}

      <button className="pa-btn-primary full" onClick={handleCreateFlow} onMouseDown={stopBubble}>
        🚀 Create &amp; Run Flow
      </button>
    </div>
  );

  const renderRunning = () => {
    const enabledActions = selectedActions.filter(a => a.enabled);
    return (
      <div className="pa-running">
        <div className="pa-running-header">
          <span className="pa-pulse-dot" />
          <span className="pa-running-title">Pipeline Executing...</span>
        </div>
        <p className="pa-running-sub">Your automation is running in the background</p>
        <StepProgress actions={enabledActions} currentStep={currentStep} />
      </div>
    );
  };

  const renderSuccess = () => {
    const hasGenerateAction = selectedActions.some(a => a.enabled && a.action_type === 'generate_report');
    return (
      <div className="pa-success">
        <div className="pa-success-icon">✅</div>
        <h3 className="pa-success-title">Flow Created!</h3>
        <p className="pa-success-sub">
          {result?.name || 'Your flow'} ran successfully
        </p>

        {result && (
          <div className="pa-result-card">
            <div className="pa-result-row">
              <span>Flow ID</span>
              <code>{result.id.slice(0, 8)}…</code>
            </div>
            <div className="pa-result-row">
              <span>Status</span>
              <span className="pa-badge-success">{result.status}</span>
            </div>
            <div className="pa-result-row">
              <span>Actions</span>
              <span>{result.actions?.length}</span>
            </div>
          </div>
        )}

        {/* PDF download section */}
        {hasGenerateAction && (
          <div className="pa-pdf-section">
            {pdfReady ? (
              <button
                className="pa-btn-download"
                onClick={handleDownload}
                onMouseDown={stopBubble}
              >
                📥 Download PDF Snapshot
              </button>
            ) : (
              <div className="pa-pdf-waiting">
                <span className="pa-step-spinner" />
                <span>Generating PDF snapshot…</span>
              </div>
            )}
          </div>
        )}

        <div className="pa-success-actions">
          <button className="pa-btn-primary" onClick={resetToIdle} onMouseDown={stopBubble}>
            Create Another
          </button>
          <button
            className="pa-btn-ghost"
            onClick={(e) => { stopBubble(e); loadHistory(); setView('history'); }}
            onMouseDown={stopBubble}
          >
            View All Flows
          </button>
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="pa-history">
      <div className="pa-section-header">
        <button className="pa-back-btn" onClick={(e) => { stopBubble(e); setView('idle'); }} onMouseDown={stopBubble}>← Back</button>
        <span className="pa-section-title">Flow History</span>
      </div>

      {historyLoading ? (
        <p className="pa-loading-text">Loading flows…</p>
      ) : flows.length === 0 ? (
        <p className="pa-loading-text">No flows created yet.</p>
      ) : (
        <div className="pa-flow-list">
          {flows.map(flow => (
            <div key={flow.id} className="pa-flow-card">
              <div className="pa-flow-name">⚡ {flow.name}</div>
              <div className="pa-flow-meta">
                <span className={`pa-badge-status ${flow.status}`}>{flow.status}</span>
                <span className="pa-flow-steps">
                  {flow.actions.length} action{flow.actions.length !== 1 ? 's' : ''}
                </span>
                {flow.has_export && (
                  <button
                    className="pa-flow-dl-btn"
                    onClick={(e) => {
                      stopBubble(e);
                      // NOTE: window.open bypasses the fetch interceptor — prefix must be applied manually
                      window.open(`${API_PREFIX}/api/power-automate/download/${flow.id}`, '_blank');
                    }}
                    onMouseDown={stopBubble}
                    title="Download PDF"
                  >
                    📥
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pa-visual-container" onMouseDown={stopBubble}>
      {view === 'idle'    && renderIdle()}
      {view === 'builder' && renderBuilder()}
      {view === 'running' && renderRunning()}
      {view === 'success' && renderSuccess()}
      {view === 'history' && renderHistory()}
    </div>
  );
};

export default PowerAutomateVisual;
