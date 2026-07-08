@echo off
title Inventory System Server
echo ===============================
echo    Bellagio Inventory System
echo ===============================
echo.
echo Starting API Server...
:: تفعيل البيئة الوهمية
call venv\Scripts\activate
:: تشغيل السيرفر على جميع الواجهات للسماح للهواتف بالوصول
echo.
echo Server will be accessible on your network!
echo Open on phone: http://YOUR_PC_IP:8000
echo.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
pause