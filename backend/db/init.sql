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

-- multi-tenant schemas
-- NOTE: via_transit schema removed (was reserved for future use but never written to).
-- All data currently lives in the 'bfi' schema. Tenant isolation tracked in audit Phase C.
--
CREATE SCHEMA IF NOT EXISTS bfi;

-- Source metadata table for Data Hub
--
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

-- VIA's GTFS Table Schemas
--
CREATE TABLE IF NOT EXISTS stops (
    stop_id VARCHAR(50) PRIMARY KEY,
    stop_name VARCHAR(255),
    stop_lat NUMERIC,
    stop_lon NUMERIC,
    location_type INTEGER,
    wheelchair_boarding INTEGER
);

CREATE TABLE IF NOT EXISTS routes (
    route_id VARCHAR(50) PRIMARY KEY,
    route_short_name VARCHAR(50),
    route_long_name VARCHAR(255),
    route_type INTEGER
);

CREATE TABLE IF NOT EXISTS trips (
    trip_id VARCHAR(50) PRIMARY KEY,
    route_id VARCHAR(50) REFERENCES routes(route_id),
    service_id VARCHAR(50),
    trip_headsign VARCHAR(255),
    direction_id INTEGER,
    wheelchair_accessible INTEGER,
    bikes_allowed INTEGER
);

CREATE TABLE IF NOT EXISTS stop_times (
    trip_id VARCHAR(50) REFERENCES trips(trip_id),
    arrival_time VARCHAR(20),
    departure_time VARCHAR(20),
    stop_id VARCHAR(50) REFERENCES stops(stop_id),
    stop_sequence INTEGER,
    pickup_type INTEGER,
    drop_off_type INTEGER,
    timepoint INTEGER,
    PRIMARY KEY (trip_id, stop_sequence)
);

-- Performance indexes on hot query paths and foreign keys
-- Without these, every JOIN against stop_times (690k+ rows) is a full sequential scan.
CREATE INDEX IF NOT EXISTS idx_trips_route_id        ON trips(route_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_trip_id    ON stop_times(trip_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_stop_id    ON stop_times(stop_id);
CREATE INDEX IF NOT EXISTS idx_stop_times_departure  ON stop_times(departure_time);
CREATE INDEX IF NOT EXISTS idx_stops_lat_lon         ON stops(stop_lat, stop_lon);
CREATE INDEX IF NOT EXISTS idx_sources_meta_uploaded ON bfi.sources_meta(uploaded_at DESC);

