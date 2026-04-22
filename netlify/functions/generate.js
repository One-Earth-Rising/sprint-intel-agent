// Streaming generate endpoint — bypasses the 26s timeout by streaming
// Claude's response as Server-Sent Events (SSE) back to the browser.

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

// Netlify's modern function signature — Request in, Response out.
// This is required for streaming (the legacy handler() signature can't stream).
export default async (req) => {
    // Auth
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!validateToken(token)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const body = await req.json();
    const { conversations, focus } = body;

    if (!conversations?.length) {
        return new Response(JSON.stringify({ error: 'No conversations provided' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const userPrompt = `${FOCUS_PROMPTS[focus] || FOCUS_PROMPTS.full}

Here are the conversation summaries / handover notes from my OGA Ecosystem project (in chronological order of addition):

${conversations.map((c, i) => `--- CONVERSATION ${i + 1} (added ${new Date(c.added).toLocaleString()}) ---\n${c.text}`).join('\n\n')}

Synthesize these into my sprint briefing for ${new Date().toLocaleDateString()}.`;

    // Call Claude with streaming enabled
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 4000,
            stream: true,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }]
        })
    });

    if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return new Response(JSON.stringify({ error: `Claude API: ${errText}` }), {
            status: claudeRes.status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // Pipe Claude's SSE stream directly to the browser.
    // Netlify's edge streams the response — no function timeout applies.
    return new Response(claudeRes.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};

export const config = { path: '/api/generate' };