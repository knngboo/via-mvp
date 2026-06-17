"""
GTFS / dashboard stats endpoints (port of stats.js).

All routes degrade gracefully — they return zeros / empty lists rather than
500s when the GTFS tables haven't been loaded yet.
"""

from flask import Blueprint, jsonify, request

import db


def _safe_count(table_name, schema="public"):
    """Return row count, or 0 if the table doesn't exist / can't be queried."""
    try:
        exists = db.query(
            "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = %s AND tablename = %s",
            (schema, table_name),
        )
        if not exists:
            return 0
        res = db.query('SELECT COUNT(*)::int AS n FROM "{}"."{}"'.format(schema, table_name))
        return res[0]["n"]
    except Exception:
        return 0


def create_stats_blueprint():
    bp = Blueprint("stats", __name__)

    # 1. Dashboard summary counts
    @bp.route("", methods=["GET"])
    @bp.route("/", methods=["GET"])
    def summary():
        try:
            routes = _safe_count("routes", "via")
            stops = _safe_count("stops", "via")
            trips = _safe_count("trips", "via")
            stop_times = _safe_count("stop_times", "via")
            sources = _safe_count("sources_meta", "bfi")
            return jsonify({
                "routes": routes,
                "stops": stops,
                "trips": trips,
                "stop_times": stop_times,
                "sources": sources,
                "shapes": 0,
                "feed": None,
            })
        except Exception as error:
            print("Stats Error:", error)
            return jsonify({"error": "Failed to fetch stats"}), 500

    # 2. Busiest routes (returns [] if GTFS not loaded)
    @bp.route("/trips-per-route", methods=["GET"])
    def trips_per_route():
        try:
            exists = db.query(
                "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'via' AND tablename = 'routes'"
            )
            if not exists:
                return jsonify([])

            try:
                limit = min(int(request.args.get("limit", 10)), 50)
            except (TypeError, ValueError):
                limit = 10

            rows = db.query(
                """
                SELECT
                    r.route_id,
                    r.route_short_name,
                    r.route_long_name,
                    COUNT(t.trip_id)::int AS trips
                FROM via.routes r
                JOIN via.trips t ON r.route_id = t.route_id
                GROUP BY r.route_id, r.route_short_name, r.route_long_name
                ORDER BY trips DESC
                LIMIT %s;
                """,
                (limit,),
            )
            return jsonify(rows)
        except Exception as error:
            print("Stats Error:", error)
            return jsonify([])

    # 3. Departures by hour (returns [] if GTFS not loaded)
    @bp.route("/departures-by-hour", methods=["GET"])
    def departures_by_hour():
        try:
            exists = db.query(
                "SELECT 1 FROM pg_catalog.pg_tables WHERE schemaname = 'via' AND tablename = 'stop_times'"
            )
            if not exists:
                return jsonify([])

            rows = db.query(
                """
                SELECT
                    (CAST(SPLIT_PART(departure_time, ':', 1) AS INTEGER) % 24) AS hour,
                    COUNT(*)::int AS departures
                FROM via.stop_times
                WHERE departure_time IS NOT NULL AND departure_time != ''
                GROUP BY hour
                ORDER BY hour ASC;
                """
            )
            return jsonify(rows)
        except Exception as error:
            print("Stats Error:", error)
            return jsonify([])

    return bp
