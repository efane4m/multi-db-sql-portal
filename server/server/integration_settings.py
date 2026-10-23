"""Tests CREATE test_* databases; never run migrations against production data."""
import os
import secrets
# Never reconfigure the application's role, even inside `docker compose exec`.
os.environ['DB_QUERY_USER'] = 'portal_test_reader'
os.environ['DB_QUERY_PASSWORD'] = secrets.token_urlsafe(32)
from .settings import *  # noqa: F403,E402

CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
# Keep reader credentials when Django configures TEST.MIRROR; set them again in
# integration setUpClass because mirror settings are copied from migration alias.
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
PORTAL_INTEGRATION_TESTS = True

