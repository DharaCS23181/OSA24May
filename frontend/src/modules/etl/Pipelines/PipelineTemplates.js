export const PIPELINE_TEMPLATES = [
  {
    name: "🔄 CDC (Change Data Capture)",
    description: "Industry Standard: High-frequency log-based sync between Production SQL and Analytics Warehouse using incremental watermarks.",
    iconName: "refresh",
    dag_definition: {
      nodes: [
        { id: "src", type: "extract", position: { x: 50, y: 150 }, data: { label: "SQL Server (CDC)", connector_engine: "sql_server", is_incremental: true, cursor_column: "sys_change_version" } },
        { id: "dedup", type: "transform", position: { x: 300, y: 150 }, data: { label: "Log Deduplicator", transform_type: "deduplicate" } },
        { id: "dest", type: "load", position: { x: 550, y: 150 }, data: { label: "Snowflake / Postgres", output_format: "database", if_table_exists: "append" } }
      ],
      edges: [
        { id: "e1", source: "src", target: "dedup" },
        { id: "e2", source: "dedup", target: "dest" }
      ]
    }
  },
  {
    name: "⏳ SCD Type 2 History Tracking",
    description: "Data Archival Pattern: Tracks historical changes in dimensions (e.g., address changes) instead of overwriting records.",
    iconName: "history",
    dag_definition: {
      nodes: [
        { id: "bronze", type: "extract", position: { x: 50, y: 150 }, data: { label: "Bronze Raw (Current)", connector_engine: "parquet" } },
        { id: "scd", type: "transform_pandas", position: { x: 300, y: 150 }, data: { label: "SCD Type 2 Logic", task: "Generate effective_from and is_current flags" } },
        { id: "silver", type: "load", position: { x: 550, y: 150 }, data: { label: "Silver (Dimension History)", output_format: "datalake", layer: "silver" } }
      ],
      edges: [
        { id: "e1", source: "bronze", target: "scd" },
        { id: "e2", source: "scd", target: "silver" }
      ]
    }
  },
  {
    name: "📤 Reverse ETL (Activation)",
    description: "Business Operations Pattern: Syncs curated customer segments from your Data Warehouse back into SaaS tools like HubSpot or Slack.",
    iconName: "arrow-up",
    dag_definition: {
      nodes: [
        { id: "dw", type: "extract", position: { x: 50, y: 150 }, data: { label: "Warehouse (Gold)", connector_engine: "postgres" } },
        { id: "filter", type: "transform", position: { x: 300, y: 150 }, data: { label: "Segment Filter", transform_type: "select" } },
        { id: "saas", type: "load", position: { x: 550, y: 150 }, data: { label: "HubSpot / SaaS Target", output_format: "rest_api" } }
      ],
      edges: [
        { id: "e1", source: "dw", target: "filter" },
        { id: "e2", source: "filter", target: "saas" }
      ]
    }
  },
  {
    name: "📥 Ecommerce Multi-Channel",
    description: "Retail Intelligence: Consolidates sales from Shopify and Amazon, standardizes currency, and merges into a Global Sales table.",
    iconName: "shopping-cart",
    dag_definition: {
      nodes: [
        { id: "shop", type: "extract", position: { x: 50, y: 100 }, data: { label: "Shopify API", connector_engine: "rest_api" } },
        { id: "amz", type: "extract", position: { x: 50, y: 300 }, data: { label: "Amazon Seller API", connector_engine: "rest_api" } },
        { id: "norm", type: "transform", position: { x: 300, y: 200 }, data: { label: "Currency Normalizer", transform_type: "calculate" } },
        { id: "merge", type: "transform_pandas", position: { x: 500, y: 200 }, data: { label: "Global Order Merge", task: "Union and De-duplicate" } },
        { id: "gold", type: "load", position: { x: 750, y: 200 }, data: { label: "Gold (Global Sales)", output_format: "datalake", layer: "gold" } }
      ],
      edges: [
        { id: "e1", source: "shop", target: "norm" },
        { id: "e2", source: "amz", target: "norm" },
        { id: "e3", source: "norm", target: "merge" },
        { id: "e4", source: "merge", target: "gold" }
      ]
    }
  },
  {
    name: "🏴‍☠️ Dead Letter Queue (DLQ)",
    description: "Resilience Pattern: Captures malformed records that fail validation and routes them to a quarantine file for manual audit.",
    iconName: "alert-triangle",
    dag_definition: {
      nodes: [
        { id: "raw", type: "extract", position: { x: 50, y: 200 }, data: { label: "Input Stream", connector_engine: "csv" } },
        { id: "check", type: "transform", position: { x: 300, y: 200 }, data: { label: "Schema Validator", transform_type: "validate" } },
        { id: "silver", type: "load", position: { x: 550, y: 100 }, data: { label: "Silver (Success)", output_format: "datalake", layer: "silver" } },
        { id: "quarantine", type: "load", position: { x: 550, y: 300 }, data: { label: "DLQ (Quarantine)", output_format: "parquet" } }
      ],
      edges: [
        { id: "e1", source: "raw", target: "check" },
        { id: "e2", source: "check", target: "silver" },
        { id: "e3", source: "check", target: "quarantine" }
      ]
    }
  },
  {
    name: "🛡️ Data Security & GDPR",
    description: "Compliance Pattern: Detects PII (Emails, Names) and masks them using hashing before data enters the public lake.",
    iconName: "shield",
    dag_definition: {
      nodes: [
        { id: "raw", type: "extract", position: { x: 50, y: 150 }, data: { label: "Raw Customer Data", connector_engine: "postgres" } },
        { id: "hash", type: "transform", position: { x: 300, y: 150 }, data: { label: "PII Hashing", transform_type: "standardize" } },
        { id: "silver", type: "load", position: { x: 550, y: 150 }, data: { label: "Silver (Masked)", output_format: "datalake", layer: "silver" } }
      ],
      edges: [
        { id: "e1", source: "raw", target: "hash" },
        { id: "e2", source: "hash", target: "silver" }
      ]
    }
  },
  {
    name: "🪵 Log Aggregation (Syslog)",
    description: "Infrastructure Pattern: Consolidates millions of microservice logs, aggregates by severity, and archives for long-term storage.",
    iconName: "file-text",
    dag_definition: {
      nodes: [
        { id: "logs", type: "extract", position: { x: 50, y: 150 }, data: { label: "App Logs", connector_engine: "json" } },
        { id: "agg", type: "transform", position: { x: 300, y: 150 }, data: { label: "Count by Severity", transform_type: "aggregate" } },
        { id: "lake", type: "load", position: { x: 550, y: 150 }, data: { label: "Log Archive", output_format: "datalake", layer: "bronze" } }
      ],
      edges: [
        { id: "e1", source: "logs", target: "agg" },
        { id: "e2", source: "agg", target: "lake" }
      ]
    }
  },
  {
    name: "🚀 High-Speed Parquet Partitioning",
    description: "Performance Pattern: Auto-partitions massive datasets by Year/Month/Day for O(1) query performance in Athena/Presto.",
    iconName: "zap",
    dag_definition: {
      nodes: [
        { id: "db", type: "extract", position: { x: 50, y: 150 }, data: { label: "Big Data Source", connector_engine: "postgres" } },
        { id: "lake", type: "load", position: { x: 400, y: 150 }, data: { label: "Partitioned Lake", output_format: "datalake", partition_by: "date" } }
      ],
      edges: [
        { id: "e1", source: "db", target: "lake" }
      ]
    }
  },
  {
    name: "☁️ Multi-Cloud Cloud Sync",
    description: "Hybrid Cloud Pattern: Extracts data from AWS S3 and loads it directly into a PostgreSQL instance for local caching.",
    iconName: "cloud",
    dag_definition: {
      nodes: [
        { id: "s3", type: "extract", position: { x: 100, y: 150 }, data: { label: "S3 Bucket", connector_engine: "s3" } },
        { id: "local", type: "load", position: { x: 450, y: 150 }, data: { label: "Local Database", output_format: "database", table: "s3_cache" } }
      ],
      edges: [
        { id: "e1", source: "s3", target: "local" }
      ]
    }
  },
  {
    name: "🎯 Marketing Attribution",
    description: "Growth Pattern: Joins Ad Spend (Google Ads) with Web Conversions to calculate ROAS (Return on Ad Spend).",
    iconName: "target",
    dag_definition: {
      nodes: [
        { id: "ads", type: "extract", position: { x: 50, y: 100 }, data: { label: "Google Ads API", connector_engine: "rest_api" } },
        { id: "web", type: "extract", position: { x: 50, y: 300 }, data: { label: "Analytics API", connector_engine: "rest_api" } },
        { id: "roas", type: "transform_pandas", position: { x: 300, y: 200 }, data: { label: "ROAS Calculation", task: "Join on CampaignID and Calculate Spend/Revenue" } },
        { id: "gold", type: "load", position: { x: 600, y: 200 }, data: { label: "Marketing Gold", output_format: "datalake", layer: "gold" } }
      ],
      edges: [
        { id: "e1", source: "ads", target: "roas" },
        { id: "e2", source: "web", target: "roas" },
        { id: "e3", source: "roas", target: "gold" }
      ]
    }
  }
];
