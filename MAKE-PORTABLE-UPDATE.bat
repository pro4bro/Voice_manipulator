@echo off
setlocal
set "PSModulePath=%WINDIR%\System32\WindowsPowerShell\v1.0\Modules;%ProgramFiles%\WindowsPowerShell\Modules;%USERPROFILE%\Documents\WindowsPowerShell\Modules"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\new-portable-app-update.ps1" %*
set "PRO4BRO_EXIT=%ERRORLEVEL%"
if not "%PRO4BRO_EXIT%"=="0" pause
exit /b %PRO4BRO_EXIT%
