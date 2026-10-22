import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../AppHeader';
import { createAccount, deleteAccount, ensureSeeded, listAccounts, updateAccount } from '../auth/accounts';
import { currentLocalUsername } from '../auth/session';
import { MOCK_DATABASES } from '../constructor/mock/data';
import '../constructor/constructor.css';
import './admin.css';

const ROLES = { admin: 'Администратор', user: 'Пользователь' };
const dbLabel = name => MOCK_DATABASES[name]?.label ?? name;

function UserDialog({ account, onClose, onSaved }) {
  const isNew = !account;
  const [form, setForm] = useState(() => ({
    username: account?.username ?? '',
    fullName: account?.fullName ?? '',
    position: account?.position ?? '',
    role: account?.role ?? 'user',
    password: '',
    databases: new Set(account?.databases ?? []),
  }));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const toggleDb = name => setForm(f => {
    const next = new Set(f.databases);
    if (next.has(name)) next.delete(name); else next.add(name);
    return { ...f, databases: next };
  });

  const submit = async e => {
    e.preventDefault();
    setError('');
    setSaving(true);
    const data = {
      fullName: form.fullName, position: form.position, role: form.role, databases: [...form.databases],
    };
    try {
      if (isNew) await createAccount({ ...data, username: form.username, password: form.password });
      else await updateAccount(account.username, form.password ? { ...data, password: form.password } : data);
      onSaved(isNew ? form.username : account.username, form.role);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="qc-modal" role="dialog" aria-modal="true" aria-labelledby="adm-dialog-title"
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <form className="qc-modal-box adm-dialog" onSubmit={submit}>
        <h2 id="adm-dialog-title">{isNew ? 'Новый пользователь' : 'Изменить пользователя'}</h2>

        <div className="adm-form">
          <label>
            Логин
            <input value={form.username} disabled={!isNew} autoFocus={isNew}
              onChange={e => set('username', e.target.value)} />
          </label>
          <label>
            {isNew ? 'Пароль' : 'Новый пароль'}
            <input type="password" value={form.password} autoComplete="new-password"
              placeholder={isNew ? '' : 'Оставьте пустым, чтобы не менять'}
              onChange={e => set('password', e.target.value)} />
          </label>
          <label>
            ФИО
            <input value={form.fullName} autoFocus={!isNew} onChange={e => set('fullName', e.target.value)} />
          </label>
          <label>
            Должность
            <input value={form.position} onChange={e => set('position', e.target.value)} />
          </label>
          <label>
            Роль
            <select value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="user">Пользователь</option>
              <option value="admin">Администратор</option>
            </select>
          </label>
        </div>

        <fieldset className="adm-access">
          <legend>Доступ к базам</legend>
          {Object.keys(MOCK_DATABASES).map(name => (
            <label key={name} className="adm-check">
              <input type="checkbox" checked={form.databases.has(name)} onChange={() => toggleDb(name)} />
              {dbLabel(name)}
            </label>
          ))}
          {form.role === 'admin' && <p className="qc-hint">Администратор видит все базы независимо от отметок.</p>}
        </fieldset>

        {error && <div className="qc-alert is-error" role="alert">{error}</div>}

        <div className="qc-modal-actions">
          <button type="button" className="qc-btn" onClick={onClose}>Отмена</button>
          <button type="submit" className="qc-btn is-primary" disabled={saving}>Сохранить</button>
        </div>
      </form>
    </div>
  );
}

export default function AdminPage() {
  const navigate = useNavigate();
  const me = currentLocalUsername();
  const [accounts, setAccounts] = useState(() => listAccounts());
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState(null); // null, 'new' или логин
  const [confirmId, setConfirmId] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    ensureSeeded().then(() => setAccounts(listAccounts()));
  }, []);

  const refresh = () => setAccounts(listAccounts());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return accounts;
    return accounts.filter(a => [a.fullName, a.username, a.position].some(v => v.toLowerCase().includes(q)));
  }, [accounts, query]);

  const admins = accounts.filter(a => a.role === 'admin').length;
  const withoutAccess = accounts.filter(a => a.role !== 'admin' && a.databases.length === 0).length;

  const onSaved = (username, role) => {
    setDialog(null);
    refresh();
    setFlash({ text: 'Изменения сохранены.', ok: true });
    if (username.toLowerCase() === me?.toLowerCase() && role !== 'admin') navigate('/constructor');
  };

  const remove = username => {
    setConfirmId(null);
    try {
      deleteAccount(username);
      refresh();
      setFlash({ text: `Пользователь ${username} удалён.`, ok: true });
    } catch (err) {
      setFlash({ text: err.message });
    }
  };

  const editing = dialog && dialog !== 'new' ? accounts.find(a => a.username === dialog) : null;

  return (
    <div className="qc">
      <AppHeader />
      <div className="qc-body">
        <header className="qc-header">
          <div>
            <h1>Пользователи</h1>
            <p className="qc-hint adm-summary">
              Всего: {accounts.length}. Администраторов: {admins}. Без доступа к базам: {withoutAccess}.
            </p>
          </div>
          <div className="qc-pickers">
            <label>
              Поиск
              <input className="adm-search" value={query} placeholder="ФИО, логин или должность" onChange={e => setQuery(e.target.value)} />
            </label>
            <button className="qc-btn is-primary adm-add" onClick={() => { setFlash(null); setDialog('new'); }}>
              Добавить пользователя
            </button>
          </div>
        </header>

        {flash && <div className={`qc-alert${flash.ok ? ' is-ok' : ''}`} role="status">{flash.text}</div>}

        <section className="qc-card adm-card">
          <div className="qc-table-wrap">
            <table className="qc-table adm-table">
              <thead>
                <tr><th>Пользователь</th><th>Должность</th><th>Роль</th><th>Доступные базы</th><th /></tr>
              </thead>
              <tbody>
                {visible.map(a => (
                  <tr key={a.username}>
                    <td>
                      <strong>{a.fullName || a.username}</strong>
                      <span className="adm-login">{a.username}</span>
                    </td>
                    <td>{a.position || '—'}</td>
                    <td><span className={`adm-role${a.role === 'admin' ? ' is-admin' : ''}`}>{ROLES[a.role]}</span></td>
                    <td>
                      {a.role === 'admin'
                        ? 'Все базы'
                        : a.databases.length ? a.databases.map(dbLabel).join(', ') : <span className="adm-none">Нет доступа</span>}
                    </td>
                    <td className="adm-actions">
                      <button className="qc-btn is-small" onClick={() => { setFlash(null); setDialog(a.username); }}>Изменить</button>
                      {confirmId === a.username ? (
                        <button className="qc-btn is-small is-danger" onClick={() => remove(a.username)}>Точно удалить?</button>
                      ) : (
                        <button className="qc-btn is-small" disabled={a.username.toLowerCase() === me?.toLowerCase()}
                          title={a.username.toLowerCase() === me?.toLowerCase() ? 'Свою учётную запись удалить нельзя' : 'Удалить пользователя'}
                          onClick={() => setConfirmId(a.username)}>
                          Удалить
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <div className="qc-empty">Никого не найдено. Измените запрос поиска.</div>}
        </section>

        {dialog && (
          <UserDialog key={dialog} account={editing} onClose={() => setDialog(null)} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}
