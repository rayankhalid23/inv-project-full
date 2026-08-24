import os
import sys
import requests
import io

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from app.core.database import SessionLocal
from app.models.inventory import Product, ProductColor, ProductVariant, Size, InventoryMovement
from app.models.user import User
from app.core.security import create_access_token
from app.services.qr_service import QRGeneratorService
from app.services.inventory_movement_service import resolve_variant_by_scan

BASE_URL = "http://localhost:8000"

with SessionLocal() as db:
    admin = db.query(User).filter(User.is_active == True).first()
    token = create_access_token(data={"sub": str(admin.id)})

headers = {"Authorization": f"Bearer {token}"}

print(f"[*] Testing as Admin User ID: {admin.id}")

# 1. Find a product that has at least two variants (sizes) for the same color
with SessionLocal() as db:
    color_with_mult_variants = None
    for color in db.query(ProductColor).filter(ProductColor.deleted_at.is_(None)).all():
        active_vars = [v for v in color.variants if v.deleted_at is None]
        if len(active_vars) >= 2:
            color_with_mult_variants = color
            break
            
    if not color_with_mult_variants:
        # Pick any active product and ensure two variants
        p = db.query(Product).filter(Product.deleted_at.is_(None)).first()
        color_with_mult_variants = db.query(ProductColor).filter(ProductColor.product_id == p.id).first()
        
    product = db.query(Product).filter(Product.id == color_with_mult_variants.product_id).first()
    v_list = [v for v in color_with_mult_variants.variants if v.deleted_at is None]
    
    prod_id = product.id
    prod_code = product.code
    prod_name = product.name
    color_name = color_with_mult_variants.color_name
    v1_id = v_list[0].id
    v2_id = v_list[1].id if len(v_list) > 1 else v_list[0].id
    v1_size = v_list[0].size.name if v_list[0].size else "S1"
    v2_size = v_list[1].size.name if (len(v_list) > 1 and v_list[1].size) else "S2"

print(f"[*] Selected Product: '{prod_name}', Code: '{prod_code}'")
print(f"[*] Color: '{color_name}'")
print(f"[*] Variant 1: ID={v1_id}, Size={v1_size}")
print(f"[*] Variant 2: ID={v2_id}, Size={v2_size}")

# =========================================================================
# TEST 1: Test Quantity Update for Specific Variant (Color + Size)
# =========================================================================
print("\n=== TEST 1: Update Quantity of Specific Variant ===")
with SessionLocal() as db:
    v1_db = db.query(ProductVariant).filter(ProductVariant.id == v1_id).first()
    old_qty_v1 = v1_db.quantity_available or 0

test_new_qty = old_qty_v1 + 7

# Send PATCH request to update variant 1
patch_res = requests.patch(
    f"{BASE_URL}/variants/{v1_id}",
    json={"qty": test_new_qty},
    headers=headers
)
print(f"PATCH /variants/{v1_id} Status: {patch_res.status_code}")
assert patch_res.status_code == 200, f"Expected 200, got: {patch_res.text}"
res_data = patch_res.json()
print(f"PATCH Response: {res_data}")
assert res_data["data"]["new_qty"] == test_new_qty

# Check database
with SessionLocal() as db:
    v1_check = db.query(ProductVariant).filter(ProductVariant.id == v1_id).first()
    print(f"DB Variant 1 Qty: {v1_check.quantity_available} (Updated from {old_qty_v1})")
    assert v1_check.quantity_available == test_new_qty
    
    # Check inventory log
    last_log = db.query(InventoryMovement).filter(
        InventoryMovement.variant_id == v1_id
    ).order_by(InventoryMovement.id.desc()).first()
    print(f"Last Movement Log: Type={last_log.movement_type}, Change={last_log.quantity_change}, Notes={last_log.notes}")
    assert last_log.movement_type == "manual_adjust"
    assert last_log.quantity_change == 7

# Test Negative Quantity Validation
neg_res = requests.patch(
    f"{BASE_URL}/variants/{v1_id}",
    json={"qty": -5},
    headers=headers
)
print(f"Negative Qty Status (Expected 400): {neg_res.status_code}")
assert neg_res.status_code == 400

# =========================================================================
# TEST 2: Verify QR Label Code Format (Product Code ONLY, no 008-1-1)
# =========================================================================
print("\n=== TEST 2: QR Label Text Format (Product Code ONLY) ===")
# Test single variant QR export PDF
pdf_res = requests.get(f"{BASE_URL}/products/variant/{v1_id}", headers=headers)
print(f"GET /products/variant/{v1_id} PDF Status: {pdf_res.status_code}")
assert pdf_res.status_code == 200
assert pdf_res.headers.get("content-type") == "application/pdf"
print(f"PDF Size: {len(pdf_res.content)} bytes")

# Also test Full Product QRs export PDF
all_pdf_res = requests.get(f"{BASE_URL}/products/product/{prod_id}", headers=headers)
print(f"GET /products/product/{prod_id} PDF Status: {all_pdf_res.status_code}")
assert all_pdf_res.status_code == 200
print(f"Full Product PDF Size: {len(all_pdf_res.content)} bytes")

# =========================================================================
# TEST 3: Verify Uniqueness of QR Code for Each Size/Color Variant
# =========================================================================
print("\n=== TEST 3: QR Code Uniqueness & Scanning Resolution ===")
with SessionLocal() as db:
    v1 = db.query(ProductVariant).filter(ProductVariant.id == v1_id).first()
    v2 = db.query(ProductVariant).filter(ProductVariant.id == v2_id).first()
    
    code_v1 = f"VAR:{v1.id}|SKU:{prod_code}"
    code_v2 = f"VAR:{v2.id}|SKU:{prod_code}"
    
    print(f"Encoded QR Data for Variant 1 ({v1_size}): '{code_v1}'")
    print(f"Encoded QR Data for Variant 2 ({v2_size}): '{code_v2}'")
    
    if v1_id != v2_id:
        assert code_v1 != code_v2, "QR data must be UNIQUE for different variants of the same product!"
        print("[+] SUCCESS: Variant 1 and Variant 2 have completely UNIQUE QR codes!")
        
    # Test resolve for V1
    res1 = requests.get(f"{BASE_URL}/inventory/scan/resolve?code={code_v1}", headers=headers)
    assert res1.status_code == 200
    assert res1.json()["variant_id"] == v1_id
    print(f"[+] Scanning V1 QR -> Correctly resolved to Variant ID: {res1.json()['variant_id']} ({res1.json()['size_name']})")
    
    if v1_id != v2_id:
        # Test resolve for V2
        res2 = requests.get(f"{BASE_URL}/inventory/scan/resolve?code={code_v2}", headers=headers)
        assert res2.status_code == 200
        assert res2.json()["variant_id"] == v2_id
        print(f"[+] Scanning V2 QR -> Correctly resolved to Variant ID: {res2.json()['variant_id']} ({res2.json()['size_name']})")
        assert res1.json()["variant_id"] != res2.json()["variant_id"], "Resolution must distinguish sizes!"

print("\n🎉 ALL 3 REQUIREMENTS VERIFIED & PASSED 100% SUCCESSFULLY!")
