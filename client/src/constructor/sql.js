const NUMBER_RE = /^-?\d+(\.\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PARAM_RE = /\$([\p{L}_][\p{L}\p{N}_]*)/gu;
const DEFAULT_LIMIT = 1000;

// Белый список операторов по типу поля: всё остальное пропускается.
const NULL_OPS = ['IS NULL', 'IS NOT NULL'];
const COMPARISON = ['=', '!=', '>', '<', '>=', '<='];
const ALLOWED_OPERATORS = {
  number: [...COMPARISON, 'BETWEEN', ...NULL_OPS],
  date: [...COMPARISON, 'BETWEEN', ...NULL_OPS],
  boolean: ['=', '!=', ...NULL_OPS],
  text: ['LIKE', '=', '!=', ...NULL_OPS],
};

export function quoteIdent(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

export function escapeValue(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

// Возвращает SQL-литерал или null, если значение не подходит под тип.
function literal(kind, raw) {
  const value = String(raw ?? '');
  if (kind === 'text') return value.trim() === '' ? null : escapeValue(value);
  const v = value.trim();
  if (kind === 'number') return NUMBER_RE.test(v) ? v : null;
  if (kind === 'date') return DATE_RE.test(v) ? escapeValue(v) : null;
  if (kind === 'boolean') {
    if (v === 'true') return 'TRUE';
    if (v === 'false') return 'FALSE';
  }
  return null;
}

// Фрагмент условия или null (тогда условие пропущено).
function conditionSql(node) {
  const { field, kind, operator } = node;
  if (typeof field !== 'string' || field === '') return null;
  if (!(ALLOWED_OPERATORS[kind] ?? []).includes(operator)) return null;
  const left = quoteIdent(field);
  if (NULL_OPS.includes(operator)) return `${left} ${operator}`;
  const a = literal(kind, node.value);
  if (a === null) return null;
  if (operator === 'BETWEEN') {
    const b = literal(kind, node.value2);
    return b === null ? null : `${left} BETWEEN ${a} AND ${b}`;
  }
  return `${left} ${operator} ${a}`;
}

// Фрагмент группы; null, если в ней нечего выводить. Корень без not скобок не имеет.
function groupSql(group, ctx, isRoot = false) {
  const parts = [];
  for (const child of group.children ?? []) {
    let part;
    if (child.type === 'group') {
      part = groupSql(child, ctx);
    } else {
      part = conditionSql(child);
      if (part === null) ctx.skipped++;
    }
    if (part !== null) parts.push(part);
  }
  if (parts.length === 0) return null;
  const joined = parts.join(group.op === 'OR' ? ' OR ' : ' AND ');
  if (group.not) return `NOT (${joined})`;
  return isRoot ? joined : `(${joined})`;
}

export function buildSql({ table, tree, limit = DEFAULT_LIMIT, refreshStamp }) {
  const ctx = { skipped: 0 };
  const lines = ['SELECT *', `FROM ${quoteIdent(table)}`];
  const where = groupSql(tree, ctx, true);
  if (where !== null) lines.push(`WHERE ${where}`);
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : DEFAULT_LIMIT;
  lines.push(`LIMIT ${safeLimit}`);
  let sql = lines.join('\n');
  if (typeof refreshStamp === 'number' && Number.isFinite(refreshStamp)) {
    sql += ` /* refresh:${Math.trunc(refreshStamp)} */`;
  }
  return { sql, skipped: ctx.skipped };
}

export function extractParams(tree) {
  const names = new Set();
  const visit = node => {
    if (node.type === 'group') {
      (node.children ?? []).forEach(visit);
      return;
    }
    for (const text of [node.value, node.value2]) {
      for (const m of String(text ?? '').matchAll(PARAM_RE)) names.add(m[1]);
    }
  };
  visit(tree);
  return [...names];
}

export function substituteParams(tree, values) {
  // Функция-замена, чтобы $& и $1 в значении не трактовались как шаблон.
  const fill = text => {
    if (typeof text !== 'string') return text;
    return text.replace(PARAM_RE, (whole, name) =>
      Object.hasOwn(values, name) ? String(values[name]) : whole
    );
  };
  const visit = node => {
    if (node.type === 'group') return { ...node, children: (node.children ?? []).map(visit) };
    return { ...node, value: fill(node.value), value2: fill(node.value2) };
  };
  return visit(tree);
}

// Запрос подсказок значений: % и _ в префиксе намеренно не экранируются.
export function buildSuggestSql(table, field, prefix) {
  const pattern = `${escapeValue(prefix).slice(0, -1)}%'`;
  const col = quoteIdent(field);
  return `SELECT DISTINCT ${col} FROM ${quoteIdent(table)} WHERE ${col}::text ILIKE ${pattern} ORDER BY 1 LIMIT 10`;
}
