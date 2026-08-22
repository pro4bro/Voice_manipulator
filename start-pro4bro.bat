@echo off
setlocal
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-pro4bro.ps1"
if errorlevel 1 (
  echo.
  echo Pro4Bro could not start. Review the error above.
  pause
  exit /b 1
)
