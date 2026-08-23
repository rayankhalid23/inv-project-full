import os
import sys
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool
from alembic import context

# إضافة مسار المشروع الجذر حتى يمكن استيراد app.models
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# قراءة ملف alembic.ini
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# استيراد Base بعد إضافة المسار
import app.models  # noqa: F401 — تسجيل كل الموديلات
from app.models.base import Base

target_metadata = Base.metadata


def get_database_url() -> str:
    """
    قراءة DATABASE_URL من .env يدوياً وتحويله لمشغّل pymysql التزامني.
    لا نستخدم load_dotenv() لتفادي الكتابة فوق متغيرات البيئة الموجودة.
    """
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    url = None
    if os.path.exists(env_path):
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip()
                    break

    if not url:
        url = os.getenv("DATABASE_URL", "mysql+pymysql://root:root123@localhost/inventory_db")

    # تطبيع المشغّل إلى pymysql التزامني
    if url.startswith("mysql+asyncmy://"):
        url = url.replace("mysql+asyncmy://", "mysql+pymysql://", 1)
    elif url.startswith("mysql://") and not url.startswith("mysql+"):
        url = url.replace("mysql://", "mysql+pymysql://", 1)
    return url


def run_migrations_offline() -> None:
    url = get_database_url()
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    cfg = config.get_section(config.config_ini_section, {})
    cfg["sqlalchemy.url"] = get_database_url()

    connectable = engine_from_config(
        cfg,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
