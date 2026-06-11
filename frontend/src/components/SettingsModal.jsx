import { useState } from 'react';
import { OPENAI_MODELS, getStoredModel, setStoredModel } from '../services/openai';
import { PLUGINS, getActivePluginId, setActivePluginId } from 'Plugins';

const STORAGE_KEY = 'buffi_api_key';

const readApiKey = () => {
  try { return localStorage.getItem(STORAGE_KEY) || ''; } catch { return ''; }
};

const maskKey = (key) => {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
};

export default function SettingsModal({ onClose }) {
  const [savedKey, setSavedKey] = useState(readApiKey);
  const [draft, setDraft] = useState('');
  const [reveal, setReveal] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [model, setModel] = useState(getStoredModel);
  const [activePlugin, setActivePlugin] = useState(getActivePluginId);

  const handleModelChange = (e) => {
    const value = e.target.value;
    setModel(value);
    setStoredModel(value);
  };

  const handlePluginChange = (e) => {
    const value = e.target.value;
    setActivePlugin(value);
    setActivePluginId(value);
  };

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
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-body">
          <div className="settings-section">
            <label className="settings-label">OpenAI API Key</label>
            <p className="settings-help">
              Used for chat requests sent directly from this browser to OpenAI. Stored locally only.
            </p>

            {savedKey ? (
              <div className="settings-current">
                <span className="settings-current-label">Current:</span>
                <code className="settings-current-value">
                  {reveal ? savedKey : maskKey(savedKey)}
                </code>
                <button
                  type="button"
                  className="settings-link-btn"
                  onClick={() => setReveal(r => !r)}
                >
                  {reveal ? 'Hide' : 'Show'}
                </button>
                <button
                  type="button"
                  className="settings-link-btn settings-link-btn--danger"
                  onClick={handleClear}
                >
                  Clear
                </button>
              </div>
            ) : (
              <div className="settings-current settings-current--empty">No API key set</div>
            )}

            <div className="settings-input-row">
              <input
                type="password"
                className="settings-input"
                placeholder={savedKey ? 'Replace with a new key…' : 'sk-…'}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
                autoFocus
              />
              <button
                type="button"
                className="settings-save-btn"
                onClick={handleSave}
                disabled={!draft.trim()}
              >
                {savedFlash ? 'Saved ✓' : 'Save'}
              </button>
            </div>
          </div>

          <div className="settings-section">
            <label className="settings-label" htmlFor="settings-model">Model</label>
            <p className="settings-help">
              The OpenAI model used to answer chat questions.
            </p>
            <select
              id="settings-model"
              className="settings-select"
              value={model}
              onChange={handleModelChange}
            >
              {OPENAI_MODELS.map(({ id, label }) => (
                <option key={id} value={id}>{label}</option>
              ))}
            </select>
          </div>

          <div className="settings-section">
            <label className="settings-label" htmlFor="settings-plugin">Active plugin</label>
            <p className="settings-help">
              Select an applicable plugin. When active, its dashboard appears in the sidebar.
            </p>
            <select
              id="settings-plugin"
              className="settings-select"
              value={activePlugin}
              onChange={handlePluginChange}
            >
              <option value="">None</option>
              {PLUGINS.map(({ id, name }) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
