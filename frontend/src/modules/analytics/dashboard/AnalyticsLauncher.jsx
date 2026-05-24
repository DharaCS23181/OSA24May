import React from 'react';
import { motion } from 'framer-motion';
import { BarChart2, ExternalLink, ShieldCheck, Zap, Activity } from 'lucide-react';
import { Card } from '../../etl/components/ui/Card';

export default function AnalyticsLauncher() {
  const launchAnalytics = () => {
    // Analytics is a standalone app, likely running on a different port or path in production.
    // For now, we open a placeholder or the assumed local port for the Next.js/Vite analytics app.
    // Assuming port 3000 or a specific path. Here we'll just open a placeholder or a new tab.
    window.open('http://localhost:3000', '_blank');
  };

  return (
    <div className="h-full w-full flex flex-col items-center justify-center p-8 bg-[var(--df-bg-secondary)]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="max-w-2xl w-full text-center"
      >
        <div className="flex justify-center mb-6">
          <div className="relative">
            <div className="absolute inset-0 bg-[var(--df-accent)] blur-2xl opacity-20 rounded-full"></div>
            <div className="h-24 w-24 bg-[var(--df-bg)] rounded-2xl border border-[var(--df-border)] shadow-xl flex items-center justify-center relative z-10">
              <BarChart2 size={48} className="text-[var(--df-accent)]" />
            </div>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-[var(--df-strong)] mb-4 tracking-tight">
          OneStop Analytics Engine
        </h1>

        <p className="text-[var(--df-text-soft)] text-lg mb-10 max-w-xl mx-auto leading-relaxed">
          The Analytics platform operates in a dedicated high-performance environment to ensure your data visualization and complex aggregations run smoothly without impacting the core ETL and Data Warehouse operations.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10 text-left">
          <Card className="p-5 flex flex-col gap-3 bg-[var(--df-bg)] border-[var(--df-border)]">
            <Zap className="text-amber-500" size={24} />
            <div>
              <h3 className="font-semibold text-[var(--df-strong)] text-sm">Isolated Compute</h3>
              <p className="text-xs text-[var(--df-text-soft)] mt-1">Dedicated resources for heavy analytical queries.</p>
            </div>
          </Card>
          <Card className="p-5 flex flex-col gap-3 bg-[var(--df-bg)] border-[var(--df-border)]">
            <Activity className="text-emerald-500" size={24} />
            <div>
              <h3 className="font-semibold text-[var(--df-strong)] text-sm">Real-time Vis</h3>
              <p className="text-xs text-[var(--df-text-soft)] mt-1">Sub-second rendering for complex dashboards.</p>
            </div>
          </Card>
          <Card className="p-5 flex flex-col gap-3 bg-[var(--df-bg)] border-[var(--df-border)]">
            <ShieldCheck className="text-blue-500" size={24} />
            <div>
              <h3 className="font-semibold text-[var(--df-strong)] text-sm">Sandboxed</h3>
              <p className="text-xs text-[var(--df-text-soft)] mt-1">Safely explore data without affecting production ETL.</p>
            </div>
          </Card>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={launchAnalytics}
          className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-[var(--df-accent)] text-white font-medium text-lg shadow-lg hover:shadow-xl hover:bg-[var(--df-accent-medium)] transition-all"
        >
          <span>Launch Analytics Platform</span>
          <ExternalLink size={20} />
        </motion.button>

        <p className="text-xs text-[var(--df-text-muted)] mt-6">
          Opens in a new window
        </p>
      </motion.div>
    </div>
  );
}
