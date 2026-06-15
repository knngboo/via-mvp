// import dep
//
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import pino from 'pino';
import pinoHttp from 'pino-http';
import { chatWithOpenAI } from './openai.js';
import sourcesRouter from './sources.js';
import statsRouter from './stats.js';
import { runImportIfNeeded } from './import-gtfs.js';

// destructure the connection pool from the pg package
//
const { Pool } = pkg;

// load secrets
//
dotenv.config();

// D1: Structured logger — pretty-print in dev, JSON in prod (for log aggregators)
const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    ...(process.env.NODE_ENV !== 'production' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
    }),
});

// ── CRITICAL: Fail-fast on missing secrets ──────────────────────────────────
// Deferring these checks to request time causes runtime crashes and empty-secret
// vulnerabilities (Buffer.from('') === Buffer.from('')). Exit now if misconfigured.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    process.stderr.write('FATAL: JWT_SECRET is not set or too short (min 16 chars). Exiting.\n');
    process.exit(1);
}
if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < 8) {
    process.stderr.write('FATAL: ADMIN_SECRET is not set or too short (min 8 chars). Exiting.\n');
    process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const app = express();

// D1: Request-level logging — logs method, url, status, response time on every request
app.use(pinoHttp({ logger }));

// B5: Explicit Content Security Policy — bare helmet() uses restrictive defaults that
// silently break Google Fonts, Leaflet tiles, and OpenAI SSE in production.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc:     ["'self'"],
            scriptSrc:      ["'self'"],
            styleSrc:       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc:        ["'self'", "https://fonts.gstatic.com"],
            imgSrc:         ["'self'", "data:", "https://*.tile.openstreetmap.org"],
            connectSrc:     ["'self'", "https://api.openai.com"],
            frameSrc:       ["'none'"],
            objectSrc:      ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// Environment-aware CORS — set ALLOWED_ORIGINS in .env for production
//
const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173'];

app.use(cors({
    origin: (origin, cb) => {
        // Allow non-browser requests (curl, health checks) and configured origins
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));

// Rate limiters
//
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in 15 minutes.' }
});

const chatLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many chat requests. Please slow down.' }
});

// connect to postgres database
//
const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: 'postgres',
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
    max: 20,                 // B1: hard cap — prevents connection exhaustion under load
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

// make database available to other files
//
app.set('db', pool);

// health check route for docker
//
app.get('/health', (req, res) => res.send('OK'));

// start listening
//
const PORT = process.env.PORT || 5001;

// register a new user securely
//
app.post('/api/register', authLimiter, async (req, res) => {

    // SECURITY CHECK: Block anyone who doesn't have the Master Admin Secret.
    // Use timingSafeEqual to prevent timing oracle attacks on the secret.
    const adminSecret = req.headers['x-admin-secret'] || '';
    const expected = process.env.ADMIN_SECRET || '';
    let secretValid = false;
    try {
        secretValid = crypto.timingSafeEqual(
            Buffer.from(adminSecret),
            Buffer.from(expected)
        );
    } catch {
        secretValid = false;
    }
    if (!secretValid) {
        return res.status(403).json({ error: 'Unauthorized: Hackers are blocked!' });
    }

    const { username, password } = req.body;

    // Validate username — length limit and safe character set
    if (!username || typeof username !== 'string' || username.length > 50 || username.length < 1) {
        return res.status(400).json({ error: 'Username must be between 1 and 50 characters.' });
    }
    if (!/^[a-zA-Z0-9_@.\-]+$/.test(username)) {
        return res.status(400).json({ error: 'Username contains invalid characters.' });
    }

    if (!password) {
        return res.status(400).json({ error: 'username and password required' });
    }

    // Enforce minimum password length
    if (typeof password === 'string' && password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    try {
        // hash the password 10 times for security
        //
        const hashedPassword = await bcrypt.hash(password, 10);

        const result = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
            [username, hashedPassword]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        logger.error({ err: error }, 'registration failed');
        res.status(500).json({ error: 'registration failed. username might already exist.' });
    }
});

// authenticate user and generate jwt token
//
// A static dummy hash is compared when the username doesn't exist,
// so the response time is identical whether the username is valid or not.
// This prevents username enumeration via timing.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

app.post('/api/login', authLimiter, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password required' });
    }

    try {
        // B3: Explicit columns — never leak future fields (e.g. password_hash) into result accidentally
        const result = await pool.query(
            'SELECT id, username, password_hash, user_role, tenant_schema FROM users WHERE username = $1',
            [username]
        );
        const user = result.rows[0];

        // Always call bcrypt.compare — even for unknown users — to prevent timing attacks
        const hashToCompare = user ? user.password_hash : DUMMY_HASH;
        const isValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !isValid) {
            return res.status(401).json({ error: 'invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.user_role, tenant: user.tenant_schema || 'bfi' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        // C3: Set JWT in HttpOnly cookie — never accessible to JavaScript.
        // sameSite:'strict' blocks CSRF. secure flag set in production only.
        res.cookie('via_session', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000, // 24 hours in ms
        });

        // Return user identity only (not the token — it lives in the cookie)
        res.json({ username: user.username, role: user.user_role });
    } catch (error) {
        logger.error({ err: error }, 'login failed');
        res.status(500).json({ error: 'login failed' });
    }
});

// authentication middleware
//
const authenticateToken = (req, res, next) => {
    // C3: Read from HttpOnly cookie first; fall back to Authorization header
    // for non-browser clients (API tools, curl, etc.)
    const cookieToken = req.cookies?.via_session;
    const headerToken = req.headers['authorization']?.split(' ')[1];
    const token = cookieToken || headerToken;

    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// Logout — clear the session cookie
app.post('/api/logout', (req, res) => {
    res.clearCookie('via_session', { httpOnly: true, sameSite: 'strict' });
    res.json({ ok: true });
});

// admin-only middleware — must be used AFTER authenticateToken
//
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required.' });
    }
    next();
};

app.post('/api/chat/stream', authenticateToken, chatLimiter, async (req, res) => {
    const { message, history } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // B6: Hard limits — prevent multi-MB payloads reaching OpenAI
    if (typeof message !== 'string' || message.length > 4000) {
        return res.status(400).json({ error: 'Message too long (max 4000 characters).' });
    }
    const safeHistory = Array.isArray(history)
        ? history
              .slice(-20)  // cap to last 20 exchanges
              .filter(h => h && typeof h.from === 'string' && typeof h.text === 'string')
        : [];

    // C1: Extract tenant from JWT — validated against safe schema-name pattern
    // to prevent any crafted JWT from injecting arbitrary schema names into SQL.
    const SAFE_SCHEMA = /^[a-z][a-z0-9_]{0,62}$/;
    const tenant = SAFE_SCHEMA.test(req.user?.tenant) ? req.user.tenant : 'bfi';

    // H-6: Set a hard timeout on the SSE connection so zombie streams don't accumulate.
    // 5 minutes is generous for even multi-tool AI responses.
    req.setTimeout(5 * 60 * 1000, () => {
        if (!res.headersSent) res.status(408).end();
        else res.end();
    });

    try {
        await chatWithOpenAI({ pool, userMessage: message, history: safeHistory, tenant, resForStream: res });
    } catch (error) {
        logger.error({ err: error }, 'AI stream error');
        res.status(500).end();
    }
});

// Data Upload Route — requireAdmin enforces server-side RBAC (not just client-side)
app.use('/api/sources', authenticateToken, sourcesRouter(pool, requireAdmin));

// C5: Feedback — authenticated users can flag bad AI responses
app.post('/api/feedback', authenticateToken, async (req, res) => {
    const { message_text } = req.body;

    if (!message_text || typeof message_text !== 'string') {
        return res.status(400).json({ error: 'message_text is required.' });
    }
    if (message_text.length > 10000) {
        return res.status(400).json({ error: 'message_text too long (max 10,000 chars).' });
    }

    try {
        const result = await pool.query(
            'INSERT INTO feedback (user_id, message_text) VALUES ($1, $2) RETURNING id, reported_at',
            [req.user.id, message_text.trim()]
        );
        res.status(201).json({ ok: true, id: result.rows[0].id, reported_at: result.rows[0].reported_at });
    } catch (error) {
        logger.error({ err: error }, 'feedback save failed');
        res.status(500).json({ error: 'Failed to save feedback.' });
    }
});

// GTFS Stats Route
app.use('/api/stats', authenticateToken, statsRouter(pool));

app.listen(PORT, async () => {
    console.log(`backend listening on port ${PORT}`);
    // Check if GTFS data is loaded, and auto-import if not
    try {
        await runImportIfNeeded(pool);
    } catch (err) {
        logger.error({ err }, 'Auto-import failed');
    }
});
