import React from 'react';
import { motion } from 'framer-motion';
import { FiDatabase, FiBook, FiBell, FiClock, FiZap, FiTrendingUp } from 'react-icons/fi';

const WelcomeScreen = ({ onCreateNew, recentFiles = [] }) => {
  const quickActions = [
    {
      id: 'sql',
      icon: FiDatabase,
      title: 'SQL Query',
      description: 'Start querying your data',
      color: '#3b82f6',
      shortcut: '⌘+N',
    },
    {
      id: 'notebook',
      icon: FiBook,
      title: 'Notebook',
      description: 'Create multi-cell workspace',
      color: '#8b5cf6',
      shortcut: '⌘+⇧+N',
    },
    {
      id: 'alert',
      icon: FiBell,
      title: 'Alert',
      description: 'Set up monitoring',
      color: '#f59e0b',
      shortcut: '⌘+⇧+A',
    },
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <div className="h-full flex items-center justify-center p-8" style={{ backgroundColor: 'var(--df-bg-secondary)' }}>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="max-w-4xl w-full"
      >
        {/* Hero Section */}
        <motion.div variants={item} className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6" style={{ background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)' }}>
            <FiZap size={40} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold mb-3" style={{ color: 'var(--df-strong)' }}>
            Welcome to SQL Workspace
          </h1>
          <p className="text-lg" style={{ color: 'var(--df-text-soft)' }}>
            Your professional analytics environment for data exploration and insights
          </p>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={item} className="mb-12">
          <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--df-text-muted)' }}>
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <motion.button
                  key={action.id}
                  onClick={() => onCreateNew(action.id)}
                  whileHover={{ y: -4, scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="group relative p-6 rounded-xl border-2 text-left transition-all duration-200 overflow-hidden"
                  style={{
                    backgroundColor: 'var(--df-card-bg)',
                    borderColor: 'var(--df-border)',
                  }}
                >
                  {/* Gradient on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-200"
                    style={{ background: `linear-gradient(135deg, ${action.color} 0%, ${action.color}dd 100%)` }}
                  />

                  <div className="relative z-10">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-all duration-200 group-hover:scale-110"
                      style={{ backgroundColor: `${action.color}20`, color: action.color }}
                    >
                      <Icon size={24} />
                    </div>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--df-strong)' }}>
                      {action.title}
                    </h3>
                    <p className="text-sm mb-3" style={{ color: 'var(--df-text-soft)' }}>
                      {action.description}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono px-2 py-1 rounded" style={{ backgroundColor: 'var(--df-bg-primary)', color: 'var(--df-text-muted)' }}>
                        {action.shortcut}
                      </span>
                      <svg className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: action.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Recent Files */}
        {recentFiles.length > 0 && (
          <motion.div variants={item}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--df-text-muted)' }}>
                <FiClock className="inline mr-2" size={14} />
                Recent Files
              </h2>
              <button className="text-xs font-medium hover:underline" style={{ color: 'var(--df-accent)' }}>
                View all
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {recentFiles.slice(0, 4).map((file, index) => (
                <motion.button
                  key={index}
                  whileHover={{ x: 4 }}
                  className="flex items-center gap-3 p-4 rounded-lg border text-left transition-all duration-200 hover:border-[var(--df-accent)]"
                  style={{
                    backgroundColor: 'var(--df-surface)',
                    borderColor: 'var(--df-border)',
                  }}
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--df-bg-primary)' }}>
                    {file.type === 'notebook' ? (
                      <FiBook size={18} style={{ color: '#8b5cf6' }} />
                    ) : (
                      <FiDatabase size={18} style={{ color: '#3b82f6' }} />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium truncate" style={{ color: 'var(--df-strong)' }}>
                      {file.name}
                    </h4>
                    <p className="text-xs truncate" style={{ color: 'var(--df-text-muted)' }}>
                      {file.lastModified}
                    </p>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <motion.div variants={item} className="mt-12 grid grid-cols-3 gap-6">
          {[
            { icon: FiDatabase, label: 'Queries Run', value: '1,234', color: '#3b82f6' },
            { icon: FiTrendingUp, label: 'Data Processed', value: '45.2 GB', color: '#10b981' },
            { icon: FiZap, label: 'Avg Query Time', value: '1.2s', color: '#f59e0b' },
          ].map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="text-center p-4 rounded-lg" style={{ backgroundColor: 'var(--df-surface)' }}>
                <Icon size={24} className="mx-auto mb-2" style={{ color: stat.color }} />
                <div className="text-2xl font-bold mb-1" style={{ color: 'var(--df-strong)' }}>
                  {stat.value}
                </div>
                <div className="text-xs" style={{ color: 'var(--df-text-muted)' }}>
                  {stat.label}
                </div>
              </div>
            );
          })}
        </motion.div>
      </motion.div>
    </div>
  );
};

export default WelcomeScreen;
