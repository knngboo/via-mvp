"""
Data Hub source uploads (port of sources.js).

Exposes a blueprint factory. The `require_admin` decorator is injected from
app.py so RBAC stays defined in one place. The authenticated user lives on
`flask.g.user` (set by app.py's auth middleware).
"""

import csv
import io
import json
import re

from flask import Blueprint, g, jsonify, request
from psycopg2.extras import execute_values

import db

SAFE_SCHEMA = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
BATCH_SIZE = 5000


def _tenant():
    """Extract and validate the tenant schema from the JWT claims."""
    t = (g.user or {}).get("tenant")
    return t if t and SAFE_SCHEMA.match(t) else "bfi"


def _sanitize_column_name(name, idx):
    cleaned = re.sub(r"[^a-zA-Z0-9_ ]", "", str(name)).strip()
    cleaned = re.sub(r"\s+", "_", cleaned)[:63]
    return cleaned if cleaned else "col_{}".format(idx)


def init_sources_meta():
    """Ensure the metadata table exists with all context/RBAC columns (idempotent)."""
    try:
        db.query(
            """
            CREATE TABLE IF NOT EXISTS bfi.sources_meta (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                table_name VARCHAR(255) UNIQUE NOT NULL,
                status VARCHAR(50) DEFAULT 'Ready',
                size BIGINT,
                num_rows INT,
                columns JSONB,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """
        )
        db.query(
            """
            ALTER TABLE bfi.sources_meta
                ADD COLUMN IF NOT EXISTS user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
                ADD COLUMN IF NOT EXISTS visibility      VARCHAR(20) DEFAULT 'private',
                ADD COLUMN IF NOT EXISTS project_name    VARCHAR(255),
                ADD COLUMN IF NOT EXISTS description     TEXT,
                ADD COLUMN IF NOT EXISTS data_domain     VARCHAR(100),
                ADD COLUMN IF NOT EXISTS coverage_start  DATE,
                ADD COLUMN IF NOT EXISTS coverage_end    DATE,
                ADD COLUMN IF NOT EXISTS ongoing         BOOLEAN DEFAULT FALSE,
                ADD COLUMN IF NOT EXISTS agency_response VARCHAR(50);
            """
        )
        db.query(
            """
            CREATE INDEX IF NOT EXISTS idx_sources_meta_user       ON bfi.sources_meta(user_id);
            CREATE INDEX IF NOT EXISTS idx_sources_meta_visibility ON bfi.sources_meta(visibility);
            """
        )
    except Exception as e:
        print("Failed to initialise sources_meta table:", e)


def create_sources_blueprint(require_admin, require_editor=None, require_analyzer=None, require_viewer=None):
    bp = Blueprint("sources", __name__)
    # Fall back to require_admin if narrower role guards are not provided.
    require_editor = require_editor or require_admin

    # Upload a CSV — editors and admins
    @bp.route("", methods=["POST"])
    @bp.route("/", methods=["POST"])
    @require_editor
    def upload():
        file = request.files.get("file")
        if not file:
            return jsonify({"message": "No file uploaded."}), 400

        if not re.search(r"\.csv$", file.filename or "", re.IGNORECASE):
            return jsonify({"message": "Only .csv files are allowed."}), 400

        raw = file.read()
        if len(raw) > MAX_FILE_SIZE:
            return jsonify({"message": "File too large (max 50 MB)."}), 400

        # Parse the uploaded CSV in memory
        try:
            text = raw.decode("utf-8")
            reader = csv.DictReader(io.StringIO(text))
            raw_columns = reader.fieldnames or []
            rows = [
                {k: (v.strip() if isinstance(v, str) else v) for k, v in r.items()}
                for r in reader
            ]
        except Exception as parse_err:
            return jsonify({"message": "Failed to parse CSV: {}".format(parse_err)}), 400

        if not rows:
            return jsonify({"message": "CSV contained no data rows."}), 400

        tenant = _tenant()

        # M-2: enforce 60-char table name limit (PG max identifier is 63).
        raw_name = re.sub(r"[^a-zA-Z0-9]", "_", file.filename).lower()
        table_name = raw_name[:60]

        # B4: sanitize untrusted CSV column names before interpolating into SQL.
        columns = [_sanitize_column_name(c, i) for i, c in enumerate(raw_columns)]

        size = len(raw)
        # Visibility: admin uploads are shared with all users; editor uploads are private.
        visibility = "shared" if (g.user or {}).get("role") == "admin" else "private"

        try:
            with db.transaction() as cur:
                # M-1: advisory lock serialises concurrent uploads of the same filename.
                cur.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", ("bfi.{}".format(table_name),))

                # 1. Drop existing table if it exists
                cur.execute('DROP TABLE IF EXISTS {}."{}";'.format(tenant, table_name))

                # 2. Build CREATE TABLE dynamically from the CSV columns
                create_cols = ", ".join('"{}" TEXT'.format(c) for c in columns)
                cur.execute(
                    'CREATE TABLE {}."{}" (id SERIAL PRIMARY KEY, {});'.format(
                        tenant, table_name, create_cols
                    )
                )

                # 3. Bulk insert rows in batches via execute_values
                col_list = ", ".join('"{}"'.format(c) for c in columns)
                insert_sql = 'INSERT INTO {}."{}" ({}) VALUES %s'.format(
                    tenant, table_name, col_list
                )
                for offset in range(0, len(rows), BATCH_SIZE):
                    batch = rows[offset:offset + BATCH_SIZE]
                    values = [
                        tuple(row.get(c) for c in columns) for row in batch
                    ]
                    execute_values(cur, insert_sql, values)

                # 4. Save metadata in the same transaction - track owner and visibility
                cur.execute(
                    """
                    INSERT INTO bfi.sources_meta (name, table_name, size, num_rows, columns, user_id, visibility)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (table_name) DO UPDATE
                        SET name        = EXCLUDED.name,
                            size        = EXCLUDED.size,
                            num_rows    = EXCLUDED.num_rows,
                            columns     = EXCLUDED.columns,
                            user_id     = EXCLUDED.user_id,
                            visibility  = EXCLUDED.visibility,
                            uploaded_at = CURRENT_TIMESTAMP
                    RETURNING id;
                    """,
                    (file.filename, table_name, size, len(rows), json.dumps(columns), (g.user or {}).get("id"), visibility),
                )
                new_id = cur.fetchone()["id"]

            return jsonify({
                "message": "SQL Table created successfully!",
                "_id": new_id,
                "name": file.filename,
                "status": "Ready",
                "schema": tenant,
                "table": table_name,
                "num_rows": len(rows),
                "size": size,
                "columns": columns,
            }), 201
        except Exception as error:
            print("Upload Error:", error)
            return jsonify({"message": str(error)}), 500

    # List all uploaded sources — any authenticated user
    @bp.route("", methods=["GET"])
    @bp.route("/", methods=["GET"])
    def list_sources():
        tenant = _tenant()
        try:
            user_role = (g.user or {}).get("role")
            user_id = (g.user or {}).get("id")
            if user_role == "admin":
                rows = db.query(
                    "SELECT * FROM {}.sources_meta ORDER BY uploaded_at DESC".format(tenant)
                )
            else:
                rows = db.query(
                    "SELECT * FROM {}.sources_meta WHERE user_id = %s ORDER BY uploaded_at DESC".format(tenant),
                    (user_id,),
                )
            return jsonify(rows)
        except Exception as error:
            return jsonify({"message": str(error)}), 500

    # Delete a source — admin only
    @bp.route("/<id>", methods=["DELETE"])
    @require_editor
    def delete_source(id):
        tenant = _tenant()
        try:
            source_id = int(id)
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid source id."}), 400
        try:
            meta = db.query(
                "SELECT table_name, user_id FROM {}.sources_meta WHERE id = %s".format(tenant),
                (source_id,),
            )
            if not meta:
                return jsonify({"message": "Source not found."}), 404

            # Ownership check: editors can only delete their own sources
            user_role = (g.user or {}).get("role")
            user_id = (g.user or {}).get("id")
            if user_role != "admin" and meta[0]["user_id"] != user_id:
                return jsonify({"error": "You can only delete your own sources."}), 403
            
            table_name = meta[0]["table_name"]

            with db.transaction() as cur:
                cur.execute('DROP TABLE IF EXISTS {}."{}";'.format(tenant, table_name))
                cur.execute(
                    "DELETE FROM {}.sources_meta WHERE id = %s".format(tenant),
                    (source_id,),
                )
            return jsonify({"deleted": True})
        except Exception as error:
            return jsonify({"message": str(error)}), 500

    # Update submission context metadata — admin only
    @bp.route("/<id>/context", methods=["PATCH"])
    @require_editor
    def update_context(id):
        tenant = _tenant()
        try:
            source_id = int(id)
        except (TypeError, ValueError):
            return jsonify({"message": "Invalid source id."}), 400
        
        # Editors can only update their own uploads; admins can update any.
        user_role = (g.user or {}).get("role")
        user_id = (g.user or {}).get("id")
        if user_role != "admin":
            owner_check = db.query(
                "SELECT user_id FROM {}.sources_meta WHERE id = %s".format(tenant),
                (source_id,),
            )
            if not owner_check:
                return jsonify({"message": "Source not found."}), 404
            if owner_check[0]["user_id"] != user_id:
                return jsonify({"message": "You can only update your own sources."}), 403

        body = request.get_json(silent=True) or {}
        try:
            rows = db.query(
                """
                UPDATE {}.sources_meta
                SET
                    project_name    = %s,
                    description     = %s,
                    data_domain     = %s,
                    coverage_start  = %s,
                    coverage_end    = %s,
                    ongoing         = %s,
                    agency_response = %s
                WHERE id = %s
                RETURNING id, name, project_name, description, data_domain,
                          coverage_start, coverage_end, ongoing, agency_response;
                """.format(tenant),
                (
                    body.get("projectName") or None,
                    body.get("description") or None,
                    body.get("dataDomain") or None,
                    body.get("coverageStart") or None,
                    body.get("coverageEnd") or None,
                    body.get("ongoing") is True,
                    body.get("agencyResponse") or None,
                    source_id,
                ),
            )
            if not rows:
                return jsonify({"message": "Source not found."}), 404
            return jsonify(rows[0])
        except Exception as error:
            print("Context update error:", error)
            return jsonify({"message": str(error)}), 500

    return bp
