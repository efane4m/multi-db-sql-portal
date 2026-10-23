from django.db import models
from django.contrib.auth.models import AbstractUser

# Create your models here.

class User(AbstractUser):
    ROLE_CHOICES = (('admin', 'Администратор'), ('user', 'Пользователь'))
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    full_name = models.CharField(max_length=255, blank=True)
    position = models.CharField(max_length=100, blank=True)
    photo = models.ImageField(upload_to='profiles/', blank=True, null=True)

class DatabaseAccess(models.Model):
    DB_CHOICES = (('db_stores', 'Магазины'), ('db_logistics', 'Логистика'))
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='db_accesses')
    db_name = models.CharField(max_length=50)

    def clean(self):
        from django.conf import settings
        from django.core.exceptions import ValidationError
        if self.db_name not in settings.QUERY_DATABASES:
            raise ValidationError({'db_name': 'База не зарегистрирована в QUERY_DATABASES.'})

    class Meta:
        unique_together = ('user', 'db_name')
