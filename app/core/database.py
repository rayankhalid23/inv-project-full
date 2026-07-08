from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import sys

# رابط قاعدة البيانات MySQL
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:root123@localhost/inventory_db"

try:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        # --- إعدادات Connection Pool لمنع التعليق عند كثرة الطلبات ---
        pool_size=10,           # عدد الاتصالات الدائمة في الـ Pool
        max_overflow=20,        # عدد اتصالات إضافية مؤقتة عند الضغط الشديد
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

# تعريف القاعدة الأساسية للموديلات
Base = declarative_base()

def init_db():
    """
    تهيئة قاعدة البيانات وإنشاء الجداول بناءً على الموديلات المعرفة في النظام.
    """
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