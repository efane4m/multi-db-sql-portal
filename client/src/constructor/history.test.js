import { describe, it, expect } from 'vitest';
import { createHistory, push, undo, redo, canUndo, canRedo } from './history.js';

describe('history', () => {
  const abc = () => push(push(createHistory('a'), 'b'), 'c');

  it('createHistory создаёт пустую историю', () => {
    expect(createHistory('a')).toEqual({ past: [], present: 'a', future: [] });
  });

  it('undo возвращает предыдущее значение, redo - следующее', () => {
    const back = undo(abc());
    expect(back.present).toBe('b');
    expect(redo(back).present).toBe('c');
  });

  it('push после undo очищает future', () => {
    const h = push(undo(abc()), 'd');
    expect(h.present).toBe('d');
    expect(h.future).toEqual([]);
    expect(canRedo(h)).toBe(false);
  });

  it('undo на новой истории не меняет её', () => {
    const h = createHistory('a');
    expect(undo(h)).toBe(h);
  });

  it('redo без future не меняет историю', () => {
    const h = abc();
    expect(redo(h)).toBe(h);
  });

  it('canUndo и canRedo отражают состояние', () => {
    const h = createHistory('a');
    expect(canUndo(h)).toBe(false);
    expect(canRedo(h)).toBe(false);
    const p = push(h, 'b');
    expect(canUndo(p)).toBe(true);
    expect(canRedo(p)).toBe(false);
    const u = undo(p);
    expect(canUndo(u)).toBe(false);
    expect(canRedo(u)).toBe(true);
  });

  it('past ограничен 100 записями, самые старые отбрасываются', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 150; i++) h = push(h, i);
    expect(h.past).toHaveLength(100);
    expect(h.past[0]).toBe(50);
    expect(h.past[99]).toBe(149);
    expect(h.present).toBe(150);
  });
});
