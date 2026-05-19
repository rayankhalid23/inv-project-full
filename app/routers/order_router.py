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
    get_inventory_dashboard_stats,  # تمت إضافتها هنا لضمان وجودها
    OrderInvoiceService,get_products_with_variants_logic,get_top_and_bottom_inventory_report_logic
)

router = APIRouter(tags=["Orders"])



# أضف هذه الدالة في ملف خدمات أو أعلى الـ Router
async def broadcast_inventory_update(db_session_factory, manager):
    """دالة موحدة لجلب الإحصائيات وبثها"""
    try:
        # نفتح جلسة جديدة لضمان عدم تداخلها مع الجلسة المنتهية في الـ Request
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
    current_user = Depends(get_current_user)):
    # 1. تنفيذ منطق السيرفس (الذي نظفناه أعلاه)
    new_order = create_new_order_logic(db, order_in , current_user.id)
    
    # جلب الإحصائيات الجديدة وبثها
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
    background_tasks.add_task(sync_dashboard_after_user_change)
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
    background_tasks.add_task(sync_dashboard_after_user_change)
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
    background_tasks.add_task(sync_dashboard, SessionLocal, manager)
    return order

@router.delete("/{order_id}/delete")
async def delete_order(
    order_id: int, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_active_user)
):# 1. تنفيذ الحذف
    result = await delete_order_logic(db=db, order_id=order_id,user_id=current_user.id)
    
    # 2. تحديث اللوحة لأن المخزون المحجوز سيعود للأصل
    background_tasks.add_task(broadcast_inventory_update, SessionLocal, manager)
    return result

@router.websocket("/ws/inventory-stats")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: int,
    db: Session = Depends(get_db)):

    await manager.connect(websocket , user_id)
    
    
    initial_stats = get_inventory_dashboard_stats(db)
    await websocket.send_json(initial_stats)
    
    try:
        while True:
            await websocket.receive_text() # للحفاظ على الاتصال الحقيقي (Heartbeat)
    except WebSocketDisconnect:
        manager.disconnect(websocket, user_id)
   

@router.get("/inventory-stats/test", tags=["Testing"])
def test_inventory_stats():
    """
    نقطة نهاية للاختبار: تقوم بإرجاع إحصائيات المخزن الحالية المصححة
    باستخدام جلسة معزولة ونظيفة لضمان جلب التنبيهات والعلاقات كاملة دون فقدان.
    """
    try:
        # نفتح جلسة جديدة ومستقلة تماماً من الـ Factory لضمان قراءة الـ Joins والعلاقات بنجاح
        with SessionLocal() as db:
            stats = get_inventory_dashboard_stats(db)
            
            # طباعة اختبارية سريعة في الـ Terminal للتأكد من وصول الأرقام للباك إند
            print(f"🔮 DB Sync Success | Products Alert Count: {stats['alerts']['counters']['out_of_stock_products_count']}")
            print(f"🔮 DB Sync Success | Variants Alert Count: {stats['alerts']['counters']['out_of_stock_variants_count']}")
            
            return {
                "status": "success",
                "data": stats
            }
    except Exception as e:
        print(f"🔴 Router Alert Error: {str(e)}")
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




@router.get("/all-with-variants")
async def get_all_products_with_variants(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    نقطة نهاية احترافية: تقوم بجلب جميع المنتجات النشطة مع كافة المتغيرات التابعة لها
    (الألوان، المقاسات، وإحصائيات المخزون التفصيلية) في استعلام موحد ومحسن الأداء.
    محمية ولا يمكن الوصول إليها إلا من قبل المستخدمين النشطين في النظام.
    """
    # 1. استدعاء دالة اللوجيك وجلب البيانات
    result = await get_products_with_variants_logic(db=db)
    
    # 2. التحقق من نجاح العملية ومعالجة الاستثناءات بناءً على رد اللوجيك
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "حدث خطأ داخلي أثناء معالجة بيانات المخزون")
        )
        
    # 3. إرجاع النتيجة المنظمة مباشرة للفرونت إند
    return result   

@router.get("/inventory-analytics/top-bottom")
async def get_inventory_top_bottom_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    نقطة نهاية التقارير التحليلية: ترجع الـ 4 قوائم الذهبية لإدارة المخزون
    (أفضل مبيعات، أقل مبيعات، الأكثر تالفاً، الأكثر مرتجعاً) لمتغيرات المنتجات التفصيلية.
    محمية وصالحة للمستخدمين النشطين فقط.
    """
    # 1. استدعاء اللوجيك
    result = await get_top_and_bottom_inventory_report_logic(db=db)
    
    # 2. التحقق من النتيجة ورفع خطأ في حال الفشل
    if not result.get("success"):
        raise HTTPException(
            status_code=500,
            detail=result.get("message", "فشلت عملية جلب البيانات التحليلية من السيرفر")
        )
        
    # 3. إرسال البيانات المنظمة مباشرة للفرونت إند لتركيبها في الـ Charts والجداول
    return result
    