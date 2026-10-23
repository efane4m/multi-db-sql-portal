import os
from pathlib import Path


def reader_password_file():
    return Path(os.getenv('DB_QUERY_PASSWORD_FILE', '/tmp/portal-reader-password'))


def reader_password():
    configured = os.getenv('DB_QUERY_PASSWORD')
    if configured:
        return configured
    try:
        return reader_password_file().read_text(encoding='utf-8').strip()
    except FileNotFoundError:
        return ''
