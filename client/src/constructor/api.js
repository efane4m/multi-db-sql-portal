import axios from 'axios';
import { SCHEMA_SQL, parseSchema } from './schema';
import { isMockDb, mockDbLabel, mockDbNames, runMockQuery, suggestMock } from './mock/engine';
import { buildSuggestSql } from './sql';
import { ensureSeeded, getAccount, publicProfile } from '../auth/accounts';
import { currentLocalUsername, logout } from '../auth/session';

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

function redirectToLogin() {
  logout();
  window.location.assign('/login');
}

// Локальному пользователю доступны демо-базы, которые ему выдал администратор.
// Пользователю сервера демо-базы доступны всегда, даже если сервер не отвечает.
export async function fetchDatabases() {
  const local = currentLocalUsername();
  if (local) {
    await ensureSeeded();
    const account = getAccount(local);
    if (!account) { redirectToLogin(); return []; }
    return account.role === 'admin' ? mockDbNames() : account.databases.filter(isMockDb);
  }
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
  const local = currentLocalUsername();
  if (local) return local;
  try {
    const res = await axios.get(`${API}/profile/`, authHeader());
    return res.data.username;
  } catch {
    return 'guest';
  }
}

// Профиль: данные локальной учётной записи или ответ сервера
export async function fetchProfile() {
  const local = currentLocalUsername();
  if (local) {
    await ensureSeeded();
    const account = getAccount(local);
    if (!account) { redirectToLogin(); throw new Error('Пользователь не найден'); }
    return { ...publicProfile(account), isLocal: true };
  }
  try {
    const res = await axios.get(`${API}/profile/`, authHeader());
    return { ...res.data, isLocal: false };
  } catch (err) {
    throw toError(err);
  }
}

// Ручной SQL: на демо-базах работает SQLite в браузере (подгружается при первом запросе)
export async function runManualQuery(db, sql) {
  if (isMockDb(db)) {
    const { runManualMock } = await import('./mock/sqlite');
    return runManualMock(db, sql);
  }
  return runQuery(db, sql);
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
