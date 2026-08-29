import { requireUsage } from './usage.js';
import { saveProfile } from './airtable.js';
import { PROFILE_SYSTEM_PROMPT } from './prompts/profile_prompt.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1000;
const MIN_ANSWERS = 4;

export async function handleProfile(request, user, env) {
  const body = await request.json().catch(() => null);
  const answers = body?.answers;

  // Validera input
  if (!Array.isArray(answers)) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'Svar saknas.' } };
  }

  const valid = answers.filter(a => typeof a.answer === 'string' && a.answer.trim().length > 5);

  if (valid.length < MIN_ANSWERS) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'För få svar för att skapa profil.' } };
  }

  // Kontrollera sessionsgräns och logga session
  const blocked = await requireUsage(user, 'profile', env);
  if (blocked) return blocked;

  // Anropa Claude
  const raw = await callClaude(valid, env);
  if (!raw) {
    return { status: 502, body: { ok: false, error: 'invalid_ai_response', message: 'Kunde inte skapa profil.' } };
  }

  // Validera JSON-svar
  const result = parseResult(raw);
  if (!result) {
    return { status: 502, body: { ok: false, error: 'invalid_ai_response', message: 'Kunde inte skapa profil.' } };
  }

  // Spara i Airtable (asynkront)
  saveProfile(user.id, valid, result, env).catch(() => {});

  return { status: 200, body: { ok: true, result } };
}

async function callClaude(answers, env) {
  const userMessage = answers
    .map(a => `[${a.question_id ?? ''}] ${a.question ?? ''}\nSvar: "${a.answer.trim()}"`)
    .join('\n\n');

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
      system: PROFILE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
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
    if (!Array.isArray(parsed.profile) || !parsed.communication_style || !parsed.development_hint) return null;
    return parsed;
  } catch {
    return null;
  }
}
