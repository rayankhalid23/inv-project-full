from fastapi import WebSocket
from typing import Dict, List


class ConnectionManager:
    def __init__(self):
        # نستخدم قاموس لربط معرف المستخدم باتصالاته (User-specific targeting)
        # { user_id: [websocket1, websocket2] }
        self.active_connections: Dict[int, List[WebSocket]] = {}

    @property
    def has_connections(self) -> bool:
        """
        هل يوجد أي متصفح متصل فعلاً؟

        تُستخدم لتفادي حساب إحصائيات لوحة التحكم (5 استعلامات ~70 مللي ثانية)
        بعد كل عملية بيع أو مسح بينما لا يوجد أي مستمع لها — كان هذا العمل
        يُنفَّذ على حلقة الأحداث فيُجمّد الخادم لبقية المستخدمين بلا فائدة.
        """
        return any(conns for conns in self.active_connections.values())

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active_connections:
            self.active_connections[user_id].remove(websocket)
            # تنظيف القاموس إذا لم يتبقَ اتصالات لهذا المستخدم
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def broadcast(self, data: dict):
        """إرسال لكل المستخدمين (مثل تحديث عام للمخزون)"""
        for user_id in list(self.active_connections.keys()):
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(data)
                except:
                    # تنظيف فوري في حال فشل الإرسال
                    self.disconnect(connection, user_id)

    async def send_personal_message(self, data: dict, user_id: int):
        """إرسال لمستخدم محدد فقط (مثل إشعار خاص أو طلب يخص موظف معين)"""
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(data)
                except:
                    self.disconnect(connection, user_id)

manager = ConnectionManager()