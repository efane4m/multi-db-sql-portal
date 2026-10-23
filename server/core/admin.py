from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, DatabaseAccess
from django import forms
from django.conf import settings

# Register your models here.

class DatabaseAccessForm(forms.ModelForm):
    class Meta:
        model = DatabaseAccess
        fields = '__all__'

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['db_name'] = forms.ChoiceField(
            label='База данных', choices=[(name, config.get('label', name))
                                          for name, config in settings.QUERY_DATABASES.items()],
        )


class DatabaseAccessInline(admin.TabularInline):
    model = DatabaseAccess
    form = DatabaseAccessForm
    extra = 1

class CustomUserAdmin(UserAdmin):
    model = User
    fieldsets = UserAdmin.fieldsets + (('Дополнительно', {'fields': ('role', 'full_name', 'position', 'photo')}),)
    inlines = [DatabaseAccessInline]

admin.site.register(User, CustomUserAdmin)
@admin.register(DatabaseAccess)
class DatabaseAccessAdmin(admin.ModelAdmin):
    form = DatabaseAccessForm
