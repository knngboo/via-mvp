import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import FeedbackBubble from '../components/FeedbackBubble';
import AppSidebar from '../components/AppSidebar';
import { useAuth } from '../context/AuthContext';
import bfiIcon from '../assets/images/BFI_LogoIcon.svg';
import moreHorizIcon from '../assets/images/Icons=More_Horizontal.svg';
import '../App.css';

const _getStoredActive = () => {
  try {
    const data = JSON.parse(localStorage.getItem('buffi_active_conv')) || {};
    if (data.chatHistory) {
      data.chatHistory = data.chatHistory.filter(
        msg => !(msg.from === 'bot' && msg.text && (msg.text.startsWith('Sorry, there was an error') || msg.text.startsWith('Error:')))
      );
    }
    return data;
  } catch { return {}; }
};
const _getStoredSaved = () => {
  try { return JSON.parse(localStorage.getItem('buffi_saved_convs')) || []; } catch { return []; }
};

function ChatPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { token } = useAuth();
  const [mapTitle, setMapTitle] = useState(() => _getStoredActive().mapTitle || 'New conversation');
  const [lastQuery, setLastQuery] = useState(() => _getStoredActive().lastQuery || '');
  const [lastBotResponse, setLastBotResponse] = useState(() => _getStoredActive().lastBotResponse || '');
  const [chatHistory, setChatHistory] = useState(() => _getStoredActive().chatHistory || []);
  const [savedConversations, setSavedConversations] = useState(_getStoredSaved);
  const [activeConvId, setActiveConvId] = useState(() => _getStoredActive().id || Date.now());
  const [favorited, setFavorited] = useState(() => Boolean(_getStoredActive().favorited));
  const [chatDotsOpen, setChatDotsOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const chatDotsRef = useRef(null);
  const undoTimerRef = useRef(null);
  const prevTokenRef = useRef(token);

  const initialQuery = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('q') || '';
  }, []);

  useEffect(() => {
    if (location.state?.newConv) {
      handleNewConversation();
      navigate('/chat', { replace: true, state: {} });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.newConv]);

  useEffect(() => {
    const targetId = location.state?.switchConvId;
    if (!targetId) return;
    if (targetId === activeConvId) {
      navigate('/chat', { replace: true, state: {} });
      return;
    }
    const target = savedConversations.find(c => c.id === targetId);
    if (target) {
      handleSwitchConversation(target);
    }
    navigate('/chat', { replace: true, state: {} });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state?.switchConvId]);

  useEffect(() => {
    try { localStorage.setItem('buffi_saved_convs', JSON.stringify(savedConversations)); } catch {}
  }, [savedConversations]);

  useEffect(() => {
    try {
      localStorage.setItem('buffi_active_conv', JSON.stringify({
        id: activeConvId, chatHistory, mapTitle, lastQuery, lastBotResponse, favorited,
      }));
    } catch {}
  }, [activeConvId, chatHistory, mapTitle, lastQuery, lastBotResponse, favorited]);

  useEffect(() => {
    if (prevTokenRef.current !== token) {
      prevTokenRef.current = token;
      try {
        localStorage.removeItem('buffi_active_conv');
        localStorage.removeItem('buffi_saved_convs');
      } catch {}
      setChatHistory([]);
      setSavedConversations([]);
      setMapTitle('New conversation');
      setLastQuery('');
      setLastBotResponse('');
      setFavorited(false);
    }
  }, [token]);

  useEffect(() => {
    if (!chatDotsOpen) return;
    const handler = (e) => {
      if (chatDotsRef.current && !chatDotsRef.current.contains(e.target)) setChatDotsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [chatDotsOpen]);

  useEffect(() => {
    const handler = (e) => {
      const { action, id, payload } = (e && e.detail) || {};
      if (!action || id == null) return;
      const isActive = id === activeConvId;
      if (action === 'toggle-favorite') {
        if (isActive) {
          setFavorited(f => !f);
        } else {
          setSavedConversations(prev =>
            prev.map(c => c.id === id ? { ...c, favorited: !c.favorited } : c)
          );
        }
      } else if (action === 'rename') {
        const title = ((payload && payload.title) || '').trim();
        if (!title) return;
        if (isActive) {
          setMapTitle(title);
        } else {
          setSavedConversations(prev =>
            prev.map(c => c.id === id ? { ...c, mapTitle: title } : c)
          );
        }
      } else if (action === 'delete') {
        if (isActive) {
          setActiveConvId(Date.now());
          setChatHistory([]);
          setMapTitle('New conversation');
          setLastQuery('');
          setLastBotResponse('');
          setFavorited(false);
        } else {
          setSavedConversations(prev => prev.filter(c => c.id !== id));
        }
      }
    };
    window.addEventListener('buffi:conv-action', handler);
    return () => window.removeEventListener('buffi:conv-action', handler);
  }, [activeConvId]);

  const handleClearConversation = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setActiveConvId(Date.now());
    setChatHistory([]);
    setMapTitle('New conversation');
    setLastQuery('');
    setLastBotResponse('');
    setFavorited(false);
    setChatDotsOpen(false);
  };

  const handleToggleFavorite = () => {
    setFavorited(f => !f);
    setChatDotsOpen(false);
  };

  const handleExportConversation = () => {
    if (!chatHistory.length) return;
    const text = chatHistory
      .map(msg => msg.from === 'user' ? `You: ${msg.text}` : `Buffi: ${msg.text}`)
      .join('\n\n');
    try { navigator.clipboard.writeText(text); } catch {}
    setChatDotsOpen(false);
  };

  const handleStartRename = () => {
    setRenameValue(mapTitle);
    setIsRenaming(true);
    setChatDotsOpen(false);
  };

  const handleConfirmRename = () => {
    if (renameValue.trim()) setMapTitle(renameValue.trim());
    setIsRenaming(false);
  };

  const saveCurrentConv = () => {
    if (chatHistory.length === 0) return;
    const snapshot = { id: activeConvId, chatHistory, lastQuery, lastBotResponse, mapTitle, favorited };
    setSavedConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeConvId);
      if (idx >= 0) return prev.map((c, i) => i === idx ? snapshot : c);
      return [...prev, snapshot];
    });
  };

  const handleNewConversation = () => {
    saveCurrentConv();
    setActiveConvId(Date.now());
    setChatHistory([]);
    setLastQuery('');
    setLastBotResponse('');
    setMapTitle('New conversation');
    setFavorited(false);
  };

  const handleSwitchConversation = (conv) => {
    saveCurrentConv();
    setSavedConversations(prev => prev.filter(c => c.id !== conv.id));
    setActiveConvId(conv.id);
    setChatHistory(conv.chatHistory);
    setLastQuery(conv.lastQuery || '');
    setLastBotResponse(conv.lastBotResponse || '');
    setMapTitle(conv.mapTitle || 'New conversation');
    setFavorited(Boolean(conv.favorited));
  };

  return (
    <div className="app-wrapper">
      <AppSidebar />

      <div className="col-chat">
        <div className="col-header col-header--chat">
          <img src={bfiIcon} alt="Buffi" className="chat-header-logo" />
          <span className="top-bar-brand">
            {isRenaming ? (
              <input
                className="map-title-input"
                value={renameValue}
                autoFocus
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleConfirmRename}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleConfirmRename();
                  if (e.key === 'Escape') setIsRenaming(false);
                }}
              />
            ) : (
              mapTitle === 'New conversation' ? 'Buffi V.02' : mapTitle
            )}
          </span>
          <div className="chat-dots-wrapper" ref={chatDotsRef}>
            <button
              className="top-bar-icon-btn"
              title="More options"
              onClick={() => setChatDotsOpen(o => !o)}
            >
              <img src={moreHorizIcon} alt="More" className="top-bar-icon" />
            </button>
            {chatDotsOpen && (
              <div className="chat-dots-dropdown">
                <button
                  className="chat-dots-item"
                  onClick={handleToggleFavorite}
                  disabled={!chatHistory.length}
                >
                  {favorited ? 'Remove from favorites' : 'Add to favorites'}
                </button>
                <div className="chat-dots-divider" />
                <button
                  className="chat-dots-item"
                  onClick={handleClearConversation}
                  disabled={!chatHistory.length}
                >
                  Clear conversation
                </button>
                <button
                  className="chat-dots-item"
                  onClick={handleExportConversation}
                  disabled={!chatHistory.length}
                >
                  Export conversation
                </button>
                <div className="chat-dots-divider" />
                <button
                  className="chat-dots-item"
                  onClick={handleStartRename}
                  disabled={mapTitle === 'New conversation'}
                >
                  Rename
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="chat-panel">
          <FeedbackBubble
            key={activeConvId}
            chatHistory={chatHistory}
            setChatHistory={setChatHistory}
            setLastQuery={setLastQuery}
            setLastBotResponse={setLastBotResponse}
            initialQuery={chatHistory.length === 0 && savedConversations.length === 0 ? initialQuery : ''}
          />
        </div>
      </div>
    </div>
  );
}

export default ChatPage;
