/**
 * GlobalNav — horizontal top bar present on every page.
 *
 * Left: Logo + unified nav tabs (Workspace · Upload · Admin)
 * Right: Settings · Sign-out · Avatar/profile popover
 */

import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import SettingsModal from './SettingsModal';
import AgencySwitcher from './AgencySwitcher';
import bfiIconDark from '../assets/images/BFI_LogoIcon_Dark.svg';

// ── Avatar colour ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#FF5C17', '#00B89C', '#8C94CE', '#E2B53A',
  '#5A8DEE', '#E26B8C', '#6BBE6B',
];
const colorForName = (name) => {
  const s = (name || '?').trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function GlobalNav() {
  const navigate          = useNavigate();
  const location          = useLocation();
  const { user, logout }  = useAuth();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profileOpen,  setProfileOpen]  = useState(false);
  const profileRef = useRef(null);

  const displayName  = (user && (user.name || user.username)) || 'User';
  const initial      = (displayName.trim()[0] || '?').toUpperCase();
  const avatarColor  = colorForName(displayName);

  const isEditor    = ['admin', 'editor'].includes(user?.role);
  const isAdminRole = user?.role === 'admin';

  // Active-path helpers
  const at = (path) => location.pathname === path || location.pathname.startsWith(path + '/');

  // Close profile popover on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  return (
    <>
      <header className="global-nav" role="banner">

        {/* ── Brand logo ── */}
        <div className="gnav-brand">
          <img src={bfiIconDark} alt="BFI" className="gnav-logo" />
        </div>

        {/* ── Agency switcher ── */}
        <AgencySwitcher />

        {/* ── Unified nav tabs ── */}
        <nav className="gnav-nav" aria-label="Main navigation">
          <button
            className={`gnav-nav-btn${at('/workspace') ? ' gnav-nav-btn--active' : ''}`}
            onClick={() => navigate('/workspace')}
            title="Workspace"
          >
            Workspace
          </button>

          {isEditor && (
            <button
              className={`gnav-nav-btn${at('/sources') ? ' gnav-nav-btn--active' : ''}`}
              onClick={() => navigate('/sources')}
              title="Upload and manage data sources"
            >
              Upload
            </button>
          )}

          {isAdminRole && (
            <button
              className={`gnav-nav-btn${at('/admin') ? ' gnav-nav-btn--active' : ''}`}
              onClick={() => navigate('/admin')}
              title="Admin panel"
            >
              Admin
            </button>
          )}
        </nav>

        {/* ── Centre spacer ── */}
        <div style={{ flex: 1 }} />

        {/* ── Right controls ── */}
        <div className="gnav-actions">

          {/* Settings */}
          <button
            className="gnav-icon-btn"
            title="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              className="gnav-icon" aria-hidden="true">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>

          {/* Sign out */}
          <button
            className="gnav-icon-btn"
            title="Sign out"
            onClick={logout}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
              className="gnav-icon" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>

          {/* User avatar → profile popover */}
          <div className="gnav-profile-wrap" ref={profileRef}>
            <button
              className="gnav-avatar"
              style={{ background: avatarColor }}
              title={`${displayName} — view profile`}
              onClick={() => setProfileOpen(o => !o)}
              aria-expanded={profileOpen}
              aria-haspopup="true"
            >
              {initial}
            </button>

            {profileOpen && (
              <div className="gnav-profile-pop" role="menu">
                <div className="gnav-profile-user">
                  <div
                    className="gnav-profile-avatar"
                    style={{ background: avatarColor }}
                    aria-hidden="true"
                  >
                    {initial}
                  </div>
                  <div className="gnav-profile-info">
                    <span className="gnav-profile-name">{displayName}</span>
                    <span className="gnav-profile-role">{user?.role || 'viewer'}</span>
                  </div>
                </div>

                <div className="gnav-profile-sep" />

                <button
                  className="gnav-profile-item"
                  role="menuitem"
                  onClick={() => { setSettingsOpen(true); setProfileOpen(false); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                    width="15" height="15" aria-hidden="true">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                  </svg>
                  Settings
                </button>

                <div className="gnav-profile-sep" />

                <button
                  className="gnav-profile-item gnav-profile-item--danger"
                  role="menuitem"
                  onClick={() => { setProfileOpen(false); logout(); }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
                    width="15" height="15" aria-hidden="true">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                  </svg>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {settingsOpen && (
        <SettingsModal
          user={user}
          onClose={() => setSettingsOpen(false)}
          onLogout={() => { setSettingsOpen(false); logout(); }}
        />
      )}
    </>
  );
}
