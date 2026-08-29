// ── POST /api/profile/submit-free ─────────────────────────────────
// Gratisflödet: 1 fritextfråga + 8 binära Förståelse-frågor.
// Fritexten analyseras via Claude (analyse_standalone_prompt).
// Sammanvägd signal: binära (max 8p) + fritext (2p eller 0p).

import { findUserByEmail } from './airtable.js';
import { STANDALONE_ANALYSE_PROMPT } from './prompts/analyse_standalone_prompt.js';

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function analyseFreeText(text, env) {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: STANDALONE_ANALYSE_PROMPT,
        messages: [{ role: 'user', content: `Analysera språkmönstren i:\n\n"${text}"` }],
      }),
    });

    if (!res.ok) {
      console.error('[analyseFreeText] API-fel:', res.status);
      return null;
    }

    const data = await res.json().catch(() => null);
    const raw = data?.content?.[0]?.text ?? null;
    if (!raw) return null;

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.patterns)) return null;

    // Find the Förståelse pattern
    const forstaelse = parsed.patterns.find(p => p.category === 'Förståelse');
    if (!forstaelse) return null;

    const dominant = forstaelse.dominant;
    if (dominant === 'Procedur' || dominant === 'Alternativ') {
      return dominant;
    }
    return null; // Blandad or unknown = 0 points
  } catch (err) {
    console.error('[analyseFreeText] Fel:', err);
    return null;
  }
}

export async function handleFreeProfileSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'Ogiltig JSON' } };
  }

  const { first_name, email, nyhetsbrev_opt, free_text, free_answers } = body;

  // Validera obligatoriska fält
  if (!first_name || !email || !free_text || !Array.isArray(free_answers) || free_answers.length !== 8) {
    return { status: 400, body: { error: 'Alla fält måste fyllas i (namn, e-post, fritext, 8 svar)' } };
  }

  if (free_text.trim().length < 40) {
    return { status: 400, body: { error: 'Fritexten måste vara minst 40 tecken' } };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { error: 'Ogiltig e-postadress' } };
  }

  for (const a of free_answers) {
    if (!a.fraga || !['Procedur', 'Alternativ'].includes(a.svar)) {
      return { status: 400, body: { error: 'Ogiltigt svarsformat' } };
    }
  }

  try {
    // Hitta eller skapa användare
    let userId;
    const existing = await findUserByEmail(email, env);

    if (existing) {
      userId = existing.id;
    } else {
      userId = generateId();
      await env.SML_DB.prepare(
        'INSERT INTO anvandare (id, epost, namn, access_type, status) VALUES (?, ?, ?, ?, ?)'
      ).bind(userId, email, first_name, 'guest', 'active').run();
    }

    // Binära poäng
    let procedurBinary = 0;
    let alternativBinary = 0;
    for (const a of free_answers) {
      if (a.svar === 'Procedur') procedurBinary++;
      else alternativBinary++;
    }

    // AI-analys av fritext
    const aiSignal = await analyseFreeText(free_text.trim(), env);
    let procedurAi = 0;
    let alternativAi = 0;
    if (aiSignal === 'Procedur') procedurAi = 2;
    else if (aiSignal === 'Alternativ') alternativAi = 2;
    // else: 0 poäng (Blandad, null, error)

    const totalProcedur = procedurBinary + procedurAi;
    const totalAlternativ = alternativBinary + alternativAi;

    let signal, styrka;
    if (totalProcedur > totalAlternativ) {
      signal = 'Procedur';
      const max = totalProcedur;
      styrka = max >= 8 ? 'Tydlig' : (max >= 6 ? 'Måttlig' : 'Jämnt');
    } else if (totalAlternativ > totalProcedur) {
      signal = 'Alternativ';
      const max = totalAlternativ;
      styrka = max >= 8 ? 'Tydlig' : (max >= 6 ? 'Måttlig' : 'Jämnt');
    } else {
      signal = 'Jämnt';
      styrka = 'Jämnt';
    }

    const svarJson = JSON.stringify({
      flow: 'free_v2',
      free_text: free_text.trim(),
      free_answers,
      ai_signal: aiSignal,
      procedur_binary: procedurBinary,
      alternativ_binary: alternativBinary,
      procedur_total: totalProcedur,
      alternativ_total: totalAlternativ,
      submitted_at: new Date().toISOString(),
    });

    const profilJson = JSON.stringify({
      förståelse: {
        signal,
        styrka,
        skala: Math.round((Math.max(totalProcedur, totalAlternativ) / 10) * 10),
        evidens: [`${procedurBinary} av 8 binära åt Procedur`, `${alternativBinary} av 8 binära åt Alternativ`, `Fritext: ${aiSignal || 'ej analyserad'}`],
        procedur_total: totalProcedur,
        alternativ_total: totalAlternativ,
      },
    });

    const profileId = generateId();
    await env.SML_DB.prepare(
      'INSERT INTO profil (id, anvandare_id, svar_json, profil_json) VALUES (?, ?, ?, ?)'
    ).bind(profileId, userId, svarJson, profilJson).run();

    return {
      status: 200,
      body: {
        success: true,
        profile_id: profileId,
        förståelse: {
          signal,
          styrka,
          procedur_total: totalProcedur,
          alternativ_total: totalAlternativ,
          ai_signal: aiSignal,
        },
      },
    };
  } catch (err) {
    console.error('[handleFreeProfileSubmit] Fel:', err);
    return { status: 500, body: { error: 'Kunde inte spara svar' } };
  }
}
