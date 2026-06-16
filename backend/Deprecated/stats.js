import mongoose from 'mongoose';

// dashboard stat queries, shared by the REST endpoints in server.js and the
// buffi agent tools in agent.js so both always see the same numbers
//
const db = () => mongoose.connection.db;

export async function getStats() {
    const [routes, stops, trips, stopTimes, shapes, sources, feed] = await Promise.all([
        db().collection('routes').estimatedDocumentCount(),
        db().collection('stops').estimatedDocumentCount(),
        db().collection('trips').estimatedDocumentCount(),
        db().collection('stop_times').estimatedDocumentCount(),
        db().collection('shapes').estimatedDocumentCount(),
        db().collection('sources').countDocuments(),
        db().collection('feed_info').findOne({}, { projection: { _id: 0 } })
    ]);
    return { routes, stops, trips, stop_times: stopTimes, shapes, sources, feed };
}

export function getTripsPerRoute(limit = 10) {
    return db().collection('trips').aggregate([
        { $group: { _id: '$route_id', trips: { $sum: 1 } } },
        { $sort: { trips: -1 } },
        { $limit: Math.min(limit, 50) },
        { $lookup: { from: 'routes', localField: '_id', foreignField: 'route_id', as: 'route' } },
        { $unwind: '$route' },
        {
            $project: {
                _id: 0,
                route_id: '$_id',
                trips: 1,
                route_short_name: '$route.route_short_name',
                route_long_name: '$route.route_long_name',
                route_color: '$route.route_color'
            }
        }
    ]).toArray();
}

// gtfs times can exceed 24h for after-midnight service, so wrap with mod 24
//
export function getDeparturesByHour() {
    return db().collection('stop_times').aggregate([
        {
            $project: {
                hour: {
                    $convert: {
                        input: { $arrayElemAt: [{ $split: ['$departure_time', ':'] }, 0] },
                        to: 'int',
                        onError: -1,
                        onNull: -1
                    }
                }
            }
        },
        { $match: { hour: { $gte: 0 } } },
        { $group: { _id: { $mod: ['$hour', 24] }, departures: { $sum: 1 } } },
        { $sort: { _id: 1 } },
        { $project: { _id: 0, hour: '$_id', departures: 1 } }
    ]).toArray();
}
