import { describe, it, expect } from 'vitest';
import { quoteIdent, escapeValue, buildSql, extractParams, substituteParams, buildSuggestSql } from './sql';

let seq = 0;
const cond = (field, kind, operator, value = '', value2 = '') => ({
  id: `c${++seq}`, type: 'condition', field, kind, operator, value, value2,
});
const group = (op, children, not = false) => ({
  id: `g${++seq}`, type: 'group', op, not, children,
});

describe('quoteIdent / escapeValue', () => {
  it('заключает имя в двойные кавычки и удваивает их внутри', () => {
    expect(quoteIdent('price')).toBe('"price"');
    expect(quoteIdent('a"b')).toBe('"a""b"');
  });

  it('заключает значение в одинарные кавычки и удваивает их внутри', () => {
    expect(escapeValue('abc')).toBe("'abc'");
    expect(escapeValue("O'Brien")).toBe("'O''Brien'");
    expect(escapeValue('a\\b')).toBe("'a\\b'");
  });
});

describe('buildSql', () => {
  it('два условия в корне И дают точный формат', () => {
    const tree = group('AND', [
      cond('region', 'text', '=', 'Москва'),
      cond('price', 'number', '>', '85.5'),
    ]);
    const { sql, skipped } = buildSql({ table: 'stores_store', tree });
    expect(sql).toBe(
      'SELECT *\nFROM "stores_store"\nWHERE "region" = \'Москва\' AND "price" > 85.5\nLIMIT 1000'
    );
    expect(skipped).toBe(0);
  });

  it('вложенная ИЛИ-группа берётся в скобки', () => {
    const tree = group('AND', [
      cond('region', 'text', '=', 'Москва'),
      group('OR', [cond('price', 'number', '<', '10'), cond('price', 'number', '>', '100')]),
    ]);
    const { sql } = buildSql({ table: 't', tree });
    expect(sql).toContain('WHERE "region" = \'Москва\' AND ("price" < 10 OR "price" > 100)');
  });

  it('группа с not даёт NOT (...)', () => {
    const tree = group('AND', [
      cond('a', 'number', '=', '1'),
      cond('b', 'number', '=', '2'),
    ], true);
    const { sql } = buildSql({ table: 't', tree });
    expect(sql).toContain('WHERE NOT ("a" = 1 AND "b" = 2)');
  });

  it('вложенная группа с not даёт NOT (...) внутри', () => {
    const tree = group('AND', [
      cond('a', 'number', '=', '1'),
      group('OR', [cond('b', 'number', '=', '2'), cond('c', 'number', '=', '3')], true),
    ]);
    const { sql } = buildSql({ table: 't', tree });
    expect(sql).toContain('WHERE "a" = 1 AND NOT ("b" = 2 OR "c" = 3)');
  });

  it('дерево глубиной 5 даёт пять уровней скобок и баланс', () => {
    let node = group('OR', [cond('x', 'number', '=', '1'), cond('y', 'number', '=', '2')]);
    for (let i = 0; i < 4; i++) {
      node = group(i % 2 ? 'OR' : 'AND', [cond('z', 'number', '=', '0'), node]);
    }
    const root = group('AND', [cond('r', 'number', '=', '9'), node]);
    const { sql } = buildSql({ table: 't', tree: root });
    const where = sql.split('\n')[2];
    let depth = 0;
    let max = 0;
    for (const ch of where) {
      if (ch === '(') max = Math.max(max, ++depth);
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
    expect(max).toBe(5);
  });

  it('Review Focus 1: пустое дерево даёт запрос без WHERE', () => {
    const { sql, skipped } = buildSql({ table: 't', tree: group('AND', []) });
    expect(sql).toBe('SELECT *\nFROM "t"\nLIMIT 1000');
    expect(skipped).toBe(0);
  });

  it('Review Focus 1: незаполненные условия дают запрос без WHERE', () => {
    const tree = group('AND', [
      cond('a', 'text', '='),
      group('OR', [cond('b', 'number', '>'), cond('c', 'date', '<', '')]),
    ]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(sql).toBe('SELECT *\nFROM "t"\nLIMIT 1000');
    expect(skipped).toBe(3);
  });

  it('пустая вложенная группа не попадает в SQL', () => {
    const tree = group('AND', [cond('a', 'number', '=', '1'), group('OR', [])]);
    const { sql } = buildSql({ table: 't', tree });
    expect(sql).toContain('WHERE "a" = 1\n');
    expect(sql).not.toContain('(');
  });

  it('группа с not из одних пропущенных условий не даёт NOT ()', () => {
    const tree = group('AND', [cond('a', 'number', '=', '1'), group('AND', [cond('b', 'text', '=')], true)]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(sql).not.toContain('NOT');
    expect(sql).toContain('WHERE "a" = 1\n');
    expect(skipped).toBe(1);
  });

  it("Review Focus 2: значение O'Brien экранируется", () => {
    const tree = group('AND', [cond('n', 'text', '=', "O'Brien")]);
    expect(buildSql({ table: 't', tree }).sql).toContain(`"n" = 'O''Brien'`);
  });

  it('Review Focus 2: обратная косая черта остаётся как есть', () => {
    const tree = group('AND', [cond('n', 'text', '=', 'a\\b')]);
    expect(buildSql({ table: 't', tree }).sql).toContain(`"n" = 'a\\b'`);
  });

  it("значение с ' и ; остаётся внутри литерала", () => {
    const tree = group('AND', [cond('n', 'text', '=', "x'; DROP TABLE t; --")]);
    const { sql } = buildSql({ table: 't', tree });
    expect(sql).toContain(`"n" = 'x''; DROP TABLE t; --'`);
  });

  it('Review Focus 3: число с мусором пропускается', () => {
    const tree = group('AND', [cond('n', 'number', '=', '1; DROP TABLE x')]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(skipped).toBe(1);
    expect(sql).not.toContain('DROP');
    expect(sql).not.toContain('WHERE');
  });

  it('числа: отрицательные и дробные проходят, экспонента и запятая нет', () => {
    const ok = group('AND', [cond('n', 'number', '=', '-5'), cond('m', 'number', '<', '0.25')]);
    expect(buildSql({ table: 't', tree: ok }).sql).toContain('"n" = -5 AND "m" < 0.25');
    for (const bad of ['1e5', '1,5', '.5', '5.', '--1', '+1', '0x10', '1 OR 1=1']) {
      const r = buildSql({ table: 't', tree: group('AND', [cond('n', 'number', '=', bad)]) });
      expect(r.skipped).toBe(1);
      expect(r.sql).not.toContain('WHERE');
    }
  });

  it('дата с мусором пропускается', () => {
    for (const bad of ["2020-01-01'; DROP", '01.01.2020', '2020-1-1', '2020-01-01 00:00']) {
      const r = buildSql({ table: 't', tree: group('AND', [cond('d', 'date', '>=', bad)]) });
      expect(r.skipped).toBe(1);
      expect(r.sql).not.toContain('WHERE');
    }
  });

  it('Review Focus 4: BETWEEN без value2 пропускается', () => {
    const tree = group('AND', [cond('n', 'number', 'BETWEEN', '1', '')]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(skipped).toBe(1);
    expect(sql).not.toContain('WHERE');
  });

  it('Review Focus 4: BETWEEN с обоими числами', () => {
    const tree = group('AND', [cond('n', 'number', 'BETWEEN', '1', '5')]);
    expect(buildSql({ table: 't', tree }).sql).toContain('"n" BETWEEN 1 AND 5');
  });

  it('BETWEEN с мусором во втором значении пропускается', () => {
    const tree = group('AND', [cond('n', 'number', 'BETWEEN', '1', '5; DROP')]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(skipped).toBe(1);
    expect(sql).not.toContain('DROP');
  });

  it('BETWEEN для дат', () => {
    const tree = group('AND', [cond('d', 'date', 'BETWEEN', '2020-01-01', '2020-12-31')]);
    expect(buildSql({ table: 't', tree }).sql)
      .toContain(`"d" BETWEEN '2020-01-01' AND '2020-12-31'`);
  });

  it('Review Focus 4: IS NULL и IS NOT NULL без значения', () => {
    const tree = group('AND', [
      cond('n', 'number', 'IS NULL'),
      cond('m', 'text', 'IS NOT NULL'),
    ]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(sql).toContain('WHERE "n" IS NULL AND "m" IS NOT NULL');
    expect(skipped).toBe(0);
  });

  it('LIKE: % не экранируется', () => {
    const tree = group('AND', [cond('name', 'text', 'LIKE', '%ООО%')]);
    expect(buildSql({ table: 't', tree }).sql).toContain(`"name" LIKE '%ООО%'`);
  });

  it('дата в кавычках', () => {
    const tree = group('AND', [cond('d', 'date', '>=', '2020-01-01')]);
    expect(buildSql({ table: 't', tree }).sql).toContain(`"d" >= '2020-01-01'`);
  });

  it('логическое значение: TRUE и FALSE, прочее пропускается', () => {
    const t = buildSql({ table: 't', tree: group('AND', [cond('f', 'boolean', '=', 'true')]) });
    const f = buildSql({ table: 't', tree: group('AND', [cond('f', 'boolean', '=', 'false')]) });
    const bad = buildSql({ table: 't', tree: group('AND', [cond('f', 'boolean', '=', '1 OR 1=1')]) });
    expect(t.sql).toContain('"f" = TRUE');
    expect(f.sql).toContain('"f" = FALSE');
    expect(bad.skipped).toBe(1);
    expect(bad.sql).not.toContain('WHERE');
  });

  it('неизвестный оператор пропускается и не попадает в SQL', () => {
    const tree = group('AND', [cond('n', 'number', '= 1 OR 1=1 --', '1')]);
    const { sql, skipped } = buildSql({ table: 't', tree });
    expect(skipped).toBe(1);
    expect(sql).not.toContain('OR 1=1');
  });

  it('неизвестный тип поля пропускается', () => {
    const tree = group('AND', [cond('n', 'weird', '=', '1')]);
    expect(buildSql({ table: 't', tree }).skipped).toBe(1);
  });

  it('имена таблицы и поля проходят через quoteIdent', () => {
    const tree = group('AND', [cond('a"b', 'number', '=', '1')]);
    const { sql } = buildSql({ table: 'we"ird', tree });
    expect(sql).toContain('FROM "we""ird"');
    expect(sql).toContain('WHERE "a""b" = 1');
  });

  it('refreshStamp добавляет комментарий в конец', () => {
    const { sql } = buildSql({ table: 't', tree: group('AND', []), refreshStamp: 123 });
    expect(sql.endsWith('LIMIT 1000 /* refresh:123 */')).toBe(true);
  });

  it('limit: 50 даёт LIMIT 50', () => {
    expect(buildSql({ table: 't', tree: group('AND', []), limit: 50 }).sql).toContain('LIMIT 50');
  });

  it('некорректный limit заменяется на 1000', () => {
    for (const bad of ['5; DROP', -1, 0, NaN, 1.5]) {
      expect(buildSql({ table: 't', tree: group('AND', []), limit: bad }).sql).toMatch(/LIMIT 1000$/);
    }
  });

  it('нечисловой refreshStamp игнорируется', () => {
    const { sql } = buildSql({ table: 't', tree: group('AND', []), refreshStamp: '*/ DROP' });
    expect(sql).not.toContain('refresh');
  });
});

describe('extractParams', () => {
  it('возвращает уникальные имена в порядке появления', () => {
    const tree = group('AND', [
      cond('a', 'text', '=', '$Регион'),
      cond('b', 'text', '=', '$Регион'),
      cond('c', 'number', 'BETWEEN', '$год', '$год2'),
    ]);
    expect(extractParams(tree)).toEqual(['Регион', 'год', 'год2']);
  });

  it('ищет во вложенных группах', () => {
    const tree = group('AND', [group('OR', [cond('a', 'text', '=', '$x')])]);
    expect(extractParams(tree)).toEqual(['x']);
  });

  it('значения из примера плана', () => {
    const tree = group('AND', [
      cond('a', 'text', '=', '$Регион'),
      cond('b', 'text', '=', '$Регион'),
      cond('c', 'number', '=', '$год'),
    ]);
    expect(extractParams(tree)).toEqual(['Регион', 'год']);
  });
});

describe('substituteParams', () => {
  it('подставляет значение, buildSql экранирует кавычку', () => {
    const tree = group('AND', [cond('r', 'text', '=', '$Регион')]);
    const next = substituteParams(tree, { Регион: "Рег'ион" });
    expect(buildSql({ table: 't', tree: next }).sql).toContain(`"r" = 'Рег''ион'`);
  });

  it('не меняет исходное дерево', () => {
    const tree = group('AND', [cond('r', 'text', '=', '$x')]);
    substituteParams(tree, { x: 'v' });
    expect(tree.children[0].value).toBe('$x');
  });

  it('подставляет в value2 и во вложенные группы', () => {
    const tree = group('AND', [group('OR', [cond('n', 'number', 'BETWEEN', '$a', '$b')])]);
    const next = substituteParams(tree, { a: '1', b: '5' });
    expect(buildSql({ table: 't', tree: next }).sql).toContain('"n" BETWEEN 1 AND 5');
  });

  it('числовой параметр с мусором всё равно пропускается', () => {
    const tree = group('AND', [cond('n', 'number', '=', '$x')]);
    const next = substituteParams(tree, { x: '1; DROP TABLE x' });
    const { sql, skipped } = buildSql({ table: 't', tree: next });
    expect(skipped).toBe(1);
    expect(sql).not.toContain('DROP');
  });

  it('спецпоследовательности $& в значении не раскрываются', () => {
    const tree = group('AND', [cond('r', 'text', '=', '$x')]);
    const next = substituteParams(tree, { x: '$&$1' });
    expect(next.children[0].value).toBe('$&$1');
  });

  it('параметр без значения остаётся как есть', () => {
    const tree = group('AND', [cond('r', 'text', '=', '$x')]);
    expect(substituteParams(tree, {}).children[0].value).toBe('$x');
  });
});

describe('buildSuggestSql', () => {
  it('строит запрос подсказок с экранированием кавычки', () => {
    expect(buildSuggestSql('stores_store', 'name', "О'К")).toBe(
      `SELECT DISTINCT "name" FROM "stores_store" WHERE "name"::text ILIKE 'О''К%' ORDER BY 1 LIMIT 10`
    );
  });

  it('кавычка в префиксе удваивается', () => {
    expect(buildSuggestSql('t', 'f', "a'b")).toContain(`ILIKE 'a''b%'`);
  });

  it('пустой префикс даёт ILIKE \'%\'', () => {
    expect(buildSuggestSql('t', 'f', '')).toContain(`ILIKE '%'`);
  });

  it('% и _ в префиксе не экранируются', () => {
    expect(buildSuggestSql('t', 'f', '50%_x')).toContain(`ILIKE '50%_x%'`);
  });

  it('двойные кавычки в таблице и поле удваиваются', () => {
    expect(buildSuggestSql('ta"b', 'fi"eld', 'x')).toBe(
      `SELECT DISTINCT "fi""eld" FROM "ta""b" WHERE "fi""eld"::text ILIKE 'x%' ORDER BY 1 LIMIT 10`
    );
  });
});
