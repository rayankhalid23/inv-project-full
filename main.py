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

# 2. استيراد المجمع الجديد وقاعدة البيانات
 # سطر واحد فقط يستورد كل الرواتر
from app.core.database import init_db
from app.routers import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting Bellagio System...")
    UPLOAD_DIRS = ["static/uploads/colors", "static/uploads/products", "static/uploads/qrcodes", "static/temp"]
    for folder in UPLOAD_DIRS:
        os.makedirs(folder, exist_ok=True)
    init_db() 
    yield
    logging.info("Shutting down Bellagio System...")

app = FastAPI(title="Bellagio Inventory System", version="1.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# معالج الأخطاء (نفس كودك الرائع)
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    errors = exc.errors()
    if errors:
        full_message = errors[0].get("msg", "خطأ في البيانات")
        clean_message = full_message.replace("Value error, ", "")
        return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": clean_message})
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content={"detail": "خطأ غير معروف"})

app.mount("/static", StaticFiles(directory="static"), name="static")

# 8. تسجيل كل المسارات بضربة واحدة فقط!
app.include_router(api_router) # لم نعد بحاجة لتكرار 10 أسطر هنا

@app.get("/", tags=["Health"])
def status_check():
    return {"status": "online", "system": "Bellagio V1.1", "platform": sys.platform}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)