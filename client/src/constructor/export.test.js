import { describe, it, expect } from 'vitest';
import { toCsv, toJson } from './export';

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
