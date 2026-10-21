from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, DatabaseAccess

# Register your models here.

class DatabaseAccessInline(admin.TabularInline):
    model = DatabaseAccess
    extra = 1

class CustomUserAdmin(UserAdmin):
    model = User
    fieldsets = UserAdmin.fieldsets + (('Дополнительно', {'fields': ('role', 'full_name', 'position', 'photo')}),)
    inlines = [DatabaseAccessInline]

admin.site.register(User, CustomUserAdmin)
admin.site.register(DatabaseAccess)