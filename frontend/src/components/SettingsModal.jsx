import { useState } from 'react';

const STORAGE_KEY = 'buffi_api_key';

export const getStoredApiKey = () => {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
};

const maskKey = (key) => {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
};

export default function SettingsModal({ onClose }) {
  const [savedKey, setSavedKey] = useState(getStoredApiKey);
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = () => {
    const value = draft.trim();
    if (!value) return;
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
    setSavedKey(value);
    setDraft('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleClear = () => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setSavedKey('');
    setDraft('');
  };

  return (
    <div className="settings-overlay" onClick={onClose} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="settings-modal" onClick={e => e.stopPropagation()} style={{
        backgroundColor: '#1E1E1E', color: 'white', padding: '24px', borderRadius: '12px',
        width: '400px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Settings</h2>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#999', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        
        <div style={{ marginBottom: '24px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>OpenAI API Key</label>
          <p style={{ fontSize: '0.85rem', color: '#aaa', marginBottom: '12px' }}>
            Optional. Overrides the backend default key. Stored locally only.
          </p>

          {savedKey ? (
            <div style={{ backgroundColor: '#2C2C2C', padding: '12px', borderRadius: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <code style={{ flex: 1, fontFamily: 'monospace' }}>{reveal ? savedKey : maskKey(savedKey)}</code>
              <button onClick={() => setReveal(!reveal)} style={{ background: '#444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                {reveal ? 'Hide' : 'Show'}
              </button>
              <button onClick={handleClear} style={{ background: '#E53935', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}>
                Clear
              </button>
            </div>
          ) : (
            <div style={{ color: '#888', marginBottom: '12px', fontStyle: 'italic' }}>No API key set</div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              type="password"
              placeholder={savedKey ? 'Replace with a new key…' : 'sk-…'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
              style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #444', backgroundColor: '#111', color: 'white' }}
              autoFocus
            />
            <button
              onClick={handleSave}
              disabled={!draft.trim()}
              style={{ padding: '8px 16px', borderRadius: '4px', border: 'none', backgroundColor: '#007BFF', color: 'white', cursor: draft.trim() ? 'pointer' : 'not-allowed', opacity: draft.trim() ? 1 : 0.5 }}
            >
              {savedFlash ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
