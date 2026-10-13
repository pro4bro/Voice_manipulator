@echo off
setlocal
cd /d "%~dp0..\.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\update-omnivoice.ps1"
if errorlevel 1 (
  echo.
  echo Update stopped safely. Review the message above.
  pause
  exit /b 1
)
pause
