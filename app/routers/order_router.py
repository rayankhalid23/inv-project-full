from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from app.core.websocket_manager import manager
from fastapi.responses import StreamingResponse
from app.core.database import get_db
from app.services.order_service import get_inventory_dashboard_stats
from app.core.websocket_manager import ConnectionManager
from typing import List
from app.services.audit_service import create_order_action_log
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
def create_order(
    order_in: OrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)):
    # 1. تنفيذ منطق السيرفس (الذي نظفناه أعلاه)
    new_order = create_new_order_logic(db, order_in , current_user.id)
    
    # 2. إرسال التحديث للوحة التحكم في الخلفية (الحل السحري)
    async def notify_dashboard():
        try:
        
            # جلب الإحصائيات الجديدة وبثها
            new_stats = get_inventory_dashboard_stats(db)
            await manager.broadcast(new_stats)
        except Exception as e:
            print(f"WebSocket Notification Failed: {e}")

    background_tasks.add_task(notify_dashboard)

    return new_order


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
   background_tasks: BackgroundTasks,
   db: Session = Depends(get_db),
   current_user: User = Depends(get_current_active_user)
  ):
   
    result = await process_qr_scan_logic(db=db, order_id=order_id, user_id=current_user.id, qr_code=request.qr_code)
    #background_tasks.add_task(sync_dashboard, db) # أضفنا المزامنة هنا
    return result

    
@router.post("/return-item-by-qr")
def return_item(
    qr_code: str,
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)):
# 1. تنفيذ منطق المرتجع في القاعدة
    result = standalone_return_logic(db, qr_code, current_user.id)
    
    # 2. مهمة المزامنة الخلفية
    async def notify_ws():
        try:
          
            stats = get_inventory_dashboard_stats(db)
            await manager.broadcast(stats)
        except Exception as e:
            print(f"Return Sync Error: {e}")

    background_tasks.add_task(notify_ws)
    return result

@router.post("/mark-as-damaged")
async def mark_damaged(
    qr_code: str, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user),
    note: str = "توالف مخزنية"
):
    # 1. تنفيذ منطق القاعدة (سريع ومباشر)
    result = process_damage_logic(db, qr_code, current_user.id, note)
    
    # 2. تحديث الشاشة عبر الـ WebSocket في الخلفية
    # هذا السطر يحل مشكلة الـ Event Loop لأنه يعمل في السياق الصحيح
    async def notify_ws():
        try:
            from app.services.inventory_movement_service import get_inventory_dashboard_stats
            from app.core.config import manager
            stats = get_inventory_dashboard_stats(db)
            await manager.broadcast(stats)
        except Exception as e:
            print(f"WS Sync Error: {e}")

    background_tasks.add_task(notify_ws)
    
    return result


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
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    update_data = order_in.dict(exclude_unset=True)
    order = await update_order_master_logic(db=db, order_id=order_id, update_data=update_data, user_id=current_user.id)
   # background_tasks.add_task(sync_dashboard, db) # أضفنا المزامنة هنا
    return order


@router.post("/{order_id}/assign-delivery", response_model=OrderResponse)
async def assign_delivery(
    order_id: int, 
    delivery_data: DeliveryAssignRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):# 1. تنفيذ الإسناد
    order = await assign_delivery_logic(db=db, order_id=order_id, delivery_data=delivery_data, user_id=current_user.id)
    
    # 2. تحديث اللوحة
    async def notify_ws():
        try:
            from app.core.config import manager
            # بث رسالة بسيطة لتحديث عداد الشحنات
            await manager.broadcast({"event": "ORDER_SHIPPED", "order_id": order_id})
        except: pass

    background_tasks.add_task(notify_ws)
    return order

@router.delete("/{order_id}/delete")
async def delete_order(
    order_id: int, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):# 1. تنفيذ الحذف
    result = await delete_order_logic(db=db, order_id=order_id)
    
    # 2. تحديث اللوحة لأن المخزون المحجوز سيعود للأصل
    async def notify_ws():
        try:
            from app.services.inventory_movement_service import get_inventory_dashboard_stats
            from app.core.config import manager
            stats = get_inventory_dashboard_stats(db)
            await manager.broadcast(stats)
        except Exception as e:
            print(f"Delete Sync Error: {e}")

    background_tasks.add_task(notify_ws)
    return result

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
async def get_order_invoice(order_id: int, db: Session = Depends(get_db),current_user: User = Depends(get_current_user)):
    # 1. جلب البيانات من الدالة القوية التي صنعناها سابقاً
    order_data = await get_order_full_details_logic(db, order_id)
    if not order_data:
        raise HTTPException(status_code=404, detail="Order not found")
    

    create_order_action_log(
        db=db,
        order_id=order_id,
        user_id=current_user.id,
        action_type="invoice_downloaded",
        notes="تم تصدير فاتورة الطلب كملف PDF"
    )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error logging invoice generation: {e}")

    # 2. توليد الـ PDF
    pdf_buffer = OrderInvoiceService.generate_order_pdf(order_data)
    
    # 3. إرجاع الملف للتحميل
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{order_id}.pdf"}
    )