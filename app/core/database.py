from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# رابط قاعدة البيانات MySQL مع تطبيع المشغّل للعمل التزامني المستقر
raw_url = os.getenv("DATABASE_URL", "mysql+pymysql://root:root123@localhost/inventory_db")
if raw_url.startswith("mysql+asyncmy://"):
    SQLALCHEMY_DATABASE_URL = raw_url.replace("mysql+asyncmy://", "mysql+pymysql://", 1)
elif raw_url.startswith("mysql://") and not raw_url.startswith("mysql+"):
    SQLALCHEMY_DATABASE_URL = raw_url.replace("mysql://", "mysql+pymysql://", 1)
else:
    SQLALCHEMY_DATABASE_URL = raw_url

# ---------------------------------------------------------------------
# سعة الاتصالات لكل عملية (worker)
# ---------------------------------------------------------------------
DB_POOL_SIZE = int(os.getenv("DB_POOL_SIZE", "15"))
DB_MAX_OVERFLOW = int(os.getenv("DB_MAX_OVERFLOW", "30"))

# السعة القصوى لعملية واحدة — تُستخدم أيضاً لضبط عدد خيوط التنفيذ في main.py
DB_TOTAL_PER_WORKER = DB_POOL_SIZE + DB_MAX_OVERFLOW

try:
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        # --- إعدادات Connection Pool لمنع التعليق عند كثرة الطلبات ---
        pool_size=DB_POOL_SIZE,
        max_overflow=DB_MAX_OVERFLOW,
        pool_timeout=10,        # ثواني الانتظار قبل رفع خطأ بدلاً من التجميد
        pool_recycle=1800,      # إعادة تأهيل الاتصالات كل 30 دقيقة لمنع انقطاع MySQL
        pool_pre_ping=True,     # التحقق من حالة الاتصال قبل الاستخدام
        # --- إعدادات الأداء ---
        echo=False,             # إيقاف طباعة SQL في الإنتاج لتوفير الموارد
        connect_args={
            "connect_timeout": 10,
            "charset": "utf8mb4",
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
        
        # التأكد من وجود أعمدة الشحن الجديدة في جدول orders تلقائياً
        with engine.connect() as conn:
            columns_to_add = [
                ("shipping_provider", "VARCHAR(50) DEFAULT 'custom' NULL"),
                ("tracking_number", "VARCHAR(100) NULL"),
                ("shipment_id", "VARCHAR(100) NULL")
            ]
            for col_name, col_type in columns_to_add:
                try:
                    conn.execute(text(f"ALTER TABLE orders ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
                except Exception:
                    # العمود موجود مسبقاً، تجاهل
                    pass

        # بذر الرتب والمستخدم الافتراضي عند أول تشغيل للسيرفر
        from app.models.role import Role
        from app.models.user import User
        from app.core.security import get_password_hash

        with SessionLocal() as db:
            existing_roles = {r.name: r for r in db.query(Role).all()}
            for role_name in ["Admin", "Manager", "Employee"]:
                if role_name not in existing_roles:
                    new_role = Role(name=role_name)
                    db.add(new_role)
                    db.flush()
                    existing_roles[role_name] = new_role
            
            # إذا كان جدول المستخدمين فارغاً تماماً (أول رفع للسيرفر)، إنشاء حساب مدير افتراضي
            if db.query(User).count() == 0 and "Admin" in existing_roles:
                admin_role = existing_roles["Admin"]
                default_admin = User(
                    name="المدير العام",
                    phone="0912345678",
                    password_hash=get_password_hash("admin123"),
                    role_id=admin_role.id,
                    is_active=True
                )
                db.add(default_admin)
            
            db.commit()
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