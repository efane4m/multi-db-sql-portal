import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { fetchSchema, fetchSuggestions, runQuery } from './api';

vi.mock('axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', { getItem: () => 'test-session' });
});
afterEach(() => vi.unstubAllGlobals());

describe('real database API adapter', () => {
  it('loads schema from metadata endpoint, preserving field kinds', async () => {
    axios.get.mockResolvedValue({ data: { tables: [
      { schema: 'public', name: 'stores_store', columns: [{ name: 'id', kind: 'number' }] },
    ] } });
    expect(await fetchSchema('db_stores')).toEqual({ stores_store: [{ name: 'id', kind: 'number' }] });
    expect(axios.get.mock.calls[0][0]).toContain('/databases/db_stores/schema/');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('loads value suggestions using query parameters', async () => {
    axios.get.mockResolvedValue({ data: { values: ['Москва'] } });
    expect(await fetchSuggestions('db_stores', 'stores_store', 'region', 'М')).toEqual(['Москва']);
    expect(axios.get.mock.calls[0][1].params).toEqual({ field: 'region', prefix: 'М' });
  });

  it('sends explicit refresh instead of relying on SQL comments', async () => {
    axios.post.mockResolvedValue({ data: { data: [], cached: false } });
    await runQuery('db_stores', 'SELECT 1', { refresh: true });
    expect(axios.post.mock.calls[0][1]).toEqual({ db_name: 'db_stores', query: 'SELECT 1', refresh: true });
  });
});
