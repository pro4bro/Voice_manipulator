@echo off
setlocal
set "PSModulePath=%WINDIR%\System32\WindowsPowerShell\v1.0\Modules;%ProgramFiles%\WindowsPowerShell\Modules;%USERPROFILE%\Documents\WindowsPowerShell\Modules"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\new-portable-app-update.ps1" %*
set "PRO4BRO_EXIT=%ERRORLEVEL%"
pause
exit /b %PRO4BRO_EXIT%
