import { Link, NavLink } from 'react-router-dom';
import BracketMark from './BracketMark';
import './AppHeader.css';

export default function AppHeader() {
  return (
    <header className="app-header">
      <Link to="/constructor" className="app-brand">
        <BracketMark />
        Multi-DB Portal
      </Link>
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
