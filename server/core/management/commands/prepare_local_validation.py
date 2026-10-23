"""Reproducible isolated validation environment, guarded by explicit arguments."""
from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from psycopg2 import sql


class Command(BaseCommand):
    help = 'Создаёт только validation_* базы для локальной проверки и бенчмарка.'

    def handle(self, *args, **options):
        if not getattr(settings, 'PORTAL_VALIDATION', False):
            raise CommandError('Используйте --settings=server.validation_settings.')
        # This connection points at postgres in the isolated cluster, not auth_db.
        with connections['bootstrap'].cursor() as cursor:
            for alias in ('default', *settings.QUERY_DATABASES):
                name = connections[alias].settings_dict['NAME']
                if not name.startswith('validation_'):
                    raise CommandError('Разрешены только validation_* базы.')
                cursor.execute('SELECT 1 FROM pg_catalog.pg_database WHERE datname=%s', [name])
                if not cursor.fetchone():
                    cursor.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(name)))
        for alias in ('default', *settings.QUERY_DATABASES):
            call_command('migrate', database=alias, interactive=False, verbosity=0)
        from core.models import User, DatabaseAccess
        # Usable only through local test client/benchmark command: no known password.
        user, _ = User.objects.get_or_create(username='validation_reader')
        user.set_unusable_password()
        user.save()
        for alias in settings.QUERY_DATABASES:
            DatabaseAccess.objects.get_or_create(user=user, db_name=alias)
        call_command('configure_query_reader')
        self.stdout.write(self.style.SUCCESS('Изолированные базы validation_* подготовлены.'))
