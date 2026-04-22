// Proxies the Claude API call. Keeps ANTHROPIC_API_KEY server-side.

import { validateToken } from './auth.js';

const SYSTEM_PROMPT = `You are the OGA Ecosystem Sprint Intelligence Agent. Your job is to synthesize a user's past conversation summaries into a clear, actionable sprint briefing so they can resume work with full context.

The user is Jan, CEO of One Earth Rising (OER), building the OGA (Ownable Game Asset) ecosystem — a gaming infrastructure platform involving brand partnerships, patent-backed tech, a design system (Heimdal Aesthetic), and multiple product surfaces.

Output format (use plain text with clear section headers, NO markdown symbols like # or *):

=== OGA SPRINT BRIEFING ===
Generated: [timestamp]

[STATE OF PLAY]
2-3 sentences on where things stand overall.

[ACTIVE WORKSTREAMS]
Bullet list of current active threads with one-line status each.

[RECENT DECISIONS]
Concrete decisions made, with context.

[OPEN QUESTIONS / BLOCKERS]
Anything unresolved.

[NEXT ACTIONS]
Prioritized list of what to do next.

[CONTEXT NOTES]
Anything else Jan should remember when resuming.

Be concise, specific, and reference actual items from the source material. Never invent details.`;

const FOCUS_PROMPTS = {
    full: 'Produce a comprehensive sprint briefing covering all workstreams.',
    recent: 'Focus only on developments from the last 48 hours.',
    blockers: 'Surface all blockers, unresolved questions, and items awaiting decision.',
    decisions: 'List the key decisions made and their rationale.',
    next: 'List concrete next actions, prioritized, with owners if identifiable.'
};

export const handler = async (event) => {
    const token = event.headers.authorization?.replace('Bearer ', '');
    if (!validateToken(token)) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method not allowed' };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
    }

    try {
        const { conversations, focus } = JSON.parse(event.body || '{}');

        if (!conversations || !Array.isArray(conversations) || conversations.length === 0) {
            return { statusCode: 400, body: JSON.stringify({ error: 'No conversations provided' }) };
        }

        const userPrompt = `${FOCUS_PROMPTS[focus] || FOCUS_PROMPTS.full}

Here are the conversation summaries / handover notes from my OGA Ecosystem project (in chronological order of addition):

${conversations.map((c, i) => `--- CONVERSATION ${i + 1} (added ${new Date(c.added).toLocaleString()}) ---\n${c.text}`).join('\n\n')}

Synthesize these into my sprint briefing for ${new Date().toLocaleDateString()}.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-5',
                max_tokens: 4000,
                system: SYSTEM_PROMPT,
                messages: [{ role: 'user', content: userPrompt }]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `Claude API: ${errText}` })
            };
        }

        const data = await response.json();
        const briefing = data.content
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                briefing,
                usage: data.usage
            })
        };
    } catch (e) {
        return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
    }
};