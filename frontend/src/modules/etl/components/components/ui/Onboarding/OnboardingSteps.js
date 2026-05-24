export const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'ArithFlow Transformation Mission',
    description: 'Welcome to the future of data engineering. You are about to transform raw chaos into structured intelligence. This mission will guide you through the 3 pillars of high-performance ETL.',
    target: null,
    position: 'center',
    proTip: 'ArithFlow uses Polars-powered memory management for 10x faster processing than traditional frameworks.'
  },
  {
    id: 'connectors',
    title: 'The Ingestion Core',
    description: 'Everything starts here. Connect to 35+ services—from Postgres to Shopify. Our connectivity layer handles the heavy lifting of authentication and schema discovery for you.',
    target: '[data-tour="connectors-list"]',
    position: 'bottom',
    actionLabel: 'Explore 35+ Connectors',
    actionPath: '/#/connectors',
    proTip: 'Use the "Security Vault" to store your API keys once; they are encrypted with AES-GCM and never stored in plain text.'
  },
  {
    id: 'pipelines',
    title: 'Pipeline Engineering',
    description: 'Design resilient data flows. Chain extracts, transforms, and loads with zero code. This is where your business logic becomes a high-speed execution artifact.',
    target: '[data-tour="new-pipeline"]',
    position: 'left',
    actionLabel: 'Launch Pipeline Editor',
    actionPath: '/#/editor',
    proTip: 'Toggle "Quality Guard" on any node to automatically scrap rows that don\'t match your target schema.'
  },
  {
    id: 'monitoring',
    title: 'Operational Awareness',
    description: 'Never guess if your data is healthy. Monitor every row move in real-time. Our logs provide sub-second grain on success, failure, and row-level throughput.',
    target: '[data-tour="job-logs"]',
    position: 'top',
    actionLabel: 'Monitor Live Jobs',
    actionPath: '/#/jobs',
    proTip: 'Click any log row to see a visual diagram of the pipeline architecture and exactly where it failed.'
  },
  {
    id: 'alerting',
    title: 'Proactive Intelligence',
    description: 'The best engineering is the kind you don\'t have to watch. Setup failure alerts to Slack or Telegram. ArithFlow will wake you up only when it matters.',
    target: '[data-tour="slack-config"]',
    position: 'bottom',
    actionLabel: 'Setup Failure Alerts',
    actionPath: '/#/settings',
    proTip: 'The Slack notifier supports custom payloads so you can include job IDs directly in your incident channels.'
  },
  {
    id: 'palette',
    title: 'Power User Mastery',
    description: 'Final tip: The Command Palette is your shortcut to everything. Search jobs, switch routes, or toggle dark mode instantly.',
    target: '[data-tour="search-trigger"]',
    position: 'bottom',
    proTip: 'Press ⌘K (or Ctrl+K) from anywhere to surface the palette. It\'s the fastest way to navigate ArithFlow.'
  }
];
