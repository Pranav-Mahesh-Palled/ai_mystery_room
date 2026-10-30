import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const closeMenu = () => setMenuOpen(false);

  return (
    <header className="site-header">
      <div className="header-inner flex items-center justify-between">
        <Link className="brand" to="/" onClick={closeMenu} aria-label="AI Mystery Room home">
          <span className="brand-mark"><Icon name="target" size={21} /></span>
          <span className="brand-name">Mystery Room<span className="brand-dot">.</span></span>
        </Link>
        <button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="primary-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen((open) => !open)}>
          <Icon name="menu" size={21} />
        </button>
        <nav id="primary-navigation" className={`primary-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          <NavLink end to="/" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link is-active' : 'nav-link'}>The room</NavLink>
          <NavLink to="/create" onClick={closeMenu} className={({ isActive }) => isActive ? 'nav-link is-active' : 'nav-link'}>New investigation</NavLink>
          <Link className="nav-cta" to="/create" onClick={closeMenu}>Open a case <Icon name="arrow" size={16} /></Link>
        </nav>
      </div>
      <span className="header-rule" aria-hidden="true" key={location.pathname} />
    </header>
  );
}
