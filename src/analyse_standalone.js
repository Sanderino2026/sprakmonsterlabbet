import { findUserByRecordId, createGuestRecord, decrementAnalysis, saveAnalysis } from './airtable.js';
import { STANDALONE_ANALYSE_PROMPT } from './prompts/analyse_standalone_prompt.js';

const MODEL = 'claude-sonnet-4-20250514';
const MAX_TOKENS = 1000;

// ── POST /api/analyse-text-standalone ────────────────────────────
export async function handleAnalyseTextStandalone(request, env) {
  const body = await request.json().catch(() => null);
  const text = body?.text?.trim();

  if (!text) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'Text saknas.' } };
  }

  // ── Hämta eller skapa gästpost via guest_id från body ───────────
  const guestId = body?.guest_id ?? null;

  console.log('[standalone] guest_id från body:', guestId ?? '(saknas — ny gästrad skapas)');

  let guestRecord = null;
  if (guestId) {
    guestRecord = await findUserByRecordId(guestId, env);
    console.log('[standalone] Airtable-lookup på guestId:', guestId, '→', guestRecord ? `hittad (remaining: ${guestRecord.remaining_analyses})` : 'INTE hittad');
  }

  if (!guestRecord) {
    const newId = await createGuestRecord(env);
    if (!newId) {
      return { status: 502, body: { ok: false, error: 'guest_create_failed', message: 'Kunde inte skapa gästprofil.' } };
    }
    guestRecord = { id: newId, access_type: 'guest', remaining_analyses: 3 };
    console.log('[standalone] Ny gästrad skapad:', newId);
  }

  if ((guestRecord.remaining_analyses ?? 0) <= 0) {
    return { status: 402, body: { ok: false, error: 'limit_reached', remaining_analyses: 0, access_type: guestRecord.access_type } };
  }

  console.log('[standalone] Kör analys för guestId:', guestRecord.id, '| remaining_analyses före:', guestRecord.remaining_analyses);

  const result = await runAnalysis(text, env);
  if (!result) {
    return { status: 502, body: { ok: false, error: 'analysis_failed', message: 'Analysen misslyckades.' } };
  }

  let remaining;
  try {
    remaining = await decrementAnalysis(guestRecord.id, env);
    console.log('[standalone] decrementAnalysis klar | remaining_analyses efter:', remaining);
  } catch (err) {
    console.error('[standalone] decrementAnalysis kastade fel:', err);
    remaining = Math.max(0, (guestRecord.remaining_analyses ?? 1) - 1);
  }

  const analysisRecordId = await saveAnalysis(guestRecord.id, text, result, env).catch(() => null);

  return {
    status: 200,
    body: { ok: true, result, guest_id: guestRecord.id, remaining_analyses: remaining, access_type: guestRecord.access_type, analysis_record_id: analysisRecordId },
  };
}

// ── Claude-anrop ──────────────────────────────────────────────────
async function runAnalysis(text, env) {
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
      system: STANDALONE_ANALYSE_PROMPT,
      messages: [{ role: 'user', content: `Analysera språkmönstren i:\n\n"${text}"` }],
    }),
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  const raw = data?.content?.[0]?.text ?? null;
  if (!raw) return null;

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.patterns) || !parsed.summary) return null;
    return parsed;
  } catch {
    return null;
  }
}
