@echo off
rem Double-click or run: deploy.bat "optional commit message"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy.ps1" %*
pause
