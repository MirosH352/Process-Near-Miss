@echo off
setlocal
cd /d "%~dp0"
start "" /b "C:\Users\miroslav.hilser\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" "%~dp0app.py"
timeout /t 2 >nul
start "" "http://127.0.0.1:8000"
