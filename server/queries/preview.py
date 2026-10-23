from django.conf import settings
from psycopg2 import sql
from .database import readonly_cursor
from .errors import QueryError
from .executor import read_rows
from .schema import find_table, schema_for, table_identifier


def integer_parameter(value, name, minimum, maximum):
    try:
        result = int(str(value))
    except (ValueError, TypeError):
        raise QueryError(f'Параметр {name} должен быть целым числом.') from None
    if not minimum <= result <= maximum:
        raise QueryError(f'Параметр {name}: допустимо от {minimum} до {maximum}.')
    return result


def preview_table(database, config, table_name, params):
    table = find_table(schema_for(database, config), table_name)
    limit = integer_parameter(params.get('limit', 50), 'limit', 1, 200)
    offset = integer_parameter(params.get('offset', 0), 'offset', 0, 1000000)
    columns = {column['name'] for column in table['columns']}
    order_by = params.get('order_by') or (table['primary_key'][0] if table['primary_key'] else table['columns'][0]['name'])
    direction = params.get('direction', 'asc').lower()
    if order_by not in columns or direction not in {'asc', 'desc'}:
        raise QueryError('Недопустимая сортировка.')
    # PK breaks ties for stable pagination (including user-specified sort).
    order = [sql.SQL('{} {} NULLS LAST').format(sql.Identifier(order_by), sql.SQL(direction.upper()))]
    order.extend(sql.SQL('{} ASC').format(sql.Identifier(key)) for key in table['primary_key'] if key != order_by)
    with readonly_cursor(config) as cursor:
        cursor.execute(sql.SQL('SELECT COUNT(*) FROM {}').format(table_identifier(table)))
        total = cursor.fetchone()[0]
        cursor.execute(sql.SQL('SELECT * FROM {} ORDER BY {} LIMIT {} OFFSET {}')
                       .format(table_identifier(table), sql.SQL(', ').join(order), sql.Literal(limit + 1), sql.Literal(offset)))
        result = read_rows(cursor, limit, settings.QUERY_MAX_BYTES)
    return {**result, 'database': database, 'table': table['name'], 'schema': table['schema'],
            'column_details': table['columns'], 'total': total, 'limit': limit, 'offset': offset,
            'has_more': result['truncated'] or offset + result['row_count'] < total,
            'order_by': order_by, 'direction': direction}


def suggest_values(database, config, table_name, field, prefix):
    table = find_table(schema_for(database, config), table_name)
    if field not in {column['name'] for column in table['columns']}:
        raise QueryError('Поле не найдено.', 'column_not_found', 404)
    if len(prefix) > 100:
        raise QueryError('Префикс слишком длинный.')
    # Treat wildcard characters literally, with a fully parameterized value.
    prefix = prefix.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    with readonly_cursor(config) as cursor:
        # Escape percent signs in quoted identifiers before DB-API interpolation.
        column_sql = sql.Identifier(field).as_string(cursor.cursor).replace('%', '%%')
        table_sql = table_identifier(table).as_string(cursor.cursor).replace('%', '%%')
        statement = f'SELECT DISTINCT {column_sql}::text AS value FROM {table_sql} WHERE {column_sql}::text ILIKE %s ORDER BY 1 LIMIT 10'
        cursor.execute(statement, [prefix + '%'])
        values = [row[0] for row in cursor.fetchall()]
    return {'values': values}
