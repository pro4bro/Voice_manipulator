@echo off
setlocal
pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo Could not open the Pro4Bro folder.
  pause
  exit /b 1
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\restart-pro4bro.ps1"
set "exitCode=%errorlevel%"
popd
if not "%exitCode%"=="0" (
  echo.
  echo Pro4Bro could not restart. Review the error above.
  pause
)
exit /b %exitCode%
