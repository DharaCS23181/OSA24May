import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

const ErrorFallback = ({ error }) => (
    <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 8,
        color: '#b91c1c', background: '#fef2f2',
        border: '1px solid #fecaca', borderRadius: 8, padding: 16
    }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Custom visual failed to render</span>
        <pre style={{ fontSize: 11, color: '#dc2626', maxWidth: '100%', overflow: 'auto', margin: 0 }}>
            {error.message}
        </pre>
    </div>
);

const NoDataPlaceholder = ({ name }) => (
    <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', gap: 10,
        color: '#64748b', background: '#f8fafc',
        border: '2px dashed #cbd5e1', borderRadius: 8,
    }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>📊</span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{name}</span>
        <span style={{ fontSize: 11 }}>Add data fields from the right pane to render this visual</span>
    </div>
);

export const CustomVisualRenderer = ({ visual, data, config }) => {
    if (!visual || typeof visual.render !== 'function') {
        return <div style={{ padding: 20, color: '#64748b' }}>Invalid Custom Visual</div>;
    }

    // If no data yet, show an instructional placeholder instead of crashing
    const hasData = Array.isArray(data) ? data.length > 0 : Boolean(data);
    if (!hasData) {
        return <NoDataPlaceholder name={visual.name} />;
    }

    return (
        <ErrorBoundary FallbackComponent={ErrorFallback}>
            {visual.render({ data, config })}
        </ErrorBoundary>
    );
};

export default CustomVisualRenderer;
