import os
import sys
import requests

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

from app.core.database import SessionLocal
from app.models.inventory import Product, ProductColor, ProductVariant, Size, InventoryMovement
from app.models.order import Order, OrderItem
from app.models.user import User
from app.core.security import create_access_token

BASE_URL = "http://localhost:8000"

# 1. Setup Admin Auth Token
with SessionLocal() as db:
    admin = db.query(User).filter(User.is_active == True).first()
    token = create_access_token(data={"sub": str(admin.id)})
    
    variant = db.query(ProductVariant).filter(
        ProductVariant.deleted_at.is_(None),
        ProductVariant.quantity_available > 5
    ).first()
    variant_id = variant.id
    product = db.query(Product).filter(Product.id == variant.product_id).first()
    p_code = product.code if product else "PRD"
    initial_qr = variant.qr_code
    initial_avail = variant.quantity_available
    initial_sold = variant.total_sold or 0
    initial_damaged = variant.damaged_quantity or 0
    initial_returned = variant.returned_quantity or 0

headers = {"Authorization": f"Bearer {token}"}

print(f"[*] Testing as Admin User ID: {admin.id}")
print(f"[*] Selected Variant ID: {variant_id}, SKU: {p_code}, QR: {initial_qr}")
print(f"[*] Initial Stock - Avail: {initial_avail}, Sold: {initial_sold}, Damaged: {initial_damaged}, Returned: {initial_returned}")

# --- Test 1: Resolve Scanned Code in various formats ---
print("\n=== TEST 1: Scan Code Resolution ===")
formats_to_test = [
    f"VAR:{variant_id}|SKU:{p_code}",
    str(variant_id),
]
if initial_qr:
    formats_to_test.append(initial_qr)

for code_fmt in formats_to_test:
    res = requests.get(f"{BASE_URL}/inventory/scan/resolve?code={code_fmt}", headers=headers)
    print(f"Resolve Code '{code_fmt}': Status {res.status_code}")
    assert res.status_code == 200
    data = res.json()
    print(f"  -> Resolved Variant ID: {data['variant_id']}, Name: {data['product_name']}, Qty: {data['quantity_available']}")
    assert data['variant_id'] == variant_id

# --- Test 2: Direct Sale (البيع المباشر) ---
print("\n=== TEST 2: Direct Sale via QR ===")
target_code = f"VAR:{variant_id}|SKU:{p_code}"
sale_res = requests.post(
    f"{BASE_URL}/inventory/direct-sale-by-qr?qr_code={target_code}&note=تجربة بيع مباشر&customer_phone=0912345678",
    headers=headers
)
print(f"Direct Sale Status: {sale_res.status_code}")
print(f"Direct Sale Response: {sale_res.json()}")
assert sale_res.status_code == 200
assert sale_res.json()["status"] == "success"
assert sale_res.json()["new_quantity"] == initial_avail - 1

with SessionLocal() as db:
    v_db = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    print(f"DB Stock after Direct Sale: Avail={v_db.quantity_available} (was {initial_avail}), Sold={v_db.total_sold} (was {initial_sold})")
    assert v_db.quantity_available == initial_avail - 1
    assert v_db.total_sold == initial_sold + 1

# --- Test 3: Damage Recording (التوالف) ---
print("\n=== TEST 3: Damaged Item via QR ===")
avail_before_damage = initial_avail - 1
dam_res = requests.post(
    f"{BASE_URL}/orders/mark-as-damaged?qr_code={target_code}&note=تجربة تسجيل تالف",
    headers=headers
)
print(f"Damage Status: {dam_res.status_code}")
print(f"Damage Response: {dam_res.json()}")
assert dam_res.status_code == 200
assert dam_res.json()["status"] == "success"

with SessionLocal() as db:
    v_db = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    print(f"DB Stock after Damage: Avail={v_db.quantity_available} (was {avail_before_damage}), Damaged={v_db.damaged_quantity}")
    assert v_db.quantity_available == avail_before_damage - 1

# --- Test 4: Return Recording (الرواجع) ---
print("\n=== TEST 4: Return Item via QR ===")
avail_before_return = avail_before_damage - 1
sold_before_return = initial_sold + 1
ret_res = requests.post(
    f"{BASE_URL}/orders/return-item-by-qr?qr_code={target_code}&note=تجربة تسجيل مرتجع",
    headers=headers
)
print(f"Return Status: {ret_res.status_code}")
print(f"Return Response: {ret_res.json()}")
assert ret_res.status_code == 200
assert ret_res.json()["status"] == "success"

with SessionLocal() as db:
    v_db = db.query(ProductVariant).filter(ProductVariant.id == variant_id).first()
    print(f"DB Stock after Return: Avail={v_db.quantity_available} (was {avail_before_return}), Sold={v_db.total_sold} (was {sold_before_return})")
    assert v_db.quantity_available == avail_before_return + 1
    assert v_db.total_sold == sold_before_return - 1

# --- Test 5: Check Inventory Movements Ledger ---
print("\n=== TEST 5: Inventory Movements Ledger ===")
ledger_res = requests.get(f"{BASE_URL}/inventory/ledger?variant_id={variant_id}&limit=5", headers=headers)
print(f"Ledger Status: {ledger_res.status_code}")
assert ledger_res.status_code == 200
movements = ledger_res.json().get("data", [])
print(f"Found {len(movements)} recent movements for this variant:")
for mv in movements[:3]:
    print(f" - ID={mv.get('id')}, Type={mv.get('movement_type')}, Change={mv.get('quantity_change')}, Notes={mv.get('notes')}")

# --- Test 6: Invalid Scan Edge Cases ---
print("\n=== TEST 6: Invalid QR Code Handling ===")
invalid_res = requests.get(f"{BASE_URL}/inventory/scan/resolve?code=NON_EXISTENT_QR_99999", headers=headers)
print(f"Invalid Code Status: {invalid_res.status_code} (Expected: 404)")
assert invalid_res.status_code == 404

print("\n🎉 ALL QR SCAN TESTS PASSED SUCCESSFULLY!")
