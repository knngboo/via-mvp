// Plugin registry for the Buffi interface (Vite Version).
//
// Plugins are AUTO-DISCOVERED using Vite's import.meta.glob. 
// To add a client, drop a folder in here with an `index.js` that default-exports a manifest.

const modules = import.meta.glob('./*/index.js', { eager: true });

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
