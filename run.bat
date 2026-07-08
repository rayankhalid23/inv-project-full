@echo off
title Bellagio Inventory System Launcher
echo ==============================================
echo     Starting Bellagio Inventory System...
echo ==============================================
echo.

:: Check if virtual environment exists
if exist venv\Scripts\activate.bat goto :with_env
if exist .venv\Scripts\activate.bat goto :with_dot_env
goto :no_env

:with_env
call venv\Scripts\activate.bat
goto :run_app

:with_dot_env
call .venv\Scripts\activate.bat
goto :run_app

:no_env
echo [!] Virtual environment not found. Trying global python...
goto :run_app

:run_app
python run-project.py

pause