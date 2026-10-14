@echo off
chcp 65001 >nul
title Map TRS
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js n'est pas installe.
  echo  Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
  echo.
  start https://nodejs.org/fr
  pause
  exit /b 1
)
if not exist node_modules (
  echo  Premiere utilisation : installation des composants, 1 a 3 minutes...
  call npm install
  if errorlevel 1 ( echo  L'installation a echoue. & pause & exit /b 1 )
)
echo  Lancement de Map TRS...
call npm start
