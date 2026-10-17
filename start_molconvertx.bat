@echo off
title MolConvertX
echo Starting MolConvertX...
echo.
echo Make sure Open Babel is installed and available as "obabel".
echo.
cd /d "%~dp0\backend"
if not exist ".venv\Scripts\python.exe" (
    echo Creating Python environment...
    python -m venv .venv
    call .venv\Scripts\activate
    pip install -r requirements.txt
) else (
    call .venv\Scripts\activate
)
start "MolConvertX Backend" cmd /k "uvicorn main:app --host 127.0.0.1 --port 8000"
cd /d "%~dp0\frontend"
if not exist "node_modules" npm install
start "MolConvertX Frontend" cmd /k "npm run dev"
timeout /t 3 >nul
start http://127.0.0.1:5173
