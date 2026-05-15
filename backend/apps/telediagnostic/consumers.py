"""TeleDiagnostic WebSocket consumer — real-time camera commands and photo relay"""
import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone


class TeleDiagConsumer(AsyncWebsocketConsumer):
    """
    Group: telediag_<session_code>
    Handles:
      - device registration (field devices join the session group)
      - camera_command (manager triggers camera on field device)
      - photo_captured  (field device sends captured image back to manager)
      - stream_frame    (optional live streaming frame relay)
      - session_status  (heartbeat + status updates)
    """

    async def connect(self):
        self.session_code = self.scope['url_route']['kwargs']['session_code']
        self.group_name   = f'telediag_{self.session_code}'
        self.device_id    = None
        self.role         = 'unknown'

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()

        await self.send(json.dumps({
            'type':    'connected',
            'message': 'TeleDiag channel open',
            'session': self.session_code,
        }))

    async def disconnect(self, code):
        if self.device_id:
            await self.channel_layer.group_send(self.group_name, {
                'type':      'device_disconnected',
                'device_id': self.device_id,
                'role':      self.role,
                'timestamp': timezone.now().isoformat(),
            })
        await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            msg = json.loads(text_data)
        except json.JSONDecodeError:
            return

        msg_type = msg.get('type', '')

        if msg_type == 'register_device':
            self.device_id = msg.get('device_id', self.channel_name[-8:])
            self.role      = msg.get('role', 'field')  # 'manager' | 'field'
            await self.channel_layer.group_send(self.group_name, {
                'type':      'device_registered',
                'device_id': self.device_id,
                'role':      self.role,
                'device_info': msg.get('device_info', {}),
                'timestamp': timezone.now().isoformat(),
            })

        elif msg_type == 'photo_captured':
            await self.channel_layer.group_send(self.group_name, {
                'type':      'photo_relayed',
                'device_id': self.device_id,
                'image':     msg.get('image', ''),     # base64
                'test_type': msg.get('test_type', 'photo'),
                'patient_id':msg.get('patient_id', ''),
                'ai_result': msg.get('ai_result', {}),
                'timestamp': timezone.now().isoformat(),
            })

        elif msg_type == 'stream_frame':
            await self.channel_layer.group_send(self.group_name, {
                'type':      'stream_frame_relayed',
                'device_id': self.device_id,
                'frame':     msg.get('frame', ''),
                'timestamp': timezone.now().isoformat(),
            })

        elif msg_type == 'heartbeat':
            await self.send(json.dumps({
                'type':      'heartbeat_ack',
                'server_ts': timezone.now().isoformat(),
            }))

        elif msg_type == 'location_update':
            await self.channel_layer.group_send(self.group_name, {
                'type':      'location_updated',
                'device_id': self.device_id,
                'lat':       msg.get('lat'),
                'lng':       msg.get('lng'),
                'accuracy':  msg.get('accuracy'),
                'timestamp': timezone.now().isoformat(),
            })

    # ── Group message handlers (sent to WebSocket client) ────────────

    async def camera_command(self, event):
        await self.send(json.dumps({
            'type':      'camera_command',
            'command':   event['command'],
            'device_id': event.get('device_id'),
            'sender':    event.get('sender'),
            'timestamp': event.get('timestamp'),
        }))

    async def device_registered(self, event):
        await self.send(json.dumps(event))

    async def device_disconnected(self, event):
        await self.send(json.dumps(event))

    async def photo_relayed(self, event):
        await self.send(json.dumps({
            'type':      'photo_relayed',
            'device_id': event['device_id'],
            'image':     event.get('image', ''),
            'test_type': event.get('test_type'),
            'patient_id':event.get('patient_id'),
            'ai_result': event.get('ai_result'),
            'timestamp': event.get('timestamp'),
        }))

    async def stream_frame_relayed(self, event):
        await self.send(json.dumps({
            'type':      'stream_frame',
            'device_id': event['device_id'],
            'frame':     event.get('frame', ''),
        }))

    async def location_updated(self, event):
        await self.send(json.dumps(event))
