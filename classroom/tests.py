from django.test import TestCase
from channels.testing import WebsocketCommunicator
from channels.db import database_sync_to_async
from django.contrib.auth.models import User
from classroom.consumers import ClassroomConsumer
import json

class ClassroomConsumerTest(TestCase):
    """Test cases for ClassroomConsumer WebSocket functionality"""
    
    @database_sync_to_async
    def create_user(self, username="testuser"):
        return User.objects.create_user(username=username, password="testpass")
    
    async def test_websocket_connect_and_disconnect(self):
        """Test basic WebSocket connection and disconnection"""
        user = await self.create_user()
        communicator = WebsocketCommunicator(
            ClassroomConsumer.as_asgi(),
            "/ws/classroom/test123/"
        )
        communicator.scope["user"] = user
        
        # Test connection
        connected, subprotocol = await communicator.connect()
        self.assertTrue(connected)
        
        # Test disconnection
        await communicator.disconnect()
    
    async def test_student_list_update(self):
        """Test that student list is updated when users join"""
        user = await self.create_user()
        communicator = WebsocketCommunicator(
            ClassroomConsumer.as_asgi(),
            "/ws/classroom/test123/"
        )
        communicator.scope["user"] = user
        
        connected, subprotocol = await communicator.connect()
        self.assertTrue(connected)
        
        # Send join message
        await communicator.send_json_to({
            "type": "join",
            "username": "testuser"
        })
        
        # Receive student list update
        response = await communicator.receive_json_from()
        self.assertEqual(response["type"], "student_list")
        self.assertTrue(len(response["students"]) > 0)
        
        await communicator.disconnect()
    
    async def test_chat_message(self):
        """Test chat message functionality"""
        user = await self.create_user()
        communicator = WebsocketCommunicator(
            ClassroomConsumer.as_asgi(),
            "/ws/classroom/test123/"
        )
        communicator.scope["user"] = user
        
        connected, subprotocol = await communicator.connect()
        self.assertTrue(connected)
        
        # Send chat message
        await communicator.send_json_to({
            "type": "message",
            "message": "Hello, class!"
        })
        
        # Should receive student list first, then chat message
        response1 = await communicator.receive_json_from()
        response2 = await communicator.receive_json_from()
        
        # One should be student_list, other should be chat_message
        message_types = [response1["type"], response2["type"]]
        self.assertIn("student_list", message_types)
        self.assertIn("chat_message", message_types)
        
        await communicator.disconnect()
