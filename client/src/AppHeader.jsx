import { Link, NavLink } from 'react-router-dom';
import BracketMark from './BracketMark';
import { isLocalAdmin } from './auth/session';
import './AppHeader.css';

const navClass = ({ isActive }) => `app-link${isActive ? ' is-active' : ''}`;

export default function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-left">
        <Link to="/constructor" className="app-brand">
          <BracketMark />
          <span className="app-brand-name">Multi-DB Portal</span>
        </Link>
        <nav className="app-nav" aria-label="Разделы">
          <NavLink to="/constructor" className={navClass}>Конструктор</NavLink>
          <NavLink to="/dashboard" className={navClass}>Ручной SQL</NavLink>
          {isLocalAdmin() && <NavLink to="/admin" className={navClass}>Админка</NavLink>}
        </nav>
      </div>
      <NavLink
        to="/profile"
        title="Профиль"
        aria-label="Профиль"
        className={({ isActive }) => `app-profile${isActive ? ' is-active' : ''}`}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
        </svg>
      </NavLink>
    </header>
  );
}
