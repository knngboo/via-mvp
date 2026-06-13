import { Router } from 'express';

export default function (pool) {
    const router = Router();

    // 1. Dashboard counts
    router.get('/', async (req, res) => {
        try {
            const queries = `
                SELECT 
                    (SELECT COUNT(*)::int FROM routes) as routes,
                    (SELECT COUNT(*)::int FROM stops) as stops,
                    (SELECT COUNT(*)::int FROM trips) as trips,
                    (SELECT COUNT(*)::int FROM stop_times) as stop_times,
                    (SELECT COUNT(*)::int FROM bfi.sources_meta) as sources;
            `;
            const result = await pool.query(queries);
            
            // Provide 0 for shapes and feed so the UI doesn't crash if it expects them
            res.json({
                ...result.rows[0],
                shapes: 0,
                feed: null
            });
        } catch (error) {
            console.error('Stats Error:', error);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    // 2. Busiest routes
    router.get('/trips-per-route', async (req, res) => {
        try {
            const query = `
                SELECT 
                    r.route_id, 
                    r.route_short_name, 
                    r.route_long_name, 
                    COUNT(t.trip_id)::int AS trips
                FROM routes r
                JOIN trips t ON r.route_id = t.route_id
                GROUP BY r.route_id, r.route_short_name, r.route_long_name
                ORDER BY trips DESC
                LIMIT 10;
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (error) {
            console.error('Stats Error:', error);
            res.status(500).json({ error: 'Failed to fetch trips per route' });
        }
    });

    // 3. Departures by hour
    router.get('/departures-by-hour', async (req, res) => {
        try {
            const query = `
                SELECT 
                    (CAST(SPLIT_PART(departure_time, ':', 1) AS INTEGER) % 24) AS hour,
                    COUNT(*)::int AS departures
                FROM stop_times
                WHERE departure_time IS NOT NULL AND departure_time != ''
                GROUP BY hour
                ORDER BY hour ASC;
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (error) {
            console.error('Stats Error:', error);
            res.status(500).json({ error: 'Failed to fetch departures by hour' });
        }
    });

    return router;
}
