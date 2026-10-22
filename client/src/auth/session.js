import { getAccount } from './accounts';

// Токен локального пользователя выглядит как local:<логин>, токен сервера это обычный JWT
const LOCAL_PREFIX = 'local:';

export const makeLocalToken = username => `${LOCAL_PREFIX}${username}`;
export const isLocalToken = token => typeof token === 'string' && token.startsWith(LOCAL_PREFIX);

function readToken() {
  try { return localStorage.getItem('token'); } catch { return null; }
}

export function currentLocalUsername() {
  const token = readToken();
  return isLocalToken(token) ? token.slice(LOCAL_PREFIX.length) : null;
}

export function currentLocalAccount() {
  const username = currentLocalUsername();
  return username ? getAccount(username) : null;
}

export const isLocalAdmin = () => currentLocalAccount()?.role === 'admin';

export function logout() {
  try { localStorage.removeItem('token'); } catch { /* нечего удалять */ }
}
