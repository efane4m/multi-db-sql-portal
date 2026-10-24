const EMPTY = '—';
const PAGE_SIZE = 50;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function formatCell(value) {
  return value === null || value === undefined ? EMPTY : String(value);
}

// Поиск по тому же тексту, который пользователь видит в ячейках таблицы.
export function filterRows(rows, query) {
  const needle = query.trim().toLocaleLowerCase('ru');
  if (!needle) return rows;
  return rows.filter(row => Object.values(row).some(value =>
    formatCell(value).toLocaleLowerCase('ru').includes(needle),
  ));
}

// Бэкенд может отдавать decimal строкой, поэтому числовые строки тоже считаются числами
function asNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && NUMERIC.test(value.trim())) return Number(value);
  return null;
}

function compare(a, b) {
  const x = asNumber(a);
  const y = asNumber(b);
  if (x !== null && y !== null) return x - y;
  return String(a).localeCompare(String(b), 'ru');
}

export function sortRows(rows, column, direction) {
  const sign = direction === 'desc' ? -1 : 1;
  const isNull = v => v === null || v === undefined;
  return [...rows].sort((r1, r2) => {
    const a = r1[column];
    const b = r2[column];
    // null всегда в конце, независимо от направления
    if (isNull(a) || isNull(b)) return isNull(a) - isNull(b);
    return sign * compare(a, b);
  });
}

export function paginate(rows, page, pageSize = PAGE_SIZE) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount);
  const start = (current - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: current, pageCount };
}
