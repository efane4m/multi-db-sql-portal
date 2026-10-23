import hashlib
import base64
import json
import logging
import time
from uuid import uuid4
from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from psycopg2 import sql
from .cache import cache_key, get_cached, set_cached
from .database import readonly_cursor
from .errors import QueryError
from .parser import validate_select
from .schema import schema_for

logger = logging.getLogger('portal.queries')


class QueryJSONEncoder(DjangoJSONEncoder):
    def default(self, value):
        if isinstance(value, (bytes, bytearray, memoryview)):
            return base64.b64encode(bytes(value)).decode('ascii')
        return super().default(value)


def read_rows(cursor, max_rows, max_bytes):
    columns = [column[0] for column in cursor.description]
    if len(columns) != len(set(columns)):
        raise QueryError('Имена колонок повторяются. Задайте уникальные AS-псевдонимы.', 'duplicate_columns')
    rows = []
    size = 0
    truncated = False
    while True:
        batch = cursor.fetchmany(min(256, max_rows + 1 - len(rows)))
        if not batch:
            break
        for values in batch:
            if len(rows) >= max_rows:
                truncated = True
                break
            row = dict(zip(columns, values))
            size += len(json.dumps(row, cls=QueryJSONEncoder, ensure_ascii=False).encode('utf-8'))
            if size > max_bytes:
                truncated = True
                break
            rows.append(row)
        if truncated:
            break
    # Normalize Decimal/date/UUID exactly once, for identical cached/uncached API types.
    data = json.loads(json.dumps(rows, cls=QueryJSONEncoder), parse_constant=str)
    return {'data': data, 'columns': columns, 'row_count': len(data), 'truncated': truncated}


def execute_query(user, database, config, query, refresh=False):
    started = time.perf_counter()
    request_id = uuid4().hex
    fingerprint = hashlib.sha256(str(query).encode()).hexdigest()
    outcome = 'error'
    cached = False
    result = None
    try:
        schema = schema_for(database, config)
        normalized = validate_select(query, schema, settings.QUERY_MAX_SQL_LENGTH)
        key = cache_key('query', user.pk, database, config, normalized,
                        settings.QUERY_MAX_ROWS, settings.QUERY_MAX_BYTES)
        result = None if refresh else get_cached(key)
        if result is None:
            with readonly_cursor(config) as cursor:
                deadline = time.monotonic() + settings.QUERY_TIMEOUT_MS / 1000
                # DECLARE + FETCH bounds libpq/client memory as well as Python rows.
                name = sql.Identifier(f'portal_{request_id}')
                cursor.execute(sql.SQL('DECLARE {} NO SCROLL CURSOR FOR SELECT * FROM ({}) AS portal_result LIMIT {}')
                               .format(name, sql.SQL(normalized), sql.Literal(settings.QUERY_MAX_ROWS + 1)))
                cursor.execute(sql.SQL('FETCH FORWARD 0 FROM {}').format(name))
                # FETCH batches from a server-side cursor, retaining its description.
                class PortalCursor:
                    description = cursor.description

                    def fetchmany(self, count):
                        remaining = int((deadline - time.monotonic()) * 1000)
                        if remaining <= 0:
                            raise QueryError('Превышено время выполнения запроса.', 'query_timeout', 408)
                        cursor.execute("SELECT pg_catalog.set_config('statement_timeout', %s, true)", [str(remaining)])
                        cursor.execute(sql.SQL('FETCH FORWARD %s FROM {}').format(name), [count])
                        return cursor.fetchall()

                try:
                    result = read_rows(PortalCursor(), settings.QUERY_MAX_ROWS, settings.QUERY_MAX_BYTES)
                finally:
                    # On a failed statement the atomic block rolls back/closes the cursor.
                    if not cursor.db.needs_rollback and cursor.db.connection.get_transaction_status() != 3:
                        cursor.execute(sql.SQL('CLOSE {}').format(name))
            set_cached(key, result, settings.QUERY_CACHE_TTL)
        else:
            cached = True
        outcome = 'ok'
        return {**result, 'cached': cached, 'max_rows': settings.QUERY_MAX_ROWS,
                'execution_ms': round((time.perf_counter() - started) * 1000, 2), 'request_id': request_id}
    finally:
        logger.info('query_finished user_id=%s database=%s request_id=%s fingerprint=%s status=%s cached=%s rows=%s duration_ms=%.2f',
                    user.pk, database, request_id, fingerprint, outcome, cached,
                    result.get('row_count', 0) if result else 0, (time.perf_counter() - started) * 1000)
