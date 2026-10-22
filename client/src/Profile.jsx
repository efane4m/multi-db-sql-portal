import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from './AppHeader';
import { changePassword, updateAccount } from './auth/accounts';
import { logout } from './auth/session';
import { dbLabel, fetchProfile } from './constructor/api';
import './Profile.css';

const ROLES = { admin: 'Администратор', user: 'Пользователь' };

function initials(profile) {
  const source = profile.full_name || profile.username || '';
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

// Редактирование доступно только локальным учётным записям: у сервера нет запроса на изменение
function EditForm({ profile, onSaved }) {
  const [fullName, setFullName] = useState(profile.full_name);
  const [position, setPosition] = useState(profile.position);
  const [info, setInfo] = useState(null);
  const [pw, setPw] = useState({ old: '', next: '', repeat: '' });
  const [pwInfo, setPwInfo] = useState(null);

  const saveProfile = async e => {
    e.preventDefault();
    try {
      await updateAccount(profile.username, { fullName, position });
      setInfo({ ok: true, text: 'Данные сохранены.' });
      onSaved();
    } catch (err) {
      setInfo({ text: err.message });
    }
  };

  const savePassword = async e => {
    e.preventDefault();
    if (pw.next !== pw.repeat) { setPwInfo({ text: 'Новые пароли не совпадают' }); return; }
    try {
      await changePassword(profile.username, pw.old, pw.next);
      setPw({ old: '', next: '', repeat: '' });
      setPwInfo({ ok: true, text: 'Пароль изменён.' });
    } catch (err) {
      setPwInfo({ text: err.message });
    }
  };

  return (
    <>
      <form className="pf-form" onSubmit={saveProfile}>
        <h2>Изменить данные</h2>
        <label>
          ФИО
          <input value={fullName} onChange={e => setFullName(e.target.value)} />
        </label>
        <label>
          Должность
          <input value={position} onChange={e => setPosition(e.target.value)} />
        </label>
        {info && <div className={`pf-note${info.ok ? ' is-ok' : ''}`} role="status">{info.text}</div>}
        <div><button className="pf-btn is-primary" type="submit">Сохранить</button></div>
      </form>

      <form className="pf-form" onSubmit={savePassword}>
        <h2>Сменить пароль</h2>
        <label>
          Текущий пароль
          <input type="password" autoComplete="current-password" value={pw.old}
            onChange={e => setPw(p => ({ ...p, old: e.target.value }))} />
        </label>
        <label>
          Новый пароль
          <input type="password" autoComplete="new-password" value={pw.next}
            onChange={e => setPw(p => ({ ...p, next: e.target.value }))} />
        </label>
        <label>
          Повторите новый пароль
          <input type="password" autoComplete="new-password" value={pw.repeat}
            onChange={e => setPw(p => ({ ...p, repeat: e.target.value }))} />
        </label>
        {pwInfo && <div className={`pf-note${pwInfo.ok ? ' is-ok' : ''}`} role="status">{pwInfo.text}</div>}
        <div>
          <button className="pf-btn" type="submit" disabled={!pw.old || !pw.next || !pw.repeat}>Сменить пароль</button>
        </div>
      </form>
    </>
  );
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const load = () => fetchProfile().then(setProfile).catch(() => setError('Не удалось загрузить профиль'));
  useEffect(() => { load(); }, []);

  const leave = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="pf">
      <AppHeader />
      <div className="pf-body">
        <h1>Профиль</h1>
        {error && <div className="pf-error">{error}</div>}
        {!profile && !error && <p className="pf-muted">Загрузка…</p>}
        {profile && (
          <div className="pf-columns">
            <div className="pf-sheet">
              <div className="pf-top">
                {profile.photo
                  ? <img className="pf-avatar" src={profile.photo} alt="Фото" />
                  : <div className="pf-avatar is-initials">{initials(profile)}</div>}
                <div>
                  <div className="pf-name">{profile.full_name || profile.username}</div>
                  <span className="pf-role">{ROLES[profile.role] ?? profile.role}</span>
                </div>
              </div>

              <dl className="pf-list">
                <div><dt>ФИО</dt><dd>{profile.full_name || '—'}</dd></div>
                <div><dt>Логин</dt><dd>{profile.username}</dd></div>
                <div><dt>Должность</dt><dd>{profile.position || '—'}</dd></div>
                {profile.isLocal && (
                  <div>
                    <dt>Базы</dt>
                    <dd>
                      {profile.role === 'admin'
                        ? 'Все базы'
                        : profile.databases.length ? profile.databases.map(dbLabel).join(', ') : 'Доступ пока не выдан'}
                    </dd>
                  </div>
                )}
              </dl>

              <div className="pf-actions">
                <Link to="/constructor" className="pf-btn is-primary">Перейти к конструктору</Link>
                <button className="pf-btn is-danger" onClick={leave}>Выйти</button>
              </div>
            </div>

            {profile.isLocal ? (
              <div className="pf-edit"><EditForm profile={profile} onSaved={load} /></div>
            ) : (
              <p className="pf-muted pf-edit">Данные учётной записи сервера здесь только для чтения.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
