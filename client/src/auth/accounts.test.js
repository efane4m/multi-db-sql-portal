import { beforeEach, describe, expect, it } from 'vitest';
import {
  changePassword,
  createAccount,
  deleteAccount,
  ensureSeeded,
  getAccount,
  listAccounts,
  publicProfile,
  registerAccount,
  updateAccount,
  verifyLogin,
} from './accounts.js';

const KEY = 'qc_accounts';

function memoryStorage() {
  const data = {};
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

const USERNAME_MSG =
  'Логин: от 3 до 30 символов, латиница, цифры, точка, дефис и подчёркивание';
const PASSWORD_MSG = 'Пароль: не короче 6 символов';

let storage;

beforeEach(() => {
  storage = memoryStorage();
});

describe('ensureSeeded', () => {
  it('создаёт администратора и 8 сотрудников', async () => {
    await ensureSeeded(storage);
    const list = listAccounts(storage);
    expect(list).toHaveLength(9);
    const admin = getAccount('admin', storage);
    expect(admin.role).toBe('admin');
    expect(admin.fullName).toBe('Администратор системы');
    expect(admin.position).toBe('Главный администратор');
    expect(admin.databases).toEqual(['demo_stores', 'demo_logistics']);
  });

  it('администратор входит с admin123, сотрудник с user123', async () => {
    await ensureSeeded(storage);
    expect((await verifyLogin('admin', 'admin123', storage)).role).toBe('admin');
    const ivan = await verifyLogin('ivan', 'user123', storage);
    expect(ivan.role).toBe('user');
    expect(ivan.fullName).toBe('Иванов Иван Петрович');
  });

  it('у сотрудников разный доступ, у одного его нет', async () => {
    await ensureSeeded(storage);
    const users = listAccounts(storage).filter((a) => a.role === 'user');
    expect(users).toHaveLength(8);
    const sizes = users.map((u) => u.databases.length);
    expect(sizes).toContain(2);
    expect(sizes).toContain(1);
    expect(sizes.filter((n) => n === 0)).toHaveLength(1);
  });

  it('не хранит пароль открытым текстом', async () => {
    await ensureSeeded(storage);
    const raw = storage.getItem(KEY);
    expect(raw).not.toContain('admin123');
    expect(raw).not.toContain('user123');
  });

  it('повторный вызов не перезаписывает правки', async () => {
    await ensureSeeded(storage);
    await updateAccount('ivan', { position: 'Начальник отдела' }, storage);
    await ensureSeeded(storage);
    expect(getAccount('ivan', storage).position).toBe('Начальник отдела');
  });

  it('пересоздаёт данные при повреждённом JSON', async () => {
    storage.setItem(KEY, '{не json');
    await ensureSeeded(storage);
    expect(listAccounts(storage)).toHaveLength(9);
    expect(await verifyLogin('admin', 'admin123', storage)).not.toBeNull();
  });

  it('пересоздаёт данные при пустом списке', async () => {
    storage.setItem(KEY, '[]');
    await ensureSeeded(storage);
    expect(listAccounts(storage)).toHaveLength(9);
  });
});

describe('listAccounts / getAccount', () => {
  it('повреждённый JSON даёт пустой список', () => {
    storage.setItem(KEY, 'xxx');
    expect(listAccounts(storage)).toEqual([]);
  });

  it('getAccount ищет без учёта регистра и возвращает null', async () => {
    await ensureSeeded(storage);
    expect(getAccount('ADMIN', storage).username).toBe('admin');
    expect(getAccount('nobody', storage)).toBeNull();
  });
});

describe('verifyLogin', () => {
  beforeEach(async () => {
    await ensureSeeded(storage);
  });

  it('логин без учёта регистра', async () => {
    const acc = await verifyLogin('AdMiN', 'admin123', storage);
    expect(acc.username).toBe('admin');
  });

  it('неверный пароль или логин даёт null', async () => {
    expect(await verifyLogin('admin', 'wrong', storage)).toBeNull();
    expect(await verifyLogin('ghost', 'admin123', storage)).toBeNull();
  });
});

describe('registerAccount', () => {
  const base = {
    username: 'Petrov',
    password: 'secret1',
    fullName: '  Петров Пётр  ',
    position: '  Статистик ',
  };

  it('роль user, баз нет, поля обрезаются, логин как введён', async () => {
    const acc = await registerAccount(base, storage);
    expect(acc.username).toBe('Petrov');
    expect(acc.role).toBe('user');
    expect(acc.databases).toEqual([]);
    expect(acc.fullName).toBe('Петров Пётр');
    expect(acc.position).toBe('Статистик');
    expect(typeof acc.createdAt).toBe('string');
    expect(acc.salt).toMatch(/^[0-9a-f]{32}$/);
    expect(acc.passwordHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyLogin('petrov', 'secret1', storage)).not.toBeNull();
  });

  it('игнорирует role и databases из входных данных', async () => {
    const acc = await registerAccount(
      { ...base, role: 'admin', databases: ['demo_stores'] },
      storage,
    );
    expect(acc.role).toBe('user');
    expect(acc.databases).toEqual([]);
  });

  it('разная соль у одинаковых паролей', async () => {
    const a = await registerAccount({ ...base, username: 'aaa' }, storage);
    const b = await registerAccount({ ...base, username: 'bbb' }, storage);
    expect(a.salt).not.toBe(b.salt);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});

describe('валидация', () => {
  const base = { username: 'newuser', password: 'secret1', fullName: 'А', position: 'Б' };

  it('некорректный логин', async () => {
    for (const username of ['ab', 'a'.repeat(31), 'с кириллицей', 'with space', '']) {
      await expect(registerAccount({ ...base, username }, storage)).rejects.toThrow(
        USERNAME_MSG,
      );
    }
  });

  it('короткий пароль', async () => {
    await expect(
      registerAccount({ ...base, password: '12345' }, storage),
    ).rejects.toThrow(PASSWORD_MSG);
    await expect(
      createAccount({ ...base, password: '', role: 'user', databases: [] }, storage),
    ).rejects.toThrow(PASSWORD_MSG);
  });

  it('дубликат логина без учёта регистра', async () => {
    await registerAccount(base, storage);
    await expect(
      registerAccount({ ...base, username: 'NEWUSER' }, storage),
    ).rejects.toThrow('Такой логин уже занят');
    await expect(
      createAccount({ ...base, role: 'user', databases: [] }, storage),
    ).rejects.toThrow('Такой логин уже занят');
  });

  it('неизвестная роль', async () => {
    await expect(
      createAccount({ ...base, role: 'root', databases: [] }, storage),
    ).rejects.toThrow('Неизвестная роль');
    await registerAccount(base, storage);
    await expect(updateAccount('newuser', { role: 'root' }, storage)).rejects.toThrow(
      'Неизвестная роль',
    );
  });

  it('неизвестный пользователь в update/delete', async () => {
    await expect(updateAccount('ghost', { position: 'x' }, storage)).rejects.toThrow(
      'Пользователь не найден',
    );
    expect(() => deleteAccount('ghost', storage)).toThrow('Пользователь не найден');
  });

  it('короткий новый пароль в update', async () => {
    await registerAccount(base, storage);
    await expect(updateAccount('newuser', { password: '123' }, storage)).rejects.toThrow(
      PASSWORD_MSG,
    );
  });
});

describe('createAccount', () => {
  it('создаёт администратора с базами', async () => {
    const acc = await createAccount(
      {
        username: 'boss',
        password: 'bosspass',
        fullName: 'Босс',
        position: 'Директор',
        role: 'admin',
        databases: ['demo_stores'],
      },
      storage,
    );
    expect(acc.role).toBe('admin');
    expect(acc.databases).toEqual(['demo_stores']);
    expect(listAccounts(storage)).toHaveLength(1);
  });
});

describe('updateAccount', () => {
  beforeEach(async () => {
    await ensureSeeded(storage);
  });

  it('меняет роль, базы и ФИО', async () => {
    const acc = await updateAccount(
      'ivan',
      { role: 'admin', databases: ['demo_logistics'], fullName: '  Новый  ' },
      storage,
    );
    expect(acc.role).toBe('admin');
    expect(acc.databases).toEqual(['demo_logistics']);
    expect(getAccount('ivan', storage).fullName).toBe('Новый');
  });

  it('меняет пароль с новой солью', async () => {
    const before = getAccount('ivan', storage);
    await updateAccount('IVAN', { password: 'newpass1' }, storage);
    const after = getAccount('ivan', storage);
    expect(after.salt).not.toBe(before.salt);
    expect(await verifyLogin('ivan', 'user123', storage)).toBeNull();
    expect(await verifyLogin('ivan', 'newpass1', storage)).not.toBeNull();
  });

  it('логин не меняется', async () => {
    const acc = await updateAccount('ivan', { username: 'other' }, storage);
    expect(acc.username).toBe('ivan');
    expect(getAccount('other', storage)).toBeNull();
  });
});

describe('защита последнего администратора', () => {
  const LAST = 'Нельзя удалить или понизить последнего администратора';

  beforeEach(async () => {
    await ensureSeeded(storage);
  });

  it('нельзя удалить', () => {
    expect(() => deleteAccount('admin', storage)).toThrow(LAST);
    expect(getAccount('admin', storage)).not.toBeNull();
  });

  it('нельзя понизить', async () => {
    await expect(updateAccount('admin', { role: 'user' }, storage)).rejects.toThrow(LAST);
    expect(getAccount('admin', storage).role).toBe('admin');
  });

  it('можно, если есть другой администратор', async () => {
    await updateAccount('ivan', { role: 'admin' }, storage);
    await updateAccount('admin', { role: 'user' }, storage);
    expect(getAccount('admin', storage).role).toBe('user');
    deleteAccount('admin', storage);
    expect(getAccount('admin', storage)).toBeNull();
  });

  it('обычного пользователя удалить можно', () => {
    deleteAccount('ivan', storage);
    expect(getAccount('ivan', storage)).toBeNull();
    expect(listAccounts(storage)).toHaveLength(8);
  });
});

describe('changePassword', () => {
  beforeEach(async () => {
    await ensureSeeded(storage);
  });

  it('меняет пароль при верном старом', async () => {
    await changePassword('ivan', 'user123', 'brandnew1', storage);
    expect(await verifyLogin('ivan', 'user123', storage)).toBeNull();
    expect(await verifyLogin('ivan', 'brandnew1', storage)).not.toBeNull();
  });

  it('неверный старый пароль', async () => {
    await expect(changePassword('ivan', 'bad', 'brandnew1', storage)).rejects.toThrow(
      'Старый пароль введён неверно',
    );
    expect(await verifyLogin('ivan', 'user123', storage)).not.toBeNull();
  });

  it('короткий новый пароль', async () => {
    await expect(changePassword('ivan', 'user123', '123', storage)).rejects.toThrow(
      PASSWORD_MSG,
    );
  });

  it('неизвестный пользователь', async () => {
    await expect(changePassword('ghost', 'a', 'brandnew1', storage)).rejects.toThrow(
      'Пользователь не найден',
    );
  });
});

describe('publicProfile', () => {
  it('не содержит хэша и соли', async () => {
    await ensureSeeded(storage);
    const profile = publicProfile(getAccount('maria', storage));
    expect(profile).toEqual({
      username: 'maria',
      full_name: 'Смирнова Мария Андреевна',
      position: 'Старший статистик',
      role: 'user',
      photo: null,
      databases: expect.any(Array),
    });
    const json = JSON.stringify(profile);
    expect(json).not.toMatch(/hash|salt|passwordHash/i);
  });
});
