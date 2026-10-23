"""Real PostgreSQL tests. Run explicitly with server.integration_settings."""
import io
import os
from unittest import skipUnless
from unittest.mock import patch
from django.conf import settings
from django.core.cache import cache
from django.core.management import call_command
from django.db import connections, DatabaseError, transaction
from django.test import TransactionTestCase, override_settings
from rest_framework.test import APIClient
from core.models import User, DatabaseAccess
from stores.models import Store, Product, Price


@skipUnless(getattr(settings, 'PORTAL_INTEGRATION_TESTS', False), 'Use server.integration_settings')
class PostgreSQLTests(TransactionTestCase):
    databases = ({'default', 'db_stores', 'db_logistics', 'query_db_stores', 'query_db_logistics'}
                 if getattr(settings, 'PORTAL_INTEGRATION_TESTS', False) else {'default'})

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if connections['db_stores'].vendor != 'postgresql':
            raise RuntimeError('Use server.integration_settings and PostgreSQL.')
        call_command('configure_query_reader', stdout=io.StringIO())
        for name in ('db_stores', 'db_logistics'):
            connection = connections[f'query_{name}']
            connection.close()
            connection.settings_dict['USER'] = os.environ['DB_QUERY_USER']
            connection.settings_dict['PASSWORD'] = os.environ['DB_QUERY_PASSWORD']

    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='pg_reader', role='user')
        DatabaseAccess.objects.create(user=self.user, db_name='db_stores')
        store = Store.objects.create(name='Тестовый магазин', address='Адрес', region='Москва')
        product = Product.objects.create(name='Молоко', category='Еда')
        Price.objects.create(store=store, product=product, price='12.50')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def query(self, sql, **extra):
        return self.client.post('/api/query/', {'db_name': 'db_stores', 'query': sql, **extra}, format='json')

    def test_join_and_numeric_serialization(self):
        query = 'SELECT s.name AS store, p.price FROM stores_store s JOIN stores_price p ON p.store_id=s.id'
        response = self.query(query)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data'][0]['price'], '12.50')
        self.assertFalse(response.data['cached'])
        cached = self.query(query)
        self.assertTrue(cached.data['cached'])
        self.assertEqual(cached.data['data'], response.data['data'])

    def test_empty_result_and_refresh(self):
        query = 'SELECT * FROM stores_store WHERE id < 0'
        self.assertEqual(self.query(query).data['data'], [])
        self.assertTrue(self.query(query).data['cached'])
        self.assertFalse(self.query(query, refresh=True).data['cached'])

    def test_schema_pk_fk_and_preview(self):
        response = self.client.get('/api/databases/db_stores/schema/')
        self.assertEqual(response.status_code, 200, response.data)
        tables = {table['name']: table for table in response.data['tables']}
        self.assertEqual(tables['stores_store']['primary_key'], ['id'])
        self.assertEqual(len(tables['stores_price']['foreign_keys']), 2)
        preview = self.client.get('/api/databases/db_stores/tables/stores_store/preview/?limit=1&order_by=name&direction=desc')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['total'], 1)
        self.assertEqual(preview.data['data'][0]['region'], 'Москва')
        columns = self.client.get('/api/databases/db_stores/tables/stores_store/columns/')
        self.assertEqual(columns.status_code, 200)

    def test_preview_validation(self):
        root = '/api/databases/db_stores/tables/stores_store/preview/'
        for suffix in ['?limit=201', '?offset=-1', '?order_by=name;DROP TABLE x', '?direction=sideways']:
            self.assertEqual(self.client.get(root + suffix).status_code, 400)
        self.assertEqual(self.client.get('/api/databases/db_stores/tables/pg_authid/preview/').status_code, 404)

    def test_suggestions_are_parameterized(self):
        url = '/api/databases/db_stores/tables/stores_store/suggestions/'
        response = self.client.get(url, {'field': 'region', 'prefix': 'М'})
        self.assertEqual(response.data['values'], ['Москва'])
        self.assertEqual(self.client.get(url, {'field': 'region', 'prefix': "'; DROP TABLE stores_store;--"}).data['values'], [])
        self.assertEqual(self.client.get(url, {'field': 'region', 'prefix': '%'}).data['values'], [])

    def test_security_rejections_preserve_data(self):
        for query in ['SELECT 1; DELETE FROM stores_store', 'SELECT pg_sleep(1)',
                      'WITH x AS (DELETE FROM stores_store RETURNING *) SELECT * FROM x',
                      'SELECT * INTO stolen FROM stores_store', 'SELECT * FROM stores_store FOR UPDATE']:
            self.assertEqual(self.query(query).status_code, 400)
        self.assertEqual(Store.objects.count(), 1)

    def test_reader_role_cannot_write_even_outside_api(self):
        connection = connections['query_db_stores']
        with connection.cursor() as cursor:
            cursor.execute('SELECT current_user')
            self.assertEqual(cursor.fetchone()[0], os.environ['DB_QUERY_USER'])
        with self.assertRaises(DatabaseError):
            with transaction.atomic(using='query_db_stores'), connection.cursor() as cursor:
                cursor.execute('SET TRANSACTION READ WRITE')
                cursor.execute('DELETE FROM public.stores_store')

    @override_settings(QUERY_MAX_ROWS=2)
    def test_row_limit_duplicates_percent_and_cte(self):
        Store.objects.bulk_create([Store(name=f'S{i}', address='a', region='r') for i in range(5)])
        response = self.query('WITH q AS (SELECT * FROM stores_store) SELECT * FROM q ORDER BY id')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['row_count'], 2)
        self.assertTrue(response.data['truncated'])
        self.assertEqual(self.query("SELECT name FROM stores_store WHERE name LIKE '%магазин%'").status_code, 200)
        self.assertEqual(self.query('SELECT s.id, p.id FROM stores_store s JOIN stores_price p ON p.store_id=s.id').data['code'], 'duplicate_columns')

    @override_settings(QUERY_MAX_BYTES=3)
    def test_result_byte_limit(self):
        response = self.query('SELECT name FROM stores_store')
        self.assertTrue(response.data['truncated'])

    @override_settings(QUERY_TIMEOUT_MS=1)
    def test_timeout_and_connection_recovers(self):
        # A costly SELECT without permitting pg_sleep or any other side-effect function.
        query = '''SELECT sum(a.id*b.id*c.id*d.id) AS n FROM stores_store a
                   CROSS JOIN stores_store b CROSS JOIN stores_store c CROSS JOIN stores_store d'''
        Store.objects.bulk_create([Store(name='x', address='x', region='x') for _ in range(150)])
        response = self.query(query, refresh=True)
        self.assertEqual(response.status_code, 408, response.data)
        with override_settings(QUERY_TIMEOUT_MS=5000):
            self.assertEqual(self.query('SELECT 1 AS ok').status_code, 200)

    @patch('queries.cache.cache')
    def test_redis_failure_does_not_break_query(self, mocked):
        mocked.get.side_effect = ConnectionError()
        mocked.set.side_effect = ConnectionError()
        self.assertEqual(self.query('SELECT 1 AS ok').status_code, 200)

    def test_internal_db_errors_are_sanitized(self):
        response = self.query('SELECT secret_missing_column FROM stores_store')
        self.assertEqual(response.status_code, 400)
        self.assertNotIn('secret_missing_column', str(response.data))

    def test_result_types_and_audit_without_values(self):
        with self.assertLogs('portal.queries', level='INFO') as logged:
            response = self.query("SELECT 'private-value' AS marker, 'NaN'::float8 AS n, '\\x4142'::bytea AS binary, CURRENT_DATE AS today")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['data'][0]['n'], 'NaN')
        self.assertEqual(response.data['data'][0]['binary'], 'QUI=')
        self.assertRegex(response.data['data'][0]['today'], r'^\d{4}-\d{2}-\d{2}$')
        self.assertNotIn('private-value', ' '.join(logged.output))

    def test_cache_comment_normalization_and_user_isolation(self):
        self.query('SELECT 1 AS ok')
        self.assertTrue(self.query('SELECT 1 AS ok /* a comment */').data['cached'])
        other = User.objects.create_user(username='pg_other')
        DatabaseAccess.objects.create(user=other, db_name='db_stores')
        self.client.force_authenticate(other)
        self.assertFalse(self.query('SELECT 1 AS ok').data['cached'])
