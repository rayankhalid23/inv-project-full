import os
import re
import json
import logging
import requests
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv  # <-- 1. إضافة هذا السطر

# قراءة المتغيرات من ملف .env تلقائياً
load_dotenv()                   # <-- 2. إضافة هذا السطر

logger = logging.getLogger(__name__)

# قائمة المدن والمناطق الليبية المعتمدة في التوصيل والشحن
LIBYA_CITIES_AND_AREAS: Dict[str, List[str]] = {
    "طرابلس": [
        "سوق الجمعة", "تاجوراء", "جنزور", "حي الأندلس", "بن عاشور", "النوفليين",
        "عين زارة", "السراج", "غوط الشعال", "طريق المطار", "أبو سليم", "صلاح الدين",
        "قرقارش", "زاوية الدهماني", "الدريبي", "الفرناج", "الهضبة الخضراء", "الهضبة الشرقية",
        "السبعة", "الهاني", "زناتة", "الظهرة", "بن غشير", "فشلوم", "المدينة القديمة",
        "ميزران", "الحشان", "القادسية", "طريق الشوك", "طريق السور", "باب بن غشير",
        "سيدي خليفة", "حي دمشق", "رأس حسن", "جامع الصقع", "عرادة", "الغرارات"
    ],
    "بنغازي": [
        "الفويهات", "الكيش", "الصابري", "سيدي حسين", "الحدائق", "الماجوري",
        "الليثي", "طابلينو", "الهواري", "بوعطني", "شبنة", "السلماني",
        "حي السلام", "القوارشة", "البركة", "بوهديمة", "قاريونس", "الكويفية",
        "سيدي خليفة", "بلعون", "حي الفاتح", "حي النصر", "الرويسات", "المساكن"
    ],
    "مصراتة": [
        "وسط المدينة", "قصر أحمد", "السكت", "الزروق", "الغيران", "طمينة",
        "يدر", "الرويسات", "المحجوب", "المقاصبة", "الرملة", "بلاد شحات",
        "رأس الطوبة", "ذات الرمال", "طريق الجزيرة", "الميدان", "طريق النهر"
    ],
    "الزاوية": [
        "وسط المدينة", "الزاوية الجنوبية", "الزاوية الغربية", "جوددائم",
        "الحرشة", "المطرد", "الصابرية", "بوعيسى", "بئر ترفاس", "ديلان"
    ],
    "زليتن": [
        "وسط المدينة", "البازة", "الجمعة", "المنارة", "الساحل", "سوق الثلاثاء", "كعام", "ازدو"
    ],
    "الخمس": [
        "وسط المدينة", "سوق الخميس", "كعبار", "سيلين", "لبدة", "رأس غزال", "الساحل"
    ],
    "غريان": [
        "وسط المدينة", "تغرنة", "القواسم", "بني داوود", "الهيرة", "تغسات", "ككلة", "بني نصير"
    ],
    "صرمان": [
        "وسط المدينة", "صرمان الغربية", "صرمان القبلية", "الشاطئ", "المطل"
    ],
    "صبراتة": [
        "وسط المدينة", "دحمان", "العلالقة", "سوق العلالقة", "تليل", "الطويلة", "شاطئ الوادي"
    ],
    "البيضاء": [
        "وسط المدينة", "حي الزاوية", "حي الأندلس", "الغريقة", "حي الثورة", "حي السلام", "الوردية", "الكاوة"
    ],
    "طبرق": [
        "وسط المدينة", "باب درنة", "سوق العجاج", "المنارة", "سان جورج", "الجبيلة", "المرصص"
    ],
    "درنة": [
        "وسط المدينة", "الساحل الشرقي", "باب طبرق", "الجبيلة", "شيحة الشرقية", "شيحة الغربية", "المغار"
    ],
    "سبها": [
        "وسط المدينة", "القرضة", "المنشية", "المهدية", "حي الفاتح", "الجديد", "سكرة", "حجارة", "عبد الكافي"
    ],
    "سرت": [
        "وسط المدينة", "الحي السكني الأول", "الحي السكني الثاني", "الحي السكني الثالث", "الزعفران", "الغربيات", "جارف"
    ],
    "ترهونة": [
        "وسط المدينة", "سوق الأحد", "الخضراء", "مجي", "الداوون", "العواتة"
    ],
    "بني وليد": [
        "وسط المدينة", "الظهرة", "المردوم", "تينيناي", "الشقيقة"
    ],
    "أجدابيا": [
        "وسط المدينة", "الحي الصناعي", "حي 7 أكتوبر", "انتلات", "البيضان"
    ],
    "تاجوراء": [
        "الضاحية", "الدوائر", "بئر الأسطى ميلاد", "النشيع", "الحميدية", "العقربية", "الملاحة"
    ],
    "جنزور": [
        "جنزور الشرقية", "جنزور الغربية", "الصياد", "السراج الغربي", "النجيلي", "المشاشطة"
    ]
}

# باقات الخدمة الافتراضية لشركة درب السبيل
DEFAULT_SERVICES = [
    {
        "id": "6783c612dcf305c9e775c987",
        "_id": "6783c612dcf305c9e775c987",
        "name": "توصيل رجالي",
        "description": "توصيل بمندوب رجالي — مناسب للمنتجات العامة",
        "is_default": True,
        "gender": "male",
    },
    {
        "id": "67c84fbc9ed6c0d5c5bb1d2b",
        "_id": "67c84fbc9ed6c0d5c5bb1d2b",
        "name": "توصيل نسائي",
        "description": "توصيل بمندوبة نسائية — مناسب للمنتجات النسائية",
        "is_default": False,
        "gender": "female",
    },
    {
        "id": "67ed8ed1f406d9671db58d8b",
        "_id": "67ed8ed1f406d9671db58d8b",
        "name": "استلام قيمة مالية",
        "description": "استلام مبلغ مالي فقط بدون منتج",
        "is_default": False,
        "gender": None,
    },
]


class DarbAssabilService:
    """
    خدمة التكامل والربط مع شركة الشحن 'درب السبيل' (Darb Assabil API)
    تتحكم بجميع طلبات الـ API والتحقق من الهواتف وإنشاء الشحنات.
    """

    def __init__(self):
        self._base_url = None
        self._api_key = None
        self._account_id = None
        self.timeout = 15

    @property
    def base_url(self) -> str:
        url = os.getenv("DARB_ASSABIL_BASE_URL", "https://v2.sabil.ly")
        return str(url).rstrip("/")

    @property
    def api_key(self) -> str:
        return os.getenv("DARB_ASSABIL_API_KEY", "").strip()

    @property
    def account_id(self) -> str:
        return os.getenv("DARB_ASSABIL_ACCOUNT_ID", "67f19a776dabff22987169e9").strip()

    def _get_headers(self) -> Dict[str, str]:
        key = self.api_key
        # التوثيق يستوجب: Authorization: apikey <key>
        # نضيف البادئة إن لم تكن موجودة لتجنّب رفض الخادم للطلبات
        auth_value = key if key.lower().startswith("apikey ") else f"apikey {key}"
        return {
            "Content-Type": "application/json",
            "Authorization": auth_value,
            "X-API-VERSION": "1.0.0",
            "X-ACCOUNT-ID": self.account_id,
        }

    @staticmethod
    def format_phone_number(phone: str) -> str:
        """
        تنسيق رقم الهاتف الليبي ليتوافق مع صيغة E.164 الدولية (+218xxxxxxxxx)
        """
        if not phone:
            return "+218910000000"
        cleaned = re.sub(r"[^\d+]", "", str(phone).strip())
        if cleaned.startswith("+"):
            return cleaned
        if cleaned.startswith("00"):
            return "+" + cleaned[2:]
        if cleaned.startswith("218"):
            return "+" + cleaned
        if cleaned.startswith("0"):
            return "+218" + cleaned[1:]
        return "+218" + cleaned

    def get_services(self) -> List[Dict[str, Any]]:
        """
        1. جلب قائمة باقات الخدمة من درب السبيل (GET /api/local/services).
        """
        for ep in ["/api/local/services", "/api/services"]:
            try:
                url = f"{self.base_url}{ep}"
                res = requests.get(url, headers=self._get_headers(), timeout=self.timeout)
                if res.status_code == 200:
                    data = res.json()
                    results = data.get("data", []) if isinstance(data.get("data"), list) else (data.get("results", []) if isinstance(data.get("results"), list) else [])
                    if results:
                        return [
                            {
                                "id": str(s.get("_id") or s.get("id") or self.account_id),
                                "_id": str(s.get("_id") or s.get("id") or self.account_id),
                                "name": s.get("name") or s.get("title") or "باقة خدمة",
                                "code": s.get("code", "STANDARD"),
                                "description": s.get("description", ""),
                                "is_default": s.get("isDefault", False)
                            }
                            for s in results
                        ]
            except Exception as e:
                logger.warning(f"Failed to fetch Darb Assabil services from {ep}: {e}")

        return DEFAULT_SERVICES

    def get_cities(self) -> List[Dict[str, Any]]:
        """
        2. جلب قائمة المدن من درب السبيل (GET /api/cities?countryCode=LBY).
        """
        url = f"{self.base_url}/api/cities?countryCode=LBY"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                results = data.get("data", []) if isinstance(data.get("data"), list) else (data.get("results", []) if isinstance(data.get("results"), list) else [])
                if results:
                    return [
                        {
                            "id": str(c.get("_id") or c.get("id") or ""),
                            "_id": str(c.get("_id") or c.get("id") or ""),
                            "name": c.get("name") or c.get("city") or "",
                            "nameEn": c.get("nameEn") or "",
                            "countryCode": c.get("countryCode", "LBY")
                        }
                        for c in results if c.get("name") or c.get("city")
                    ]
        except Exception as e:
            logger.warning(f"Failed to fetch Darb Assabil cities from API: {e}")

        return [{"id": f"city_{i}", "_id": f"city_{i}", "name": city, "nameEn": city, "countryCode": "LBY"} for i, city in enumerate(LIBYA_CITIES_AND_AREAS.keys())]

    def get_areas(self, city: Optional[str] = None, city_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        3. جلب قائمة المناطق التابعة لمدينة من درب السبيل (GET /api/areas?city=... أو ?cityId=...).
        """
        param = f"city={city}" if city else (f"cityId={city_id}" if city_id else "")
        url = f"{self.base_url}/api/areas{('?' + param) if param else ''}"
        try:
            res = requests.get(url, headers=self._get_headers(), timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                results = data.get("data", []) if isinstance(data.get("data"), list) else (data.get("results", []) if isinstance(data.get("results"), list) else [])
                if results:
                    return [
                        {
                            "id": str(a.get("_id") or a.get("id") or ""),
                            "_id": str(a.get("_id") or a.get("id") or ""),
                            "name": a.get("name") or a.get("area") or "",
                            "nameEn": a.get("nameEn") or "",
                            "city": a.get("city") or city or ""
                        }
                        for a in results if a.get("name") or a.get("area")
                    ]
        except Exception as e:
            logger.warning(f"Failed to fetch Darb Assabil areas for city {city}: {e}")

        fallback_areas = LIBYA_CITIES_AND_AREAS.get(city, ["وسط المدينة"]) if city else []
        return [{"id": f"area_{i}", "_id": f"area_{i}", "name": a, "nameEn": a, "city": city or ""} for i, a in enumerate(fallback_areas)]

    def get_cities_and_areas(self) -> Dict[str, List[str]]:
        """
        جلب الخريطة المجمعة للمدن والمناطق المدعومة للتوصيل.
        """
        try:
            cities_list = self.get_cities()
            if cities_list and len(cities_list) > 3:
                api_map = {}
                for c in cities_list:
                    c_name = c.get("name")
                    if c_name:
                        areas = self.get_areas(city=c_name, city_id=c.get("id"))
                        api_map[c_name] = [a.get("name") for a in areas if a.get("name")] or ["وسط المدينة"]
                if api_map:
                    return api_map
        except Exception as e:
            logger.warning(f"Failed to aggregate cities and areas: {e}")

        return LIBYA_CITIES_AND_AREAS

    def create_contact_or_get_id(self, customer_phone: str, customer_name: str) -> Optional[str]:
        """
        التحقق من وجود الزبون أو إنشائه للحصول على RECEIVER_CONTACT_ID
        """
        formatted_phone = self.format_phone_number(customer_phone)
        headers = self._get_headers()

        # الخطوة أ: البحث في جهات الاتصال المسجلة
        try:
            search_url = f"{self.base_url}/api/contacts"
            res = requests.get(search_url, headers=headers, timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                results = data.get("data", []) if isinstance(data.get("data"), list) else (data.get("results", []) if isinstance(data.get("results"), list) else [])
                for contact in results:
                    c_phone = contact.get("phone", "")
                    if c_phone == formatted_phone or c_phone.endswith(formatted_phone[-9:]):
                        logger.info(f"Found existing Darb Assabil contact: {contact.get('_id')}")
                        return str(contact.get("_id"))
            else:
                logger.warning(
                    f"[DARB ASSABIL] GET /api/contacts أعاد {res.status_code}: {res.text[:400]}"
                )
        except Exception as e:
            logger.warning(f"Error checking existing contacts: {e}")

        # الخطوة ب: إنشاء جهة اتصال جديدة
        try:
            create_url = f"{self.base_url}/api/contacts"
            payload = {
                "phone": formatted_phone,
                "name": customer_name or "زبون",
            }
            res = requests.post(create_url, headers=headers, json=payload, timeout=self.timeout)
            if res.status_code in [200, 201]:
                data = res.json()
                contact_id = data.get("data", {}).get("_id") or data.get("_id")
                logger.info(f"Created new Darb Assabil contact with ID: {contact_id}")
                return str(contact_id)
            else:
                logger.warning(f"Failed to create contact in Darb Assabil: {res.status_code} - {res.text}")
        except Exception as e:
            logger.error(f"Exception creating contact in Darb Assabil: {e}")

        return None

    def create_local_shipment(self, order_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        إرسال الشحنة لشركة درب السبيل وإنشاء بوليصة الشحن الرسمية (POST /api/local/shipments).
        """
        key = self.api_key
        logger.info(f"[DARB ASSABIL] create_local_shipment started for order #{order_data.get('order_id')}. Key Present: {bool(key)} (len: {len(key)}), Account: {self.account_id}")
        print(f"[DARB ASSABIL DEBUG] create_local_shipment called. API Key present: {bool(key)} (length: {len(key)}), Account ID: {self.account_id}")

        if not key:
            err_msg = "مفتاح API الخاص بدرب السبيل غير مضبوط في ملف الإعدادات (.env)"
            logger.error(f"[DARB ASSABIL] {err_msg}")
            return {
                "success": False,
                "error": err_msg,
                "message": err_msg,
            }

        customer_phone = order_data.get("customer_phone", "")
        customer_name = order_data.get("customer_name", "عميل")
        
        # 1. الحصول على RECEIVER_CONTACT_ID
        contact_id = self.create_contact_or_get_id(customer_phone, customer_name)
        if not contact_id:
            # contacts.create محجوبة على مستوى الحساب (غالباً 402 من درب السبيل)
            # نُكمل بـ account_id كـ placeholder حتى تُفعَّل الصلاحية من مزود الخدمة
            logger.warning(
                f"[DARB ASSABIL] فشل جلب/إنشاء جهة الاتصال للزبون '{customer_name}' ({customer_phone}). "
                f"الفول-باك: استخدام account_id={self.account_id} كـ contact placeholder. "
                "راجع صلاحية contacts.create مع درب السبيل."
            )
            contact_id = self.account_id

        # 2. إعداد المنتجات (الحقول المسموحة: title, quantity, amount, currency, isChargeable, allowInspection, allowTesting)
        formatted_products = []
        for p in order_data.get("products", []):
            product_entry = {
                "title": str(p.get("title") or "منتج"),
                "quantity": int(p.get("quantity", 1)),
                "allowInspection": True,
                "allowTesting": True,
                "amount": float(p.get("amount", 0)),
                "currency": str(p.get("currency", "lyd")).lower(),
                "isChargeable": bool(p.get("isChargeable", True)),
            }
            formatted_products.append(product_entry)

        if not formatted_products:
            formatted_products.append({
                "title": f"طلب رقم #{order_data.get('order_id', '')}",
                "quantity": 1,
                "allowInspection": True,
                "allowTesting": True,
                "amount": float(order_data.get("total_amount", 0)),
                "currency": "lyd",
                "isChargeable": True,
            })

        # 3. معرف الباقة — fallback للخدمة الرجالية (ID حقيقي من درب السبيل)
        service_id = order_data.get("service")
        if not service_id or len(str(service_id)) != 24:
            service_id = DEFAULT_SERVICES[0]["id"]

        # 4. تجهيز payload الشحنة الرسمي المطابق بدقة لمواصفات درب السبيل (الحقول المسموحة فقط)
        payload = {
            "service": str(service_id),
            "contacts": [str(contact_id)],
            "paymentBy": str(order_data.get("paymentBy") or "receiver"),
            "allowSplitting": True,
            "to": {
                "countryCode": str(order_data.get("countryCode") or "lby").lower(),
                "city": str(order_data.get("city") or "طرابلس"),
                "area": str(order_data.get("area") or "وسط المدينة"),
                "address": str(order_data.get("address") or ""),
            },
            "products": formatted_products,
            "notes": str(order_data.get("notes") or ""),
        }

        # 5. طباعة وتسجيل الـ payload كاملاً بصيغة JSON قبل الإرسال مباشرة
        payload_json_str = json.dumps(payload, ensure_ascii=False, indent=2)
        print(f"\n[DARB ASSABIL OUTGOING PAYLOAD TO {self.base_url}]:\n{payload_json_str}\n")
        logger.info(f"[DARB ASSABIL OUTGOING PAYLOAD]: {payload_json_str}")

        # 6. إرسال الطلب لـ API درب السبيل (تجربة /api/local/shipments أولاً ثم /api/orders)
        headers = self._get_headers()
        endpoints = ["/api/local/shipments", "/api/orders"]
        last_error = ""
        last_status = 500

        for ep in endpoints:
            shipment_url = f"{self.base_url}{ep}"
            try:
                logger.info(f"Sending shipment to Darb Assabil: {shipment_url}")
                res = requests.post(shipment_url, headers=headers, json=payload, timeout=self.timeout)
                logger.info(f"Darb Assabil response status ({ep}): {res.status_code}")

                if res.status_code in [200, 201]:
                    res_json = res.json()
                    data = res_json.get("data", {})
                    tracking_number = data.get("reference") or data.get("trackingNumber") or data.get("_id")
                    shipment_id = data.get("_id") or str(data.get("id", ""))

                    return {
                        "success": True,
                        "tracking_number": str(tracking_number) if tracking_number else None,
                        "shipment_id": str(shipment_id) if shipment_id else None,
                        "message": f"تم إنشاء الشحنة بنجاح في تطبيق درب السبيل برقم تتبع: {tracking_number}",
                        "raw_response": res_json,
                    }
                else:
                    last_status = res.status_code
                    last_error = res.text
                    # تسجيل الاستجابة الكاملة (status + body) لسهولة التشخيص
                    logger.warning(
                        f"[DARB ASSABIL] {ep} أعاد {res.status_code}: {res.text[:800]}"
                    )
                    try:
                        res_json = res.json()
                        msgs = res_json.get("messages", [])
                        if msgs and isinstance(msgs, list):
                            last_error = " | ".join(m.get("message", "") for m in msgs if isinstance(m, dict))
                    except Exception:
                        pass
            except requests.exceptions.Timeout:
                last_error = "انتهت مهلة الاتصال بخادم درب السبيل (Timeout)"
            except Exception as e:
                last_error = f"تعذر الاتصال بخادم درب السبيل: {str(e)}"

        return {
            "success": False,
            "error": f"خطأ من درب السبيل ({last_status}): {last_error}",
            "message": f"تعذر إرسال الشحنة لشركة درب السبيل: {last_error}",
            "status_code": last_status,
        }


# كائن الخدمة العام للاستخدام في جميع أنحاء النظام
darb_assabil_service = DarbAssabilService()
