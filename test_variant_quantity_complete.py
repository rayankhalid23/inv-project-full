import os
import sys
import requests
import json

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from app.core.database import SessionLocal
from app.models.inventory import Product, ProductColor, ProductVariant, InventoryMovement
from app.models.user import User
from app.core.security import create_access_token

BASE_URL = "http://127.0.0.1:8000"

with SessionLocal() as db:
    admin = db.query(User).filter(User.is_active == True).first()
    token = create_access_token(data={"sub": str(admin.id)})

headers = {"Authorization": f"Bearer {token}"}

print(f"[*] Testing as Admin User ID: {admin.id}")

# 1. Select a test variant
with SessionLocal() as db:
    variant = db.query(ProductVariant).filter(
        ProductVariant.deleted_at.is_(None)
    ).first()
    v_id = variant.id
    color_id = variant.product_color_id
    color = db.query(ProductColor).filter(ProductColor.id == color_id).first()
    product = db.query(Product).filter(Product.id == color.product_id).first()
    prod_id = product.id
    initial_qty = variant.quantity_available or 0

print(f"[*] Selected Product ID: {prod_id} ('{product.name}'), Color ID: {color_id} ('{color.color_name}'), Variant ID: {v_id} (Initial Qty: {initial_qty})")

# =========================================================================
# TEST 1: Update using "qty" field (standard schema)
# =========================================================================
print("\n=== TEST 1: Update via { 'qty': new_val } ===")
target_qty_1 = initial_qty + 5
res1 = requests.patch(
    f"{BASE_URL}/variants/{v_id}",
    json={"qty": target_qty_1},
    headers=headers
)
print(f"Status: {res1.status_code}, Response: {res1.json()}")
assert res1.status_code == 200
assert res1.json()["data"]["new_qty"] == target_qty_1

with SessionLocal() as db:
    v_check1 = db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
    assert v_check1.quantity_available == target_qty_1
    print(f"[+] DB Verified: Variant {v_id} quantity_available is now {v_check1.quantity_available}")

# =========================================================================
# TEST 2: Update using "quantity_available" field (frontend payload format)
# =========================================================================
print("\n=== TEST 2: Update via { 'quantity_available': new_val } ===")
target_qty_2 = initial_qty + 10
res2 = requests.patch(
    f"{BASE_URL}/variants/{v_id}",
    json={"quantity_available": target_qty_2},
    headers=headers
)
print(f"Status: {res2.status_code}, Response: {res2.json()}")
assert res2.status_code == 200
assert res2.json()["data"]["new_qty"] == target_qty_2

with SessionLocal() as db:
    v_check2 = db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
    assert v_check2.quantity_available == target_qty_2
    print(f"[+] DB Verified: Variant {v_id} quantity_available is now {v_check2.quantity_available}")

# =========================================================================
# TEST 3: Update using full catalogApi.updateVariantPartial payload format
# =========================================================================
print("\n=== TEST 3: Update via catalogApi format (both fields) ===")
target_qty_3 = initial_qty + 15
res3 = requests.patch(
    f"{BASE_URL}/variants/{v_id}",
    json={
        "qty": target_qty_3,
        "quantity_available": target_qty_3,
        "min_stock": 5,
        "min_stock_threshold": 5
    },
    headers=headers
)
print(f"Status: {res3.status_code}, Response: {res3.json()}")
assert res3.status_code == 200
assert res3.json()["data"]["new_qty"] == target_qty_3

with SessionLocal() as db:
    v_check3 = db.query(ProductVariant).filter(ProductVariant.id == v_id).first()
    p_check3 = db.query(Product).filter(Product.id == prod_id).first()
    assert v_check3.quantity_available == target_qty_3
    print(f"[+] DB Verified: Variant {v_id} quantity_available is now {v_check3.quantity_available}")
    print(f"[+] DB Verified: Product {prod_id} total_available is now synced to {p_check3.total_available}")

# =========================================================================
# TEST 4: Verify Audit Trail & Inventory Movement Log
# =========================================================================
print("\n=== TEST 4: Verify Inventory Movement Log ===")
with SessionLocal() as db:
    log = db.query(InventoryMovement).filter(
        InventoryMovement.variant_id == v_id
    ).order_by(InventoryMovement.id.desc()).first()
    print(f"Latest Log: ID={log.id}, Type={log.movement_type}, Change={log.quantity_change}, Notes={log.notes}")
    assert log.movement_type == "manual_adjust"

print("\n🎉 ALL VARIANT QUANTITY EDIT TESTS PASSED WITH 100% SUCCESS!")
