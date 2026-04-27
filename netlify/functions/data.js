// CRUD for the rolling knowledge base + briefing cache.

import { getStore, connectLambda } from '@netlify/blobs';
import { validateToken } from './auth.js';

export const handler = async (event) => {
    try { connectLambda(event); } catch (e) { /* native mode */ }

    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!validateToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    const store = getStore({ name: 'sprint-intel' });

    try {
        if (event.httpMethod === 'GET') {
            const [knowledgeBase, settings, lastBriefing, history] = await Promise.all([
                store.get('knowledge-base', { type: 'json' }),
                store.get('settings', { type: 'json' }),
                store.get('last-briefing', { type: 'json' }),
                store.get('handover-history', { type: 'json' })
            ]);
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    knowledgeBase: knowledgeBase || { text: '', updated: null, version: 0 },
                    settings: settings || { gapThreshold: 2, focus: 'full' },
                    lastBriefing: lastBriefing || null,
                    history: history || []
                })
            };
        }

        if (event.httpMethod === 'POST') {
            const { type, data } = JSON.parse(event.body || '{}');
            const valid = ['knowledge-base', 'settings', 'last-briefing', 'handover-history'];
            if (!valid.includes(type)) {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid type' }) };
            }
            await store.setJSON(type, data);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        if (event.httpMethod === 'DELETE') {
            await Promise.all([
                store.delete('knowledge-base'),
                store.delete('settings'),
                store.delete('last-briefing'),
                store.delete('handover-history')
            ]);
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        return { statusCode: 405, body: 'Method not allowed' };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};