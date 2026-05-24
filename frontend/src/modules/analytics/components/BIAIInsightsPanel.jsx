import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  X,
  Loader2,
  Copy,
  CheckCheck,
  Download,
  Send,
  TrendingUp,
  AlertTriangle,
  Target,
  Compass,
  Lightbulb,
  Activity,
  MessageSquare,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import './BIAIInsightsPanel.css';

const MODE_LIST = [
  { id: 'ceo', label: 'Executive Summary', emoji: '👔' },
  { id: 'technical', label: 'Explain Technically', emoji: '🧪' },
  { id: 'simple', label: 'Explain Simply', emoji: '💡' },
  { id: 'financial', label: 'Financial View', emoji: '💼' },
  { id: 'sales', label: 'Sales View', emoji: '📈' },
];

const TASK_META = {
  explain: { label: 'Explain This Chart', icon: Sparkles, accent: '#7a1e3a' },
  trend: { label: 'Trend Analysis', icon: TrendingUp, accent: '#0ea5e9' },
  anomalies: { label: 'Anomaly Detection', icon: AlertTriangle, accent: '#f59e0b' },
  rootCause: { label: 'Root Cause Analysis', icon: Target, accent: '#ef4444' },
  summary: { label: 'Executive Summary', icon: Compass, accent: '#14b8a6' },
  nextSteps: { label: 'Suggested Next Steps', icon: Lightbulb, accent: '#22c55e' },
  story: { label: 'AI Story Mode', icon: Activity, accent: '#a855f7' },
  ask: { label: 'Ask This Visual', icon: MessageSquare, accent: '#8c2546' },
};

/**
 * Light markdown — bold (**...**), code (`...`), bullet lines (•/-).
 * No external dependency to keep it lean.
 */
function renderInlineMD(text) {
  if (!text) return null;
  const tokens = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((t, i) => {
    if (/^\*\*[^*]+\*\*$/.test(t)) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(t)) return <code key={i}>{t.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{t}</React.Fragment>;
  });
}

function MarkdownBlock({ text, mute = false }) {
  if (!text) return null;
  const lines = String(text).split('\n');
  return (
    <div className={`bi-ai-md ${mute ? 'bi-ai-md--mute' : ''}`}>
      {lines.map((ln, i) => {
        const trimmed = ln.trim();
        if (!trimmed) return <div key={i} className="bi-ai-md-spacer" />;
        if (/^[-•]\s+/.test(trimmed)) {
          return (
            <div key={i} className="bi-ai-md-bullet">
              <span className="bi-ai-md-dot" />
              <span>{renderInlineMD(trimmed.replace(/^[-•]\s+/, ''))}</span>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(trimmed)) {
          const num = trimmed.match(/^(\d+)\./)?.[1];
          return (
            <div key={i} className="bi-ai-md-bullet bi-ai-md-bullet--numbered">
              <span className="bi-ai-md-num">{num}</span>
              <span>{renderInlineMD(trimmed.replace(/^\d+\.\s+/, ''))}</span>
            </div>
          );
        }
        return <p key={i} className="bi-ai-md-p">{renderInlineMD(trimmed)}</p>;
      })}
    </div>
  );
}

function StatPill({ label, value }) {
  return (
    <div className="bi-ai-stat">
      <div className="bi-ai-stat-label">{label}</div>
      <div className="bi-ai-stat-value">{value}</div>
    </div>
  );
}

function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const x = Number(n);
  const a = Math.abs(x);
  if (a >= 1_000_000_000) return `${(x / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${(x / 1_000_000).toFixed(2)}M`;
  if (a >= 1_000) return `${(x / 1_000).toFixed(1)}K`;
  if (a === 0 || a >= 100) return Math.round(x).toLocaleString();
  return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function buildExportText(result, modeLabel, task) {
  if (!result) return '';
  const lines = [];
  lines.push(`AI Insights — ${TASK_META[task]?.label || 'Report'}`);
  lines.push(`Mode: ${modeLabel}`);
  if (result.title) lines.push(`Chart: ${result.title}`);
  if (result.chartType) lines.push(`Type: ${result.chartType}`);
  lines.push('');
  if (result.headline) { lines.push('## Headline'); lines.push(result.headline); lines.push(''); }
  if (result.narrative) { lines.push('## Narrative'); lines.push(result.narrative); lines.push(''); }
  if (result.summary && result.summary !== result.narrative) {
    lines.push('## Summary'); lines.push(result.summary); lines.push('');
  }
  if (Array.isArray(result.trends) && result.trends.length) {
    lines.push('## Trends');
    result.trends.forEach((t) => lines.push(`- ${t.summary}`));
    lines.push('');
  }
  if (Array.isArray(result.anomalies) && result.anomalies.length) {
    lines.push('## Anomalies');
    result.anomalies.forEach((a) => lines.push(`- ${a.summary}`));
    lines.push('');
  }
  if (result.rootCause) { lines.push('## Root Cause'); lines.push(result.rootCause); lines.push(''); }
  if (Array.isArray(result.recommendations) && result.recommendations.length) {
    lines.push('## Recommendations');
    result.recommendations.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');
  }
  return lines.join('\n');
}

export default function BIAIInsightsPanel({
  open,
  onClose,
  task,
  setTask,
  mode,
  setMode,
  loading,
  result,
  error,
  selectedVisualTitle,
  hasSelectedVisual,
  onRunTask,
  onAsk,
  chatHistory,
  onClearChat,
}) {
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [askInput, setAskInput] = useState('');
  const bodyRef = useRef(null);

  const meta = TASK_META[task] || TASK_META.explain;
  const modeMeta = useMemo(() => MODE_LIST.find((m) => m.id === mode) || MODE_LIST[0], [mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    // Scroll body to top whenever the result changes
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [result, task]);

  const handleCopy = useCallback(async () => {
    const text = buildExportText(result, modeMeta.label, task);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [result, modeMeta.label, task]);

  const handleExport = useCallback(() => {
    const text = buildExportText(result, modeMeta.label, task);
    if (!text) return;
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (result?.title || 'ai-insights').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    a.download = `${safeTitle}-${task}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result, modeMeta.label, task]);

  const handleAskSubmit = useCallback(
    (e) => {
      e?.preventDefault?.();
      const q = askInput.trim();
      if (!q || loading) return;
      onAsk?.(q);
      setAskInput('');
    },
    [askInput, loading, onAsk],
  );

  if (!open) return null;

  const showChat = task === 'ask' || task === 'chat';
  const TaskIcon = meta.icon;

  return (
    <>
      <div className="bi-ai-backdrop" onMouseDown={onClose} role="presentation" />
      <aside
        className="bi-ai-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bi-ai-panel-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="bi-ai-header">
          <div className="bi-ai-header-left">
            <div className="bi-ai-header-glyph" aria-hidden>
              <Sparkles size={16} />
              <span className="bi-ai-header-glyph-pulse" />
            </div>
            <div className="bi-ai-header-text">
              <h2 id="bi-ai-panel-title" className="bi-ai-header-title">AI Insights</h2>
              <p className="bi-ai-header-sub">
                {selectedVisualTitle
                  ? <>Analyzing <strong>{selectedVisualTitle}</strong></>
                  : 'Pick a visual on the canvas to analyse'}
              </p>
            </div>
          </div>
          <div className="bi-ai-header-actions">
            <div className="bi-ai-mode-wrap">
              <button
                type="button"
                className="bi-ai-mode-btn"
                onClick={() => setModeMenuOpen((v) => !v)}
                aria-expanded={modeMenuOpen}
                aria-haspopup="listbox"
                title="Switch persona / tone"
              >
                <span className="bi-ai-mode-emoji" aria-hidden>{modeMeta.emoji}</span>
                <span className="bi-ai-mode-label">{modeMeta.label}</span>
                <ChevronDown size={13} />
              </button>
              {modeMenuOpen && (
                <ul className="bi-ai-mode-menu" role="listbox">
                  {MODE_LIST.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={mode === m.id}
                        className={`bi-ai-mode-item ${mode === m.id ? 'bi-ai-mode-item--on' : ''}`}
                        onClick={() => { setMode(m.id); setModeMenuOpen(false); }}
                      >
                        <span aria-hidden>{m.emoji}</span>
                        {m.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="bi-ai-icon-btn" onClick={onClose} title="Close (Esc)" aria-label="Close panel">
              <X size={18} />
            </button>
          </div>
        </header>

        <nav className="bi-ai-tabs" aria-label="Insight task">
          {[
            { id: 'explain', label: 'Explain' },
            { id: 'trend', label: 'Trend' },
            { id: 'anomalies', label: 'Anomalies' },
            { id: 'rootCause', label: 'Root cause' },
            { id: 'summary', label: 'Summary' },
            { id: 'nextSteps', label: 'Next steps' },
            { id: 'story', label: 'Story' },
            { id: 'ask', label: 'Ask' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              className={`bi-ai-tab ${task === t.id ? 'bi-ai-tab--on' : ''}`}
              onClick={() => setTask?.(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="bi-ai-body" ref={bodyRef}>
          {!hasSelectedVisual && (
            <div className="bi-ai-empty">
              <div className="bi-ai-empty-glyph"><Sparkles size={28} /></div>
              <h3>Select a chart to begin</h3>
              <p>Click any visual on the canvas, then choose an action from the AI Insights ribbon. I'll read the chart's data and surface trends, anomalies, root causes and next steps.</p>
            </div>
          )}

          {hasSelectedVisual && loading && (
            <div className="bi-ai-loading">
              <div className="bi-ai-loading-shimmer">
                <Loader2 size={20} className="bi-ai-spin" />
                <span>Analysing this visual…</span>
              </div>
              <div className="bi-ai-loading-bars">
                <span /><span /><span /><span /><span />
              </div>
            </div>
          )}

          {hasSelectedVisual && !loading && error && (
            <div className="bi-ai-error">
              <AlertTriangle size={16} />
              <div>
                <strong>Couldn't reach the AI service.</strong>
                <p>{error}</p>
                <button type="button" className="bi-ai-retry" onClick={() => onRunTask?.(task)}>
                  <RefreshCw size={13} /> Try again
                </button>
              </div>
            </div>
          )}

          {hasSelectedVisual && !loading && !error && !result && !showChat && (
            <div className="bi-ai-empty">
              <div className="bi-ai-empty-glyph" style={{ background: `${meta.accent}1a`, color: meta.accent }}>
                <TaskIcon size={26} />
              </div>
              <h3>{meta.label}</h3>
              <p>Press <strong>Run</strong> below or use the action on the ribbon to generate insights.</p>
              <button type="button" className="bi-ai-primary" onClick={() => onRunTask?.(task)}>
                <Sparkles size={14} />
                Run {meta.label}
              </button>
            </div>
          )}

          {hasSelectedVisual && !loading && !error && result && !showChat && (
            <div className="bi-ai-result">
              <div className="bi-ai-result-head" style={{ ['--ai-accent']: meta.accent }}>
                <div className="bi-ai-result-icon"><TaskIcon size={16} /></div>
                <div>
                  <div className="bi-ai-result-task">{meta.label}</div>
                  {result.title && <div className="bi-ai-result-chart">{result.title}</div>}
                </div>
              </div>

              {result.headline && (
                <section className="bi-ai-section bi-ai-section--hero">
                  <MarkdownBlock text={result.headline} />
                </section>
              )}

              {result.narrative && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title">Narrative</h4>
                  <MarkdownBlock text={result.narrative} />
                </section>
              )}

              {result.summary && result.summary !== result.narrative && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title">Summary</h4>
                  <MarkdownBlock text={result.summary} />
                </section>
              )}

              {Array.isArray(result.trends) && result.trends.length > 0 && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title"><TrendingUp size={13} /> Trends</h4>
                  {result.trends.map((t, i) => (
                    <div key={i} className={`bi-ai-trend bi-ai-trend--${t.direction}`}>
                      <div className="bi-ai-trend-pct">
                        {(t.pct_change != null) ? `${t.pct_change > 0 ? '+' : ''}${t.pct_change}%` : '—'}
                      </div>
                      <div className="bi-ai-trend-body">
                        <div className="bi-ai-trend-label">{t.label}</div>
                        <div className="bi-ai-trend-sum">{t.summary}</div>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {Array.isArray(result.anomalies) && result.anomalies.length > 0 && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title"><AlertTriangle size={13} /> Anomalies</h4>
                  {result.anomalies.map((a, i) => (
                    <div key={i} className={`bi-ai-anom bi-ai-anom--${a.direction}`}>
                      <div className="bi-ai-anom-z">{a.z_score > 0 ? '+' : ''}{a.z_score}σ</div>
                      <div className="bi-ai-anom-body">
                        <strong>{a.label}</strong>
                        <span className="bi-ai-anom-pct">
                          {a.deviation_pct > 0 ? '+' : ''}{a.deviation_pct}% vs avg
                        </span>
                        <p>{a.summary}</p>
                      </div>
                    </div>
                  ))}
                </section>
              )}

              {result.rootCause && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title"><Target size={13} /> Root Cause</h4>
                  <MarkdownBlock text={result.rootCause} />
                  {Array.isArray(result.rootCauseDrivers) && result.rootCauseDrivers.length > 0 && (
                    <ul className="bi-ai-driver-list">
                      {result.rootCauseDrivers.map((d, i) => (
                        <li key={i}>
                          <div className="bi-ai-driver-label">
                            <span className="bi-ai-driver-rank">#{i + 1}</span>
                            <strong>{d.label}</strong>
                          </div>
                          <div className="bi-ai-driver-bar">
                            <div
                              className="bi-ai-driver-fill"
                              style={{ width: `${Math.max(2, Math.min(100, d.share_pct || 0))}%` }}
                            />
                          </div>
                          <div className="bi-ai-driver-val">
                            {fmt(d.value)} <span>({d.share_pct ?? '—'}%)</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {Array.isArray(result.recommendations) && result.recommendations.length > 0 && (
                <section className="bi-ai-section">
                  <h4 className="bi-ai-section-title"><Lightbulb size={13} /> Recommendations</h4>
                  <ol className="bi-ai-recs">
                    {result.recommendations.map((r, i) => (
                      <li key={i}><MarkdownBlock text={r} /></li>
                    ))}
                  </ol>
                </section>
              )}

              {result.stats && (
                <section className="bi-ai-section bi-ai-section--stats">
                  <h4 className="bi-ai-section-title">At a glance</h4>
                  <div className="bi-ai-stat-grid">
                    <StatPill label="Total" value={fmt(result.stats.total)} />
                    <StatPill label="Average" value={fmt(result.stats.avg)} />
                    <StatPill label="Min" value={fmt(result.stats.min)} />
                    <StatPill label="Max" value={fmt(result.stats.max)} />
                    <StatPill label="Median" value={fmt(result.stats.median)} />
                    <StatPill label="Points" value={result.stats.count ?? '—'} />
                  </div>
                </section>
              )}
            </div>
          )}

          {hasSelectedVisual && showChat && (
            <div className="bi-ai-chat">
              {(!chatHistory || chatHistory.length === 0) && !loading && (
                <div className="bi-ai-chat-empty">
                  <MessageSquare size={26} />
                  <h3>Ask this visual anything</h3>
                  <p>Try: <em>"Why did this drop?"</em>, <em>"What's the top region?"</em>, <em>"Is there an anomaly?"</em></p>
                  <div className="bi-ai-chat-suggests">
                    {['What is the headline?', 'Why is it trending?', 'Are there anomalies?', 'What should I do next?'].map((s) => (
                      <button key={s} type="button" onClick={() => onAsk?.(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              {(chatHistory || []).map((m, i) => (
                <div key={i} className={`bi-ai-chat-msg bi-ai-chat-msg--${m.role}`}>
                  {m.role === 'assistant' ? <MarkdownBlock text={m.content} /> : <span>{m.content}</span>}
                </div>
              ))}
              {loading && (
                <div className="bi-ai-chat-msg bi-ai-chat-msg--assistant">
                  <span className="bi-ai-typing"><i /><i /><i /></span>
                </div>
              )}
              <form className="bi-ai-chat-form" onSubmit={handleAskSubmit}>
                <input
                  type="text"
                  value={askInput}
                  onChange={(e) => setAskInput(e.target.value)}
                  placeholder="Ask anything about this visual…"
                  aria-label="Ask the AI about this visual"
                />
                <button type="submit" disabled={!askInput.trim() || loading} title="Send">
                  <Send size={15} />
                </button>
              </form>
              {chatHistory && chatHistory.length > 0 && (
                <button type="button" className="bi-ai-chat-clear" onClick={onClearChat}>
                  Clear conversation
                </button>
              )}
            </div>
          )}
        </div>

        {hasSelectedVisual && result && !showChat && (
          <footer className="bi-ai-footer">
            <button type="button" className="bi-ai-foot-btn" onClick={handleCopy} title="Copy to clipboard">
              {copied ? <><CheckCheck size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
            </button>
            <button type="button" className="bi-ai-foot-btn" onClick={handleExport} title="Export as Markdown">
              <Download size={14} /> Export
            </button>
            <button
              type="button"
              className="bi-ai-foot-btn bi-ai-foot-btn--primary"
              onClick={() => onRunTask?.(task)}
              disabled={loading}
              title="Regenerate with current mode"
            >
              <RefreshCw size={14} /> Regenerate
            </button>
          </footer>
        )}
      </aside>
    </>
  );
}
