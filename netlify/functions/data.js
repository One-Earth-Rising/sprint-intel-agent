// CRUD for conversations + settings, backed by Netlify Blobs.

import { getStore, connectLambda } from '@netlify/blobs';
import { validateToken } from './auth.js';

export const handler = async (event) => {
    // Initialize Blobs environment (works in both native + Lambda compat modes)
    try { connectLambda(event); } catch (e) { /* non-Lambda mode, ignore */ }

    // Auth check
    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!validateToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const store = getStore({ name: 'sprint-intel' });

    try {
        if (event.httpMethod === 'GET') {
            const [conversations, settings, lastBriefing] = await Promise.all([
                store.get('conversations', { type: 'json' }),
                store.get('settings', { type: 'json' }),
                store.get('last-briefing', { type: 'json' })
            ]);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversations: conversations || [],
                    settings: settings || { gapThreshold: 2, focus: 'full' },
                    lastBriefing: lastBriefing || null
                })
            };
        }

        if (event.httpMethod === 'POST') {
            const { type, data } = JSON.parse(event.body || '{}');

            if (type === 'conversations') {
                await store.setJSON('conversations', data);
            } else if (type === 'settings') {
                await store.setJSON('settings', data);
            } else if (type === 'last-briefing') {
                await store.setJSON('last-briefing', data);
            } else {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid type' }) };
            }

            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        if (event.httpMethod === 'DELETE') {
            await Promise.all([
                store.delete('conversations'),
                store.delete('settings'),
                store.delete('last-briefing')
            ]);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, body: 'Method not allowed' };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};