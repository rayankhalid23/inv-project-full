"""
توحيد مسارات الوسائط في قاعدة البيانات (يُنفَّذ مرة واحدة).

يحوّل كل الأشكال القديمة إلى الشكل القانوني:
    /static/uploads/<category>/<filename>

الاستخدام:
    python scripts/normalize_media_paths.py            # معاينة فقط (لا يغيّر شيئاً)
    python scripts/normalize_media_paths.py --apply    # تنفيذ التعديل فعلياً

آمن للتشغيل أكثر من مرة: الصفوف الصحيحة تُترك كما هي.
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import SessionLocal                      # noqa: E402
from app.core.media import normalize_media_path, media_exists   # noqa: E402
from app.models.inventory import Product, ProductColor, ProductVariant  # noqa: E402

TARGETS = [
    ("products.main_image", Product, "main_image"),
    ("colors.color_image", ProductColor, "color_image"),
    ("variants.qr_code", ProductVariant, "qr_code"),
]

# امتدادات الملفات التي نعتبرها وسائط
MEDIA_EXTS = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg")


def looks_like_media_path(value: str) -> bool:
    """
    هل القيمة مسار ملف فعلاً؟

    ضروري لعمود qr_code تحديداً: فهو يحتوي نوعين مختلفين من القيم —
    مسارات صور الـ QR (/static/uploads/qrcodes/qr_30_x.png) وأكواد نصية
    خام مثل "QRV-F7D416...". تحويل الأكواد النصية إلى مسارات يُفسدها
    ويكسر المسح الضوئي، لذا نتخطاها.
    """
    v = str(value).strip().lower().replace("\\", "/")
    if not v:
        return False
    return v.endswith(MEDIA_EXTS) or "/" in v


def main(apply_changes: bool):
    db = SessionLocal()
    total_changed = 0
    total_missing = 0

    try:
        for label, model, field in TARGETS:
            rows = db.query(model).all()
            changed, missing, already_ok, skipped = 0, 0, 0, 0

            for row in rows:
                current = getattr(row, field)
                if not current:
                    continue

                # قيم ليست مسارات (مثل أكواد QR النصية) تُترك كما هي
                if not looks_like_media_path(current):
                    skipped += 1
                    continue

                canonical = normalize_media_path(current)

                if canonical != current:
                    changed += 1
                    if changed <= 3:
                        print(f"    {current}")
                        print(f"      -> {canonical}")
                    if apply_changes:
                        setattr(row, field, canonical)
                else:
                    already_ok += 1

                # نُبلّغ عن الملفات المفقودة دون حذف أي بيانات
                if not media_exists(canonical):
                    missing += 1

            print(f"-- {label}: سليم مسبقاً {already_ok} | يحتاج توحيداً {changed} "
                  f"| ليست مسارات (تُركت) {skipped} | ملفات مفقودة {missing}")
            total_changed += changed
            total_missing += missing

        if apply_changes:
            db.commit()
            print(f"\nتم التنفيذ: وُحّد {total_changed} مساراً.")
        else:
            db.rollback()
            print(f"\nمعاينة فقط: {total_changed} مساراً بحاجة للتوحيد. أعد التشغيل مع --apply للتنفيذ.")

        if total_missing:
            print(f"تنبيه: {total_missing} سجلاً يشير إلى ملف غير موجود على القرص "
                  f"(لم يُحذف شيء — يحتاج رفع الصورة من جديد).")
    finally:
        db.close()


if __name__ == "__main__":
    main(apply_changes="--apply" in sys.argv)
