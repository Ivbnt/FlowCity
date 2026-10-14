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
rem Le lanceur installe seulement si besoin, ne reconstruit que si le code a change, puis ouvre l'appli.
node scripts\launch.cjs
if errorlevel 1 (
  echo.
  echo  Map TRS n'a pas pu demarrer : voir le message au-dessus.
  pause
)
