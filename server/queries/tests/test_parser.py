from django.test import SimpleTestCase
from queries.errors import QueryError
from queries.parser import validate_select

SCHEMA = {'tables': [
    {'schema': 'public', 'name': 'stores_store'},
    {'schema': 'public', 'name': 'stores_price'},
]}


class ParserTests(SimpleTestCase):
    def test_join_cte_aggregation_window_and_comments(self):
        queries = [
            'SELECT * FROM stores_store',
            'SELECT s.name, p.price FROM stores_store s JOIN stores_price p ON p.store_id=s.id',
            'WITH q AS (SELECT * FROM stores_store) SELECT * FROM q',
            "SELECT region, COUNT(*) AS n FROM stores_store GROUP BY region HAVING COUNT(*)>0 ORDER BY n DESC",
            'SELECT row_number() OVER (ORDER BY id) AS n FROM stores_store',
            "SELECT name::text FROM stores_store WHERE name ILIKE 'М%' /* refresh:12 */",
            "SELECT '; DELETE FROM x' AS text",
            'SELECT 1 UNION ALL SELECT 2',
            'SELECT CURRENT_DATE',
            'SELECT * FROM (SELECT * FROM stores_store) s',
            'SELECT * FROM stores_store WHERE id IN (SELECT store_id FROM stores_price)',
        ]
        for query in queries:
            with self.subTest(query=query):
                self.assertIsInstance(validate_select(query, SCHEMA), str)

    def test_mutation_and_escape_routes_rejected(self):
        queries = [
            'DELETE FROM stores_store', 'UPDATE stores_store SET name=\'x\'',
            'DROP TABLE stores_store', 'COPY stores_store TO STDOUT',
            'SELECT 1; DELETE FROM stores_store',
            'SELECT * INTO copied FROM stores_store',
            'SELECT * FROM stores_store FOR UPDATE',
            'WITH x AS (DELETE FROM stores_store RETURNING *) SELECT * FROM x',
            'WITH RECURSIVE x AS (SELECT 1 UNION ALL SELECT 1) SELECT * FROM x',
            "SELECT pg_sleep(10)", "SELECT pg_read_file('/etc/passwd')",
            "SELECT set_config('transaction_read_only','off',true)",
            "SELECT nextval('x')", 'SELECT public.count(*) FROM stores_store',
            'SELECT * FROM pg_catalog.pg_authid', 'SELECT * FROM information_schema.columns',
            'SELECT * FROM auth_user', 'SELECT 1::regclass',
            "SELECT 1 OPERATOR(public.+) 2", 'SELECT current_user',
            'SELECT * FROM generate_series(1,10)',
            'SELECT * FROM stores_store TABLESAMPLE SYSTEM(100)',
            'SELECT 1 COLLATE "C"',
        ]
        for query in queries:
            with self.subTest(query=query), self.assertRaises(QueryError):
                validate_select(query, SCHEMA)

    def test_qualification_and_function_rewrite(self):
        result = validate_select('SELECT count(*) FROM stores_store', SCHEMA)
        self.assertIn('public.stores_store', result)
        self.assertIn('pg_catalog.count', result)

    def test_cte_scope_cannot_hide_forbidden_relation(self):
        with self.assertRaises(QueryError):
            validate_select('SELECT * FROM (WITH auth_user AS (SELECT 1) SELECT * FROM auth_user) s, auth_user', SCHEMA)

    def test_invalid_input_and_complexity(self):
        for query in ['', None, {}, 'SELECT FROM', 'SELECT 1' * 10000]:
            with self.subTest(query=str(query)[:20]), self.assertRaises(QueryError):
                validate_select(query, SCHEMA)
