from django.urls import path
from django.contrib.auth import views as auth_views
from .views import (
    classroom_chat, home, register, create_classroom, 
    join_classroom, my_classrooms, end_classroom
)

urlpatterns = [
    path('', home, name='home'),
    path('register/', register, name='register'),
    path('login/', auth_views.LoginView.as_view(), name='login'),
    path('logout/', auth_views.LogoutView.as_view(), name='logout'),
    path('create-classroom/', create_classroom, name='create_classroom'),
    path('join-classroom/', join_classroom, name='join_classroom'),
    path('my-classrooms/', my_classrooms, name='my_classrooms'),
    path('classroom/<str:classroom_code>/', classroom_chat, name='classroom_chat'),
    path('classroom/<str:classroom_code>/end/', end_classroom, name='end_classroom'),
]
