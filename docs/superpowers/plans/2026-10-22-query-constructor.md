# Конструктор выборок: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Страница `/constructor` во фронтенде: пользователь собирает условия перетаскиванием полей в дерево (И/ИЛИ/НЕ), видит сгенерированный SQL и таблицу результата.

**Architecture:** Вся логика (схема, дерево, SQL, помощники таблицы) в чистых модулях `client/src/constructor/*.js`, покрытых тестами `vitest`. Компоненты React тонкие и только отображают состояние. Дерево условий неизменяемое: каждая операция возвращает новое дерево. Бэкенд не меняется: схема, значения и результат идут через существующий `POST /api/query/`.

**Tech Stack:** React 19, Vite 8, `react-router-dom`, `axios`, `@dnd-kit/core`, `vitest`.

**Spec:** [docs/superpowers/specs/2026-10-22-query-constructor-design.md](../specs/2026-10-22-query-constructor-design.md). Эталон стиля: [query-constructor-style-mockup.html](../specs/query-constructor-style-mockup.html) (вариант A).

## Global Constraints

- Только фронтенд (`client/`). Бэкенд, модели, миграции не менять.
- Запрос только по одной таблице, без JOIN. Результат `SELECT *` с `LIMIT` (по умолчанию 1000).
- Интерфейс на русском. Светлая тема: белые карточки на светло-сером фоне, мягкие тени, синий акцент; группа И синяя, группа ИЛИ оранжевая; условия соединены вертикальными линиями дерева.
- Стили новой страницы только в своём CSS-файле в `client/src/constructor/`, явно задать `color-scheme: light`. Общие файлы (`index.css`, `App.css`) и существующие страницы не менять; единственные правки вне папки: маршрут в `App.jsx` и ссылка в `Profile.jsx`.
- Имена таблиц и полей берутся только из схемы БД и заключаются в двойные кавычки. Значения всегда экранируются (`'` удваивается); числа проверяются регулярным выражением и в кавычки не берутся. Даты в SQL в формате `YYYY-MM-DD`.
- Запрос бэкенд принимает только если он начинается с `SELECT`. Токен: `localStorage.getItem('token')`, заголовок `Authorization: Bearer <токен>`. При ответе 401 удалить токен и перейти на `/login`.
- Таблица результата: страница по 50 строк, клиентская сортировка по клику на заголовок, `null` показывается как «—». Дерево: не меньше 5 уровней вложенности без поломки вёрстки.
- Команды запуска через Docker (локально `node_modules` нет): `docker compose exec client <команда>`. Для тестов: `docker compose exec client npx vitest run <файл>`.

## Review Focus

Входы, которые ТЗ не называет, но которые встретит пользователь. Тест на каждый стоит в указанной задаче.

1. Пустое дерево или дерево, где все условия не заполнены: запрос без `WHERE`, не ошибка (Задача 3).
2. Значение с `'` и с `\`: не ломает запрос, не выходит из строкового литерала (Задача 3).
3. Число с мусором (`1; DROP TABLE x`): условие пропускается и не попадает в SQL (Задача 3).
4. `BETWEEN` без второго значения пропускается; `IS NULL` и `IS NOT NULL` значения не требуют (Задача 3).
5. Результат из 0 строк, `null` в ячейке, база без подходящих таблиц: понятное пустое состояние, а не пустой экран (Задачи 4 и 7).

## Структура файлов

Создать в `client/src/constructor/`:

| Файл | Ответственность |
|---|---|
| `schema.js` | SQL для схемы, разбор строк схемы, тип поля, список операторов |
| `tree.js` | модель дерева условий и неизменяемые операции над ним |
| `sql.js` | экранирование, генератор SQL, параметры `$имя` |
| `result.js` | помощники таблицы результата: ячейка, сортировка, страницы |
| `api.js` | вызовы `/api/databases/` и `/api/query/`, обработка 401 |
| `ConstructorPage.jsx` | страница: состояние, шаги, выбор базы и таблицы |
| `FieldPanel.jsx` | панель полей (перетаскиваемые карточки) |
| `ConditionTree.jsx` | дерево условий, группы, условия, зоны сброса |
| `SqlStep.jsx`, `ResultStep.jsx` | шаги 2 и 3 |
| `constructor.css` | стили страницы |
| `*.test.js` | тесты чистых модулей |

Изменить: `client/package.json` (зависимости, скрипт `test`), `client/src/App.jsx` (маршрут), `client/src/Profile.jsx` (ссылка).

Необязательные задачи 8–11 добавляют: `history.js`, `templates.js`, `ParamsDialog.jsx`, `export.js` и их тесты.

---

## Обязательная часть

### Task 1: Инструменты и модуль схемы

**Files:**
- Modify: `client/package.json`
- Create: `client/src/constructor/schema.js`
- Test: `client/src/constructor/schema.test.js`

**Interfaces:**
- Produces:
  - `type Kind = 'number' | 'text' | 'date' | 'boolean'`
  - `SCHEMA_SQL: string` ровно `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
  - `kindOf(dataType: string): Kind`
  - `operatorsFor(kind: Kind): string[]`
  - `parseSchema(rows: {table_name: string, column_name: string, data_type: string}[]): Record<string, {name: string, kind: Kind}[]>`

- [ ] **Step 1: Установить зависимости**

Run: `docker compose exec client npm install @dnd-kit/core` и `docker compose exec client npm install -D vitest` (если ругается на версию Vite, взять свежую `vitest`). В `package.json` добавить скрипт `"test": "vitest run"`.
Expected: обе зависимости в `package.json`, `npx vitest --version` печатает версию.

- [ ] **Step 2: Написать падающие тесты** в `schema.test.js`

```js
import { describe, it, expect } from 'vitest';
import { SCHEMA_SQL, kindOf, operatorsFor, parseSchema } from './schema';

describe('kindOf', () => {
  it.each([
    ['bigint', 'number'], ['integer', 'number'], ['numeric', 'number'],
    ['double precision', 'number'], ['character varying', 'text'], ['text', 'text'],
    ['date', 'date'], ['timestamp with time zone', 'date'],
    ['timestamp without time zone', 'date'], ['boolean', 'boolean'], ['jsonb', 'text'],
  ])('%s -> %s', (t, k) => expect(kindOf(t)).toBe(k));
});

describe('operatorsFor', () => {
  it('числа и даты', () => expect(operatorsFor('number')).toEqual(
    ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL']));
  it('даты как числа', () => expect(operatorsFor('date')).toEqual(operatorsFor('number')));
  it('текст', () => expect(operatorsFor('text')).toEqual(['LIKE', '=', '!=', 'IS NULL', 'IS NOT NULL']));
  it('логический', () => expect(operatorsFor('boolean')).toEqual(['=']));
});

describe('parseSchema', () => {
  it('группирует поля по таблицам и скрывает django_* и auth_*', () => {
    const rows = [
      { table_name: 'stores_store', column_name: 'id', data_type: 'bigint' },
      { table_name: 'stores_store', column_name: 'name', data_type: 'character varying' },
      { table_name: 'django_migrations', column_name: 'id', data_type: 'bigint' },
      { table_name: 'auth_group', column_name: 'id', data_type: 'integer' },
    ];
    expect(parseSchema(rows)).toEqual({
      stores_store: [{ name: 'id', kind: 'number' }, { name: 'name', kind: 'text' }],
    });
  });
  it('пустая схема даёт пустой объект', () => expect(parseSchema([])).toEqual({}));
});

it('SCHEMA_SQL начинается с SELECT', () => expect(SCHEMA_SQL.startsWith('SELECT')).toBe(true));
```

- [ ] **Step 3: Запустить и убедиться, что падает**

Run: `docker compose exec client npx vitest run src/constructor/schema.test.js`
Expected: FAIL, модуль `./schema` не найден.

- [ ] **Step 4: Реализовать `schema.js`** по сигнатурам выше. `kindOf`: тип, начинающийся с `timestamp` или равный `date`, это `date`; `boolean`; `smallint`, `integer`, `bigint`, `numeric`, `real`, `double precision`, `decimal` это `number`; всё остальное `text`.

- [ ] **Step 5: Запустить тесты**

Run: `docker compose exec client npx vitest run src/constructor/schema.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/package.json client/package-lock.json client/src/constructor/schema.js client/src/constructor/schema.test.js
git commit -m "feat(client): add schema helpers and test tooling for query constructor"
```

### Task 2: Модель дерева условий

**Files:**
- Create: `client/src/constructor/tree.js`
- Test: `client/src/constructor/tree.test.js`

**Interfaces:**
- Consumes: `operatorsFor`, тип `Kind` из Task 1.
- Produces (все функции неизменяемые, возвращают новое дерево; id через `crypto.randomUUID()`):
  - `type Group = { id: string, type: 'group', op: 'AND' | 'OR', not: boolean, children: Node[] }`
  - `type Condition = { id: string, type: 'condition', field: string, kind: Kind, operator: string, value: string, value2: string }`
  - `createGroup(op?: 'AND' | 'OR'): Group` (по умолчанию `'AND'`, `not: false`, пустые `children`)
  - `createCondition(field: { name: string, kind: Kind }): Condition` (оператор по умолчанию первый из `operatorsFor(kind)`, значения `''`)
  - `addChild(tree: Group, groupId: string, node: Node): Group`
  - `removeNode(tree: Group, nodeId: string): Group` (корень удалить нельзя: возвращает дерево без изменений)
  - `updateNode(tree: Group, nodeId: string, patch: Partial<Node>): Group`
  - `moveNode(tree: Group, nodeId: string, targetGroupId: string): Group` (без изменений, если цель внутри перемещаемого узла или совпадает с ним)
  - `maxDepth(tree: Group): number` (корень = 1, условия глубину не добавляют)
  - `findNode(tree: Group, id: string): Node | null`

- [ ] **Step 1: Написать падающие тесты**: `createCondition({name:'price',kind:'number'})` даёт `operator: '='`; `addChild` кладёт узел в нужную вложенную группу и не меняет исходное дерево (сравнить `JSON.stringify` до и после); `removeNode` корня возвращает то же дерево; `moveNode` переносит условие между группами; `moveNode` группы внутрь её собственного потомка возвращает дерево без изменений; дерево из 5 вложенных групп даёт `maxDepth(...) === 5`.

- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/tree.test.js`
Expected: FAIL, `./tree` не найден.

- [ ] **Step 3: Реализовать `tree.js`** по сигнатурам. Рекурсивный проход, копирование вдоль пути (spread), без мутаций.

- [ ] **Step 4: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/tree.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/constructor/tree.js client/src/constructor/tree.test.js
git commit -m "feat(client): add immutable condition tree model"
```

### Task 3: Генератор SQL

**Files:**
- Create: `client/src/constructor/sql.js`
- Test: `client/src/constructor/sql.test.js`

**Interfaces:**
- Consumes: типы `Group`, `Condition` из Task 2.
- Produces:
  - `quoteIdent(name: string): string`: `"` + имя с удвоенными `"` + `"`
  - `escapeValue(value: string): string`: `'` + значение с удвоенными `'` + `'`
  - `buildSql(args: { table: string, tree: Group, limit?: number, refreshStamp?: number }): { sql: string, skipped: number }`
  - `extractParams(tree: Group): string[]`: уникальные имена параметров `$имя` из значений, в порядке появления (имя по шаблону `/\$([\p{L}_][\p{L}\p{N}_]*)/gu`, без `$`)
  - `substituteParams(tree: Group, values: Record<string, string>): Group`: подставляет значения в `value` и `value2` до экранирования

Формат `buildSql` (точный, под него писать тесты):
```
SELECT *
FROM "stores_store"
WHERE "region" = 'Москва' AND "price" > 85.5
LIMIT 1000
```
Условия группы соединяются ` AND ` или ` OR `; вложенная группа берётся в скобки; группа с `not` даёт `NOT (...)`; корень без скобок, если у него нет `not`. `limit` по умолчанию 1000. Если задан `refreshStamp`, в конец строки добавляется ` /* refresh:<число> */`. Условие пропускается и увеличивает `skipped`, если: значение пустое (кроме `IS NULL`/`IS NOT NULL`), число не проходит `^-?\d+(\.\d+)?$`, дата не проходит `^\d{4}-\d{2}-\d{2}$`, у `BETWEEN` нет второго значения. Пустая группа и группа из одних пропущенных условий не попадают в SQL. Логическое значение: `'true'` или `'false'`, в SQL `TRUE`/`FALSE`. Числа и даты: число без кавычек, дата в кавычках.

- [ ] **Step 1: Написать падающие тесты**, по смыслу:
  - два условия в корне И дают ровно текст из блока формата выше (`skipped === 0`);
  - вложенная ИЛИ-группа: `WHERE "region" = 'Москва' AND ("price" < 10 OR "price" > 100)`;
  - группа с `not: true`: `WHERE NOT ("a" = 1 AND "b" = 2)`;
  - дерево глубиной 5 даёт SQL с пятью уровнями скобок и валидным балансом скобок;
  - **Review Focus 1:** пустое дерево и дерево из незаполненных условий дают SQL без `WHERE` (`SELECT *\nFROM "t"\nLIMIT 1000`), `skipped` равен числу условий;
  - **Review Focus 2:** значение `O'Brien` даёт `'O''Brien'`; значение `a\b` остаётся `'a\b'`;
  - **Review Focus 3:** число `1; DROP TABLE x` пропускается, `skipped === 1`, в SQL нет `DROP`;
  - **Review Focus 4:** `BETWEEN` без `value2` пропускается; `BETWEEN` с обоими числами даёт `"n" BETWEEN 1 AND 5`; `IS NULL` без значения даёт `"n" IS NULL`;
  - `LIKE` со значением `%ООО%` даёт `"name" LIKE '%ООО%'` (`%` не экранируется);
  - дата `2020-01-01` даёт `"d" >= '2020-01-01'`;
  - `refreshStamp: 123` добавляет ` /* refresh:123 */` в конец;
  - `limit: 50` даёт `LIMIT 50`;
  - `extractParams` на значениях `$Регион` и `$Регион` и `$год` даёт `['Регион', 'год']`;
  - `substituteParams` подставляет `Рег'ион` в `$Регион`, после чего `buildSql` экранирует кавычку (`'Рег''ион'`).

- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/sql.test.js`
Expected: FAIL, `./sql` не найден.

- [ ] **Step 3: Реализовать `sql.js`** по сигнатурам и формату выше. Рекурсивная функция строит фрагмент группы, возвращая `null` для пустого результата.

- [ ] **Step 4: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/sql.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/constructor/sql.js client/src/constructor/sql.test.js
git commit -m "feat(client): add SQL generator with escaping for query constructor"
```

### Task 4: Помощники таблицы результата

**Files:**
- Create: `client/src/constructor/result.js`
- Test: `client/src/constructor/result.test.js`

**Interfaces:**
- Produces:
  - `formatCell(value: unknown): string`: `null` и `undefined` дают `'—'`, остальное `String(value)`
  - `sortRows(rows: object[], column: string, direction: 'asc' | 'desc'): object[]` (не мутирует; числа сравниваются как числа, остальное через `localeCompare` с `'ru'`; `null` всегда в конце)
  - `paginate(rows: object[], page: number, pageSize?: number): { rows: object[], page: number, pageCount: number }` (страницы с 1, `pageSize` по умолчанию 50, `page` зажимается в диапазон, при пустом наборе `pageCount === 1`)

- [ ] **Step 1: Написать падающие тесты**: `formatCell(null)` равно `'—'`, `formatCell(0)` равно `'0'`; сортировка `[{n:10},{n:2},{n:null}]` по `n` asc даёт `2, 10, null`, desc даёт `10, 2, null`; исходный массив не меняется; **Review Focus 5:** `paginate([], 1)` даёт `{rows: [], page: 1, pageCount: 1}`; 120 строк на странице 3 дают 20 строк и `pageCount === 3`; `page: 99` зажимается до последней.

- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/result.test.js`
Expected: FAIL.

- [ ] **Step 3: Реализовать `result.js`**.

- [ ] **Step 4: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/result.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/constructor/result.js client/src/constructor/result.test.js
git commit -m "feat(client): add result table helpers"
```

### Task 5: API, маршрут и каркас страницы (выбор базы и таблицы)

**Files:**
- Create: `client/src/constructor/api.js`, `client/src/constructor/ConstructorPage.jsx`, `client/src/constructor/constructor.css`
- Modify: `client/src/App.jsx`, `client/src/Profile.jsx`

**Interfaces:**
- Consumes: `SCHEMA_SQL`, `parseSchema` из Task 1.
- Produces:
  - `fetchDatabases(): Promise<string[]>`
  - `runQuery(db: string, sql: string): Promise<{ data: object[], cached: boolean }>`, при ошибке бросает `Error` с текстом из `response.data.error` или `detail`; при 401 удаляет токен из `localStorage` и ставит `window.location.assign('/login')`
  - `fetchSchema(db: string): Promise<ReturnType<typeof parseSchema>>`
  - `ConstructorPage`: компонент по маршруту `/constructor`; состояние `step` (1, 2, 3), `db`, `schema`, `table`, `tree` (начинается с `createGroup()`), `limit` (1000)

- [ ] **Step 1: Реализовать `api.js`** по сигнатурам. Адрес `http://localhost:8000`, как в остальном приложении.

- [ ] **Step 2: Реализовать каркас `ConstructorPage.jsx`**: шапка со степпером «1 Условия · 2 SQL · 3 Результат» (переход только по шагам, на шаг 2 и 3 можно только после выбора таблицы), выпадающие списки «База» и «Таблица» (таблицы из `Object.keys(schema)`), состояние загрузки и ошибки схемы. **Review Focus 5:** если у базы нет подходящих таблиц, показать пустое состояние «В этой базе нет таблиц для выборки», а не пустой экран; если у пользователя нет доступных баз, «Администратор ещё не выдал вам доступ к базам». Контент шагов пока заглушки.

- [ ] **Step 3: Стили** в `constructor.css` по эталону: фон страницы светло-серый (`#f4f6fb`), карточки белые с тенью, синий акцент (`#3b5bdb`), `color-scheme: light`, системный шрифт, адаптив до 900 px. Корневой класс `.qc` на странице, все селекторы начинаются с `.qc`.

- [ ] **Step 4: Маршрут и ссылка.** В `App.jsx` добавить `<Route path="/constructor" element={<PrivateRoute><ConstructorPage /></PrivateRoute>} />`. В `Profile.jsx` добавить `<Link to="/constructor">Конструктор выборок</Link>` рядом с существующей ссылкой.

- [ ] **Step 5: Проверить**

Run: `docker compose exec client npm run build`
Expected: сборка без ошибок. Затем открыть `http://localhost:5173/constructor` под пользователем с доступом к `db_stores`: выбираются база и таблица `stores_store`, степпер переключается.

- [ ] **Step 6: Commit**

```bash
git add client/src/constructor client/src/App.jsx client/src/Profile.jsx
git commit -m "feat(client): add constructor page skeleton with database and table pickers"
```

### Task 6: Дерево условий и перетаскивание

**Files:**
- Create: `client/src/constructor/FieldPanel.jsx`, `client/src/constructor/ConditionTree.jsx`
- Modify: `client/src/constructor/ConstructorPage.jsx`, `client/src/constructor/constructor.css`

**Interfaces:**
- Consumes: `tree.js` (все операции), `operatorsFor`, `Kind`.
- Produces:
  - `<FieldPanel fields={{name, kind}[]} />`: перетаскиваемые карточки полей с иконкой типа (число, текст, дата, логический)
  - `<ConditionTree tree={Group} onChange={(tree: Group) => void} />`: рисует дерево; сам оборачивается в `DndContext` вместе с `FieldPanel` через общий родитель `ConstructorPage` (контекст создаётся на странице, `onDragEnd` обрабатывается там)
  - Идентификаторы перетаскивания: поле `field:<имя>`, узел `node:<id>`, зона сброса `group:<id>`

Поведение:
- Поле из панели, брошенное на группу, добавляет в неё условие (`createCondition` + `addChild`).
- Условие или группа, брошенные на другую группу, переносятся (`moveNode`).
- Кнопки группы: переключатель И/ИЛИ, переключатель «НЕ», «+ Группа», удалить (кроме корня).
- Карточка условия: поле (подпись), выбор оператора из `operatorsFor(kind)`, поле значения по типу (`number` для числа, `date` для даты, выпадающий `true/false` для логического, текст для остального), для `BETWEEN` два поля значений, для `IS NULL`/`IS NOT NULL` поле значения скрыто, кнопка удалить.
- Пустой корень показывает подсказку «Перетащите поле сюда, чтобы добавить условие».
- Вложенность не ограничена; отступы уровня не растут бесконечно (шаг 16 px, ограничить минимальную ширину карточки так, чтобы 5 уровней читались при ширине 900 px).

- [ ] **Step 1: Реализовать `FieldPanel.jsx` и `ConditionTree.jsx`** по описанию. Начальное значение дерева задаёт страница; при смене таблицы дерево сбрасывается в `createGroup()`.

- [ ] **Step 2: Подключить на шаге 1 страницы:** слева `FieldPanel` (поля выбранной таблицы), справа `ConditionTree`. Обработчик `onDragEnd` на странице разбирает идентификаторы и вызывает операции из `tree.js`.

- [ ] **Step 3: Стили** по эталону: группа И с синей меткой, группа ИЛИ с оранжевой, вертикальная линия слева от детей группы, карточки условий с рамкой `#d6dcf5`.

- [ ] **Step 4: Проверить**

Run: `docker compose exec client npm run build` и `docker compose exec client npm run lint`
Expected: без ошибок. В браузере на `/constructor`: перетащить `region` и `name` в корень, добавить вложенную ИЛИ-группу, перетащить в неё условие, собрать 5 уровней вложенности и убедиться, что вёрстка не ломается, переключатель «НЕ» меняет метку группы.

- [ ] **Step 5: Commit**

```bash
git add client/src/constructor
git commit -m "feat(client): add drag-and-drop condition tree"
```

### Task 7: Шаги «SQL» и «Результат»

**Files:**
- Create: `client/src/constructor/SqlStep.jsx`, `client/src/constructor/ResultStep.jsx`
- Modify: `client/src/constructor/ConstructorPage.jsx`, `client/src/constructor/constructor.css`

**Interfaces:**
- Consumes: `buildSql` (Task 3), `runQuery` (Task 5), `formatCell`, `sortRows`, `paginate` (Task 4).
- Produces:
  - `<SqlStep sql={string} skipped={number} limit={number} onLimitChange={(n: number) => void} />`: SQL в блоке с моноширинным шрифтом и кнопкой «Копировать»; поле «Лимит строк»; если `skipped > 0`, предупреждение «Не заполнено условий: N. Они не попали в запрос»
  - `<ResultStep db={string} sql={string} />`: кнопки «Выполнить» и «Обновить» (повторный запрос с `refreshStamp: Date.now()`), состояние загрузки, сообщение об ошибке базы красным блоком, отметка «(из кэша)» при `cached`, таблица с сортировкой по клику на заголовок (стрелка направления), пагинация «Назад / Вперёд / Страница N из M», счётчик «Строк: N»

Поведение: SQL пересобирается из дерева при каждом отображении шага 2 и 3. **Review Focus 5:** результат из 0 строк показывает «По условиям ничего не найдено», а не пустую таблицу; `null` показывается как «—».

- [ ] **Step 1: Реализовать `SqlStep.jsx` и `ResultStep.jsx`**, подключить в `ConstructorPage.jsx` (шаги 2 и 3, кнопки «Далее»/«Назад» внизу страницы).

- [ ] **Step 2: Стили** таблицы: шапка `#eef2ff`, строки с разделителями, зебра, горизонтальная прокрутка при ширине больше контейнера.

- [ ] **Step 3: Проверить**

Run: `docker compose exec client npm run build` и `docker compose exec client npm run lint`
Expected: без ошибок. В браузере: собрать условие `region = Москва` на `stores_store`, на шаге 2 видеть корректный SQL, на шаге 3 нажать «Выполнить» и получить строки; повторное выполнение показывает «(из кэша)», «Обновить» выполняет заново; условие с кавычкой (`O'Brien`) не вызывает ошибку SQL; условие, не найденное в данных, показывает сообщение «По условиям ничего не найдено».

- [ ] **Step 4: Commit**

```bash
git add client/src/constructor
git commit -m "feat(client): add SQL preview and result steps"
```

---

## Если хватит времени (по убыванию пользы для показа)

### Task 8 (необязательная): Отмена и повтор

**Files:**
- Create: `client/src/constructor/history.js`
- Test: `client/src/constructor/history.test.js`
- Modify: `client/src/constructor/ConstructorPage.jsx`

**Interfaces:**
- Produces:
  - `type History<T> = { past: T[], present: T, future: T[] }`
  - `createHistory<T>(initial: T): History<T>`
  - `push<T>(h: History<T>, value: T): History<T>` (очищает `future`)
  - `undo<T>(h: History<T>): History<T>`, `redo<T>(h: History<T>): History<T>` (без изменений, если нечего отменять)
  - `canUndo(h): boolean`, `canRedo(h): boolean`

- [ ] **Step 1: Написать падающие тесты**: после `push(push(createHistory('a'),'b'),'c')` результат `undo` имеет `present === 'b'`, а `redo` после него возвращает `'c'`; `push` после `undo` очищает `future`; `undo` на новой истории возвращает её без изменений; `canUndo`/`canRedo` отражают состояние.
- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/history.test.js`
Expected: FAIL.
- [ ] **Step 3: Реализовать `history.js`**, затем перевести состояние `tree` на странице на `History<Group>`: каждое изменение дерева идёт через `push`, добавить кнопки «Отменить» и «Повторить» (и сочетания `Ctrl+Z`, `Ctrl+Y` на шаге 1).
- [ ] **Step 4: Запустить тесты и сборку**

Run: `docker compose exec client npx vitest run` и `docker compose exec client npm run build`
Expected: PASS и сборка без ошибок. В браузере: перетащить поле, нажать «Отменить» (условие исчезает), «Повторить» (возвращается).
- [ ] **Step 5: Commit**

```bash
git add client/src/constructor
git commit -m "feat(client): add undo and redo to condition tree"
```

### Task 9 (необязательная): Шаблоны с параметрами

**Files:**
- Create: `client/src/constructor/templates.js`, `client/src/constructor/ParamsDialog.jsx`
- Test: `client/src/constructor/templates.test.js`
- Modify: `client/src/constructor/ConstructorPage.jsx`, `client/src/constructor/constructor.css`

**Interfaces:**
- Consumes: `extractParams`, `substituteParams` (Task 3); логин из `GET /api/profile/` (поле `username`; добавить `fetchProfile(): Promise<{username: string}>` в `api.js`).
- Produces:
  - `type Template = { id: string, name: string, description: string, db: string, table: string, tree: Group, createdAt: string }`
  - `listTemplates(username: string, storage?: Storage): Template[]` (ключ в хранилище `qc_templates:<username>`, по умолчанию `globalThis.localStorage`)
  - `saveTemplate(username: string, data: Omit<Template, 'id' | 'createdAt'> & { id?: string }, storage?: Storage): Template` (с `id` перезаписывает существующий, без `id` создаёт новый)
  - `deleteTemplate(username: string, id: string, storage?: Storage): void`
  - `<ParamsDialog names={string[]} onSubmit={(values: Record<string, string>) => void} onCancel={() => void} />`

- [ ] **Step 1: Написать падающие тесты** на простом объекте-заглушке хранилища (`getItem`, `setItem`): сохранённый шаблон возвращается из `listTemplates`; шаблоны двух логинов не пересекаются; повторное сохранение с тем же `id` обновляет запись, а не дублирует; `deleteTemplate` убирает запись; повреждённый JSON в хранилище даёт пустой список, а не исключение.
- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/templates.test.js`
Expected: FAIL.
- [ ] **Step 3: Реализовать `templates.js`, `ParamsDialog.jsx`** и интерфейс: кнопка «Сохранить как шаблон» (имя и описание), список шаблонов с кнопками «Открыть» (загружает базу, таблицу, дерево), «Удалить»; при нажатии «Выполнить», если `extractParams(tree)` не пуст, показать `ParamsDialog`, затем выполнить запрос по `substituteParams(tree, values)`.
- [ ] **Step 4: Запустить тесты и проверить в браузере**

Run: `docker compose exec client npx vitest run`
Expected: PASS. В браузере: шаблон с условием `region = $Регион` сохраняется, после перезагрузки страницы открывается, при выполнении спрашивает значение региона и возвращает строки.
- [ ] **Step 5: Commit**

```bash
git add client/src/constructor client/src/constructor/api.js
git commit -m "feat(client): add parameterized query templates"
```

### Task 10 (необязательная): Подсказки значений

**Files:**
- Modify: `client/src/constructor/sql.js`, `client/src/constructor/sql.test.js`, `client/src/constructor/ConditionTree.jsx`, `client/src/constructor/api.js`

**Interfaces:**
- Produces:
  - `buildSuggestSql(table: string, field: string, prefix: string): string`: `SELECT DISTINCT "<field>" FROM "<table>" WHERE "<field>"::text ILIKE '<prefix>%' ORDER BY 1 LIMIT 10` (поле и таблица через `quoteIdent`, префикс экранируется `escapeValue` без внешних кавычек, `%` и `_` в префиксе не экранируются)
  - `fetchSuggestions(db: string, table: string, field: string, prefix: string): Promise<string[]>`

- [ ] **Step 1: Написать падающий тест**: `buildSuggestSql('stores_store', 'name', "О'К")` даёт `SELECT DISTINCT "name" FROM "stores_store" WHERE "name"::text ILIKE 'О''К%' ORDER BY 1 LIMIT 10`.
- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/sql.test.js`
Expected: FAIL.
- [ ] **Step 3: Реализовать `buildSuggestSql`, `fetchSuggestions`** и подключить к текстовому полю значения через `<datalist>`; запрос уходит с задержкой 250 мс после последнего нажатия клавиши и только для полей типа `text` и `number`.
- [ ] **Step 4: Запустить тесты и проверить в браузере**

Run: `docker compose exec client npx vitest run`
Expected: PASS. В браузере: в условии `name LIKE` при вводе «Пя» выпадает «Пятерочка».
- [ ] **Step 5: Commit**

```bash
git add client/src/constructor
git commit -m "feat(client): add value suggestions for conditions"
```

### Task 11 (необязательная): Экспорт CSV и JSON

**Files:**
- Create: `client/src/constructor/export.js`
- Test: `client/src/constructor/export.test.js`
- Modify: `client/src/constructor/ResultStep.jsx`

**Interfaces:**
- Produces:
  - `toCsv(rows: object[]): string`: заголовок из ключей первой строки, разделитель запятая, поля с запятой, кавычкой или переводом строки берутся в кавычки с удвоением кавычек, `null` даёт пустое поле, в начало добавлен BOM `﻿` (чтобы Excel правильно читал кириллицу), перевод строки `\r\n`
  - `toJson(rows: object[]): string`: `JSON.stringify(rows, null, 2)`
  - `downloadFile(filename: string, text: string, mime: string): void`: через `Blob` и временную ссылку

- [ ] **Step 1: Написать падающие тесты**: `toCsv([{a:'x,y', b:null, c:'he said "hi"'}])` равно `'﻿a,b,c\r\n"x,y",,"he said ""hi"""'`; `toCsv([])` равно `''`; `toJson([{a:1}])` разбирается обратно в тот же массив.
- [ ] **Step 2: Запустить**

Run: `docker compose exec client npx vitest run src/constructor/export.test.js`
Expected: FAIL.
- [ ] **Step 3: Реализовать `export.js`** и добавить в `ResultStep.jsx` кнопки «Скачать CSV» и «Скачать JSON» (неактивны при пустом результате).
- [ ] **Step 4: Запустить тесты и проверить в браузере**

Run: `docker compose exec client npx vitest run`
Expected: PASS. В браузере: скачанный CSV открывается в Excel без «кракозябр», JSON содержит те же строки, что таблица.
- [ ] **Step 5: Commit**

```bash
git add client/src/constructor
git commit -m "feat(client): add CSV and JSON export of results"
```

---

## Самопроверка плана по спецификации

- Покрытие: дерево И/ИЛИ/НЕ и вложенность (Task 2, 6); операторы по типу (Task 1, 6); генератор SQL и безопасность значений (Task 3); выбор базы и таблицы (Task 5); выполнение, кэш, «Обновить», таблица, сортировка, страницы (Task 4, 7); undo/redo, шаблоны с параметрами, подсказки, экспорт (Task 8–11); стиль и ограничения по файлам (Global Constraints, Task 5–7). Явно вне плана: всё из раздела «Не цели» спецификации.
- Согласованность имён: `Group`, `Condition`, `Kind`, `buildSql`, `quoteIdent`, `escapeValue`, `extractParams`, `substituteParams`, `runQuery`, `fetchSchema` определены в задачах-источниках и в других задачах используются с теми же именами и сигнатурами.
