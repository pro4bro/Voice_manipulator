@echo off
setlocal
set "PSModulePath=%WINDIR%\System32\WindowsPowerShell\v1.0\Modules;%ProgramFiles%\WindowsPowerShell\Modules;%USERPROFILE%\Documents\WindowsPowerShell\Modules"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0payload\scripts\update-portable.ps1" -BundleRoot "%~dp0payload" -ApplyOnly %*
set "PRO4BRO_EXIT=%ERRORLEVEL%"
if "%PRO4BRO_EXIT%"=="0" echo Update finished. Start the app from the full portable folder.
pause
exit /b %PRO4BRO_EXIT%
