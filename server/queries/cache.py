import hashlib
import json
import logging
from django.core.cache import cache

logger = logging.getLogger('portal.queries')


def cache_key(namespace, *parts):
    payload = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str)
    return f'portal:v1:{namespace}:{hashlib.sha256(payload.encode()).hexdigest()}'


def get_cached(key):
    try:
        return cache.get(key)
    except Exception:
        logger.warning('query_cache_unavailable operation=read')
        return None


def set_cached(key, value, ttl):
    try:
        cache.set(key, value, timeout=ttl)
    except Exception:
        logger.warning('query_cache_unavailable operation=write')
