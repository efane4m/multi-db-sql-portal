from django.conf import settings
from core.models import DatabaseAccess
from .errors import QueryError


def available_databases(user):
    configured = list(settings.QUERY_DATABASES)
    if user.role == 'admin':
        return configured
    granted = set(DatabaseAccess.objects.filter(user=user).values_list('db_name', flat=True))
    return [name for name in configured if name in granted]


def require_database(user, name):
    if not isinstance(name, str) or name not in available_databases(user):
        raise QueryError('Нет доступа к этой БД', 'database_forbidden', 403)
    return settings.QUERY_DATABASES[name]
