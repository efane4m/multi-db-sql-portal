"""Local benchmark databases; never points to existing auth/stores databases."""
from copy import deepcopy
from .settings import *  # noqa: F403

PORTAL_VALIDATION = True
PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
DATABASES['bootstrap'] = {**deepcopy(DATABASES['default']), 'NAME': 'postgres'}
for alias in ('default', *QUERY_DATABASES):
    DATABASES[alias]['NAME'] = f'validation_{alias}'
    if alias in QUERY_DATABASES:
        DATABASES[QUERY_DATABASES[alias]['read_alias']]['NAME'] = f'validation_{alias}'
if not os.getenv('VALIDATION_REDIS_URL'):
    CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
else:
    CACHES['default']['LOCATION'] = os.environ['VALIDATION_REDIS_URL']
