import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post('http://localhost:8000/api/login/', { username, password });
      localStorage.setItem('token', res.data.access);
      navigate('/profile');
    } catch (err) { alert('Неверный логин или пароль'); }
  };

  return (
    <div style={{ padding: '50px', fontFamily: 'Arial' }}>
      <h2>Вход в Multi-DB Portal</h2>
      <form onSubmit={handleLogin}>
        <div><input placeholder="Логин" onChange={e => setUsername(e.target.value)} style={{margin: '10px 0', padding: '5px'}}/></div>
        <div><input type="password" placeholder="Пароль" onChange={e => setPassword(e.target.value)} style={{margin: '10px 0', padding: '5px'}}/></div>
        <button type="submit" style={{padding: '5px 15px'}}>Войти</button>
      </form>
    </div>
  );
}