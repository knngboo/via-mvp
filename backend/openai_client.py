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

        if not tables:
            return ("DATABASE: No data tables found. The agency has not uploaded any data yet. "
                    "Tell the user to upload a file via the Data Hub before asking data questions.")

        # Only include tables that actually have rows.
        non_empty = []
        for t in tables:
            try:
                count = db.query(
                    'SELECT COUNT(*) AS n FROM "{}"."{}"'.format(
                        t["table_schema"], t["table_name"]
                    )
                )
                if int(count[0]["n"]) > 0:
                    non_empty.append(t)
            except Exception:
                # Table may not be queryable — skip it
                pass

        if not non_empty:
            return ("DATABASE: All tables are empty. No data has been uploaded yet. "
                    "Tell the user to upload a file via the Data Hub.")

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
        for t in non_empty:
            key = "{}.{}".format(t["table_schema"], t["table_name"])
            lines.append("  {}({})".format(key, ", ".join(col_map.get(key, []))))
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
- predict_route_ridership → Forecast future ridership using linear regression on historical data.
- make_chart → Build a bar, pie, or radar chart from a SQL query. Use this whenever the answer is best shown as a graph (rankings, distributions, counts, comparisons, trends).
- plot_on_map → Plot geographic points on the San Antonio map. Give it a SELECT that returns latitude and longitude columns (e.g. stop_lat/stop_lon from public.stops). Use this whenever the user asks to see, show, map, or locate things geographically.
- show_live_buses → Plot VIA's live vehicle positions (real-time GTFS feed) on the map. Use when the user asks where buses are right now, live locations, or vehicle tracking.
- get_service_alerts → Read VIA's current real-time service alerts (detours, delays). Use when the user asks about alerts, disruptions, or service changes.
- get_trip_updates → Read VIA's real-time trip updates (per-trip arrival/departure delays). Use when the user asks how late/on-time buses are, delays, or schedule adherence.

ANALYTICS & CHARTS:
- When the user asks to analyze, compare, rank, break down, or chart data, call make_chart with a SELECT that returns one label column (x) and one numeric column (y).
- Choose chart_type: 'bar' for rankings/counts/comparisons, 'pie' for share-of-total, 'radar' for multi-metric profiles. Default to 'bar'.
- Keep charts to ~15 rows max (use ORDER BY ... LIMIT). Always also explain the insight in your text answer.

MAPPING:
- When a question is geographic ("where", "show me on a map", "locations of", "nearest"), prefer plot_on_map or show_live_buses so the user gets a visual.
- plot_on_map SQL MUST return latitude/longitude (stops have stop_lat/stop_lon). Include a name column when possible (e.g. stop_name) and keep results under ~500 rows.

HOW TO USE run_query:
- Write valid PostgreSQL SELECT statements only.
- Use fully-qualified table names from the schema provided below (e.g. public.stops, bfi.my_upload).
- You may JOIN across tables freely.
- For "busiest stops": SELECT stop_id, stop_name, COUNT(*) FROM public.stop_times JOIN public.stops USING(stop_id) GROUP BY stop_id, stop_name ORDER BY COUNT(*) DESC LIMIT 10
- For "busiest routes": JOIN public.trips and public.routes, GROUP BY route_id, ORDER BY COUNT(*) DESC
- For "stops near downtown": ORDER BY distance using haversine formula on stop_lat/stop_lon
- If the user asks about uploaded data, query the tenant schema tables.

RULES:
- ALWAYS use run_query for data questions. Never say "no data available" without trying a query first.
- Never ask the user to upload a file if a query can answer the question.
- If a query returns no rows, say so and suggest why (e.g. no data uploaded yet).
- Answer concisely. Use Markdown tables for structured results.
- Do not expose raw SQL errors to the user — summarize what went wrong plainly."""


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
def prepare_chat(user_message, history=None, tenant="bfi", model=DEFAULT_MODEL, api_key=None):
    """
    Build context and run the (non-streaming) tool-calling loop.

    Returns a tuple (messages, viz):
      - messages : the message list to stream the final answer from
      - viz      : dict that may contain "map" ({points, title, live?, route_id?})
                   and/or "chart" ({chartData, chartType}) for the frontend to
                   render. Empty dict if no visualization was produced.

    Raises MaxToolRoundsError if the model never settles on a text answer.
    `api_key`, when provided, is a user-supplied key that overrides the env var.
    """
    schema_context = build_schema_context(tenant)
    system_prompt = "{}\n\n{}".format(SYSTEM_PROMPT_BASE, schema_context)

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
