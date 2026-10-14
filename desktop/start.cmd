@echo off
set ELECTRON_RUN_AS_NODE=
cd /d "%~dp0"
if exist "dist\win-unpacked\Whale Widget.exe" (
  start "" "dist\win-unpacked\Whale Widget.exe"
) else if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" .
) else (
  echo Please run npm ci in this directory first.
  pause
)
