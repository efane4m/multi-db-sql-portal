import { describe, it, expect } from 'vitest';
import { listTemplates, saveTemplate, deleteTemplate } from './templates';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: key => (key in data ? data[key] : null),
    setItem: (key, value) => { data[key] = String(value); },
  };
}

const draft = {
  name: 'Регион',
  description: 'Магазины региона',
  db: 'main',
  table: 'stores_store',
  tree: { type: 'group', op: 'AND', children: [] },
};

describe('templates', () => {
  it('возвращает сохранённый шаблон из listTemplates', () => {
    const storage = memoryStorage();
    const saved = saveTemplate('anna', draft, storage);
    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBeTruthy();
    expect(listTemplates('anna', storage)).toEqual([saved]);
  });

  it('не смешивает шаблоны разных логинов', () => {
    const storage = memoryStorage();
    saveTemplate('anna', draft, storage);
    expect(listTemplates('boris', storage)).toEqual([]);
    saveTemplate('boris', { ...draft, name: 'Другой' }, storage);
    expect(listTemplates('anna', storage)).toHaveLength(1);
    expect(listTemplates('boris', storage)[0].name).toBe('Другой');
  });

  it('обновляет запись при сохранении с тем же id', () => {
    const storage = memoryStorage();
    const first = saveTemplate('anna', draft, storage);
    const updated = saveTemplate('anna', { ...draft, id: first.id, name: 'Новое имя' }, storage);
    const list = listTemplates('anna', storage);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('Новое имя');
    expect(updated.id).toBe(first.id);
    expect(updated.createdAt).toBe(first.createdAt);
  });

  it('deleteTemplate убирает запись', () => {
    const storage = memoryStorage();
    const a = saveTemplate('anna', draft, storage);
    const b = saveTemplate('anna', { ...draft, name: 'B' }, storage);
    deleteTemplate('anna', a.id, storage);
    expect(listTemplates('anna', storage).map(t => t.id)).toEqual([b.id]);
  });

  it('повреждённый JSON даёт пустой список', () => {
    const storage = memoryStorage({ 'qc_templates:anna': '{не json' });
    expect(listTemplates('anna', storage)).toEqual([]);
  });

  it('сначала идут новые шаблоны', () => {
    const storage = memoryStorage();
    const a = saveTemplate('anna', { ...draft, name: 'A' }, storage);
    const b = saveTemplate('anna', { ...draft, name: 'B' }, storage);
    expect(listTemplates('anna', storage).map(t => t.id)).toEqual([b.id, a.id]);
  });

  it('пробрасывает ошибку setItem', () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
    expect(() => saveTemplate('anna', draft, storage)).toThrow('quota');
  });
});
