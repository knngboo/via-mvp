// import dep
//
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pkg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// destructure the connection pool from the pg package 
//
const { Pool } = pkg;

// load secrets
//
dotenv.config();
const app = express();

// setup middleware
//
app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

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
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'username and password required' });
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
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        // find user in database
        //
        const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        const user = result.rows[0];

        if (!user) {
            return res.status(401).json({ error: 'invalid credentials' });
        }

        // verify the hashed password matches
        //
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'invalid credentials' });
        }

        // generate a secure json web token valid for 24 hours
        //
        const token = jwt.sign(
            { id: user.id, username: user.username },
            process.env.JWT_SECRET || 'fallback_secret_key',
            { expiresIn: '24h' }
        );

        res.json({ token, username: user.username });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'login failed' });
    }
});


app.listen(PORT, () => console.log(`backend listening on port ${PORT}`));
