// Plugin registry for the Buffi interface.
//
// Plugins are AUTO-DISCOVERED. To add a client, drop a folder in here with an
// `index.js` that default-exports a manifest — nothing else in the app needs to
// change. Everything a plugin owns (dashboard UI + parse logic) lives entirely
// inside its own folder.
//
//   Plugins/
//     <Client>/
//       index.js            ← manifest: { id, name, Dashboard, parse, order? }
//       ParseLogic/         ← parse(files) → visualization-ready data
//       Dashboard/          ← the dashboard component
//
// A manifest looks like:
//   { id: 'via', name: 'Via', Dashboard, parse, order: 10 }

// Match only top-level `<Folder>/index.js` files (the manifests) — this skips
// this file, ParseLogic/index.js, and any Dashboard files.
// eslint-disable-next-line no-undef
const context = require.context('.', true, /^\.\/[^/]+\/index\.js$/);

export const PLUGINS = context
  .keys()
  .map((key) => context(key).default)
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
  try { return localStorage.getItem(ACTIVE_PLUGIN_KEY) || ''; } catch { return ''; }
}

export function getActivePlugin() {
  return getPluginById(getActivePluginId());
}

// Set (or clear, with a falsy id) the active plugin. Broadcasts a
// `buffi:plugin-change` event so the sidebar and dashboard can react live.
export function setActivePluginId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_PLUGIN_KEY, id);
    else localStorage.removeItem(ACTIVE_PLUGIN_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent('buffi:plugin-change', { detail: { id: id || '' } }));
}
