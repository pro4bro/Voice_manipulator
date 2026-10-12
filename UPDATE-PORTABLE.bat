@echo off
setlocal
set "PSModulePath=%WINDIR%\System32\WindowsPowerShell\v1.0\Modules;%ProgramFiles%\WindowsPowerShell\Modules;%USERPROFILE%\Documents\WindowsPowerShell\Modules"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update-portable.ps1" -BundleRoot "%~dp0." %*
set "PRO4BRO_EXIT=%ERRORLEVEL%"
if "%PRO4BRO_EXIT%"=="0" echo Update finished. The transfer pack is in updates\app-current when this portable was updated from the source checkout.
pause
exit /b %PRO4BRO_EXIT%
