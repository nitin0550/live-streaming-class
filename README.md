# Live Classroom Project 🎓

A real-time interactive classroom application built with Django, WebRTC, and WebSockets.

## Features

- 🎥 **Live Video Streaming**: Teachers can share camera or screen
- 👥 **Student Participation**: Permission-based student streaming
- 💬 **Real-time Chat**: Live messaging during classes
- 🔐 **User Management**: Registration and authentication system
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🎛️ **Permission Controls**: Teachers can grant/revoke student permissions

## Technology Stack

- **Backend**: Django 5.2.4 with Channels for WebSocket support
- **Real-time Communication**: WebRTC for peer-to-peer video streaming
- **Message Broker**: Redis for WebSocket message handling
- **Frontend**: Vanilla JavaScript with modern WebRTC APIs
- **Database**: SQLite (development) / PostgreSQL (production)

## Prerequisites

- Python 3.8+
- Redis server
- Modern web browser with WebRTC support

## Quick Setup

1. **Clone and navigate to the project:**
   ```bash
   cd /home/nitin/live_class/liveclass_project
   ```

2. **Run the setup script:**
   ```bash
   ./setup.sh
   ```

3. **Start Redis server** (in a separate terminal):
   ```bash
   redis-server
   ```

4. **Start the Django development server:**
   ```bash
   source venv/bin/activate
   python manage.py runserver
   ```

5. **Visit the application:**
   - Main app: http://127.0.0.1:8000
   - Admin panel: http://127.0.0.1:8000/admin

## Manual Setup

If you prefer manual setup:

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Apply migrations:**
   ```bash
   python manage.py makemigrations
   python manage.py migrate
   ```

4. **Create superuser:**
   ```bash
   python manage.py createsuperuser
   ```

## Usage

### For Teachers:
1. Register/Login to your account
2. Click "Create Classroom" to start a new session
3. Use the teacher controls to start camera or screen sharing
4. Grant permissions to students for participation
5. Manage the live chat and student streams

### For Students:
1. Register/Login or join as guest
2. Navigate to the classroom URL provided by the teacher
3. Wait for teacher to grant permissions
4. Use your media controls once permissions are granted
5. Participate in the live chat

## Project Structure

```
liveclass_project/
├── classroom/                 # Main Django app
│   ├── consumers.py          # WebSocket consumers
│   ├── models.py            # Database models
│   ├── views.py             # HTTP views
│   ├── urls.py              # URL routing
│   ├── routing.py           # WebSocket routing
│   └── templates/           # HTML templates
├── liveclass_project/       # Django project settings
│   ├── settings.py          # Project configuration
│   ├── asgi.py             # ASGI configuration
│   └── urls.py             # Main URL routing
├── requirements.txt         # Python dependencies
├── setup.sh                # Setup script
└── README.md               # This file
```

## Key Components

### WebRTC Implementation
- Peer-to-peer video/audio streaming
- Screen sharing capabilities
- STUN servers for NAT traversal
- ICE candidate exchange via WebSockets

### WebSocket Communication
- Real-time messaging
- Permission management
- Student list updates
- WebRTC signaling

### Security Features
- User authentication
- Permission-based access control
- CSRF protection
- Secure WebSocket connections

## Common Issues & Solutions

### 1. WebSocket Connection Failed
- Ensure Redis server is running
- Check firewall settings
- Verify WebSocket URL format

### 2. Camera/Microphone Access Denied
- Enable camera/microphone permissions in browser
- Use HTTPS in production for secure contexts
- Check browser compatibility

### 3. Video Streaming Issues
- Verify STUN server connectivity
- Check network firewall settings
- Ensure WebRTC support in browser

### 4. Redis Connection Error
```bash
# Start Redis server
redis-server

# Check Redis status
redis-cli ping
```

## Production Deployment

For production deployment:

1. **Environment Variables:**
   ```bash
   export DEBUG=False
   export SECRET_KEY=your-secret-key
   export DATABASE_URL=your-database-url
   export REDIS_URL=your-redis-url
   ```

2. **HTTPS Configuration:**
   - WebRTC requires HTTPS in production
   - Configure SSL/TLS certificates
   - Update ALLOWED_HOSTS in settings

3. **Database:**
   - Use PostgreSQL instead of SQLite
   - Run migrations: `python manage.py migrate`

4. **Static Files:**
   ```bash
   python manage.py collectstatic
   ```

## API Endpoints

- `/` - Home page
- `/login/` - User login
- `/register/` - User registration
- `/create-classroom/` - Create new classroom
- `/classroom/<stream_id>/` - Join classroom
- `/ws/classroom/<stream_id>/` - WebSocket endpoint

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is available under the MIT License.

## Support

For issues or questions:
1. Check the common issues section above
2. Review the Django and WebRTC documentation
3. Create an issue in the project repository

---

Happy teaching and learning! 🎓✨
