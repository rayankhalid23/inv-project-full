<<<<<<< HEAD
import asyncio
import sys
import os

# 1. حل مشكلة Windows Subprocess لـ Playwright في القمة
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# تجميع كل الـ Routers في استدعاء واحد ومنظم
from app.routers import auth, users, catalogs, sizes, colors, products, variants, order_router

# استيرادات قاعدة البيانات والنماذج (محفوظة كما طلبت)
from app.core.database import engine, Base
from app.models import inventory, order


# 2. ضمان وجود المجلدات (بطريقة أكثر احترافية وآمنة)
RESOURCES = ["static", "static/products", "static/temp"]
for folder in RESOURCES:
    os.makedirs(folder, exist_ok=True)


# 3. تهيئة التطبيق
app = FastAPI(
    title="Bellagio Inventory System",
    version="1.1.0"
)

# 4. إعدادات الـ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
=======
import sys, os, logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager

# استيراد الرواتر
from app.routers import auth, users, catalogs, sizes, colors, products, variants
from app.core.database import init_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # كود يعمل عند تشغيل السيرفر
    logging.info("Starting Bellagio System...")
    init_db() # إنشاء الجداول إذا لم تكن موجودة
    os.makedirs("static/uploads/colors", exist_ok=True)
    os.makedirs("static/uploads/products", exist_ok=True)
    yield
    # كود يعمل عند إغلاق السيرفر
    logging.info("Shutting down...")

app = FastAPI(
    title="Bellagio Inventory",
    lifespan=lifespan
)

# دعم الاتصال من المتصفحات (CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
    allow_methods=["*"],
    allow_headers=["*"],
)

<<<<<<< HEAD

# 5. معالجات الأخطاء المخصصة (Exception Handlers)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # نأخذ أول خطأ حدث فقط
    errors = exc.errors()
    if errors:
        full_message = errors[0].get("msg", "خطأ في البيانات المرسلة")
        
        # تنظيف الرسالة من الكلمات التلقائية التي يضيفها بايثون
        clean_message = full_message.replace("Value error, ", "").replace("Value error,  ", "")
        
        # إرجاع رد بسيط يحتوي على النص فقط
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": clean_message}
        )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"detail": "خطأ غير معروف في التحقق من البيانات"}
    )


# 6. ربط الملفات الثابتة (Static Files)
app.mount("/static", StaticFiles(directory="static"), name="static")


# 7. تضمين المسارات (Routers)
=======
# ربط المجلدات الثابتة (الصور)
app.mount("/static", StaticFiles(directory="static"), name="static")

# تسجيل المسارات
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(catalogs.router)
app.include_router(sizes.router)
app.include_router(colors.router)
app.include_router(products.router)
app.include_router(variants.router)
<<<<<<< HEAD
app.include_router(order_router.router)


# 8. المسار الجذري (Root API)
@app.get("/", tags=["Root"])
def home():
    return {"status": "Running", "loop": "Proactor" if sys.platform == 'win32' else "Standard"}


# 9. نقطة تشغيل السيرفر
if __name__ == "__main__":
    import uvicorn
    # هـام: إجبار uvicorn على استخدام asyncio ليتوافق مع الـ Policy أعلاه
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, loop="asyncio")
=======

@app.get("/", tags=["Health"])
def status():
    return {"status": "online", "system": "Bellagio V1.1"}
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
