from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.core.websocket_manager import manager
from fastapi.responses import StreamingResponse
from app.core.database import get_db

from typing import List
import json
from app.models.user import User
from app.core.deps import get_current_active_user
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.order import Order
from app.schemas.order_schema import (
    OrderCreate, OrderUpdate, OrderResponse, 
    OrderFullDetailResponse, DeliveryAssignRequest, QRScanRequest
)
from app.services.order_service import (
    create_new_order_logic, update_order_master_logic, delete_order_logic, 
    get_orders_comprehensive_logic, process_qr_scan_logic, 
    assign_delivery_logic, standalone_return_logic, process_damage_logic,get_order_full_details_logic,
    get_inventory_dashboard_stats,OrderInvoiceService
)

router = APIRouter(tags=["Orders"])

@router.post("/create", response_model=OrderResponse)
def create_order(order_in: OrderCreate, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    # تم ربط user_id بالتوكن بدلاً من الرقم الثابت 1
    return create_new_order_logic(db=db, order_data=order_in, user_id=current_user.id)

@router.get("/")
async def read_orders(
    db: Session = Depends(get_db), 
    skip: int = 0, 
    limit: int = 50, 
    status: Optional[str] = None, 
    search: Optional[str] = None
):
    # 1. يجب إضافة كلمة await هنا لأن الدالة async
    # وبدونها سيعتبر 파يثون أن 'orders' هو مجرد كائن coroutine وليس قائمة
    orders = await get_orders_comprehensive_logic(
        db=db, 
        skip=skip, 
        limit=limit, 
        status=status, 
        search=search
    )
    
    # الآن 'orders' أصبحت قائمة (List) فعلياً ويمكنك عمل loop عليها أو إرجاعها
    return orders


# عمليات الـ QR والخدمات المتقدمة
@router.post("/{order_id}/scan")
async def scan_order_item(order_id: int,
 request: QRScanRequest,
  db: Session = Depends(get_db),
  current_user: User = Depends(get_current_active_user)
  ):
    # أضفنا await قبل الدالة و async قبل def
    return await process_qr_scan_logic(
    db=db, 
    order_id=order_id, 
    user_id=current_user.id, # لاحظ هنا مررنا employee_id كـ user_id
    qr_code=request.qr_code
    )  

    
@router.post("/return-item-by-qr")
def return_item(qr_code: str, db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return standalone_return_logic(db, qr_code, current_user.id)

@router.post("/mark-as-damaged")
def mark_damaged(qr_code: str, note: str = "توالف مخزنية", db: Session = Depends(get_db), current_user = Depends(get_current_user)):
    return process_damage_logic(db, qr_code, current_user.id, note)



@router.get("/{order_id}/details")
async def get_order_details(order_id: int, db: Session = Depends(get_db)):
    details = await get_order_full_details_logic(db, order_id)
    if not details:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return details


# تعديل سطر الـ Import ليطابق الاسم الجديد
from app.services.order_service import update_order_master_logic 

@router.put("/{order_id}/update", response_model=OrderResponse)
async def update_order(
    order_id: int, 
    order_in: OrderUpdate, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """تعديل بيانات الطلب"""
    # تحويل الـ Pydantic model إلى Dictionary قبل تمريره
    update_data = order_in.dict(exclude_unset=True)
    
    # استدعاء الدالة بالاسم الصحيح
    return await update_order_master_logic(
        db=db, 
        order_id=order_id, 
        update_data=update_data, 
        user_id=current_user.id
    )


@router.post("/{order_id}/assign-delivery", response_model=OrderResponse)
async def assign_delivery(
    order_id: int, 
    delivery_data: DeliveryAssignRequest, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """إسناد الطلب لشركة شحن وتغيير حالته إلى مشحون"""
    return await assign_delivery_logic(db=db, order_id=order_id, delivery_data=delivery_data, user_id=current_user.id)

@router.delete("/{order_id}/delete")
async def delete_order(
    order_id: int, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    """حذف الطلب نهائياً (يفضل أن تكون بصلاحيات أدمن فقط)"""
    return await delete_order_logic(db=db, order_id=order_id)


@router.websocket("/ws/inventory-stats")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(get_db)):
    await manager.connect(websocket)
    
    # عند أول اتصال، نرسل البيانات الحالية فوراً
    initial_stats = get_inventory_dashboard_stats(db)
    await websocket.send_json(initial_stats)
    
    try:
        while True:
            # نبقي الاتصال مفتوحاً للاستماع لأي رسائل (اختياري)
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@router.get("/inventory-stats/test", tags=["Testing"])
def test_inventory_stats(db: Session = Depends(get_db)):
    """
    نقطة نهاية للاختبار فقط: تقوم بإرجاع إحصائيات المخزن الحالية 
    نفس البيانات التي يرسلها الـ WebSocket
    """
    try:
        stats = get_inventory_dashboard_stats(db)
        return {
            "status": "success",
            "data": stats
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error calculating stats: {str(e)}"
        )

@router.get("/orders/{order_id}/invoice")
async def get_order_invoice(order_id: int, db: Session = Depends(get_db)):
    # 1. جلب البيانات من الدالة القوية التي صنعناها سابقاً
    order_data = await get_order_full_details_logic(db, order_id)
    if not order_data:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # 2. توليد الـ PDF
    pdf_buffer = OrderInvoiceService.generate_order_pdf(order_data)
    
    # 3. إرجاع الملف للتحميل
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{order_id}.pdf"}
    )