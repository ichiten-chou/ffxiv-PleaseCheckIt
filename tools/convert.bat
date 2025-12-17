@echo off
chcp 65001 >nul
echo ========================================
echo PvpStats DB to JSON Converter
echo ========================================
echo.

set "DB_PATH=%~1"

if "%DB_PATH%"=="" (
    echo Using default database path...
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0convert-db.ps1"
) else (
    echo Detected dragged file: "%DB_PATH%"
    powershell.exe -ExecutionPolicy Bypass -File "%~dp0convert-db.ps1" -InputPath "%DB_PATH%"
)

echo.
echo ----------------------------------------
echo Conversion complete! Press any key to exit...
pause >nul
