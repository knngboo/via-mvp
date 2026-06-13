import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getActivePlugin } from 'Plugins';
import SettingsModal from './SettingsModal';
import bfiIconDark from '../assets/images/BFI_LogoIcon_Dark.svg';
import sidebarCloseIcon from '../assets/images/Sidebar_close.svg';
import iconChat from '../assets/images/Icons=Chat.svg';
import iconSearch from '../assets/images/Icons=Search.svg';
import iconSources from '../assets/images/Icons=Sources.svg';
import iconBookmark from '../assets/images/Icons=Bookmark.svg';

const AVATAR_PALETTE = [
  '#FF5C17', '#00B89C', '#8C94CE', '#E2B53A', '#5A8DEE', '#E26B8C', '#6BBE6B',
];
const colorForName = (name) => {
  const s = (name || '?').trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
};

const getSavedConvs = () => {
  try { return JSON.parse(localStorage.getItem('buffi_saved_convs')) || []; } catch { return []; }
};
const getActiveConv = () => {
  try { return JSON.parse(localStorage.getItem('buffi_active_conv')) || null; } catch { return null; }
};

const convDisplayTitle = (conv) => {
  if (!conv) return 'New conversation';
  if (conv.mapTitle && conv.mapTitle !== 'New conversation') return conv.mapTitle;
  if (conv.lastQuery) {
    const q = conv.lastQuery.trim();
    return q.length > 40 ? q.slice(0, 40) + '…' : q;
  }
  const firstUser = Array.isArray(conv.chatHistory)
    ? conv.chatHistory.find(m => m.from === 'user' && m.text)
    : null;
  if (firstUser && firstUser.text) {
    const q = firstUser.text.trim();
    return q.length > 40 ? q.slice(0, 40) + '…' : q;
  }
  return 'New conversation';
};

const dispatchConvAction = (action, id, payload) => {
  window.dispatchEvent(new CustomEvent('buffi:conv-action', {
    detail: { action, id, payload },
  }));
};

export default function AppSidebar() {
  const [expanded, setExpanded] = useState(
    () => localStorage.getItem('buffi_sidebar_expanded') === 'true'
  );
  const [savedConvs, setSavedConvs] = useState(getSavedConvs);
  const [activeConv, setActiveConv] = useState(getActiveConv);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePlugin, setActivePlugin] = useState(getActivePlugin);
  const menuRef = useRef(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, logout } = useAuth();
  const displayName = (user && (user.name || user.username)) || 'User';
  const initial = (displayName.trim()[0] || '?').toUpperCase();
  const avatarColor = colorForName(displayName);

  // Keep history in sync with localStorage updates from the chat page.
  useEffect(() => {
    const refresh = () => {
      setSavedConvs(getSavedConvs());
      setActiveConv(getActiveConv());
    };
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    const interval = setInterval(refresh, 1500);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
      clearInterval(interval);
    };
  }, []);

  // Keep the active-plugin nav item in sync when it changes in Settings.
  useEffect(() => {
    const refresh = () => setActivePlugin(getActivePlugin());
    window.addEventListener('buffi:plugin-change', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('buffi:plugin-change', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  // Close any open item menu on outside click or Escape
  useEffect(() => {
    if (!openMenuId) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null);
      }
    };
    const keyHandler = (e) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [openMenuId]);

  const expand = () => {
    setExpanded(true);
    localStorage.setItem('buffi_sidebar_expanded', 'true');
  };
  const collapse = () => {
    setExpanded(false);
    localStorage.setItem('buffi_sidebar_expanded', 'false');
    setSearchOpen(false);
    setFavoritesOnly(false);
    setOpenMenuId(null);
    setRenamingId(null);
  };

  const isChat = pathname === '/chat';
  const isSources = pathname === '/sources';
  const isDashboard = pathname === '/dashboard';

  const activeId = activeConv && activeConv.id;
  const hasActive = activeConv && Array.isArray(activeConv.chatHistory) && activeConv.chatHistory.length > 0;
  const baseHistory = [
    ...(hasActive ? [activeConv] : []),
    ...[...savedConvs].reverse().filter(c => !activeId || c.id !== activeId),
  ];

  const q = searchQuery.trim().toLowerCase();
  const history = baseHistory.filter(c => {
    if (favoritesOnly && !c.favorited) return false;
    if (q && !convDisplayTitle(c).toLowerCase().includes(q)) return false;
    return true;
  });

  const handleHistoryClick = (conv) => {
    if (renamingId === conv.id) return;
    if (activeId && conv.id === activeId && isChat) return;
    navigate('/chat', { state: { switchConvId: conv.id } });
  };

  const openItemMenu = (e, conv) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === conv.id ? null : conv.id);
  };

  const handleToggleFavorite = (conv) => {
    dispatchConvAction('toggle-favorite', conv.id);
    // Optimistic local refresh so the icon updates immediately
    setSavedConvs(prev => prev.map(c => c.id === conv.id ? { ...c, favorited: !c.favorited } : c));
    setActiveConv(prev => prev && prev.id === conv.id ? { ...prev, favorited: !prev.favorited } : prev);
    setOpenMenuId(null);
  };

  const handleDelete = (conv) => {
    dispatchConvAction('delete', conv.id);
    setSavedConvs(prev => prev.filter(c => c.id !== conv.id));
    if (activeConv && activeConv.id === conv.id) setActiveConv(null);
    setOpenMenuId(null);
  };

  const startRename = (conv) => {
    setRenameDraft(convDisplayTitle(conv));
    setRenamingId(conv.id);
    setOpenMenuId(null);
  };

  const commitRename = (conv) => {
    const title = renameDraft.trim();
    if (title) {
      dispatchConvAction('rename', conv.id, { title });
      setSavedConvs(prev => prev.map(c => c.id === conv.id ? { ...c, mapTitle: title } : c));
      setActiveConv(prev => prev && prev.id === conv.id ? { ...prev, mapTitle: title } : prev);
    }
    setRenamingId(null);
  };

  const handleSearchClick = () => {
    if (!expanded) expand();
    setFavoritesOnly(false);
    setSearchOpen(o => {
      const next = !o;
      if (!next) setSearchQuery('');
      return next;
    });
  };

  const handleFavoritesClick = () => {
    if (!expanded) expand();
    setSearchOpen(false);
    setSearchQuery('');
    setFavoritesOnly(f => !f);
  };

  return (
    <div className={`col-sidebar${expanded ? ' col-sidebar--expanded' : ''}`}>
      <div className="col-header col-header--sidebar">
        <span className="top-bar-logo-btn" aria-hidden="true">
          <img src={bfiIconDark} alt="Buffi" className="top-bar-logo" />
        </span>
      </div>
      <div className={`left-icon-strip${expanded ? ' left-icon-strip--expanded' : ''}`}>
        <button
          className="icon-strip-btn"
          title={expanded ? 'Close sidebar' : 'Open sidebar'}
          onClick={expanded ? collapse : expand}
        >
          <img src={sidebarCloseIcon} alt="" className="strip-icon" />
          {expanded && <span className="strip-label">Close sidebar</span>}
        </button>
        <button
          className={`icon-strip-btn${searchOpen ? ' icon-strip-btn--active' : ''}`}
          title="Search"
          onClick={handleSearchClick}
        >
          <img src={iconSearch} alt="" className="strip-icon" />
          {expanded && <span className="strip-label">Search</span>}
        </button>
        <button
          className={`icon-strip-btn${isChat ? ' icon-strip-btn--active' : ''}`}
          title="New Chat"
          onClick={() => {
            localStorage.removeItem('buffi_active_conv');
            navigate('/chat', { state: { newConv: Date.now() } });
          }}
        >
          <img src={iconChat} alt="" className="strip-icon" />
          {expanded && <span className="strip-label">New Chat</span>}
        </button>
        {user?.role === 'admin' && (
          <button
            className={`icon-strip-btn${isSources ? ' icon-strip-btn--active' : ''}`}
            title="Sources"
            onClick={() => navigate('/sources')}
          >
            <img src={iconSources} alt="" className="strip-icon" />
            {expanded && <span className="strip-label">Sources</span>}
          </button>
        )}
        <button
          className={`icon-strip-btn${isDashboard ? ' icon-strip-btn--active' : ''}`}
          title="Dashboard"
          onClick={() => navigate('/dashboard')}
        >
          <img src={iconBookmark} alt="" className="strip-icon" />
          {expanded && <span className="strip-label">Dashboard</span>}
        </button>

        <button
          className={`icon-strip-btn${favoritesOnly ? ' icon-strip-btn--active' : ''}`}
          title="Favorites"
          onClick={handleFavoritesClick}
        >
          <img src={iconBookmark} alt="" className="strip-icon" />
          {expanded && <span className="strip-label">Favorites</span>}
        </button>

        {expanded && searchOpen && (
          <div className="sidebar-search">
            <input
              type="text"
              className="sidebar-search-input"
              placeholder="Search chats…"
              value={searchQuery}
              autoFocus
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        )}

        {expanded && (
          <div className="sidebar-history">
            <div className="sidebar-history-label">
              {favoritesOnly ? 'Favorites' : 'Chat History'}
            </div>
            {history.length === 0 && (
              <div className="sidebar-history-empty">
                {favoritesOnly
                  ? 'No favorites yet'
                  : q
                    ? 'No matches'
                    : 'No conversations yet'}
              </div>
            )}
            {history.map(conv => {
              const isActiveItem = activeId && conv.id === activeId && isChat;
              const title = convDisplayTitle(conv);
              return (
                <div
                  key={conv.id}
                  className={`sidebar-history-item${isActiveItem ? ' sidebar-history-item--active' : ''}`}
                >
                  {renamingId === conv.id ? (
                    <input
                      className="sidebar-history-rename"
                      value={renameDraft}
                      autoFocus
                      onChange={e => setRenameDraft(e.target.value)}
                      onBlur={() => commitRename(conv)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') commitRename(conv);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  ) : (
                    <button
                      type="button"
                      className="sidebar-history-title"
                      title={title}
                      onClick={() => handleHistoryClick(conv)}
                    >
                      {conv.favorited && (
                        <img
                          src={iconBookmark}
                          alt=""
                          className="sidebar-history-fav-mark"
                        />
                      )}
                      <span className="sidebar-history-title-text">{title}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="sidebar-history-dots"
                    title="More options"
                    onClick={e => openItemMenu(e, conv)}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="5" cy="12" r="1" fill="currentColor" />
                      <circle cx="12" cy="12" r="1" fill="currentColor" />
                      <circle cx="19" cy="12" r="1" fill="currentColor" />
                    </svg>
                  </button>
                  {openMenuId === conv.id && (
                    <div className="sidebar-item-menu" ref={menuRef}>
                      <button
                        className="sidebar-item-menu-btn"
                        onClick={() => handleToggleFavorite(conv)}
                      >
                        {conv.favorited ? 'Remove from favorites' : 'Add to favorites'}
                      </button>
                      <button
                        className="sidebar-item-menu-btn"
                        onClick={() => startRename(conv)}
                      >
                        Rename
                      </button>
                      <div className="sidebar-item-menu-divider" />
                      <button
                        className="sidebar-item-menu-btn sidebar-item-menu-btn--danger"
                        onClick={() => handleDelete(conv)}
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className={`sidebar-user-bar${expanded ? ' sidebar-user-bar--expanded' : ''}`}>
          <button
            type="button"
            className="sidebar-user-avatar"
            style={{ backgroundColor: avatarColor }}
            title={displayName}
            onClick={() => setSettingsOpen(true)}
          >
            {initial}
          </button>
          {expanded && (
            <>
              <span className="sidebar-user-name" title={displayName}>{displayName}</span>
              <button
                type="button"
                className="sidebar-user-settings"
                title="Settings"
                onClick={() => setSettingsOpen(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06A2 2 0 1 1 4.17 16.93l.06-.06A1.7 1.7 0 0 0 4.57 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 8.89a1.7 1.7 0 0 0-.34-1.87l-.06-.06A2 2 0 1 1 7.07 4.13l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
                </svg>
              </button>
              <button
                type="button"
                className="sidebar-user-settings"
                style={{ marginLeft: '4px' }}
                title="Sign Out"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
