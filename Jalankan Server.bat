@echo off
chcp 65001 >nul
title LeaDi-PDS Server
cd /d "%~dp0"
echo =====================================================
echo   LeaDi-PDS - Lesson Study Digital Platform (Plan-Do-See)
echo =====================================================
echo Menjalankan server... tekan Ctrl+C untuk berhenti.
echo Buka di komputer: http://localhost:8095
echo.
node server.js
pause
