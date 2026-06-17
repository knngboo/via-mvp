/**
 * PluginContext — provides the active plugin to the entire React tree.
 *
 * In development / prototype mode, the active plugin is persisted in
 * localStorage via the existing setActivePluginId / getActivePluginId helpers.
 *
 * The production path (per-org, backend-enforced) is handled by
 * fetchTenantPlugins() — already wired in Plugins/index.js — and will be
 * activated once the tenant_plugins DB table is in use.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  PLUGINS,
  getActivePlugin,
  setActivePluginId,
} from '../Plugins/index.js';

// ── Context ───────────────────────────────────────────────────────────────────
const PluginContext = createContext(null);

// ── Provider ─────────────────────────────────────────────────────────────────
export function PluginProvider({ children }) {
  const [activePlugin, setActivePluginState] = useState(() => getActivePlugin() ?? PLUGINS[0] ?? null);

  // Listen for plugin changes dispatched by setActivePluginId elsewhere
  useEffect(() => {
    const handler = (e) => {
      const plugin = PLUGINS.find(p => p.id === e.detail.id) ?? PLUGINS[0] ?? null;
      setActivePluginState(plugin);
    };
    window.addEventListener('buffi:plugin-change', handler);
    return () => window.removeEventListener('buffi:plugin-change', handler);
  }, []);

  // Stable setter that persists to localStorage and fires the event
  const setActivePlugin = useCallback((pluginOrId) => {
    const id = typeof pluginOrId === 'string' ? pluginOrId : pluginOrId?.id;
    setActivePluginId(id);                           // persists + fires 'buffi:plugin-change'
    const plugin = PLUGINS.find(p => p.id === id) ?? PLUGINS[0] ?? null;
    setActivePluginState(plugin);
  }, []);

  const value = {
    activePlugin,
    setActivePlugin,
    allPlugins: PLUGINS,
  };

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────
export function usePlugin() {
  const ctx = useContext(PluginContext);
  if (!ctx) throw new Error('usePlugin must be used inside <PluginProvider>');
  return ctx;
}

export default PluginContext;
