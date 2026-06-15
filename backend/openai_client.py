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
# Tool executor
# ---------------------------------------------------------------------------
def run_tool(tenant, name, args):
    # ── run_query ──────────────────────────────────────────────────────────
    if name == "run_query":
        sql = (args.get("sql") or "").strip()

        if not is_safe_select(sql):
            return {"error": "Only read-only SELECT statements are allowed. The query was rejected."}

        try:
            with db.transaction() as cur:
                # Read-only transaction, search path limited to tenant + public
                cur.execute("SET TRANSACTION READ ONLY")
                cur.execute('SET LOCAL search_path TO public, "{}"'.format(tenant))
                cur.execute(sql)
                rows = cur.fetchall() if cur.description else []
            return {
                "row_count": len(rows),
                "truncated": len(rows) > MAX_ROWS,
                "data": rows[:MAX_ROWS],
            }
        except Exception as e:
            return {"error": "Query failed: {}".format(e)}

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


def call_openai(messages, model=DEFAULT_MODEL):
    """Non-streaming call — used for tool-calling rounds. Returns the message dict."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server.")

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


def stream_openai(messages, model=DEFAULT_MODEL):
    """
    Generator yielding raw OpenAI SSE bytes for the final text response.
    Passes messages WITHOUT tools so the model can only return text.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not configured on the server.")

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
def prepare_chat(user_message, history=None, tenant="bfi", model=DEFAULT_MODEL):
    """
    Build context and run the (non-streaming) tool-calling loop.
    Returns the message list to stream the final answer from.
    Raises MaxToolRoundsError if the model never settles on a text answer.
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

    for _ in range(MAX_TOOL_ROUNDS):
        reply = call_openai(messages, model)

        if not reply or not reply.get("tool_calls"):
            return messages  # ready to stream the final answer

        messages.append(reply)

        for call in reply["tool_calls"]:
            try:
                args = json.loads(call["function"].get("arguments") or "{}")
                result = run_tool(tenant, call["function"]["name"], args)
            except Exception as err:
                result = {"error": str(err)}
            messages.append({
                "role": "tool",
                "tool_call_id": call["id"],
                "content": json.dumps(result, default=_json_default),
            })

    raise MaxToolRoundsError("Buffi exceeded maximum reasoning steps.")
