from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction


class Command(BaseCommand):
    help = 'Добавляет изолированные bench_* таблицы и синтетические данные; существующие данные не удаляет.'

    def add_arguments(self, parser):
        parser.add_argument('--database', default='db_stores')
        parser.add_argument('--rows', type=int, default=1000000)

    def handle(self, *args, **options):
        alias, rows = options['database'], options['rows']
        if alias not in settings.QUERY_DATABASES or not 1 <= rows <= 5000000:
            raise CommandError('Нужна зарегистрированная БД и rows от 1 до 5000000.')
        with transaction.atomic(using=alias), connections[alias].cursor() as cursor:
            cursor.execute('''CREATE TABLE IF NOT EXISTS public.bench_store (
                id bigint PRIMARY KEY, name text NOT NULL, region text NOT NULL)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS public.bench_product (
                id bigint PRIMARY KEY, name text NOT NULL, category text NOT NULL, price numeric(12,2) NOT NULL)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS public.bench_sale (
                id bigint PRIMARY KEY, store_id bigint NOT NULL REFERENCES public.bench_store(id),
                product_id bigint NOT NULL REFERENCES public.bench_product(id), quantity integer NOT NULL,
                sold_on date NOT NULL)''')
            cursor.execute('''INSERT INTO public.bench_store
                SELECT n, 'Магазин ' || n, (ARRAY['Москва','Казань','Самара','Тула'])[1+(n%4)]
                FROM generate_series(1,1000) n ON CONFLICT (id) DO NOTHING''')
            cursor.execute('''INSERT INTO public.bench_product
                SELECT n, 'Товар ' || n, 'Категория ' || (n%20), (100+n%10000)::numeric/10
                FROM generate_series(1,10000) n ON CONFLICT (id) DO NOTHING''')
            cursor.execute('''INSERT INTO public.bench_sale
                SELECT n, 1+(n%%1000), 1+((n*17)%%10000), 1+(n%%9), DATE '2025-01-01'+(n%%365)::integer
                FROM generate_series(1,%s) n ON CONFLICT (id) DO NOTHING''', [rows])
            cursor.execute('CREATE INDEX IF NOT EXISTS bench_sale_store_idx ON public.bench_sale(store_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS bench_sale_product_idx ON public.bench_sale(product_id)')
            cursor.execute('CREATE INDEX IF NOT EXISTS bench_sale_date_idx ON public.bench_sale(sold_on)')
            cursor.execute('CREATE INDEX IF NOT EXISTS bench_store_region_idx ON public.bench_store(region)')
            for table in ('bench_store', 'bench_product', 'bench_sale'):
                cursor.execute(f'ANALYZE public.{table}')  # constants, no user identifiers
            cursor.execute('SELECT COUNT(*) FROM public.bench_sale')
            total = cursor.fetchone()[0]
        self.stdout.write(self.style.SUCCESS(f'{alias}: bench_sale={total}; данные сохранены, повторный запуск добавляет недостающие id.'))
        self.stdout.write('После создания новых таблиц выполните configure_query_reader.')
