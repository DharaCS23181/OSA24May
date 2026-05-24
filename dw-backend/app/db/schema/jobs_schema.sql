-- =============================================================================
-- onestop_platform — Workflow & History Schema Initialization Script
--
-- Previously targeted a separate 'workflow_db' database.
-- Now runs inside onestop_platform using schema-qualified names:
--   workflow.*   → job orchestration tables
--   history.*    → SQL query history tables
--
-- Safe to run multiple times (fully idempotent).
-- =============================================================================

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Schemas
CREATE SCHEMA IF NOT EXISTS workflow;
CREATE SCHEMA IF NOT EXISTS history;

-- 2. Define Enum Types inside workflow schema (safe: only creates if not existing)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'jobtype' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.jobtype AS ENUM ('Job', 'Pipeline');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'runstatus' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.runstatus AS ENUM ('Pending', 'Running', 'Success', 'Failed');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'taskrunstatus' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.taskrunstatus AS ENUM ('Pending', 'Running', 'Success', 'Failed', 'Skipped');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'tasktype' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.tasktype AS ENUM ('sql', 'notebook');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'tasktypecategory' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.tasktypecategory AS ENUM ('notebook', 'source', 'destination', 'sql');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'computetype' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.computetype AS ENUM ('Serverless', 'Cluster');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'backofftype' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.backofftype AS ENUM ('fixed', 'exponential');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'triggertype' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.triggertype AS ENUM ('Manual', 'Schedule');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'loglevel' AND n.nspname = 'workflow'
    ) THEN
        CREATE TYPE workflow.loglevel AS ENUM ('INFO', 'WARN', 'ERROR', 'DEBUG');
    END IF;
END $$;

-- history schema enum
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'querystatus' AND n.nspname = 'history'
    ) THEN
        CREATE TYPE history.querystatus AS ENUM ('success', 'failed');
    END IF;
END $$;

-- 3. Create Tables (safe: IF NOT EXISTS)

-- workflow.jobs
CREATE TABLE IF NOT EXISTS workflow.jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type workflow.jobtype NOT NULL DEFAULT 'Job',
    description TEXT DEFAULT '',
    owner VARCHAR(100) DEFAULT 'current_user',
    schedule_config JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- workflow.tasks
CREATE TABLE IF NOT EXISTS workflow.tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES workflow.jobs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type workflow.tasktype NOT NULL DEFAULT 'sql',
    task_type workflow.tasktypecategory NOT NULL DEFAULT 'notebook',
    query TEXT DEFAULT '',
    notebook_path VARCHAR(500) DEFAULT '',
    compute workflow.computetype DEFAULT 'Serverless',
    catalog VARCHAR(255) DEFAULT '',
    retry_count INTEGER DEFAULT 0,
    retry_limit INTEGER DEFAULT 0,
    retry_delay_seconds INTEGER DEFAULT 10,
    backoff_type workflow.backofftype DEFAULT 'fixed',
    timeout INTEGER DEFAULT 3600,
    depends_on JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- workflow.job_runs
CREATE TABLE IF NOT EXISTS workflow.job_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES workflow.jobs(id) ON DELETE CASCADE,
    status workflow.runstatus NOT NULL DEFAULT 'Pending',
    trigger_type workflow.triggertype DEFAULT 'Manual',
    parameters JSONB DEFAULT '[]',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- workflow.task_runs
CREATE TABLE IF NOT EXISTS workflow.task_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_run_id UUID NOT NULL REFERENCES workflow.job_runs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES workflow.tasks(id) ON DELETE CASCADE,
    status workflow.taskrunstatus NOT NULL DEFAULT 'Pending',
    resolved_query TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    attempt_number INTEGER DEFAULT 1,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- workflow.task_logs
CREATE TABLE IF NOT EXISTS workflow.task_logs (
    id SERIAL PRIMARY KEY,
    task_run_id UUID NOT NULL REFERENCES workflow.task_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level workflow.loglevel DEFAULT 'INFO',
    message TEXT NOT NULL
);

-- workflow.task_run_outputs
CREATE TABLE IF NOT EXISTS workflow.task_run_outputs (
    id SERIAL PRIMARY KEY,
    task_run_id UUID NOT NULL REFERENCES workflow.task_runs(id) ON DELETE CASCADE,
    output_type VARCHAR(50) DEFAULT 'table',
    output_name VARCHAR(500) DEFAULT '',
    rows_processed INTEGER DEFAULT 0
);

-- history.query_history (renamed from HistorySql.query_history)
CREATE TABLE IF NOT EXISTS history.query_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    status history.querystatus NOT NULL DEFAULT 'success',
    duration_ms INTEGER DEFAULT 0,
    row_count INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    user_email VARCHAR(255) DEFAULT 'current_user@onestop.com',
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- history.saved_queries (renamed from HistorySql.saved_queries)
CREATE TABLE IF NOT EXISTS history.saved_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sql TEXT NOT NULL,
    description TEXT DEFAULT '',
    user_email VARCHAR(255) DEFAULT 'current_user@onestop.com',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. ADD MISSING COLUMNS to existing tables (safe migration)
DO $$ BEGIN
    -- workflow.job_runs.trigger_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'job_runs' AND column_name = 'trigger_type'
    ) THEN
        ALTER TABLE workflow.job_runs ADD COLUMN trigger_type workflow.triggertype DEFAULT 'Manual';
    END IF;

    -- workflow.task_runs.resolved_query
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'task_runs' AND column_name = 'resolved_query'
    ) THEN
        ALTER TABLE workflow.task_runs ADD COLUMN resolved_query TEXT DEFAULT '';
    END IF;

    -- workflow.task_runs.attempt_number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'task_runs' AND column_name = 'attempt_number'
    ) THEN
        ALTER TABLE workflow.task_runs ADD COLUMN attempt_number INTEGER DEFAULT 1;
    END IF;

    -- workflow.tasks.retry_limit
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'tasks' AND column_name = 'retry_limit'
    ) THEN
        ALTER TABLE workflow.tasks ADD COLUMN retry_limit INTEGER DEFAULT 0;
    END IF;

    -- workflow.tasks.retry_delay_seconds
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'tasks' AND column_name = 'retry_delay_seconds'
    ) THEN
        ALTER TABLE workflow.tasks ADD COLUMN retry_delay_seconds INTEGER DEFAULT 10;
    END IF;

    -- workflow.tasks.backoff_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'tasks' AND column_name = 'backoff_type'
    ) THEN
        ALTER TABLE workflow.tasks ADD COLUMN backoff_type workflow.backofftype DEFAULT 'fixed';
    END IF;

    -- workflow.tasks.task_type (new column — TaskTypeCategory)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'workflow' AND table_name = 'tasks' AND column_name = 'task_type'
    ) THEN
        ALTER TABLE workflow.tasks ADD COLUMN task_type workflow.tasktypecategory DEFAULT 'notebook';
    END IF;
END $$;
