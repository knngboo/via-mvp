"""
Buffi — OpenAI tool-calling agent (port of openai.js).

Flow:
  1. build a schema context from information_schema (so the model can write SQL)
  2. run a non-streaming tool-calling loop (run_query / predict_route_ridership)
  3. once the model returns plain text, stream the final answer to the client as SSE

The route layer (app.py) calls `prepare_chat()` first (blocking, may raise
MaxToolRoundsError), then wraps `stream_openai()` in a Flask streaming Response.
"""

import json
import math
import os
from datetime import date, datetime, timedelta

import requests

import census
import db
import realtime

# Column-name candidates (lowercased) used to auto-detect coordinates in the
# result of a plot_on_map query.
LAT_KEYS = ("latitude", "lat", "stop_lat", "y")
LON_KEYS = ("longitude", "lon", "lng", "long", "stop_lon", "x")
NAME_KEYS = ("name", "stop_name", "label", "title", "route_long_name", "route_short_name")
MAX_MAP_POINTS = 500

DEFAULT_MODEL = "gpt-4o-mini"
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
MAX_TOOL_ROUNDS = 6
MAX_ROWS = 200


class MaxToolRoundsError(Exception):
    """Raised when the tool-calling loop exceeds MAX_TOOL_ROUNDS."""


# ---------------------------------------------------------------------------
# Schema context builder
# ---------------------------------------------------------------------------
def build_schema_context(tenant):
    try:
        schemas_to_show = [s for s in ["public", tenant] if s]

        tables = db.query(
            """
            SELECT table_schema, table_name
            FROM information_schema.tables
            WHERE table_schema = ANY(%s)
              AND table_type = 'BASE TABLE'
              AND table_name NOT IN ('schema_migrations', 'sources_meta',
                                     'users', 'chat_messages', 'feedback',
                                     'tenant_plugins')
            ORDER BY table_schema, table_name;
            """,
            (schemas_to_show,),
        )

        # Only include tables that actually have rows.
        non_empty = []
        for t in tables or []:
            try:
                count = db.query(
                    'SELECT COUNT(*) AS n FROM "{}"."{}"'.format(
                        t["table_schema"], t["table_name"]
                    )
                )
                if int(count[0]["n"]) > 0:
                    non_empty.append(t)
            except Exception:
                pass

        cols = db.query(
            """
            SELECT table_schema, table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = ANY(%s)
            ORDER BY table_schema, table_name, ordinal_position;
            """,
            (schemas_to_show,),
        )

        col_map = {}
        for row in cols:
            key = "{}.{}".format(row["table_schema"], row["table_name"])
            col_map.setdefault(key, []).append(
                "{}:{}".format(row["column_name"], row["data_type"])
            )

        lines = [
            "DATABASE SCHEMA (use fully-qualified names in SQL, e.g. public.stops or bfi.my_upload):"
        ]
        if non_empty:
            for t in non_empty:
                key = "{}.{}".format(t["table_schema"], t["table_name"])
                lines.append("  {}({})".format(key, ", ".join(col_map.get(key, []))))
        else:
            lines.append("  (No data tables with rows found)")

        # Append uploaded-source catalogue from sources_meta so the model knows
        # exactly which CSV files the user has loaded and their table names.
        try:
            uploads = db.query(
                """
                SELECT name, table_name, num_rows, columns, uploaded_at
                FROM bfi.sources_meta
                ORDER BY uploaded_at DESC
                LIMIT 20;
                """
            )
            if uploads:
                lines.append("")
                lines.append("UPLOADED DATASETS (query via tenant schema — use list_data_sources tool for details):")
                for u in uploads:
                    col_names = u.get("columns") or []
                    col_preview = ", ".join(col_names[:8])
                    if len(col_names) > 8:
                        col_preview += " ..."
                    lines.append(
                        "  {schema}.{table}  [{rows} rows]  columns: {cols}  (from: {name})".format(
                            schema=tenant,
                            table=u["table_name"],
                            rows=u["num_rows"] or "?",
                            cols=col_preview or "unknown",
                            name=u["name"],
                        )
                    )
        except Exception:
            pass

        return "\n".join(lines)
    except Exception:
        return "DATABASE: Schema unavailable."



# ---------------------------------------------------------------------------
# System prompt (static part — schema appended dynamically per request)
# ---------------------------------------------------------------------------
SYSTEM_PROMPT_BASE = """You are Buffi, an AI data assistant for BFI's transit analytics platform.

You answer questions about transit data and any data the agency has uploaded.

TOOLS AVAILABLE:
- run_query  → Write and run any read-only SQL SELECT against the database. Use this for nearly all data questions.
- list_data_sources → List all datasets available to the user: uploaded CSVs (tenant schema) and built-in public GTFS/transit tables. ALWAYS call this when the user asks what data is available, what they uploaded, or what sources/tables exist.
- predict_route_ridership → Forecast future ridership using linear regression on historical data.
- make_chart → Build a bar, pie, or radar chart from a SQL query. Use whenever the answer is best shown as a graph (rankings, distributions, counts, comparisons, trends).
- plot_on_map → Plot geographic points on the San Antonio map. Give it a SELECT returning latitude/longitude columns (e.g. stop_lat/stop_lon from public.stops). Use whenever the user asks to see, show, map, or locate things geographically.
- show_live_buses → Plot VIA's live vehicle positions on the map. Use when the user asks where buses are right now.
- show_heatmap → Display a US Census ACS demographic heat map of San Antonio ZIP codes. Use for demographics, income, poverty, or census statistics.
- get_service_alerts → Read VIA's current real-time service alerts (detours, delays).
- get_trip_updates → Read VIA's real-time trip updates (per-trip arrival/departure delays).

ANALYTICS & CHARTS:
- When the user asks to analyze, compare, rank, break down, or chart data, call make_chart with a SELECT returning one label column (x) and one numeric column (y).
- Choose chart_type: 'bar' for rankings/counts/comparisons, 'pie' for share-of-total, 'radar' for multi-metric profiles. Default to 'bar'.
- Keep charts to ~15 rows max (use ORDER BY ... LIMIT). Always explain the insight in your text answer.

MAPPING:
- When a question is geographic ("where", "show me on a map", "locations of", "nearest"), prefer plot_on_map or show_live_buses.
- plot_on_map SQL MUST return latitude/longitude columns. Include a name column when possible and keep results under ~500 rows.

SAN ANTONIO ZIP CODE CENTROIDS — use these lat/lon in haversine queries when the user mentions a ZIP code:
  78201:(29.4436,-98.5396)  78202:(29.4177,-98.4785)  78203:(29.4119,-98.4680)
  78204:(29.4127,-98.5079)  78205:(29.4241,-98.4936)  78206:(29.4380,-98.4640)
  78207:(29.4258,-98.5287)  78208:(29.4383,-98.4537)  78209:(29.4773,-98.4537)
  78210:(29.3963,-98.4785)  78211:(29.3608,-98.5396)  78212:(29.4594,-98.4936)
  78213:(29.5193,-98.5396)  78214:(29.3610,-98.4785)  78215:(29.4465,-98.4683)
  78216:(29.5415,-98.4936)  78217:(29.5415,-98.4537)  78218:(29.4913,-98.4339)
  78219:(29.4594,-98.4041)  78220:(29.4258,-98.4041)  78221:(29.3274,-98.4785)
  78222:(29.3916,-98.3942)  78223:(29.3497,-98.4339)  78224:(29.3274,-98.5190)
  78225:(29.3963,-98.5190)  78226:(29.3821,-98.5396)  78227:(29.3821,-98.5991)
  78228:(29.4436,-98.5991)  78229:(29.5050,-98.5793)  78230:(29.5415,-98.5793)
  78231:(29.5720,-98.5793)  78232:(29.5915,-98.4936)  78233:(29.5693,-98.3942)
  78237:(29.4119,-98.5991)  78238:(29.4773,-98.5991)  78240:(29.5415,-98.6190)
  78247:(29.6070,-98.4339)  78248:(29.6070,-98.5396)  78249:(29.5720,-98.6190)
  78250:(29.5193,-98.6586)  78251:(29.4913,-98.6586)  78253:(29.4594,-98.7376)
  78254:(29.5193,-98.7180)  78258:(29.6515,-98.4936)  78259:(29.6515,-98.4339)

Example haversine for "stops near 78205":
  SELECT stop_id, stop_name, stop_lat, stop_lon,
    (3959 * acos(cos(radians(29.4241))*cos(radians(stop_lat))*cos(radians(stop_lon)-radians(-98.4936))+sin(radians(29.4241))*sin(radians(stop_lat)))) AS dist_miles
  FROM public.stops
  WHERE stop_lat IS NOT NULL
  ORDER BY dist_miles
  LIMIT 20;

HOW TO USE run_query:
- Write valid PostgreSQL SELECT statements only.
- Use fully-qualified table names (e.g. public.stops, bfi.my_upload).
- You may JOIN across tables freely.
- If the user asks about uploaded data, check the UPLOADED DATASETS section of the schema context for the exact table name.

RULES:
- ALWAYS use run_query for data questions. Never say "no data available" without trying a query first.
- Never ask the user to upload a file if a query can answer the question.
- When the user asks what datasets/sources are available, ALWAYS call list_data_sources first.
- If a query returns no rows, say so and suggest why.
- Answer concisely. Use Markdown tables for structured results.
- Do not expose raw SQL errors — summarize what went wrong plainly."""


# ---------------------------------------------------------------------------
# Tools
# ---------------------------------------------------------------------------
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_query",
            "description": "Execute a read-only SQL SELECT query against the database. Use this for any question about transit data, uploaded files, schedules, stops, routes, or any analytical question answerable with SQL.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "A valid PostgreSQL SELECT statement. Must start with SELECT. No mutations (INSERT/UPDATE/DELETE/DROP) allowed.",
                    }
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_data_sources",
            "description": "List all datasets available to the user: uploaded CSV files in the tenant schema plus built-in public GTFS/transit tables. Use whenever the user asks what data is available, what they uploaded, or what tables/sources exist.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "make_chart",
            "description": "Render a chart (bar/pie/radar) from a read-only SELECT. The query should return a label column and a numeric value column.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "A PostgreSQL SELECT returning a label column and a numeric value column. Must start with SELECT.",
                    },
                    "x": {
                        "type": "string",
                        "description": "Column name for the category/label axis (e.g. route_short_name).",
                    },
                    "y": {
                        "type": "string",
                        "description": "Column name for the numeric value (e.g. trips).",
                    },
                    "chart_type": {
                        "type": "string",
                        "enum": ["bar", "pie", "radar"],
                        "description": "Chart style. Default 'bar'.",
                    },
                    "title": {
                        "type": "string",
                        "description": "A short chart title.",
                    },
                },
                "required": ["sql", "x", "y"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "plot_on_map",
            "description": "Plot geographic points on the San Antonio map. Provide a read-only SELECT that returns latitude and longitude columns (e.g. stop_lat, stop_lon). Optionally include a name column for labels.",
            "parameters": {
                "type": "object",
                "properties": {
                    "sql": {
                        "type": "string",
                        "description": "A PostgreSQL SELECT returning at least latitude and longitude columns (lat/lon/stop_lat/stop_lon accepted). Must start with SELECT.",
                    },
                    "title": {
                        "type": "string",
                        "description": "A short title for the map, e.g. 'Stops near downtown'.",
                    },
                },
                "required": ["sql"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_live_buses",
            "description": "Plot VIA's live (real-time) vehicle positions on the map. Optionally filter to a single route_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "route_id": {
                        "type": "string",
                        "description": "Optional GTFS route_id to filter to (e.g. '100'). Omit to show all buses.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "show_heatmap",
            "description": "Show a US Census ACS demographic heat map of San Antonio ZIP codes. Choose which statistic to color by.",
            "parameters": {
                "type": "object",
                "properties": {
                    "statistic": {
                        "type": "string",
                        "enum": census.STAT_IDS,
                        "description": "Which census statistic to display: " + ", ".join(census.STAT_IDS) + ".",
                    },
                },
                "required": ["statistic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_service_alerts",
            "description": "Read VIA's current real-time service alerts (detours, delays, disruptions).",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_trip_updates",
            "description": "Read VIA's real-time trip updates — per-trip arrival/departure delays (schedule adherence). Optionally filter to a single route_id.",
            "parameters": {
                "type": "object",
                "properties": {
                    "route_id": {
                        "type": "string",
                        "description": "Optional GTFS route_id to filter to (e.g. '100'). Omit for all trips.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "predict_route_ridership",
            "description": "Forecast short-term and long-term route-level ridership using linear regression on historical data. Use only when the user asks to forecast or predict future ridership.",
            "parameters": {
                "type": "object",
                "properties": {
                    "table_name": {"type": "string", "description": "The name of the historical APC data table (without schema prefix)."},
                    "route_id_column": {"type": "string", "description": "The column containing route IDs."},
                    "route_id_value": {"type": "string", "description": "The specific route to forecast."},
                    "date_column": {"type": "string", "description": "The column containing dates."},
                    "ridership_column": {"type": "string", "description": "The column containing passenger counts."},
                    "days_to_forecast": {"type": "integer", "description": "Number of days into the future to forecast."},
                },
                "required": ["table_name", "route_id_column", "route_id_value", "date_column", "ridership_column", "days_to_forecast"],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# SQL safety guard — only allows SELECT statements
# ---------------------------------------------------------------------------
BLOCKED_KEYWORDS = [
    "INSERT", "UPDATE", "DELETE", "DROP", "CREATE", "ALTER",
    "TRUNCATE", "GRANT", "REVOKE", "EXECUTE", "EXEC", "COPY",
    "PERFORM", "DO ", "CALL",
]


def is_safe_select(sql):
    normalized = " ".join(sql.strip().split()).upper()
    if not normalized.startswith("SELECT"):
        return False
    for kw in BLOCKED_KEYWORDS:
        if kw in normalized:
            return False
    # Disallow system schema access
    if "PG_CATALOG" in normalized or "INFORMATION_SCHEMA" in normalized:
        return False
    return True


# ---------------------------------------------------------------------------
# Map helpers
# ---------------------------------------------------------------------------
def _run_readonly_select(tenant, sql):
    """Execute a guarded read-only SELECT; returns (rows, error_str)."""
    if not is_safe_select(sql):
        return None, "Only read-only SELECT statements are allowed. The query was rejected."
    try:
        with db.transaction() as cur:
            cur.execute("SET TRANSACTION READ ONLY")
            cur.execute('SET LOCAL search_path TO public, "{}"'.format(tenant))
            cur.execute(sql)
            rows = cur.fetchall() if cur.description else []
        return rows, None
    except Exception as e:
        return None, "Query failed: {}".format(e)


def _find_key(keys_present, candidates):
    lowered = {k.lower(): k for k in keys_present}
    for cand in candidates:
        if cand in lowered:
            return lowered[cand]
    return None


def _rows_to_map_points(rows):
    """Detect lat/lon (and an optional name) columns and build MapView points.

    Returns None when no coordinate columns are present, [] when present but
    no row had valid numeric coordinates.
    """
    if not rows:
        return []
    keys = list(rows[0].keys())
    lat_key = _find_key(keys, LAT_KEYS)
    lon_key = _find_key(keys, LON_KEYS)
    if not lat_key or not lon_key:
        return None
    name_key = _find_key(keys, NAME_KEYS)

    points = []
    for r in rows[:MAX_MAP_POINTS]:
        try:
            lat = float(r[lat_key])
            lon = float(r[lon_key])
        except (TypeError, ValueError):
            continue
        point = {"Latitude": lat, "Longitude": lon, "color": "#CB2128", "marker_radius": 6}
        if name_key and r.get(name_key) is not None:
            point["name"] = str(r[name_key])
        # Carry extra scalar columns through for the data table / popups.
        for k, v in r.items():
            if k in (lat_key, lon_key, name_key):
                continue
            if isinstance(v, (str, int, float, bool)) or v is None:
                point.setdefault(k, v)
        points.append(point)
    return points


# ---------------------------------------------------------------------------
# Tool executor
# ---------------------------------------------------------------------------
def run_tool(tenant, name, args, viz=None):
    # ── run_query ──────────────────────────────────────────────────────────
    if name == "run_query":
        sql = (args.get("sql") or "").strip()
        rows, err = _run_readonly_select(tenant, sql)
        if err:
            return {"error": err}
        return {
            "row_count": len(rows),
            "truncated": len(rows) > MAX_ROWS,
            "data": rows[:MAX_ROWS],
        }

    # ── list_data_sources ──────────────────────────────────────────────────
    if name == "list_data_sources":
        sources = []
        # 1. Uploaded CSV files from sources_meta
        try:
            uploads = db.query(
                """
                SELECT name, table_name, num_rows, columns, uploaded_at, visibility
                FROM bfi.sources_meta
                ORDER BY uploaded_at DESC
                LIMIT 50;
                """
            )
            for u in uploads:
                col_names = u.get("columns") or []
                sources.append({
                    "type": "upload",
                    "name": u["name"],
                    "table": "{}.{}".format(tenant, u["table_name"]),
                    "rows": u["num_rows"],
                    "columns": col_names[:20],
                    "uploaded_at": u["uploaded_at"].isoformat() if u.get("uploaded_at") else None,
                    "visibility": u.get("visibility", "private"),
                })
        except Exception as e:
            sources.append({"type": "upload", "error": "Could not read uploads: {}".format(e)})

        # 2. Built-in public GTFS tables (only those with rows)
        gtfs_tables = ["stops", "routes", "trips", "stop_times", "calendar",
                       "calendar_dates", "shapes", "fare_attributes", "fare_rules"]
        gtfs_available = []
        for tbl in gtfs_tables:
            try:
                r = db.query('SELECT COUNT(*) AS n FROM public."{}"'.format(tbl))
                if r and int(r[0]["n"]) > 0:
                    gtfs_available.append(tbl)
            except Exception:
                pass
        if gtfs_available:
            sources.append({
                "type": "gtfs",
                "name": "VIA Metropolitan Transit GTFS",
                "tables": ["public.{}".format(t) for t in gtfs_available],
                "description": "Fixed-route transit schedules: stops, routes, trips, stop_times, shapes, calendar",
            })

        return {
            "total_sources": len(sources),
            "sources": sources,
            "note": "Use the 'table' field as the fully-qualified table name in SQL queries.",
        }

    # ── make_chart ─────────────────────────────────────────────────────────
    if name == "make_chart":
        sql = (args.get("sql") or "").strip()
        rows, err = _run_readonly_select(tenant, sql)
        if err:
            return {"error": err}
        if not rows:
            return {"charted": 0, "note": "The query returned no rows to chart."}
        x = args.get("x")
        y = args.get("y")
        cols = list(rows[0].keys())
        if x not in cols or y not in cols:
            return {"error": "x ('{}') and y ('{}') must both be columns in the result ({}).".format(x, y, cols)}
        chart_type = args.get("chart_type") if args.get("chart_type") in ("bar", "pie", "radar") else "bar"
        # Coerce the value column to numbers so the chart renders.
        data = []
        for r in rows[:50]:
            row = dict(r)
            try:
                row[y] = float(row[y])
            except (TypeError, ValueError):
                continue
            data.append(row)
        if not data:
            return {"error": "The y column '{}' is not numeric.".format(y)}
        chart_data = {
            "title": args.get("title") or "Chart",
            "xKey": x,
            "yKey": y,
            "data": data,
        }
        if viz is not None:
            viz["chart"] = {"chartData": chart_data, "chartType": chart_type}
        return {"charted": len(data), "chart_type": chart_type, "title": chart_data["title"],
                "note": "A {} chart is now shown to the user.".format(chart_type)}

    # ── plot_on_map ────────────────────────────────────────────────────────
    if name == "plot_on_map":
        sql = (args.get("sql") or "").strip()
        rows, err = _run_readonly_select(tenant, sql)
        if err:
            return {"error": err}
        points = _rows_to_map_points(rows)
        if points is None:
            return {"error": "The query returned no latitude/longitude columns. Include lat/lon (e.g. stop_lat, stop_lon)."}
        if not points:
            return {"plotted": 0, "note": "No mappable rows were returned."}
        if viz is not None:
            viz["map"] = {"points": points, "title": args.get("title") or "Map"}
        return {"plotted": len(points), "title": args.get("title") or "Map",
                "note": "Points are now shown on the map for the user."}

    # ── show_live_buses ────────────────────────────────────────────────────
    if name == "show_live_buses":
        try:
            vehicles = realtime.get_vehicle_positions()
        except Exception as e:
            return {"error": "Could not read the live vehicle feed: {}".format(e)}
        route_filter = (args.get("route_id") or "").strip()
        if route_filter:
            vehicles = [v for v in vehicles if str(v.get("route_id")) == route_filter]
        points = realtime.vehicles_as_map_points(vehicles)
        title = "Live buses" + (" — route {}".format(route_filter) if route_filter else "")
        if viz is not None and points:
            # live=True tells the frontend to keep polling and auto-refresh markers.
            viz["map"] = {"points": points, "title": title, "live": True, "route_id": route_filter or None}
        return {
            "vehicle_count": len(points),
            "title": title,
            "note": "Live vehicle positions are now shown on the map (auto-refreshing)." if points else "No live vehicles found.",
        }

    # ── show_heatmap ───────────────────────────────────────────────────────
    if name == "show_heatmap":
        stat = (args.get("statistic") or "").strip()
        if stat not in census.STAT_IDS:
            return {"error": "Unknown statistic '{}'. Choose one of: {}.".format(stat, ", ".join(census.STAT_IDS))}
        label = census.stat_label(stat)
        if viz is not None:
            viz["map"] = {"points": [], "heatmap": stat, "title": "{} — San Antonio".format(label)}
        return {"heatmap": stat, "title": label,
                "note": "A census heat map of {} is now shown on the map.".format(label)}

    # ── get_service_alerts ─────────────────────────────────────────────────
    if name == "get_service_alerts":
        try:
            alerts = realtime.get_service_alerts()
        except Exception as e:
            return {"error": "Could not read the alerts feed: {}".format(e)}
        return {"alert_count": len(alerts), "alerts": alerts[:25]}

    # ── get_trip_updates ───────────────────────────────────────────────────
    if name == "get_trip_updates":
        try:
            updates = realtime.get_trip_updates()
        except Exception as e:
            return {"error": "Could not read the trip updates feed: {}".format(e)}
        route_filter = (args.get("route_id") or "").strip()
        if route_filter:
            updates = [u for u in updates if str(u.get("route_id")) == route_filter]

        # Summarise delays per trip so the response stays compact for the model.
        summary = []
        all_delays = []
        for u in updates:
            delays = [s["departure_delay"] for s in u["stop_time_updates"]
                      if s.get("departure_delay") is not None]
            all_delays.extend(delays)
            summary.append({
                "trip_id": u["trip_id"],
                "route_id": u["route_id"],
                "max_departure_delay_sec": max(delays) if delays else None,
                "stops_reported": len(u["stop_time_updates"]),
            })
        summary.sort(key=lambda s: (s["max_departure_delay_sec"] or 0), reverse=True)
        avg_delay = round(sum(all_delays) / len(all_delays)) if all_delays else None
        return {
            "trip_count": len(updates),
            "avg_departure_delay_sec": avg_delay,
            "most_delayed": summary[:15],
        }

    # ── predict_route_ridership ────────────────────────────────────────────
    if name == "predict_route_ridership":
        table_name = args.get("table_name")
        route_id_column = args.get("route_id_column")
        route_id_value = args.get("route_id_value")
        date_column = args.get("date_column")
        ridership_column = args.get("ridership_column")
        days_to_forecast = args.get("days_to_forecast")

        # Whitelist table against actual schema
        valid_tables = db.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = %s;",
            (tenant,),
        )
        if not any(r["table_name"] == table_name for r in valid_tables):
            return {"error": "Table '{}' does not exist in your schema.".format(table_name)}

        col_rows = db.query(
            """
            SELECT column_name FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s AND column_name = ANY(%s);
            """,
            (tenant, table_name, [route_id_column, date_column, ridership_column]),
        )
        valid_cols = {r["column_name"] for r in col_rows}
        for col in (route_id_column, date_column, ridership_column):
            if col not in valid_cols:
                return {"error": "Column '{}' not found in '{}'. Inspect the table first.".format(col, table_name)}

        try:
            safe_days = max(1, min(365, int(days_to_forecast)))
        except (TypeError, ValueError):
            safe_days = 30

        try:
            sql = (
                'SELECT CAST("{date}" AS DATE) AS date_val, '
                'CAST("{ride}" AS NUMERIC) AS count_val '
                'FROM {schema}."{table}" '
                'WHERE "{route}" = %s '
                'ORDER BY date_val ASC;'
            ).format(
                date=date_column, ride=ridership_column,
                schema=tenant, table=table_name, route=route_id_column,
            )
            raw = db.query(sql, (route_id_value,))

            rows = [
                r for r in raw
                if r["date_val"] is not None and r["count_val"] is not None
            ]

            if len(rows) < 2:
                return {"error": "Not enough valid historical data to perform forecasting."}

            n = len(rows)
            sum_x = sum_y = sum_xy = sum_xx = 0.0
            for i, r in enumerate(rows):
                x, y = i, float(r["count_val"])
                sum_x += x
                sum_y += y
                sum_xy += x * y
                sum_xx += x * x

            denom = n * sum_xx - sum_x * sum_x
            if denom == 0:
                return {"error": "Cannot compute regression: all data points have identical indices."}

            m = (n * sum_xy - sum_x * sum_y) / denom
            b = (sum_y - m * sum_x) / n

            last = rows[n - 1]["date_val"]
            if isinstance(last, datetime):
                last = last.date()
            elif not isinstance(last, date):
                last = datetime.fromisoformat(str(last)).date()

            forecast = []
            for i in range(1, safe_days + 1):
                next_y = max(0, round(m * (n - 1 + i) + b))
                forecast_date = last + timedelta(days=i)
                forecast.append({
                    "date": forecast_date.isoformat(),
                    "predicted_ridership": next_y,
                })

            return {
                "message": "Forecast using linear regression over {} data points. Trend: {} by {:.2f} riders/day.".format(
                    n, "increasing" if m > 0 else "decreasing", abs(m)
                ),
                "historical_data_points": n,
                "forecast": forecast,
            }
        except Exception as e:
            return {"error": "Forecasting failed: {}".format(e)}

    return {"error": "Unknown tool: {}".format(name)}


# ---------------------------------------------------------------------------
# OpenAI API helpers
# ---------------------------------------------------------------------------
def _json_default(o):
    """Make psycopg2 Decimal / date / datetime values JSON-serialisable."""
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    return str(o)


def _resolve_key(api_key):
    """Prefer a per-request (user-supplied) key, fall back to the server env var."""
    key = (api_key or "").strip() or os.environ.get("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("No OpenAI API key available (set one in Settings or configure OPENAI_API_KEY).")
    return key


def call_openai(messages, model=DEFAULT_MODEL, api_key=None):
    """Non-streaming call — used for tool-calling rounds. Returns the message dict."""
    api_key = _resolve_key(api_key)

    res = requests.post(
        OPENAI_URL,
        headers={"Content-Type": "application/json", "Authorization": "Bearer {}".format(api_key)},
        json={"model": model, "messages": messages, "tools": TOOLS, "stream": False},
        timeout=120,
    )
    if not res.ok:
        raise RuntimeError("OpenAI request failed: {} — {}".format(res.status_code, res.text[:200]))

    data = res.json()
    return data.get("choices", [{}])[0].get("message")


def stream_openai(messages, model=DEFAULT_MODEL, api_key=None):
    """
    Generator yielding raw OpenAI SSE bytes for the final text response.
    Passes messages WITHOUT tools so the model can only return text.
    """
    api_key = _resolve_key(api_key)

    res = requests.post(
        OPENAI_URL,
        headers={"Content-Type": "application/json", "Authorization": "Bearer {}".format(api_key)},
        json={"model": model, "messages": messages, "stream": True},
        stream=True,
        timeout=300,
    )
    if not res.ok:
        body = res.text[:200]
        raise RuntimeError("OpenAI stream failed: {} — {}".format(res.status_code, body))

    try:
        for chunk in res.iter_content(chunk_size=1024):
            if chunk:
                yield chunk
    finally:
        res.close()


# ---------------------------------------------------------------------------
# Main entry point — runs the tool loop, returns messages ready to stream
# ---------------------------------------------------------------------------
def prepare_chat(user_message, history=None, tenant="bfi", model=DEFAULT_MODEL, api_key=None, plugin_context=""):
    """
    Build context and run the (non-streaming) tool-calling loop.

    Returns a tuple (messages, viz):
      - messages : the message list to stream the final answer from
      - viz      : dict that may contain "map" ({points, title, live?, route_id?})
                   and/or "chart" ({chartData, chartType}) for the frontend to
                   render. Empty dict if no visualization was produced.

    Raises MaxToolRoundsError if the model never settles on a text answer.
    `api_key`, when provided, is a user-supplied key that overrides the env var.
    `plugin_context`, when provided, is the agency context string from the active
    frontend plugin manifest — prepended to the system prompt so Buffi knows
    which agency it is serving before reading the schema.
    """
    schema_context = build_schema_context(tenant)

    # Build the system prompt:
    #   [plugin agency context] → [base Buffi instructions] → [schema context]
    prompt_parts = [SYSTEM_PROMPT_BASE]
    if plugin_context:
        prompt_parts = ["CURRENT AGENCY CONTEXT (from the active plugin):\n" + plugin_context, SYSTEM_PROMPT_BASE]
    system_prompt = "{}\n\n{}".format("\n\n".join(prompt_parts), schema_context)

    messages = [{"role": "system", "content": system_prompt}]
    for m in history or []:
        if not m or not m.get("text"):
            continue
        role = "user" if m.get("from") == "user" else "assistant"
        messages.append({"role": role, "content": m["text"]})
    messages.append({"role": "user", "content": user_message})


    # Map/chart tools write their output here; the latest result of each wins.
    viz = {}

    for _ in range(MAX_TOOL_ROUNDS):
        reply = call_openai(messages, model, api_key=api_key)

        if not reply or not reply.get("tool_calls"):
            return messages, viz  # ready to stream the final answer

        messages.append(reply)

        for call in reply["tool_calls"]:
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
                result = run_tool(tenant, call["function"]["name"], args, viz=viz)
            except Exception as err:
                result = {"error": str(err)}
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, default=_json_default),
            })

    raise MaxToolRoundsError("Buffi exceeded maximum reasoning steps.")
