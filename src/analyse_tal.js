import { ANALYSE_TAL_PROMPT } from './prompts/analyse_tal_prompt.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 4000;

// ── POST /api/analyse-tal ───────────────────────────────────────
export async function handleAnalyseTal(request, env) {
  const body = await request.json().catch(() => null);
  const text = body?.text?.trim();

  if (!text || text.length < 100) {
    return { status: 400, body: { ok: false, error: 'Text saknas eller för kort (min 100 tecken).' } };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: ANALYSE_TAL_PROMPT,
      messages: [{ role: 'user', content: `Analysera språkmönstren i följande tal:\n\n"${text}"` }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[analyse-tal] Anthropic error:', res.status, err);
    return { status: 502, body: { ok: false, error: 'Analysfel' } };
  }

  const data = await res.json();
  const raw = data.content[0].text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(raw);
    if (!parsed.patterns || !Array.isArray(parsed.patterns) || parsed.patterns.length !== 5) {
      return { status: 502, body: { ok: false, error: 'Ogiltig analysstruktur' } };
    }
    return { status: 200, body: { ok: true, result: parsed } };
  } catch {
    console.error('[analyse-tal] JSON parse failed:', raw.slice(0, 200));
    return { status: 502, body: { ok: false, error: 'Kunde inte tolka analys' } };
  }
}
