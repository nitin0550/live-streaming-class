from django.db import models
from django.contrib.auth.models import User
from django.utils.crypto import get_random_string

class Course(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    teacher = models.ForeignKey(User, on_delete=models.CASCADE)

    def __str__(self):
        return self.title

class LiveClass(models.Model):
    course = models.ForeignKey(Course, on_delete=models.CASCADE)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='taught_classes')
    title = models.CharField(max_length=200)
    start_time = models.DateTimeField()
    code = models.CharField(max_length=10, unique=True, blank=True)
    is_active = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        if not self.code:
            self.code = get_random_string(6)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.course.title} - {self.title}"
