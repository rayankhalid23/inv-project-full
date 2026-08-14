@echo off
title Bellagio Inventory System - Production Server
echo ===============================================
echo    Bellagio Inventory System  (Production)
echo ===============================================
echo.
:: تفعيل البيئة الوهمية
call venv\Scripts\activate

:: وضع الإنتاج: عدة عمليات (workers) لاستغلال كل أنوية المعالج.
:: main.py يحسب العدد تلقائياً = نصف عدد الأنوية (حد أدنى 1، أقصى 8)
:: ويضبط عدد الخيوط وسعة اتصالات قاعدة البيانات بما يتوافق معه.
::
:: لتغيير العدد يدوياً قبل التشغيل:
::     set BELLAGIO_WORKERS=6
:: ولتشغيل وضع التطوير بإعادة التحميل التلقائي بدلاً من ذلك:
::     set BELLAGIO_RELOAD=1
::
:: تنبيه: كل worker يفتح مجموعة اتصالات مستقلة بقاعدة البيانات.
:: الإجمالي = العدد × 45، ويجب أن يبقى أقل من max_connections في MySQL (300).

echo Server will be accessible on your network!
echo Open on phone: http://YOUR_PC_IP:8000
echo.
python main.py
pause
