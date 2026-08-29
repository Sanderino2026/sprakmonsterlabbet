import { requireUsage } from './usage.js';
import { saveAnalysis } from './airtable.js';
import { ANALYSE_SYSTEM_PROMPT } from './prompts/analyse_prompt.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;

export async function handleAnalyseText(request, user, env) {
  // Validera input
  const body = await request.json().catch(() => null);
  const text = body?.text?.trim();

  if (!text) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'Text saknas.' } };
  }

  // Kontrollera sessionsgräns och logga session
  const blocked = await requireUsage(user, 'text_analysis', env);
  if (blocked) return blocked;

  // Anropa Claude
  const raw = await callClaude(text, env);
  if (!raw) {
    return { status: 502, body: { ok: false, error: 'invalid_ai_response', message: 'Kunde inte tolka analysen.' } };
  }

  // Validera JSON-svar
  const result = parseResult(raw);
  if (!result) {
    return { status: 502, body: { ok: false, error: 'invalid_ai_response', message: 'Kunde inte tolka analysen.' } };
  }

  // Spara i Airtable (asynkront, blockerar inte svaret)
  env && saveAnalysis(user.id, text, result, env).catch(() => {});

  return { status: 200, body: { ok: true, result } };
}

async function callClaude(text, env) {
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
      system: ANALYSE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Analysera språkmönstren i:\n\n"${text}"` }],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  return data?.content?.[0]?.text ?? null;
}

function parseResult(raw) {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.patterns) || !parsed.summary) return null;
    return parsed;
  } catch {
    return null;
  }
}
