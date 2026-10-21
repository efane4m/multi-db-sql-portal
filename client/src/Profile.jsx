import { useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function Profile() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    axios.get('http://localhost:8000/api/profile/', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }})
      .then(res => setProfile(res.data))
      .catch(() => alert('Ошибка загрузки профиля'));
  }, []);

  if (!profile) return <div style={{ padding: '50px' }}>Загрузка...</div>;

  return (
    <div style={{ padding: '50px', fontFamily: 'Arial' }}>
      <h2>Профиль</h2>
      {profile.photo && <img src={profile.photo} alt="Фото" width="150" style={{ borderRadius: '50%' }} />}
      <p><strong>ФИО:</strong> {profile.full_name}</p>
      <p><strong>Логин:</strong> {profile.username}</p>
      <p><strong>Должность:</strong> {profile.position}</p>
      <p><strong>Роль:</strong> {profile.role}</p>
      <Link to="/dashboard">Перейти к базам данных</Link>
    </div>
  );
}