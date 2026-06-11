import { Router } from 'express';
import mongoose from 'mongoose';

// agent api: POST /api/agent/chat runs Buffi as a tool-calling agent.
// The model decides which MongoDB-backed tools to call (uploaded sources
// and VIA GTFS data), we execute them, and loop until it produces an answer.
//
const router = Router();
const db = () => mongoose.connection.db;

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-5-mini';
const MAX_TOOL_ROUNDS = 6;
const MAX_ROWS = 200;

const SYSTEM_PROMPT = [
    'You are Buffi, a helpful data assistant for the VIA MVP platform.',
    'You can query two kinds of data via tools:',
    '1. CSV sources the user uploaded (list_sources, get_source_rows).',
    '2. VIA Metropolitan Transit GTFS data for San Antonio (find_nearby_stops, get_stop_departures).',
    'Call tools to look at real data before answering; never invent values.',
    'If the answer requires data that is not available, say so.',
    'Use Markdown. Be concise.'
].join(' ');

const TOOLS = [
    {
        type: 'function',
        function: {
            name: 'list_sources',
            description: 'List the CSV sources the user has uploaded: name, folder, columns, and row counts.',
            parameters: { type: 'object', properties: {} }
        }
    },
    {
        type: 'function',
        function: {
            name: 'get_source_rows',
            description: 'Fetch rows from an uploaded CSV source by its exact name (as returned by list_sources).',
            parameters: {
                type: 'object',
                properties: {
                    source_name: { type: 'string', description: 'Exact file name of the source.' },
                    limit: { type: 'integer', description: `Max rows to return (default 100, max ${MAX_ROWS}).` }
                },
                required: ['source_name']
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
    }
];

async function runTool(name, args) {
    if (name === 'list_sources') {
        return db().collection('sources')
            .find({}, { projection: { _id: 0, name: 1, folder: 1, tier: 1, num_rows: 1, columns: 1 } })
            .sort({ uploaded_at: -1 })
            .toArray();
    }

    if (name === 'get_source_rows') {
        const limit = Math.min(args.limit || 100, MAX_ROWS);
        const source = await db().collection('sources').findOne({ name: args.source_name });
        if (!source) return { error: `No source named "${args.source_name}". Use list_sources for available names.` };
        const rows = await db().collection('source_rows')
            .find({ sourceId: source._id })
            .sort({ rowIndex: 1 })
            .limit(limit)
            .toArray();
        return { name: source.name, total_rows: source.num_rows, returned: rows.length, rows: rows.map(r => r.data) };
    }

    if (name === 'find_nearby_stops') {
        return db().collection('stops')
            .find({
                location: { $near: { $geometry: { type: 'Point', coordinates: [args.lon, args.lat] } } }
            }, { projection: { _id: 0, stop_id: 1, stop_name: 1, stop_lat: 1, stop_lon: 1 } })
            .limit(Math.min(args.limit || 5, 25))
            .toArray();
    }

    if (name === 'get_stop_departures') {
        return db().collection('stop_times').aggregate([
            { $match: { stop_id: String(args.stop_id) } },
            { $sort: { departure_time: 1 } },
            { $limit: Math.min(args.limit || 10, 50) },
            { $lookup: { from: 'trips', localField: 'trip_id', foreignField: 'trip_id', as: 'trip' } },
            { $unwind: '$trip' },
            { $lookup: { from: 'routes', localField: 'trip.route_id', foreignField: 'route_id', as: 'route' } },
            { $unwind: '$route' },
            {
                $project: {
                    _id: 0,
                    departure_time: 1,
                    trip_headsign: '$trip.trip_headsign',
                    route_short_name: '$route.route_short_name',
                    route_long_name: '$route.route_long_name'
                }
            }
        ]).toArray();
    }

    return { error: `Unknown tool: ${name}` };
}

async function callOpenAI(apiKey, model, messages) {
    const res = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ model, messages, tools: TOOLS })
    });
    if (!res.ok) {
        let detail = '';
        try {
            const errBody = await res.json();
            detail = errBody?.error?.message || '';
        } catch {}
        const err = new Error(`OpenAI ${res.status}: ${detail.slice(0, 200) || 'request failed'}`);
        err.status = res.status === 401 ? 401 : 502;
        throw err;
    }
    const data = await res.json();
    return data.choices?.[0]?.message;
}

router.post('/chat', async (req, res) => {
    try {
        const { message, history = [], model } = req.body || {};
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ message: 'Request body must include a "message" string.' });
        }
        const apiKey = req.get('x-openai-key') || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return res.status(400).json({ message: 'No API key. Add your OpenAI API key in Settings.' });
        }

        const messages = [{ role: 'system', content: SYSTEM_PROMPT }];
        for (const m of history) {
            if (!m || !m.text) continue;
            messages.push({ role: m.from === 'user' ? 'user' : 'assistant', content: m.text });
        }
        messages.push({ role: 'user', content: message });

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const reply = await callOpenAI(apiKey, model || DEFAULT_MODEL, messages);
            if (!reply) {
                return res.status(502).json({ message: 'OpenAI returned an empty response.' });
            }
            if (!reply.tool_calls || reply.tool_calls.length === 0) {
                return res.json({ reply: reply.content || '(Empty response.)' });
            }

            messages.push(reply);
            for (const call of reply.tool_calls) {
                let result;
                try {
                    result = await runTool(call.function.name, JSON.parse(call.function.arguments || '{}'));
                } catch (toolErr) {
                    result = { error: toolErr.message };
                }
                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: JSON.stringify(result)
                });
            }
        }
        res.status(502).json({ message: 'Agent exceeded the tool-call limit without producing an answer.' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
});

export default router;
