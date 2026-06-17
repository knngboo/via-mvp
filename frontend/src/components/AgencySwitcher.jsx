/**
 * AgencySwitcher — compact agency/plugin selector in the GlobalNav.
 *
 * Renders as a branded pill [ 🚌 VIA ▾ ] showing the active agency.
 * On click, opens a dropdown listing all available agencies with brand
 * color accents. Switching updates localStorage and fires buffi:plugin-change.
 */

import React, { useState, useRef, useEffect } from 'react';
import { usePlugin } from '../context/PluginContext';

export default function AgencySwitcher() {
  const { activePlugin, setActivePlugin, allPlugins } = usePlugin();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!activePlugin) return null;

  const activePlugins  = allPlugins.filter(p => !p.status);
  const previewPlugins = allPlugins.filter(p => p.status === 'preview');

  return (
    <div className="agency-switcher" ref={wrapRef}>
      {/* ── Trigger pill ── */}
      <button
        className="agency-pill"
        style={{ '--agency-color': activePlugin.color }}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={`Active agency: ${activePlugin.name}`}
      >
        <span className="agency-pill-icon">{activePlugin.icon}</span>
        <span className="agency-pill-name">{activePlugin.shortName}</span>
        <svg className="agency-pill-caret" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          width="10" height="10" aria-hidden="true">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* ── Dropdown ── */}
      {open && (
        <div className="agency-dropdown" role="listbox" aria-label="Select agency">

          {/* Active agencies */}
          {activePlugins.length > 0 && (
            <div className="agency-dropdown-section">
              <span className="agency-dropdown-label">Agencies</span>
              {activePlugins.map(plugin => (
                <button
                  key={plugin.id}
                  className={`agency-dropdown-item${plugin.id === activePlugin.id ? ' agency-dropdown-item--active' : ''}`}
                  style={{ '--agency-color': plugin.color }}
                  role="option"
                  aria-selected={plugin.id === activePlugin.id}
                  onClick={() => { setActivePlugin(plugin.id); setOpen(false); }}
                >
                  <span className="agency-item-dot" />
                  <span className="agency-item-icon">{plugin.icon}</span>
                  <div className="agency-item-text">
                    <span className="agency-item-name">{plugin.name}</span>
                    <span className="agency-item-desc">{plugin.description}</span>
                  </div>
                  {plugin.id === activePlugin.id && (
                    <svg className="agency-item-check" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      width="13" height="13">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Preview agencies */}
          {previewPlugins.length > 0 && (
            <>
              <div className="agency-dropdown-sep" />
              <div className="agency-dropdown-section">
                <span className="agency-dropdown-label">Preview</span>
                {previewPlugins.map(plugin => (
                  <button
                    key={plugin.id}
                    className="agency-dropdown-item agency-dropdown-item--preview"
                    style={{ '--agency-color': plugin.color }}
                    role="option"
                    aria-selected={plugin.id === activePlugin.id}
                    onClick={() => { setActivePlugin(plugin.id); setOpen(false); }}
                  >
                    <span className="agency-item-dot" />
                    <span className="agency-item-icon">{plugin.icon}</span>
                    <div className="agency-item-text">
                      <span className="agency-item-name">
                        {plugin.name}
                        <span className="agency-preview-tag">preview</span>
                      </span>
                      <span className="agency-item-desc">{plugin.description}</span>
                    </div>
                    {plugin.id === activePlugin.id && (
                      <svg className="agency-item-check" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                        width="13" height="13">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Default/General at the bottom */}
          {allPlugins.some(p => p.id === 'default') && activePlugin.id !== 'default' && (
            <>
              <div className="agency-dropdown-sep" />
              <button
                className="agency-dropdown-item agency-dropdown-item--muted"
                onClick={() => { setActivePlugin('default'); setOpen(false); }}
                role="option"
                aria-selected={false}
              >
                <span className="agency-item-icon" style={{ opacity: 0.5 }}>○</span>
                <div className="agency-item-text">
                  <span className="agency-item-name" style={{ opacity: 0.6 }}>General Workspace</span>
                  <span className="agency-item-desc">No agency — upload your own data</span>
                </div>
              </button>
            </>
          )}

        </div>
      )}
    </div>
  );
}
