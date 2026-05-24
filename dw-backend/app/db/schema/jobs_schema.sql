-- =============================================================================
-- Jobs & Pipelines Database Initialization Script
-- Creates all required schemas, enum types, and tables for the orchestration
-- and SQL history system. Safe to run multiple times (idempotent).
-- =============================================================================

-- 0. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Schemas
CREATE SCHEMA IF NOT EXISTS "HistorySql";

-- 2. Define Enum Types (safe: only creates if not existing)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'jobtype') THEN
        CREATE TYPE jobtype AS ENUM ('Job', 'Pipeline');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'runstatus') THEN
        CREATE TYPE runstatus AS ENUM ('Pending', 'Running', 'Success', 'Failed');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'taskrunstatus') THEN
        CREATE TYPE taskrunstatus AS ENUM ('Pending', 'Running', 'Success', 'Failed', 'Skipped');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tasktype') THEN
        CREATE TYPE tasktype AS ENUM ('sql', 'notebook');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'computetype') THEN
        CREATE TYPE computetype AS ENUM ('Serverless', 'Cluster');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'backofftype') THEN
        CREATE TYPE backofftype AS ENUM ('fixed', 'exponential');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'triggertype') THEN
        CREATE TYPE triggertype AS ENUM ('Manual', 'Schedule');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'loglevel') THEN
        CREATE TYPE loglevel AS ENUM ('INFO', 'WARN', 'ERROR', 'DEBUG');
    END IF;
END $$;

-- HistorySql schema enum (separate namespace)
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON t.typnamespace = n.oid
        WHERE t.typname = 'querystatus' AND n.nspname = 'HistorySql'
    ) THEN
        CREATE TYPE "HistorySql".querystatus AS ENUM ('success', 'failed');
    END IF;
END $$;

-- 3. Create Tables (safe: IF NOT EXISTS)

-- Jobs
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    type jobtype NOT NULL DEFAULT 'Job',
    description TEXT DEFAULT '',
    owner VARCHAR(100) DEFAULT 'current_user',
    schedule_config JSONB DEFAULT '{}',
    parameters JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type tasktype NOT NULL DEFAULT 'sql',
    query TEXT DEFAULT '',
    notebook_path VARCHAR(500) DEFAULT '',
    compute computetype DEFAULT 'Serverless',
    catalog VARCHAR(255) DEFAULT '',
    retry_count INTEGER DEFAULT 0,
    retry_limit INTEGER DEFAULT 0,
    retry_delay_seconds INTEGER DEFAULT 10,
    backoff_type backofftype DEFAULT 'fixed',
    timeout INTEGER DEFAULT 3600,
    depends_on JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Job Runs
CREATE TABLE IF NOT EXISTS job_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    status runstatus NOT NULL DEFAULT 'Pending',
    trigger_type triggertype DEFAULT 'Manual',
    parameters JSONB DEFAULT '[]',
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Task Runs
CREATE TABLE IF NOT EXISTS task_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    job_run_id UUID NOT NULL REFERENCES job_runs(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status taskrunstatus NOT NULL DEFAULT 'Pending',
    resolved_query TEXT DEFAULT '',
    error_message TEXT DEFAULT '',
    attempt_number INTEGER DEFAULT 1,
    started_at TIMESTAMP,
    ended_at TIMESTAMP
);

-- Task Logs
CREATE TABLE IF NOT EXISTS task_logs (
    id SERIAL PRIMARY KEY,
    task_run_id UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    level loglevel DEFAULT 'INFO',
    message TEXT NOT NULL
);

-- Task Run Outputs
CREATE TABLE IF NOT EXISTS task_run_outputs (
    id SERIAL PRIMARY KEY,
    task_run_id UUID NOT NULL REFERENCES task_runs(id) ON DELETE CASCADE,
    output_type VARCHAR(50) DEFAULT 'table',
    output_name VARCHAR(500) DEFAULT '',
    rows_processed INTEGER DEFAULT 0
);

-- SQL Query History (in HistorySql schema)
CREATE TABLE IF NOT EXISTS "HistorySql".query_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query TEXT NOT NULL,
    status "HistorySql".querystatus NOT NULL DEFAULT 'success',
    duration_ms INTEGER DEFAULT 0,
    row_count INTEGER DEFAULT 0,
    error_message TEXT DEFAULT '',
    user_email VARCHAR(255) DEFAULT 'current_user@arithwise.com',
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Saved Queries (in HistorySql schema)
CREATE TABLE IF NOT EXISTS "HistorySql".saved_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    sql TEXT NOT NULL,
    description TEXT DEFAULT '',
    user_email VARCHAR(255) DEFAULT 'current_user@arithwise.com',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. ADD MISSING COLUMNS to existing tables (safe migration)
--    This handles the case where tables already exist but are missing new columns.
DO $$ BEGIN
    -- job_runs.trigger_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'job_runs' AND column_name = 'trigger_type'
    ) THEN
        ALTER TABLE job_runs ADD COLUMN trigger_type triggertype DEFAULT 'Manual';
    END IF;

    -- task_runs.resolved_query
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_runs' AND column_name = 'resolved_query'
    ) THEN
        ALTER TABLE task_runs ADD COLUMN resolved_query TEXT DEFAULT '';
    END IF;

    -- task_runs.attempt_number
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'task_runs' AND column_name = 'attempt_number'
    ) THEN
        ALTER TABLE task_runs ADD COLUMN attempt_number INTEGER DEFAULT 1;
    END IF;

    -- tasks.retry_limit
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'retry_limit'
    ) THEN
        ALTER TABLE tasks ADD COLUMN retry_limit INTEGER DEFAULT 0;
    END IF;

    -- tasks.retry_delay_seconds
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'retry_delay_seconds'
    ) THEN
        ALTER TABLE tasks ADD COLUMN retry_delay_seconds INTEGER DEFAULT 10;
    END IF;

    -- tasks.backoff_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tasks' AND column_name = 'backoff_type'
    ) THEN
        ALTER TABLE tasks ADD COLUMN backoff_type backofftype DEFAULT 'fixed';
    END IF;
END $$;
