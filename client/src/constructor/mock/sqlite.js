import { MOCK_DATABASES } from './data';

// Ручной SQL над демо-базами: SQLite (sql.js, WASM) грузится лениво при первом запросе.

const SQLITE_TYPES = {
  integer: 'INTEGER',
  numeric: 'REAL',
  boolean: 'INTEGER',
};
const sqliteType = type => SQLITE_TYPES[type] || 'TEXT';
const quote = name => `"${String(name).replace(/"/g, '""')}"`;

let sqlPromise = null;
function loadSql() {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      const { default: initSqlJs } = await import('sql.js');
      let locateFile;
      try {
        const { default: wasmUrl } = await import('sql.js/dist/sql-wasm.wasm?url');
        // В vitest (node) ?url может дать не-URL путь; тогда оставляем locateFile по умолчанию
        if (typeof wasmUrl === 'string' && /^(\/|https?:|data:)/.test(wasmUrl) && typeof window !== 'undefined') {
          locateFile = () => wasmUrl;
        }
      } catch {
        locateFile = undefined;
      }
      return initSqlJs(locateFile ? { locateFile } : {});
    })();
    sqlPromise.catch(() => { sqlPromise = null; });
  }
  return sqlPromise;
}

const dbCache = new Map();
function getDb(SQL, dbName) {
  if (dbCache.has(dbName)) return dbCache.get(dbName);
  const def = MOCK_DATABASES[dbName];
  if (!def) throw new Error(`Ошибка базы данных: база ${dbName} не найдена`);
  const db = new SQL.Database();
  const boolCols = new Set();
  db.run('BEGIN');
  try {
    for (const [table, { columns, rows }] of Object.entries(def.tables)) {
      db.run(`CREATE TABLE ${quote(table)} (${columns.map(c => `${quote(c.name)} ${sqliteType(c.type)}`).join(', ')})`);
      columns.forEach(c => { if (c.type === 'boolean') boolCols.add(c.name); });
      const stmt = db.prepare(`INSERT INTO ${quote(table)} VALUES (${columns.map(() => '?').join(', ')})`);
      for (const row of rows) {
        stmt.run(columns.map(c => {
          const v = row[c.name];
          if (v === null || v === undefined) return null;
          if (c.type === 'boolean') return v ? 1 : 0;
          return v;
        }));
      }
      stmt.free();
    }
    db.run('COMMIT');
  } catch (e) {
    db.close();
    throw e;
  }
  const entry = { db, boolCols };
  dbCache.set(dbName, entry);
  return entry;
}

// Убираем ведущие пробелы и комментарии (-- ... и /* ... */)
function stripLeading(sql) {
  let s = sql;
  for (;;) {
    const t = s.replace(/^\s+/, '');
    if (t.startsWith('--')) {
      const i = t.indexOf('\n');
      s = i === -1 ? '' : t.slice(i + 1);
    } else if (t.startsWith('/*')) {
      const i = t.indexOf('*/');
      s = i === -1 ? '' : t.slice(i + 2);
    } else return t;
  }
}

// Позиция первой ';' вне строк, идентификаторов и комментариев
function firstSemicolon(sql) {
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = sql.indexOf(ch, i + 1);
      if (end === -1) return -1;
      i = end + 1;
    } else if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      if (end === -1) return -1;
      i = end + 1;
    } else if (sql.startsWith('/*', i)) {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
    } else if (ch === ';') return i;
    else i += 1;
  }
  return -1;
}

export async function runManualMock(dbName, sql) {
  const text = stripLeading(String(sql ?? ''));
  if (!/^select\b/i.test(text)) throw new Error('Разрешены только SELECT запросы');
  const semi = firstSemicolon(text);
  if (semi !== -1 && stripLeading(text.slice(semi + 1)) !== '') {
    throw new Error('Разрешён только один запрос');
  }

  let SQL;
  try {
    SQL = await loadSql();
  } catch (e) {
    throw new Error(`Ошибка базы данных: ${e.message}`, { cause: e });
  }
  const { db, boolCols } = getDb(SQL, dbName);

  let result;
  try {
    [result] = db.exec(semi === -1 ? text : text.slice(0, semi));
  } catch (e) {
    throw new Error(`Ошибка базы данных: ${e.message}`, { cause: e });
  }
  if (!result) return { data: [], cached: false };

  const { columns, values } = result;
  const isBool = columns.map(c => boolCols.has(c));
  const data = values.map(row => {
    const obj = {};
    columns.forEach((c, i) => {
      const v = row[i];
      obj[c] = isBool[i] && v !== null ? v === 1 : v;
    });
    return obj;
  });
  return { data, cached: false };
}
