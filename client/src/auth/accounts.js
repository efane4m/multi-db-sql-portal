const STORAGE_KEY = 'qc_accounts';
const USERNAME_RE = /^[A-Za-z0-9_.-]{3,30}$/;
const ROLES = ['admin', 'user'];

const MSG = {
  username: 'Логин: от 3 до 30 символов, латиница, цифры, точка, дефис и подчёркивание',
  password: 'Пароль: не короче 6 символов',
  taken: 'Такой логин уже занят',
  role: 'Неизвестная роль',
  lastAdmin: 'Нельзя удалить или понизить последнего администратора',
  oldPassword: 'Старый пароль введён неверно',
  notFound: 'Пользователь не найден',
};

const SEED_DB_BOTH = ['demo_stores', 'demo_logistics'];

const SEED_USERS = [
  ['ivan', 'Иванов Иван Петрович', 'Аналитик', SEED_DB_BOTH],
  ['maria', 'Смирнова Мария Андреевна', 'Старший статистик', SEED_DB_BOTH],
  ['sergey', 'Кузнецов Сергей Николаевич', 'Ведущий специалист', ['demo_stores']],
  ['elena', 'Попова Елена Викторовна', 'Начальник отдела', SEED_DB_BOTH],
  ['dmitry', 'Соколов Дмитрий Алексеевич', 'Специалист по логистике', ['demo_logistics']],
  ['olga', 'Морозова Ольга Сергеевна', 'Эксперт', ['demo_stores']],
  ['alexey', 'Новиков Алексей Дмитриевич', 'Консультант', ['demo_logistics']],
  ['tatiana', 'Фёдорова Татьяна Игоревна', 'Стажёр', []],
];

function resolveStorage(storage) {
  return storage || globalThis.localStorage;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt() {
  return bytesToHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

async function hashPassword(salt, password) {
  const data = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

function readAll(storage) {
  try {
    const parsed = JSON.parse(resolveStorage(storage).getItem(STORAGE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(list, storage) {
  resolveStorage(storage).setItem(STORAGE_KEY, JSON.stringify(list));
}

function findIndex(list, username) {
  const needle = String(username ?? '').toLowerCase();
  return list.findIndex((a) => a.username.toLowerCase() === needle);
}

function validateUsername(username) {
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    throw new Error(MSG.username);
  }
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 6) {
    throw new Error(MSG.password);
  }
}

function validateRole(role) {
  if (!ROLES.includes(role)) throw new Error(MSG.role);
}

function countAdmins(list) {
  return list.filter((a) => a.role === 'admin').length;
}

async function buildAccount({ username, password, fullName, position, role, databases }) {
  const salt = randomSalt();
  return {
    username,
    salt,
    passwordHash: await hashPassword(salt, password),
    fullName: String(fullName ?? '').trim(),
    position: String(position ?? '').trim(),
    role,
    databases: [...(databases || [])],
    createdAt: new Date().toISOString(),
  };
}

export async function ensureSeeded(storage) {
  if (readAll(storage).length > 0) return;
  const accounts = [
    await buildAccount({
      username: 'admin',
      password: 'admin123',
      fullName: 'Администратор системы',
      position: 'Главный администратор',
      role: 'admin',
      databases: SEED_DB_BOTH,
    }),
  ];
  for (const [username, fullName, position, databases] of SEED_USERS) {
    accounts.push(
      await buildAccount({ username, password: 'user123', fullName, position, role: 'user', databases }),
    );
  }
  writeAll(accounts, storage);
}

export function listAccounts(storage) {
  return readAll(storage);
}

export function getAccount(username, storage) {
  const list = readAll(storage);
  const i = findIndex(list, username);
  return i === -1 ? null : list[i];
}

export async function verifyLogin(username, password, storage) {
  const account = getAccount(username, storage);
  if (!account) return null;
  const hash = await hashPassword(account.salt, String(password ?? ''));
  return hash === account.passwordHash ? account : null;
}

export async function createAccount(input, storage) {
  validateUsername(input.username);
  validatePassword(input.password);
  validateRole(input.role);
  if (findIndex(readAll(storage), input.username) !== -1) throw new Error(MSG.taken);
  const account = await buildAccount(input);
  // Список читаем заново после await, чтобы не потерять параллельные записи
  const list = readAll(storage);
  if (findIndex(list, input.username) !== -1) throw new Error(MSG.taken);
  list.push(account);
  writeAll(list, storage);
  return account;
}

export function registerAccount({ username, password, fullName, position }, storage) {
  return createAccount(
    { username, password, fullName, position, role: 'user', databases: [] },
    storage,
  );
}

export async function updateAccount(username, patch = {}, storage) {
  if (findIndex(readAll(storage), username) === -1) throw new Error(MSG.notFound);
  if (patch.role !== undefined) validateRole(patch.role);
  let credentials = null;
  if (patch.password !== undefined) {
    validatePassword(patch.password);
    const salt = randomSalt();
    credentials = { salt, passwordHash: await hashPassword(salt, patch.password) };
  }
  const list = readAll(storage);
  const i = findIndex(list, username);
  if (i === -1) throw new Error(MSG.notFound);
  const current = list[i];
  if (
    patch.role !== undefined &&
    patch.role !== 'admin' &&
    current.role === 'admin' &&
    countAdmins(list) <= 1
  ) {
    throw new Error(MSG.lastAdmin);
  }
  const updated = { ...current, ...credentials };
  if (patch.fullName !== undefined) updated.fullName = String(patch.fullName).trim();
  if (patch.position !== undefined) updated.position = String(patch.position).trim();
  if (patch.role !== undefined) updated.role = patch.role;
  if (patch.databases !== undefined) updated.databases = [...patch.databases];
  list[i] = updated;
  writeAll(list, storage);
  return updated;
}

export function deleteAccount(username, storage) {
  const list = readAll(storage);
  const i = findIndex(list, username);
  if (i === -1) throw new Error(MSG.notFound);
  if (list[i].role === 'admin' && countAdmins(list) <= 1) throw new Error(MSG.lastAdmin);
  list.splice(i, 1);
  writeAll(list, storage);
}

export async function changePassword(username, oldPassword, newPassword, storage) {
  const account = getAccount(username, storage);
  if (!account) throw new Error(MSG.notFound);
  if (!(await verifyLogin(username, oldPassword, storage))) throw new Error(MSG.oldPassword);
  await updateAccount(username, { password: newPassword }, storage);
}

export function publicProfile(account) {
  return {
    username: account.username,
    full_name: account.fullName,
    position: account.position,
    role: account.role,
    photo: null,
    databases: [...account.databases],
  };
}
