# Backend: SQL, схема БД, предпросмотр и проверка производительности

Краткий отчёт о выполненной части: [BACKEND-CHANGES.md](BACKEND-CHANGES.md).
Фактические проверки и ограничения: [BACKEND-VALIDATION.md](BACKEND-VALIDATION.md).

Реализован backend-модуль `server/queries`. Существующий `POST /api/query/` сохранён;
ответ по-прежнему содержит `data` и `cached`. Добавлены ограничение результата,
метаданные, безопасность, аудит и отдельные API для схемы и предпросмотра.

Клиентский адаптер переведён на metadata API; кнопка «Обновить» передаёт
`refresh: true`. Интерфейс предпросмотра и SQL-редактор с `j → JOIN` остаются
за frontend-разработчиком. Backend уже отдаёт таблицы, типы, PK и FK для них.

## Архитектура

```text
JWT → проверка DatabaseAccess → зарегистрированная QUERY_DATABASES
    → schema allowlist → PostgreSQL AST parser → нормализованный SELECT
    → кеш пользователя → read-only connection/transaction → DECLARE/FETCH
    → лимиты строк/байтов → JSON → метрики без текста SQL и значений
```

- `queries/access.py`: проверка БД до обращения к metadata/cache/query.
- `queries/schema.py`: реальные таблицы (не views/foreign tables), поля, PK/FK.
- `queries/parser.py`: pglast, один SELECT, консервативный allowlist AST.
- `queries/database.py`: отдельная роль, READ ONLY, timeouts, безопасный search_path.
- `queries/executor.py`: серверный курсор, пакетное чтение, лимиты и аудит.
- `queries/preview.py`: безопасные идентификаторы, пагинация, сортировка, подсказки.
- `queries/cache.py`: SHA-256 ключи, изоляция пользователей, TTL, обработка отказа Redis.

Поддерживаются SELECT, JOIN, агрегаты, оконные функции, подзапросы, UNION и
нерекурсивные SELECT CTE. DML/DDL, несколько statements, SELECT INTO, блокировки,
модифицирующие/рекурсивные CTE, системные таблицы, пользовательские функции,
неразрешённые типы и конструкции отклоняются. В SQL-редакторе нельзя читать
`information_schema`: для этого теперь существует schema API.

Разрешённые функции и типы перечислены в `queries/parser.py`. Функции/типы
квалифицируются `pg_catalog`, таблицы — разрешённой схемой. Роль не должна быть
superuser, CREATEDB, CREATEROLE или BYPASSRLS. Доверенный администратор отвечает
за определения таблиц, установленные расширения, типы и PostgreSQL-права PUBLIC.
Эта реализация не предназначена для выполнения произвольного PostgreSQL-диалекта.

## Запуск через Docker

Из корня проекта:

```powershell
docker compose up -d --build
docker compose logs server
docker compose exec server python manage.py check
docker compose exec server python manage.py makemigrations --check --dry-run
```

Entrypoint выполняет миграции трёх БД и существующий seed на пустой БД, затем
создаёт `portal_reader` и выдаёт SELECT только на предметные таблицы. Пароль
генерируется в контейнере в `/tmp/portal-reader-password` с правами 0600.
Его читает и сервер, и команды `docker compose exec`. Пароль не печатается.
Можно передать собственный `DB_QUERY_PASSWORD` длиной от 16 символов.

Повторная настройка прав после создания новых таблиц:

```powershell
docker compose exec server python manage.py configure_query_reader
```

Нужные endpoints: `http://localhost:8000/api/`; Django admin: `/admin/`.
Для проверки создайте **серверного** пользователя, задайте `role=admin` или
выдайте `DatabaseAccess`. Django `is_superuser` и поле `role` — разные признаки.
Локальные демо-аккаунты браузера не проверяют этот backend.

## Ручной запуск

Нужны Python 3.12+, PostgreSQL и Redis. В `env/.env` задаются существующие
`DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, дополнительно `DB_QUERY_USER` и
`DB_QUERY_PASSWORD`. Роль чтения должна отличаться от административной роли.
Миграционные credentials должны иметь права создавать/настраивать reader-role.

```powershell
cd server
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe manage.py migrate --database=default
.\venv\Scripts\python.exe manage.py migrate --database=db_stores
.\venv\Scripts\python.exe manage.py migrate --database=db_logistics
.\venv\Scripts\python.exe manage.py configure_query_reader
.\venv\Scripts\python.exe manage.py runserver
```

Отсутствующий Redis не мешает выполнению SQL: кеш работает в режиме best effort.
Для наблюдения за cache hit Redis должен быть доступен по `REDIS_URL`.

## Контракт API

Все endpoints требуют `Authorization: Bearer <access>`, полученный от
`POST /api/login/`. Значения JWT и паролей в отчёты не выводить.

| Метод | Путь | Ответ/параметры |
|---|---|---|
| GET | `/api/databases/` | `databases: [logical_name]` |
| GET | `/api/databases/{db}/schema/` | `database`, `tables`, поля/типы/nullable, PK/FK; `?refresh=true` обновляет metadata |
| GET | `/api/databases/{db}/tables/` | тот же полный список таблиц с метаданными |
| GET | `/api/databases/{db}/tables/{table}/columns/` | описание одной таблицы, `columns`, `primary_key`, `foreign_keys` |
| GET | `/api/databases/{db}/tables/{table}/preview/` | `limit=1..200`, `offset=0..1000000`, `order_by`, `direction=asc/desc` |
| GET | `/api/databases/{db}/tables/{table}/suggestions/` | `field`, `prefix` до 100 символов; ответ `values`, не более 10 |
| POST | `/api/query/` | `{db_name, query, refresh?: boolean}` |

`table` можно передать как `stores_store` или `public.stores_store`. При одинаковых
именах в разных схемах требуется полное имя. Preview сортирует по указанному полю
и добавляет PK для стабильного порядка; без PK строгой стабильности нет.
Preview возвращает `data`, `columns`, `column_details`, `total`, `limit`, `offset`,
`row_count`, `has_more`, `truncated`, `order_by`, `direction`.
`total` — точный COUNT под таймаутом, может вернуть 408 на очень большой таблице.

Пример SELECT с JOIN:

```json
{
  "db_name": "db_stores",
  "query": "SELECT s.name AS store, p.price FROM stores_store s JOIN stores_price p ON p.store_id=s.id",
  "refresh": true
}
```

Ответ:

```json
{
  "data": [{"store": "Магазин", "price": "12.50"}],
  "columns": ["store", "price"],
  "row_count": 1,
  "truncated": false,
  "cached": false,
  "max_rows": 10000,
  "execution_ms": 12.3,
  "request_id": "идентификатор запроса"
}
```

Decimal передаётся строкой без потери точности; даты — ISO; bytea — base64;
нечисловые float NaN/Infinity — строками. Для одинаковых названий колонок в JOIN
нужно явно указать уникальные AS, иначе `duplicate_columns` (400).
Пустая выборка сохраняет `columns` и кешируется. По умолчанию максимум 10 000 строк
и примерно 5 MB значений JSON; `truncated=true` означает усечение. Это лимит
ответа, а не гарантия максимальной памяти PostgreSQL или размера отдельного поля.

Ошибки имеют `{error, code}`: 400 — вход/SQL/типы, 401 — JWT, 403 — доступ к БД,
404 — таблица/поле, 408 — timeout/lock timeout, 503 — БД/небезопасная роль.
В ответе нет внутреннего SQL-исключения или credentials.

## Кеш и аудит

Ключ включает user ID, логическую БД, конфигурацию, нормализованный SQL и лимиты.
Права БД проверяются **перед** кешем; отзыв доступа действует сразу.
Комментарии и форматирование не создают новый ключ. `refresh=true` пропускает
чтение кеша и обновляет значение. TTL результата — 300 секунд, схемы — 30 секунд.
После DDL используйте `schema/?refresh=true`. Изменение строк другими приложениями
не инвалидирует кеш автоматически: используйте refresh или дождитесь TTL.

Журнал `portal.queries`: user ID, имя БД, request ID, hash SQL, статус, cache hit,
число строк и длительность. Сам SQL и значения не журналируются модулем.
Стандартные DEBUG-логи PostgreSQL/Django требуют собственной production-настройки.

Переменные: `QUERY_TIMEOUT_MS=5000`, `QUERY_LOCK_TIMEOUT_MS=1000`,
`QUERY_MAX_ROWS=10000`, `QUERY_MAX_BYTES=5000000`. Для курсора действует также
общий дедлайн чтения, а не независимые 5 секунд на каждую партию.

## Подключение дополнительной БД

Сначала создайте БД (команда ниже создаёт только новую пустую `db_analytics`):

```powershell
docker compose exec db psql -U postgres -d postgres -c 'CREATE DATABASE db_analytics;'
$env:QUERY_DATABASES_JSON='{"db_analytics":{"name":"db_analytics","label":"Аналитика","schemas":["public"]}}'
docker compose up -d --force-recreate server
docker compose exec server python manage.py seed_benchmark --database db_analytics --rows 1000
docker compose exec server python manage.py configure_query_reader
```

Новая база автоматически доступна роли `admin`. Обычному пользователю добавьте
`db_analytics` в DatabaseAccess через Django admin: список формируется из настроек.
В настройках дополнительной БД допустимы `name`, `host`, `port`, `schemas`, `label`;
учётные записи миграций/чтения общие. Только PostgreSQL, без динамического ввода
credentials через HTTP. `default`, внутренние `query_*` aliases не принимаются.
Зарегистрированная БД должна существовать до запуска server; создание production
БД и выдача прав выполняются администратором вне публичного API.

## Автоматическая проверка

Быстрые тесты (без PostgreSQL и Redis, SQLite только для auth/permissions):

```powershell
docker compose exec server python manage.py test queries.tests --settings=server.test_settings
```

В этом режиме PostgreSQL- и Redis-тесты пропускаются. Полные PostgreSQL-тесты:

```powershell
docker compose exec server python manage.py test queries.tests --settings=server.integration_settings --noinput
```

Они создают/удаляют `test_auth_db`, `test_db_stores`, `test_db_logistics`, не рабочие
базы. Административной роли нужен CREATEDB. Запускайте на dev/test сервере.
Тестовый reader всегда `portal_test_reader`; пароль генерируется в процессе.
Environment основного reader контейнера намеренно не используется, чтобы
тесты не перенастраивали его. Не запускайте два integration-набора одновременно
на одном PostgreSQL-кластере: у них общие имена test_* баз и тестовой роли.

Реальный Redis проверяется отдельно (уникальные ключи, без FLUSHDB):

```powershell
docker compose exec -e PORTAL_TEST_REDIS_URL=redis://redis:6379/15 server python manage.py test queries.tests.test_redis --settings=server.test_settings
```

Frontend:

```powershell
cd client
npm ci
npm test
npm run build
```

Проверка API уже запущенного сервера с JWT (из корня, спросит credentials и не
выведет токен; SQL rejection-проверки выполняются без изменения данных):

```powershell
.\scripts\check-backend.ps1 -Database db_stores
```

Скрипт проверяет схему, поля, preview, подсказки, JOIN по найденному FK, SELECT,
refresh, кеш, пустую выборку и запреты опасного SQL/служебной БД. Для отдельной
проверки отзыва прав удалите DatabaseAccess в Django admin и повторите GET/POST:
должен вернуться 403, в том числе после cache hit. Пользователь с ролью admin
получает доступ независимо от DatabaseAccess — для проверки используйте role=user.

## Большой объём, индексы и планы

Генератор добавляет отдельные `bench_store`, `bench_product`, `bench_sale`.
Предметные таблицы проекта не очищаются. Повторный запуск использует ON CONFLICT;
меньший `--rows` не уменьшает уже созданный объём. Команда не добавлена в startup.

```powershell
docker compose exec server python manage.py seed_benchmark --rows 1000000
docker compose exec server python manage.py configure_query_reader
docker compose exec server python manage.py benchmark_queries --username YOUR_SERVER_USERNAME --repeats 5 --workers 2 --explain
```

Замените `YOUR_SERVER_USERNAME` на серверного пользователя с доступом к db_stores.
Бенчмарк использует Django/DRF test client с уже выбранным пользователем, проверяет
права и проходит через API/сериализацию, но не измеряет браузер, сеть и JWT-вход.
`--workers` — конкурентные потоки; `--repeats` — число проб каждого запроса.
`--output /tmp/performance-results.json` сохраняет отчёт; `--memory` добавляет
пик Python allocations через tracemalloc (не PostgreSQL RSS), увеличивая время.
EXPLAIN ANALYZE сохраняется для обычного SELECT; отдельно сохраняется план
серверного курсора: эти планы могут различаться, поскольку курсоры не используют
параллельный SELECT-план. Команда завершается ошибкой при превышении `--assert-ms`.

Проверяются COUNT, индексный фильтр, JOIN трёх таблиц и большой результат.
В `large_result` SQL запрашивает 100 000 строк, но API обрезает их до 10 000:
это проверка защитного лимита, **не** доказательство виртуализации 100 000 строк.

Для отдельного локального окружения есть `server.validation_settings` и команда
`prepare_local_validation`: создаются только базы `validation_*`, пользователь
`validation_reader` с непригодным для входа паролем и права на эти БД. Пример после
настройки DB_HOST/DB_PORT/административных credentials, отдельного
DB_QUERY_USER=portal_validation_reader и DB_QUERY_PASSWORD:

```powershell
python manage.py prepare_local_validation --settings=server.validation_settings
python manage.py seed_benchmark --rows 1000000 --settings=server.validation_settings
python manage.py configure_query_reader --settings=server.validation_settings
python manage.py benchmark_queries --username validation_reader --repeats 3 --workers 2 --explain --settings=server.validation_settings
```

Этот режим по умолчанию использует LocMemCache. Для реального Redis задайте
`VALIDATION_REDIS_URL`. Замеры памяти и Redis надо подписывать соответствующим
backend в отчёте. Генератор создаёт индексы по FK, дате продаж и региону магазина.
Для любого другого запроса требование «не более 5 секунд» не гарантируется:
его нужно измерять на конкретных данных и оборудовании.

## Контекст для backend-разработчика

Основная точка продолжения — `server/queries/`. HTTP-обработчики должны оставаться
тонкими: проверка доступа, разбор SQL, read-only выполнение, лимиты и кеш уже
разделены на сервисы. `core/views.py` сохраняет совместимость существующего
`POST /api/query/`; предметные модели находятся в приложениях `stores` и `logistics`.

При добавлении новых возможностей сохраняйте следующие правила:

- Проверять доступ к зарегистрированной БД до чтения метаданных, кеша и выполнения
  SQL. Серверный `DatabaseAccess`, роль приложения и PostgreSQL reader-role решают
  разные задачи; локальные демо-права браузера не заменяют серверную проверку.
- Выполнять SQL шаблонов и будущего экспорта через существующие проверки и
  read-only сервисы, не через произвольный `cursor.execute` в новом view.
- Передавать значения параметров отдельно от SQL. Существующий `/api/query/`
  принимает только SQL-текст; публичный контракт параметризованных шаблонов ещё
  предстоит согласовать. Простая строковая подстановка пользовательских значений
  недопустима.
- Сохранять поля ответа `data` и `cached`, ошибки `{error, code}` и точность типов.
  Лимиты и таймауты должны действовать также при использовании шаблонов и экспорта.
- После добавления предметных таблиц обновлять reader-права; новые PostgreSQL
  возможности сначала добавлять в allowlist и покрывать отрицательными тестами.

Следующие задачи, ещё не реализованные этой частью:

1. Серверные шаблоны: модель владельца, БД, SQL/структуры, описания и параметров;
   CRUD и выполнение с проверкой владельца и актуального доступа к БД. Формат
   параметров и ответы согласовать с frontend до реализации.
2. История запросов и пользовательские настройки, если они входят в согласованный
   объём. Не сохранять секреты и чувствительные значения без отдельной политики.
3. XML-экспорт и согласованный контракт экспорта: формат, область выгрузки,
   ограничение объёма. Текущий SQL API возвращает ограниченную выборку, поэтому
   полную выгрузку нельзя обозначать как готовую без отдельной реализации.
4. Проверка настоящего Redis и Docker на окружении команды; production-настройки
   авторизации, DEBUG, CORS, HTTPS и секретов. Русификация Django admin — отдельно.

Unit/API-тесты расположены в `server/queries/tests/`; команды PostgreSQL/Redis
проверок и бенчмарка приведены выше. Результаты уже выполненных проверок — в
[BACKEND-VALIDATION.md](BACKEND-VALIDATION.md), с отдельными оговорками о среде.

## Контекст для frontend-разработчика

Точки интеграции — `client/src/constructor/api.js` и `ResultStep.jsx`.
Для реальных БД `fetchSchema` использует schema API, `fetchSuggestions` — отдельный
endpoint подсказок, а `runQuery` принимает `{refresh: true}`. Демо-БД по-прежнему
выполняются в браузере, не на Django/PostgreSQL; проверять backend нужно через
серверный JWT и реальную БД.

Что требуется подключить или доработать:

1. Экран предпросмотра: вызывать `/preview/` при выборе таблицы, передавать
   `limit`, `offset`, `order_by`, `direction`; показывать `total` и страницы.
   Полное описание таблиц уже содержит типы, nullable, PK и FK. Текущий
   `fetchSchema` оставляет только имена и `kind`, поэтому для отображения связей
   нужно сохранить дополнительные метаданные в адаптере.
2. SQL-автодополнение: `j → JOIN` относится к редактору и словарю SQL-ключевых
   слов. Имена таблиц/полей брать из schema API; варианты значений — из
   suggestions API. Это разные источники подсказок. Текущий debounce — 250 мс;
   критерий 200 мс нельзя подтверждать только временем HTTP API.
3. Пробросить из `runQuery` поля `columns`, `row_count`, `truncated`, `max_rows`,
   `execution_ms`, `request_id`: сейчас адаптер возвращает только `data` и `cached`.
   Показывать предупреждение об усечении, сохранять заголовки пустого результата
   и не выдавать ограниченную выборку за все данные таблицы.
4. При отображении и экспорте не преобразовывать Decimal-строки через `Number`
   без необходимости: можно потерять точность. Учитывать ISO-даты и base64 bytea.
5. Согласовать с backend API серверных шаблонов и XML-экспорта. Текущие шаблоны
   localStorage и CSV/JSON/XLSX — существующие клиентские возможности, а не новые
   серверные endpoints.
6. Отдельно реализовать виртуализацию больших результатов и UI асинхронного
   прогресса, если они остаются в объёме проекта: backend-очереди пока нет.

Все новые HTTP-вызовы должны передавать серверный JWT. Обрабатывать 401 как
истечение входа, 403 как отсутствие доступа, 408 как таймаут, 503 как недоступность
БД/небезопасную конфигурацию. В `api.js` уже есть общий обработчик, но
`fetchSuggestions` намеренно скрывает ошибки и возвращает пустой список; для UI,
которому нужно различать «нет вариантов» и отказ сервера, это поведение потребуется
уточнить. Не выводить токены, пароли и полные конфигурации в консоль и сообщения.

## Границы выполненной части

Не добавлялись UI предпросмотра, SQL keyword completion, виртуализация frontend,
серверные шаблоны/история/настройки, XML-экспорт и очередь асинхронных задач:
это следующие задачи команды. Получение метаданных для автодополнения реализовано.
Полная русификация Django admin/production hardening авторизации — отдельные задачи.
Локальная демо-авторизация клиента продолжает работать своим прежним способом.

Технические основания: [PostgreSQL READ ONLY](https://www.postgresql.org/docs/16/sql-set-transaction.html),
[таймауты PostgreSQL](https://www.postgresql.org/docs/16/runtime-config-client.html),
[PostgreSQL AST в pglast](https://pglast.readthedocs.io/en/v7/usage.html).
