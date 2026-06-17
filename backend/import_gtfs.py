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
GTFS_SCHEMA = "via"

# Arbitrary key for a Postgres advisory lock that serialises the import across
# gunicorn workers/processes so a first-login race can't double-import.
GTFS_LOCK_KEY = 778899

# DDL for the four GTFS tables we query. Kept here (and mirrored in db/init.sql)
# so the import is self-contained even on a pre-existing database volume that
# predates these tables.
TABLE_DDL = [
    "CREATE SCHEMA IF NOT EXISTS via;",
    """
    CREATE TABLE IF NOT EXISTS via.stops (
        stop_id              TEXT PRIMARY KEY,
        stop_name            TEXT,
        stop_lat             DOUBLE PRECISION,
        stop_lon             DOUBLE PRECISION,
        location_type        INTEGER,
        wheelchair_boarding  INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS via.routes (
        route_id          TEXT PRIMARY KEY,
        route_short_name  TEXT,
        route_long_name   TEXT,
        route_type        INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS via.trips (
        trip_id                TEXT PRIMARY KEY,
        route_id               TEXT,
        service_id             TEXT,
        trip_headsign          TEXT,
        direction_id           INTEGER,
        wheelchair_accessible  INTEGER,
        bikes_allowed          INTEGER
    );
    """,
    """
    CREATE TABLE IF NOT EXISTS via.stop_times (
        trip_id         TEXT,
        arrival_time    TEXT,
        departure_time  TEXT,
        stop_id         TEXT,
        stop_sequence   INTEGER,
        pickup_type     INTEGER,
        drop_off_type   INTEGER,
        timepoint       INTEGER,
        PRIMARY KEY (trip_id, stop_sequence)
    );
    """,
    "CREATE INDEX IF NOT EXISTS idx_via_trips_route_id ON via.trips(route_id);",
    "CREATE INDEX IF NOT EXISTS idx_via_stop_times_stop_id ON via.stop_times(stop_id);",
]

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
    cur.execute("TRUNCATE TABLE {}.{} CASCADE;".format(GTFS_SCHEMA, spec["table"]))

    columns = spec["columns"]
    col_list = ", ".join(columns)
    insert_sql = "INSERT INTO {}.{} ({}) VALUES %s ON CONFLICT DO NOTHING;".format(
        GTFS_SCHEMA, spec["table"], col_list
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


def _ensure_tables(cur):
    for stmt in TABLE_DDL:
        cur.execute(stmt)


def _drop_legacy_public_gtfs(cur):
    """One-time migration: remove old GTFS tables from public schema if they still exist.

    These were previously in public (visible to all tenants). They now live in
    the via schema so Area Foundation users cannot access them.
    Drop order respects FK dependencies: stop_times → trips/stops → routes.
    """
    for table in ("stop_times", "trips", "stops", "routes"):
        cur.execute("DROP TABLE IF EXISTS public.{} CASCADE;".format(table))


def ensure_database_loaded():
    """
    Idempotently load the bundled GTFS feed into Postgres.

    Safe to call on every login: cheap when data already exists, and serialised
    by a Postgres advisory lock so concurrent callers can't double-import. The
    whole operation runs in one transaction, so a failure leaves no partial data.
    """
    try:
        with db.transaction() as cur:
            # Bail out immediately if another worker is already importing.
            cur.execute("SELECT pg_try_advisory_xact_lock(%s) AS locked", (GTFS_LOCK_KEY,))
            if not cur.fetchone()["locked"]:
                print("GTFS import already in progress elsewhere. Skipping.")
                return

            _ensure_tables(cur)
            _drop_legacy_public_gtfs(cur)

            cur.execute("SELECT count(*) AS n FROM via.stops")
            if int(cur.fetchone()["n"]) > 0:
                return  # already loaded — nothing to do

            print("GTFS tables are empty. Starting import from CSV...")
            for file_name, spec in FILES.items():
                _import_file(cur, file_name, spec)
        print("GTFS import complete!")
    except FileNotFoundError:
        print("google_transit folder not found or missing CSVs. Skipping import.")
    except Exception as err:
        print("GTFS import failed:", err)


# Backwards-compatible alias for the original entry-point name.
def run_import_if_needed():
    ensure_database_loaded()


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    # Standalone runs default to localhost rather than the docker 'postgres' host.
    os.environ.setdefault("POSTGRES_HOST", os.environ.get("POSTGRES_HOST", "localhost"))
    db.init_pool()
    ensure_database_loaded()
