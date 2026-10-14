@echo off
chcp 65001 >nul
title Map TRS - fabrication de l'exe
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Installe d'abord Node.js LTS depuis https://nodejs.org puis relance ce fichier.
  start https://nodejs.org/fr
  pause
  exit /b 1
)
if not exist node_modules call npm install
call npm run dist:win
if errorlevel 1 ( echo  La fabrication a echoue. & pause & exit /b 1 )
echo.
echo  Termine ! Les .exe sont dans le dossier "release" :
echo   - "Map TRS Setup ...exe"  = installeur (raccourci sur le bureau)
echo   - "MapTRS-portable-...exe" = version portable, sans installation
start "" "%~dp0release"
pause
