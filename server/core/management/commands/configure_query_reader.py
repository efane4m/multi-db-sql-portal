"""Provision the dedicated reader using migration/admin connections, never HTTP."""
import os
import secrets
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections
from psycopg2 import sql
from queries.schema import HIDDEN_PREFIXES
from core.reader_credentials import reader_password, reader_password_file


class Command(BaseCommand):
    help = 'Создаёт/обновляет отдельную роль только для чтения предметных таблиц.'

    def add_arguments(self, parser):
        parser.add_argument('--generate-password-file', action='store_true',
                            help='Создать закрытый файл пароля, если DB_QUERY_PASSWORD не задан (Docker).')

    def handle(self, *args, **options):
        username = os.getenv('DB_QUERY_USER', 'portal_reader')
        if options['generate_password_file'] and not reader_password():
            path = reader_password_file()
            path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w', encoding='utf-8') as stream:
                    stream.write(secrets.token_urlsafe(32))
            except FileExistsError:
                pass
        password = reader_password()
        if not password or len(password) < 16:
            raise CommandError('Задайте DB_QUERY_PASSWORD длиной не менее 16 символов.')
        admin_names = {config.get('USER') for alias, config in settings.DATABASES.items()
                       if not alias.startswith('query_')}
        if username in admin_names or username in {'postgres', 'public'}:
            raise CommandError('Роль чтения должна отличаться от административной роли.')
        for alias, config in settings.QUERY_DATABASES.items():
            with connections[alias].cursor() as cursor:
                cursor.execute('SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = %s', [username])
                operation = 'ALTER' if cursor.fetchone() else 'CREATE'
                cursor.execute(sql.SQL('{} ROLE {} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD {}')
                               .format(sql.SQL(operation), sql.Identifier(username), sql.Literal(password)))
                cursor.execute(sql.SQL('ALTER ROLE {} SET default_transaction_read_only = on').format(sql.Identifier(username)))
                cursor.execute(sql.SQL('ALTER ROLE {} SET statement_timeout = {}')
                               .format(sql.Identifier(username), sql.Literal(str(settings.QUERY_TIMEOUT_MS))))
                cursor.execute(sql.SQL('GRANT CONNECT ON DATABASE {} TO {}')
                               .format(sql.Identifier(connections[alias].settings_dict['NAME']), sql.Identifier(username)))
                # New roles must not inherit unrelated roles from an earlier configuration.
                cursor.execute('''SELECT parent.rolname FROM pg_catalog.pg_auth_members m
                                  JOIN pg_catalog.pg_roles parent ON parent.oid = m.roleid
                                  JOIN pg_catalog.pg_roles member ON member.oid = m.member
                                  WHERE member.rolname = %s''', [username])
                for (parent,) in cursor.fetchall():
                    cursor.execute(sql.SQL('REVOKE {} FROM {}').format(sql.Identifier(parent), sql.Identifier(username)))
                for namespace in config.get('schemas', ['public']):
                    cursor.execute(sql.SQL('GRANT USAGE ON SCHEMA {} TO {}')
                                   .format(sql.Identifier(namespace), sql.Identifier(username)))
                    cursor.execute(sql.SQL('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA {} FROM {}')
                                   .format(sql.Identifier(namespace), sql.Identifier(username)))
                    cursor.execute('''SELECT c.relname FROM pg_catalog.pg_class c
                                      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                                      WHERE n.nspname = %s AND c.relkind IN ('r', 'p')''', [namespace])
                    for (table,) in cursor.fetchall():
                        if not table.startswith(HIDDEN_PREFIXES):
                            cursor.execute(sql.SQL('GRANT SELECT ON TABLE {} TO {}')
                                           .format(sql.Identifier(namespace, table), sql.Identifier(username)))
            self.stdout.write(f'Права чтения настроены: {alias}')
