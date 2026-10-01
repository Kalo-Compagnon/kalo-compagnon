@echo off
cd /d "%~dp0"
if not exist node_modules call npm.cmd ci
if errorlevel 1 exit /b 1
call npm.cmd run build
if errorlevel 1 exit /b 1
call npm.cmd run build:fit
if errorlevel 1 exit /b 1
echo Ouvrir http://localhost:8787 dans le navigateur.
call npm.cmd run serve
