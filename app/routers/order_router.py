from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
import json

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.order import Order
from app.schemas.order_schema import (
    OrderCreate, OrderUpdate, OrderResponse, 
    OrderFullDetailResponse, DeliveryAssignRequest, QRScanRequest
)
from app.services.order_service import (
    create_new_order_logic, update_order_logic, delete_order_logic, 
    get_orders_comprehensive_logic, process_qr_scan_logic, 
    assign_delivery_logic, standalone_return_logic, process_damage_logic
)

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("/create", response_model=OrderResponse)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # تم ربط user_id بالتوكن بدلاً من الرقم الثابت 1
    return create_new_order_logic(db=db, order_data=order_in, user_id=current_user.id)

@router.get("/", response_model=List[OrderFullDetailResponse])
def list_orders(skip: int = 0, limit: int = 50, status: str = None, db: Session = Depends(get_db)):
    orders = get_orders_comprehensive_logic(db, skip, limit, status)
    result = []
    for order in orders:
        # معالجة الهواتف لضمان عدم حدوث خطأ في الـ Schema (Pydantic validation)
        phones = order.customer_phones
        if isinstance(phones, str):
            try: phones = json.loads(phones)
            except: phones = [phones]
        
        # بناء قائمة العناصر مع الصور (المنطق الذكي للصورة)
        items_detail = []
        for item in order.items:
            img = None
            if item.variant and item.variant.color:
                img = item.variant.color.color_image or (item.variant.color.product.main_image if item.variant.color.product else None)
            
            items_detail.append({
                "id": item.id,
                "product_name": item.variant.color.product.name if item.variant and item.variant.color and item.variant.color.product else "Unknown",
                "variant_id": item.variant_id,
                "quantity": item.quantity,
                "price_at_order": item.price_at_order,
                "image_url": img,
                "color_name": item.variant.color.color_name if item.variant and item.variant.color else None,
                "size": item.variant.size.name if item.variant and item.variant.size else None
            })

        result.append({
            "id": order.id,
            "customer_name": order.customer_name,
            "customer_phones": phones or [],
            "address": order.address,
            "total_price": order.total_price,
            "status": order.status,
            "created_at": order.created_at,
            "items": items_detail
        })
    return result

# عمليات الـ QR والخدمات المتقدمة
@router.post("/{order_id}/scan")
def scan_order_item(order_id: int, request: QRScanRequest, db: Session = Depends(get_db)):
    return process_qr_scan_logic(db, order_id, request.qr_code, request.employee_id)

@router.post("/return-item-by-qr")
def return_item(qr_code: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return standalone_return_logic(db, qr_code, current_user.id)

@router.post("/mark-as-damaged")
def mark_damaged(qr_code: str, note: str = "توالف مخزنية", db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return process_damage_logic(db, qr_code, current_user.id, note)