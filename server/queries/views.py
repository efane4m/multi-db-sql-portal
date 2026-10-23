from django.db import DatabaseError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .access import require_database
from .database import database_error
from .errors import QueryError
from .executor import execute_query
from .preview import preview_table, suggest_values
from .schema import find_table, schema_for

class QueryAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def handle_exception(self, exc):
        if isinstance(exc, DatabaseError):
            exc = database_error(exc)
        if isinstance(exc, QueryError):
            return Response({'error': str(exc), 'code': exc.code}, status=exc.status)
        return super().handle_exception(exc)


class ExecuteQueryView(QueryAPIView):
    def post(self, request):
        if not isinstance(request.data, dict):
            raise QueryError('Тело запроса должно быть JSON-объектом.')
        database = request.data.get('db_name')
        config = require_database(request.user, database)
        query = request.data.get('query')
        if not isinstance(query, str) or not query.strip():
            raise QueryError('Укажите SQL-запрос.')
        refresh = request.data.get('refresh', False)
        if not isinstance(refresh, bool):
            raise QueryError('refresh должен быть true или false.')
        return Response(execute_query(request.user, database, config, query, refresh))


class SchemaView(QueryAPIView):
    def get(self, request, database):
        config = require_database(request.user, database)
        refresh = request.query_params.get('refresh') == 'true'
        return Response(schema_for(database, config, refresh))


class TablesView(SchemaView):
    pass


class ColumnsView(QueryAPIView):
    def get(self, request, database, table):
        config = require_database(request.user, database)
        return Response(find_table(schema_for(database, config), table))


class PreviewView(QueryAPIView):
    def get(self, request, database, table):
        config = require_database(request.user, database)
        return Response(preview_table(database, config, table, request.query_params))


class SuggestionsView(QueryAPIView):
    def get(self, request, database, table):
        config = require_database(request.user, database)
        return Response(suggest_values(database, config, table, request.query_params.get('field', ''),
                                       request.query_params.get('prefix', '')))
