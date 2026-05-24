"""
ArithFlow — Shared Constants.

Centralized configuration for UI display metadata,
system defaults, and resource limits.
"""

# Categorization and UI metadata for connectors
CONNECTOR_CATEGORIES = {
    # Files
    "csv":        {"category": "Files",      "icon": "📄", "color": "#64748B"},
    "excel":      {"category": "Files",      "icon": "📗", "color": "#217346"},
    "parquet":    {"category": "Files",      "icon": "🗜️", "color": "#8B5CF6"},
    "json":       {"category": "Files",      "icon": "📋", "color": "#F59E0B"},
    
    # Databases & Warehouses
    "postgres":   {"category": "Databases",  "icon": "🐘", "color": "#336791"},
    "mysql":      {"category": "Databases",  "icon": "🐬", "color": "#00618A"},
    "sqlite":     {"category": "Databases",  "icon": "🗃️", "color": "#003B57"},
    "mongodb":    {"category": "Databases",  "icon": "🍃", "color": "#47A248"},
    "redis":      {"category": "Databases",  "icon": "🔴", "color": "#DC382D"},
    "sql_server": {"category": "Databases",  "icon": "🪟", "color": "#CC292B"},
    "oracle":     {"category": "Databases",  "icon": "🅾️", "color": "#F80000"},
    "snowflake":  {"category": "Warehouses", "icon": "❄️",  "color": "#29B5E8"},
    "bigquery":   {"category": "Warehouses", "icon": "🔍", "color": "#4285F4"},
    "redshift":   {"category": "Warehouses", "icon": "📦", "color": "#8B0000"},
    "warehouse":  {"category": "Warehouses", "icon": "🏛️", "color": "#EC4899"},
    "s3":         {"category": "Cloud",      "icon": "☁️",  "color": "#FF9900"},
    "rest_api":   {"category": "APIs",       "icon": "🌐", "color": "#10B981"},

    # SaaS - CRM & ERP
    "salesforce": {"category": "CRM",        "icon": "☁️",  "color": "#00A1E0"},
    "zoho":       {"category": "CRM",        "icon": "🔴", "color": "#E42527"},
    "hubspot":    {"category": "CRM",        "icon": "🟧", "color": "#FF7A59"},
    "pipedrive":  {"category": "CRM",        "icon": "📈", "color": "#43B02A"},
    "d365":       {"category": "ERP",        "icon": "⚡", "color": "#0078D4"},
    "tally":      {"category": "ERP",        "icon": "📊", "color": "#1D4ED8"},
    "workday":    {"category": "ERP",        "icon": "💼", "color": "#005CB9"},
    "xero":       {"category": "Finance",    "icon": "🧾", "color": "#13B5EA"},
    "stripe":     {"category": "Finance",    "icon": "💳", "color": "#635BFF"},
    "paypal":     {"category": "Finance",    "icon": "🅿️", "color": "#003087"},

    # SaaS - Support & Comms
    "zendesk":    {"category": "Support",    "icon": "🎧", "color": "#03363D"},
    "intercom":   {"category": "Support",    "icon": "👋", "color": "#1F8CEB"},
    "sendgrid":   {"category": "Comms",      "icon": "✉️", "color": "#1A82E2"},
    "twilio":     {"category": "Comms",      "icon": "💬", "color": "#F22F46"},
    "slack":      {"category": "Comms",      "icon": "📱", "color": "#4A154B"},
    "discord":    {"category": "Comms",      "icon": "🎮", "color": "#5865F2"},
    "zoom":       {"category": "Comms",      "icon": "📹", "color": "#2D8CFF"},

    # SaaS - Project Management & Tools
    "notion":     {"category": "Tools",      "icon": "📓", "color": "#000000"},
    "asana":      {"category": "Tools",      "icon": "✅", "color": "#F06A6A"},
    "trello":     {"category": "Tools",      "icon": "📋", "color": "#0079BF"},
    "jira":       {"category": "Tools",      "icon": "📘", "color": "#0052CC"},
    "github":     {"category": "DevOps",     "icon": "🐙", "color": "#181717"},
    "gitlab":     {"category": "DevOps",     "icon": "🦊", "color": "#FC6D26"},
    "bitbucket":  {"category": "DevOps",     "icon": "🪣", "color": "#0052CC"},
    "datadog":    {"category": "DevOps",     "icon": "🐶", "color": "#632CA6"},
    "airtable":   {"category": "Tools",      "icon": "🗂️", "color": "#18BFFF"},

    # SaaS - Marketing & E-Commerce
    "shopify":    {"category": "E-Commerce", "icon": "🛍️", "color": "#95BF47"},
    "mailchimp":  {"category": "Marketing",  "icon": "🐵", "color": "#FFE01B"},
    "marketo":    {"category": "Marketing",  "icon": "🟣", "color": "#5C4C9F"},
    "mixpanel":   {"category": "Analytics",  "icon": "📊", "color": "#7A56F6"},
    "amplitude":  {"category": "Analytics",  "icon": "📈", "color": "#2563EB"},

    # Google & Meta Ecosystem
    "google_sheets":         {"category": "Google", "icon": "📊", "color": "#0F9D58"},
    "google_drive":          {"category": "Google", "icon": "📁", "color": "#4285F4"},
    "google_analytics":      {"category": "Google", "icon": "📈", "color": "#E37400"},
    "google_ads":            {"category": "Google", "icon": "🎯", "color": "#4285F4"},
    "google_search_console": {"category": "Google", "icon": "🔍", "color": "#4285F4"},
    "facebook_ads":          {"category": "Meta",   "icon": "📱", "color": "#1877F2"},
    "linkedin_ads":          {"category": "Ads",    "icon": "💼", "color": "#0A66C2"},
}

# Standard system tables to exclude from Catalog UI
SYSTEM_TABLES = {
    "pipelines", 
    "pipeline_versions", 
    "jobs", 
    "job_runs",
    "chunk_failures", 
    "connectors", 
    "alembic_version", 
    "system_settings", 
    "saved_credentials",
    "quality_rules",
    "quality_results",
    "job_logs",
    "saved_connections"
}
