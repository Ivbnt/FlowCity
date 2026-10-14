@echo off
chcp 65001 >nul
title FlowCity - fabrication de l'exe
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo  Installe d'abord Node.js LTS depuis https://nodejs.org puis relance ce fichier.
  start https://nodejs.org/fr
  pause
  exit /b 1
)
if not exist "node_modules\.flowcity-installe" (
  call npm ci --no-audit --no-fund --loglevel=error || call npm install --no-audit --no-fund --loglevel=error
  if errorlevel 1 ( echo  L'installation a echoue. & pause & exit /b 1 )
)
echo  Fabrication de l'exe : l'outil de fabrication se telecharge la premiere fois (quelques minutes).
call npm run dist:win
if errorlevel 1 ( echo  La fabrication a echoue. & pause & exit /b 1 )
echo.
echo  Termine ! Les .exe sont dans le dossier "release" :
echo   - "FlowCity Setup ...exe"     = installeur (raccourci sur le bureau)
echo   - "FlowCity-portable-...exe"  = version portable, sans installation
start "" "%~dp0release"
pause
