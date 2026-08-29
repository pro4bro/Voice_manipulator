@echo off
chcp 65001 >nul
setlocal
pushd "%~dp0" >nul 2>&1
if errorlevel 1 (
  echo Could not open the Pro4Bro folder.
  pause
  exit /b 1
)
set "command=%~1"
if "%command%"=="" set "command=start"
rem Always give start its own durable operator console. The environment guard prevents nesting.
if /I "%command%"=="start" if not defined PRO4BRO_INTERACTIVE_CONSOLE (
  set "PRO4BRO_INTERACTIVE_CONSOLE=1"
  start "Pro4Bro Local Server" cmd.exe /k call "%~f0" start
  popd
  exit /b 0
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%CD%\scripts\pro4bro-console.ps1" %command%
set "exitCode=%errorlevel%"
popd
if not "%exitCode%"=="0" (
  echo.
  echo Pro4Bro could not complete "%command%". Review the error above.
  pause
)
exit /b %exitCode%
