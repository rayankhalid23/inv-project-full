from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import OperationalError
from sqlalchemy import func
from fastapi import HTTPException, status
from app.models.user import User
from app.services.audit_service import create_system_audit_log
from sqlalchemy import or_
from app.models.role import Role
from app.schemas.user import UserCreate, UserUpdate
from app.core.security import get_password_hash
from datetime import datetime
from typing import Optional
from app.models.user import User
from app.models.inventory import SystemAuditLog,InventoryMovement,Catalog,Product
from app.models.order import OrderAction





def get_users(db: Session, status: Optional[str] = "active"):
    """جلب الموظفين حسب الحالة (نشط، موقوف، أرشيف)."""
    query = db.query(User)
    filters = {
        "active": (User.is_active == True, User.deleted_at == None),
        "inactive": (User.is_active == False, User.deleted_at == None),
        "deleted": (User.deleted_at != None,),
        "all": (User.deleted_at == None,)
    }
    current_filter = filters.get(status, filters["active"])
    return query.filter(*current_filter).all()

def create_user(db: Session, user_in: UserCreate , admin_id: int):
    """إضافة موظف جديد مع فحص الرتبة والبيانات الفريدة (هاتف/اسم)."""
    try:
        # البحث عن مستخدم موجود أولاً لاستخدامه في التحققات
        existing = db.query(User).filter((User.phone == user_in.phone) | (User.name == user_in.name)).first()
        
        if existing:
            # 1. التحقق من الاسم أولاً
            if existing.name == user_in.name:
                 raise HTTPException(status_code=400, detail=f"اسم المستخدم ({user_in.name}) محجوز مسبقاً لموظف آخر.")

            # 2. التحقق من الرقم (الهاتف) ثانياً
            if existing.phone == user_in.phone:
                if existing.deleted_at is not None:
                    raise HTTPException(status_code=400, detail=f"هذا الرقم ({user_in.phone}) ينتمي لحساب مؤرشف، هل تود استعادته؟")
                raise HTTPException(status_code=400, detail=f"هذا الرقم ({user_in.phone}) مسجل بالفعل لموظف آخر، يرجى إدخال رقم جديد.")

        # 3. التحقق من الرتبة ثالثاً
        if not db.query(Role).filter(Role.id == user_in.role_id).first():
            raise HTTPException(status_code=400, detail="الرتبة المحددة غير موجودة")

        # إنشاء المستخدم (يتم ضمنياً معالجة الرقم السري هنا عبر get_password_hash)
        db_user = User(
            name=user_in.name, 
            phone=user_in.phone, 
            password_hash=get_password_hash(user_in.password), 
            role_id=user_in.role_id, 
            is_active=True
        )
        db.add(db_user)
        db.flush()

        create_system_audit_log(
            db=db, user_id=admin_id, action_target='user', target_id=db_user.id,
            action_type='create', details={"name": db_user.name, "role_id": db_user.role_id}
        )

        db.commit()
        db.refresh(db_user)

        return db_user

    except OperationalError:
        db.rollback()
        raise HTTPException(status_code=503, detail="خطأ اتصال: تعذر الوصول لخادم قاعدة البيانات، يرجى المحاولة بعد قليل")

def update_user(db: Session, target_user_id: int, user_in: UserUpdate, current_user: User):
    # 1. جلب الموظف المراد تعديله
    target_user = db.query(User).filter(User.id == target_user_id, User.deleted_at == None).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="الموظف المطلوب غير موجود في النظام.")
    

    # --- حل المشكلة: حفظ البيانات القديمة قبل التعديل ---
    old_data = {
        "name": target_user.name,
        "phone": target_user.phone,
        "role_id": target_user.role_id
    }


    
    update_data = user_in.model_dump(exclude_unset=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="لم يتم إرسال أي بيانات جديدة لتعديلها.")

    # متغير لمراقبة ما إذا كانت الرتبة ستتغير فعلياً
    role_was_changed = False
    is_self_update = (target_user.id == current_user.id)

    # --- 3. فحص الصلاحيات ---
    if is_self_update:
        if "role_id" in update_data:
            raise HTTPException(status_code=403, detail="غير مصرح لك بتعديل رتبتك بنفسك.")
    else:
        # أ) القيد الأول: لا يمكن تعديل من هو في نفس رتبتك أو أعلى منك
        if current_user.role_id >= target_user.role_id:
            raise HTTPException(status_code=403, detail="صلاحيتك لا تسمح بتعديل موظف في نفس مستواك أو أعلى.")

        # ب) القيد الثاني: منع الترقية لرتبة أعلى من رتبة المدير الحالي
        if "role_id" in update_data:
            new_role_id = update_data["role_id"]
            if new_role_id < current_user.role_id:
                raise HTTPException(
                    status_code=403, 
                    detail="لا يمكنك ترقية موظف لرتبة أعلى من رتبتك."
                )
            
            # التحقق: هل الرتبة الجديدة تختلف عن الرتبة الحالية المسجلة في الداتابيز؟
            if new_role_id != target_user.role_id:
                role_was_changed = True

    # --- 4. فحص تعارض البيانات (الأسماء والهواتف) ---
    if "name" in update_data:
        new_name = update_data["name"]
        name_exists = db.query(User).filter(User.name == new_name, User.id != target_user_id).first()
        if name_exists:
            raise HTTPException(status_code=400, detail="اسم المستخدم هذا محجوز لموظف آخر.")

    if "phone" in update_data:
        new_phone = update_data["phone"]
        
        # القيد الجديد: يجب أن يبدأ بـ 09 ويكون طوله 10 خانات
        if not (new_phone.startswith("09") and len(new_phone) == 10 and new_phone.isdigit()):
            raise HTTPException(
                status_code=400, 
                detail="رقم الهاتف غير صحيح. يجب أن يبدأ بـ 09 ويتكون من 10 أرقام تماماً."
            )
                    

    if "phone" in update_data:
        new_phone = update_data["phone"]
        phone_exists = db.query(User).filter(User.phone == new_phone, User.id != target_user_id).first()
        if phone_exists:
            raise HTTPException(status_code=400, detail="رقم الهاتف مسجل بالفعل لموظف آخر.")

    # --- 5. معالجة كلمة المرور ---
    if "password" in update_data:
        update_data["password_hash"] = get_password_hash(update_data.pop("password"))

    # --- 6. تطبيق التحديثات ---
    try:
        for field, value in update_data.items():
            if hasattr(target_user, field):
                setattr(target_user, field, value)

        # --- إضافة التتبع ---
        create_system_audit_log(
        db=db, user_id=current_user.id, action_target='user', target_id=target_user_id,
        action_type='update', details={"changes": update_data, "previous_state": old_data}
         )        
        
        db.commit()
        db.refresh(target_user)
        

    except Exception as e:
        db.rollback()
        print(f"Update Error: {str(e)}")
        raise HTTPException(status_code=500, detail="فشل تحديث البيانات في قاعدة البيانات.")


    final_message = "تم التحديث بنجاح."
    if role_was_changed:
        final_message += " يرجى إبلاغ الموظف بإعادة تسجيل الدخول لتفعيل صلاحياته."
    return {
        "status": "success",
        "message": final_message,
        "data": target_user
    
    }
   
def soft_delete_user(db: Session, user_id: int, admin_id: int):
    """نقل الموظف إلى سلة المحذوفات (حذف ناعم)."""
    db_user = db.query(User).filter(User.id == user_id, User.deleted_at == None).first()
    if not db_user or db_user.role_id == 1:
        raise HTTPException(status_code=403, detail="لا يمكن حذف هذا الحساب (مسؤول أو غير موجود)")
        
    db_user.deleted_at = datetime.now()
    db_user.is_active = False 

    # --- إضافة التتبع ---
    create_system_audit_log(
        db=db, user_id=admin_id, action_target='user', target_id=user_id,
        action_type='delete', details={"name": db_user.name}
    )

    db.commit()
    db.refresh(db_user)
  

    return db_user

def restore_user(db: Session, user_id: int, admin_id: int):
    """استعادة حساب موظف من سلة المحذوفات."""
    db_user = db.query(User).filter(User.id == user_id, User.deleted_at != None).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="الموظف غير موجود في الأرشيف")
    
    db_user.deleted_at = None 
    db_user.is_active = True  

    # --- إضافة التتبع ---
    create_system_audit_log(
        db=db, user_id=admin_id, action_target='user', target_id=user_id,
        action_type='restore', details={"name": db_user.name}
    )

    db.commit()
    db.refresh(db_user)


    return db_user

def get_all_users_mini(
    db: Session, 
    query: Optional[str] = None, 
    role_id: Optional[int] = None, 
    is_active: Optional[bool] = None, 
    include_deleted: bool = False,
    page: int = 1, 
    limit: int = 20
):
    offset = (page - 1) * limit
    
    # الاستعلام الأساسي مع الربط المباشر بجدول الرتب
    db_query = db.query(
        User.id, 
        User.name, 
        User.phone, 
        User.role_id, 
        User.is_active, 
        User.deleted_at,
        Role.name.label("role_name")
    ).join(Role, User.role_id == Role.id)

    # 1. منطق سلة المحذوفات
    if include_deleted:
        db_query = db_query.filter(User.deleted_at != None)
    else:
        db_query = db_query.filter(User.deleted_at == None)

    # 2. البحث (بالاسم أو الهاتف)
    if query:
        db_query = db_query.filter(
            or_(
                User.name.ilike(f"%{query}%"),
                User.phone.ilike(f"%{query}%")
            )
        )

    # 3. الفلترة حسب الرتبة
    if role_id:
        db_query = db_query.filter(User.role_id == role_id)

    # 4. الفلترة حسب حالة الحساب (نشط / موقوف)
    if is_active is not None:
        db_query = db_query.filter(User.is_active == is_active)

    # الحساب الإجمالي بعد الفلترة وقبل التجزئة (Pagination)
    total_count = db_query.count()
    
    # جلب النتائج مرتبة
    users_rows = db_query.order_by(User.id.desc()).offset(offset).limit(limit).all()
    
    # تحويل لقاموس ليتوافق مع JSON
    users_list = []
    for row in users_rows:
        users_list.append({
            "id": row.id,
            "name": row.name,
            "phone": row.phone,
            "role_id": row.role_id,
            "role_name": row.role_name if row.role_name else "بدون رتبة",
            "is_active": row.is_active,
            "is_deleted": row.deleted_at is not None 
        })

    return {"users": users_list, "total": total_count}

def get_employee_info(db: Session, user_id: int):
    # جلب المستخدم مع بيانات الرتبة المرتبطة به
    user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="الموظف غير موجود"
        )
    
    # بناء الرد باستخدام الأسماء الدقيقة من قاعدة بياناتك
    return {
        "الاسم": user.name,
        "رقم الهاتف": user.phone,
        "تاريخ التسجيل": user.created_at.strftime("%Y-%m-%d"),
        "الرتبة": user.role.name if user.role else "غير محدد",
        "الحالة": "نشط" if user.is_active else "موقف"
    }


from app.services import audit_taxonomy as tax


def get_user_full_activity_stats(db: Session, user_id: int):
    # 1. جلب بيانات المستخدم مع الرتبة (للهوية الشخصية والتحقق من الصلاحيات)
    user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="الموظف غير موجود في النظام"
        )

    # تحديد ما إذا كان المستخدم موظفاً عادياً (لتقييد رؤية بعض الإحصائيات)
    is_employee = user.role_id == 3

    # --- الجزء الأول: بناء معلومات الهوية (employee_info) ---
    employee_info = {
        "الاسم": user.name,
        "رقم الهاتف": user.phone,
        "تاريخ التسجيل": user.created_at.strftime("%Y-%m-%d"),
        "الرتبة": user.role.name if user.role else "غير محدد",
        "الحالة": "نشط" if user.is_active else "موقف"
    }

    # --- الجزء الثاني: تجميع الإحصائيات من سجلات النظام ---

    # أ. سجل النظام العام (Audit Log)
    audit_data = db.query(
        SystemAuditLog.action_target, 
        SystemAuditLog.action_type, 
        func.count(SystemAuditLog.id)
    ).filter(SystemAuditLog.user_id == user_id)\
     .group_by(SystemAuditLog.action_target, SystemAuditLog.action_type).all()

    audit_map = {(row[0], row[1]): row[2] for row in audit_data}

    # ب. سجل عمليات الطلبات (Order Actions)
    order_actions = db.query(OrderAction.action_type, func.count(OrderAction.id))\
                      .filter(OrderAction.user_id == user_id)\
                      .group_by(OrderAction.action_type).all()
    order_act_dict = {row[0]: row[1] for row in order_actions}

    # ج. سجل حركة المخزون (Inventory Movements)
    # تُجلب لكل الرتب: تسجيل التوالف والمرتجعات عمل يومي للموظف العادي،
    # وكان استثناؤه هنا يجعل عمودَي "تالف" و"مرتجع" صفراً له دائماً.
    inv_movements = (
        db.query(InventoryMovement.movement_type, func.count(InventoryMovement.id))
        .filter(InventoryMovement.user_id == user_id)
        .group_by(InventoryMovement.movement_type)
        .all()
    )
    inv_dict = {row[0]: row[1] for row in inv_movements}

    # --- تنظيم البيانات في المجموعات المطلوبة للفرونت إند ---

    # التصنيف كله يمرّ عبر المفردات الموحّدة في audit_taxonomy.
    # القوائم اليدوية التي كانت هنا كُتبت بالتخمين: كانت تبحث عن 'catalogs'
    # بالجمع بينما الكود يكتب 'catalog' بالمفرد فتسقط كل عمليات الكتالوج،
    # ولا تعرف 'size' ولا 'variant' ولا 'product_color'، ولا تعرف
    # 'manual_scan' فيسقط أكثر من نصف عمليات المسح.
    product_stats = {"adds": 0, "updates": 0, "deletes": 0}
    emp_activity_stats = {"adds": 0, "updates": 0, "deletes": 0}
    catalog_stats = {"adds": 0, "updates": 0, "deletes": 0}

    category_buckets = {
        tax.CATEGORY_PRODUCTS: product_stats,
        tax.CATEGORY_EMPLOYEES: emp_activity_stats,
        tax.CATEGORY_CATALOGS: catalog_stats,
    }

    if not is_employee:
        for (target, action), count in audit_map.items():
            bucket = category_buckets.get(tax.classify_audit_target(target, action))
            if bucket is not None:
                bucket[tax.classify_action(action)] += count

    # الكتالوجات تُعرض ضمن إدارة المنتجات في هذه الشاشة
    for _key in product_stats:
        product_stats[_key] += catalog_stats[_key]

    # 3. عمليات الطلبات وعمليات المسح — مصدرها order_actions
    order_stats = {"adds": 0, "updates": 0, "deletes": 0}
    scans_count = 0
    for action, count in order_act_dict.items():
        if tax.classify_order_action(action) == tax.CATEGORY_SCANS:
            scans_count += count
        else:
            order_stats[tax.classify_action(action)] += count

    # 4. اللوجستيات
    # التوالف والرواجع تُقرأ من حركات المخزون وحدها: مسار الـ QR يكتب حركة
    # مخزون وسطر تدقيق للحدث نفسه، فجمع المصدرين كان يضاعف العدّ.
    logistics_stats = {
        "damages": inv_dict.get('damage', 0),
        "returns": inv_dict.get('return', 0),
        "scans": scans_count,
    }

    # حساب الإجمالي الكلي
    grand_total = (
        sum(product_stats.values()) + 
        sum(emp_activity_stats.values()) + 
        sum(order_stats.values()) + 
        sum(logistics_stats.values())
    )

    # --- النتيجة النهائية المتوافقة تماماً مع React Modal ---
    return {
        "employee_info": employee_info,
        "grand_total": grand_total,
        "products_activity": product_stats,
        "employees_activity": emp_activity_stats,
        "orders_activity": order_stats,
        "logistics_activity": logistics_stats
    }
