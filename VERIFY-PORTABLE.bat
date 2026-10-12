@echo off
setlocal
set "PSModulePath=%WINDIR%\System32\WindowsPowerShell\v1.0\Modules;%ProgramFiles%\WindowsPowerShell\Modules;%USERPROFILE%\Documents\WindowsPowerShell\Modules"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\test-portable-runtime.ps1" -Profile Auto
set "PRO4BRO_EXIT=%ERRORLEVEL%"
if "%PRO4BRO_EXIT%"=="0" echo Portable verification passed.
pause
exit /b %PRO4BRO_EXIT%
