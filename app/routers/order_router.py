from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from typing import Optional, List
import json

# الاتصال بقاعدة البيانات والإعدادات الأساسية
from app.core.database import get_db, SessionLocal
from app.core.deps import get_current_user, get_current_active_user, RoleChecker
from app.core.websocket_manager import manager, ConnectionManager

# الموديلات والسكيمات
from app.models.user import User
from app.models.order import Order
from app.schemas.order_schema import (
    OrderCreate, OrderUpdate, OrderResponse, 
    OrderFullDetailResponse, DeliveryAssignRequest, QRScanRequest, QuickSaleRequest
)

# الخدمات (Services)
from app.routers.users import sync_dashboard_after_user_change
from app.services.audit_service import create_order_action_log
from app.services.order_service import (
    create_new_order_logic,
    quick_sale_logic,
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
    """بث إشعار خفيف فقط بدلاً من تشغيل 5 استعلامات ثقيلة في كل عملية"""
    try:
        await manager.broadcast({"event": "inventory_updated", "ts": __import__('time').time()})
    except Exception as e:
        print(f"WS Notify Error: {e}")


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


@router.post("/quick-sale")
def quick_sale(
    sale_in: QuickSaleRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user)
):
    items_list = [item.dict() for item in sale_in.items]
    res = quick_sale_logic(db, sale_in.customer_name, items_list, current_user.id,
                           customer_phone=sale_in.customer_phone)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return res



@router.get("/")
def read_orders(
    db: Session = Depends(get_db), 
    skip: int = 0, 
    limit: int = 50, 
    status: Optional[str] = None, 
    search: Optional[str] = None
):
    orders = get_orders_comprehensive_logic(
        db=db, 
        skip=skip, 
        limit=limit, 
        status=status, 
        search=search
    )
    return orders


@router.post("/{order_id}/scan")
def scan_order_item(
    order_id: int,
    request: QRScanRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = process_qr_scan_logic(db=db, order_id=order_id, user_id=current_user.id, qr_code=request.qr_code, variant_id=request.variant_id)
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
def mark_damaged(
    qr_code: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user = Depends(get_current_user),
    note: str = "توالف مخزنية"
):
    # متزامنة عن قصد (def وليس async def):
    # process_damage_logic تنفّذ استعلامات متزامنة وتأخذ أقفال صفوف
    # (SELECT ... FOR UPDATE). حين كانت async def كانت تعمل على حلقة الأحداث،
    # فيتجمّد الخادم بأكمله وهو ينتظر قفلاً يحمله طلب آخر — وهذا هو السبب
    # المباشر لتعليق واجهة المبيعات عند تنفيذ عمليات متزامنة من عدة مستخدمين.
    # كـ def تُنفَّذ في thread pool فلا تحجب أحداً.
    result = process_damage_logic(db, qr_code, current_user.id, note)
    
    async def notify_ws():
        # لا نحسب الإحصائيات إن لم يكن هناك مستمع، ولا نحسبها على حلقة الأحداث.
        # كذلك نستخدم جلسة مستقلة: جلسة الطلب تُغلق قبل تشغيل مهام الخلفية.
        from app.core.websocket_manager import manager
        if not manager.has_connections:
            return
        try:
            from app.services.order_service import get_inventory_dashboard_stats
            from fastapi.concurrency import run_in_threadpool

            def _compute():
                s = SessionLocal()
                try:
                    return get_inventory_dashboard_stats(s)
                finally:
                    s.close()

            stats = await run_in_threadpool(_compute)
            await manager.broadcast(stats)
        except Exception as e:
            print(f"WS Sync Error: {e}")

    background_tasks.add_task(notify_ws)
    return result


@router.get("/{order_id}/details")
def get_order_details(order_id: int, db: Session = Depends(get_db)):
    details = get_order_full_details_logic(db, order_id)
    if not details:
        raise HTTPException(status_code=404, detail="الطلب غير موجود")
    return details


@router.put("/{order_id}/update", response_model=OrderResponse)
def update_order(
    order_id: int, 
    order_in: OrderUpdate,
    background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    update_data = order_in.dict(exclude_unset=True)
    order = update_order_master_logic(db=db, order_id=order_id, update_data=update_data, user_id=current_user.id)
    background_tasks.add_task(sync_dashboard_after_user_change)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return order


@router.post("/{order_id}/assign-delivery", response_model=OrderResponse)
def assign_delivery(
    order_id: int, 
    delivery_data: DeliveryAssignRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user = Depends(get_current_user)
):
    order = assign_delivery_logic(db=db, order_id=order_id, delivery_data=delivery_data, user_id=current_user.id)
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return order


@router.delete("/{order_id}/delete")
def delete_order(
    order_id: int, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):
    result = delete_order_logic(db=db, order_id=order_id, user_id=current_user.id)
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
            # (أُزيلت طباعة تشخيصية كانت تُنفَّذ مع كل طلب لوحة تحكم)
            return {
                "status": "success",
                "data": stats
            }
    except Exception as e:
        import traceback
        print("Router Alert Error:")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500, 
            detail=f"Error calculating stats: {str(e)}"
        )
        

# =====================================================================
# تنظيف الطلبات المكتملة (للأدمن فقط)
# =====================================================================
# "المكتملة" = الحالة النهائية shipped فقط، أي البضاعة خرجت وسُلّمت.
# الهدف: عدم الاحتفاظ ببيانات لم تعد لازمة.
#
# ما يُحذف: الطلب + عناصره + سجل أفعاله + حركات المخزون المرتبطة به.
# ما لا يُمس إطلاقاً:
#   • كميات المخزون (البضاعة بيعت فعلاً فلا تُعاد للرصيد)
#   • بيانات المنتجات — إجمالياتها تُحسب من أعمدة المتغيرات لا من الحركات
#   • بيانات الموظفين
#   • التقارير — لا تقرأ إلا حركات return و damage، وهذه لا تُحذف
COMPLETED_STATUSES = ["shipped"]


def _completed_orders_query(db: Session):
    return db.query(Order).filter(
        Order.status.in_(COMPLETED_STATUSES),
        Order.deleted_at.is_(None),
    )


@router.get("/completed/purge-preview")
def preview_completed_purge(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1])),   # الأدمن فقط
):
    """معاينة ما سيُحذف قبل التنفيذ — لا تُعدّل شيئاً."""
    from app.models.order import OrderItem
    from app.models.inventory import InventoryMovement

    orders = _completed_orders_query(db).all()
    ids = [o.id for o in orders]
    if not ids:
        return {"orders": 0, "items": 0, "movements": 0, "total_value": 0.0}

    items = db.query(func.count(OrderItem.id)).filter(OrderItem.order_id.in_(ids)).scalar() or 0
    movements = db.query(func.count(InventoryMovement.id)).filter(
        InventoryMovement.related_order_id.in_(ids)
    ).scalar() or 0
    total_value = sum(float(o.total_price or 0) for o in orders)

    return {
        "orders": len(ids),
        "items": int(items),
        "movements": int(movements),
        "total_value": round(total_value, 2),
        "statuses": COMPLETED_STATUSES,
    }


@router.delete("/completed/purge")
def purge_completed_orders(
    db: Session = Depends(get_db),
    current_user: User = Depends(RoleChecker([1])),   # الأدمن فقط
):
    """حذف نهائي للطلبات المكتملة وحركات مخزونها. لا يمكن التراجع."""
    from app.models.order import OrderItem, OrderAction
    from app.models.inventory import InventoryMovement
    from app.services.audit_service import create_system_audit_log

    orders = _completed_orders_query(db).all()
    ids = [o.id for o in orders]
    if not ids:
        return {"status": "success", "message": "لا توجد طلبات مكتملة للحذف",
                "deleted_orders": 0, "deleted_movements": 0}

    total_value = sum(float(o.total_price or 0) for o in orders)

    try:
        # الترتيب مهم: الأبناء قبل الآباء احتراماً للمفاتيح الأجنبية
        deleted_movements = db.query(InventoryMovement).filter(
            InventoryMovement.related_order_id.in_(ids)
        ).delete(synchronize_session=False)

        db.query(OrderAction).filter(OrderAction.order_id.in_(ids)).delete(synchronize_session=False)
        deleted_items = db.query(OrderItem).filter(OrderItem.order_id.in_(ids)).delete(synchronize_session=False)
        deleted_orders = db.query(Order).filter(Order.id.in_(ids)).delete(synchronize_session=False)

        # أثر رقابي للعملية نفسها (لا يُحذف مع الطلبات)
        create_system_audit_log(
            db=db,
            user_id=current_user.id,
            action_target="orders",
            target_id=0,
            action_type="purge_completed_orders",
            details={
                "deleted_orders": deleted_orders,
                "deleted_items": deleted_items,
                "deleted_movements": deleted_movements,
                "total_value": round(total_value, 2),
                "statuses": COMPLETED_STATUSES,
            },
        )
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"فشل حذف الطلبات المكتملة: {str(e)}")

    return {
        "status": "success",
        "message": f"تم حذف {deleted_orders} طلباً مكتملاً و{deleted_movements} حركة مخزون مرتبطة بها",
        "deleted_orders": deleted_orders,
        "deleted_items": deleted_items,
        "deleted_movements": deleted_movements,
    }


@router.get("/orders/{order_id}/invoice")
def get_order_invoice(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    order_data = get_order_full_details_logic(db, order_id)
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
def get_all_products_with_variants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = get_products_with_variants_logic(db=db)
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "حدث خطأ داخلي أثناء معالجة بيانات المخزون")
        )
    return result   


@router.get("/inventory-analytics/top-bottom")
def get_inventory_top_bottom_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    result = get_top_and_bottom_inventory_report_logic(db=db)
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