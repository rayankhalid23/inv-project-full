import os
import re
import json
import time
import logging
import requests
from typing import Dict, Any, List, Optional, Tuple
from dotenv import load_dotenv  # <-- 1. إضافة هذا السطر

# قراءة المتغيرات من ملف .env تلقائياً
load_dotenv()                   # <-- 2. إضافة هذا السطر

logger = logging.getLogger(__name__)

# قائمة المدن والمناطق الليبية المعتمدة في التوصيل والشحن (مطابقة تماماً لفروع وشبكة درب السبيل الرسمية)
LIBYA_CITIES_AND_AREAS: Dict[str, List[str]] = {
    "اجدابيا": [
        "اجدابيا", "وسط المدينة"
    ],
    "البريقة": [
        "البريقة", "العقيلة", "بشر", "وسط المدينة"
    ],
    "البيضاء": [
        "البيضاء", "اسلنطة", "سوسة", "شحات", "قصر ليبيا", "قندولة", "مراوة", "مسة", "وسط المدينة"
    ],
    "الجفرة": [
        "الجفرة", "هون", "ودان", "سوكنة", "زلة", "وسط المدينة"
    ],
    "الخمس": [
        "الخمس", "زليتن", "مسلاتة", "سوق الخميس", "كعبار", "سيلين", "لبدة", "وسط المدينة"
    ],
    "الزاوية": [
        "الزاوية", "الماية", "المطرد", "بوعيسى", "جوددائم", "الحرشة", "الصابرية", "وسط المدينة"
    ],
    "العجيلات": [
        "العجيلات", "وسط المدينة"
    ],
    "القبة": [
        "القبة", "الأبرق", "القيقب", "وسط المدينة"
    ],
    "القره بولي": [
        "القره بولي", "قصر خيار", "وسط المدينة"
    ],
    "الكفرة": [
        "الكفرة", "الجوف", "وسط المدينة"
    ],
    "المرج": [
        "المرج", "الأبيار", "البياضة", "تاكنس", "توكرة", "وسط المدينة"
    ],
    "بنغازي": [
        "وسط المدينة", "البركة", "الحدائق", "الحميضه", "الحي الجامعي", "الرجمه", "الرحبة",
        "الرويسات", "السلماني", "الصابري", "الفويهات", "القوارشة", "الكويفية", "الكيش",
        "الليثي", "الماجورى", "الهواري", "الوحيشي", "بلعون", "بنغازي - استلام من المكتب",
        "بنينا", "بو هادي", "بو هديمة", "حي السلام", "حي الفاتح", "حي قطر", "حي لبنان",
        "راس عبيدة", "سلوق", "سيدي حسين", "سيدي خليفة", "سيدي فرج", "سيدي يونس", "شارع عشرين",
        "شبنة", "طبلينو", "قاريونس", "قمينس", "قنفودة", "فينسيا", "ابوعطني"
    ],
    "بني وليد": [
        "بني وليد", "وسط المدينة"
    ],
    "تاجوراء": [
        "تاجوراء", "الضاحية", "بئر الأسطى ميلاد", "النشيع", "الحميدية", "وسط المدينة"
    ],
    "تازربو": [
        "تازربو", "الواحات", "جالو اوجلة", "وسط المدينة"
    ],
    "ترهونة": [
        "ترهونة", "سوق الأحد", "الخضراء", "وسط المدينة"
    ],
    "جالو اوجلة": [
        "جالو اوجلة", "تازربو", "الواحات", "وسط المدينة"
    ],
    "درنة": [
        "درنة", "البمبه", "التميمي", "العزيات", "الفتائح", "المخيلي", "ام الرزم", "عين مارة", "كرسه", "مرتوبة", "وسط المدينة"
    ],
    "رأس لانوف": [
        "رأس لانوف", "بن جواد", "وسط المدينة"
    ],
    "زليتن": [
        "زليتن", "البازة", "الجمعة", "المنارة", "الساحل", "وسط المدينة"
    ],
    "زوارة": [
        "زوارة", "أبي كماش", "الجميل", "رأس جدير", "رقدالين", "زلطن", "وسط المدينة"
    ],
    "سبها": [
        "سبها", "أم الارانب", "اوباري", "براك الشاطي", "تراغن", "حي عبدالكافئ الاربعة", "طاردونه",
        "غات", "مرزق", "مزدة", "القطرون", "الشويرف", "القرضة", "المنشية", "وسط المدينة"
    ],
    "سرت": [
        "سرت", "أبوقرين", "تاورغاء", "هراوة", "الزعفران", "الغربيات", "وسط المدينة"
    ],
    "صبراتة": [
        "صبراتة", "صرمان", "دحمان", "تليل", "وسط المدينة"
    ],
    "صرمان": [
        "صرمان", "صرمان الغربية", "صرمان القبلية", "وسط المدينة"
    ],
    "طبرق": [
        "طبرق", "مساعد", "باب درنة", "المنارة", "الجبيلة", "وسط المدينة"
    ],
    "طرابلس": [
        "وسط المدينة", "ابوسليم", "الباعيش", "الحشان", "الحي الإسلامي", "الدريبي", "الرياضية",
        "الزهراء", "السراج", "السواني", "السياحية", "الظهرة", "العزيزية", "الغرارات", "الفرناج",
        "الكريمية", "المدينة القديمة", "النوفليين", "الهاني", "الهضبة البدري", "الهضبة الخضراء",
        "الهضبة الشرقية", "باب العزيزية", "باب بن غشير", "بن عاشور", "بوابة الجبس", "تاجوراء",
        "جنزور", "حي الأندلس", "حي دمشق", "رأس حسن", "زاوية الدهماني", "زناتة", "سوق الجمعة",
        "صلاح الدين", "طريق الشوك", "طريق الفلاح", "طريق المطار", "عرادة", "عين زارة",
        "غوط الشعال", "فشلوم", "قرجي", "قرقارش", "قصر بن غشير", "معيتيقة", "وادي الربيع", "ورشفانة"
    ],
    "غريان": [
        "غريان", "الأصابعة", "الرابطة", "الرجبان", "الرحيبات", "الرياينة", "الزنتان", "القلعة",
        "المشاشية", "بدر", "بير غنم", "تيجي", "جادو", "درج", "غدامس", "كاباو", "ككلة", "نالوت",
        "يفرن", "تغرنة", "القواسم", "وسط المدينة"
    ],
    "قصر خيار": [
        "قصر خيار", "القره بولي", "وسط المدينة"
    ],
    "مصراتة": [
        "مصراتة", "أبوروية", "الجزيره", "الدافنية", "الزروق", "السكت", "السواوه", "الغيران",
        "المقاصبه", "رويسات", "زاوية المحجوب", "طريق البحر", "طمينة", "قصر أحمد", "كرزاز", "يدر", "وسط المدينة"
    ],
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

    # خريطة المدن/المناطق شبه ثابتة — نُخزّنها لتفادي إعادة بنائها عند كل طلب
    _CITIES_CACHE_TTL = 6 * 60 * 60  # 6 ساعات

    def __init__(self):
        self._base_url = None
        self._api_key = None
        self._account_id = None
        self.timeout = 15
        self._cities_cache: Optional[Dict[str, List[str]]] = None
        self._cities_cache_at = 0.0

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

    def _fetch_branches_from_api(self) -> Optional[Dict[str, List[str]]]:
        """
        جلب قائمة الفروع والمدن والمناطق الرسمية المعتمدة الحية مباشرة من درب السبيل
        (GET /api/local/branches/public).
        يعيد خريطة {المدينة: [المناطق]} أو None إذا تعذر الاتصال بالخادم.
        """
        url = f"{self.base_url}/api/local/branches/public"
        try:
            res = requests.get(url, timeout=self.timeout)
            if res.status_code == 200:
                data = res.json()
                results = (
                    data.get("data", {}).get("results", [])
                    if isinstance(data.get("data"), dict)
                    else (data.get("results", []) if isinstance(data.get("results"), list) else [])
                )
                if results and len(results) > 0:
                    api_map: Dict[str, set] = {}
                    for branch in results:
                        city = (branch.get("city") or "").strip()
                        area = (branch.get("area") or "").strip()
                        areas_list = branch.get("areas") or []

                        if city:
                            if city not in api_map:
                                api_map[city] = set()
                            if area:
                                api_map[city].add(area)
                            for a in areas_list:
                                if isinstance(a, str) and a.strip():
                                    api_map[city].add(a.strip())
                                elif isinstance(a, dict):
                                    aname = (a.get("name") or a.get("area") or "").strip()
                                    if aname:
                                        api_map[city].add(aname)

                    processed_map: Dict[str, List[str]] = {
                        c: sorted(list(a_set)) for c, a_set in api_map.items() if a_set
                    }

                    # إتاحة المناطق الحيوية كمدن مباشرة لتسهيل وصول التاجر
                    # (مثل القره بولي، تازربو، زليتن، صرمان)
                    if "قصر خيار" in processed_map and "القره بولي" in processed_map["قصر خيار"]:
                        if "القره بولي" not in processed_map:
                            processed_map["القره بولي"] = ["القره بولي", "قصر خيار", "وسط المدينة"]
                    if "جالو اوجلة" in processed_map and "تازربو" in processed_map["جالو اوجلة"]:
                        if "تازربو" not in processed_map:
                            processed_map["تازربو"] = ["تازربو", "الواحات", "جالو اوجلة", "وسط المدينة"]

                    return processed_map
            else:
                logger.warning(
                    f"[DARB ASSABIL] GET /api/local/branches/public أعاد {res.status_code}: {res.text[:200]}"
                )
        except Exception as e:
            logger.warning(f"Failed to fetch Darb Assabil branches/cities from API: {e}")
        return None

    @staticmethod
    def resolve_shipping_destination(city: str, area: str) -> Tuple[str, str]:
        """
        مواءمة اسم المدينة والمنطقة مع تسميات شبكة درب السبيل الرسمية عند إنشاء الشحنة
        (مثلاً 'القره بولي' تتبع فرع 'قصر خيار'، 'تازربو' تتبع فرع 'جالو اوجلة'، إلخ).
        """
        city_clean = (city or "طرابلس").strip()
        area_clean = (area or "وسط المدينة").strip()

        # خريطة تحويل المناطق الشهيرة إلى الفروع الرسمية المعتمدة لدى درب السبيل
        BRANCH_REDIRECTS = {
            "القره بولي": ("قصر خيار", "القره بولي"),
            "تازربو": ("جالو اوجلة", "تازربو"),
            "زليتن": ("الخمس", "زليتن"),
            "صرمان": ("صبراتة", "صرمان"),
            "مسلاتة": ("الخمس", "مسلاتة"),
            "الجميل": ("زوارة", "الجميل"),
            "رقدالين": ("زوارة", "رقدالين"),
            "زلطن": ("زوارة", "زلطن"),
            "الأبيار": ("المرج", "الأبيار"),
            "شحات": ("البيضاء", "شحات"),
            "سوسة": ("البيضاء", "سوسة"),
            "بن جواد": ("رأس لانوف", "بن جواد"),
            "العقيلة": ("البريقة", "العقيلة"),
            "بشر": ("البريقة", "بشر"),
        }

        if city_clean in BRANCH_REDIRECTS:
            parent_branch_city, default_area = BRANCH_REDIRECTS[city_clean]
            final_area = area_clean if area_clean not in ["", "وسط المدينة", city_clean] else default_area
            return parent_branch_city, final_area

        return city_clean, area_clean

    def get_cities(self) -> List[Dict[str, Any]]:
        """
        2. جلب قائمة المدن من درب السبيل (مباشرة من API الفروع أو الفول-باك المعتمد).
        """
        cities_map = self.get_cities_and_areas()
        return [
            {
                "id": f"city_{i}",
                "_id": f"city_{i}",
                "name": city,
                "nameEn": city,
                "countryCode": "lby",
            }
            for i, city in enumerate(sorted(cities_map.keys()))
        ]

    def get_areas(self, city: Optional[str] = None, city_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        3. جلب قائمة المناطق التابعة لمدينة محددة من درب السبيل.
        """
        cities_map = self.get_cities_and_areas()
        areas_list = cities_map.get(city, ["وسط المدينة"]) if city else []
        if not areas_list:
            areas_list = ["وسط المدينة"]

        return [
            {
                "id": f"area_{i}",
                "_id": f"area_{i}",
                "name": a,
                "nameEn": a,
                "city": city or "",
            }
            for i, a in enumerate(areas_list)
        ]

    def get_cities_and_areas(self) -> Dict[str, List[str]]:
        """
        جلب الخريطة المجمعة للمدن والمناطق المدعومة للتوصيل.
        تُجلب حياً من GET /api/local/branches/public وتُخزّن مؤقتاً لتسريع الأداء.
        """
        now = time.time()
        if self._cities_cache and (now - self._cities_cache_at) < self._CITIES_CACHE_TTL:
            return self._cities_cache

        result = LIBYA_CITIES_AND_AREAS
        try:
            live_map = self._fetch_branches_from_api()
            if live_map and len(live_map) > 5:
                result = live_map
                logger.info(f"[DARB ASSABIL] Successfully loaded {len(live_map)} live cities from Darb Assabil API")
        except Exception as e:
            logger.warning(f"Failed to aggregate cities and areas from live API: {e}")

        self._cities_cache = result
        self._cities_cache_at = now
        return result

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

        # تحديد المدينة والمنطقة المتوافقة مع فروع وشبكة درب السبيل
        raw_city = str(order_data.get("city") or "طرابلس").strip()
        raw_area = str(order_data.get("area") or "وسط المدينة").strip()
        ship_city, ship_area = self.resolve_shipping_destination(raw_city, raw_area)

        notes_val = str(order_data.get("notes") or "").strip()
        # إذا تم اختيار مدينة فرعية تحولت لفرعها الرئيسي، نوضح الوجهة الأصلية في الملاحظات للسائق والشركة
        if raw_city != ship_city and raw_city:
            dest_clarification = f"الوجهة: {raw_city} - {raw_area}"
            if dest_clarification not in notes_val:
                notes_val = f"{notes_val} | {dest_clarification}".strip(" |")

        # 4. تجهيز payload الشحنة الرسمي المطابق بدقة لمواصفات درب السبيل (الحقول المسموحة فقط)
        payload = {
            "service": str(service_id),
            "contacts": [str(contact_id)],
            "paymentBy": str(order_data.get("paymentBy") or "receiver"),
            "allowSplitting": True,
            "to": {
                "countryCode": str(order_data.get("countryCode") or "lby").lower(),
                "city": ship_city,
                "area": ship_area,
                "address": str(order_data.get("address") or ""),
            },
            "products": formatted_products,
            "notes": notes_val,
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
