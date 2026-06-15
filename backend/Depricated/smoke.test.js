/**
 * via-mvp backend — minimum smoke test suite
 *
 * Runs with Node's built-in test runner (Node 18+). No extra deps.
 *
 *   node --test backend/tests/smoke.test.js
 *
 * Requires the backend to be running at TEST_BASE_URL (default: http://localhost:5001)
 * and a valid ADMIN_SECRET in the environment.
 *
 * These are integration tests — they hit the live API.
 * They do NOT mock the database.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5001';
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
    console.error('ERROR: ADMIN_SECRET env var is required to run tests.');
    process.exit(1);
}

// Test user — use a timestamp suffix to avoid collisions across test runs
const TEST_USER = `testuser_${Date.now()}`;
const TEST_PASS = 'TestPass123!';

let sessionCookie = '';

// ── Auth ─────────────────────────────────────────────────────────────────────

test('POST /api/register — rejects missing admin secret', async () => {
    const res = await fetch(`${BASE}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'hacker', password: 'anything1' }),
    });
    assert.equal(res.status, 403);
});

test('POST /api/register — rejects short password', async () => {
    const res = await fetch(`${BASE}/api/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ username: 'shortpwuser', password: '123' }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /at least 8/i);
});

test('POST /api/register — creates user successfully', async () => {
    const res = await fetch(`${BASE}/api/register`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': ADMIN_SECRET,
        },
        body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.username, TEST_USER);
});

test('POST /api/login — rejects wrong password', async () => {
    const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USER, password: 'wrongpassword' }),
    });
    assert.equal(res.status, 401);
});

test('POST /api/login — succeeds and sets HttpOnly cookie', async () => {
    const res = await fetch(`${BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: TEST_USER, password: TEST_PASS }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.username, TEST_USER);
    // Token must NOT be in the response body (C3)
    assert.equal(body.token, undefined, 'token must not appear in response body after C3');

    // Cookie must be set
    const setCookie = res.headers.get('set-cookie') || '';
    assert.ok(setCookie.includes('via_session='), 'via_session cookie not set');
    assert.ok(setCookie.toLowerCase().includes('httponly'), 'cookie must be HttpOnly');

    // Save cookie for subsequent authenticated test requests
    sessionCookie = setCookie.split(';')[0]; // "via_session=<value>"
});

// ── Authenticated route guard ─────────────────────────────────────────────────

test('GET /api/sources — rejects unauthenticated request', async () => {
    const res = await fetch(`${BASE}/api/sources`);
    assert.equal(res.status, 401);
});

test('GET /api/sources — allows authenticated request', async () => {
    assert.ok(sessionCookie, 'login test must run first to capture cookie');
    const res = await fetch(`${BASE}/api/sources`, {
        headers: { 'Cookie': sessionCookie },
    });
    // 200 OK — even if empty array
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
});

// ── Upload smoke test ─────────────────────────────────────────────────────────

test('POST /api/sources — rejects upload from non-admin user', async () => {
    assert.ok(sessionCookie, 'login test must run first');
    // TEST_USER has default role 'viewer', not 'admin'
    const formData = new FormData();
    const csvBlob = new Blob(['col_a,col_b\n1,2\n3,4\n'], { type: 'text/csv' });
    formData.append('file', csvBlob, 'test.csv');

    const res = await fetch(`${BASE}/api/sources`, {
        method: 'POST',
        headers: { 'Cookie': sessionCookie },
        body: formData,
    });
    // Viewer role should be rejected with 403
    assert.equal(res.status, 403);
});

// ── Feedback endpoint ─────────────────────────────────────────────────────────

test('POST /api/feedback — rejects unauthenticated request', async () => {
    const res = await fetch(`${BASE}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_text: 'test' }),
    });
    assert.equal(res.status, 401);
});

test('POST /api/feedback — saves feedback for authenticated user', async () => {
    assert.ok(sessionCookie, 'login test must run first');
    const res = await fetch(`${BASE}/api/feedback`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Cookie': sessionCookie,
        },
        body: JSON.stringify({ message_text: 'This is a test report from the smoke test suite.' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(typeof body.id === 'number');
});

// ── Plugin registry ───────────────────────────────────────────────────────────

test('GET /api/plugins — rejects unauthenticated request', async () => {
    const res = await fetch(`${BASE}/api/plugins`);
    assert.equal(res.status, 401);
});

test('GET /api/plugins — returns allowed plugin list for authenticated tenant', async () => {
    assert.ok(sessionCookie, 'login test must run first');
    const res = await fetch(`${BASE}/api/plugins`, {
        headers: { 'Cookie': sessionCookie },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.plugins), 'plugins should be an array');
    // The bfi tenant is seeded with the via plugin
    assert.ok(body.plugins.includes('via'), 'via plugin should be in the list');
});

// ── Logout ────────────────────────────────────────────────────────────────────

test('POST /api/logout — clears the session cookie', async () => {
    assert.ok(sessionCookie, 'login test must run first');
    const res = await fetch(`${BASE}/api/logout`, {
        method: 'POST',
        headers: { 'Cookie': sessionCookie },
    });
    assert.equal(res.status, 200);
    const setCookie = res.headers.get('set-cookie') || '';
    // Cookie should be cleared (Max-Age=0 or expires in the past)
    assert.ok(
        setCookie.includes('via_session=;') || setCookie.includes('Max-Age=0') || setCookie.includes('Expires='),
        'via_session cookie should be cleared on logout'
    );
});
