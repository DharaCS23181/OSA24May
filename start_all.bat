@echo off
echo Starting all OneStop Analytics services...

REM ETL Backend (port 8111)
start "ETL Backend" cmd /k "cd /d d:\Projects\OSA\OSA24May\ETL-backend && venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8111 --reload"

REM DW Backend (port 8004)
start "DW Backend" cmd /k "cd /d d:\Projects\OSA\OSA24May\dw-backend && venv_fix\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload"

REM Analytics Backend (port 8010)
start "Analytics Backend" cmd /k "cd /d d:\Projects\OSA\OSA24May\Analytics-backend && venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8010 --reload"

REM Frontend (port 5173)
start "Frontend" cmd /k "cd /d d:\Projects\OSA\OSA24May\frontend && npm run dev"

echo All services started. Frontend: http://localhost:5173
