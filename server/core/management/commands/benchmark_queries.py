import json
import statistics
import time
import tracemalloc
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections, connections
from rest_framework.test import APIClient
from core.models import User
from queries.access import require_database
from queries.database import readonly_cursor
from queries.parser import validate_select
from queries.schema import schema_for
from psycopg2 import sql

QUERIES = {
    'count': 'SELECT count(*) AS total FROM bench_sale',
    'indexed_filter': 'SELECT id, store_id, quantity FROM bench_sale WHERE store_id=42 ORDER BY id LIMIT 1000',
    'join': '''SELECT s.region, count(*) AS sales, sum(b.quantity*p.price) AS revenue
               FROM bench_sale b JOIN bench_store s ON b.store_id=s.id
               JOIN bench_product p ON b.product_id=p.id GROUP BY s.region ORDER BY s.region''',
    'large_result': 'SELECT id, store_id, product_id, quantity, sold_on FROM bench_sale ORDER BY id LIMIT 100000',
}


class Command(BaseCommand):
    help = 'Замеряет SQL/API/cache и конкурентные запросы; не создаёт пользователей и не меняет данные.'

    def add_arguments(self, parser):
        parser.add_argument('--username', required=True)
        parser.add_argument('--database', default='db_stores')
        parser.add_argument('--repeats', type=int, default=5)
        parser.add_argument('--workers', type=int, default=1)
        parser.add_argument('--explain', action='store_true')
        parser.add_argument('--assert-ms', type=float, default=5000)
        parser.add_argument('--output', help='Путь к JSON-отчёту (генерируемый артефакт).')
        parser.add_argument('--memory', action='store_true', help='Измерять Python allocations; увеличивает время.')

    def handle(self, *args, **options):
        if not 1 <= options['repeats'] <= 100 or not 1 <= options['workers'] <= 16:
            raise CommandError('repeats: 1..100; workers: 1..16.')
        try:
            user = User.objects.get(username=options['username'], is_active=True)
            config = require_database(user, options['database'])
        except Exception:
            raise CommandError('Нужен активный серверный пользователь с доступом к БД.') from None

        def request(query, refresh):
            close_old_connections()
            try:
                client = APIClient()
                client.force_authenticate(user)
                started = time.perf_counter()
                response = client.post('/api/query/', {'db_name': options['database'], 'query': query, 'refresh': refresh},
                                       format='json', HTTP_HOST='localhost')
                elapsed = (time.perf_counter() - started) * 1000
                if response.status_code != 200:
                    raise CommandError(f'API: HTTP {response.status_code}, {response.data.get("code", "error")}')
                return elapsed, response.data
            finally:
                connections.close_all()

        report = {'database': options['database'], 'repeats': options['repeats'], 'workers': options['workers'],
                  'max_rows': settings.QUERY_MAX_ROWS, 'max_bytes': settings.QUERY_MAX_BYTES,
                  'cache_backend': settings.CACHES['default']['BACKEND'], 'queries': {}}
        failed = False
        if options['memory']:
            tracemalloc.start()
        for name, query in QUERIES.items():
            with ThreadPoolExecutor(max_workers=options['workers']) as pool:
                samples = list(pool.map(lambda _: request(query, True), range(options['repeats'])))
            cold = [sample[0] for sample in samples]
            warm_ms, warm = request(query, False)
            stats = {'uncached_min_ms': round(min(cold), 2), 'uncached_median_ms': round(statistics.median(cold), 2),
                     'uncached_max_ms': round(max(cold), 2), 'cached_request_ms': round(warm_ms, 2),
                     'cache_hit': warm['cached'], 'row_count': warm['row_count'], 'truncated': warm['truncated'],
                     'under_target': max(cold) <= options['assert_ms']}
            if options['explain']:
                normalized = validate_select(query, schema_for(options['database'], config))
                with readonly_cursor(config) as cursor:
                    cursor.execute(sql.SQL('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) {}').format(sql.SQL(normalized)))
                    stats['explain_select'] = cursor.fetchone()[0]
                    cursor.execute(sql.SQL('EXPLAIN (FORMAT JSON) DECLARE benchmark_plan NO SCROLL CURSOR FOR SELECT * FROM ({}) r LIMIT {}')
                                   .format(sql.SQL(normalized), sql.Literal(settings.QUERY_MAX_ROWS + 1)))
                    stats['cursor_plan'] = cursor.fetchone()[0]
            report['queries'][name] = stats
            failed |= not stats['under_target']
        client = APIClient()
        client.force_authenticate(user)
        report['metadata_api_ms'] = {}
        for name, suffix in {
            'schema': 'schema/',
            'preview': 'tables/bench_sale/preview/?limit=50',
            'suggestions': 'tables/bench_store/suggestions/?field=region&prefix=',
        }.items():
            started = time.perf_counter()
            response = client.get(f'/api/databases/{options["database"]}/{suffix}', HTTP_HOST='localhost')
            if response.status_code != 200:
                raise CommandError(f'{name}: HTTP {response.status_code}')
            report['metadata_api_ms'][name] = round((time.perf_counter() - started) * 1000, 2)
        if options['memory']:
            report['peak_python_bytes'] = tracemalloc.get_traced_memory()[1]
            tracemalloc.stop()
        if options['output']:
            Path(options['output']).write_text(json.dumps(report, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
        self.stdout.write(json.dumps(report, ensure_ascii=False, indent=2, default=str))
        if failed:
            raise CommandError('Часть запросов превысила целевое время; см. отчёт.')
