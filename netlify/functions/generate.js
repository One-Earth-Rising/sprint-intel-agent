// Generates a sprint briefing by reading from the rolling KB (small input!).

import { validateToken } from './auth.js';

const SYSTEM_PROMPT = `You are the OGA Ecosystem Sprint Briefing generator for Jan, CEO of One Earth Rising (OER).

You produce concise, actionable sprint briefings based on the user's current knowledge base. The KB contains everything you need — don't ask for more context.

Output format (plain text, no markdown symbols):

=== OGA SPRINT BRIEFING ===
Generated: [timestamp]

[STATE OF PLAY]
2-3 sentences on where things stand overall.

[ACTIVE WORKSTREAMS]
Bullet list with one-line status each.

[RECENT DECISIONS]
What got decided recently.

[OPEN QUESTIONS / BLOCKERS]
What's unresolved.

[NEXT ACTIONS]
Prioritized list of what to do next.

[CONTEXT NOTES]
Anything else worth remembering.

Be specific and reference actual items from the KB. Never invent details.`;

const FOCUS_PROMPTS = {
    full: 'Produce a comprehensive sprint briefing covering all workstreams.',
    recent: 'Focus on the most recent developments and active items.',
    blockers: 'Surface blockers, unresolved questions, and items awaiting decision.',
    decisions: 'List recent decisions and their rationale.',
    next: 'Prioritized next actions only, with owners if identifiable.'
};

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

    const { knowledgeBase, focus } = await req.json();

    if (!knowledgeBase?.text) {
        return new Response(JSON.stringify({ error: 'Knowledge base is empty. Add a handover first.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }

    const userPrompt = `${FOCUS_PROMPTS[focus] || FOCUS_PROMPTS.full}

Here is my current knowledge base:

${knowledgeBase.text}

Generate the sprint briefing for ${new Date().toLocaleDateString()}.`;

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

export const config = { path: '/api/generate' };