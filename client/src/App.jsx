import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Profile from './Profile';
import Dashboard from './Dashboard';
import ConstructorPage from './constructor/ConstructorPage';
import AdminPage from './admin/AdminPage';
import { isLocalAdmin } from './auth/session';

// Токен читаем при каждом переходе, а не один раз при загрузке App,
// иначе после логина без перезагрузки страницы редирект вернёт на /login.
function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

// Админка работает на локальных учётных записях и доступна только их администратору
function AdminRoute({ children }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" />;
  return isLocalAdmin() ? children : <Navigate to="/constructor" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/constructor" element={<PrivateRoute><ConstructorPage /></PrivateRoute>} />
        <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
        <Route path="*" element={<Navigate to="/constructor" />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;
