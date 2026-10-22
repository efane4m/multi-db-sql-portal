import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { toCsv, toJson, toXlsx } from './export';

const BOM = '﻿';

describe('toCsv', () => {
  it('quotes commas and quotes, empties null', () => {
    expect(toCsv([{ a: 'x,y', b: null, c: 'he said "hi"' }])).toBe(
      BOM + 'a,b,c\r\n"x,y",,"he said ""hi"""'
    );
  });

  it('returns empty string for no rows', () => {
    expect(toCsv([])).toBe('');
  });

  it('writes booleans as true/false', () => {
    expect(toCsv([{ a: true, b: false }])).toBe(BOM + 'a,b\r\ntrue,false');
  });

  it('writes numbers as-is', () => {
    expect(toCsv([{ a: 1, b: -2.5, c: 0 }])).toBe(BOM + 'a,b,c\r\n1,-2.5,0');
  });

  it('quotes values with a line break', () => {
    expect(toCsv([{ a: 'one\ntwo' }])).toBe(BOM + 'a\r\n"one\ntwo"');
  });

  it('separates rows with CRLF', () => {
    expect(toCsv([{ a: 1 }, { a: 2 }])).toBe(BOM + 'a\r\n1\r\n2');
  });
});

describe('toJson', () => {
  it('round-trips rows', () => {
    const rows = [{ a: 1, b: null }, { a: 'x', b: true }];
    expect(JSON.parse(toJson(rows))).toEqual(rows);
  });

  it('returns [] for an empty array', () => {
    expect(toJson([])).toBe('[]');
  });
});

describe('toXlsx', () => {
  const read = (rows) => {
    const files = unzipSync(toXlsx(rows));
    return { files, sheet: strFromU8(files['xl/worksheets/sheet1.xml']) };
  };

  it('contains all required parts', () => {
    const { files } = read([{ a: 1 }]);
    for (const part of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(Object.keys(files)).toContain(part);
    }
    expect(strFromU8(files['xl/workbook.xml'])).toContain('name="Результат"');
    expect(strFromU8(files['xl/styles.xml'])).toContain('<b/>');
  });

  it('writes header cells in row 1, bold', () => {
    const { sheet } = read([{ name: 'x', age: 3 }]);
    const row1 = sheet.match(/<row r="1"[^>]*>.*?<\/row>/)[0];
    expect(row1).toContain('r="A1"');
    expect(row1).toContain('r="B1"');
    expect(row1).toContain('name');
    expect(row1).toContain('s="1"');
  });

  it('writes numbers as numeric cells', () => {
    const { sheet } = read([{ n: 42.5 }]);
    expect(sheet).toContain('<c r="A2"><v>42.5</v></c>');
  });

  it('writes booleans with t="b"', () => {
    const { sheet } = read([{ a: true, b: false }]);
    expect(sheet).toContain('<c r="A2" t="b"><v>1</v></c>');
    expect(sheet).toContain('<c r="B2" t="b"><v>0</v></c>');
  });

  it('escapes XML special characters and strips illegal ones', () => {
    const { sheet } = read([{ a: `a&b<c>d"e'f\u0001g` }]);
    expect(sheet).toContain('a&amp;b&lt;c&gt;d&quot;e&apos;fg');
    expect(sheet).not.toContain('\u0001');
  });

  it('leaves null cells absent', () => {
    const { sheet } = read([{ a: null, b: 'x' }]);
    expect(sheet).not.toContain('r="A2"');
    expect(sheet).toContain('r="B2"');
  });

  it('uses column letters beyond Z (30 columns -> AD)', () => {
    const row = {};
    for (let i = 0; i < 30; i++) row[`c${i}`] = i;
    const { sheet } = read([row]);
    expect(sheet).toContain('r="AA1"');
    expect(sheet).toContain('r="AD1"');
    expect(sheet).not.toContain('r="AE1"');
  });

  it('produces a valid workbook for an empty array', () => {
    const { files, sheet } = read([]);
    expect(Object.keys(files)).toContain('xl/worksheets/sheet1.xml');
    expect(sheet).toContain('<sheetData');
  });
});
