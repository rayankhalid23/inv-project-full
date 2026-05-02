from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError
import sys

# رابط قاعدة البيانات MySQL
SQLALCHEMY_DATABASE_URL = "mysql+pymysql://root:root123@localhost/inventory_db"

try:
    # إنشاء محرك قاعدة البيانات مع خاصية pool_pre_ping للتأكد من سلامة الاتصال
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        pool_pre_ping=True
    )
except Exception as e:
    # خطأ حرج: في حال فشل الاتصال الأولي بقاعدة البيانات
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
        # استيراد الموديلات هنا لتجنب التكرار الحلقي (Circular Import)
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
        # تسجيل أي خطأ يحدث أثناء عمليات قاعدة البيانات
        print(f"DATABASE SESSION ERROR: {e}")
        raise
    finally:
        db.close()