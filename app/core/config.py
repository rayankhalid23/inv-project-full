# app/core/config.py

import os

# المفتاح السري لتشفير التوكن (يفضل تغييره لاحقاً في بيئة الإنتاج)
SECRET_KEY = os.getenv("SECRET_KEY", "your-super-secret-key-inventory-2026")

# خوارزمية التشفير
ALGORITHM = "HS256"

# مدة صلاحية الجلسة (مثلاً 7 أيام)
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7