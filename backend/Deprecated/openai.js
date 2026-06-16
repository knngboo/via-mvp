import dotenv from 'dotenv';
dotenv.config();

export const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ROUNDS = 6;

// ---------------------------------------------------------------------------
// Schema context builder
// Queries information_schema at request time and returns a compact description
// of all available tables + columns. Injected into the system prompt so the AI
// can write correct SQL for any question — no hardcoded tool per question type.
// ---------------------------------------------------------------------------
async function buildSchemaContext(pool, tenant) {
    try {
        const schemasToShow = ['public', tenant].filter(Boolean);

        // Only include tables that actually have data (row count > 0).
        // Empty tables are excluded so the AI never says "I have transit data"
        // when tables exist but nothing has been uploaded yet.
        const tablesRes = await pool.query(`
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema = ANY($1)
              AND table_type = 'BASE TABLE'
              AND table_name NOT IN ('schema_migrations', 'sources_meta',
                                     'users', 'chat_messages', 'feedback',
                                     'tenant_plugins')
            ORDER BY table_schema, table_name;
        `, [schemasToShow]);

        if (tablesRes.rows.length === 0) {
            return 'DATABASE: No data tables found. The agency has not uploaded any data yet. Tell the user to upload a file via the Data Hub before asking data questions.';
        }

        // Check row counts and filter out empty tables
        const nonEmptyTables = [];
        for (const t of tablesRes.rows) {
            try {
                const countRes = await pool.query(
                    `SELECT COUNT(*) AS n FROM "${t.table_schema}"."${t.table_name}"`
                );
                if (parseInt(countRes.rows[0].n, 10) > 0) {
                    nonEmptyTables.push(t);
                }
            } catch (_) {
                // Table may not be queryable — skip it
            }
        }

        if (nonEmptyTables.length === 0) {
            return 'DATABASE: All tables are empty. No data has been uploaded yet. Tell the user to upload a file via the Data Hub.';
        }

        const colsRes = await pool.query(`
            SELECT table_schema, table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = ANY($1)
            ORDER BY table_schema, table_name, ordinal_position;
        `, [schemasToShow]);

        const colMap = {};
        for (const row of colsRes.rows) {
            const key = `${row.table_schema}.${row.table_name}`;
            if (!colMap[key]) colMap[key] = [];
            colMap[key].push(`${row.column_name}:${row.data_type}`);
        }

        const lines = ['DATABASE SCHEMA (use fully-qualified names in SQL, e.g. public.stops or bfi.my_upload):'];
        for (const t of nonEmptyTables) {
            const key = `${t.table_schema}.${t.table_name}`;
            const cols = colMap[key] || [];
            lines.push(`  ${key}(${cols.join(', ')})`);
        }
        return lines.join('\n');
    } catch (e) {
        return 'DATABASE: Schema unavailable.';
    }
}

// ---------------------------------------------------------------------------
// System prompt (static part — schema is appended dynamically per request)
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT_BASE = `You are Buffi, an AI data assistant for BFI's transit analytics platform.

You answer questions about transit data and any data the agency has uploaded.

TOOLS AVAILABLE:
- run_query  → Write and run any read-only SQL SELECT against the database. Use this for nearly all data questions.
- predict_route_ridership → Forecast future ridership using linear regression on historical data.

HOW TO USE run_query:
- Write valid PostgreSQL SELECT statements only.
- Use fully-qualified table names from the schema provided below (e.g. public.stops, bfi.my_upload).
- You may JOIN across tables freely.
- For "busiest stops": SELECT stop_id, stop_name, COUNT(*) FROM public.stop_times JOIN public.stops USING(stop_id) GROUP BY stop_id, stop_name ORDER BY COUNT(*) DESC LIMIT 10
- For "busiest routes": JOIN public.trips and public.routes, GROUP BY route_id, ORDER BY COUNT(*) DESC
- For "stops near downtown": ORDER BY distance using haversine formula on stop_lat/stop_lon
- If the user asks about uploaded data, query the tenant schema tables.

RULES:
- ALWAYS use run_query for data questions. Never say "no data available" without trying a query first.
- Never ask the user to upload a file if a query can answer the question.
- If a query returns no rows, say so and suggest why (e.g. no data uploaded yet).
- Answer concisely. Use Markdown tables for structured results.
- Do not expose raw SQL errors to the user — summarize what went wrong plainly.`;

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------
const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'run_query',
            description: 'Execute a read-only SQL SELECT query against the database. Use this for any question about transit data, uploaded files, schedules, stops, routes, or any analytical question answerable with SQL.',
            parameters: {
                type: 'object',
                properties: {
                    sql: {
                        type: 'string',
                        description: 'A valid PostgreSQL SELECT statement. Must start with SELECT. No mutations (INSERT/UPDATE/DELETE/DROP) allowed.'
                    }
                },
                required: ['sql']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'predict_route_ridership',
            description: 'Forecast short-term and long-term route-level ridership using linear regression on historical data. Use only when the user asks to forecast or predict future ridership.',
            parameters: {
                type: 'object',
                properties: {
                    table_name: { type: 'string', description: 'The name of the historical APC data table (without schema prefix).' },
                    route_id_column: { type: 'string', description: 'The column containing route IDs.' },
                    route_id_value: { type: 'string', description: 'The specific route to forecast.' },
                    date_column: { type: 'string', description: 'The column containing dates.' },
                    ridership_column: { type: 'string', description: 'The column containing passenger counts.' },
                    days_to_forecast: { type: 'integer', description: 'Number of days into the future to forecast.' }
                },
                required: ['table_name', 'route_id_column', 'route_id_value', 'date_column', 'ridership_column', 'days_to_forecast']
            }
        }
    }
];

// ---------------------------------------------------------------------------
// SQL safety guard — only allows SELECT statements
// ---------------------------------------------------------------------------
const BLOCKED_KEYWORDS = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
    'TRUNCATE', 'GRANT', 'REVOKE', 'EXECUTE', 'EXEC', 'COPY',
    'PERFORM', 'DO ', 'CALL',
];

function isSafeSelect(sql) {
    const normalized = sql.trim().replace(/\s+/g, ' ').toUpperCase();
    if (!normalized.startsWith('SELECT')) return false;
    for (const kw of BLOCKED_KEYWORDS) {
        if (normalized.includes(kw)) return false;
    }
    // Disallow system schema access
    if (normalized.includes('PG_CATALOG') || normalized.includes('INFORMATION_SCHEMA')) return false;
    return true;
}

// ---------------------------------------------------------------------------
// Tool executor
// ---------------------------------------------------------------------------
async function runTool(pool, tenant, name, args) {

    // ── run_query ────────────────────────────────────────────────────────────
    if (name === 'run_query') {
        const sql = (args.sql || '').trim();

        if (!isSafeSelect(sql)) {
            return { error: 'Only read-only SELECT statements are allowed. The query was rejected.' };
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            // Set read-only transaction and restrict search path to tenant + public
            await client.query('SET TRANSACTION READ ONLY');
            await client.query(`SET LOCAL search_path TO public, "${tenant}"`);

            const res = await client.query(sql);
            await client.query('COMMIT');

            const MAX_ROWS = 200;
            return {
                row_count: res.rows.length,
                truncated: res.rows.length > MAX_ROWS,
                data: res.rows.slice(0, MAX_ROWS),
            };
        } catch (e) {
            await client.query('ROLLBACK');
            return { error: `Query failed: ${e.message}` };
        } finally {
            client.release();
        }
    }

    // ── predict_route_ridership ───────────────────────────────────────────────
    if (name === 'predict_route_ridership') {
        const { table_name, route_id_column, route_id_value, date_column, ridership_column, days_to_forecast } = args;

        // Whitelist table and columns against actual schema
        const validTablesRes = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1;`,
            [tenant]
        );
        if (!validTablesRes.rows.some(r => r.table_name === table_name)) {
            return { error: `Table '${table_name}' does not exist in your schema.` };
        }

        const colRes = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3);`,
            [tenant, table_name, [route_id_column, date_column, ridership_column]]
        );
        const validCols = new Set(colRes.rows.map(r => r.column_name));
        for (const col of [route_id_column, date_column, ridership_column]) {
            if (!validCols.has(col)) {
                return { error: `Column '${col}' not found in '${table_name}'. Inspect the table first.` };
            }
        }

        const safeDays = Math.max(1, Math.min(365, parseInt(days_to_forecast, 10) || 30));

        try {
            const query = `
                SELECT
                    CAST("${date_column}" AS DATE) as date_val,
                    CAST("${ridership_column}" AS NUMERIC) as count_val
                FROM ${tenant}."${table_name}"
                WHERE "${route_id_column}" = $1
                ORDER BY date_val ASC;
            `;
            const res = await pool.query(query, [route_id_value]);
            const rows = res.rows.filter(r => r.date_val && r.count_val !== null && !isNaN(Number(r.count_val)));

            if (rows.length < 2) return { error: 'Not enough valid historical data to perform forecasting.' };

            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            const n = rows.length;
            for (let i = 0; i < n; i++) {
                const x = i, y = Number(rows[i].count_val);
                sumX += x; sumY += y; sumXY += x * y; sumXX += x * x;
            }
            const denom = (n * sumXX - sumX * sumX);
            if (denom === 0) return { error: 'Cannot compute regression: all data points have identical indices.' };

            const m = (n * sumXY - sumX * sumY) / denom;
            const b = (sumY - m * sumX) / n;

            const lastDate = new Date(rows[n - 1].date_val);
            const forecast = [];
            for (let i = 1; i <= safeDays; i++) {
                const nextY = Math.max(0, Math.round(m * (n - 1 + i) + b));
                const forecastDate = new Date(lastDate);
                forecastDate.setDate(forecastDate.getDate() + i);
                forecast.push({ date: forecastDate.toISOString().split('T')[0], predicted_ridership: nextY });
            }

            return {
                message: `Forecast using linear regression over ${n} data points. Trend: ${m > 0 ? 'increasing' : 'decreasing'} by ${Math.abs(m).toFixed(2)} riders/day.`,
                historical_data_points: n,
                forecast,
            };
        } catch (e) {
            return { error: `Forecasting failed: ${e.message}` };
        }
    }

    return { error: `Unknown tool: ${name}` };
}

// ---------------------------------------------------------------------------
// OpenAI API helpers
// ---------------------------------------------------------------------------

// Non-streaming call — used for tool-calling rounds.
async function callOpenAI(messages, model = DEFAULT_MODEL) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, tools: TOOLS, stream: false }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI request failed: ${res.status} — ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    return data.choices?.[0]?.message;
}

// Real SSE streaming — used only for the final text response (no tool calls).
// Passes messages WITHOUT tools so the model can only return text.
async function streamOpenAI(messages, model = DEFAULT_MODEL, expressRes) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages, stream: true }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI stream failed: ${res.status} — ${body.slice(0, 200)}`);
    }

    expressRes.setHeader('Content-Type', 'text/event-stream');
    expressRes.setHeader('Cache-Control', 'no-cache');
    expressRes.setHeader('Connection', 'keep-alive');

    const reader = res.body.getReader();
    expressRes.on('close', () => reader.cancel());

    const decoder = new TextDecoder('utf-8');
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        expressRes.write(decoder.decode(value, { stream: true }));
    }
    expressRes.end();
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export async function chatWithOpenAI({ pool, userMessage, history = [], tenant = 'bfi', model = DEFAULT_MODEL, resForStream = null }) {

    // Build schema context dynamically so the AI always knows what tables exist.
    const schemaContext = await buildSchemaContext(pool, tenant);

    const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${schemaContext}`;

    const messages = [{ role: 'system', content: systemPrompt }];

    for (const m of history || []) {
        if (!m || !m.text) continue;
        messages.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
    }
    messages.push({ role: 'user', content: userMessage });

    // Tool-calling loop — all rounds non-streaming.
    // Final round (no tool calls) streams live to the client.
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callOpenAI(messages, model);

        if (!reply.tool_calls || reply.tool_calls.length === 0) {
            if (resForStream) {
                await streamOpenAI(messages, model, resForStream);
                return;
            }
            return { response: reply.content || '(Empty response.)' };
        }

        messages.push(reply);

        for (const call of reply.tool_calls) {
            let result;
            try {
                result = await runTool(pool, tenant, call.function.name, JSON.parse(call.function.arguments || '{}'));
            } catch (err) {
                result = { error: err.message };
            }
            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(result),
            });
        }
    }

    // MAX_TOOL_ROUNDS exceeded
    if (resForStream) {
        if (!resForStream.headersSent) {
            resForStream.status(500).json({ error: 'Buffi exceeded maximum reasoning steps.' });
        } else {
            resForStream.end();
        }
        return;
    }
    return { response: 'Error: Buffi exceeded maximum reasoning steps.' };
}
