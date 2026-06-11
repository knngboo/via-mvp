import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import sourcesRouter from './sources.js';
import agentRouter from './agent.js';

// load environment variables
//
dotenv.config();

// database connection
//
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI)
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));

const app = express();
const PORT = 5000;

// middleware to communicate with frontend
//
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// test route
//
app.get('/', (req, res) => {
    res.send('VIA MVP Backend is running smoothly!');
});

// health check endpoint
app.get('/health', async (req, res) => {
    try {
        const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
        res.status(200).json({ status: 'OK', database: dbStatus });
    } catch (error) {
        res.status(500).json({ status: 'Error', message: error.message });
    }
});

// uploaded csv sources + buffi agent
//
app.use('/api/sources', sourcesRouter);
app.use('/api/agent', agentRouter);

// gtfs data routes
// collections were loaded by import-gtfs.js, so query them directly
//
const db = () => mongoose.connection.db;

// all bus routes, e.g. for a route picker
//
app.get('/api/routes', async (req, res) => {
    try {
        const routes = await db().collection('routes')
            .find({}, { projection: { _id: 0 } })
            .sort({ route_short_name: 1 })
            .toArray();
        res.json(routes);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// stops nearest to a lat/lon, e.g. /api/stops/near?lat=29.4241&lon=-98.4936
//
app.get('/api/stops/near', async (req, res) => {
    try {
        const lat = parseFloat(req.query.lat);
        const lon = parseFloat(req.query.lon);
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
        if (Number.isNaN(lat) || Number.isNaN(lon)) {
            return res.status(400).json({ message: 'lat and lon query params are required' });
        }
        const stops = await db().collection('stops')
            .find({
                location: { $near: { $geometry: { type: 'Point', coordinates: [lon, lat] } } }
            }, { projection: { _id: 0, location: 0 } })
            .limit(limit)
            .toArray();
        res.json(stops);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// scheduled departures at a stop, joined with trip and route info
//
app.get('/api/stops/:stopId/departures', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
        const departures = await db().collection('stop_times').aggregate([
            { $match: { stop_id: req.params.stopId } },
            { $sort: { departure_time: 1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: 'trips',
                    localField: 'trip_id',
                    foreignField: 'trip_id',
                    as: 'trip'
                }
            },
            { $unwind: '$trip' },
            {
                $lookup: {
                    from: 'routes',
                    localField: 'trip.route_id',
                    foreignField: 'route_id',
                    as: 'route'
                }
            },
            { $unwind: '$route' },
            {
                $project: {
                    _id: 0,
                    departure_time: 1,
                    trip_headsign: '$trip.trip_headsign',
                    route_short_name: '$route.route_short_name',
                    route_long_name: '$route.route_long_name',
                    route_color: '$route.route_color'
                }
            }
        ]).toArray();
        res.json(departures);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});