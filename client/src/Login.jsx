import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BracketMark from './BracketMark';
import { ensureSeeded, registerAccount, verifyLogin } from './auth/accounts';
import { makeLocalToken } from './auth/session';
import './Login.css';

const DEMO = [
  { title: 'Администратор', username: 'admin', password: 'admin123' },
  { title: 'Сотрудник', username: 'ivan', password: 'user123' },
];

export default function Login() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '', password2: '', fullName: '', position: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const isRegister = mode === 'register';
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));

  const switchMode = next => { setMode(next); setError(''); };

  const enter = username => {
    localStorage.setItem('token', makeLocalToken(username));
    navigate('/constructor');
  };

  // Сначала проверяем локальные учётные записи, потом сервер
  const handleLogin = async () => {
    await ensureSeeded();
    const account = await verifyLogin(form.username, form.password);
    if (account) { enter(account.username); return; }
    try {
      const res = await axios.post('http://localhost:8000/api/login/', {
        username: form.username, password: form.password,
      });
      localStorage.setItem('token', res.data.access);
      navigate('/constructor');
    } catch {
      setError('Неверный логин или пароль');
    }
  };

  const handleRegister = async () => {
    if (form.password !== form.password2) { setError('Пароли не совпадают'); return; }
    await ensureSeeded();
    const account = await registerAccount({
      username: form.username, password: form.password, fullName: form.fullName, position: form.position,
    });
    enter(account.username);
  };

  const submit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await (isRegister ? handleRegister() : handleLogin());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = demo => {
    switchMode('login');
    setForm(f => ({ ...f, username: demo.username, password: demo.password }));
  };

  const canSubmit = form.username && form.password && (!isRegister || form.password2);

  return (
    <div className="login">
      <aside className="login-side">
        <div className="login-brand">
          <BracketMark size={30} />
          Multi-DB Portal
        </div>
        <div className="login-lead">
          <p>Выборки из баз данных без написания SQL</p>
          <span>Соберите условия перетаскиванием, проверьте запрос и получите таблицу.</span>
        </div>
        <BracketMark className="login-art" size={560} />
      </aside>

      <main className="login-main">
        <form className="login-form" onSubmit={submit}>
          <div className="login-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={!isRegister}
              className={!isRegister ? 'is-on' : ''} onClick={() => switchMode('login')}>Вход</button>
            <button type="button" role="tab" aria-selected={isRegister}
              className={isRegister ? 'is-on' : ''} onClick={() => switchMode('register')}>Регистрация</button>
          </div>

          <p className="login-sub">
            {isRegister
              ? 'После регистрации администратор откроет вам доступ к базам.'
              : 'Используйте логин и пароль, которые выдал администратор.'}
          </p>

          {isRegister && (
            <>
              <label>
                ФИО
                <input autoComplete="name" value={form.fullName} onChange={e => set('fullName', e.target.value)} />
              </label>
              <label>
                Должность
                <input value={form.position} onChange={e => set('position', e.target.value)} />
              </label>
            </>
          )}
          <label>
            Логин
            <input autoFocus autoComplete="username" value={form.username}
              onChange={e => set('username', e.target.value)} />
          </label>
          <label>
            Пароль
            <input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={form.password} onChange={e => set('password', e.target.value)} />
          </label>
          {isRegister && (
            <label>
              Повторите пароль
              <input type="password" autoComplete="new-password" value={form.password2}
                onChange={e => set('password2', e.target.value)} />
            </label>
          )}

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" className="login-submit" disabled={loading || !canSubmit}>
            {loading ? 'Подождите…' : isRegister ? 'Зарегистрироваться' : 'Войти'}
          </button>

          <div className="login-demo">
            <span>Демо-доступ для показа, нажмите, чтобы подставить:</span>
            <div>
              {DEMO.map(d => (
                <button type="button" key={d.username} onClick={() => fillDemo(d)}>
                  {d.title}: {d.username} / {d.password}
                </button>
              ))}
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}
