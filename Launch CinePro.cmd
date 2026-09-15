@echo off
setlocal
title Screening Room - CinePro
if "%~1"=="--check" goto check
wsl.exe -d Ubuntu --cd /path/to/home_nas_stream -- ./build/screening-room --library /mnt/movies --data-dir .local --cinepro
set "cinepro_exit=%errorlevel%"
if not "%cinepro_exit%"=="0" goto failed
exit /b 0
:check
wsl.exe -d Ubuntu --cd /path/to/home_nas_stream -- node scripts/cinepro-launch.mjs --ui-only
exit /b %errorlevel%
:failed
echo.
echo Screening Room could not start. Review the error above.
echo If the executable is missing, run npm run build:native in the project folder in Ubuntu.
pause
exit /b %cinepro_exit%
