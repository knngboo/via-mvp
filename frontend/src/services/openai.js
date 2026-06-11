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

function buildMessages(userMessage, files, history) {
  const context = files
    .map(fileToContextBlock)
    .filter(Boolean)
    .join('\n');
  const system = [
    "You are Buffi, a helpful data assistant. Answer the user's question using the CSV files they have uploaded. If the answer requires data not in those files, say so. Use Markdown. Be concise.",
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
