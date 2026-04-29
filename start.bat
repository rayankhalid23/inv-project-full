@echo off
title Inventory System Server
echo Starting API Server...
:: تفعيل البيئة الوهمية إذا كنت تستخدمها
call venv\Scripts\activate
:: تشغيل السيرفر
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
pause