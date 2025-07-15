from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth.models import AnonymousUser
import json
import logging

logger = logging.getLogger(__name__)
classrooms = {}  # In-memory store for classroom state

class ClassroomConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.room_code = self.scope['url_route']['kwargs']['room_code']
        self.room_group_name = f'classroom_{self.room_code}'
        self.username = None
        self.is_teacher = False

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        await self.accept()

        if self.room_code not in classrooms:
            classrooms[self.room_code] = {
                'teacher': {},
                'students': {},
                'is_live': False, # Track if teacher stream is active
            }

    async def disconnect(self, close_code):
        if self.username:
            room = classrooms.get(self.room_code)
            if room:
                if self.is_teacher:
                    room['teacher'] = {}
                    room['is_live'] = False
                elif self.username in room['students']:
                    del room['students'][self.username]
                
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'user_left_broadcast',
                        'username': self.username,
                        'is_teacher': self.is_teacher
                    }
                )
                await self.broadcast_student_list()

        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get("type")

            handlers = {
                "join": self.handle_join,
                "chat_message": self.handle_chat_message,
                "permission_update": self.handle_permission_update,
                
                # New Teacher -> Student stream signaling
                "teacher_ready": self.handle_teacher_ready,
                "request_stream": self.handle_request_stream,
                "offer": self.handle_offer, # Now targeted
                "answer": self.handle_answer, # Targeted to teacher

                # Student -> Teacher stream signaling
                "student_offer": self.handle_student_offer,
                "student_answer": self.handle_student_answer, # Now targeted
                
                "ice_candidate": self.handle_ice_candidate, # Now targeted
                "stream_stopped": self.handle_stream_stopped,
            }

            handler = handlers.get(message_type)
            if handler:
                await handler(data)
            else:
                logger.warning(f"Unknown message type received: {message_type}")
        except json.JSONDecodeError:
            logger.error("Received invalid JSON")
        except Exception as e:
            logger.error(f"Error processing message: {e}", exc_info=True)

    async def handle_join(self, data):
        self.username = data['username']
        self.is_teacher = data.get('is_teacher', False)
        room = classrooms[self.room_code]

        if self.is_teacher:
            room['teacher'] = {'username': self.username, 'channel': self.channel_name}
        else:
            room['students'][self.username] = {'username': self.username, 'channel': self.channel_name, 'permissions': {}}
        
        await self.broadcast_student_list()
        
        # If student joins and teacher is already live, notify student
        if not self.is_teacher and room.get('is_live'):
            await self.send(text_data=json.dumps({'type': 'teacher_is_live'}))

    async def handle_chat_message(self, data):
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'chat_message_broadcast',
                'message': data['message'],
                'username': self.username
            }
        )

    async def handle_permission_update(self, data):
        if self.is_teacher:
            student_name = data['student_name']
            permission = data['permission']
            status = data['status']
            student_info = classrooms[self.room_code]['students'].get(student_name)
            if student_info:
                student_info['permissions'][permission] = status
                await self.channel_layer.send(student_info['channel'], {
                    'type': 'permission_granted_broadcast',
                    'permission': permission,
                    'status': status
                })

    # --- Teacher -> Many Students Signaling ---
    async def handle_teacher_ready(self, data):
        if self.is_teacher:
            classrooms[self.room_code]['is_live'] = True
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'teacher_is_live_broadcast'}
            )

    async def handle_request_stream(self, data):
        # Student sends this to request the teacher's stream
        teacher_channel = classrooms[self.room_code].get('teacher', {}).get('channel')
        if teacher_channel:
            await self.channel_layer.send(teacher_channel, {
                "type": "student_requesting_stream",
                "from_user": self.username
            })

    async def handle_offer(self, data):
        # Teacher sends this offer to a specific student
        target_user = data.get("target_user")
        student_info = classrooms[self.room_code]['students'].get(target_user)
        if student_info:
            await self.channel_layer.send(student_info['channel'], {
                "type": "offer_broadcast",
                "offer": data["offer"],
                "from_user": self.username
            })

    async def handle_answer(self, data):
        # Student's answer to the teacher's offer. Sent only to the teacher.
        teacher_channel = classrooms[self.room_code].get('teacher', {}).get('channel')
        if teacher_channel:
            await self.channel_layer.send(teacher_channel, {
                "type": "answer_received",
                "answer": data["answer"],
                "from_user": self.username
            })

    # --- Student -> Teacher Signaling ---
    async def handle_student_offer(self, data):
        teacher_channel = classrooms[self.room_code].get('teacher', {}).get('channel')
        if teacher_channel:
            await self.channel_layer.send(teacher_channel, {
                'type': 'student_offer_received',
                'offer': data['offer'],
                'from_user': self.username
            })

    async def handle_student_answer(self, data):
        # Teacher sends this answer to a specific student's offer
        target_user = data.get("target_user")
        student_info = classrooms[self.room_code]['students'].get(target_user)
        if student_info:
            await self.channel_layer.send(student_info['channel'], {
                "type": "student_answer_broadcast",
                "answer": data["answer"],
                "from_user": self.username
            })

    async def handle_ice_candidate(self, data):
        target_user = data.get("target_user")
        room = classrooms.get(self.room_code, {})
        target_channel = None

        if target_user:
            if target_user == room.get('teacher', {}).get('username'):
                target_channel = room.get('teacher', {}).get('channel')
            else:
                target_channel = room.get('students', {}).get(target_user, {}).get('channel')
        
        if target_channel:
            await self.channel_layer.send(target_channel, {
                "type": "ice_candidate_broadcast",
                "candidate": data["candidate"],
                "from_user": self.username,
                "is_teacher_stream": data.get("is_teacher_stream", False) # Helps client distinguish candidates
            })
        else:
            logger.warning(f"Could not find target user '{target_user}' for ICE candidate")

    async def handle_stream_stopped(self, data):
        if self.is_teacher:
            classrooms[self.room_code]['is_live'] = False
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'stream_stopped_broadcast',
                'username': self.username,
                'is_teacher': self.is_teacher
            }
        )

    # --- BROADCASTERS / RECEIVERS ---
    async def broadcast_student_list(self):
        room = classrooms[self.room_code]
        student_list = [
            {
                'username': s['username'],
                'permissions': s.get('permissions', {})
            } for s in room['students'].values()
        ]
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'student_list_broadcast',
                'students': student_list
            }
        )

    async def user_left_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'user_left',
            'username': event['username']
        }))

    async def student_list_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'student_list',
            'students': event['students']
        }))

    async def chat_message_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'chat_message',
            'message': event['message'],
            'username': event['username']
        }))

    async def permission_granted_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'permission_granted',
            'permission': event['permission'],
            'status': event['status']
        }))

    async def teacher_is_live_broadcast(self, event):
        if not self.is_teacher: # Only send to students
            await self.send(text_data=json.dumps({'type': 'teacher_is_live'}))

    async def student_requesting_stream(self, event):
        # This is received by the teacher's consumer
        await self.send(text_data=json.dumps({
            "type": "student_requesting_stream",
            "from_user": event["from_user"]
        }))

    async def offer_broadcast(self, event):
        # Student receives this from teacher
        await self.send(text_data=json.dumps({
            "type": "offer",
            "offer": event["offer"],
            "from_user": event["from_user"]
        }))

    async def answer_received(self, event):
        # Teacher receives this from student
        await self.send(text_data=json.dumps({
            "type": "answer",
            "answer": event["answer"],
            "from_user": event["from_user"]
        }))

    async def student_offer_received(self, event):
        # Teacher receives this from student
        await self.send(text_data=json.dumps({
            "type": "student_offer",
            "offer": event["offer"],
            "from_user": event["from_user"]
        }))

    async def student_answer_broadcast(self, event):
        # Student receives this from teacher
        await self.send(text_data=json.dumps({
            "type": "student_answer",
            "answer": event["answer"],
            "from_user": event["from_user"]
        }))

    async def ice_candidate_broadcast(self, event):
        if event["from_user"] != self.username:
            await self.send(text_data=json.dumps({
                "type": "ice_candidate",
                "candidate": event["candidate"],
                "from_user": event["from_user"],
                "is_teacher_stream": event.get("is_teacher_stream", False)
            }))

    async def stream_stopped_broadcast(self, event):
        await self.send(text_data=json.dumps({
            'type': 'stream_stopped',
            'username': event['username'],
            'is_teacher': event['is_teacher']
        }))
