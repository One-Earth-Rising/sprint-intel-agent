// Merges a new handover into the rolling knowledge base.
// Streams Claude's response (re-written KB) back to the browser.

import { validateToken } from './auth.js';

const MERGE_SYSTEM = `You are the OGA Ecosystem Knowledge Base maintainer for Jan, CEO of One Earth Rising (OER). You maintain ONE canonical, compact knowledge base document that captures the current state of his work across all conversations and workstreams.

When given the existing knowledge base AND a new handover from a recent chat, your job is to produce an UPDATED knowledge base that:

1. Integrates new information from the handover into the existing structure
2. Updates statuses (e.g., "in progress" → "completed", new blockers, resolved questions)
3. Removes stale items that have been superseded
4. Adds new workstreams or topics if introduced
5. Reconciles conflicts (newest information wins unless context suggests otherwise)
6. Stays COMPACT — aim for 1500-2500 words total, never more than 3000

Output the COMPLETE updated knowledge base as plain text, structured exactly as:

=== OGA KNOWLEDGE BASE ===
Last updated: [ISO timestamp]
Version: [increment from previous]

[PURPOSE & CONTEXT]
What Jan is building, who he is, and the scope of work.

[KEY PEOPLE & PARTNERS]
Names, roles, current relationship status.

[ACTIVE WORKSTREAMS]
Each major thread with: status, recent progress, blockers, next steps.

[CURRENT STATE]
Platform / product status: what's live, what's in progress, what's planned.

[ON THE HORIZON]
Strategic items, upcoming events, decisions needed.

[KEY LEARNINGS & PRINCIPLES]
Architectural rules, working agreements, what NOT to do.

[TOOLS & RESOURCES]
URLs, accounts, infrastructure references.

=== END KNOWLEDGE BASE ===

CRITICAL RULES:
- Output ONLY the new knowledge base, no preamble or commentary
- No markdown symbols (# or **) — just bracketed section headers
- Preserve specific details (names, dates, decisions) from the existing KB unless explicitly superseded
- If the new handover contradicts the KB, the handover wins (it's newer)
- Stay terse — every sentence must earn its place`;

export default async (req) => {
    const token = req.headers.get('authorization')?.replace('Bearer ', '');
    if (!validateToken(token)) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401, headers: { 'Content-Type': 'application/json' }
        });
    }

    if (req.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }

    const { existingKB, newHandover } = await req.json();

    if (!newHandover?.trim()) {
        return new Response(JSON.stringify({ error: 'No handover provided' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const userPrompt = existingKB?.text
        ? `Here is my current knowledge base:

${existingKB.text}

---

Here is a new handover from a recent chat to integrate:

${newHandover}

Produce the updated knowledge base now. Today is ${new Date().toISOString().split('T')[0]}.`
        : `I don't have an existing knowledge base yet. Use this handover to create the initial one:

${newHandover}

Produce the initial knowledge base now. Today is ${new Date().toISOString().split('T')[0]}.`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 8000,
            stream: true,
            system: MERGE_SYSTEM,
            messages: [{ role: 'user', content: userPrompt }]
        })
    });

    if (!claudeRes.ok) {
        const errText = await claudeRes.text();
        return new Response(JSON.stringify({ error: `Claude API: ${errText}` }), {
            status: claudeRes.status, headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(claudeRes.body, {
        status: 200,
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};

export const config = { path: '/api/merge' };