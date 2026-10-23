from django.conf import settings
from psycopg2 import sql
from .cache import cache_key, get_cached, set_cached
from .database import readonly_cursor
from .errors import QueryError

HIDDEN_PREFIXES = ('django_', 'auth_', 'core_')


def schema_for(database, config, refresh=False):
    key = cache_key('schema', database, config)
    cached = None if refresh else get_cached(key)
    if cached is not None:
        return cached
    with readonly_cursor(config) as cursor:
        cursor.execute('''
            SELECT n.nspname, c.relname, a.attname,
                   pg_catalog.format_type(a.atttypid, a.atttypmod),
                   NOT a.attnotnull, COALESCE(t.typcategory, '')
            FROM pg_catalog.pg_class c
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
            JOIN pg_catalog.pg_type t ON t.oid = a.atttypid
            WHERE n.nspname = ANY(%s) AND c.relkind IN ('r', 'p')
              AND a.attnum > 0 AND NOT a.attisdropped
              AND pg_catalog.has_table_privilege(c.oid, 'SELECT')
            ORDER BY n.nspname, c.relname, a.attnum
        ''', [config.get('schemas', ['public'])])
        tables = {}
        for namespace, name, column, data_type, nullable, category in cursor.fetchall():
            if name.startswith(HIDDEN_PREFIXES):
                continue
            table = tables.setdefault(f'{namespace}.{name}', {
                'schema': namespace, 'name': name, 'columns': [],
                'primary_key': [], 'foreign_keys': [],
            })
            kind = {'N': 'number', 'B': 'boolean', 'D': 'date'}.get(category, 'text')
            table['columns'].append({
                'name': column, 'data_type': data_type, 'kind': kind, 'nullable': nullable,
            })
        cursor.execute('''
            SELECT n.nspname, c.relname, con.contype,
                   ARRAY(SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY k(num, ord)
                         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.num ORDER BY k.ord),
                   rn.nspname, rc.relname,
                   ARRAY(SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY k(num, ord)
                         JOIN pg_catalog.pg_attribute a ON a.attrelid = rc.oid AND a.attnum = k.num ORDER BY k.ord)
            FROM pg_catalog.pg_constraint con
            JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
            JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
            LEFT JOIN pg_catalog.pg_class rc ON rc.oid = con.confrelid
            LEFT JOIN pg_catalog.pg_namespace rn ON rn.oid = rc.relnamespace
            WHERE n.nspname = ANY(%s) AND con.contype IN ('p', 'f')
        ''', [config.get('schemas', ['public'])])
        for ns, name, kind, columns, ref_ns, ref_table, ref_columns in cursor.fetchall():
            table = tables.get(f'{ns}.{name}')
            if table is None:
                continue
            if kind == 'p':
                table['primary_key'] = columns
            elif f'{ref_ns}.{ref_table}' in tables:
                table['foreign_keys'].append({
                    'columns': columns, 'references': {
                        'schema': ref_ns, 'table': ref_table, 'columns': ref_columns,
                    },
                })
    result = {'database': database, 'tables': list(tables.values())}
    set_cached(key, result, settings.QUERY_SCHEMA_CACHE_TTL)
    return result


def find_table(schema, table_name):
    matches = [table for table in schema['tables']
               if table_name in (table['name'], f"{table['schema']}.{table['name']}")]
    if len(matches) != 1:
        raise QueryError('Таблица не найдена или имя неоднозначно.', 'table_not_found', 404)
    return matches[0]


def table_identifier(table):
    return sql.Identifier(table['schema'], table['name'])
