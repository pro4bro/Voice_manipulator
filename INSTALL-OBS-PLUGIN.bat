@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-obs-plugin.ps1" %*
set "PRO4BRO_EXIT=%ERRORLEVEL%"
pause
exit /b %PRO4BRO_EXIT%
