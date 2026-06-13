import dotenv from 'dotenv';
dotenv.config();

export const DEFAULT_MODEL = 'gpt-4o-mini';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_TOOL_ROUNDS = 5;

const SYSTEM_PROMPT = `You are Buffi, an advanced data assistant.
You can query two kinds of data via tools:
1. CSV sources the user uploaded (list_sources, get_source_rows).
2. VIA Metropolitan Transit GTFS data for San Antonio (find_nearby_stops, get_stop_departures).
If asked to forecast ridership, first inspect the uploaded APC data to find the column names for dates, routes, and passenger counts. Then use the predict_route_ridership tool.
Analyze the data carefully and answer the user's question concisely. Use Markdown.`;

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_sources',
            description: 'List all available data tables that the user has uploaded to their company schema.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_source_rows',
            description: 'Fetch rows from a specific data table.',
            parameters: {
                type: 'object',
                properties: {
                    table_name: { type: 'string', description: 'The exact name of the table from list_sources.' },
                    limit: { type: 'integer', description: 'Max rows to return (default 100).' }
                },
                required: ['table_name']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'find_nearby_stops',
            description: 'Find VIA bus stops nearest to a latitude/longitude in San Antonio.',
            parameters: {
                type: 'object',
                properties: {
                    lat: { type: 'number' },
                    lon: { type: 'number' },
                    limit: { type: 'integer', description: 'Max stops to return (default 5).' }
                },
                required: ['lat', 'lon']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_stop_departures',
            description: 'Scheduled departures at a VIA bus stop (by stop_id), with route and headsign.',
            parameters: {
                type: 'object',
                properties: {
                    stop_id: { type: 'string' },
                    limit: { type: 'integer', description: 'Max departures to return (default 10).' }
                },
                required: ['stop_id']
            }
        }
    },
    {
        type: 'function',
        function: {
            name: 'predict_route_ridership',
            description: 'Forecast short-term and long-term route-level ridership using historical data.',
            parameters: {
                type: 'object',
                properties: {
                    table_name: { type: 'string', description: 'The name of the historical APC data table.' },
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

async function runPostgresTool(pool, tenant, name, args) {
    if (name === 'list_sources') {
        const res = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = $1;
        `, [tenant]);
        return { available_tables: res.rows.map(r => r.table_name) };
    }

    if (name === 'get_source_rows') {
        // Prevent SQL Injection by matching against actual tables
        const validTables = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = $1;`, [tenant]);
        const isValid = validTables.rows.some(r => r.table_name === args.table_name);

        if (!isValid) return { error: `Table '${args.table_name}' does not exist in your schema.` };

        const limit = Math.min(args.limit || 100, 500);
        const res = await pool.query(`SELECT * FROM ${tenant}."${args.table_name}" LIMIT $1;`, [limit]);
        return { table: args.table_name, row_count: res.rows.length, data: res.rows };
    }

    if (name === 'find_nearby_stops') {
        const limit = Math.min(args.limit || 5, 25);
        // Haversine formula for distance sorting
        const query = `
            SELECT stop_id, stop_name, stop_lat, stop_lon
            FROM stops
            ORDER BY (
                3959 * acos(
                    cos(radians($1)) * cos(radians(stop_lat)) *
                    cos(radians(stop_lon) - radians($2)) +
                    sin(radians($1)) * sin(radians(stop_lat))
                )
            ) ASC
            LIMIT $3;
        `;
        try {
            const res = await pool.query(query, [args.lat, args.lon, limit]);
            return res.rows;
        } catch (e) {
            return { error: 'Failed to query stops. Is GTFS data loaded?' };
        }
    }

    if (name === 'get_stop_departures') {
        const limit = Math.min(args.limit || 10, 50);
        const query = `
            SELECT
                st.departure_time,
                t.trip_headsign,
                r.route_short_name,
                r.route_long_name
            FROM stop_times st
            JOIN trips t ON st.trip_id = t.trip_id
            JOIN routes r ON t.route_id = r.route_id
            WHERE st.stop_id = $1
            ORDER BY st.departure_time ASC
            LIMIT $2;
        `;
        try {
            const res = await pool.query(query, [String(args.stop_id), limit]);
            return res.rows;
        } catch (e) {
            return { error: 'Failed to query departures. Is GTFS data loaded?' };
        }
    }

    if (name === 'predict_route_ridership') {
        const { table_name, route_id_column, route_id_value, date_column, ridership_column, days_to_forecast } = args;

        // Step 1: Whitelist the table name against actual tables in the schema
        const validTablesRes = await pool.query(
            `SELECT table_name FROM information_schema.tables WHERE table_schema = $1;`,
            [tenant]
        );
        const isValidTable = validTablesRes.rows.some(r => r.table_name === table_name);
        if (!isValidTable) return { error: `Table '${table_name}' does not exist in your schema.` };

        // Step 2: Whitelist ALL column names against the actual columns of that table.
        // This is the critical SQL-injection fix — never interpolate AI-provided identifiers
        // without first confirming they are real column names in the target table.
        const colRes = await pool.query(
            `SELECT column_name FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2 AND column_name = ANY($3);`,
            [tenant, table_name, [route_id_column, date_column, ridership_column]]
        );
        const validCols = new Set(colRes.rows.map(r => r.column_name));
        for (const col of [route_id_column, date_column, ridership_column]) {
            if (!validCols.has(col)) {
                return { error: `Column '${col}' does not exist in table '${table_name}'. Please inspect the table first.` };
            }
        }

        // Step 3: Validate days_to_forecast is a safe integer (1-365)
        const safeDays = Math.max(1, Math.min(365, parseInt(days_to_forecast, 10) || 30));

        try {
            // Column names are now confirmed-safe identifiers — safe to interpolate
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

            // Linear regression: y = mx + b (x = sequential day index)
            let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
            const n = rows.length;

            for (let i = 0; i < n; i++) {
                const x = i;
                const y = Number(rows[i].count_val);
                sumX += x;
                sumY += y;
                sumXY += x * y;
                sumXX += x * x;
            }

            const denom = (n * sumXX - sumX * sumX);
            if (denom === 0) return { error: 'Cannot compute regression: all data points have identical indices.' };

            const m = (n * sumXY - sumX * sumY) / denom;
            const b = (sumY - m * sumX) / n;

            // Generate forecasts
            const lastDate = new Date(rows[rows.length - 1].date_val);
            const forecast = [];
            for (let i = 1; i <= safeDays; i++) {
                const nextX = n - 1 + i;
                const nextY = Math.max(0, Math.round(m * nextX + b));
                const forecastDate = new Date(lastDate);
                forecastDate.setDate(forecastDate.getDate() + i);
                forecast.push({
                    date: forecastDate.toISOString().split('T')[0],
                    predicted_ridership: nextY
                });
            }

            return {
                message: `Forecast generated using linear regression over ${n} data points. Trend is ${m > 0 ? 'increasing' : 'decreasing'} by ${Math.abs(m).toFixed(2)} riders/day.`,
                historical_data_points: n,
                forecast
            };

        } catch (e) {
            return { error: `Forecasting failed: ${e.message}` };
        }
    }

    return { error: `Unknown tool: ${name}` };
}

async function callOpenAI(messages, customKey = null, resForStream = null) {
    const apiKey = customKey || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('No API key set.');

    const isStreaming = !!resForStream;

    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ 
            model: DEFAULT_MODEL, 
            messages, 
            tools: TOOLS,
            stream: isStreaming 
        }),
    });

    if (!res.ok) throw new Error(`OpenAI request failed: ${res.status}`);

    if (isStreaming) {
        // Pipe SSE directly to the Express response
        resForStream.setHeader('Content-Type', 'text/event-stream');
        resForStream.setHeader('Cache-Control', 'no-cache');
        resForStream.setHeader('Connection', 'keep-alive');

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            resForStream.write(chunk);
        }
        resForStream.end();
        return; // Stream handled completely
    }

    const data = await res.json();
    return data.choices?.[0]?.message;
}

export async function chatWithOpenAI({ pool, userMessage, history = [], customKey = null, resForStream = null }) {
    // Hardcoded tenant for MVP until JWT is fully wired to context
    const tenant = 'bfi';

    const messages = [{ role: 'system', content: SYSTEM_PROMPT }];

    for (const m of history || []) {
        if (!m || !m.text) continue;
        messages.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
    }
    messages.push({ role: 'user', content: userMessage });

    // Autonomous tool-calling loop — fetch non-streaming, execute tools, repeat.
    // On the final round (no tool calls), fake-stream the text for the typing effect.
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const reply = await callOpenAI(messages, customKey);

        if (!reply.tool_calls || reply.tool_calls.length === 0) {
            // Final text response — stream it character-by-character for the typing effect
            if (resForStream) {
                resForStream.setHeader('Content-Type', 'text/event-stream');
                resForStream.setHeader('Cache-Control', 'no-cache');
                resForStream.setHeader('Connection', 'keep-alive');

                const text = reply.content || '';
                let i = 0;
                let done = false;

                const interval = setInterval(() => {
                    // Stop if the client disconnected or we're done
                    if (done) {
                        clearInterval(interval);
                        return;
                    }
                    if (i >= text.length) {
                        done = true;
                        clearInterval(interval);
                        resForStream.write(`data: [DONE]\n\n`);
                        resForStream.end();
                    } else {
                        const chunk = text.slice(i, i + 3);
                        resForStream.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`);
                        i += 3;
                    }
                }, 10);

                // Critical: if the client disconnects, stop the interval immediately
                // to prevent a memory leak from an orphaned setInterval.
                resForStream.on('close', () => {
                    done = true;
                    clearInterval(interval);
                });
                return;
            }
            return { response: reply.content || '(Empty response.)' };
        }

        messages.push(reply);

        for (const call of reply.tool_calls) {
            let result;
            try {
                result = await runPostgresTool(pool, tenant, call.function.name, JSON.parse(call.function.arguments || '{}'));
            } catch (err) {
                result = { error: err.message };
            }
            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(result)
            });
        }
    }

    // MAX_TOOL_ROUNDS exceeded — only write error if headers haven't been sent yet
    if (resForStream) {
        if (!resForStream.headersSent) {
            resForStream.status(500).json({ error: 'Buffi exceeded maximum tool calls.' });
        } else {
            resForStream.end();
        }
        return;
    }
    return { response: 'Error: Buffi exceeded maximum tool calls while analyzing the data.' };
}

