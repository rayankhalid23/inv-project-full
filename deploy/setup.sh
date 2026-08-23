#!/bin/bash
# ======================================================
# setup.sh — إعداد السيرفر لأول مرة (Ubuntu/Debian)
# نفّذه كـ root: sudo bash setup.sh YOUR_DOMAIN
# ======================================================
set -e

DOMAIN="${1:-}"
APP_DIR="/opt/bellagio"
APP_USER="bellagio"

if [ -z "$DOMAIN" ]; then
    echo "❌ الاستخدام: sudo bash setup.sh YOUR_DOMAIN_OR_IP"
    exit 1
fi

echo "🚀 بدء إعداد سيرفر بيلادجيو للنطاق: $DOMAIN"

# 1. تحديث النظام وتثبيت المتطلبات
apt-get update -qq
apt-get install -y python3 python3-pip python3-venv nodejs npm nginx mysql-server certbot python3-certbot-nginx git curl

# 2. إنشاء مستخدم التطبيق
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --shell /bin/bash --home-dir "$APP_DIR" "$APP_USER"
    echo "✅ تم إنشاء مستخدم: $APP_USER"
fi

# 3. إنشاء مجلد التطبيق
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# 4. إعداد MySQL
echo "⚙️  إعداد قاعدة البيانات..."
mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS bellagio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'bellagio_user'@'localhost' IDENTIFIED BY '$(openssl rand -hex 16)';
GRANT ALL PRIVILEGES ON bellagio_db.* TO 'bellagio_user'@'localhost';
FLUSH PRIVILEGES;
EOF
echo "✅ قاعدة البيانات جاهزة. احفظ كلمة المرور وأضفها لملف .env"

# 5. Nginx
cp /tmp/bellagio_nginx.conf /etc/nginx/sites-available/bellagio
sed -i "s/YOUR_DOMAIN_OR_IP/$DOMAIN/g" /etc/nginx/sites-available/bellagio
ln -sf /etc/nginx/sites-available/bellagio /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx مُعدّ"

# 6. SSL عبر Let's Encrypt (يعمل فقط مع دومين حقيقي، لا IP)
if [[ "$DOMAIN" =~ \. ]] && ! [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" --redirect
    echo "✅ SSL مُفعّل"
else
    echo "⚠️  لا يمكن تثبيت SSL على IP مباشر — استخدم دومين أو اضبط SSL يدوياً"
fi

# 7. systemd
cp /tmp/bellagio.service /etc/systemd/system/bellagio.service
systemctl daemon-reload
systemctl enable bellagio
echo "✅ خدمة systemd مُعدّة"

echo ""
echo "========================================"
echo "✅ إعداد السيرفر مكتمل!"
echo "الخطوات التالية:"
echo "1. ارفع ملفات المشروع إلى: $APP_DIR"
echo "2. أنشئ ملف $APP_DIR/.env (استخدم .env.example كنموذج)"
echo "3. شغّل: bash $APP_DIR/deploy/deploy.sh"
echo "========================================"
