import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Profile from './Profile';
import Dashboard from './Dashboard';
import ConstructorPage from './constructor/ConstructorPage';

// Токен читаем при каждом переходе, а не один раз при загрузке App,
// иначе после логина без перезагрузки страницы редирект вернёт на /login.
function PrivateRoute({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={<PrivateRoute><Profile /></PrivateRoute>} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/constructor" element={<PrivateRoute><ConstructorPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/constructor" />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;
