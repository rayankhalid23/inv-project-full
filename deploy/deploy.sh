#!/bin/bash
# ======================================================
# deploy.sh — نشر/تحديث بيلادجيو على السيرفر
# نفّذه من مجلد المشروع: bash deploy/deploy.sh
# ======================================================
set -e

APP_DIR="/opt/bellagio"
VENV="$APP_DIR/venv"

echo "🚀 بدء نشر بيلادجيو..."

# 1. بناء الواجهة الأمامية
echo "📦 بناء الواجهة الأمامية..."
cd "$APP_DIR/frontend"
npm install --production=false
npm run build
echo "✅ بناء الواجهة مكتمل"

# 2. إنشاء/تحديث البيئة الافتراضية
cd "$APP_DIR"
if [ ! -d "$VENV" ]; then
    python3 -m venv "$VENV"
    echo "✅ تم إنشاء البيئة الافتراضية"
fi

"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install -r requirements.txt -q
echo "✅ مكتبات Python محدّثة"

# 3. ترحيل قاعدة البيانات
# على قاعدة موجودة: تُطبَّق الهجرات المعلّقة فقط.
# على قاعدة جديدة تماماً: لا يوجد alembic_version بعد، فيتكفّل init_db عند
# أول إقلاع بإنشاء الجداول ثم ختمها على الـ head — لذا تخطّي الفشل هنا آمن.
echo "🗄️  ترحيل قاعدة البيانات..."
if "$VENV/bin/python" -c "
import sys
from sqlalchemy import create_engine, inspect
sys.path.insert(0, '.')
from app.core.database import SQLALCHEMY_DATABASE_URL
insp = inspect(create_engine(SQLALCHEMY_DATABASE_URL))
sys.exit(0 if 'alembic_version' in insp.get_table_names() else 1)
"; then
    "$VENV/bin/alembic" upgrade head
    echo "✅ الهجرات مطبّقة"
else
    echo "ℹ️  قاعدة بيانات جديدة — سيتولى init_db إنشاءها وختمها عند أول إقلاع"
fi

# 4. مجلدات الوسائط (تُنشأ تلقائياً عند أول تشغيل لكن نضمنها هنا)
mkdir -p static/uploads/products static/uploads/colors static/uploads/qrcodes static/temp
chown -R bellagio:bellagio static/ 2>/dev/null || true

# 5. إعادة تشغيل الخدمة
echo "🔄 إعادة تشغيل الخدمة..."
systemctl restart bellagio
sleep 3

# 6. التحقق
if systemctl is-active --quiet bellagio; then
    echo "✅ الخدمة تعمل بنجاح!"
    echo ""
    echo "📊 حالة الخدمة:"
    systemctl status bellagio --no-pager -l | head -20
else
    echo "❌ فشل تشغيل الخدمة! السجلات:"
    journalctl -u bellagio -n 30 --no-pager
    exit 1
fi

echo ""
echo "✅ النشر مكتمل!"
