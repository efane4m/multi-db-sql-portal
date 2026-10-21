import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './Login';
import Profile from './Profile';
import Dashboard from './Dashboard';

function App() {
  const token = localStorage.getItem('token');
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/profile" element={token ? <Profile /> : <Navigate to="/login" />} />
        <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;