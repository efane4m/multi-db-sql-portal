import axios from 'axios';
import { SCHEMA_SQL, parseSchema } from './schema';
import { isMockDb, mockDbLabel, mockDbNames, runMockQuery, suggestMock } from './mock/engine';
import { buildSuggestSql } from './sql';

const API = 'http://localhost:8000/api';

function authHeader() {
  return { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
}

// Любой ответ сервера превращаем в Error с понятным текстом; 401 выбрасывает на логин
function toError(err) {
  if (err.response?.status === 401) {
    localStorage.removeItem('token');
    window.location.assign('/login');
  }
  const data = err.response?.data;
  return new Error(data?.error || data?.detail || err.message || 'Неизвестная ошибка');
}

// Демо-базы живут в браузере и доступны всегда, даже если сервер не отвечает
export async function fetchDatabases() {
  let real = [];
  try {
    const res = await axios.get(`${API}/databases/`, authHeader());
    real = res.data.databases;
  } catch (err) {
    const error = toError(err);
    if (err.response) throw error;
  }
  return [...mockDbNames(), ...real];
}

export const dbLabel = name => mockDbLabel(name);

export async function runQuery(db, sql) {
  if (isMockDb(db)) return runMockQuery(db, sql);
  try {
    const res = await axios.post(`${API}/query/`, { db_name: db, query: sql }, authHeader());
    return { data: res.data.data, cached: res.data.cached };
  } catch (err) {
    throw toError(err);
  }
}

export async function fetchSchema(db) {
  const { data } = await runQuery(db, SCHEMA_SQL);
  return parseSchema(data);
}

// Логин нужен, чтобы хранить шаблоны отдельно для каждого пользователя
export async function fetchUsername() {
  try {
    const res = await axios.get(`${API}/profile/`, authHeader());
    return res.data.username;
  } catch {
    return 'guest';
  }
}

// Подсказки не критичны: при любой ошибке просто возвращаем пустой список
export async function fetchSuggestions(db, table, field, prefix) {
  try {
    if (isMockDb(db)) return suggestMock(db, table, field, prefix);
    const { data } = await runQuery(db, buildSuggestSql(table, field, prefix));
    return data.map(row => String(Object.values(row)[0]));
  } catch {
    return [];
  }
}
