// Выполняет в браузере SQL, который строит конструктор (sql.js):
// SELECT * FROM "таблица" [WHERE условия] [LIMIT n]. Остальное не поддерживается.
import { SCHEMA_SQL } from '../schema';
import { MOCK_DATABASES } from './data';

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'BETWEEN', 'IS', 'NULL', 'LIKE', 'LIMIT', 'TRUE', 'FALSE']);

export const isMockDb = name => Object.hasOwn(MOCK_DATABASES, name);
export const mockDbNames = () => Object.keys(MOCK_DATABASES);
export const mockDbLabel = name => MOCK_DATABASES[name]?.label ?? name;

function fail(message) {
  return new Error(`Ошибка базы данных: ${message}`);
}

function tokenize(sql) {
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end < 0) throw fail('не закрыт комментарий');
      i = end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let out = '';
      for (;;) {
        if (j >= sql.length) throw fail('не закрыта кавычка');
        if (sql[j] === ch) {
          if (sql[j + 1] === ch) { out += ch; j += 2; continue; }
          break;
        }
        out += sql[j++];
      }
      tokens.push({ type: ch === '"' ? 'ident' : 'string', value: out });
      i = j + 1;
      continue;
    }
    const rest = sql.slice(i);
    const num = /^-?\d+(\.\d+)?/.exec(rest);
    if (num) { tokens.push({ type: 'number', value: Number(num[0]) }); i += num[0].length; continue; }
    const two = rest.slice(0, 2);
    if (['!=', '>=', '<='].includes(two)) { tokens.push({ type: 'op', value: two }); i += 2; continue; }
    if ('=<>()*;'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
    const word = /^[A-Za-z_]+/.exec(rest);
    if (word && KEYWORDS.has(word[0].toUpperCase())) {
      tokens.push({ type: 'kw', value: word[0].toUpperCase() });
      i += word[0].length;
      continue;
    }
    throw fail(`неожиданный символ «${ch}»`);
  }
  return tokens;
}

// Логика с неопределённостью (NULL), как в SQL: true, false или null
const and3 = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true);
const or3 = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false);
const not3 = a => (a === null ? null : !a);

function compare(a, op, b) {
  if (a === null || a === undefined) return null;
  switch (op) {
    case '=': return a === b;
    case '!=': return a !== b;
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    case '<=': return a <= b;
    default: throw fail(`неизвестный оператор ${op}`);
  }
}

function likeRegex(pattern) {
  const source = [...pattern].map(c => (c === '%' ? '.*' : c === '_' ? '.' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
  return new RegExp(`^${source}$`, 's');
}

function parse(tokens, tables) {
  let p = 0;
  const peek = () => tokens[p];
  const isOp = v => peek()?.type === 'op' && peek().value === v;
  const isKw = v => peek()?.type === 'kw' && peek().value === v;
  const take = () => tokens[p++];
  const expectKw = v => { if (!isKw(v)) throw fail(`ожидалось ${v}`); p++; };
  const expectOp = v => { if (!isOp(v)) throw fail(`ожидалось «${v}»`); p++; };

  expectKw('SELECT');
  expectOp('*');
  expectKw('FROM');
  const tableToken = take();
  if (tableToken?.type !== 'ident') throw fail('ожидалось имя таблицы');
  const table = tables[tableToken.value];
  if (!table) throw fail(`relation "${tableToken.value}" does not exist`);
  const known = new Set(table.columns.map(c => c.name));

  const literal = () => {
    const t = take();
    if (t?.type === 'number' || t?.type === 'string') return t.value;
    if (t?.type === 'kw' && (t.value === 'TRUE' || t.value === 'FALSE')) return t.value === 'TRUE';
    throw fail('ожидалось значение');
  };

  const condition = () => {
    const t = take();
    if (t?.type !== 'ident') throw fail('ожидалось имя поля');
    if (!known.has(t.value)) throw fail(`column "${t.value}" does not exist`);
    const name = t.value;
    if (isKw('IS')) {
      p++;
      const negate = isKw('NOT');
      if (negate) p++;
      expectKw('NULL');
      return row => (row[name] === null) !== negate;
    }
    if (isKw('BETWEEN')) {
      p++;
      const lo = literal();
      expectKw('AND');
      const hi = literal();
      return row => and3(compare(row[name], '>=', lo), compare(row[name], '<=', hi));
    }
    if (isKw('LIKE')) {
      p++;
      const re = likeRegex(String(literal()));
      return row => (row[name] === null ? null : re.test(String(row[name])));
    }
    const op = take();
    if (op?.type !== 'op') throw fail('ожидался оператор сравнения');
    const value = literal();
    return row => compare(row[name], op.value, value);
  };

  const primary = () => {
    if (isOp('(')) {
      p++;
      const inner = orExpr();
      expectOp(')');
      return inner;
    }
    return condition();
  };
  const notExpr = () => {
    if (isKw('NOT')) { p++; const inner = notExpr(); return row => not3(inner(row)); }
    return primary();
  };
  const andExpr = () => {
    let left = notExpr();
    while (isKw('AND')) { p++; const l = left; const r = notExpr(); left = row => and3(l(row), r(row)); }
    return left;
  };
  function orExpr() {
    let left = andExpr();
    while (isKw('OR')) { p++; const l = left; const r = andExpr(); left = row => or3(l(row), r(row)); }
    return left;
  }

  let predicate = () => true;
  if (isKw('WHERE')) { p++; predicate = orExpr(); }
  let limit = Infinity;
  if (isKw('LIMIT')) {
    p++;
    const t = take();
    if (t?.type !== 'number') throw fail('LIMIT ожидает число');
    limit = t.value;
  }
  if (isOp(';')) p++;
  if (p < tokens.length) throw fail('лишний текст в конце запроса');

  return { table, predicate, limit };
}

export function executeMock(dbName, sql) {
  const db = MOCK_DATABASES[dbName];
  if (!db) throw fail(`база ${dbName} не найдена`);
  const { table, predicate, limit } = parse(tokenize(sql), db.tables);
  return table.rows.filter(row => predicate(row) === true).slice(0, limit).map(row => ({ ...row }));
}

function schemaRows(dbName) {
  return Object.entries(MOCK_DATABASES[dbName].tables).flatMap(([table_name, { columns }]) =>
    columns.map(c => ({ table_name, column_name: c.name, data_type: c.type })));
}

const cache = new Map();
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Как настоящий бэкенд: повторный такой же запрос приходит из кэша
export async function runMockQuery(dbName, sql) {
  await delay(250);
  if (sql === SCHEMA_SQL) return { data: schemaRows(dbName), cached: false };
  const key = `${dbName}\n${sql}`;
  if (cache.has(key)) return { data: cache.get(key), cached: true };
  const data = executeMock(dbName, sql);
  cache.set(key, data);
  return { data, cached: false };
}

// Подсказки значений для демо-баз: до 10 разных значений поля, начинающихся с префикса
export function suggestMock(dbName, table, field, prefix) {
  const rows = MOCK_DATABASES[dbName]?.tables[table]?.rows ?? [];
  const needle = prefix.toLowerCase();
  const values = new Set();
  for (const row of rows) {
    const v = row[field];
    if (v === null || v === undefined) continue;
    const text = String(v);
    if (text.toLowerCase().startsWith(needle)) values.add(text);
  }
  return [...values].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })).slice(0, 10);
}
