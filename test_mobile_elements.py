import os
import time
from playwright.sync_api import sync_playwright
from datetime import timedelta

from app.core.database import SessionLocal
from app.models.user import User
from app.core.security import create_access_token

db = SessionLocal()
admin_user = db.query(User).filter(User.is_active == True).first()
token = create_access_token(data={"sub": str(admin_user.id)}, expires_delta=timedelta(days=7))
user_dict = {
    "id": admin_user.id,
    "name": admin_user.name,
    "role_id": admin_user.role_id,
    "role": admin_user.role.name if admin_user.role else "Admin",
    "phone": admin_user.phone
}
db.close()

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    # iPhone 14 Pro Max viewport
    context = browser.new_context(
        viewport={"width": 430, "height": 932},
        is_mobile=True,
        has_touch=True,
        device_scale_factor=2,
        locale="ar-LY",
        timezone_id="Africa/Tripoli"
    )
    page = context.new_page()
    page.goto("http://localhost:5173")
    page.evaluate(f"""() => {{
        localStorage.setItem('token', '{token}');
        localStorage.setItem('user', JSON.stringify({user_dict}));
    }}""")
    page.goto("http://localhost:5173/sales")
    page.wait_for_load_state("networkidle")
    time.sleep(2)
    
    os.makedirs("test_screenshots", exist_ok=True)
    page.screenshot(path="test_screenshots/mobile_initial.png")
    print("Mobile page title:", page.title())
    print("Buttons visible:", page.locator("button").count())
    
    browser.close()
