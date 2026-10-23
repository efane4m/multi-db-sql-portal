from unittest.mock import patch
from django.conf import settings
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from core.models import DatabaseAccess, User
from queries.access import require_database
from queries.cache import cache_key, get_cached, set_cached
from queries.errors import QueryError
from queries.preview import integer_parameter


class AccessTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='reader', password='test-password')
        self.admin = User.objects.create_user(username='manager', role='admin')
        DatabaseAccess.objects.create(user=self.user, db_name='db_stores')
        self.client = APIClient()

    def test_jwt_login_and_authenticated_databases(self):
        self.assertEqual(self.client.get('/api/databases/').status_code, 401)
        response = self.client.post('/api/login/', {'username': 'reader', 'password': 'test-password'})
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        self.assertEqual(self.client.get('/api/databases/').data['databases'], ['db_stores'])

    def test_all_endpoints_require_auth(self):
        for url in ['/api/databases/db_stores/schema/', '/api/databases/db_stores/tables/',
                    '/api/databases/db_stores/tables/stores_store/columns/',
                    '/api/databases/db_stores/tables/stores_store/preview/',
                    '/api/databases/db_stores/tables/stores_store/suggestions/']:
            self.assertEqual(self.client.get(url).status_code, 401)
        self.assertEqual(self.client.post('/api/query/', {}).status_code, 401)

    @patch('queries.views.schema_for')
    def test_denied_before_schema_or_query(self, mocked):
        self.client.force_authenticate(self.user)
        for db in ['db_logistics', 'default', 'query_db_stores', 'missing']:
            for suffix in ['schema/', 'tables/stores_store/preview/', 'tables/stores_store/columns/',
                           'tables/stores_store/suggestions/?field=name']:
                self.assertEqual(self.client.get(f'/api/databases/{db}/{suffix}').status_code, 403)
            self.assertEqual(self.client.post('/api/query/', {'db_name': db, 'query': 'SELECT 1'}).status_code, 403)
        mocked.assert_not_called()

    def test_admin_and_new_database_registration(self):
        databases = {**settings.QUERY_DATABASES, 'db_extra': {'read_alias': 'query_db_extra'}}
        with override_settings(QUERY_DATABASES=databases):
            self.client.force_authenticate(self.admin)
            self.assertIn('db_extra', self.client.get('/api/databases/').data['databases'])
            DatabaseAccess.objects.create(user=self.user, db_name='db_extra')
            self.assertEqual(require_database(self.user, 'db_extra'), databases['db_extra'])
            with self.assertRaises(QueryError):
                require_database(self.admin, 'default')

    def test_revocation_is_checked_even_if_result_cached(self):
        self.client.force_authenticate(self.user)
        DatabaseAccess.objects.filter(user=self.user).delete()
        self.assertEqual(self.client.post('/api/query/', {'db_name': 'db_stores', 'query': 'SELECT 1'}).status_code, 403)

    def test_input_validation(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.post('/api/query/', [], format='json').status_code, 400)
        for value in [None, [], 12, '']:
            self.assertEqual(self.client.post('/api/query/', {'db_name': 'db_stores', 'query': value}, format='json').status_code, 400)
        self.assertEqual(self.client.post('/api/query/', {'db_name': 'db_stores', 'query': 'SELECT 1', 'refresh': 'yes'}).status_code, 400)


class CacheTests(TestCase):
    def test_empty_result_and_isolation(self):
        key = cache_key('query', 1, 'db_stores', 'SELECT 1')
        set_cached(key, {'data': []}, 30)
        self.assertEqual(get_cached(key), {'data': []})
        self.assertNotEqual(key, cache_key('query', 2, 'db_stores', 'SELECT 1'))
        self.assertNotEqual(key, cache_key('query', 1, 'db_logistics', 'SELECT 1'))

    @patch('queries.cache.cache')
    def test_cache_failure_is_nonfatal(self, mocked):
        mocked.get.side_effect = ConnectionError()
        mocked.set.side_effect = ConnectionError()
        self.assertIsNone(get_cached('x'))
        set_cached('x', [], 30)

    def test_integer_limits(self):
        for value in ['-1', '1.5', '2000', {}, True]:
            with self.subTest(value=value), self.assertRaises(QueryError):
                integer_parameter(value, 'limit', 1, 200)
