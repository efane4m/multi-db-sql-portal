import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import BracketMark from './BracketMark';
import './Login.css';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('http://localhost:8000/api/login/', { username, password });
      localStorage.setItem('token', res.data.access);
      navigate('/constructor');
    } catch (err) {
      setError(err.response ? 'Неверный логин или пароль' : 'Сервер недоступен, попробуйте позже');
    } finally {
      setLoading(false);
    }
  };

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
        <form className="login-form" onSubmit={handleLogin}>
          <h1>Вход</h1>
          <p className="login-sub">Используйте логин и пароль, которые выдал администратор.</p>

          <label>
            Логин
            <input
              autoFocus autoComplete="username"
              value={username} onChange={e => setUsername(e.target.value)}
            />
          </label>
          <label>
            Пароль
            <input
              type="password" autoComplete="current-password"
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </label>

          {error && <div className="login-error" role="alert">{error}</div>}

          <button type="submit" disabled={loading || !username || !password}>
            {loading ? 'Входим…' : 'Войти'}
          </button>
        </form>
      </main>
    </div>
  );
}
