from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth import login, authenticate
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.contrib import messages
from django.utils import timezone
from .models import LiveClass, Course
from django.utils.crypto import get_random_string
import uuid
import string
import random

def home(request):
    """Home page with login/register options"""
    return render(request, 'home.html')

def register(request):
    """User registration view"""
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            user = form.save()
            username = form.cleaned_data.get('username')
            login(request, user)
            return redirect('home')
    else:
        form = UserCreationForm()
    return render(request, 'registration/register.html', {'form': form})

@login_required
def create_classroom(request):
    """Create a new classroom with unique stream ID"""
    if request.method == 'POST':
        title = request.POST.get('title', 'Live Class')
        
        # Create a course and live class record
        course = Course.objects.create(
            title=title,
            teacher=request.user
        )
        # Create a LiveClass instance linked to the Course
        live_class = LiveClass.objects.create(
            title=title,
            course=course,
            teacher=request.user,
            start_time=timezone.now(),
            is_active=True
        )
        
        messages.success(request, f'Classroom created! Student code: {live_class.code}')
        return redirect('classroom_chat', classroom_code=live_class.code)
    return render(request, 'create_classroom.html')

@login_required
def join_classroom(request):
    """Join a classroom using student code"""
    if request.method == 'POST':
        student_code = request.POST.get('student_code', '').strip()
        if student_code:
            try:
                # Use __iexact for case-insensitive matching
                live_class = LiveClass.objects.get(code__iexact=student_code, is_active=True)
                # Redirect with the correct code casing
                return redirect('classroom_chat', classroom_code=live_class.code)
            except LiveClass.DoesNotExist:
                messages.error(request, 'Invalid student code or classroom is not active.')
        else:
            messages.error(request, 'Please enter a student code.')
    
    return render(request, 'join_classroom.html')

@login_required
def classroom_chat(request, classroom_code):
    try:
        live_class = LiveClass.objects.get(code=classroom_code)
        is_teacher = request.user == live_class.teacher
        return render(request, 'classroom.html', {
            'room_name': live_class.title,
            'room_code': live_class.code,
            'user_id': request.user.id,
            'username': request.user.username,
            'is_teacher': is_teacher
        })
    except LiveClass.DoesNotExist:
        # Handle case where classroom with the code does not exist
        # You might want to redirect to a different page or show an error
        return redirect('home') # Or some error page

@login_required
def end_classroom(request, classroom_code):
    """Allows the teacher to end a classroom session."""
    live_class = get_object_or_404(LiveClass, code=classroom_code, teacher=request.user)
    live_class.is_active = False
    live_class.save()
    messages.success(request, f'The classroom "{live_class.title}" has been ended.')
    return redirect('my_classrooms')

@login_required
def my_classrooms(request):
    """View all classrooms created by the teacher"""
    classrooms = LiveClass.objects.filter(teacher=request.user).order_by('-start_time')
    return render(request, 'my_classrooms.html', {'classrooms': classrooms})

def generate_student_code():
    """Generate a unique 6-character student code"""
    while True:
        code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
        # Ensure the code is unique
        if not LiveClass.objects.filter(code=code).exists():
            return code
