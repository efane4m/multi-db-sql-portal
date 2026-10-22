import { describe, it, expect } from 'vitest';
import { executeMock, runMockQuery, isMockDb, mockDbNames, suggestMock } from './engine';
import { MOCK_DATABASES } from './data';
import { buildSql } from '../sql';
import { SCHEMA_SQL, parseSchema } from '../schema';

const stores = MOCK_DATABASES.demo_stores.tables.stores.rows;
const deliveries = MOCK_DATABASES.demo_logistics.tables.deliveries.rows;

const c = (field, kind, operator, value, value2 = '') => ({ id: 'c', type: 'condition', field, kind, operator, value, value2 });
const g = (op, not, children) => ({ id: 'g', type: 'group', op, not, children });
const run = (db, table, tree, limit = 100000) => executeMock(db, buildSql({ table, tree, limit }).sql);

describe('демо-данные', () => {
  it('есть обе базы и достаточно строк для постраничного вывода', () => {
    expect(mockDbNames()).toEqual(['demo_stores', 'demo_logistics']);
    expect(isMockDb('demo_stores')).toBe(true);
    expect(isMockDb('db_stores')).toBe(false);
    expect(MOCK_DATABASES.demo_stores.tables.sales.rows.length).toBeGreaterThan(1000);
  });
  it('в данных есть пустые значения, чтобы показать IS NULL', () => {
    expect(stores.some(s => s.area_m2 === null)).toBe(true);
    expect(deliveries.some(d => d.weight_kg === null)).toBe(true);
  });
});

describe('схема через запрос конструктора', () => {
  it('отдаёт таблицы и типы полей', async () => {
    const { data } = await runMockQuery('demo_stores', SCHEMA_SQL);
    const schema = parseSchema(data);
    expect(Object.keys(schema)).toEqual(['stores', 'products', 'sales']);
    expect(schema.stores.find(f => f.name === 'is_24h').kind).toBe('boolean');
    expect(schema.stores.find(f => f.name === 'opened_on').kind).toBe('date');
    expect(schema.sales.find(f => f.name === 'amount').kind).toBe('number');
    expect(schema.stores.find(f => f.name === 'region').kind).toBe('text');
  });
});

describe('выполнение SQL конструктора', () => {
  it('пустое дерево возвращает все строки до лимита', () => {
    expect(run('demo_stores', 'stores', g('AND', false, [])).length).toBe(stores.length);
    expect(run('demo_stores', 'stores', g('AND', false, []), 5).length).toBe(5);
  });

  it('текст: равенство', () => {
    const rows = run('demo_stores', 'stores', g('AND', false, [c('region', 'text', '=', 'Москва')]));
    expect(rows.length).toBe(stores.filter(s => s.region === 'Москва').length);
    expect(rows.every(r => r.region === 'Москва')).toBe(true);
  });

  it('LIKE с кириллицей и подстановкой %', () => {
    const rows = run('demo_stores', 'stores', g('AND', false, [c('region', 'text', 'LIKE', '%область')]));
    expect(rows.length).toBe(stores.filter(s => s.region.endsWith('область')).length);
    expect(rows.length).toBeGreaterThan(0);
  });

  it('число: BETWEEN', () => {
    const rows = run('demo_stores', 'stores', g('AND', false, [c('area_m2', 'number', 'BETWEEN', '500', '1000')]));
    expect(rows.length).toBe(stores.filter(s => s.area_m2 !== null && s.area_m2 >= 500 && s.area_m2 <= 1000).length);
  });

  it('дата: сравнение по ISO-строке', () => {
    const rows = run('demo_logistics', 'deliveries', g('AND', false, [c('delivery_date', 'date', '>=', '2026-01-01')]));
    expect(rows.length).toBe(deliveries.filter(d => d.delivery_date >= '2026-01-01').length);
  });

  it('логическое поле', () => {
    const rows = run('demo_stores', 'stores', g('AND', false, [c('is_24h', 'boolean', '=', 'true')]));
    expect(rows.length).toBe(stores.filter(s => s.is_24h).length);
  });

  it('IS NULL и IS NOT NULL делят таблицу пополам без остатка', () => {
    const nulls = run('demo_stores', 'stores', g('AND', false, [c('area_m2', 'number', 'IS NULL', '')]));
    const filled = run('demo_stores', 'stores', g('AND', false, [c('area_m2', 'number', 'IS NOT NULL', '')]));
    expect(nulls.length + filled.length).toBe(stores.length);
    expect(nulls.length).toBeGreaterThan(0);
  });

  it('NULL не попадает ни в сравнение, ни в его отрицание (как в SQL)', () => {
    const gt = run('demo_stores', 'stores', g('AND', false, [c('area_m2', 'number', '>', '1000')]));
    const notGt = run('demo_stores', 'stores', g('AND', true, [c('area_m2', 'number', '>', '1000')]));
    const nulls = stores.filter(s => s.area_m2 === null).length;
    expect(gt.length + notGt.length + nulls).toBe(stores.length);
  });

  it('вложенные группы: И, ИЛИ и НЕ вместе', () => {
    const tree = g('AND', false, [
      c('region', 'text', '!=', 'Москва'),
      g('OR', false, [
        c('is_24h', 'boolean', '=', 'true'),
        g('AND', true, [c('area_m2', 'number', '<', '800'), c('area_m2', 'number', 'IS NOT NULL', '')]),
      ]),
    ]);
    const expected = stores.filter(s => s.region !== 'Москва'
      && (s.is_24h || !(s.area_m2 !== null && s.area_m2 < 800 && s.area_m2 !== null)));
    // NOT (a AND b) при a = NULL: b ложно, значит всё выражение истинно
    expect(run('demo_stores', 'stores', tree).length).toBe(expected.length);
  });

  it('кавычка в значении не ломает запрос', () => {
    const rows = run('demo_stores', 'stores', g('AND', false, [c('name', 'text', '=', "O'Brien")]));
    expect(rows).toEqual([]);
  });

  it('метка «Обновить» (комментарий) не мешает выполнению', () => {
    const { sql } = buildSql({ table: 'stores', tree: g('AND', false, []), limit: 3, refreshStamp: 123 });
    expect(executeMock('demo_stores', sql).length).toBe(3);
  });
});

describe('кэш и ошибки', () => {
  it('повторный запрос приходит из кэша, «Обновить» обходит кэш', async () => {
    const tree = g('AND', false, [c('region', 'text', '=', 'Татарстан')]);
    const first = await runMockQuery('demo_stores', buildSql({ table: 'stores', tree }).sql);
    const second = await runMockQuery('demo_stores', buildSql({ table: 'stores', tree }).sql);
    const refreshed = await runMockQuery('demo_stores', buildSql({ table: 'stores', tree, refreshStamp: 1 }).sql);
    expect([first.cached, second.cached, refreshed.cached]).toEqual([false, true, false]);
  });

  it('неизвестная таблица и поле дают понятную ошибку', () => {
    expect(() => executeMock('demo_stores', 'SELECT * FROM "nope"')).toThrow(/does not exist/);
    expect(() => executeMock('demo_stores', 'SELECT * FROM "stores" WHERE "nope" = 1')).toThrow(/column "nope"/);
  });

  it('неподдерживаемый SQL отклоняется, а не выполняется', () => {
    expect(() => executeMock('demo_stores', 'DELETE FROM "stores"')).toThrow();
    expect(() => executeMock('demo_stores', 'SELECT * FROM "stores"; DROP TABLE x')).toThrow();
  });
});

describe('подсказки значений', () => {
  it('значения начинаются с префикса без учёта регистра, без повторов и не больше десяти', () => {
    const list = suggestMock('demo_stores', 'stores', 'region', 'н');
    expect(list).toEqual(['Нижегородская область', 'Новосибирская область']);
    const all = suggestMock('demo_stores', 'stores', 'name', '');
    expect(all.length).toBeLessThanOrEqual(10);
    expect(new Set(all).size).toBe(all.length);
  });
  it('пустые значения не предлагаются, неизвестное поле даёт пустой список', () => {
    expect(suggestMock('demo_stores', 'stores', 'area_m2', '').includes('null')).toBe(false);
    expect(suggestMock('demo_stores', 'stores', 'nope', '')).toEqual([]);
  });
});
