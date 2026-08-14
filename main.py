import sys
import os
import asyncio
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# 1. حل مشكلة Windows
if sys.platform == 'win32':
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    # فرض ترميز UTF-8 على المخرجات.
    # كونسول ويندوز العربي يستخدم cp1256 الذي لا يدعم الرموز التعبيرية،
    # فكان أي print يحتوي إيموجي يرمي UnicodeEncodeError ويُسقط الطلب بـ 500.
    # errors='replace' يضمن ألا يُسقط أي سطر طباعة طلباً مهما كان محتواه.
    for _stream in (sys.stdout, sys.stderr):
        try:
            _stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, ValueError):
            pass

# 2. الاستيرادات
from app.core.database import init_db
from app.routers import api_router

# 3. إعداد الـ Lifespan (إدارة بداية ونهاية التطبيق)
# عدد الخيوط المتاحة لتنفيذ معالجات المسارات المتزامنة (def).
# مشتق تلقائياً من سعة اتصالات قاعدة البيانات حتى يبقيا متطابقين دائماً:
# لا فائدة من خيوط أكثر من الاتصالات المتاحة، بل تسبب انتظاراً ثم مهلة.
from app.core.database import DB_TOTAL_PER_WORKER

SYNC_WORKER_THREADS = int(os.getenv("SYNC_WORKER_THREADS", str(DB_TOTAL_PER_WORKER)))


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.info("Starting Bellagio System...")

    # توسيع الـ thread pool: الافتراضي 40 خيطاً فقط، وهو سقف عدد الطلبات
    # المتزامنة التي يمكن للخادم معالجتها فعلياً لأن كل معالجاتنا متزامنة.
    try:
        import anyio.to_thread
        anyio.to_thread.current_default_thread_limiter().total_tokens = SYNC_WORKER_THREADS
    except Exception as e:
        logging.warning(f"Could not resize thread pool: {e}")
    # إنشاء مجلدات الرفع تلقائياً
    # مجلدات الوسائط تُنشأ من المصدر الموحّد app/core/media.py
    from app.core.media import ensure_media_dirs
    ensure_media_dirs()
    os.makedirs("static/temp", exist_ok=True)
    
    # تهيئة قاعدة البيانات
    init_db() 
    yield
    logging.info("Shutting down Bellagio System...")

# 4. إنشاء التطبيق (يجب أن يكون قبل الـ Middleware والـ Routers)
app = FastAPI(title="Bellagio Inventory System", version="1.1.0", lifespan=lifespan)

# 5. ضغط الاستجابات تلقائياً (GZip) — يُقلل حجم JSON بـ 60-80% على النت البطيء
app.add_middleware(GZipMiddleware, minimum_size=500)

# 6. إعدادات الـ CORS الكاملة لكل الأجهزة
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

# 7. الملفات الثابتة وسيرفر الـ PWA
# أسماء الملفات المرفوعة مبنية على UUID فلا تتغير محتوياتها أبداً بعد إنشائها،
# لذا نسمح بتخزينها طويلاً في المتصفح: تحميل أسرع وعمل كامل بدون إنترنت
# بدل طلب تحقّق عبر الشبكة مع كل صورة منتج أو رمز QR.
class ImmutableStaticFiles(StaticFiles):
    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


app.mount("/static", ImmutableStaticFiles(directory="static"), name="static")

# 8. تسجيل مسارات الـ API
app.include_router(api_router)

# 9. تقديم ملفات الـ PWA والواجهة المبنية تلقائياً عند التوظيف
if os.path.exists("frontend/dist"):
    app.mount("/assets", StaticFiles(directory="frontend/dist/assets"), name="frontend-assets")
    
    @app.get("/sw.js", include_in_schema=False)
    def serve_sw():
        from fastapi.responses import FileResponse
        return FileResponse("frontend/dist/sw.js", media_type="application/javascript")

    @app.get("/manifest.json", include_in_schema=False)
    def serve_manifest():
        from fastapi.responses import FileResponse
        return FileResponse("frontend/dist/manifest.json", media_type="application/json")

    @app.get("/favicon.svg", include_in_schema=False)
    def serve_favicon():
        from fastapi.responses import FileResponse
        return FileResponse("frontend/dist/favicon.svg", media_type="image/svg+xml")

# HEAD مدعوم صراحةً: أدوات المراقبة وفاحصات الروابط ترسل HEAD،
# وFastAPI لا يضيفه تلقائياً مع @app.get فكان يردّ 405.
@app.api_route("/api/health", methods=["GET", "HEAD"], tags=["Health"])
def status_check():
    return {
        "status": "online",
        "system": "Bellagio V1.1 PWA Engine",
        "platform": sys.platform,
        "message": "Welcome to Bellagio Backend API"
    }


# 10. SPA fallback — يجب أن يبقى آخر مسار مُسجَّل على الإطلاق.
# أي مسار واجهة (/, /sales, /products ...) يُقدَّم عبر index.html ليتولى
# React Router التوجيه. بدون هذا كان فتح التطبيق من عنوان الخادم يعطي 404
# على كل المسارات، فلا يمكن تثبيته أو تشغيله على أي جهاز.
if os.path.exists("frontend/dist"):

    # GET و HEAD معاً: بدون HEAD كانت كل الأيقونات وmanifest.json وصفحات
    # التطبيق ترد 405 على طلبات HEAD التي تستخدمها أدوات فحص تثبيت الـ PWA.
    @app.api_route("/{full_path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def serve_spa(full_path: str):
        from fastapi.responses import FileResponse

        # لا نبتلع مسارات الـ API — نُعيد 404 صريحاً بدل صفحة HTML
        if full_path.startswith(("api/", "static/", "assets/")):
            return JSONResponse(status_code=404, content={"detail": "Not Found"})

        candidate = os.path.join("frontend/dist", full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)

        return FileResponse("frontend/dist/index.html", media_type="text/html")


def recommended_workers() -> int:
    """
    عدد العمليات المقترح: نصف عدد الأنوية تقريباً (بحد أدنى 1 وأقصى 8).
    لا نأخذ كل الأنوية لأن MySQL يعمل على نفس الجهاز ويحتاج نصيبه من المعالج.
    يمكن تجاوز القيمة عبر متغير البيئة BELLAGIO_WORKERS.
    """
    env = os.getenv("BELLAGIO_WORKERS")
    if env:
        try:
            return max(1, int(env))
        except ValueError:
            pass
    cores = os.cpu_count() or 2
    return max(1, min(8, cores // 2))


if __name__ == "__main__":
    import uvicorn

    workers = recommended_workers()
    reload_mode = os.getenv("BELLAGIO_RELOAD", "0") == "1"

    # ملاحظة مهمة: reload و workers لا يجتمعان في uvicorn.
    # وضع التطوير (reload) يعمل بعملية واحدة، والإنتاج يعمل بعدة عمليات.
    if reload_mode:
        print("[MODE] development — عملية واحدة مع إعادة التحميل التلقائي", flush=True)
        uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
    else:
        total_conns = workers * DB_TOTAL_PER_WORKER
        print(f"[MODE] production — {workers} عمليات × {SYNC_WORKER_THREADS} خيط", flush=True)
        print(f"[DB]   إجمالي اتصالات قاعدة البيانات: {total_conns} "
              f"(تأكد أن max_connections في MySQL أكبر منها)", flush=True)
        # host=0.0.0.0 يجعل السيرفر يستمع على جميع واجهات الشبكة (Wi-Fi, LAN)
        uvicorn.run("main:app", host="0.0.0.0", port=8000, workers=workers)