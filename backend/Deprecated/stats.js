import { Router } from 'express';

export default function (pool) {
    const router = Router();

    // Check if a table exists before querying it.
    // Returns 0 instead of throwing when a table hasn't been created yet.
    async function safeCount(tableName, schema = 'public') {
        try {
            const exists = await pool.query(
                `SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = $1 AND tablename = $2`,
                [schema, tableName]
            );
            if (exists.rows.length === 0) return 0;
            const res = await pool.query(
                `SELECT COUNT(*)::int AS n FROM "${schema}"."${tableName}"`
            );
            return res.rows[0].n;
        } catch {
            return 0;
        }
    }

    // 1. Dashboard summary counts
    router.get('/', async (req, res) => {
        try {
            const [routes, stops, trips, stop_times, sources] = await Promise.all([
                safeCount('routes'),
                safeCount('stops'),
                safeCount('trips'),
                safeCount('stop_times'),
                safeCount('sources_meta', 'bfi'),
            ]);
            res.json({ routes, stops, trips, stop_times, sources, shapes: 0, feed: null });
        } catch (error) {
            console.error('Stats Error:', error);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    // 2. Busiest routes (returns [] if GTFS not loaded)
    router.get('/trips-per-route', async (req, res) => {
        try {
            const tableExists = await pool.query(
                `SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'routes'`
            );
            if (tableExists.rows.length === 0) return res.json([]);

            const limit = Math.min(parseInt(req.query.limit) || 10, 50);
            const result = await pool.query(`
                SELECT
                    r.route_id,
                    r.route_short_name,
                    r.route_long_name,
                    COUNT(t.trip_id)::int AS trips
                FROM routes r
                JOIN trips t ON r.route_id = t.route_id
                GROUP BY r.route_id, r.route_short_name, r.route_long_name
                ORDER BY trips DESC
                LIMIT $1;
            `, [limit]);
            res.json(result.rows);
        } catch (error) {
            console.error('Stats Error:', error);
            res.json([]);
        }
    });

    // 3. Departures by hour (returns [] if GTFS not loaded)
    router.get('/departures-by-hour', async (req, res) => {
        try {
            const tableExists = await pool.query(
                `SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'stop_times'`
            );
            if (tableExists.rows.length === 0) return res.json([]);

            const result = await pool.query(`
                SELECT
                    (CAST(SPLIT_PART(departure_time, ':', 1) AS INTEGER) % 24) AS hour,
                    COUNT(*)::int AS departures
                FROM stop_times
                WHERE departure_time IS NOT NULL AND departure_time != ''
                GROUP BY hour
                ORDER BY hour ASC;
            `);
            res.json(result.rows);
        } catch (error) {
            console.error('Stats Error:', error);
            res.json([]);
        }
    });

    return router;
}
