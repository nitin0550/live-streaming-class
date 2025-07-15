from django.urls import path
from . import consumers

websocket_urlpatterns = [
    path("ws/classroom/<str:room_code>/", consumers.ClassroomConsumer.as_asgi()),
]
