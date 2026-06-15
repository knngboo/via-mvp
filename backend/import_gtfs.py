"""
GTFS importer (port of import-gtfs.js).

Loads the four GTFS tables we actually query (stops, routes, trips, stop_times)
from backend/google_transit/*.txt into Postgres. Idempotent: skips the import
when the `stops` table already has rows.

Run manually:
    python import_gtfs.py
"""

import csv
import os

from psycopg2.extras import execute_values

import db

GTFS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "google_transit")
BATCH_SIZE = 5000

# We only import the 4 tables we actually query to keep it fast and clean
FILES = {
    "stops.txt": {
        "table": "stops",
        "columns": ["stop_id", "stop_name", "stop_lat", "stop_lon", "location_type", "wheelchair_boarding"],
        "floats": ["stop_lat", "stop_lon"],
        "ints": ["location_type", "wheelchair_boarding"],
    },
    "routes.txt": {
        "table": "routes",
        "columns": ["route_id", "route_short_name", "route_long_name", "route_type"],
        "floats": [],
        "ints": ["route_type"],
    },
    "trips.txt": {
        "table": "trips",
        "columns": ["trip_id", "route_id", "service_id", "trip_headsign", "direction_id", "wheelchair_accessible", "bikes_allowed"],
        "floats": [],
        "ints": ["direction_id", "wheelchair_accessible", "bikes_allowed"],
    },
    "stop_times.txt": {
        "table": "stop_times",
        "columns": ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence", "pickup_type", "drop_off_type", "timepoint"],
        "floats": [],
        "ints": ["stop_sequence", "pickup_type", "drop_off_type", "timepoint"],
    },
}


def _cast_row(row, spec):
    for f in spec["floats"]:
        val = row.get(f)
        row[f] = float(val) if val not in (None, "") else None
    for f in spec["ints"]:
        val = row.get(f)
        try:
            row[f] = int(val) if val not in (None, "") else None
        except (TypeError, ValueError):
            row[f] = None
    return row


def _import_file(cur, file_name, spec):
    cur.execute("TRUNCATE TABLE {} CASCADE;".format(spec["table"]))

    columns = spec["columns"]
    col_list = ", ".join(columns)
    insert_sql = "INSERT INTO {} ({}) VALUES %s ON CONFLICT DO NOTHING;".format(
        spec["table"], col_list
    )

    path = os.path.join(GTFS_DIR, file_name)
    total = 0
    batch = []

    def flush():
        nonlocal total, batch
        if not batch:
            return
        values = [tuple(r.get(c) for c in columns) for r in batch]
        execute_values(cur, insert_sql, values)
        total += len(batch)
        batch = []

    with open(path, "r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh)
        for raw in reader:
            row = {k: (v.strip() if isinstance(v, str) else v) for k, v in raw.items()}
            if all((v is None or v == "") for v in row.values()):
                continue  # ignoreEmpty
            _cast_row(row, spec)
            batch.append(row)
            if len(batch) >= BATCH_SIZE:
                flush()
    flush()
    print("{}: imported {} rows".format(spec["table"], total))


def run_import_if_needed():
    try:
        existing = db.query("SELECT count(*) AS n FROM stops")
        if int(existing[0]["n"]) > 0:
            print("GTFS data already loaded. Skipping import.")
            return
    except Exception:
        # `stops` may not exist yet — fall through and attempt the import
        pass

    print("GTFS tables are empty. Starting import from CSV...")
    try:
        with db.transaction() as cur:
            for file_name, spec in FILES.items():
                _import_file(cur, file_name, spec)
        print("GTFS import complete!")
    except FileNotFoundError:
        print("google_transit folder not found or missing CSVs. Skipping import.")
    except Exception as err:
        print("GTFS import failed:", err)


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    # Standalone runs default to localhost rather than the docker 'postgres' host.
    os.environ.setdefault("POSTGRES_HOST", os.environ.get("POSTGRES_HOST", "localhost"))
    db.init_pool()
    run_import_if_needed()
