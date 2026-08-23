import os
import sys
import time
import shutil
from datetime import timedelta
from playwright.sync_api import sync_playwright

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import create_access_token

ARTIFACT_DIR = r"C:\Users\HP\.gemini\antigravity\brain\3126691c-19c8-4efb-86ab-5a8688226eda"
VIDEO_DIR = os.path.join(ARTIFACT_DIR, "videos")
IMG_DIR = os.path.join(ARTIFACT_DIR, "images")

os.makedirs(VIDEO_DIR, exist_ok=True)
os.makedirs(IMG_DIR, exist_ok=True)

# 1. Get valid Admin user token
db = SessionLocal()
admin_user = db.query(User).filter(User.is_active == True).first()
token = create_access_token(data={"sub": str(admin_user.id)}, expires_delta=timedelta(days=7))
user_dict = {
    "id": admin_user.id,
    "name": admin_user.name,
    "role_id": admin_user.role_id,
    "role": admin_user.role.name if admin_user.role else "Admin",
    "phone": admin_user.phone
}
db.close()

# JS Helper code to inject animated arrow, spotlight zoom, ripple, and guidance banner
INJECTED_OVERLAY_SCRIPT = """
(() => {
    if (window.__tutorialOverlayInjected) return;
    window.__tutorialOverlayInjected = true;

    // Add styles
    const style = document.createElement('style');
    style.innerHTML = `
        /* Cursor Pointer Arrow */
        #tutorial-pointer {
            position: fixed;
            width: 44px;
            height: 44px;
            z-index: 999999;
            pointer-events: none;
            transition: left 0.55s cubic-bezier(0.25, 1, 0.5, 1), top 0.55s cubic-bezier(0.25, 1, 0.5, 1), transform 0.3s ease;
            transform: translate(-10px, -10px);
            filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5));
        }

        #tutorial-pointer svg {
            width: 100%;
            height: 100%;
            fill: #800000;
            stroke: #ffffff;
            stroke-width: 2.2px;
        }

        /* Click Ripple */
        .tutorial-ripple {
            position: fixed;
            width: 42px;
            height: 42px;
            border-radius: 50%;
            background: rgba(128, 0, 0, 0.45);
            border: 2px solid #ffffff;
            pointer-events: none;
            z-index: 999998;
            transform: translate(-50%, -50%) scale(0.2);
            animation: tutorialRippleAnim 0.65s ease-out forwards;
        }

        @keyframes tutorialRippleAnim {
            0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(3.2); opacity: 0; }
        }

        /* Spotlight & Zoom on focused element */
        .tutorial-zoom-focus {
            transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.4s ease !important;
            transform: scale(1.06) !important;
            box-shadow: 0 0 0 4px rgba(128, 0, 0, 0.45), 0 12px 28px rgba(128, 0, 0, 0.25) !important;
            z-index: 9999 !important;
            position: relative !important;
        }

        /* Floating Tutorial Banner */
        #tutorial-banner {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 10px 18px;
            border-radius: 9999px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 12px;
            font-weight: 700;
            z-index: 9999999;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
            display: flex;
            align-items: center;
            gap: 8px;
            direction: rtl;
            pointer-events: none;
            transition: all 0.35s ease;
            max-width: 90%;
            text-align: center;
        }
        #tutorial-banner .badge-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #e11d48;
            box-shadow: 0 0 8px #e11d48;
            animation: pulseDot 1.5s infinite;
        }
        @keyframes pulseDot {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }
    `;
    document.head.appendChild(style);

    // Pointer element
    const pointer = document.createElement('div');
    pointer.id = 'tutorial-pointer';
    pointer.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M4 2l16 11-7.5 1.5L16 22l-3.5 1.5-3.5-7.5L4 21V2z"/>
        </svg>
    `;
    pointer.style.left = '-100px';
    pointer.style.top = '-100px';
    document.body.appendChild(pointer);

    // Banner element
    const banner = document.createElement('div');
    banner.id = 'tutorial-banner';
    banner.innerHTML = `<span class="badge-dot"></span><span id="tutorial-banner-text">شرح تفاعلي: إنشاء طلب مبيعات جديد</span>`;
    document.body.appendChild(banner);

    // Helper functions exposed to window
    window.__movePointerTo = (x, y) => {
        pointer.style.left = x + 'px';
        pointer.style.top = y + 'px';
    };

    window.__clickEffectAt = (x, y) => {
        const ripple = document.createElement('div');
        ripple.className = 'tutorial-ripple';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 650);

        pointer.style.transform = 'translate(-10px, -10px) scale(0.85)';
        setTimeout(() => {
            pointer.style.transform = 'translate(-10px, -10px) scale(1)';
        }, 150);
    };

    window.__setTutorialText = (text) => {
        const span = document.getElementById('tutorial-banner-text');
        if (span) span.innerText = text;
    };

    let activeZoomEl = null;
    window.__zoomElement = (selector) => {
        if (activeZoomEl) {
            activeZoomEl.classList.remove('tutorial-zoom-focus');
            activeZoomEl = null;
        }
        let el = null;
        if (typeof selector === 'string') {
            el = document.querySelector(selector);
        } else if (selector instanceof Element) {
            el = selector;
        }
        if (el) {
            el.classList.add('tutorial-zoom-focus');
            activeZoomEl = el;
            const rect = el.getBoundingClientRect();
            window.__movePointerTo(rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
    };

    window.__clearZoom = () => {
        if (activeZoomEl) {
            activeZoomEl.classList.remove('tutorial-zoom-focus');
            activeZoomEl = null;
        }
    };
})();
"""

def point_and_click(page, locator, text="", delay=0.8):
    if text:
        page.evaluate("(txt) => window.__setTutorialText(txt)", text)
    
    # Scroll locator into view if needed
    locator.scroll_into_view_if_needed()
    time.sleep(0.3)
    
    # Get box
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        
        # Apply zoom effect
        page.evaluate(f"""() => {{
            const el = document.elementFromPoint({cx}, {cy});
            if (el) {{
                const target = el.closest('button, input, select, div.cursor-pointer') || el;
                window.__zoomElement(target);
            }} else {{
                window.__movePointerTo({cx}, {cy});
            }}
        }}""")
        time.sleep(0.6)
        
        # Trigger ripple and click
        page.evaluate(f"window.__clickEffectAt({cx}, {cy})")
        time.sleep(0.15)
        locator.click()
        time.sleep(0.3)
        page.evaluate("window.__clearZoom()")
    else:
        locator.click()
        
    time.sleep(delay)

def point_and_type(page, locator, text_to_type, banner_text="", delay=0.06):
    if banner_text:
        page.evaluate("(txt) => window.__setTutorialText(txt)", banner_text)
        
    locator.scroll_into_view_if_needed()
    time.sleep(0.3)
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        page.evaluate(f"""() => {{
            const el = document.elementFromPoint({cx}, {cy});
            if (el) {{
                const target = el.closest('input, select, textarea') || el;
                window.__zoomElement(target);
            }} else {{
                window.__movePointerTo({cx}, {cy});
            }}
        }}""")
        time.sleep(0.5)
        page.evaluate(f"window.__clickEffectAt({cx}, {cy})")
        locator.click()
    
    for char in text_to_type:
        locator.type(char, delay=int(delay * 1000))
        time.sleep(0.01)
        
    time.sleep(0.4)
    page.evaluate("window.__clearZoom()")
    time.sleep(0.3)

def record():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--font-render-hinting=none", "--force-color-profile=srgb"]
        )
        
        # iPhone 14 Pro Max Viewport dimensions (430 x 932) with 2x scale for crisp video
        context = browser.new_context(
            viewport={"width": 430, "height": 932},
            is_mobile=True,
            has_touch=True,
            device_scale_factor=2,
            record_video_dir=VIDEO_DIR,
            record_video_size={"width": 430, "height": 932},
            locale="ar-LY",
            timezone_id="Africa/Tripoli"
        )
        
        page = context.new_page()
        
        # Inject auth token into localStorage
        page.goto("http://localhost:5173")
        page.evaluate(f"""() => {{
            localStorage.setItem('token', '{token}');
            localStorage.setItem('user', JSON.stringify({user_dict}));
        }}""")
        
        print("[-] Navigating to Sales Page (Mobile View)...")
        page.goto("http://localhost:5173/sales")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Inject visual tutorial overlay
        page.evaluate(INJECTED_OVERLAY_SCRIPT)
        time.sleep(0.5)
        page.evaluate("(t) => window.__setTutorialText(t)", "لوحة المبيعات على الهاتف المحمول")
        time.sleep(1.5)
        
        # Screenshot 1: Mobile Dashboard
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step1_dashboard.png"))
        print("[+] Mobile Step 1: Dashboard captured")
        time.sleep(1)
        
        # Step 2: Point to '+ طلب جديد' button with zoom effect
        print("[-] Pointing to 'طلب جديد' button...")
        new_order_btn = page.locator("button:has-text('طلب جديد')")
        point_and_click(page, new_order_btn, text="الخطوة 1: الضغط على زر طلب جديد لفتح نافذة المبيعات", delay=1.5)
        
        # Re-inject overlay script if modal rendered
        page.evaluate(INJECTED_OVERLAY_SCRIPT)
        time.sleep(1)
        
        # Screenshot 2: Create Modal
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step2_modal.png"))
        print("[+] Mobile Step 2: Modal captured")
        time.sleep(1)
        
        # Step 3: Enter Customer Name
        print("[-] Filling customer name...")
        name_input = page.locator("input[placeholder*='الاسم الثلاثي']")
        point_and_type(page, name_input, "أحمد عبد الله الترهوني", banner_text="الخطوة 2: إدخال اسم العميل بالكامل")
        time.sleep(0.8)
        
        # Step 4: Enter Primary Phone
        print("[-] Filling primary phone...")
        phone_input = page.locator("input[placeholder*='الرقم الرئيسي']")
        point_and_type(page, phone_input, "0912345678", banner_text="الخطوة 3: إدخال رقم الهاتف الرئيسي للعميل")
        time.sleep(0.8)
        
        # Step 5: Add Secondary Phone
        print("[-] Adding extra phone...")
        add_phone_btn = page.locator("button[title*='إضافة رقم هاتف']")
        if add_phone_btn.is_visible():
            point_and_click(page, add_phone_btn, text="إضافة رقم هاتف احتياطي آخر للتواصل", delay=0.8)
            second_phone = page.locator("input[placeholder*='رقم إضافي مساعد 02']")
            if second_phone.is_visible():
                point_and_type(page, second_phone, "0925556677", banner_text="كتابة رقم الهاتف الإضافي")
                time.sleep(0.8)
                
        # Screenshot 3: Customer Details
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step3_customer_info.png"))
        print("[+] Mobile Step 3: Customer info captured")
        time.sleep(1)
        
        # Step 6: Shipping details - Select City and Area
        print("[-] Selecting City and Area...")
        selects = page.locator("select").all()
        if len(selects) >= 1:
            page.evaluate("(t) => window.__setTutorialText(t)", "الخطوة 4: اختيار مدينة التوصيل المدعومة (طرابلس)")
            selects[0].scroll_into_view_if_needed()
            time.sleep(0.5)
            box = selects[0].bounding_box()
            if box:
                page.evaluate("window.__zoomElement(document.querySelectorAll('select')[0])")
                time.sleep(0.6)
                page.evaluate(f"window.__clickEffectAt({box['x']+box['width']/2}, {box['y']+box['height']/2})")
                try:
                    selects[0].select_option(label="طرابلس")
                except Exception:
                    pass
                time.sleep(0.4)
                page.evaluate("window.__clearZoom()")
            time.sleep(0.8)
            
        if len(selects) >= 2:
            page.evaluate("(t) => window.__setTutorialText(t)", "اختيار المنطقة التابعة للمدينة (بن عاشور)")
            selects[1].scroll_into_view_if_needed()
            time.sleep(0.5)
            box = selects[1].bounding_box()
            if box:
                page.evaluate("window.__zoomElement(document.querySelectorAll('select')[1])")
                time.sleep(0.6)
                page.evaluate(f"window.__clickEffectAt({box['x']+box['width']/2}, {box['y']+box['height']/2})")
                try:
                    selects[1].select_option(label="بن عاشور")
                except Exception:
                    pass
                time.sleep(0.4)
                page.evaluate("window.__clearZoom()")
            time.sleep(0.8)
            
        # Address input
        print("[-] Filling detailed address...")
        address_input = page.locator("input[placeholder*='جامع الصقع']")
        point_and_type(page, address_input, "شارع الجمهورية - بالقرب من جامع الصقع", banner_text="الخطوة 5: كتابة العنوان التفصيلي ونقطة دالة للمندوب")
        time.sleep(0.8)
        
        # Social media and notes
        social_input = page.locator("input[placeholder*='اسم المستخدم']")
        point_and_type(page, social_input, "Instagram @ahmed_libya", banner_text="تدوين حساب العميل على السوشيال ميديا")
        time.sleep(0.8)
        
        notes_input = page.locator("input[placeholder*='توقيت التسليم']")
        point_and_type(page, notes_input, "يرجى الاتصال قبل موعد التسليم بنصف ساعة", banner_text="إضافة ملاحظات خاصة لشركة التوصيل")
        time.sleep(1)
        
        # Screenshot 4: Shipping Info
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step4_shipping.png"))
        print("[+] Mobile Step 4: Shipping info captured")
        time.sleep(1)
        
        # Step 7: Products Selection
        print("[-] Expanding Products section...")
        prod_toggle = page.locator("button:has-text('المنتجات المطلوبة')")
        if prod_toggle.is_visible():
            if not page.locator("input[placeholder*='ابحث بالاسم أو الكود']").is_visible():
                point_and_click(page, prod_toggle, text="الخطوة 6: فتح قسم المنتجات المطلوبة", delay=1)
        
        # Expand first product accordion
        print("[-] Expanding product card...")
        prod_accordion = page.locator("div.border.border-slate-200.rounded-lg button").first
        if prod_accordion.is_visible():
            point_and_click(page, prod_accordion, text="اختيار الموديل واستعراض المقاسات والألوان المتوفرة بالمخزن", delay=1.2)
            
        # Tap on '+ إضافة' on size
        print("[-] Adding size variant...")
        add_variant_btn = page.locator("button:has-text('+ إضافة')").first
        if add_variant_btn.is_visible():
            point_and_click(page, add_variant_btn, text="إضافة المقاس المطلوب إلى سلة الطلب", delay=1.2)
            
        # Adjust quantity with +
        print("[-] Increasing quantity...")
        plus_btn = page.locator("div.bg-slate-50.rounded-xl button:has(svg.lucide-plus)").first
        if plus_btn.is_visible():
            point_and_click(page, plus_btn, text="زيادة الكمية المطلوبة (+)", delay=0.8)
            
        # Toggle 'يسمح الفتح' (allowInspection)
        insp_btn = page.locator("button:has-text('يسمح الفتح')").first
        if insp_btn.is_visible():
            point_and_click(page, insp_btn, text="تفعيل خاصية: يسمح بالفتح والمعاينة قبل الاستلام", delay=0.8)
            
        # Toggle 'يسمح القياس' (allowTesting)
        try_btn = page.locator("button:has-text('يسمح القياس')").first
        if try_btn.is_visible():
            point_and_click(page, try_btn, text="تفعيل خاصية: يسمح بالقياس والتجربة", delay=0.8)
            
        # Screenshot 5: Products and Permissions
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step5_products_and_options.png"))
        print("[+] Mobile Step 5: Products and options captured")
        time.sleep(1.5)
        
        # Step 8: Submit Order
        print("[-] Submitting order...")
        submit_btn = page.locator("button:has-text('تأكيد وإنشاء الطلب')")
        submit_btn.scroll_into_view_if_needed()
        time.sleep(0.5)
        point_and_click(page, submit_btn, text="الخطوة 7: مراجعة الإجمالي والضغط على تأكيد وإنشاء الطلب", delay=3.5)
        
        # Re-inject overlay
        page.evaluate(INJECTED_OVERLAY_SCRIPT)
        page.evaluate("(t) => window.__setTutorialText(t)", "تم إنشاء الطلب بنجاح وحجز المخزون فورياً!")
        time.sleep(1.5)
        
        # Screenshot 6: Order list on mobile
        page.screenshot(path=os.path.join(IMG_DIR, "mobile_step6_order_created.png"))
        print("[+] Mobile Step 6: Order created captured")
        time.sleep(1.5)
        
        # Step 9: Open Details Modal of newly created order
        print("[-] Opening Order Details...")
        first_order_card = page.locator("div.cursor-pointer:has-text('أحمد عبد الله الترهوني')").first
        if not first_order_card.is_visible():
            first_order_card = page.locator("div[class*='cursor-pointer']").first
            
        if first_order_card.is_visible():
            point_and_click(page, first_order_card, text="الخطوة 8: فتح بطاقة الطلب واستعراض التفاصيل والفاتورة", delay=2.5)
            page.evaluate(INJECTED_OVERLAY_SCRIPT)
            page.evaluate("(t) => window.__setTutorialText(t)", "تفاصيل الطلب: نسخ الأرقام بلمسة، طباعة الفاتورة، والإسناد للشحن")
            time.sleep(2)
            page.screenshot(path=os.path.join(IMG_DIR, "mobile_step7_order_details.png"))
            print("[+] Mobile Step 7: Order details captured")
            time.sleep(2.5)
            
        # Finish
        print("[-] Finalizing recording...")
        page.close()
        context.close()
        browser.close()
        
        # Copy to clean output file
        video_files = [f for f in os.listdir(VIDEO_DIR) if f.endswith(".webm")]
        if video_files:
            latest_vid = os.path.join(VIDEO_DIR, video_files[-1])
            final_mobile_video = os.path.join(VIDEO_DIR, "sales_order_mobile_tutorial.webm")
            if os.path.exists(final_mobile_video):
                try:
                    os.remove(final_mobile_video)
                except Exception:
                    pass
            shutil.copy2(latest_vid, final_mobile_video)
            print(f"[+] Final Mobile Video saved at: {final_mobile_video}")

if __name__ == "__main__":
    record()
