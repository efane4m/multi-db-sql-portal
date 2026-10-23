"""Conservative PostgreSQL SELECT subset. Unsupported syntax fails closed.

This is one defence layer: execution also requires a read-only DB principal and
transaction, schema allowlists and resource limits. Never treat SQL text as a
parameterized template: only values belong in DB-API parameters.
"""
from pglast import ast, parse_sql, Error
from pglast.stream import RawStream
from .errors import QueryError
from .schema import find_table

ALLOWED_NODES = {
    'SelectStmt', 'ResTarget', 'ColumnRef', 'RangeVar', 'Alias', 'JoinExpr',
    'RangeSubselect', 'WithClause', 'CommonTableExpr', 'SubLink', 'A_Const',
    'A_Star', 'A_Expr', 'BoolExpr', 'NullTest', 'BooleanTest', 'FuncCall',
    'TypeCast', 'TypeName', 'SortBy', 'CaseExpr', 'CaseWhen', 'CoalesceExpr',
    'MinMaxExpr', 'SQLValueFunction', 'A_ArrayExpr', 'RowExpr', 'GroupingSet',
    'WindowDef', 'NamedArgExpr', 'Integer', 'Float', 'String', 'Boolean',
}
SAFE_FUNCTIONS = set('''count sum avg min max abs round ceil ceiling floor trunc
    mod power sqrt sign length char_length character_length lower upper trim
    btrim ltrim rtrim substring substr left right replace concat concat_ws
    strpos split_part date_trunc date_part to_char to_date to_timestamp now
    age extract row_number rank dense_rank lag lead first_value last_value
    nth_value ntile percent_rank cume_dist bool_and bool_or every string_agg
    array_agg array_length cardinality json_agg jsonb_agg json_build_object
    jsonb_build_object json_array_length jsonb_array_length nullif
'''.split())
SAFE_TYPES = set('''int2 int4 int8 smallint integer bigint numeric decimal float4
    float8 real double precision text varchar bpchar char boolean bool date
    timestamp timestamptz time timetz interval json jsonb uuid bytea
'''.split())
SAFE_OPERATORS = set('''= <> != < > <= >= + - * / % ^ || ~~ ~~* !~~ !~~*
    -> ->> #> #>> @> <@ ? ?| ?& & | # << >> ~ !~ ~* !~*
'''.split())


def validate_select(query, schema, max_length=50000):
    if not isinstance(query, str) or not query.strip() or len(query) > max_length:
        raise QueryError('Укажите SQL-запрос допустимой длины.')
    try:
        statements = parse_sql(query)
    except (Error, ValueError, RecursionError):
        raise QueryError('Некорректный синтаксис SQL.') from None
    if len(statements) != 1 or not isinstance(statements[0].stmt, ast.SelectStmt):
        raise QueryError('Разрешён ровно один SELECT-запрос.')
    node_count = 0

    def walk(node, ctes=frozenset(), depth=0):
        nonlocal node_count
        if depth > 100:
            raise QueryError('Слишком сложный запрос.')
        if isinstance(node, (tuple, list)):
            for item in node:
                walk(item, ctes, depth + 1)
            return
        if not isinstance(node, ast.Node):
            return
        node_count += 1
        if node_count > 3000 or type(node).__name__ not in ALLOWED_NODES:
            raise QueryError('Эта конструкция SQL не поддерживается безопасным режимом.')
        skip = set()
        if isinstance(node, ast.SelectStmt):
            if node.intoClause or node.lockingClause:
                raise QueryError('SELECT INTO и блокировки строк запрещены.')
            if node.withClause:
                if node.withClause.recursive:
                    raise QueryError('Рекурсивные CTE запрещены.')
                visible = set(ctes)
                for cte in node.withClause.ctes:
                    if not isinstance(cte.ctequery, ast.SelectStmt):
                        raise QueryError('Изменяющие данные CTE запрещены.')
                    walk(cte.ctequery, frozenset(visible), depth + 1)
                    visible.add(cte.ctename)
                ctes = frozenset(visible)
                skip.add('withClause')
        elif isinstance(node, ast.RangeVar):
            if node.catalogname:
                raise QueryError('Обращение к другой БД запрещено.')
            if not node.schemaname and node.relname in ctes:
                return
            name = f'{node.schemaname}.{node.relname}' if node.schemaname else node.relname
            table = find_table(schema, name)
            node.schemaname = table['schema']
            node.relname = table['name']
        elif isinstance(node, ast.FuncCall):
            names = [part.sval for part in node.funcname]
            if len(names) > 2 or (len(names) == 2 and names[0] != 'pg_catalog') or names[-1] not in SAFE_FUNCTIONS:
                raise QueryError('Функция не разрешена в безопасном режиме.')
            node.funcname = (ast.String(sval='pg_catalog'), ast.String(sval=names[-1]))
        elif isinstance(node, ast.TypeName):
            names = [part.sval for part in node.names or ()]
            if not names or len(names) > 2 or (len(names) == 2 and names[0] != 'pg_catalog') or names[-1] not in SAFE_TYPES:
                raise QueryError('Тип данных не разрешён в безопасном режиме.')
            node.names = (ast.String(sval='pg_catalog'), ast.String(sval=names[-1]))
        elif isinstance(node, ast.A_Expr):
            names = [part.sval for part in node.name or ()]
            if names and (len(names) != 1 or names[0] not in SAFE_OPERATORS):
                raise QueryError('Оператор не разрешён в безопасном режиме.')
        elif isinstance(node, ast.SQLValueFunction):
            if node.op.name not in {'SVFOP_CURRENT_DATE', 'SVFOP_CURRENT_TIME', 'SVFOP_CURRENT_TIME_N',
                                    'SVFOP_CURRENT_TIMESTAMP', 'SVFOP_CURRENT_TIMESTAMP_N',
                                    'SVFOP_LOCALTIME', 'SVFOP_LOCALTIME_N',
                                    'SVFOP_LOCALTIMESTAMP', 'SVFOP_LOCALTIMESTAMP_N'}:
                raise QueryError('Системное значение не разрешено.')
        for field in node:
            if field not in skip:
                walk(getattr(node, field), ctes, depth + 1)

    try:
        walk(statements[0].stmt)
        return RawStream()(statements[0].stmt)
    except RecursionError:
        raise QueryError('Слишком сложный запрос.') from None
