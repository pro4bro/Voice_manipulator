@echo off
chcp 65001 >nul
setlocal
set "PRO4BRO_INTERACTIVE_CONSOLE=1"
start "Pro4Bro Local Server" cmd.exe /k call "%~dp0start-pro4bro.bat" start
exit /b 0