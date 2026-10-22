import { describe, it, expect } from 'vitest';
import { formatCell, sortRows, paginate } from './result';

describe('formatCell', () => {
  it('null и undefined дают тире', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell(undefined)).toBe('—');
  });

  it('ноль, false и пустая строка не считаются пустыми', () => {
    expect(formatCell(0)).toBe('0');
    expect(formatCell(false)).toBe('false');
    expect(formatCell('')).toBe('');
  });
});

describe('sortRows', () => {
  const rows = [{ n: 10 }, { n: 2 }, { n: null }];

  it('asc: числа как числа, null в конце', () => {
    expect(sortRows(rows, 'n', 'asc').map(r => r.n)).toEqual([2, 10, null]);
  });

  it('desc: null всё равно в конце', () => {
    expect(sortRows(rows, 'n', 'desc').map(r => r.n)).toEqual([10, 2, null]);
  });

  it('не мутирует исходный массив', () => {
    const copy = [...rows];
    const result = sortRows(rows, 'n', 'asc');
    expect(rows).toEqual(copy);
    expect(result).not.toBe(rows);
  });

  it('строки сравниваются через localeCompare ru', () => {
    const data = [{ s: 'Яблоко' }, { s: 'арбуз' }, { s: 'Берёза' }];
    expect(sortRows(data, 's', 'asc').map(r => r.s)).toEqual(['арбуз', 'Берёза', 'Яблоко']);
  });

  it('числа в виде строк сравниваются как числа', () => {
    const data = [{ n: '10.5' }, { n: '2' }];
    expect(sortRows(data, 'n', 'asc').map(r => r.n)).toEqual(['2', '10.5']);
  });
});

describe('paginate', () => {
  it('пустой набор: одна страница', () => {
    expect(paginate([], 1)).toEqual({ rows: [], page: 1, pageCount: 1 });
  });

  it('120 строк, страница 3: 20 строк, 3 страницы', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ i }));
    const result = paginate(rows, 3);
    expect(result.rows).toHaveLength(20);
    expect(result.rows[0]).toEqual({ i: 100 });
    expect(result.pageCount).toBe(3);
  });

  it('страница вне диапазона зажимается', () => {
    const rows = Array.from({ length: 120 }, (_, i) => ({ i }));
    expect(paginate(rows, 99).page).toBe(3);
    expect(paginate(rows, 0).page).toBe(1);
  });

  it('учитывает свой pageSize', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ i }));
    expect(paginate(rows, 2, 2)).toEqual({ rows: [{ i: 2 }, { i: 3 }], page: 2, pageCount: 3 });
  });
});
