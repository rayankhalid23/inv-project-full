from fastapi import APIRouter, Depends
from app.services.order_service import process_qr_scan_logic, assign_delivery_logic,standalone_return_logic,process_damage_logic
from app.schemas.order_schema import DeliveryAssignRequest, QRScanRequest
from sqlalchemy.orm import Session
from app.services.order_service import standalone_return_logic
# أضف هذا السطر في الأعلى مع الاستيرادات

from app.core.database import get_db
# في ملف app/routers/order_router.py
from app.models.order import Order, OrderItem, OrderAction
from typing import List, Optional
import json
from app.core.deps import get_current_user
# الاستيرادات الخاصة بالمشروع
from app.schemas.order_schema import OrderCreate, OrderUpdate, OrderResponse, OrderFullDetailResponse
from app.services.order_service import (
    create_new_order_logic, 
    update_order_logic, 
    delete_order_logic, 
    get_orders_comprehensive_logic
)

router = APIRouter(prefix="/orders", tags=["Orders"])

@router.post("/create")
def create_order(order_in: OrderCreate, db: Session = Depends(get_db)):
    # ملاحظة: سنستخدم user_id = 1 مؤقتاً لحين ربط نظام تسجيل الدخول
    return create_new_order_logic(db=db, order_data=order_in, user_id=1)

@router.put("/{order_id}", response_model=OrderResponse)
def update_order(order_id: int, order_data: OrderUpdate, db: Session = Depends(get_db)):
    user_id_temp = 1
    return update_order_logic(db, order_id, order_data, user_id_temp)

@router.delete("/{order_id}")
def delete_order(order_id: int, db: Session = Depends(get_db)):
    # استخدمنا 1 كمثال لـ user_id حتى تجهز نظام الحماية
    return delete_order_logic(db, order_id, user_id=1)

@router.get("/", response_model=List[OrderFullDetailResponse])
def list_orders(skip: int = 0, limit: int = 50, status: str = None, db: Session = Depends(get_db)):
    orders = get_orders_comprehensive_logic(db, skip, limit, status)
    
    result = []
    for order in orders:
        items_detail = []
        for item in order.items:
            # 1. تحديد الصورة (من اللون أو المنتج الأساسي)
            image_url = None
            if item.variant and item.variant.color:
                image_url = item.variant.color.color_image or (
                    item.variant.color.product.main_image if item.variant.color.product else None
                )
            
            # 2. بناء قائمة العناصر (تطابق تام مع الـ Schema)
            items_detail.append({
                "id": item.id,
                "product_name": item.variant.color.product.name if item.variant and item.variant.color and item.variant.color.product else "Unknown",
                "variant_id": item.variant_id,
                "quantity": item.quantity,
                "price_at_order": item.price_at_order,
                "image_url": image_url,
                "color_name": item.variant.color.color_name if item.variant and item.variant.color else None,
                "size": item.variant.size.name if item.variant and item.variant.size else None
            })
        
        # 3. معالجة حقل الهواتف لضمان أنه List (حل مشكلة Input should be a valid list)
        phones = order.customer_phones
        if phones is None:
            phones = []
        elif isinstance(phones, str):
            try:
                phones = json.loads(phones)
            except:
                phones = [phones]
        
        # 4. بناء كائن الطلب النهائي
        result.append({
            "id": order.id,
            "customer_name": order.customer_name,
            "customer_phones": phones,
            "address": order.address,
            "total_price": order.total_price,
            "status": order.status,
            "created_at": order.created_at,
            "items": items_detail
        })
        
    return result



# 1. نقطة نهاية مسح QR
@router.post("/{order_id}/scan")
def scan_order_item(order_id: int, request: QRScanRequest, db: Session = Depends(get_db)):
    # ملاحظة: employee_id يتم أخذه حالياً من الـ request 
    return process_qr_scan_logic(db, order_id, request.qr_code, request.employee_id)

# 2. نقطة نهاية تعيين التوصيل
@router.post("/{order_id}/assign-delivery")
def assign_delivery(order_id: int, data: DeliveryAssignRequest, db: Session = Depends(get_db)):
    user_id_temp = 1 # موظف النظام
    return assign_delivery_logic(db, order_id, data, user_id_temp)

# 3. عرض واصل الطلب (فاتورة)
@router.get("/{order_id}/invoice")
def get_order_invoice(order_id: int, db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    
    # هنا نقوم بتجهيز البيانات بصيغة بسيطة للطباعة
    items_summary = []
    for item in order.items:
        items_summary.append({
            "product": item.variant.color.product.name,
            "size": item.variant.size.name,
            "qty": item.quantity,
            "price": float(item.price_at_order),
            "subtotal": float(item.quantity * item.price_at_order)
        })
        
    return {
        "invoice_no": order.id,
        "customer": order.customer_name,
        "phones": order.customer_phones,
        "address": order.address,
        "status": order.status,
        "items": items_summary,
        "total": float(order.total_price),
        "date": order.created_at
    }

@router.post("/return-item-by-qr")
def return_item(qr_code: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # جلب user_id من التوكن
    return standalone_return_logic(db, qr_code, current_user.id)



@router.post("/mark-as-damaged")
def mark_damaged(
    qr_code: str, 
    note: str = "توالف مخزنية",
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    return process_damage_logic(db, qr_code, current_user.id, note)
