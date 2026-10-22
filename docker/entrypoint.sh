#!/bin/sh
set -e

python manage.py migrate --database=default
python manage.py migrate --database=db_stores
python manage.py migrate --database=db_logistics

# seed_data стирает таблицы, поэтому запускаем только на пустой базе
python manage.py shell -c "
import sys
from stores.models import Store
sys.exit(0 if Store.objects.using('db_stores').exists() else 1)
" || python manage.py seed_data

exec "$@"
