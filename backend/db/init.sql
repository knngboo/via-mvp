-- create user table for better auth system
--
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    user_role VARCHAR(20) DEFAULT 'viewer',
    tenant_schema VARCHAR(50) DEFAULT 'bfi',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- chat history table for buffi ai integration
-- NOTE (MVP): This table is created but NOT yet used by any backend endpoint.
-- Chat history is currently stored client-side in localStorage.
-- Future: wire up POST /api/chat to persist messages here per user.
--
CREATE TABLE IF NOT EXISTS chat_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    sender_role VARCHAR(10) NOT NULL,
    content TEXT NOT NULL,
    structured_data JSONB,
    citations JSONB,
    map_tag VARCHAR(100),
    chart_tag VARCHAR(100),
    saved_chart_data JSONB,
    saved_highlight_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- feedback table for flagged AI responses
-- Stores user-submitted reports on individual bot messages.
-- The message_text is stored server-side so we have a record even if
-- the user clears their localStorage chat history.
--
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message_text TEXT,
    reported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_reported_at ON feedback(reported_at DESC);

-- multi-tenant schemas: bfi (Better Futures Institute), via (VIA Metropolitan Transit),
-- areafoundation (San Antonio Area Foundation). Each gets its own sources_meta table
-- so uploaded data is fully isolated per organization.
--
CREATE SCHEMA IF NOT EXISTS bfi;

-- Source metadata table for Data Hub — BFI tenant
--
CREATE TABLE IF NOT EXISTS bfi.sources_meta (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Ready',
    size BIGINT,
    num_rows INT,
    columns JSONB,
    visibility VARCHAR(20) DEFAULT 'Private',
    project_name    VARCHAR(255),
    description     TEXT,
    data_domain     VARCHAR(100),
    coverage_start  DATE,
    coverage_end    DATE,
    ongoing         BOOLEAN DEFAULT FALSE,
    agency_response VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_bfi_sources_meta_uploaded   ON bfi.sources_meta(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_bfi_sources_meta_user       ON bfi.sources_meta(user_id);
CREATE INDEX IF NOT EXISTS idx_bfi_sources_meta_visibility ON bfi.sources_meta(visibility);

-- VIA tenant schema
CREATE SCHEMA IF NOT EXISTS via;

CREATE TABLE IF NOT EXISTS via.sources_meta (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Ready',
    size BIGINT,
    num_rows INT,
    columns JSONB,
    visibility VARCHAR(20) DEFAULT 'Private',
    project_name    VARCHAR(255),
    description     TEXT,
    data_domain     VARCHAR(100),
    coverage_start  DATE,
    coverage_end    DATE,
    ongoing         BOOLEAN DEFAULT FALSE,
    agency_response VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_via_sources_meta_uploaded   ON via.sources_meta(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_via_sources_meta_user       ON via.sources_meta(user_id);
CREATE INDEX IF NOT EXISTS idx_via_sources_meta_visibility ON via.sources_meta(visibility);

-- Area Foundation tenant schema
CREATE SCHEMA IF NOT EXISTS areafoundation;

CREATE TABLE IF NOT EXISTS areafoundation.sources_meta (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    table_name VARCHAR(255) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'Ready',
    size BIGINT,
    num_rows INT,
    columns JSONB,
    visibility VARCHAR(20) DEFAULT 'Private',
    project_name    VARCHAR(255),
    description     TEXT,
    data_domain     VARCHAR(100),
    coverage_start  DATE,
    coverage_end    DATE,
    ongoing         BOOLEAN DEFAULT FALSE,
    agency_response VARCHAR(50),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_af_sources_meta_uploaded   ON areafoundation.sources_meta(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_af_sources_meta_user       ON areafoundation.sources_meta(user_id);
CREATE INDEX IF NOT EXISTS idx_af_sources_meta_visibility ON areafoundation.sources_meta(visibility);

-- Plugin registry: which plugins each tenant has access to.
-- A plugin maps to a folder in frontend/src/Plugins/<id>/.
-- Add rows here to grant a tenant access to additional agency plugins.
--
CREATE TABLE IF NOT EXISTS tenant_plugins (
    tenant_schema  VARCHAR(63) NOT NULL,
    plugin_id      VARCHAR(63) NOT NULL,
    enabled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_schema, plugin_id)
);

-- Seed plugins for each tenant.
INSERT INTO tenant_plugins (tenant_schema, plugin_id) VALUES ('bfi', 'via')            ON CONFLICT DO NOTHING;
INSERT INTO tenant_plugins (tenant_schema, plugin_id) VALUES ('via', 'via')            ON CONFLICT DO NOTHING;
INSERT INTO tenant_plugins (tenant_schema, plugin_id) VALUES ('areafoundation', 'areafoundation') ON CONFLICT DO NOTHING;

-- GTFS transit tables (via schema — VIA Metropolitan Transit data).
-- Scoped to the via schema so Area Foundation users cannot query this data.
-- BFI and VIA users both have access; AF users do not.
-- Populated on startup by backend/import_gtfs.py from the bundled
-- google_transit/ feed. The DDL is mirrored there (CREATE TABLE IF NOT EXISTS).
--
CREATE TABLE IF NOT EXISTS via.stops (
    stop_id              TEXT PRIMARY KEY,
    stop_name            TEXT,
    stop_lat             DOUBLE PRECISION,
    stop_lon             DOUBLE PRECISION,
    location_type        INTEGER,
    wheelchair_boarding  INTEGER
);

CREATE TABLE IF NOT EXISTS via.routes (
    route_id          TEXT PRIMARY KEY,
    route_short_name  TEXT,
    route_long_name   TEXT,
    route_type        INTEGER
);

CREATE TABLE IF NOT EXISTS via.trips (
    trip_id                TEXT PRIMARY KEY,
    route_id               TEXT,
    service_id             TEXT,
    trip_headsign          TEXT,
    direction_id           INTEGER,
    wheelchair_accessible  INTEGER,
    bikes_allowed          INTEGER
);

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

CREATE INDEX IF NOT EXISTS idx_via_trips_route_id ON via.trips(route_id);
CREATE INDEX IF NOT EXISTS idx_via_stop_times_stop_id ON via.stop_times(stop_id);

