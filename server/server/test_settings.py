"""Fast tests use SQLite only for auth/permissions; PG integration has own config."""
from .settings import *  # noqa: F403

SECRET_KEY = 'test-only-key-not-used-by-the-application'
DATABASES = {'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}}
DATABASE_ROUTERS = []
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']

