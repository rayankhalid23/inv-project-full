from fastapi import WebSocket
from typing import List

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, data: dict):
        """إرسال البيانات لجميع المتصلين المفتوحين حالياً"""
        for connection in self.active_connections:
            try:
                await connection.send_json(data)
            except:
                # في حال انقطع اتصال أحدهم فجأة
                pass

manager = ConnectionManager()