import sys
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# 1. حل مشكلة Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

# 2. الاستيرادات
from app.core.database import init_db
from app.routers import api_router

# 3. إعداد الـ Lifespan (إدارة بداية ونهاية التطبيق)
@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("🚀 Starting Bellagio System...")
    # إنشاء مجلدات الرفع تلقائياً
    UPLOAD_DIRS = ["static/uploads/colors", "static/uploads/products", "static/uploads/qrcodes", "static/temp"]
    for folder in UPLOAD_DIRS:
        os.makedirs(folder, exist_ok=True)
    
    # تهيئة قاعدة البيانات
    init_db() 
    yield
    logging.info("🛑 Shutting down Bellagio System...")

# 4. إنشاء التطبيق (يجب أن يكون قبل الـ Middleware والـ Routers)
app = FastAPI(title="Bellagio Inventory System", version="1.1.0", lifespan=lifespan)

# 5. إعدادات الـ CORS (مرة واحدة فقط وبشكل صحيح)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # السماح لجميع الأجهزة بالوصول (هواتف، أجهزة لوحية، إلخ)
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 6. معالج أخطاء المدخلات (Validation)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        full_message = errors[0].get("msg", "خطأ في البيانات")
        clean_message = full_message.replace("Value error, ", "")
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": clean_message})
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": "خطأ غير معروف"})

# 7. الملفات الثابتة
app.mount("/static", StaticFiles(directory="static"), name="static")

# 8. تسجيل كل المسارات بضربة واحدة
app.include_router(api_router)

@app.get("/", tags=["Health"])
def status_check():
    return {
        "status": "online", 
        "system": "Bellagio V1.1", 
        "platform": sys.platform,
        "message": "Welcome to Bellagio Backend API"
    }

if __name__ == "__main__":
    import uvicorn
    # host=0.0.0.0 يجعل السيرفر يستمع على جميع واجهات الشبكة (Wi-Fi, LAN)
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)