import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from './AppHeader';
import './Profile.css';

const ROLES = { admin: 'Администратор', user: 'Пользователь' };

function initials(profile) {
  const source = profile.full_name || profile.username || '';
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
}

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    axios.get('http://localhost:8000/api/profile/', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(res => setProfile(res.data))
      .catch(() => setError('Не удалось загрузить профиль'));
  }, []);

  const logout = () => {
    localStorage.removeItem('token');
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
            </dl>

            <div className="pf-actions">
              <Link to="/constructor" className="pf-btn is-primary">Перейти к конструктору</Link>
              <Link to="/dashboard" className="pf-btn">Ручной SQL-запрос</Link>
              <button className="pf-btn is-danger" onClick={logout}>Выйти</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
