import { useState, useEffect } from 'react';
import { getActivePluginId, setActivePluginId, useTenantPlugins } from 'Plugins';

// E-2: Settings Modal — three sections:
//   1. Account   — username and role display
//   2. Active Agency — plugin switcher (filtered to this tenant's allowed plugins)
//   3. AI Model  — which GPT model Buffi uses
//
// Props: user, onClose, onLogout

const MODEL_KEY      = 'buffi_model';
const APIKEY_KEY     = 'buffi_openai_key';
const ALLOWED_MODELS = [
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (faster, cheaper)' },
    { id: 'gpt-4o',      label: 'GPT-4o (smarter, slower)'       },
];

export function getStoredModel() {
    try { return localStorage.getItem(MODEL_KEY) || 'gpt-4o-mini'; } catch { return 'gpt-4o-mini'; }
}

function setStoredModel(id) {
    try { localStorage.setItem(MODEL_KEY, id); } catch { }
    window.dispatchEvent(new CustomEvent('buffi:model-change', { detail: { id } }));
}

// User-supplied OpenAI API key. Stored locally in the browser and sent per-request
// as the X-OpenAI-Key header — it overrides the server's env key for that user.
export function getStoredApiKey() {
    try { return localStorage.getItem(APIKEY_KEY) || ''; } catch { return ''; }
}

function setStoredApiKey(key) {
    try {
        if (key) localStorage.setItem(APIKEY_KEY, key);
        else localStorage.removeItem(APIKEY_KEY);
    } catch { }
}

export default function SettingsModal({ user, onClose, onLogout }) {
    const { plugins: tenantPlugins } = useTenantPlugins();
    const [activePlugin, setActivePlugin] = useState(getActivePluginId);
    const [model, setModel]               = useState(getStoredModel);
    const [apiKey, setApiKey]             = useState(getStoredApiKey);
    const [keyStatus, setKeyStatus]       = useState('');

    // Keep in sync if another tab changes the plugin.
    useEffect(() => {
        const refresh = () => setActivePlugin(getActivePluginId());
        window.addEventListener('buffi:plugin-change', refresh);
        return () => window.removeEventListener('buffi:plugin-change', refresh);
    }, []);

    const handlePluginChange = (e) => {
        const id = e.target.value;
        setActivePlugin(id);
        setActivePluginId(id);
    };

    const handleModelChange = (e) => {
        const id = e.target.value;
        setModel(id);
        setStoredModel(id);
    };

    const handleSaveKey = () => {
        const trimmed = apiKey.trim();
        setApiKey(trimmed);
        setStoredApiKey(trimmed);
        setKeyStatus(trimmed ? 'Saved ✓' : 'Cleared');
        setTimeout(() => setKeyStatus(''), 1800);
    };

    const handleClearKey = () => {
        setApiKey('');
        setStoredApiKey('');
        setKeyStatus('Cleared');
        setTimeout(() => setKeyStatus(''), 1800);
    };

    const displayName = (user && (user.name || user.username)) || 'User';
    const initial     = (displayName.trim()[0] || '?').toUpperCase();

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.55)',
                zIndex: 1000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: '#1A1A1A',
                    color: '#F2F2F2',
                    borderRadius: '14px',
                    padding: '28px',
                    width: '340px',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '20px',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Settings</h2>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
                        title="Close"
                    >
                        ✕
                    </button>
                </div>

                {/* Section: Account */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <label style={labelStyle}>Account</label>
                    <div style={{ ...cardStyle, gap: '12px' }}>
                        <div style={avatarStyle}>{initial}</div>
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{displayName}</div>
                            <div style={{ fontSize: '12px', color: '#888', textTransform: 'capitalize' }}>
                                {user?.role || 'viewer'}
                            </div>
                        </div>
                    </div>
                </section>

                {/* Section: Active Agency */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label htmlFor="settings-plugin" style={labelStyle}>Active Agency</label>
                    <p style={helpStyle}>Switches the dashboard to that agency's data view.</p>
                    <select
                        id="settings-plugin"
                        style={selectStyle}
                        value={activePlugin}
                        onChange={handlePluginChange}
                    >
                        {tenantPlugins.length === 0 && (
                            <option value="">No plugins assigned</option>
                        )}
                        {tenantPlugins.map(({ id, name }) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </section>

                {/* Section: AI Model */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label htmlFor="settings-model" style={labelStyle}>AI Model</label>
                    <p style={helpStyle}>Which OpenAI model Buffi uses to answer questions.</p>
                    <select
                        id="settings-model"
                        style={selectStyle}
                        value={model}
                        onChange={handleModelChange}
                    >
                        {ALLOWED_MODELS.map(({ id, label }) => (
                            <option key={id} value={id}>{label}</option>
                        ))}
                    </select>
                </section>

                {/* Section: OpenAI API Key */}
                <section style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label htmlFor="settings-apikey" style={labelStyle}>OpenAI API Key</label>
                    <p style={helpStyle}>
                        Use your own OpenAI key for Buffi. Stored only in this browser and sent
                        securely with each chat request. Leave blank to use the server default.
                    </p>
                    <input
                        id="settings-apikey"
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="sk-..."
                        style={selectStyle}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={handleSaveKey} style={primaryBtnStyle}>Save</button>
                        <button onClick={handleClearKey} style={ghostBtnStyle}>Clear</button>
                        {keyStatus && (
                            <span style={{ fontSize: '12px', color: '#7ED957' }}>{keyStatus}</span>
                        )}
                    </div>
                </section>

                {/* Sign out */}
                <button
                    onClick={() => { onLogout(); onClose(); }}
                    style={{
                        marginTop: '4px',
                        padding: '10px',
                        borderRadius: '8px',
                        border: 'none',
                        background: '#2C2C2C',
                        color: '#F2F2F2',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: '14px',
                    }}
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}

// ── Shared style tokens ───────────────────────────────────────────────────────
const labelStyle = {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    color: '#888',
};

const helpStyle = {
    margin: 0,
    fontSize: '12px',
    color: '#666',
    lineHeight: 1.5,
};

const cardStyle = {
    background: '#2C2C2C',
    borderRadius: '8px',
    padding: '12px 14px',
    display: 'flex',
    alignItems: 'center',
};

const avatarStyle = {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    background: '#CB2128',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '16px',
    flexShrink: 0,
};

const selectStyle = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: '#2C2C2C',
    color: '#F2F2F2',
    fontSize: '14px',
    cursor: 'pointer',
    outline: 'none',
};

const primaryBtnStyle = {
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: '#CB2128',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13px',
};

const ghostBtnStyle = {
    padding: '8px 14px',
    borderRadius: '8px',
    border: '1px solid #333',
    background: 'transparent',
    color: '#CCC',
    cursor: 'pointer',
    fontWeight: 500,
    fontSize: '13px',
};
