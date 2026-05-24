# OneStop Analytics - Directory Structure Guide

## 📁 Complete Folder Organization

This document explains the entire directory structure of the OneStop Analytics project, what each folder contains, and how everything is organized.

---

## 🌳 Root Level Structure

```
osa/
├── backend/              # Python FastAPI backend server
├── frontend/             # React + Vite frontend application
├── .git/                 # Git version control
├── .gitignore            # Git ignore rules
├── README.md             # Project documentation
├── readme.txt            # Additional notes
├── start_backend.bat     # Windows script to start backend
└── vercel.json           # Vercel deployment configuration
```

### Purpose of Root Files:
- **start_backend.bat** - Quick script to launch the backend server on Windows
- **vercel.json** - Configuration for deploying to Vercel hosting
- **README.md** - Main project documentation with setup instructions

---

## 🔧 BACKEND STRUCTURE (`backend/`)

```
backend/
├── app/                  # Main application code
├── hadoop/               # Hadoop binaries (for Spark on Windows)
├── requirements/         # Python dependencies organized by environment
├── scripts/              # Utility scripts
├── spark-warehouse/      # Spark temporary storage
├── storage/              # File uploads and volumes storage
├── .env                  # Environment variables (DATABASE CREDENTIALS)
├── .gitignore            # Backend-specific git ignore
├── requirements.txt      # Main Python dependencies
├── dump_nb.py            # Database dump utility
├── fix_db_schema.py      # Schema migration script
├── migrate_trigger_type.py  # Database migration script
├── test_runs_api.py      # API testing script
└── verify_*.py/txt       # Verification scripts and outputs
```

### 📦 `backend/app/` - Main Application

```
app/
├── api/                  # (Empty - routes are in modules)
├── common/               # Shared utilities
│   └── utils/
│       ├── helper.py           # General helper functions
│       ├── sql_validator.py    # SQL query validation
│       └── __init__.py
├── core/                 # Core configuration and database
│   ├── config.py               # Environment configuration
│   ├── database.py             # PostgreSQL + MongoDB connections
│   ├── jobs_database.py        # Jobs DB connection (sync)
│   ├── async_jobs_database.py  # Jobs DB connection (async)
│   └── init_db.py              # Database initialization
├── db/                   # Database schemas
│   └── schema/
│       ├── schema.sql          # Main DB schema (empty - created dynamically)
│       └── jobs_schema.sql     # Jobs & Pipelines schema
├── models/               # (Empty - models are in modules)
├── modules/              # Feature modules (main business logic)
│   ├── catalog/          # Catalog management
│   ├── jobs/             # Jobs & Pipelines
│   ├── sql/              # SQL query execution
│   ├── volumes/          # File storage volumes
│   └── workspace/        # Workspace & Notebooks
├── routes/               # (Empty - routes are in modules)
├── schemas/              # (Empty - schemas are in modules)
├── services/             # Shared services
│   ├── execution_engine.py     # Unified query execution
│   ├── spark_service.py        # PySpark integration
│   └── session_manager.py      # Notebook session management
├── utils/                # (Empty - utils are in common)
├── __init__.py
├── main.py               # FastAPI application entry point
└── migrate_catalog_schema.py  # Catalog migration script
```


### 🎯 Module 1: Catalog (`modules/catalog/`)

**Purpose:** Manage database catalogs, schemas, and tables

```
catalog/
├── api/
│   └── catalog_routes.py       # REST API endpoints
│       • POST /api/catalog/create
│       • GET /api/catalog/list
│       • POST /api/catalog/schema/create
│       • GET /api/catalog/schemas
│       • GET /api/catalog/tables
│       • GET /api/catalog/tables/{table}/columns
│       • POST /api/catalog/upload-table
│       • DELETE /api/catalog/tables/{schema}/{table}
├── models/
│   ├── catalog_model.py        # SQLAlchemy model for catalogs
│   └── schema_model.py         # SQLAlchemy model for schemas
└── services/
    └── catalog_service.py      # Business logic
        • create_catalog()
        • list_catalogs()
        • create_schema()
        • get_all_tables()
        • upload_file_to_table()
```

**What it does:**
- Creates logical catalogs (like databases)
- Creates schemas within catalogs (bronze, silver, gold layers)
- Lists all tables across schemas
- Shows table columns and metadata
- Uploads CSV/Excel files to create tables
- Drops tables

---

### 🎯 Module 2: SQL Query Engine (`modules/sql/`)

**Purpose:** Execute SQL queries and manage query history

```
sql/
├── api/
│   ├── query_routes.py              # Execute queries
│   │   • POST /api/query/execute
│   ├── paginated_query_routes.py    # Paginated results
│   │   • POST /api/query/paginated
│   └── sql_history_routes.py        # Query history
│       • GET /api/history
│       • POST /api/history
│       • GET /api/saved-queries
│       • POST /api/saved-queries
│       • DELETE /api/saved-queries/{id}
├── models/
│   ├── query_model.py               # Query request/response
│   ├── response_model.py            # Standard response format
│   ├── pagination_models.py         # Pagination models
│   └── sql_history_models.py        # History models
└── services/
    ├── query_parser.py              # SQL parsing utilities
    └── paginated_executor.py        # Pagination logic
```

**What it does:**
- Executes SQL queries (SELECT, INSERT, UPDATE, DELETE, DDL)
- Supports PostgreSQL and Spark engines
- Automatically saves query history
- Manages saved queries
- Provides paginated results for large datasets

---

### 🎯 Module 3: Jobs & Pipelines (`modules/jobs/`)

**Purpose:** Create and execute scheduled jobs with task dependencies

```
jobs/
├── api/
│   ├── job_routes.py           # Job CRUD and execution
│   │   • GET /api/jobs
│   │   • POST /api/jobs
│   │   • GET /api/jobs/{id}
│   │   • PUT /api/jobs/{id}
│   │   • DELETE /api/jobs/{id}
│   │   • POST /api/jobs/{id}/run
│   │   • GET /api/jobs/{id}/runs
│   │   • POST /api/jobs/{id}/tasks
│   └── run_routes.py           # Run monitoring
│       • GET /api/runs
│       • GET /api/runs/{id}
│       • GET /api/runs/{id}/tasks/{task_id}/logs
├── models/
│   └── job_models.py           # SQLAlchemy models
│       • Job, Task, JobRun, TaskRun, TaskLog
├── schemas/
│   ├── job_schemas.py          # Pydantic request/response
│   └── job_serializers.py      # Model serialization
├── services/
│   ├── orchestrator.py         # DAG execution engine
│   ├── scheduler.py            # Cron-based scheduler
│   └── run_logger.py           # Real-time logging
└── executor/
    └── task_executor.py        # Individual task execution
```

**What it does:**
- Creates Jobs (single task) and Pipelines (multi-task DAG)
- Schedules jobs with cron expressions
- Executes tasks with dependency resolution
- Supports SQL and Notebook task types
- Retries failed tasks with backoff
- Provides real-time logs
- Injects parameters into queries


### 🎯 Module 4: Volumes (`modules/volumes/`)

**Purpose:** Manage file storage and convert files to tables

```
volumes/
├── api/
│   ├── volume_routes.py        # Volume CRUD
│   │   • POST /api/volume/create
│   │   • POST /api/volume/upload
│   │   • POST /api/volume/{file_id}/convert
│   │   • DELETE /api/volume/{id}
│   │   • GET /api/volumes
│   │   • GET /api/volumes/{id}/files
│   └── tag_routes.py           # Table tagging
│       • POST /api/tags
│       • GET /api/tags
│       • DELETE /api/tags/{id}
├── models/
│   ├── volume_model.py         # Volume and VolumeFile models
│   └── tag_model.py            # TableTag model
└── services/
    └── volume_service.py       # Volume business logic
```

**What it does:**
- Creates volume containers (storage areas)
- Uploads files (CSV, Excel, Parquet)
- Converts files to database tables
- Tags tables with metadata
- Manages file lifecycle

**Storage Location:** `backend/storage/volumes/`

---

### 🎯 Module 5: Workspace (`modules/workspace/`)

**Purpose:** Manage notebooks, folders, and files (stored in MongoDB)

```
workspace/
├── api/
│   ├── workspace_routes.py     # Workspace CRUD
│   │   • POST /api/workspace/
│   │   • GET /api/workspace/
│   │   • GET /api/workspace/notebooks
│   │   • PUT /api/workspace/{id}
│   │   • DELETE /api/workspace/{id}
│   │   • PATCH /api/workspace/{id}/restore
│   │   • POST /api/workspace/{id}/clone
│   └── notebook_routes.py      # Notebook execution
│       • POST /api/notebook/execute
├── models/
│   └── workspace_models.py     # Pydantic models (not SQLAlchemy)
└── services/
    └── workspace_service.py    # MongoDB operations
```

**What it does:**
- Creates folders, notebooks, and files
- Organizes items hierarchically
- Executes notebook cells (SQL, Python, Markdown, Shell)
- Manages favorites and trash
- Clones and moves items

**Storage:** MongoDB Atlas (document database)

---

### 🔧 Shared Services (`services/`)

```
services/
├── execution_engine.py         # Unified execution dispatcher
│   • Routes SQL/Python to appropriate engine
│   • Supports PostgreSQL, Spark, subprocess
│   • Handles magic commands (%sql, %python, %md, %sh)
│   • Security: SQL injection prevention
├── spark_service.py            # PySpark integration
│   • Manages Spark session
│   • Auto-discovers PostgreSQL tables
│   • Executes Spark SQL and PySpark
└── session_manager.py          # Notebook sessions
    • Manages persistent Python contexts
    • Isolates notebook variables
    • Handles session cleanup
```

---

### 📦 Requirements (`requirements/`)

```
requirements/
├── base.txt                    # Core dependencies (all environments)
├── dev.txt                     # Development dependencies
└── prod.txt                    # Production dependencies
```

**Main dependencies (requirements.txt):**
- fastapi - Web framework
- uvicorn - ASGI server
- sqlalchemy - ORM for PostgreSQL
- psycopg2-binary - PostgreSQL driver
- motor - Async MongoDB driver
- pyspark - Spark integration
- pandas, matplotlib, plotly - Data analysis
- python-jose, passlib - Authentication (not yet implemented)

---

### 🛠️ Scripts (`scripts/`)

```
scripts/
├── apply_rbac.py               # Apply role-based access control
└── seed_pipeline.py            # Seed sample pipeline data
```


---

## 🎨 FRONTEND STRUCTURE (`frontend/`)

```
frontend/
├── dist/                 # Production build output
├── node_modules/         # NPM dependencies
├── public/               # Static assets
│   ├── monaco-editor/    # Monaco editor assets
│   ├── favicon.svg
│   └── icons.svg
├── src/                  # Source code
├── .env                  # Environment variables
├── .gitignore
├── eslint.config.js      # ESLint configuration
├── index.html            # HTML entry point
├── package.json          # NPM dependencies and scripts
├── package-lock.json
├── README.md
├── replace.cjs           # Build script
├── replace2.cjs          # Build script
├── split_css.py          # CSS optimization script
└── vite.config.js        # Vite build configuration
```

### 📱 `frontend/src/` - Source Code

```
src/
├── Analytics/            # Analytics dashboard (incomplete)
│   ├── Analytics/
│   └── dashboard/
│       └── AnalyticsHub.jsx
├── assets/               # Images, fonts, etc.
├── components/           # Reusable UI components
│   ├── Catalog/          # Catalog-specific components
│   ├── jobs/             # Jobs-specific components
│   ├── shared/           # Shared across features
│   └── workspace/        # Workspace-specific components
├── context/              # React Context providers
│   ├── DataContext.jsx
│   ├── JobsContext.jsx
│   ├── ThemeContext.jsx
│   ├── ToastContext.jsx
│   └── WorkspaceContext.jsx
├── ETL/                  # ETL connectors (incomplete)
│   ├── components/
│   ├── Connectors/
│   │   └── ConnectorHub.jsx
│   └── services/
├── hooks/                # Custom React hooks
├── layout/               # Layout components
│   └── DashboardLayout.jsx
├── mock/                 # Mock data for development
├── pages/                # Page components (routes)
│   ├── Auth/
│   ├── Catalog/
│   ├── Jobs/
│   ├── Landing/
│   ├── Platform/
│   ├── Runs/
│   ├── SqlEditor/
│   └── Workspace/
├── platform/             # Platform-specific code
├── services/             # API service layer
│   ├── api.js
│   ├── queryService.js
│   ├── workspaceService.js
│   └── workspaceSeeder.js
├── styles/               # Global styles
│   └── (CSS files)
├── App.css
├── App.jsx               # Main App component
├── index.css             # Global CSS
└── main.jsx              # React entry point
```

---

### 📄 Pages (`pages/`)

**Purpose:** Top-level route components

```
pages/
├── Auth/                       # Authentication pages
│   ├── Login.jsx               # User login
│   └── Signup.jsx              # User registration
├── Catalog/                    # Catalog browser
│   ├── Catalog.jsx             # Main catalog page
│   └── DataInjectionPage.jsx  # Data upload page
├── Jobs/                       # Jobs & Pipelines
│   ├── JobsList.jsx            # List all jobs
│   ├── CreateJob.jsx           # Visual DAG builder
│   ├── CreateJobSimple.jsx     # Simple job form
│   ├── JobDetails.jsx          # Job details page
│   ├── JobOverviewPanel.jsx    # Job metadata panel
│   ├── JobRunsPanel.jsx        # Run history panel
│   ├── RunHistoryPanel.jsx     # Detailed run logs
│   └── jobDetailsUtils.jsx     # Utility functions
├── Landing/                    # Landing page
│   ├── LandingPage.jsx         # Main landing page
│   ├── HeroAnimation.jsx       # Hero section animation
│   └── LandingData.jsx         # Landing page data
├── Platform/                   # Platform selection
│   └── ProjectSelector.jsx     # Project selector page
├── Runs/                       # Global runs view
│   └── GlobalRunsPage.jsx      # All job runs
├── SqlEditor/                  # SQL Editor
│   ├── SqlLab.jsx              # Main SQL editor
│   ├── SavedQueriesPage.jsx    # Saved queries
│   └── QueryHistoryPage.jsx    # Query history
└── Workspace/                  # Workspace & Notebooks
    └── WorkspacePage.jsx       # Main workspace page
```

**Routing (in App.jsx):**
- `/` → Redirects to `/workspace`
- `/login` → Login page
- `/signup` → Signup page
- `/sql-editor` → SQL Lab
- `/catalog` → Catalog browser
- `/workspace` → Workspace & notebooks
- `/jobs` → Jobs list
- `/jobs/create` → Create job (DAG builder)
- `/jobs/:jobId` → Job details
- `/runs` → Global runs page


### 🧩 Components (`components/`)

**Purpose:** Reusable UI components organized by feature

```
components/
├── Catalog/                    # Catalog-specific components
│   ├── CatalogSidebar.jsx      # Catalog tree navigation
│   ├── TableDetailsView.jsx    # Table metadata display
│   ├── SchemaDetailsView.jsx   # Schema details
│   ├── VolumePanel.jsx         # Volume management
│   ├── CreateCatalogModal.jsx  # Catalog creation modal
│   ├── CreateSchemaModal.jsx   # Schema creation modal
│   ├── CreateVolumeModal.jsx   # Volume creation modal
│   ├── TablePreviewModal.jsx   # Table data preview
│   ├── TableTabContent.jsx     # Table tab content
│   ├── UploadTableDirectModal.jsx  # File upload modal
│   ├── VolumeDetailsView.jsx   # Volume details
│   ├── VolumeUploadModal.jsx   # Volume file upload
│   └── CatalogCreateDropdown.jsx  # Create dropdown
├── jobs/                       # Jobs-specific components
│   ├── DAGView.jsx             # Visual DAG editor (using @xyflow/react)
│   ├── TaskCreateModal.jsx     # Task creation modal
│   ├── TaskDetails.jsx         # Task configuration
│   ├── TaskAdvancedSettings.jsx  # Advanced task settings
│   ├── ScheduleConfigurator.jsx  # Cron schedule builder
│   ├── JobParameters.jsx       # Parameter management
│   ├── TaskLogViewer.jsx       # Real-time log display
│   └── JobsTableRow.jsx        # Job list row
├── shared/                     # Shared across all features
│   ├── LoadingSkeleton.jsx     # Loading states
│   ├── TagBadge.jsx            # Tag display
│   └── ToastContainer.jsx      # Notification system
├── workspace/                  # Workspace-specific components
│   ├── WorkspaceSidebar.jsx    # Folder tree navigation
│   ├── NotebookEditor.jsx      # Multi-cell notebook editor
│   ├── NotebookCell.jsx        # Individual cell component
│   ├── FileList.jsx            # File listing
│   ├── ContextMenu.jsx         # Right-click menu
│   ├── CreateDropdown.jsx      # Create item dropdown
│   ├── ActionModal.jsx         # Action confirmation modal
│   ├── Breadcrumbs.jsx         # Navigation breadcrumbs
│   └── SearchBar.jsx           # Search functionality
├── CatalogSelector.jsx         # Catalog selection dropdown
├── ErrorBoundary.jsx           # Error boundary wrapper
├── Navbar.jsx                  # Top navigation bar
├── QueryTabs.jsx               # Query tab management
├── ResultsPanel.jsx            # Query results display
├── SaveQueryModal.jsx          # Save query modal
├── SchemaBrowser.jsx           # Schema tree browser
├── Sidebar.jsx                 # Main sidebar navigation
└── SqlEditor.jsx               # Monaco SQL editor wrapper
```

---

### 🎣 Context Providers (`context/`)

**Purpose:** Global state management using React Context

```
context/
├── DataContext.jsx             # Global data state
│   • Manages catalogs, schemas, tables
│   • Provides data fetching functions
├── JobsContext.jsx             # Jobs and runs state
│   • Manages jobs list
│   • Tracks active runs
├── WorkspaceContext.jsx        # Workspace items state
│   • Manages folders, notebooks, files
│   • Handles workspace operations
├── ThemeContext.jsx            # Theme management
│   • Light/dark mode
│   • Theme preferences
└── ToastContext.jsx            # Notification system
    • Shows success/error messages
    • Toast queue management
```

---

### 🔌 Services (`services/`)

**Purpose:** API communication layer

```
services/
├── api.js                      # Axios instance configuration
│   • Base URL: http://localhost:8000
│   • Request/response interceptors
│   • Error handling
├── queryService.js             # Query execution API calls
│   • executeQuery()
│   • getQueryHistory()
│   • saveQuery()
├── workspaceService.js         # Workspace API calls
│   • createItem()
│   • updateItem()
│   • deleteItem()
│   • executeNotebookCell()
└── workspaceSeeder.js          # Sample data seeding
    • Creates sample folders and notebooks
```

---

### 🎨 Layout (`layout/`)

```
layout/
└── DashboardLayout.jsx         # Main dashboard layout
    • Sidebar navigation
    • Top navbar
    • Content area
    • Responsive design
```


---

## 🗄️ DATABASE STRUCTURE

### PostgreSQL Database 1: `osa` (or `DemoData`)

**Purpose:** Catalog metadata and user data

**Tables:**
```sql
-- Catalog Management
catalogs (id, name, created_at)
logical_schemas (id, name, catalog_id, physical_schema_name, created_at)

-- Volume Management
volumes (id, name, catalog_name, schema_name, created_at)
volume_files (id, volume_id, filename, file_type, status, storage_path)

-- Table Tagging
table_tags (id, table_name, schema_name, tag_name, tag_value)

-- User Data Tables (created dynamically)
{catalog}_bronze.{table_name}
{catalog}_silver.{table_name}
{catalog}_gold.{table_name}
```

---

### PostgreSQL Database 2: `Jobs_Pipelines`

**Purpose:** Jobs, tasks, runs, and logs

**Schemas:**
- `public` - Job definitions and runs
- `HistorySql` - Query history and saved queries

**Tables:**
```sql
-- Job Definitions
jobs (id, name, type, description, schedule_config, parameters)
tasks (id, job_id, name, type, query, notebook_path, depends_on, retry_config)

-- Execution Tracking
job_runs (id, job_id, status, trigger_type, started_at, ended_at)
task_runs (id, job_run_id, task_id, status, resolved_query, error_message)
task_logs (id, task_run_id, timestamp, level, message)
task_run_outputs (id, task_run_id, output_type, rows_processed)

-- Query History (HistorySql schema)
HistorySql.query_history (id, query, status, duration_ms, row_count, executed_at)
HistorySql.saved_queries (id, name, sql, description, created_at)
```

---

### MongoDB Database: `workspace_db`

**Purpose:** Workspace items (folders, notebooks, files)

**Collection:** `workspace_items`

**Document Structure:**
```json
{
  "_id": "uuid",
  "name": "My Notebook",
  "type": "folder | notebook | file",
  "parent_id": "uuid | null",
  "content": {
    "cells": [
      {
        "id": "uuid",
        "type": "sql | python | markdown | shell",
        "content": "SELECT * FROM users",
        "output": { ... }
      }
    ]
  },
  "is_favorite": false,
  "is_deleted": false,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

---

## 🔄 DATA FLOW

### SQL Query Execution Flow
```
User (Frontend)
    ↓
SqlLab.jsx
    ↓
queryService.executeQuery()
    ↓
POST /api/query/execute
    ↓
query_routes.py
    ↓
execution_engine.execute()
    ↓
[PostgreSQL or Spark]
    ↓
Results → Frontend
    ↓
Auto-save to query_history
```

### Job Execution Flow
```
User (Frontend)
    ↓
CreateJob.jsx (DAG Builder)
    ↓
POST /api/jobs
    ↓
job_routes.py
    ↓
Create Job + Tasks in DB
    ↓
POST /api/jobs/{id}/run
    ↓
orchestrator.trigger_job_run()
    ↓
scheduler_loop() (background)
    ↓
Execute tasks with dependencies
    ↓
task_executor.execute_sql_task()
    ↓
execution_engine.execute()
    ↓
Save logs to task_logs
    ↓
Frontend polls for logs
```

### Notebook Execution Flow
```
User (Frontend)
    ↓
NotebookEditor.jsx
    ↓
POST /api/notebook/execute
    ↓
notebook_routes.py
    ↓
execution_engine.execute()
    ↓
[SQL → PostgreSQL/Spark]
[Python → subprocess or Spark]
    ↓
Results with output
    ↓
Display in NotebookCell.jsx
```


---

## 📦 KEY DEPENDENCIES

### Backend (Python)
```
fastapi              # Web framework
uvicorn              # ASGI server
sqlalchemy           # ORM for PostgreSQL
psycopg2-binary      # PostgreSQL driver
motor                # Async MongoDB driver
pyspark              # Spark integration
pandas               # Data manipulation
matplotlib, plotly   # Visualization
python-dotenv        # Environment variables
pydantic             # Data validation
```

### Frontend (JavaScript)
```
react                # UI framework
react-dom            # React DOM renderer
react-router-dom     # Routing
vite                 # Build tool
tailwindcss          # CSS framework
@monaco-editor/react # Code editor
@tanstack/react-query # Data fetching
@xyflow/react        # DAG visualization
axios                # HTTP client
framer-motion        # Animations
lucide-react         # Icons
```

---

## 🔧 CONFIGURATION FILES

### Backend Configuration

**`.env`** - Environment variables
```env
# PostgreSQL (Catalog)
DB_USER=postgres
DB_PASSWORD=Arithwise123
DB_HOST=localhost
DB_PORT=5432
DB_NAME_PG=osa

# MongoDB (Workspace)
MONGO_URI=mongodb+srv://...
DB_NAME=workspace_db

# PostgreSQL (Jobs)
JOBS_DB_USER=postgres
JOBS_DB_PASSWORD=Arithwise123
JOBS_DB_HOST=localhost
JOBS_DB_PORT=5432
JOBS_DB_NAME=Jobs_Pipelines

# Spark
SPARK_MASTER=local[*]
SPARK_DRIVER_MEMORY=2g
```

---

### Frontend Configuration

**`.env`** - Environment variables
```env
VITE_API_URL=http://localhost:8004
```
⚠️ **Note:** Should be `http://localhost:8000` (backend runs on 8000)

**`vite.config.js`** - Vite build configuration
```javascript
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { ... }
  }
})
```

**`package.json`** - NPM scripts
```json
{
  "scripts": {
    "dev": "vite",              // Start dev server
    "build": "vite build",      // Build for production
    "preview": "vite preview",  // Preview production build
    "lint": "eslint ."          // Lint code
  }
}
```

---

## 🚀 HOW TO RUN

### Start Backend
```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### Start Frontend
```bash
cd frontend
npm run dev
```

### Access Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

---

## 📝 NAMING CONVENTIONS

### Backend
- **Files:** `snake_case.py` (e.g., `catalog_routes.py`)
- **Classes:** `PascalCase` (e.g., `CatalogService`)
- **Functions:** `snake_case()` (e.g., `create_catalog()`)
- **Variables:** `snake_case` (e.g., `job_run_id`)

### Frontend
- **Files:** `PascalCase.jsx` for components (e.g., `SqlLab.jsx`)
- **Files:** `camelCase.js` for utilities (e.g., `queryService.js`)
- **Components:** `PascalCase` (e.g., `NotebookEditor`)
- **Functions:** `camelCase()` (e.g., `executeQuery()`)
- **Variables:** `camelCase` (e.g., `jobRunId`)

### Database
- **Tables:** `snake_case` (e.g., `job_runs`)
- **Columns:** `snake_case` (e.g., `created_at`)
- **Schemas:** `{catalog}_{layer}` (e.g., `sales_bronze`)


---

## 💡 HOW TO ORGANIZE YOUR CODE

### ✅ Good Practices Currently Used

1. **Modular Architecture** - Features are separated into modules
2. **Separation of Concerns** - API, models, services are separated
3. **Consistent Naming** - snake_case for Python, PascalCase for React
4. **Environment Variables** - Credentials in .env files

### ⚠️ Areas for Improvement

1. **Consolidate Models** - Move all SQLAlchemy models to `app/models/`
2. **Consolidate Schemas** - Move all Pydantic schemas to `app/schemas/`
3. **Add API Versioning** - Create `app/api/v1/` for routes
4. **Add Tests** - Create `backend/tests/` and `frontend/tests/`
5. **Add Documentation** - Create `docs/` folder
6. **Smaller Components** - Split large files (>500 lines)

---

## 📚 QUICK REFERENCE

### Find a Feature

| Feature | Backend Location | Frontend Location |
|---------|-----------------|-------------------|
| SQL Editor | `modules/sql/` | `pages/SqlEditor/` |
| Catalog Browser | `modules/catalog/` | `pages/Catalog/` |
| Workspace/Notebooks | `modules/workspace/` | `pages/Workspace/` |
| Jobs/Pipelines | `modules/jobs/` | `pages/Jobs/` |
| File Uploads | `modules/volumes/` | `components/Catalog/` |

### Find Configuration

| What | Location |
|------|----------|
| Database credentials | `backend/.env` |
| API URL | `frontend/.env` |
| Backend port | `backend/app/main.py` (8000) |
| Frontend port | `frontend/vite.config.js` (5173) |
| Dependencies | `backend/requirements.txt`, `frontend/package.json` |

### Find Database Schema

| Database | Schema File |
|----------|-------------|
| Jobs & Pipelines | `backend/app/db/schema/jobs_schema.sql` |
| Catalog (dynamic) | Created at runtime |
| Workspace | MongoDB (no schema file) |

---

## 🎯 SUMMARY

**Backend Organization:**
- **Modular** - Each feature is a separate module
- **Layered** - API → Services → Database
- **Shared** - Common code in `core/` and `services/`

**Frontend Organization:**
- **Feature-based** - Pages, components, services by feature
- **Reusable** - Shared components in `components/shared/`
- **Context** - Global state in `context/`

**Database Organization:**
- **PostgreSQL 1** - Catalog metadata and user data
- **PostgreSQL 2** - Jobs, tasks, runs, logs
- **MongoDB** - Workspace items (folders, notebooks)

---

**This structure allows:**
- ✅ Easy to find related code
- ✅ Easy to add new features
- ✅ Easy to test individual modules
- ✅ Easy to scale the application
- ✅ Clear separation of concerns

**Next Steps:**
1. Review this structure
2. Identify areas to improve
3. Gradually refactor large files
4. Add missing tests
5. Add API documentation
