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

rem Installation : refaite si elle n'est pas allee au bout (fichier temoin absent)
if exist "node_modules\.map-trs-installe" goto electron
echo.
echo  Premiere utilisation : installation des composants (environ 150 Mo a telecharger).
echo  Compte 2 a 5 minutes selon la connexion. Les lignes qui defilent = ca avance.
echo.
call npm install --no-audit --no-fund --loglevel=http
if errorlevel 1 goto retry
goto installed
:retry
echo.
echo  Le telechargement a echoue, nouvel essai avec un serveur miroir...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npm install --no-audit --no-fund --loglevel=http
if errorlevel 1 (
  echo.
  echo  L'installation a echoue. Verifie ta connexion internet, ferme l'antivirus
  echo  quelques minutes si besoin, puis relance ce fichier.
  pause
  exit /b 1
)
:installed
echo ok> "node_modules\.map-trs-installe"

:electron
rem Electron (le moteur de l'appli) : on verifie qu'il est bien telecharge
if exist "node_modules\electron\dist\electron.exe" goto start
echo.
echo  Telechargement du moteur Electron (environ 100 Mo)...
call node node_modules\electron\install.js
if exist "node_modules\electron\dist\electron.exe" goto start
echo  Nouvel essai avec un serveur miroir...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call node node_modules\electron\install.js
if not exist "node_modules\electron\dist\electron.exe" (
  echo.
  echo  Impossible de telecharger Electron. Verifie ta connexion puis relance ce fichier.
  pause
  exit /b 1
)

:start
echo.
echo  Lancement de Map TRS...
call npm start
if errorlevel 1 (
  echo.
  echo  Map TRS s'est arrete avec une erreur, voir le message au-dessus.
  pause
)
