from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import connections
from django.core.cache import cache
import hashlib
from .models import DatabaseAccess

# Create your views here.

class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        user = request.user
        photo_url = request.build_absolute_uri(user.photo.url) if user.photo else None
        return Response({'username': user.username,'full_name': user.full_name,'position': user.position,'role': user.role,'photo': photo_url})

class AvailableDatabasesView(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        if request.user.role == 'admin':
            dbs = ['db_stores', 'db_logistics']
        else:
            dbs = list(DatabaseAccess.objects.filter(user=request.user).values_list('db_name', flat=True))
        return Response({'databases': dbs})

class ExecuteQueryView(APIView):
    permission_classes = [IsAuthenticated]
    def post(self, request):
        db_name = request.data.get('db_name')
        sql_query = request.data.get('query')
        
        if not db_name or not sql_query: 
            return Response({'error': 'Укажите БД и запрос'}, status=400)
            
        if request.user.role != 'admin' and not DatabaseAccess.objects.filter(user=request.user, db_name=db_name).exists():
            return Response({'error': 'Нет доступа к этой БД'}, status=403)
            
        if not sql_query.strip().upper().startswith('SELECT'):
            return Response({'error': 'Разрешены только SELECT запросы'}, status=400)

        # --- КЭШИРОВАНИЕ (Безопасное) ---
        query_hash = hashlib.md5(sql_query.encode()).hexdigest()
        cache_key = f"db_query_{db_name}_{query_hash}"
        
        try:
            cached_data = cache.get(cache_key)
            if cached_data: 
                return Response({'data': cached_data, 'cached': True})
        except Exception as e:
            print("⚠️ Ошибка чтения из Redis (возможно, он не запущен):", e)

        # --- ЗАПРОС В БД ---
        try:
            with connections[db_name].cursor() as cursor:
                cursor.execute(sql_query)
                columns = [col[0] for col in cursor.description]
                rows = cursor.fetchall()
                result = [dict(zip(columns, row)) for row in rows]
                
                # Пытаемся сохранить в кэш
                try:
                    cache.set(cache_key, result, timeout=300)
                except Exception as e:
                    print("⚠️ Ошибка записи в Redis:", e)
                    
                return Response({'data': result, 'cached': False})
        except Exception as e:
            return Response({'error': f"Ошибка базы данных: {str(e)}"}, status=400)