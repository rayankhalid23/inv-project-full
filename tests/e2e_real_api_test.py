# =============================================================================
# tests/e2e_real_api_test.py
# اختبار حقيقي End-to-End يرسل طلب فعلي لـ Darb Assabil API
# =============================================================================
import sys, os, json
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from dotenv import load_dotenv
load_dotenv()

import requests

API_KEY    = os.getenv("DARB_ASSABIL_API_KEY", "").strip()
ACCOUNT_ID = os.getenv("DARB_ASSABIL_ACCOUNT_ID", "").strip()
BASE_URL   = os.getenv("DARB_ASSABIL_BASE_URL", "https://v2.sabil.ly").rstrip("/")

auth_value = API_KEY if API_KEY.lower().startswith("apikey ") else f"apikey {API_KEY}"
headers = {
    "Content-Type":  "application/json",
    "Authorization": auth_value,
    "X-API-VERSION": "1.0.0",
    "X-ACCOUNT-ID":  ACCOUNT_ID,
}

SERVICE_ID = "6783c612dcf305c9e775c987"

payload = {
    "service":        SERVICE_ID,
    "contacts":       [ACCOUNT_ID],
    "paymentBy":      "receiver",
    "allowSplitting": True,
    "to": {
        "countryCode": "lby",
        "city":        "طرابلس",
        "area":        "بن عاشور",
        "address":     "شارع الجمهورية - اختبار E2E تلقائي",
    },
    "products": [
        {
            "title":          "منتج تجريبي E2E",
            "quantity":       1,
            "allowInspection": True,
            "allowTesting":    True,
            "amount":         50.0,
            "currency":       "lyd",
            "isChargeable":   True,
        }
    ],
    "notes": "اختبار E2E تلقائي - يمكن حذفه",
}

print("=" * 60)
print(">>> REQUEST BODY (JSON):")
print(json.dumps(payload, ensure_ascii=False, indent=2))
print("=" * 60)

ENDPOINTS = ["/api/local/shipments", "/api/orders"]
success = False

for ep in ENDPOINTS:
    url = f"{BASE_URL}{ep}"
    print(f"\n>>> SENDING TO: {url}")
    try:
        resp = requests.post(url, headers=headers, json=payload, timeout=20)
        print(f">>> RESPONSE STATUS: {resp.status_code}")
        print(">>> RESPONSE BODY:")
        try:
            body = resp.json()
            print(json.dumps(body, ensure_ascii=False, indent=2))
        except Exception:
            body = {}
            print(resp.text)

        if resp.status_code in (200, 201):
            data = body.get("data", {})
            reference = data.get("reference") or data.get("trackingNumber") or data.get("_id")
            shipment_id = data.get("_id")
            print("\n" + "=" * 60)
            print("✅ SUCCESS — الطلب قُبل من Darb Assabil!")
            print(f"   reference   : {reference}")
            print(f"   shipment_id : {shipment_id}")
            print("=" * 60)
            success = True
            break
        else:
            print(f"   [endpoint {ep}] rejected with {resp.status_code} — trying next...")
    except Exception as e:
        print(f"   EXCEPTION on {ep}: {e}")

if not success:
    print("\n" + "=" * 60)
    print("❌ FAILED — لم ينجح أي endpoint في إنشاء الشحنة.")
    print("   راجع الـ response body أعلاه للتفاصيل الكاملة.")
    print("=" * 60)
    sys.exit(1)
