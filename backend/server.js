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

// ── CRITICAL: Fail-fast on missing secrets ──────────────────────────────────
// Deferring these checks to request time causes runtime crashes and empty-secret
// vulnerabilities (Buffer.from('') === Buffer.from('')). Exit now if misconfigured.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error('FATAL: JWT_SECRET is not set or too short (min 16 chars). Exiting.');
    process.exit(1);
}
if (!process.env.ADMIN_SECRET || process.env.ADMIN_SECRET.length < 8) {
    console.error('FATAL: ADMIN_SECRET is not set or too short (min 8 chars). Exiting.');
    process.exit(1);
}
// ────────────────────────────────────────────────────────────────────────────

const app = express();

// Security headers
//
app.use(helmet());

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
    user: process.env.POSTGRES_USER || 'admin',
    host: 'postgres',
    database: process.env.POSTGRES_DB || 'via_mvp',
    password: process.env.POSTGRES_PASSWORD || 'admin',
    port: 5432,
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
        console.error(error);
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
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        // Always call bcrypt.compare — even for unknown users — to prevent timing attacks
        const hashToCompare = user ? user.password_hash : DUMMY_HASH;
        const isValid = await bcrypt.compare(password, hashToCompare);

        if (!user || !isValid) {
            return res.status(401).json({ error: 'invalid credentials' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.user_role },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, username: user.username, role: user.user_role });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'login failed' });
    }
});

// authentication middleware
//
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Access token required' });

    jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
        if (err) return res.status(403).json({ error: 'Invalid or expired token' });
        req.user = user;
        next();
    });
};

// admin-only middleware — must be used AFTER authenticateToken
//
const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Admin role required.' });
    }
    next();
};

// Secure AI Chat Route
//
app.post('/api/chat', authenticateToken, async (req, res) => {
    const { message, history } = req.body;
    const customKey = req.get('x-openai-key');

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    try {
        const result = await chatWithOpenAI({ pool, userMessage: message, history, customKey });
        res.json(result);
    } catch (error) {
        console.error('AI Error:', error.message);
        res.status(500).json({ error: 'AI request failed', details: error.message });
    }
});

app.post('/api/chat/stream', authenticateToken, chatLimiter, async (req, res) => {
    const { message, history } = req.body;
    const customKey = req.get('x-openai-key');

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // H-6: Set a hard timeout on the SSE connection so zombie streams don't accumulate.
    // 5 minutes is generous for even multi-tool AI responses.
    req.setTimeout(5 * 60 * 1000, () => {
        if (!res.headersSent) res.status(408).end();
        else res.end();
    });

    try {
        await chatWithOpenAI({ pool, userMessage: message, history, customKey, resForStream: res });
    } catch (error) {
        console.error('AI Error:', error.message);
        res.status(500).end();
    }
});

// Data Upload Route — requireAdmin enforces server-side RBAC (not just client-side)
app.use('/api/sources', authenticateToken, sourcesRouter(pool, requireAdmin));

// GTFS Stats Route
app.use('/api/stats', authenticateToken, statsRouter(pool));

app.listen(PORT, async () => {
    console.log(`backend listening on port ${PORT}`);
    // Check if GTFS data is loaded, and auto-import if not
    try {
        await runImportIfNeeded(pool);
    } catch (err) {
        console.error('Auto-import failed:', err);
    }
});
