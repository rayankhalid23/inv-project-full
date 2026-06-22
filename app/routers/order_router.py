from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from typing import Optional, List
import json

# الاتصال بقاعدة البيانات والإعدادات الأساسية
from app.core.database import get_db, SessionLocal
from app.core.deps import get_current_user, get_current_active_user
from app.core.websocket_manager import manager, ConnectionManager

# الموديلات والسكيمات
from app.models.user import User
from app.models.order import Order
from app.schemas.order_schema import (
    OrderCreate, OrderUpdate, OrderResponse, 
    OrderFullDetailResponse, DeliveryAssignRequest, QRScanRequest
)

# الخدمات (Services)
from app.routers.users import sync_dashboard_after_user_change
from app.services.audit_service import create_order_action_log
from app.services.order_service import (
    create_new_order_logic,
    update_order_master_logic,
    delete_order_logic, 
    get_orders_comprehensive_logic,
    process_qr_scan_logic, 
    assign_delivery_logic, 
    standalone_return_logic,
    process_damage_logic,
    get_order_full_details_logic,
    get_inventory_dashboard_stats,
    OrderInvoiceService,
    get_products_with_variants_logic,
    get_top_and_bottom_inventory_report_logic
)

router = APIRouter(tags=["Orders"])


async def broadcast_inventory_update(db_session_factory, manager):
    """دالة موحدة لجلب الإحصائيات وبثها عبر الـ WebSocket"""
    try:
        with db_session_factory() as db:
            stats = get_inventory_dashboard_stats(db)
            await manager.broadcast(stats)
    except Exception as e:
        print(f"🔴 Synchronization Error: {e}")


@router.post("/create", response_model=OrderResponse)
def create_order(
    order_in: OrderCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    new_order = create_new_order_logic(db, order_in, current_user.id)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return new_order


@router.get("/")
async def read_orders(
    db: Session = Depends(get_db), 
    skip: int = 0, 
    limit: int = 50, 
    status: Optional[str] = None, 
    search: Optional[str] = None
):
    orders = await get_orders_comprehensive_logic(
        db=db, 
        skip=skip, 
        limit=limit, 
        status=status, 
        search=search
    )
    return orders


@router.post("/{order_id}/scan")
async def scan_order_item(
    order_id: int,
    request: QRScanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await process_qr_scan_logic(db=db, order_id=order_id, user_id=current_user.id, qr_code=request.qr_code, variant_id=request.variant_id)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return result

    
@router.post("/return-item-by-qr")
def return_item(
    qr_code: str,
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    result = standalone_return_logic(db, qr_code, current_user.id)
    background_tasks.add_task(sync_dashboard_after_user_change)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return result


@router.post("/mark-as-damaged")
async def mark_damaged(
    qr_code: str, 
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user),
    note: str = "توالف مخزنية"
):
    result = process_damage_logic(db, qr_code, current_user.id, note)
    
    async def notify_ws():
        try:
            from app.services.order_service import get_inventory_dashboard_stats
            from app.core.websocket_manager import manager
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
    background_tasks.add_task(sync_dashboard_after_user_change)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return order


@router.post("/{order_id}/assign-delivery", response_model=OrderResponse)
async def assign_delivery(
    order_id: int, 
    delivery_data: DeliveryAssignRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    order = await assign_delivery_logic(db=db, order_id=order_id, delivery_data=delivery_data, user_id=current_user.id)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return order


@router.delete("/{order_id}/delete")
async def delete_order(
    order_id: int, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    result = await delete_order_logic(db=db, order_id=order_id, user_id=current_user.id)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return result


@router.websocket("/ws/inventory-stats")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
    db: Session = Depends(get_db)
):
    await manager.connect(websocket, user_id)
    initial_stats = get_inventory_dashboard_stats(db)
    await websocket.send_json(initial_stats)
    
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
   

@router.get("/inventory-stats/test", tags=["Testing"])
def test_inventory_stats(period: str = "all"):
    try:
        with SessionLocal() as db:
            stats = get_inventory_dashboard_stats(db, period=period)
            print(f"🔮 DB Sync Success | Products Alert Count: {stats['alerts']['counters']['out_of_stock_products_count']}")
            print(f"🔮 DB Sync Success | Variants Alert Count: {stats['alerts']['counters']['out_of_stock_variants_count']}")
            return {
                "status": "success",
                "data": stats
            }
    except Exception as e:
        import traceback
        print("🔴 Router Alert Error:")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, 
            detail=f"Error calculating stats: {str(e)}"
        )
        

@router.get("/orders/{order_id}/invoice")
async def get_order_invoice(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
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

    pdf_buffer = OrderInvoiceService.generate_order_pdf(order_data)
    return StreamingResponse(
        pdf_buffer, 
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=invoice_{order_id}.pdf"}
    )


@router.get("/all-with-variants")
async def get_all_products_with_variants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await get_products_with_variants_logic(db=db)
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "حدث خطأ داخلي أثناء معالجة بيانات المخزون")
        )
    return result   


@router.get("/inventory-analytics/top-bottom")
async def get_inventory_top_bottom_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = await get_top_and_bottom_inventory_report_logic(db=db)
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "فشلت عملية جلب البيانات التحليلية من السيرفر")
        )
    return result


@router.get("/test-orders-only")
def test_orders_only(db: Session = Depends(get_db)):
    try:
        from sqlalchemy import func, case, String
        stats = db.query(
            func.count(Order.id).label("total"),
            func.sum(case((func.cast(Order.status, String) == 'pending', 1), else_=0)).label("pending")
        ).filter(Order.deleted_at.is_(None)).first()
        
        return {
            "total_orders_from_code": stats.total if stats else 0,
            "pending_orders_from_code": stats.pending if stats else 0
        }
    except Exception as e:
        import traceback
        return {"error_details": traceback.format_exc()}