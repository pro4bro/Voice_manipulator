@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-portable-runtime.ps1" -Profile Auto
set "PRO4BRO_EXIT=%ERRORLEVEL%"
if not "%PRO4BRO_EXIT%"=="0" pause
exit /b %PRO4BRO_EXIT%
