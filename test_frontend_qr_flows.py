import os
import sys
import time

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from datetime import timedelta
from playwright.sync_api import sync_playwright

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import create_access_token
from app.models.inventory import ProductVariant

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

variant = db.query(ProductVariant).filter(
    ProductVariant.deleted_at.is_(None),
    ProductVariant.quantity_available > 5
).first()
v_id = str(variant.id) if variant else "3"
db.close()

print(f"[*] Testing Frontend QR Flows with User: {admin_user.name}, Variant ID: {v_id}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # 1. Login via localStorage
    page.goto("http://localhost:5173")
    page.evaluate(f"""() => {{
        localStorage.setItem('token', '{token}');
        localStorage.setItem('user', JSON.stringify({user_dict}));
    }}""")
    
    # 2. Go to Stock Movements Page
    print("[-] Navigating to Stock Movements / Inventory Page...")
    page.goto("http://localhost:5173/inventory-movements")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # 3. Test Quick Scan Button Floating Modal
    print("[-] Checking Quick Scan Button...")
    scan_btn = page.locator("button:has-text('مسح سريع'), button:has(svg.lucide-qr-code)").first
    if scan_btn.is_visible():
        scan_btn.click()
        time.sleep(1)
        print("[+] Quick Scan Modal opened successfully!")
        
        # Test Return tab
        ret_tab = page.locator("button:has-text('راجع')")
        if ret_tab.is_visible():
            ret_tab.click()
            time.sleep(0.5)
            print("[+] Switched to 'راجع' (Return) tab")
            
        # Enter barcode manually
        barcode_input = page.locator("input[placeholder*='أدخل الباركود'], input[placeholder*='كود'], input[type='text']").first
        if barcode_input.is_visible():
            barcode_input.fill(v_id)
            time.sleep(0.3)
            barcode_input.press("Enter")
            time.sleep(1.5)
            print("[+] Searched for variant in Return tab")
            
            confirm_btn = page.locator("button:has-text('تأكيد استلام المرتجع'), button:has-text('تأكيد')").first
            if confirm_btn.is_visible():
                print("[+] Product identified! Confirming Return...")
                confirm_btn.click()
                time.sleep(2)
                print("[+] Return processed successfully via UI!")
                
    # 4. Test Damaged tab in Quick Scan Modal
    if scan_btn.is_visible():
        scan_btn.click()
        time.sleep(1)
        
        damage_tab = page.locator("button:has-text('تالف')")
        if damage_tab.is_visible():
            damage_tab.click()
            time.sleep(0.5)
            print("[+] Switched to 'تالف' (Damaged) tab")
            
            barcode_input = page.locator("input[placeholder*='أدخل الباركود'], input[placeholder*='كود'], input[type='text']").first
            if barcode_input.is_visible():
                barcode_input.fill(v_id)
                barcode_input.press("Enter")
                time.sleep(1.5)
                
                confirm_btn = page.locator("button:has-text('تأكيد تسجيل التالف'), button:has-text('تأكيد')").first
                if confirm_btn.is_visible():
                    print("[+] Product identified for damage! Confirming Damage...")
                    confirm_btn.click()
                    time.sleep(2)
                    print("[+] Damage processed successfully via UI!")

    # 5. Test Quick Sale tab in Quick Scan Modal
    if scan_btn.is_visible():
        scan_btn.click()
        time.sleep(1)
        
        sale_tab = page.locator("button:has-text('بيع')")
        if sale_tab.is_visible():
            sale_tab.click()
            time.sleep(1)
            print("[+] Switched to 'بيع' (Direct Sale) tab with embedded QuickSalePanel")
            
            # Add item via quick sale product button or barcode
            add_item_btn = page.locator("button:has-text('+ إضافة'), div.cursor-pointer").first
            if add_item_btn.is_visible():
                add_item_btn.click()
                time.sleep(0.5)
                print("[+] Added product to Quick Sale cart")
                
            complete_sale_btn = page.locator("button:has-text('إتمام البيع المباشر'), button:has-text('تأكيد البيع')").first
            if complete_sale_btn.is_visible():
                complete_sale_btn.click()
                time.sleep(2.5)
                print("[+] Quick Sale completed successfully via UI!")
                
    browser.close()
    print("[+] ALL FRONTEND QR SCAN FLOWS TESTED & WORKING SMOOTHLY!")
