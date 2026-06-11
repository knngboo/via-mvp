import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import csv from 'csvtojson';

// load environment variables
//
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GTFS_DIR = path.join(__dirname, 'google_transit');
const BATCH_SIZE = 5000;

// when run on the host (outside docker), fall back to the compose mongo port
//
const mongoURI = process.env.MONGO_URI
    || 'mongodb://via:via_dev_password@localhost:27017/viadata?authSource=admin';

// fields to cast per file; everything else stays a string so ids like
// stop_id and trip_id join cleanly across collections
//
const FILES = {
    'agency.txt': { collection: 'agency', floats: [], ints: [] },
    'calendar.txt': {
        collection: 'calendar',
        floats: [],
        ints: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    'calendar_dates.txt': { collection: 'calendar_dates', floats: [], ints: ['exception_type'] },
    'feed_info.txt': { collection: 'feed_info', floats: [], ints: [] },
    'routes.txt': { collection: 'routes', floats: [], ints: ['route_type'] },
    'shapes.txt': {
        collection: 'shapes',
        floats: ['shape_pt_lat', 'shape_pt_lon', 'shape_dist_traveled'],
        ints: ['shape_pt_sequence']
    },
    'stop_times.txt': {
        collection: 'stop_times',
        floats: ['shape_dist_traveled'],
        ints: ['stop_sequence', 'pickup_type', 'drop_off_type', 'timepoint']
    },
    'stops.txt': {
        collection: 'stops',
        floats: ['stop_lat', 'stop_lon'],
        ints: ['location_type', 'wheelchair_boarding']
    },
    'transfers.txt': { collection: 'transfers', floats: [], ints: ['transfer_type', 'min_transfer_time'] },
    'trips.txt': {
        collection: 'trips',
        floats: [],
        ints: ['direction_id', 'wheelchair_accessible', 'bikes_allowed']
    }
};

function castRow(row, { floats, ints }) {
    for (const f of floats) {
        if (row[f] !== undefined) row[f] = parseFloat(row[f]);
    }
    for (const f of ints) {
        if (row[f] !== undefined) row[f] = parseInt(row[f], 10);
    }
    return row;
}

async function importFile(db, fileName, spec) {
    const coll = db.collection(spec.collection);
    await coll.deleteMany({});

    let batch = [];
    let total = 0;

    const flush = async () => {
        if (batch.length === 0) return;
        await coll.insertMany(batch, { ordered: false });
        total += batch.length;
        batch = [];
    };

    await new Promise((resolve, reject) => {
        csv({ trim: true, ignoreEmpty: true })
            .fromFile(path.join(GTFS_DIR, fileName))
            .subscribe(async (row) => {
                castRow(row, spec);

                // GeoJSON point so stops support $near queries
                //
                if (spec.collection === 'stops' && row.stop_lat !== undefined && row.stop_lon !== undefined) {
                    row.location = { type: 'Point', coordinates: [row.stop_lon, row.stop_lat] };
                }

                batch.push(row);
                if (batch.length >= BATCH_SIZE) await flush();
            }, reject, resolve);
    });

    await flush();
    console.log(`${spec.collection}: imported ${total} documents`);
}

async function createIndexes(db) {
    await db.collection('stops').createIndex({ stop_id: 1 }, { unique: true });
    await db.collection('stops').createIndex({ location: '2dsphere' });
    await db.collection('routes').createIndex({ route_id: 1 }, { unique: true });
    await db.collection('trips').createIndex({ trip_id: 1 }, { unique: true });
    await db.collection('trips').createIndex({ route_id: 1 });
    await db.collection('stop_times').createIndex({ trip_id: 1, stop_sequence: 1 });
    await db.collection('stop_times').createIndex({ stop_id: 1 });
    await db.collection('shapes').createIndex({ shape_id: 1, shape_pt_sequence: 1 });
    await db.collection('calendar').createIndex({ service_id: 1 });
    await db.collection('calendar_dates').createIndex({ service_id: 1 });
    console.log('indexes created');
}

async function main() {
    await mongoose.connect(mongoURI);
    console.log('MongoDB Connected');
    const db = mongoose.connection.db;

    for (const [fileName, spec] of Object.entries(FILES)) {
        await importFile(db, fileName, spec);
    }

    await createIndexes(db);
    await mongoose.disconnect();
    console.log('GTFS import complete');
}

main().catch((err) => {
    console.error('GTFS import failed:', err);
    process.exit(1);
});
