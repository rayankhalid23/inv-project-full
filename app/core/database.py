from sqlalchemy import create_engine
<<<<<<< HEAD
from sqlalchemy.orm import sessionmaker, declarative_base

# رابط قاعدة البيانات (تأكد من صحته)
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:root123@localhost/inventory_db"

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# هنا السر: نعرف Base هنا ونصدرها للجميع
Base = declarative_base()

# دالة الحصول على الجلسة
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
=======
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import sys

# استيراد Base وكل الموديلات من ملف التجميع لضمان إنشاء الجداول كاملة
from app.models import Base

DATABASE_URL = "mysql+pymysql://root:root123@localhost/inventory_db"

try:
    # إنشاء محرك قاعدة البيانات مع خاصية pool_pre_ping للتأكد من سلامة الاتصال قبل الاستخدام
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True
    )
except Exception as e:
    print(f"CRITICAL ERROR: Failed to connect to database: {e}")
    sys.exit(1)

# إعداد مصنع الجلسات
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """
    تهيئة قاعدة البيانات وإنشاء الجداول بناءً على الموديلات المعرفة.
    تُستخدم عادةً عند تشغيل التطبيق لأول مرة.
    """
    try:
        Base.metadata.create_all(bind=engine)
    except SQLAlchemyError as e:
        print(f"DATABASE ERROR: Table creation failed: {e}")

def get_db():
    """
    Dependency: دالة لتوفير جلسة قاعدة بيانات لكل طلب (Request).
    تضمن إغلاق الجلسة تلقائياً بعد انتهاء العملية.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e:
        # في حال حدوث خطأ أثناء العمليات، يتم طباعة التفاصيل
        print(f"DATABASE SESSION ERROR: {e}")
        raise
    finally:
        # إغلاق الاتصال لضمان عدم استهلاك موارد الخادم
>>>>>>> db10729100131f023fa952060f6a63a4697d62ac
        db.close()