// Simple password check. Returns a signed token that other functions validate.
// Uses HMAC with a secret derived from APP_PASSWORD so we don't need a separate JWT secret.

import crypto from 'crypto';

const sign = (payload, secret) => {
    const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    return `${data}.${sig}`;
};

export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    const { password } = JSON.parse(event.body || '{}');
    const expected = process.env.APP_PASSWORD;

    if (!expected) {
        return { statusCode: 500, body: JSON.stringify({ error: 'APP_PASSWORD not configured' }) };
    }

    // Constant-time compare
    const match = password && password.length === expected.length &&
        crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected));

    if (!match) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid password' }) };
    }

    const token = sign(
        { iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }, // 30 days
        expected
    );

    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
    };
};

// Shared validator used by other functions
export const validateToken = (token) => {
    if (!token) return false;
    const secret = process.env.APP_PASSWORD;
    if (!secret) return false;

    const [data, sig] = token.split('.');
    if (!data || !sig) return false;

    const expectedSig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
    const sigMatches = sig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    if (!sigMatches) return false;

    try {
        const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
        if (payload.exp < Date.now()) return false;
        return true;
    } catch {
        return false;
    }
};