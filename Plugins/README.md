# Plugins

Drop-in, self-contained plugin folders for the Buffi interface. **Everything a
client needs — dashboard UI and parsing logic — lives inside its own folder.**
Adding a new client is just adding a folder here; no other file in the app
needs to change.

## Structure

```
Plugins/
  index.js                 ← registry: AUTO-DISCOVERS every plugin folder
  <Client>/                ← one folder per client (e.g. Via, COSA)
    index.js               ← the plugin manifest
    ParseLogic/            ← all of this client's data parsing
      index.js             ←   export function parse(files) { ... }
    Dashboard/             ← all of this client's visualization UI
      <Client>Dashboard.jsx
      <Client>Dashboard.css
```

## The manifest (the only contract)

`<Client>/index.js` default-exports a plain object:

```js
import ClientDashboard from './Dashboard/ClientDashboard';
import { parse } from './ParseLogic';

export default {
  id: 'client',        // unique, stored in localStorage when active
  name: 'Client',      // shown in the Settings dropdown + sidebar
  Dashboard: ClientDashboard,
  parse,               // parse(files) → data; the host runs this for you
  order: 10,           // optional: sort order in the dropdown
};
```

## Data flow

1. User picks a plugin in **Settings** → its `id` is saved to `localStorage`
   (`buffi_active_plugin`) and a `buffi:plugin-change` event fires.
2. The sidebar shows a **Dashboard** item routing to `/dashboard`.
3. The host (`src/components/PluginDashboardPage.jsx`) is fully generic. It:
   - grabs the uploaded CSV files,
   - runs the active plugin's `parse(files)`,
   - renders the plugin's `Dashboard` with `{ data, files }`.

So the host never contains client-specific code — parsing and rendering both
live in the client's folder.

## Adding a new client

1. Copy the `Via/` folder to `<Client>/`.
2. Set a unique `id`/`name` in `<Client>/index.js`.
3. Implement `parse(files)` in `<Client>/ParseLogic/index.js`.
4. Build the UI in `<Client>/Dashboard/`.

It's auto-discovered and appears in the Settings dropdown on the next reload.

## Status

`Via` is a placeholder: its `parse` returns `null` and its dashboard renders
"Placeholder". It's the template to copy for real clients.
