"""
Postgres connection pool + small query helpers.

Mirrors the behaviour of the old `pg` Pool from server.js:
  - a bounded ThreadedConnectionPool (max 20 connections)
  - dict-returning rows (RealDictCursor) so callers can use row['col']
  - a `transaction()` context manager that replaces `pool.connect()` + BEGIN/COMMIT

psycopg2 uses %s placeholders rather than pg's $1/$2 — all SQL in the
Python backend is written with %s accordingly.
"""

import os
from contextlib import contextmanager

import psycopg2
from psycopg2 import pool as pg_pool
from psycopg2.extras import RealDictCursor

_pool = None


def init_pool():
    """Create the global connection pool. Call once at startup."""
    global _pool
    if _pool is not None:
        return _pool

    _pool = pg_pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=20,  # B1: hard cap — prevents connection exhaustion under load
        user=os.environ.get("POSTGRES_USER"),
        host=os.environ.get("POSTGRES_HOST", "postgres"),
        dbname=os.environ.get("POSTGRES_DB"),
        password=os.environ.get("POSTGRES_PASSWORD"),
        port=int(os.environ.get("POSTGRES_PORT", "5432")),
        connect_timeout=5,
    )
    return _pool


def get_pool():
    if _pool is None:
        init_pool()
    return _pool


@contextmanager
def _checkout():
    """Borrow a raw connection from the pool and return it when done."""
    p = get_pool()
    conn = p.getconn()
    try:
        yield conn
    finally:
        p.putconn(conn)


def query(sql, params=None):
    """
    Run a single statement in its own (auto-committed) transaction and
    return all rows as a list of dicts. Equivalent to `await pool.query(...)`.
    """
    with _checkout() as conn:
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(sql, params or ())
                rows = cur.fetchall() if cur.description else []
            conn.commit()
            return rows
        except Exception:
            conn.rollback()
            raise


@contextmanager
def transaction():
    """
    Context manager yielding a RealDictCursor inside a transaction.
    Commits on success, rolls back on exception — the Python analogue of the
    `client = await pool.connect()` / BEGIN / COMMIT / ROLLBACK pattern.

    Usage:
        with transaction() as cur:
            cur.execute("...", params)
            rows = cur.fetchall()
    """
    with _checkout() as conn:
        cur = conn.cursor(cursor_factory=RealDictCursor)
        try:
            yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            cur.close()
