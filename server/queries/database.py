from contextlib import contextmanager
from django.conf import settings
from django.db import connections, transaction
from .errors import QueryError


@contextmanager
def readonly_cursor(config):
    alias = config['read_alias']
    connection = connections[alias]
    if connection.vendor != 'postgresql':
        raise QueryError('Для выполнения SQL требуется PostgreSQL.', 'database_unavailable', 503)
    with transaction.atomic(using=alias):
        with connection.cursor() as cursor:
            cursor.execute('SET TRANSACTION READ ONLY')
            cursor.execute('''SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolbypassrls
                              FROM pg_catalog.pg_roles WHERE rolname = current_user''')
            if cursor.fetchone()[0]:
                raise QueryError('Для SQL API настройте отдельную непривилегированную роль.', 'unsafe_database_role', 503)
            cursor.execute("SELECT pg_catalog.set_config('statement_timeout', %s, true)",
                           [str(settings.QUERY_TIMEOUT_MS)])
            cursor.execute("SELECT pg_catalog.set_config('lock_timeout', %s, true)",
                           [str(settings.QUERY_LOCK_TIMEOUT_MS)])
            cursor.execute("SELECT pg_catalog.set_config('search_path', 'pg_catalog', true)")
            # We consume the bounded result, rather than just its first row.
            # The default cursor_tuple_fraction can pick a slow nested-loop JOIN.
            cursor.execute("SELECT pg_catalog.set_config('cursor_tuple_fraction', '1.0', true)")
            cursor.execute("SELECT pg_catalog.set_config('idle_in_transaction_session_timeout', '10000', true)")
            yield cursor


def database_error(exc):
    cause = getattr(exc, '__cause__', None)
    code = getattr(cause, 'pgcode', None) or getattr(exc, 'pgcode', None)
    if code in {'57014', '55P03'}:
        return QueryError('Превышено время выполнения или ожидания блокировки.', 'query_timeout', 408)
    if code and code.startswith(('42', '22')):
        return QueryError('Проверьте таблицы, поля, типы и синтаксис запроса.', 'database_query_error')
    return QueryError('База данных временно недоступна.', 'database_unavailable', 503)
