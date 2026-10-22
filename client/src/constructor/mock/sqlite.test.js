import { describe, it, expect } from 'vitest';
import { runManualMock } from './sqlite';
import { MOCK_DATABASES } from './data';

const { stores, products, sales } = MOCK_DATABASES.demo_stores.tables;

describe('runManualMock', () => {
  it('COUNT(*) совпадает с числом строк', async () => {
    const res = await runManualMock('demo_stores', 'SELECT COUNT(*) AS n FROM stores');
    expect(res.cached).toBe(false);
    expect(res.data).toEqual([{ n: stores.rows.length }]);
  });

  it('JOIN sales и products с WHERE', async () => {
    const res = await runManualMock('demo_stores',
      'SELECT s.id, p.name FROM sales s JOIN products p ON p.id = s.product_id WHERE p.price > 0 AND s.quantity > 0');
    const prices = new Map(products.rows.map(p => [p.id, p.price]));
    const expected = sales.rows.filter(s => prices.get(s.product_id) > 0 && s.quantity > 0).length;
    expect(res.data.length).toBe(expected);
    expect(res.data.length).toBeGreaterThan(0);
    expect(Object.keys(res.data[0])).toEqual(['id', 'name']);
  });

  it('GROUP BY region совпадает с подсчётом в JS', async () => {
    const res = await runManualMock('demo_stores', 'SELECT region, COUNT(*) AS n FROM stores GROUP BY region');
    const expected = {};
    stores.rows.forEach(r => { expected[r.region] = (expected[r.region] || 0) + 1; });
    expect(Object.fromEntries(res.data.map(r => [r.region, r.n]))).toEqual(expected);
  });

  it('ORDER BY и LIMIT', async () => {
    const res = await runManualMock('demo_stores', 'SELECT id FROM stores ORDER BY id DESC LIMIT 3');
    const ids = stores.rows.map(r => r.id).sort((a, b) => b - a).slice(0, 3);
    expect(res.data.map(r => r.id)).toEqual(ids);
  });

  it('булевы значения возвращаются как true/false', async () => {
    const res = await runManualMock('demo_stores', 'SELECT id, is_24h FROM stores ORDER BY id');
    expect(res.data.every(r => typeof r.is_24h === 'boolean')).toBe(true);
    expect(res.data.map(r => r.is_24h)).toEqual(stores.rows.slice().sort((a, b) => a.id - b.id).map(r => r.is_24h));
  });

  it('NULL остаётся null', async () => {
    const nulls = stores.rows.filter(r => r.area_m2 === null).length;
    const res = await runManualMock('demo_stores', 'SELECT area_m2 FROM stores WHERE area_m2 IS NULL');
    expect(res.data.length).toBe(nulls);
    if (nulls) expect(res.data[0].area_m2).toBeNull();
  });

  it('разрешает ведущие комментарии и завершающую точку с запятой', async () => {
    const res = await runManualMock('demo_stores', '  -- заметка\n /* x */ select 1 as one; ');
    expect(res.data).toEqual([{ one: 1 }]);
  });

  it('отклоняет не-SELECT', async () => {
    await expect(runManualMock('demo_stores', 'DELETE FROM stores')).rejects.toThrow('Разрешены только SELECT запросы');
  });

  it('отклоняет второй запрос', async () => {
    await expect(runManualMock('demo_stores', 'SELECT 1; DROP TABLE stores')).rejects.toThrow('Разрешён только один запрос');
  });

  it('синтаксическая ошибка получает префикс', async () => {
    await expect(runManualMock('demo_stores', 'SELECT FROM WHERE')).rejects.toThrow(/^Ошибка базы данных: /);
  });

  it('неизвестная база отклоняется', async () => {
    await expect(runManualMock('nope', 'SELECT 1')).rejects.toThrow('Ошибка базы данных: база nope не найдена');
  });

  it('повторный запуск работает (кэшированная БД)', async () => {
    const a = await runManualMock('demo_logistics', 'SELECT COUNT(*) AS n FROM deliveries');
    const b = await runManualMock('demo_logistics', 'SELECT COUNT(*) AS n FROM deliveries');
    expect(b.data).toEqual(a.data);
  });
});
