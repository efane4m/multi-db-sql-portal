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
  it('числа', () => expect(operatorsFor('number')).toEqual(
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
