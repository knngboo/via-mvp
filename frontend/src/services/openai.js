// Direct browser → OpenAI call. The API key is entered by the user in Settings
// and stored in localStorage, so it never leaves this browser except to OpenAI.
const KEY_STORAGE = 'buffi_api_key';
const MODEL_STORAGE = 'buffi_model';

export const OPENAI_MODELS = [
  { id: 'gpt-5.1', label: 'GPT-5.1' },
  { id: 'gpt-5', label: 'GPT-5' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini' },
  { id: 'gpt-5-nano', label: 'GPT-5 nano' },
  { id: 'gpt-4.1', label: 'GPT-4.1' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini' },
];

export const DEFAULT_MODEL = 'gpt-5-mini';

export const getStoredApiKey = () => {
  try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; }
};

export const getStoredModel = () => {
  try { return localStorage.getItem(MODEL_STORAGE) || DEFAULT_MODEL; } catch { return DEFAULT_MODEL; }
};

export const setStoredModel = (model) => {
  try { localStorage.setItem(MODEL_STORAGE, model); } catch {}
};

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const MAX_ROWS_PER_FILE = 200;
const MAX_CHARS_PER_FILE = 12000;

function fileToContextBlock(file) {
  if (!file) return '';
  const name = file.name || 'uploaded.csv';
  const rows = Array.isArray(file.csvData) ? file.csvData.slice(0, MAX_ROWS_PER_FILE) : [];
  if (rows.length === 0) {
    return `--- FILE: ${name} ---\n(No rows available)\n`;
  }
  const columns = Object.keys(rows[0]).filter((k) => k !== 'hasError' && k !== 'rowIndex');
  const header = columns.join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const v = row[c];
          if (v == null) return '';
          const s = String(v).replace(/"/g, '""');
          return /[",\n]/.test(s) ? `"${s}"` : s;
        })
        .join(','),
    )
    .join('\n');
  let block = `--- FILE: ${name} ---\n${header}\n${body}\n`;
  if (block.length > MAX_CHARS_PER_FILE) {
    block = block.slice(0, MAX_CHARS_PER_FILE) + '\n…(truncated)\n';
  }
  return block;
}

// Sentinel value the UI uses for the always-available free-text "Other…" choice.
export const OTHER_VALUE = '__other__';

// Tells the model how to ask the user clarifying questions as a structured,
// Claude-Code-style multiple-choice block instead of plain prose. The UI
// renders this block as an interactive card and sends every answer back at once.
const ASK_INSTRUCTIONS = `
DEFAULT TO ANSWERING. Trust your own judgment and make reasonable assumptions instead of interrogating the user. Most requests do NOT need a follow-up — only ask when there is genuine ambiguity that you truly cannot resolve yourself and that would change the result (e.g. you literally cannot tell what data or deliverable they mean). If you can make a sensible choice on your own, do that and briefly note the assumption rather than asking.

When clarification IS genuinely needed, reply with ONLY a fenced code block tagged \`ask\` containing JSON, no text before or after it:

\`\`\`ask
{"questions":[{"header":"Theme","question":"What should the poem be about?","options":[{"label":"Love"},{"label":"Nature"},{"label":"Loss"}]}]}
\`\`\`

Rules:
- Ask everything you need in this ONE group. You may include more than one question, but keep it tight — only questions you genuinely cannot answer yourself.
- Keep it SIMPLE: 2–3 options per question, with short "label"s. A "description" is OPTIONAL — only add one when the label alone is unclear.
- Each question needs a short "header" (≤ ~16 chars) and the "question" text.
- Set "multiSelect": true only when more than one option can genuinely apply at once.
- The user always also gets a free-text "Other…" choice, so never add one yourself.
- Ask ONLY ONE round. After the user answers, DELIVER the result and resolve any smaller details yourself — never ask a second batch of questions.`;

// Pull a structured \`ask\` block out of an assistant message. Returns
// { intro, questions } when a complete, valid block is present, else null.
// Used by the chat UI to render the interactive follow-up card.
export function parseAskBlock(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/```ask\s*([\s\S]*?)```/);
  if (!match) return null;
  let json;
  try {
    json = JSON.parse(match[1].trim());
  } catch {
    return null;
  }
  const rawQuestions = Array.isArray(json) ? json : json?.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return null;

  const questions = rawQuestions.slice(0, 4).map((q) => {
    const options = (Array.isArray(q?.options) ? q.options : [])
      .slice(0, 6)
      .map((o) =>
        typeof o === 'string'
          ? { label: o, description: '' }
          : { label: String(o?.label ?? ''), description: String(o?.description ?? '') },
      )
      .filter((o) => o.label);
    return {
      header: String(q?.header ?? '').slice(0, 24),
      question: String(q?.question ?? ''),
      multiSelect: !!q?.multiSelect,
      options,
    };
  }).filter((q) => q.question && q.options.length > 0);

  if (questions.length === 0) return null;

  const intro = text.slice(0, match.index).trim();
  return { intro, questions };
}

// Reminder injected when the user has just answered a follow-up, to hard-stop
// the model from opening a second round of questions.
const NO_MORE_FOLLOWUPS =
  '\nThe user has just answered your follow-up questions. Do NOT ask any more questions — produce the final result now and resolve any remaining details yourself.';

function buildMessages(userMessage, files, history, afterFollowUp) {
  const context = files
    .map(fileToContextBlock)
    .filter(Boolean)
    .join('\n');
  const system = [
    "You are Buffi, a helpful data assistant. Answer the user's question using the CSV files they have uploaded. If the answer requires data not in those files, say so. Use Markdown. Be concise.",
    ASK_INSTRUCTIONS,
    afterFollowUp ? NO_MORE_FOLLOWUPS : '',
    context ? `\nUPLOADED FILES:\n${context}` : '\n(No files have been uploaded yet.)',
  ].join('\n');

  const messages = [{ role: 'system', content: system }];
  for (const m of history || []) {
    if (!m || !m.text) continue;
    messages.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

export async function chatWithOpenAI({ userMessage, files = [], history = [] }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Add your OpenAI API key in Settings.');
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getStoredModel(),
      messages: buildMessages(userMessage, files, history),
    }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || '';
    } catch {}
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200) || 'request failed'}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  return text || '(OpenAI returned an empty response.)';
}

// Streaming variant: invokes onToken(partialFullText, deltaChunk) as tokens
// arrive (like ChatGPT typing out the answer), and returns the final text.
export async function streamChatWithOpenAI({ userMessage, files = [], history = [], onToken, signal, afterFollowUp = false }) {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error('No API key set. Add your OpenAI API key in Settings.');
  }
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: getStoredModel(),
      messages: buildMessages(userMessage, files, history, afterFollowUp),
      stream: true,
    }),
    signal,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const errBody = await res.json();
      detail = errBody?.error?.message || '';
    } catch {}
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200) || 'request failed'}`);
  }
  if (!res.body) {
    // No streaming support in this environment — fall back to whole-response.
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || '';
    if (text && onToken) onToken(text, text);
    return text || '(OpenAI returned an empty response.)';
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // Server-sent events are separated by double newlines.
      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        for (const line of event.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json?.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              if (onToken) onToken(full, delta);
            }
          } catch {
            // Ignore partial/non-JSON keep-alive lines.
          }
        }
      }
    }
  } catch (err) {
    // User stopped the stream early — keep whatever already arrived.
    if (err?.name === 'AbortError') {
      return full;
    }
    throw err;
  }

  return full || '(OpenAI returned an empty response.)';
}
