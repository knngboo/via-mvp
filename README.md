# Buffi

Buffi is a browser-based data assistant. Upload CSV files and chat with **Buffi**, an AI assistant that answers questions about your data. It's a fully client-side React app — your OpenAI API key and data stay in your browser and are sent only to OpenAI.

## Features

- **CSV upload & ingestion** — drag in CSVs; rows are parsed and made available to the chat.
- **AI chat** — ask questions in natural language; answers render as Markdown.
- **Streaming responses** — the assistant types out its answer token-by-token as it arrives, like ChatGPT.
- **Stop button** — halt a response mid-stream; whatever text already arrived is kept.
- **Maps & charts** — built-in Leaflet maps and chart components for visualizing data.
- **Plugins** — drop-in plugin folders that add a data dashboard. Activate one in Settings and its dashboard appears in the sidebar. See [Plugin system](#plugin-system).

## Getting started

```bash
cd frontend
npm install
npm start
```

The app runs at [http://localhost:3000](http://localhost:3000).

Add your OpenAI API key in **Settings** — it's stored in your browser's `localStorage` and used only for direct calls to the OpenAI API.

## Scripts

Run from the `frontend/` directory:

- `npm start` — start the dev server
- `npm run build` — production build
- `npm test` — run tests

## How it works

- No backend — the browser calls the OpenAI `/chat/completions` endpoint directly.
- CSV parsing, chat history, and the API key are all handled in the browser.
- The model is configurable in Settings (defaults to `gpt-5-mini`).

## Plugin system

Buffi supports **drop-in, per-client plugins**. Each plugin adds a dashboard, and
everything that plugin owns — its visualization UI *and* its data-parsing logic —
lives entirely inside its own folder in the repo-root `Plugins/` directory
(outside the app's `frontend/src`). Adding a new client is just adding a folder;
no other file in the app changes.

```
Plugins/                   (repo root — sibling of frontend/)
  index.js                 registry — auto-discovers every plugin folder
  Via/                     one folder per client (Via is a placeholder)
    index.js               manifest: { id, name, Dashboard, parse }
    ParseLogic/            this client's data parsing  → parse(files)
    Dashboard/             this client's visualization UI
```

The app reaches this out-of-`src` folder via [CRACO](https://craco.js.org/)
(`frontend/craco.config.js`): it relaxes Create React App's src-only import scope
and exposes the folder under the `Plugins` import alias. This is why the npm
scripts run through `craco` instead of `react-scripts`.

**How it works**

1. Plugins are **auto-discovered** — any `Plugins/<Client>/index.js` that exports a
   manifest is picked up automatically (no registration step).
2. The manifest is the whole contract: `{ id, name, Dashboard, parse }`.
3. Pick a plugin in **Settings → Active plugin**. The id is saved to `localStorage`
   and a `buffi:plugin-change` event fires.
4. When active, a **Dashboard** item appears in the sidebar and routes to
   `/dashboard`.
5. The generic host ([`PluginDashboardPage.jsx`](frontend/src/components/PluginDashboardPage.jsx))
   runs the plugin's `parse(files)` over the uploaded CSVs and renders its
   `Dashboard` with `{ data, files }`. No client-specific code lives in the host.

**Adding a client:** copy `Plugins/Via/`, rename it, give it a unique `id`/`name`,
implement `parse(files)` in `ParseLogic/`, and build the UI in `Dashboard/`. See
[`Plugins/README.md`](Plugins/README.md) for the full guide.

## Project structure

```
Plugins/         drop-in per-client plugins (see Plugin system above)
frontend/
  craco.config.js  build config that wires in the root Plugins/ folder
  src/
    components/    UI components (chat, plugin dashboard host, etc.)
    services/      OpenAI calls (openai.js) and CSV parsing
    context/       shared state (uploaded files, etc.)
    pages/         routed pages
    styles/        component CSS
```

## Tech stack

React 19 · React Router · OpenAI API · Leaflet · Recharts/MUI X Charts · PapaParse · markdown-to-jsx
