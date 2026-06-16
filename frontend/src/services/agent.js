// Buffi agent service: chat goes through the backend Agent API
// (backend/agent.js), which lets the model query MongoDB sources and
// VIA GTFS data with tools. The user's OpenAI key from Settings is
// forwarded per-request and never stored server-side.
import { API_BASE } from './api';
import { getStoredApiKey, getStoredModel } from './openai';

export async function chatWithAgent({ userMessage, history = [] }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Add your OpenAI API key in Settings.');
  }
  const res = await fetch(`${API_BASE}/api/agent/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-openai-key': apiKey,
    },
    body: JSON.stringify({
      message: userMessage,
      history,
      model: getStoredModel(),
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || `Agent request failed: ${res.status}`);
  }
  const data = await res.json();
  return data.reply || '(Empty response.)';
}
