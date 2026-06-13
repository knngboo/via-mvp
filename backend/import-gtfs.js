import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import pkg from 'pg';
import csv from 'csvtojson';

const { Pool } = pkg;

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GTFS_DIR = path.join(__dirname, 'google_transit');
const BATCH_SIZE = 5000;



// We only import the 4 tables we actually query to keep it fast and clean
const FILES = {
    'stops.txt': {
        table: 'stops',
        columns: ['stop_id', 'stop_name', 'stop_lat', 'stop_lon', 'location_type', 'wheelchair_boarding'],
        floats: ['stop_lat', 'stop_lon'],
        ints: ['location_type', 'wheelchair_boarding']
    },
    'routes.txt': {
        table: 'routes',
        columns: ['route_id', 'route_short_name', 'route_long_name', 'route_type'],
        floats: [],
        ints: ['route_type']
    },
    'trips.txt': {
        table: 'trips',
        columns: ['trip_id', 'route_id', 'service_id', 'trip_headsign', 'direction_id', 'wheelchair_accessible', 'bikes_allowed'],
        floats: [],
        ints: ['direction_id', 'wheelchair_accessible', 'bikes_allowed']
    },
    'stop_times.txt': {
        table: 'stop_times',
        columns: ['trip_id', 'arrival_time', 'departure_time', 'stop_id', 'stop_sequence', 'pickup_type', 'drop_off_type', 'timepoint'],
        floats: [],
        ints: ['stop_sequence', 'pickup_type', 'drop_off_type', 'timepoint']
    }
};

function castRow(row, { floats, ints }) {
    for (const f of floats) {
        if (row[f] !== undefined && row[f] !== '') row[f] = parseFloat(row[f]);
        else row[f] = null;
    }
    for (const f of ints) {
        if (row[f] !== undefined && row[f] !== '') row[f] = parseInt(row[f], 10);
        else row[f] = null;
    }
    return row;
}

async function importFile(client, fileName, spec) {
    await client.query(`TRUNCATE TABLE ${spec.table} CASCADE;`);
    
    let batch = [];
    let total = 0;

    const flush = async () => {
        if (batch.length === 0) return;
        
        const params = [];
        const valuePlaceholders = [];
        
        let paramIndex = 1;
        for (const row of batch) {
            const rowPlaceholders = [];
            for (const col of spec.columns) {
                params.push(row[col]);
                rowPlaceholders.push(`$${paramIndex++}`);
            }
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        }

        const query = `
            INSERT INTO ${spec.table} (${spec.columns.join(', ')})
            VALUES ${valuePlaceholders.join(', ')}
            ON CONFLICT DO NOTHING;
        `;
        
        await client.query(query, params);
        total += batch.length;
        batch = [];
    };

    await new Promise((resolve, reject) => {
        csv({ trim: true, ignoreEmpty: true })
            .fromFile(path.join(GTFS_DIR, fileName))
            .subscribe(async (row) => {
                castRow(row, spec);
                batch.push(row);
                if (batch.length >= BATCH_SIZE) await flush();
            }, reject, resolve);
    });

    await flush();
    console.log(`${spec.table}: imported ${total} rows`);
}

export async function runImportIfNeeded(pool) {
    const client = await pool.connect();
    try {
        // Check if data already exists
        const res = await client.query("SELECT count(*) FROM stops");
        if (parseInt(res.rows[0].count, 10) > 0) {
            console.log('GTFS data already loaded. Skipping import.');
            return;
        }
        
        console.log('GTFS tables are empty. Starting import from CSV...');
        await client.query('BEGIN');
        
        for (const [fileName, spec] of Object.entries(FILES)) {
            await importFile(client, fileName, spec);
        }

        await client.query('COMMIT');
        console.log('GTFS import complete!');
    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === 'ENOENT') {
            console.log('google_transit folder not found or missing CSVs. Skipping import.');
        } else {
            console.error('GTFS import failed:', err);
        }
    } finally {
        client.release();
    }
}

// Allow running manually via `node import-gtfs.js`
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
    const pool = new Pool({
        user: process.env.POSTGRES_USER || 'admin',
        host: process.env.POSTGRES_HOST || 'localhost',
        database: process.env.POSTGRES_DB || 'via_mvp',
        password: process.env.POSTGRES_PASSWORD || 'admin',
        port: 5432,
    });
    runImportIfNeeded(pool).then(() => pool.end()).catch(console.error);
}
