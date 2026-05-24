@echo off
echo Starting Data Warehouse backend using correct virtual environment (venv_fix)...
cd %~dp0backend
.\venv_fix\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8004 --reload
