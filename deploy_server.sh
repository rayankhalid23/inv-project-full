#!/bin/bash
# =============================================================================
# سكريبت التثبيت والنشر التلقائي لنظام Bellagio على سيرفر Ubuntu 22.04 LTS
# السيرفر: srv1.bellagio.ly (102.203.201.65)
# الدومين: bellagio.ly
# =============================================================================

set -e

echo "🚀 [1/8] تحديث حزم النظام..."
apt update && apt upgrade -y

echo "📦 [2/8] تثبيت المتطلبات الأساسية (Python, MySQL, Nginx, Git, Node.js)..."
apt install -y python3-pip python3-venv python3-dev mysql-server nginx git curl ufw certbot python3-certbot-nginx

if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

echo "🗄️ [3/8] إعداد قاعدة بيانات MySQL..."
mysql -u root <<EOF
CREATE DATABASE IF NOT EXISTS bellagio_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'bellagio_user'@'localhost' IDENTIFIED BY 'BellagioSecurePass2026!';
GRANT ALL PRIVILEGES ON bellagio_db.* TO 'bellagio_user'@'localhost';
FLUSH PRIVILEGES;
EOF

echo "📁 [4/8] إعداد البيئة الافتراضية وحزم البايثون..."
mkdir -p /var/www/bellagio
cd /var/www/bellagio

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

echo "⚙️ [5/8] كتابة ملف متغيرات البيئة .env..."
cat << 'EOF_ENV' > .env
DATABASE_URL=mysql+pymysql://bellagio_user:BellagioSecurePass2026!@localhost:3306/bellagio_db
SECRET_KEY=bellagio_super_secret_jwt_key_production_2026_x89!
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=10080
BELLAGIO_WORKERS=2
DB_POOL_SIZE=15
DB_MAX_OVERFLOW=30

DARB_ASSABIL_BASE_URL=https://v2.sabil.ly
DARB_ASSABIL_API_KEY=eyJhbGciOiJIUzI1NiJ9.eyJzZWNyZXRJZCI6IjZhODBjYTMwY2FmYTg4ZjViMzVhMDEzMCIsInN1YiI6Im9hdXRoX3NlY3JldCIsImlzcyI6IkRhcmIgQXNzYWJpbCIsImF1ZCI6IkRhcmIgQXNzYWJpbCIsImlhdCI6MTc4NjgyNTI2NCwiZXhwIjozMjY4NzYzOTk5LjkzNzAwMDN9.1oWHuk-T36gs_8j3fd1B2KhlyOefhzkMtui0EAJcOQs
DARB_ASSABIL_ACCOUNT_ID=67f19a776dabff22987169e9
EOF_ENV

echo "🎨 [6/8] بناء واجهة المستخدم (Frontend Build)..."
cd /var/www/bellagio/frontend
npm install
npm run build
cd /var/www/bellagio

mkdir -p static/products static/qr static/receipts static/temp
chmod -R 775 static
chown -R www-data:www-data /var/www/bellagio

echo "🔧 [7/8] إعداد خدمة Systemd وسيرفر Nginx..."
cat << 'EOF_SERVICE' > /etc/systemd/system/bellagio.service
[Unit]
Description=Bellagio Inventory System - FastAPI Application
After=network.target mysql.service

[Service]
User=root
WorkingDirectory=/var/www/bellagio
ExecStart=/var/www/bellagio/venv/bin/gunicorn main:app -w 2 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8000 --timeout 180 --access-logfile - --error-logfile -
Restart=always
RestartSec=5
EnvironmentFile=/var/www/bellagio/.env

[Install]
WantedBy=multi-user.target
EOF_SERVICE

systemctl daemon-reload
systemctl enable bellagio
systemctl restart bellagio

cat << 'EOF_NGINX' > /etc/nginx/sites-available/bellagio
server {
    listen 80;
    server_name bellagio.ly www.bellagio.ly srv1.bellagio.ly 102.203.201.65;

    client_max_body_size 50M;

    location / {
        root /var/www/bellagio/frontend/dist;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /static/ {
        alias /var/www/bellagio/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location ~ ^/(api|auth|users|catalogs|sizes|colors|products|variants|inventory|orders|analytics|shipping|docs|openapi.json|redoc) {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # مهلة مخصصة لتوليد تقارير الـ PDF بدون انقطاع
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
        proxy_send_timeout 300s;
        proxy_buffering off;
    }
}
EOF_NGINX

ln -sf /etc/nginx/sites-available/bellagio /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

echo "🛡️ [8/8] ضبط جدار الحماية (UFW)..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "============================================================"
echo "🎉 تم النشر بنجاح! التطبيق يعمل الآن على:"
echo "👉 http://bellagio.ly أو http://102.203.201.65"
echo "👉 لتفعيل HTTPS بشهادة أمان SSL مجانية، شغّل الأمر التالي:"
echo "certbot --nginx -d bellagio.ly -d www.bellagio.ly -d srv1.bellagio.ly"
echo "============================================================"
