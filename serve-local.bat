@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel% equ 0 (
  set "PYTHON_CMD=py"
) else (
  where python >nul 2>nul
  if errorlevel 1 (
    echo Python was not found. Install Python and try again.
    pause
    exit /b 1
  )
  set "PYTHON_CMD=python"
)

echo Starting Agatio Games at http://localhost:8000/
start "" "http://localhost:8000/"
%PYTHON_CMD% -m http.server 8000

endlocal
