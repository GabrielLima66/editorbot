@echo off
rem Atualiza a extensao "Orpen - Editor de Bot" a partir do GitHub (ver atualizar.ps1).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0atualizar.ps1"
echo.
pause
