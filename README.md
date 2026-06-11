# Buffi

Buffi is a browser-based data assistant. Upload CSV files and chat with **Buffi**, an AI assistant that answers questions about your data. It's a fully client-side React app — your OpenAI API key and data stay in your browser and are sent only to OpenAI.

## Features

- **CSV upload & ingestion** — drag in CSVs; rows are parsed and made available to the chat.
- **AI chat** — ask questions in natural language; answers render as Markdown.
- **Streaming responses** — the assistant types out its answer token-by-token as it arrives, like ChatGPT.
- **Stop button** — halt a response mid-stream; whatever text already arrived is kept.
- **Maps & charts** — built-in Leaflet maps and chart components for visualizing data.

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

## Project structure

```
frontend/src/
  components/    UI components (chat, etc.)
  services/      OpenAI calls (openai.js) and CSV parsing
  context/       shared state (uploaded files, etc.)
  pages/         routed pages
  styles/        component CSS
```

## Tech stack

React 19 · React Router · OpenAI API · Leaflet · Recharts/MUI X Charts · PapaParse · markdown-to-jsx
