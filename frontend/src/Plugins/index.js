import { useState, useEffect } from 'react';

// Plugin registry for the Buffi interface (Vite Version).
//
// Plugins are AUTO-DISCOVERED using Vite's import.meta.glob. 
// To add a client, drop a folder in here with an `index.js` that
// default-exports a manifest: { id, name, description, Dashboard, parse, order? }
//
// The backend controls which plugins each tenant can access via the
// tenant_plugins table. Call fetchTenantPlugins() (or use useTenantPlugins())
// to get the filtered list for the current user.

const modules = import.meta.glob('./*/index.js', { eager: true });

// All locally-defined plugins, sorted by order then name.
export const PLUGINS = Object.keys(modules)
    .map((path) => modules[path].default)
    .filter((m) => m && m.id && m.name)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));

const ACTIVE_PLUGIN_KEY = 'buffi_active_plugin';

export function getPlugins() {
    return PLUGINS;
}

export function getPluginById(id) {
    return PLUGINS.find((p) => p.id === id) || null;
}

export function getActivePluginId() {
    try { 
        const stored = localStorage.getItem(ACTIVE_PLUGIN_KEY);
        if (stored) return stored;
        if (PLUGINS.length > 0) return PLUGINS[0].id;
        return '';
    } catch { return ''; }
}

export function getActivePlugin() {
    return getPluginById(getActivePluginId());
}

export function setActivePluginId(id) {
    try {
        if (id) localStorage.setItem(ACTIVE_PLUGIN_KEY, id);
        else localStorage.removeItem(ACTIVE_PLUGIN_KEY);
    } catch { }
    window.dispatchEvent(new CustomEvent('buffi:plugin-change', { detail: { id: id || '' } }));
}

// E-3: Fetch which plugin IDs this tenant has access to from the backend.
// Returns the filtered PLUGINS array. Falls back to all PLUGINS if the
// request fails (e.g., network error or not yet logged in).
export async function fetchTenantPlugins() {
    try {
        const res = await fetch('/api/plugins', { credentials: 'include' });
        if (!res.ok) return PLUGINS;
        const { plugins: allowed } = await res.json();
        const allowedSet = new Set(allowed);
        return PLUGINS.filter((p) => allowedSet.has(p.id));
    } catch {
        return PLUGINS;
    }
}

// React hook: resolves tenant plugins asynchronously.
// Returns { plugins, loading } — components can show a spinner while loading.
export function useTenantPlugins() {
    const [plugins, setPlugins] = useState(PLUGINS);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchTenantPlugins()
            .then(setPlugins)
            .finally(() => setLoading(false));
    }, []);

    return { plugins, loading };
}
