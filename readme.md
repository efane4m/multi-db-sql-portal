# Multi-DB SQL Portal

Обновление backend: безопасное выполнение SQL, metadata/preview API, отдельная
роль чтения, тесты и бенчмарки описаны в [docs/BACKEND.md](docs/BACKEND.md).
Фактически выполненные проверки: [docs/BACKEND-VALIDATION.md](docs/BACKEND-VALIDATION.md).
Отчёт о backend-изменениях: [docs/BACKEND-CHANGES.md](docs/BACKEND-CHANGES.md).
Контекст для backend- и frontend-разработчиков, API и следующие задачи — в технической документации выше.
Локальная демо-регистрация клиента и серверные Django-пользователи — разные контуры.

Прототип веб-приложения для выполнения SQL-запросов к нескольким базам данных с разграничением прав доступа, ролями (Администратор / Пользователь) и кэшированием результатов.

https://github.com/user-attachments/assets/be68f42a-4432-4ae5-a070-66b4c268c8ad

## Технологический стек

* **Frontend:** React (Vite), Axios, React Router.
* **Backend:** Python 3.10+, Django, Django REST Framework, SimpleJWT.
* **Базы данных:** PostgreSQL (3 отдельные базы: `auth_db`, `db_stores`, `db_logistics`).
* **Кэширование:** Redis.

## Содержание

1. [Способ 1. Запуск через Docker (рекомендуется)](#способ-1-запуск-через-docker-рекомендуется)
2. [Способ 2. Ручная установка без Docker](#способ-2-ручная-установка-без-docker)
3. [Как пользоваться системой](#как-пользоваться-системой)
4. [Возможные проблемы и их решение](#возможные-проблемы-и-их-решение)

---

## Способ 1. Запуск через Docker (рекомендуется)

Docker сам поднимает PostgreSQL, Redis, бэкенд и фронтенд, создаёт три базы, выполняет миграции и заполняет базы тестовыми данными. Ставить Python, Node.js, PostgreSQL и Redis на компьютер не нужно.

### Что понадобится

* **Git**.
* **Docker Desktop** ([скачать](https://www.docker.com/products/docker-desktop/)). На Windows он использует WSL 2, установщик предложит включить его сам. После установки может потребоваться перезагрузка.

### Шаг 1. Клонирование репозитория

```bash
git clone https://github.com/efane4m/multi-db-sql-portal.git
cd multi-db-sql-portal
```

### Шаг 2. Запуск Docker Desktop

Откройте Docker Desktop и дождитесь статуса **Engine running** (зелёная плашка внизу слева). Проверьте в терминале:

```bash
docker version
```

Должны вывестись два блока: **Client** и **Server**. Если блока Server нет, Docker ещё не запустился, подождите и повторите.

### Шаг 3. Сборка и запуск

Из корня проекта выполните:

```bash
docker compose up -d --build
```

Первая сборка занимает несколько минут: скачиваются образы и устанавливаются зависимости. При старте контейнера `server` автоматически:

1. выполняются миграции для всех трёх баз;
2. заполняются тестовые данные (только если база магазинов пуста, повторный запуск ничего не стирает).

Проверьте, что все четыре контейнера работают:

```bash
docker compose ps
```

Статус должен быть `Up` у `client`, `server`, `db` и `redis`.

### Шаг 4. Создание администратора

Логин и пароль вы придумываете сами и вводите в консоли. В репозитории они нигде не хранятся.

```bash
docker compose exec server python manage.py createsuperuser
```

### Шаг 5. Открытие приложения

| Что | Адрес |
|---|---|
| Сайт | http://localhost:5173 |
| API и админка Django | http://localhost:8000, админка на http://localhost:8000/admin/ |
| PostgreSQL (для pgAdmin) | `localhost:5433`, пользователь `postgres`, пароль `postgres` |

Порт PostgreSQL снаружи именно `5433`, а не `5432`, чтобы не конфликтовать с PostgreSQL, установленным на компьютере. Redis снаружи не доступен, бэкенд подключается к нему внутри сети Docker.

Пароль `postgres` задан в [docker-compose.yml](docker-compose.yml) и подходит только для локальной разработки. Файл `env/.env` при работе через Docker не используется.

### Полезные команды Docker

| Команда | Что делает |
|---|---|
| `docker compose up -d` | Запустить проект (без пересборки) |
| `docker compose stop` | Остановить, данные сохраняются |
| `docker compose down` | Удалить контейнеры, данные баз сохраняются |
| `docker compose down -v` | Удалить контейнеры **и данные баз** (чистый старт) |
| `docker compose logs -f server` | Смотреть логи бэкенда |
| `docker compose up -d --build` | Пересобрать после изменения `requirements.txt` или `package.json` |

Код из папок `server` и `client` подключён в контейнеры, поэтому изменения в файлах подхватываются без пересборки.

---

## Способ 2. Ручная установка без Docker

### Предварительные требования

1. **Python** 3.12 или выше.
2. **Node.js** 20.19+ или 22.12+.
3. **PostgreSQL** (сервер должен быть запущен, желательно с pgAdmin). При установке запомните пароль пользователя `postgres`.
4. **Redis**. Для Windows рекомендуется [Memurai](https://www.memurai.com/): он работает как служба и слушает порт 6379.
5. **Git**.

### Шаг 1. Клонирование репозитория

```bash
git clone https://github.com/efane4m/multi-db-sql-portal.git
cd multi-db-sql-portal
```

### Шаг 2. Переменные окружения

В корне проекта создайте папку `env` (если её нет) и внутри неё файл `.env`:

```env
DB_USER=postgres
DB_PASSWORD=ваш_пароль_от_postgres
DB_HOST=127.0.0.1
DB_PORT=5432
```

Файл `.env` добавлен в `.gitignore` и в репозиторий не попадает. У каждого участника команды он свой.

Если забыли пароль `postgres`, его можно сбросить: временно поменять метод `scram-sha-256` на `trust` в `pg_hba.conf` (папка `data` установки PostgreSQL), перезапустить службу, выполнить в `psql` команду `ALTER USER postgres PASSWORD 'новый_пароль';`, вернуть метод обратно и снова перезапустить службу.

### Шаг 3. Создание баз данных

Откройте pgAdmin (Query Tool) или `psql` под пользователем `postgres` и выполните:

```sql
CREATE DATABASE auth_db;
CREATE DATABASE db_stores;
CREATE DATABASE db_logistics;
```

### Шаг 4. Бэкенд (Django)

```bash
cd server
```

Создайте и активируйте виртуальное окружение.

Windows:
```bash
python -m venv venv
venv\Scripts\activate
```

Mac/Linux:
```bash
python3 -m venv venv
source venv/bin/activate
```

Установите зависимости и выполните миграции для всех трёх баз (в таком порядке):

```bash
pip install -r requirements.txt
python manage.py migrate --database=default
python manage.py migrate --database=db_stores
python manage.py migrate --database=db_logistics
```

Для SQL API настройте отдельные `DB_QUERY_USER` и `DB_QUERY_PASSWORD` (от 16
символов) в `env/.env`, затем после миграций/создания предметных таблиц выполните:

```bash
python manage.py configure_query_reader
```

### Шаг 5. Тестовые данные

```bash
python manage.py seed_data
```

Должно появиться сообщение «Данные успешно добавлены!». Внимание: команда сначала очищает таблицы магазинов и логистики, поэтому повторный запуск пересоздаёт данные.

### Шаг 6. Администратор

```bash
python manage.py createsuperuser
```

Введите логин, email и пароль и запомните их.

### Шаг 7. Фронтенд (React)

Откройте **второй терминал** и из корня проекта выполните:

```bash
cd client
npm install
```

### Запуск

Одновременно должны работать три вещи:

1. **Redis (Memurai)** запущен в фоне (проверьте в «Службах» Windows).
2. **Терминал 1, бэкенд** (из папки `server`, с активным venv):
   ```bash
   python manage.py runserver
   ```
   Сервер: http://localhost:8000
3. **Терминал 2, фронтенд** (из папки `client`):
   ```bash
   npm run dev
   ```
   Сайт: http://localhost:5173

---

## Как пользоваться системой

В приложении нет регистрации: пользователей и их права создаёт администратор через админку.

### 1. Настройка доступов через админку

1. Откройте http://localhost:8000/admin/ и войдите под суперпользователем.
2. Перейдите в **Users → Add user**. Создайте пользователя, например `ivan`, задайте пароль.
3. Откройте карточку `ivan`:
   * В блоке **Дополнительно** заполните ФИО и должность.
   * Прокрутите вниз до блока **Database accesses**.
   * Нажмите *Add another Database access*, выберите `db_stores` (магазины) и сохраните.

Теперь `ivan` имеет доступ только к базе магазинов. Чтобы проверять запросы под собой, выдайте доступы и суперпользователю таким же образом.

### 2. Работа на сайте

1. Откройте http://localhost:5173/login и войдите под созданным пользователем.
2. На странице **Профиль** отображаются данные пользователя.
3. Перейдите в **Работа с БД** и выберите базу `db_stores`.
4. Введите тестовый запрос:
   ```sql
   SELECT s.name AS store, p.name AS product, pr.price
   FROM stores_price pr
   JOIN stores_store s ON pr.store_id = s.id
   JOIN stores_product p ON pr.product_id = p.id;
   ```
5. Нажмите **Выполнить**. Появится таблица с ценами.
6. **Проверка кэширования:** выполните тот же запрос ещё раз. Появится зелёная надпись `(Взято из кэша Redis)`, данные вернутся мгновенно.
7. **Проверка безопасности:** запрос `DELETE FROM stores_store;` вернёт ошибку `Разрешены только SELECT запросы`.

---

## Возможные проблемы и их решение

**Docker**

* **`error during connect ... dockerDesktopLinuxEngine: The system cannot find the file specified`.** Docker Desktop не запущен. Откройте его и дождитесь статуса Engine running. Если не стартует, выполните `wsl --update` в PowerShell от администратора и перезапустите Docker Desktop. Также проверьте, что в BIOS включена виртуализация.
* **Порт уже занят (`port is already allocated`).** Порты 5173, 8000 или 5433 используются другой программой. Остановите её или поменяйте порт слева от двоеточия в [docker-compose.yml](docker-compose.yml).
* **Нужен чистый старт с пустыми базами.** Выполните `docker compose down -v`, затем `docker compose up -d --build`.
* **Не запускается сервер, в логах ошибки.** Выполните `docker compose logs server` и посмотрите последние строки.

**Общие**

* **Не появляется cache hit.** Проверьте Redis: `docker compose ps`, у `redis` должен быть статус `healthy`. При отказе Redis запросы продолжают выполняться без кеша.
* **Ошибка «relation does not exist».** Не выполнены миграции для второстепенных баз. Повторьте три команды `migrate --database=...` (в Docker: `docker compose exec server python manage.py migrate --database=db_stores`, то же для `db_logistics`).
* **Не работает авторизация или после входа возвращает на страницу логина.** Очистите `localStorage` (F12 → Application → Local Storage) и войдите заново, чтобы получить свежий JWT-токен.
* **После входа нет баз в списке «Работа с БД».** Пользователю не выданы доступы. Добавьте их в админке в блоке **Database accesses**.
* **`password authentication failed for user "postgres"` (ручная установка).** Неверный `DB_PASSWORD` в `env/.env`. Исправьте пароль или сбросьте его, как описано в шаге 2 ручной установки.
