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
from app.models.inventory import Product, ProductColor, ProductVariant

db = SessionLocal()
admin_user = db.query(User).filter(User.is_active == True).first()
token = create_access_token(data={"sub": str(admin_user.id)}, expires_delta=timedelta(days=7))
user_dict = {
    "id": admin_user.id,
    "name": admin_user.name,
    "role_id": 1,
    "role": "Admin",
    "phone": admin_user.phone
}

target_var_id = 97
v_before = db.query(ProductVariant).filter(ProductVariant.id == target_var_id).first()
old_qty = v_before.quantity_available
target_new_qty = 85 if old_qty != 85 else 77
db.close()

print(f"[*] Testing UI Quantity Edit for Variant ID: {target_var_id}")
print(f"[*] Old Quantity: {old_qty} -> New Target Quantity: {target_new_qty}")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # 1. Login via localStorage
    page.goto("http://localhost:8000")
    page.evaluate(f"""() => {{
        localStorage.setItem('token', '{token}');
        localStorage.setItem('user', JSON.stringify({user_dict}));
        localStorage.setItem('role_id', '1');
    }}""")
    
    # 2. Go to Products Page
    print("[-] Navigating to Products Page...")
    page.goto("http://localhost:8000/products")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # 3. Click on the first catalog card
    print("[-] Clicking on Catalog card...")
    page.locator("div.cursor-pointer:has(svg.lucide-folder-open)").first.click()
    time.sleep(2.5)
    print("[+] Opened Catalog products view!")
    
    # 4. Click the three-dots menu on the first product card
    print("[-] Opening card options menu...")
    card_menu_btn = page.locator("button.p-2.hover\\:bg-slate-50").first
    card_menu_btn.click()
    time.sleep(0.8)
    
    edit_btn = page.locator("button:has-text('تعديل')").first
    if edit_btn.is_visible():
        print("[+] Clicking 'تعديل' button...")
        edit_btn.click()
        time.sleep(3) # Wait for getProductForEdit and Form reset
        
        # Find quantity inputs inside dialog
        qty_inputs = page.locator("input[name*='quantity']")
        print(f"[+] Found {qty_inputs.count()} quantity inputs in form dialog")
        if qty_inputs.count() > 0:
            qty_input = qty_inputs.first
            curr_val = qty_input.input_value()
            print(f"[+] Found Variant Quantity Input with current value '{curr_val}'. Changing to '{target_new_qty}'...")
            qty_input.fill("")
            qty_input.fill(str(target_new_qty))
            time.sleep(1)
            
            # Submit form
            save_btn = page.locator("button:has-text('حفظ التعديلات'), button:has-text('تحديث المنتج'), button[type='submit']").last
            if save_btn.is_visible():
                print("[+] Clicking Save Changes button...")
                save_btn.click()
                time.sleep(4)
                print("[+] Save submitted!")
    else:
        print("[-] 'تعديل' button was not visible in menu")
        
    browser.close()

# 5. Verify in Database
with SessionLocal() as db:
    v_updated = db.query(ProductVariant).filter(ProductVariant.id == target_var_id).first()
    p_updated = db.query(Product).filter(Product.id == 78).first()
    print(f"\n[*] DB Verification: Variant ID {target_var_id} quantity_available is now: {v_updated.quantity_available}")
    print(f"[*] Product 78 total_available is now: {p_updated.total_available}")
    if v_updated.quantity_available == target_new_qty:
        print(f"[+] 🎉 SUCCESS! Quantity successfully changed from {old_qty} to {v_updated.quantity_available} via UI!")
    else:
        print(f"[-] FAILED! Quantity is {v_updated.quantity_available}, expected {target_new_qty}")
