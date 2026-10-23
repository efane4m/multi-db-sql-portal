"""Opt-in real Redis test, with isolated keys and no FLUSHDB/FLUSHALL."""
import os
from unittest import skipUnless
from uuid import uuid4
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from queries.cache import cache_key, get_cached, set_cached


@skipUnless(os.getenv('PORTAL_TEST_REDIS_URL'), 'Set PORTAL_TEST_REDIS_URL to run real Redis test')
class RedisTests(SimpleTestCase):
    def test_real_redis_roundtrip_and_expiry(self):
        prefix = f'portal-tests-{uuid4().hex}'
        config = {'default': {'BACKEND': 'django.core.cache.backends.redis.RedisCache',
                              'LOCATION': os.getenv('PORTAL_TEST_REDIS_URL'), 'KEY_PREFIX': prefix}}
        with override_settings(CACHES=config):
            key = cache_key('query', 1, 'db_stores', 'SELECT 1')
            try:
                # Direct access makes an unavailable Redis fail this opt-in test.
                cache.set(key, {'data': []}, timeout=30)
                self.assertEqual(get_cached(key), {'data': []})
                set_cached(key, {'data': [1]}, 0)
                self.assertIsNone(cache.get(key))
            finally:
                cache.delete(key)
