from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import os
import sys

# رابط قاعدة البيانات MySQL
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:root123@localhost/inventory_db"

# ---------------------------------------------------------------------
# سعة الاتصالات لكل عملية (worker)
# ---------------------------------------------------------------------
# مهم عند تشغيل أكثر من worker: كل عملية تفتح Pool مستقلاً خاصاً بها،
# فالإجمالي = عدد العمليات × (POOL_SIZE + MAX_OVERFLOW)، ويجب أن يبقى
# أقل من max_connections في MySQL وإلا رُفضت الاتصالات الزائدة.
#
# الإعداد الحالي: 4 عمليات × 45 = 180 اتصالاً، وMySQL مضبوط على 300.
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "15"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "30"))

# السعة القصوى لعملية واحدة — تُستخدم أيضاً لضبط عدد خيوط التنفيذ في main.py
DB_TOTAL_PER_WORKER = DB_POOL_SIZE + DB_MAX_OVERFLOW

try:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        # --- إعدادات Connection Pool لمنع التعليق عند كثرة الطلبات ---
        # يجب أن تتساوى السعة الكلية (pool_size + max_overflow) مع عدد خيوط
        # الـ thread pool في main.py، وإلا تزاحمت الخيوط على اتصالات أقل منها
        # فتنتهي مهلتها بخطأ QueuePool limit reached تحت الضغط.
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_timeout=10,        # ثواني الانتظار قبل رفع خطأ بدلاً من التجميد
        pool_recycle=1800,      # إعادة تأهيل الاتصالات كل 30 دقيقة لمنع انقطاع MySQL
        pool_pre_ping=True,     # التحقق من حالة الاتصال قبل الاستخدام
        # --- إعدادات الأداء ---
        echo=False,             # إيقاف طباعة SQL في الإنتاج لتوفير الموارد
        connect_args={
            "connect_timeout": 10,      # timeout لعملية الاتصال نفسها
            "read_timeout": 30,         # timeout لقراءة البيانات
            "write_timeout": 30,        # timeout لكتابة البيانات
        }
    )
except Exception as e:
    print(f"CRITICAL ERROR: Failed to connect to database: {e}")
    sys.exit(1)

# إعداد مصنع الجلسات (Sessions)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    تهيئة قاعدة البيانات وإنشاء الجداول بناءً على الموديلات المعرفة في النظام.
    الاستيراد هنا (وليس أعلى الملف) مقصود: يضمن تسجيل كل الموديلات على
    app.models.base.Base قبل create_all، ويتجنب أي استيراد دائري مع app.models.
    """
    import app.models  # noqa: F401 — يُسجّل كل الموديلات على الـ Base
    from app.models.base import Base

    try:
        Base.metadata.create_all(bind=engine)
    except SQLAlchemyError as e:
        print(f"DATABASE ERROR: Table creation failed: {e}")

def get_db():
    """
    Dependency: دالة لتوفير جلسة قاعدة بيانات لكل طلب (Request).
    تضمن إغلاق الجلسة تلقائياً بعد انتهاء العملية لتوفير موارد الخادم.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        print(f"DATABASE SESSION ERROR: {e}")
        raise
    finally:
        db.close()