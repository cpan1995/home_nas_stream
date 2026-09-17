@echo off
setlocal
title Screening Room
set "launch_action="
if "%~1"=="--check" set "launch_action=-Action --check"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\launch-wsl.ps1" -Mode directory %launch_action%
set "launch_exit=%errorlevel%"
if "%launch_exit%"=="0" exit /b 0
echo.
echo Screening Room could not start. Review the error above.
echo Build the application in your WSL checkout and configure its local movie folder.
pause
exit /b %launch_exit%
