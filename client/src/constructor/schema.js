export const SCHEMA_SQL =
  "SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position";

const NUMBER_TYPES = ['smallint', 'integer', 'bigint', 'numeric', 'real', 'double precision', 'decimal'];
const HIDDEN_TABLE_PREFIXES = ['django_', 'auth_'];

export function kindOf(dataType) {
  if (dataType === 'date' || dataType.startsWith('timestamp')) return 'date';
  if (dataType === 'boolean') return 'boolean';
  if (NUMBER_TYPES.includes(dataType)) return 'number';
  return 'text';
}

const COMPARISON = ['=', '!=', '>', '<', '>=', '<=', 'BETWEEN', 'IS NULL', 'IS NOT NULL'];

export function operatorsFor(kind) {
  if (kind === 'number' || kind === 'date') return [...COMPARISON];
  if (kind === 'boolean') return ['='];
  return ['LIKE', '=', '!=', 'IS NULL', 'IS NOT NULL'];
}

export function parseSchema(rows) {
  const schema = {};
  for (const { table_name, column_name, data_type } of rows) {
    if (HIDDEN_TABLE_PREFIXES.some(p => table_name.startsWith(p))) continue;
    (schema[table_name] ??= []).push({ name: column_name, kind: kindOf(data_type) });
  }
  return schema;
}
