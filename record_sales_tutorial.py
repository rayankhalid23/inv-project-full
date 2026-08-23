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

def smooth_type(element, text, delay=0.06):
    element.click()
    time.sleep(0.2)
    for char in text:
        element.type(char, delay=int(delay * 1000))
        time.sleep(0.01)

def record():
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=["--font-render-hinting=none", "--force-color-profile=srgb"]
        )
        
        context = browser.new_context(
            viewport={"width": 1400, "height": 850},
            record_video_dir=VIDEO_DIR,
            record_video_size={"width": 1400, "height": 850},
            locale="ar-LY",
            timezone_id="Africa/Tripoli"
        )
        
        page = context.new_page()
        
        # Inject auth token into localStorage before page load
        page.goto("http://localhost:5173")
        page.evaluate(f"""() => {{
            localStorage.setItem('token', '{token}');
            localStorage.setItem('user', JSON.stringify({user_dict}));
        }}""")
        
        print("[-] Loading Sales Dashboard...")
        page.goto("http://localhost:5173/sales")
        page.wait_for_load_state("networkidle")
        time.sleep(2.5)
        
        # Step 1: Capture Sales Dashboard
        page.screenshot(path=os.path.join(IMG_DIR, "step1_sales_dashboard.png"))
        print("[+] Step 1: Sales Dashboard screenshot saved")
        time.sleep(1.5)
        
        # Step 2: Open Create Order Modal
        print("[-] Opening Create Order Modal (clicking 'طلب جديد')...")
        new_order_btn = page.locator("button:has-text('طلب جديد')")
        new_order_btn.click()
        time.sleep(2)
        
        page.screenshot(path=os.path.join(IMG_DIR, "step2_open_create_modal.png"))
        print("[+] Step 2: Create Modal screenshot saved")
        time.sleep(1)
        
        # Step 3: Enter Customer Name and Phones
        print("[-] Filling customer information...")
        name_input = page.locator("input[placeholder*='الاسم الثلاثي']")
        smooth_type(name_input, "أحمد عبد الله الترهوني")
        time.sleep(0.8)
        
        phone_input = page.locator("input[placeholder*='الرقم الرئيسي']")
        smooth_type(phone_input, "0912345678")
        time.sleep(0.8)
        
        # Click add extra phone
        add_phone_btn = page.locator("button[title*='إضافة رقم هاتف']")
        if add_phone_btn.is_visible():
            add_phone_btn.click()
            time.sleep(0.8)
            second_phone = page.locator("input[placeholder*='رقم إضافي مساعد 02']")
            if second_phone.is_visible():
                smooth_type(second_phone, "0925556677")
                time.sleep(0.8)
        
        page.screenshot(path=os.path.join(IMG_DIR, "step3_customer_info.png"))
        print("[+] Step 3: Customer Info screenshot saved")
        time.sleep(1)
        
        # Step 4: Choose Shipping Details (City, Area, Address, Service)
        print("[-] Selecting City, Area and Address...")
        # City select is the first select in shipping section
        selects = page.locator("select").all()
        if len(selects) >= 1:
            try:
                selects[0].select_option(label="طرابلس")
            except Exception:
                pass
        time.sleep(0.8)
        
        if len(selects) >= 2:
            try:
                selects[1].select_option(label="بن عاشور")
            except Exception:
                pass
        time.sleep(0.8)
        
        address_input = page.locator("input[placeholder*='جامع الصقع']")
        smooth_type(address_input, "شارع الجمهورية - بالقرب من جامع الصقع")
        time.sleep(0.8)
        
        # Fill Social media source and notes
        social_input = page.locator("input[placeholder*='اسم المستخدم']")
        smooth_type(social_input, "Instagram @ahmed_tarhuni")
        time.sleep(0.8)
        
        notes_input = page.locator("input[placeholder*='توقيت التسليم']")
        smooth_type(notes_input, "يرجى الاتصال قبل موعد التسليم بنصف ساعة")
        time.sleep(1)
        
        page.screenshot(path=os.path.join(IMG_DIR, "step4_shipping_details.png"))
        print("[+] Step 4: Shipping details screenshot saved")
        time.sleep(1)
        
        # Step 5: Add Products from Product Picker
        print("[-] Expanding Products section...")
        # If product section is collapsed, click it
        prod_toggle = page.locator("button:has-text('المنتجات المطلوبة')")
        if prod_toggle.is_visible():
            # Check if product picker is visible
            if not page.locator("input[placeholder*='ابحث بالاسم أو الكود']").is_visible():
                prod_toggle.click()
                time.sleep(1)
        
        # In ProductPicker, find the first product accordion header and click it
        print("[-] Expanding first product in picker...")
        prod_accordion = page.locator("div.border.border-slate-200.rounded-lg button").first
        if prod_accordion.is_visible():
            prod_accordion.click()
            time.sleep(1.2)
        
        # Click '+ إضافة' on the first available variant
        print("[-] Adding variant to order...")
        add_variant_btn = page.locator("button:has-text('+ إضافة')").first
        if add_variant_btn.is_visible():
            add_variant_btn.click()
            time.sleep(1.2)
        
        # Try adding second variant or second product if available
        second_add = page.locator("button:has-text('+ إضافة')").all()
        if len(second_add) > 1:
            second_add[1].click()
            time.sleep(1)
        
        # In selected products section, increase quantity of the first product
        print("[-] Adjusting product quantity and permissions...")
        plus_btn = page.locator("div.bg-slate-50.rounded-xl button:has(svg.lucide-plus)").first
        if plus_btn.is_visible():
            plus_btn.click()
            time.sleep(0.8)
        
        # Toggle 'يسمح الفتح' and 'يسمح القياس'
        insp_btn = page.locator("button:has-text('يسمح الفتح')").first
        if insp_btn.is_visible():
            insp_btn.click()
            time.sleep(0.6)
            
        try_btn = page.locator("button:has-text('يسمح القياس')").first
        if try_btn.is_visible():
            try_btn.click()
            time.sleep(0.6)
        
        page.screenshot(path=os.path.join(IMG_DIR, "step5_products_added.png"))
        print("[+] Step 5: Products added screenshot saved")
        time.sleep(2)
        
        # Step 6: Submit Order
        print("[-] Submitting Order (clicking 'تأكيد وإنشاء الطلب')...")
        submit_btn = page.locator("button:has-text('تأكيد وإنشاء الطلب')")
        submit_btn.click()
        time.sleep(3.5)
        
        page.screenshot(path=os.path.join(IMG_DIR, "step6_order_created_list.png"))
        print("[+] Step 6: Order created and listed screenshot saved")
        time.sleep(2)
        
        # Step 7: Open Order Details Modal of the Newly Created Order
        print("[-] Opening Order Details Modal of new order...")
        first_order_card = page.locator("div.cursor-pointer:has-text('أحمد عبد الله الترهوني')").first
        if not first_order_card.is_visible():
            first_order_card = page.locator("div[class*='cursor-pointer']").first
            
        if first_order_card.is_visible():
            first_order_card.click()
            time.sleep(2.5)
            page.screenshot(path=os.path.join(IMG_DIR, "step7_order_details_modal.png"))
            print("[+] Step 7: Order details modal screenshot saved")
            time.sleep(3)
        
        # Finish recording
        print("[-] Finalizing video recording...")
        page.close()
        context.close()
        browser.close()
        
        # Copy the recorded video to standard tutorial filename
        video_files = [f for f in os.listdir(VIDEO_DIR) if f.endswith(".webm")]
        if video_files:
            latest_vid = os.path.join(VIDEO_DIR, video_files[-1])
            final_video_path = os.path.join(VIDEO_DIR, "sales_order_creation_tutorial.webm")
            if os.path.exists(final_video_path):
                try:
                    os.remove(final_video_path)
                except Exception:
                    pass
            shutil.copy2(latest_vid, final_video_path)
            print(f"[+] Final Video saved at: {final_video_path}")

if __name__ == "__main__":
    record()
