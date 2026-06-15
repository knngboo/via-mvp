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

-- Performance indexes on platform tables
CREATE INDEX IF NOT EXISTS idx_sources_meta_uploaded ON bfi.sources_meta(uploaded_at DESC);

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

-- Seed: the 'bfi' tenant (VIA) gets the 'via' plugin by default.
INSERT INTO tenant_plugins (tenant_schema, plugin_id)
VALUES ('bfi', 'via')
ON CONFLICT DO NOTHING;

