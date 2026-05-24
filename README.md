# Arithwise Data Warehouse

A full-stack data platform built with **FastAPI** (Python) and **React + Vite**, featuring a SQL Editor, Catalog Browser, Workspace with Notebooks, and a Jobs & Pipelines orchestration engine.

---

## Tech Stack

| Layer     | Technology                                       |
| --------- | ------------------------------------------------ |
| Frontend  | React 19, Vite 6, Tailwind CSS 4, Monaco Editor  |
| Backend   | FastAPI, SQLAlchemy (Postgres), Motor (MongoDB)   |
| Databases | PostgreSQL (Catalog & Queries, Jobs & Pipelines)  |
|           | MongoDB Atlas (Workspace & Notebooks)             |

---

## Prerequisites

| Tool       | Version  |
| ---------- | -------- |
| Python     | 3.10+    |
| Node.js    | 18+      |
| npm        | 9+       |
| PostgreSQL | 14+      |
| MongoDB    | Atlas or local instance |

---

## Project Structure

```
Data-Warehouse/
├── backend/                # FastAPI server
│   ├── app/
│   │   ├── core/           # Config, database connections
│   │   ├── models/         # SQLAlchemy & Pydantic models
│   │   ├── routes/         # API endpoints
│   │   ├── services/       # Business logic (orchestrator, workspace)
│   │   └── utils/          # Helpers
│   ├── .env                # Environment variables (see below)
│   ├── requirements.txt    # Python dependencies
│   └── init_jobs_tables.py # DB table initializer
├── frontend/               # React + Vite app
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── context/        # React context providers
│   │   ├── layout/         # Dashboard layout
│   │   ├── pages/          # Page-level components
│   │   ├── services/       # API service modules
│   │   └── styles/         # Global CSS & theme
│   └── package.json
└── README.md
```

---

## Setup & Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Atharva7115/Data-Warehouse.git
cd Data-Warehouse
```

### 2. Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file inside the `backend/` folder:

```env
# ── PostgreSQL (Catalog & SQL Queries) ──
DB_USER=postgres
DB_PASSWORD=your_postgres_password
DB_HOST=localhost
DB_PORT=5432
DB_NAME_PG=DemoData

# ── MongoDB Atlas (Workspace & Notebooks) ──
MONGO_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?appName=Cluster0
DB_NAME=workspace_db

# ── PostgreSQL (Jobs & Pipelines) ──
JOBS_DB_USER=postgres
JOBS_DB_PASSWORD=your_jobs_db_password
JOBS_DB_HOST=localhost
JOBS_DB_PORT=5432
JOBS_DB_NAME=Jobs_Pipelines
```

### 4. Initialize the Databases

Make sure PostgreSQL is running, then create the required databases:

```sql
-- In psql or pgAdmin
CREATE DATABASE "DemoData";
CREATE DATABASE "Jobs_Pipelines";
```

Then initialize the Jobs & Pipelines tables:

```bash
cd backend
python init_jobs_tables.py
```

### 5. Frontend Setup

```bash
cd frontend
npm install
```

---

## Running the Application

### Start the Backend (Port 8000)

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### Start the Frontend (Port 5173)

```bash
cd frontend
npm run dev
```

Open your browser at **http://localhost:5173**

---

## Key Features

### SQL Editor
- Monaco-based editor with syntax highlighting
- Run queries against your PostgreSQL database
- Format, share, and save queries

### Catalog Browser
- Browse schemas, tables, and columns from PostgreSQL
- View metadata, sample data, and column details

### Workspace
- Create folders, notebooks, and files (stored in MongoDB)
- Multi-cell notebook editor with SQL and Python support
- Favorites, trash, and search

### Jobs & Pipelines
- Create and schedule Jobs (single task) or Pipelines (multi-task DAG)
- Choose SQL queries or Workspace notebooks as task sources
- Built-in orchestrator with retry, timeout, and dependency management
- Real-time execution logs and status tracking

### Query History & Saved Queries
- Automatic query history (last 20 entries)
- Save, search, and manage your favorite queries

---

## API Endpoints

| Method | Endpoint                  | Description                 |
| ------ | ------------------------- | --------------------------- |
| GET    | `/api/catalog/schemas`    | List all schemas            |
| POST   | `/api/query/execute`      | Execute a SQL query         |
| GET    | `/api/workspace/`         | List all workspace items    |
| POST   | `/api/workspace/`         | Create a workspace item     |
| GET    | `/api/jobs`               | List all jobs               |
| POST   | `/api/jobs`               | Create a new job            |
| POST   | `/api/jobs/{id}/run`      | Run a job                   |
| GET    | `/api/history`            | Get query history           |
| GET    | `/api/saved-queries`      | Get saved queries           |

---

## Troubleshooting

| Issue                              | Fix                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| Backend won't start                | Check `.env` values and ensure PostgreSQL & MongoDB are up  |
| Frontend shows blank page          | Run `npm install` and restart `npm run dev`                 |
| Workspace shows "Loading..."       | Verify `MONGO_URI` in `.env` points to a valid cluster      |
| SQL queries fail                   | Confirm `DemoData` database exists and has tables           |
| Jobs tables missing                | Run `python init_jobs_tables.py` in the backend folder      |

---

## License

This project is part of the **Arithwise** platform.
