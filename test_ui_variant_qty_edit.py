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
    "role_id": admin_user.role_id,
    "role": admin_user.role.name if admin_user.role else "Admin",
    "phone": admin_user.phone
}

# Find a product with variants
variant = db.query(ProductVariant).filter(
    ProductVariant.deleted_at.is_(None)
).first()
target_var_id = variant.id
color_id = variant.product_color_id
product = db.query(Product).join(ProductColor).filter(ProductColor.id == color_id).first()
prod_id = product.id
old_qty = variant.quantity_available or 0
db.close()

print(f"[*] Testing UI Quantity Edit for Product: {product.name} (ID: {prod_id}), Variant ID: {target_var_id} (Old Qty: {old_qty})")

target_new_qty = (old_qty + 12) if old_qty < 80 else 25

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    
    # 1. Login via localStorage
    page.goto("http://localhost:8000")
    page.evaluate(f"""() => {{
        localStorage.setItem('token', '{token}');
        localStorage.setItem('user', JSON.stringify({user_dict}));
    }}""")
    
    # 2. Go to Products Page
    print("[-] Navigating to Products Page...")
    page.goto("http://localhost:8000/products")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    # 3. Find and click Edit on our product card
    print(f"[-] Looking for Product ID {prod_id} card...")
    edit_btn = page.locator(f"button[title*='تعديل'], button:has-text('تعديل')").first
    if edit_btn.is_visible():
        edit_btn.click()
        time.sleep(2)
        print("[+] Clicked Edit on Product. Form dialog opened.")
        
        # 4. Find the quantity input for the variant
        qty_inputs = page.locator("input[type='number']")
        count = qty_inputs.count()
        print(f"[+] Found {count} number inputs in form.")
        
        # Locate the size quantity input
        for idx in range(count):
            inp = qty_inputs.nth(idx)
            val = inp.input_value()
            name_attr = inp.get_attribute("name") or ""
            placeholder = inp.get_attribute("placeholder") or ""
            print(f"  Input #{idx}: name='{name_attr}', val='{val}', placeholder='{placeholder}'")
            if "quantity" in name_attr or "الكمية" in placeholder:
                print(f"[+] Found Variant Quantity input #{idx}! Changing value from '{val}' to '{target_new_qty}'")
                inp.fill("")
                inp.fill(str(target_new_qty))
                break
                
        time.sleep(1)
        # 5. Click Save
        save_btn = page.locator("button:has-text('حفظ التعديلات'), button:has-text('تحديث المنتج')").first
        if save_btn.is_visible():
            print("[+] Clicking Save button...")
            save_btn.click()
            time.sleep(3)
            print("[+] Save submitted!")
            
    browser.close()

# 6. Verify directly in database
with SessionLocal() as db:
    v_updated = db.query(ProductVariant).filter(ProductVariant.id == target_var_id).first()
    print(f"\n[*] DB Check: Variant ID {target_var_id} quantity_available is now: {v_updated.quantity_available}")
    if v_updated.quantity_available == target_new_qty:
        print("[+] SUCCESS! The quantity in database changed successfully via UI form submission!")
    else:
        print(f"[-] Value was not updated to {target_new_qty}, current value: {v_updated.quantity_available}")
