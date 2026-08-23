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
PROJECT_DIR = r"c:\Users\HP\Desktop\inv-project-full"

os.makedirs(VIDEO_DIR, exist_ok=True)

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

# JS Helper for Smooth Cursor & Visual Touch Interaction
INJECTED_MOBILE_CURSOR_SCRIPT = """
(() => {
    if (window.__smoothCursorInjected) return;
    window.__smoothCursorInjected = true;

    const style = document.createElement('style');
    style.innerHTML = `
        /* Sleek Mobile Touch Pointer */
        #mobile-touch-pointer {
            position: fixed;
            width: 38px;
            height: 38px;
            z-index: 9999999;
            pointer-events: none;
            transition: left 0.45s cubic-bezier(0.22, 1, 0.36, 1), top 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform 0.25s ease;
            transform: translate(-10px, -10px);
            filter: drop-shadow(0 4px 10px rgba(0,0,0,0.45));
        }
        #mobile-touch-pointer svg {
            width: 100%;
            height: 100%;
            fill: #800000;
            stroke: #ffffff;
            stroke-width: 2.2px;
        }

        /* Touch Circle Indicator */
        .touch-circle-tap {
            position: fixed;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: rgba(128, 0, 0, 0.35);
            border: 2px solid #ffffff;
            pointer-events: none;
            z-index: 9999998;
            transform: translate(-50%, -50%) scale(0.2);
            animation: touchTapWave 0.55s ease-out forwards;
        }
        @keyframes touchTapWave {
            0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
            100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
        }

        /* Focused Element Glow */
        .mobile-element-focused {
            transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.35s ease !important;
            transform: scale(1.04) !important;
            box-shadow: 0 0 0 3.5px rgba(128, 0, 0, 0.4), 0 8px 20px rgba(128, 0, 0, 0.2) !important;
            z-index: 9999 !important;
        }

        /* Floating Info Badge */
        #mobile-step-pill {
            position: fixed;
            bottom: 22px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(15, 23, 42, 0.92);
            backdrop-filter: blur(8px);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.18);
            padding: 8px 16px;
            border-radius: 9999px;
            font-family: system-ui, -apple-system, sans-serif;
            font-size: 11.5px;
            font-weight: 700;
            z-index: 99999999;
            box-shadow: 0 8px 20px -4px rgba(0, 0, 0, 0.4);
            display: flex;
            align-items: center;
            gap: 8px;
            direction: rtl;
            pointer-events: none;
            transition: all 0.3s ease;
            max-width: 92%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #mobile-step-pill .pulse-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #ef4444;
            box-shadow: 0 0 8px #ef4444;
            animation: pulsePill 1.2s infinite;
            shrink-0: 0;
        }
        @keyframes pulsePill {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.7); }
        }
    `;
    document.head.appendChild(style);

    const pointer = document.createElement('div');
    pointer.id = 'mobile-touch-pointer';
    pointer.innerHTML = `
        <svg viewBox="0 0 24 24">
            <path d="M4 2l16 11-7.5 1.5L16 22l-3.5 1.5-3.5-7.5L4 21V2z"/>
        </svg>
    `;
    pointer.style.left = '-100px';
    pointer.style.top = '-100px';
    document.body.appendChild(pointer);

    const pill = document.createElement('div');
    pill.id = 'mobile-step-pill';
    pill.innerHTML = `<span class="pulse-dot"></span><span id="mobile-step-pill-text">إدارة المبيعات — هاتف محمول</span>`;
    document.body.appendChild(pill);

    window.__movePointer = (x, y) => {
        pointer.style.left = x + 'px';
        pointer.style.top = y + 'px';
    };

    window.__tapEffect = (x, y) => {
        const tap = document.createElement('div');
        tap.className = 'touch-circle-tap';
        tap.style.left = x + 'px';
        tap.style.top = y + 'px';
        document.body.appendChild(tap);
        setTimeout(() => tap.remove(), 600);

        pointer.style.transform = 'translate(-10px, -10px) scale(0.8)';
        setTimeout(() => { pointer.style.transform = 'translate(-10px, -10px) scale(1)'; }, 140);
    };

    window.__setStepText = (txt) => {
        const t = document.getElementById('mobile-step-pill-text');
        if (t) t.innerText = txt;
    };

    let activeGlow = null;
    window.__glowElement = (el) => {
        if (activeGlow) { activeGlow.classList.remove('mobile-element-focused'); }
        if (el) {
            el.classList.add('mobile-element-focused');
            activeGlow = el;
            const r = el.getBoundingClientRect();
            window.__movePointer(r.left + r.width / 2, r.top + r.height / 2);
        }
    };

    window.__clearGlow = () => {
        if (activeGlow) {
            activeGlow.classList.remove('mobile-element-focused');
            activeGlow = null;
        }
    };
})();
"""

def live_tap(page, locator, text="", wait_after=0.6):
    if text:
        page.evaluate("(t) => window.__setStepText(t)", text)
    
    locator.scroll_into_view_if_needed()
    time.sleep(0.2)
    
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        
        page.evaluate(f"""() => {{
            const el = document.elementFromPoint({cx}, {cy});
            if (el) {{
                const target = el.closest('button, input, select, div.cursor-pointer') || el;
                window.__glowElement(target);
            }} else {{
                window.__movePointer({cx}, {cy});
            }}
        }}""")
        time.sleep(0.45)
        
        page.evaluate(f"window.__tapEffect({cx}, {cy})")
        time.sleep(0.12)
        locator.click()
        time.sleep(0.2)
        page.evaluate("window.__clearGlow()")
    else:
        locator.click()
        
    time.sleep(wait_after)

def live_type(page, locator, text_to_type, step_text="", delay=0.04):
    if step_text:
        page.evaluate("(t) => window.__setStepText(t)", step_text)
        
    locator.scroll_into_view_if_needed()
    time.sleep(0.2)
    box = locator.bounding_box()
    if box:
        cx = box["x"] + box["width"] / 2
        cy = box["y"] + box["height"] / 2
        page.evaluate(f"""() => {{
            const el = document.elementFromPoint({cx}, {cy});
            if (el) {{
                const target = el.closest('input, select, textarea') || el;
                window.__glowElement(target);
            }} else {{
                window.__movePointer({cx}, {cy});
            }}
        }}""")
        time.sleep(0.4)
        page.evaluate(f"window.__tapEffect({cx}, {cy})")
        locator.click()
    
    for char in text_to_type:
        locator.type(char, delay=int(delay * 1000))
        time.sleep(0.01)
        
    time.sleep(0.3)
    page.evaluate("window.__clearGlow()")
    time.sleep(0.2)

def main():
    print("[*] Starting Playwright live mobile video recording...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--font-render-hinting=none", "--force-color-profile=srgb"]
        )
        
        # Crisp iPhone 14 / 15 Pro mobile dimensions (430 x 932)
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
        
        print("[*] Navigating to Sales Page on mobile...")
        page.goto("http://localhost:5173/sales")
        page.wait_for_load_state("networkidle")
        time.sleep(2)
        
        # Inject our visual overlay
        page.evaluate(INJECTED_MOBILE_CURSOR_SCRIPT)
        time.sleep(0.5)
        page.evaluate("(t) => window.__setStepText(t)", "لوحة المبيعات — هاتف محمول")
        time.sleep(1.5)
        
        # Step 1: Click 'طلب جديد'
        print("[*] Tapping 'طلب جديد'...")
        new_order_btn = page.locator("button:has-text('طلب جديد')")
        live_tap(page, new_order_btn, text="1. الضغط على زر 'طلب جديد' لفتح نافذة المبيعات", wait_after=1.2)
        
        # Re-inject overlay in modal
        page.evaluate(INJECTED_MOBILE_CURSOR_SCRIPT)
        time.sleep(0.6)
        
        # Step 2: Customer Name
        print("[*] Entering customer name...")
        name_input = page.locator("input[placeholder*='الاسم الثلاثي']")
        live_type(page, name_input, "أحمد عبد الله الترهوني", step_text="2. إدخال اسم العميل بالكامل")
        time.sleep(0.5)
        
        # Step 3: Customer Phone 1
        print("[*] Entering primary phone...")
        phone_input = page.locator("input[placeholder*='الرقم الرئيسي']")
        live_type(page, phone_input, "0912345678", step_text="3. إدخال رقم الهاتف الرئيسي للعميل")
        time.sleep(0.5)
        
        # Step 4: Add Secondary Phone
        print("[*] Adding secondary phone...")
        add_phone_btn = page.locator("button[title*='إضافة رقم هاتف']")
        if add_phone_btn.is_visible():
            live_tap(page, add_phone_btn, text="إضافة رقم هاتف احتياطي آخر للتواصل", wait_after=0.6)
            second_phone = page.locator("input[placeholder*='رقم إضافي مساعد 02']")
            if second_phone.is_visible():
                live_type(page, second_phone, "0925556677", step_text="كتابة رقم الهاتف الإضافي")
                time.sleep(0.5)
                
        # Step 5: Shipping Details - City and Area
        print("[*] Selecting Tripoli / Ben Ashour...")
        selects = page.locator("select").all()
        if len(selects) >= 1:
            page.evaluate("(t) => window.__setStepText(t)", "4. اختيار مدينة التوصيل (طرابلس)")
            selects[0].scroll_into_view_if_needed()
            time.sleep(0.3)
            box = selects[0].bounding_box()
            if box:
                page.evaluate("window.__glowElement(document.querySelectorAll('select')[0])")
                time.sleep(0.4)
                page.evaluate(f"window.__tapEffect({box['x']+box['width']/2}, {box['y']+box['height']/2})")
                try:
                    selects[0].select_option(label="طرابلس")
                except Exception:
                    pass
                time.sleep(0.3)
                page.evaluate("window.__clearGlow()")
            time.sleep(0.5)
            
        if len(selects) >= 2:
            page.evaluate("(t) => window.__setStepText(t)", "اختيار المنطقة (بن عاشور)")
            selects[1].scroll_into_view_if_needed()
            time.sleep(0.3)
            box = selects[1].bounding_box()
            if box:
                page.evaluate("window.__glowElement(document.querySelectorAll('select')[1])")
                time.sleep(0.4)
                page.evaluate(f"window.__tapEffect({box['x']+box['width']/2}, {box['y']+box['height']/2})")
                try:
                    selects[1].select_option(label="بن عاشور")
                except Exception:
                    pass
                time.sleep(0.3)
                page.evaluate("window.__clearGlow()")
            time.sleep(0.5)
            
        # Step 6: Detailed address
        print("[*] Entering address...")
        address_input = page.locator("input[placeholder*='جامع الصقع']")
        live_type(page, address_input, "شارع الجمهورية - بالقرب من جامع الصقع", step_text="5. كتابة العنوان التفصيلي ونقطة دالة")
        time.sleep(0.5)
        
        # Social media and notes
        social_input = page.locator("input[placeholder*='اسم المستخدم']")
        live_type(page, social_input, "Instagram @ahmed_libya", step_text="تدوين حساب السوشيال ميديا")
        time.sleep(0.5)
        
        notes_input = page.locator("input[placeholder*='توقيت التسليم']")
        live_type(page, notes_input, "يرجى الاتصال قبل موعد التسليم بنصف ساعة", step_text="إضافة ملاحظات خاصة لشركة الشحن")
        time.sleep(0.8)
        
        # Step 7: Products Selection
        print("[*] Picking products...")
        prod_toggle = page.locator("button:has-text('المنتجات المطلوبة')")
        if prod_toggle.is_visible():
            if not page.locator("input[placeholder*='ابحث بالاسم أو الكود']").is_visible():
                live_tap(page, prod_toggle, text="6. فتح قائمة المنتجات المطلوبة", wait_after=0.8)
                
        # Expand first product accordion in picker
        prod_accordion = page.locator("div.border.border-slate-200.rounded-lg button").first
        if prod_accordion.is_visible():
            live_tap(page, prod_accordion, text="اختيار الموديل واستعراض المقاسات المتوفرة", wait_after=1.0)
            
        # Tap on '+ إضافة' for the size
        add_variant_btn = page.locator("button:has-text('+ إضافة')").first
        if add_variant_btn.is_visible():
            live_tap(page, add_variant_btn, text="إضافة المقاس المطلوب إلى سلة الطلب", wait_after=1.0)
            
        # Adjust quantity with +
        plus_btn = page.locator("div.bg-slate-50.rounded-xl button:has(svg.lucide-plus)").first
        if plus_btn.is_visible():
            live_tap(page, plus_btn, text="زيادة الكمية المطلوبة (+)", wait_after=0.6)
            
        # Toggle 'يسمح الفتح' (allowInspection)
        insp_btn = page.locator("button:has-text('يسمح الفتح')").first
        if insp_btn.is_visible():
            live_tap(page, insp_btn, text="تفعيل ميزة: يسمح بالفتح والمعاينة قبل الاستلام", wait_after=0.6)
            
        # Toggle 'يسمح القياس' (allowTesting)
        try_btn = page.locator("button:has-text('يسمح القياس')").first
        if try_btn.is_visible():
            live_tap(page, try_btn, text="تفعيل ميزة: يسمح بالقياس والتجربة", wait_after=0.6)
            
        time.sleep(1.0)
        
        # Step 8: Submit order
        print("[*] Submitting order...")
        submit_btn = page.locator("button:has-text('تأكيد وإنشاء الطلب')")
        submit_btn.scroll_into_view_if_needed()
        time.sleep(0.4)
        live_tap(page, submit_btn, text="7. مراجعة الإجمالي والضغط على 'تأكيد وإنشاء الطلب ✓'", wait_after=3.0)
        
        # Re-inject overlay on list
        page.evaluate(INJECTED_MOBILE_CURSOR_SCRIPT)
        page.evaluate("(t) => window.__setStepText(t)", "تم إنشاء الطلب وحجز المخزون فورياً! 🎉")
        time.sleep(1.5)
        
        # Step 9: Open Details Modal of created order
        print("[*] Opening details modal...")
        first_order_card = page.locator("div.cursor-pointer:has-text('أحمد عبد الله الترهوني')").first
        if not first_order_card.is_visible():
            first_order_card = page.locator("div[class*='cursor-pointer']").first
            
        if first_order_card.is_visible():
            live_tap(page, first_order_card, text="8. فتح بطاقة الطلب واستعراض تفاصيل العميل والفاتورة", wait_after=2.0)
            page.evaluate(INJECTED_MOBILE_CURSOR_SCRIPT)
            page.evaluate("(t) => window.__setStepText(t)", "تفاصيل الطلب: نسخ الأرقام بلمسة، إسناد الشحن، وطباعة الفاتورة")
            time.sleep(3.0)
            
        # Close & Save
        print("[*] Finalizing video...")
        page.close()
        context.close()
        browser.close()
        
        video_files = [f for f in os.listdir(VIDEO_DIR) if f.endswith(".webm")]
        if video_files:
            latest_vid = os.path.join(VIDEO_DIR, video_files[-1])
            final_mobile_video = os.path.join(VIDEO_DIR, "sales_order_mobile_tutorial.webm")
            final_project_copy = os.path.join(PROJECT_DIR, "sales_order_mobile_video.webm")
            
            shutil.copy2(latest_vid, final_mobile_video)
            shutil.copy2(latest_vid, final_project_copy)
            print(f"[+] Final Video saved at: {final_mobile_video}")
            print(f"[+] Project Video copy saved at: {final_project_copy}")

if __name__ == "__main__":
    main()
