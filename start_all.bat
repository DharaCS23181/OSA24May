@echo off
echo ============================================================
echo  OneStop Analytics - Starting All Services
echo ============================================================
echo.

REM ── DW Backend (port 8004) ────────────────────────────────────────────────
echo [1/4] Starting DW Backend on port 8004...
start "DW Backend :8004" cmd /k "cd /d d:\Projects\OSA\OSA24May\dw-backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload"

REM ── ETL Backend (port 8111) ───────────────────────────────────────────────
echo [2/4] Starting ETL Backend on port 8111...
start "ETL Backend :8111" cmd /k "cd /d d:\Projects\OSA\OSA24May\ETL-backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111 --reload"

REM ── Analytics Backend (port 8010) ─────────────────────────────────────────
echo [3/4] Starting Analytics Backend on port 8010...
start "Analytics Backend :8010" cmd /k "cd /d d:\Projects\OSA\OSA24May\Analytics-backend && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload"

REM ── Frontend (port 5173) ──────────────────────────────────────────────────
echo [4/4] Starting Frontend on port 5173...
start "Frontend :5173" cmd /k "cd /d d:\Projects\OSA\OSA24May\frontend && npm run dev"

echo.
echo ============================================================
echo  All services starting in separate windows.
echo  Frontend:           http://localhost:5173
echo  DW Backend:         http://localhost:8004/health
echo  ETL Backend:        http://localhost:8111/etl/health
echo  Analytics Backend:  http://localhost:8010/analytics/health
echo ============================================================
