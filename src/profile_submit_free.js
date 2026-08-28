// ── POST /api/profile/submit-free ─────────────────────────────────
// Gratisflödet: 4 binära Förståelse-frågor → sparar profil med
// svar_json och profil_json (enbart förståelse-dimensionen).

import { findUserByEmail } from './airtable.js';

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleFreeProfileSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'Ogiltig JSON' } };
  }

  const { first_name, email, nyhetsbrev_opt, free_answers } = body;

  // Validera obligatoriska fält
  if (!first_name || !email || !Array.isArray(free_answers) || free_answers.length !== 4) {
    return { status: 400, body: { error: 'Alla fält måste fyllas i (namn, e-post, 4 svar)' } };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { error: 'Ogiltig e-postadress' } };
  }

  // Validera att varje svar har fraga och svar
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

    // Beräkna förståelse-resultat
    let procedurCount = 0;
    let alternativCount = 0;
    for (const a of free_answers) {
      if (a.svar === 'Procedur') procedurCount++;
      else alternativCount++;
    }

    let signal, styrka;
    if (procedurCount > alternativCount) {
      signal = 'Procedur';
      styrka = procedurCount === 4 ? 'Tydlig' : 'Trolig';
    } else if (alternativCount > procedurCount) {
      signal = 'Alternativ';
      styrka = alternativCount === 4 ? 'Tydlig' : 'Trolig';
    } else {
      signal = 'Blandad';
      styrka = 'Möjlig';
    }

    const svarJson = JSON.stringify({
      flow: 'free',
      free_answers,
      submitted_at: new Date().toISOString(),
    });

    const profilJson = JSON.stringify({
      förståelse: {
        signal,
        styrka,
        skala: signal === 'Procedur' ? procedurCount * 2.5 : (signal === 'Alternativ' ? alternativCount * 2.5 : 5),
        evidens: [`${Math.max(procedurCount, alternativCount)} av 4 svar`],
      },
    });

    // Spara profil
    const profileId = generateId();
    await env.SML_DB.prepare(
      'INSERT INTO profil (id, anvandare_id, svar_json, profil_json) VALUES (?, ?, ?, ?)'
    ).bind(profileId, userId, svarJson, profilJson).run();

    return {
      status: 200,
      body: {
        success: true,
        profile_id: profileId,
        förståelse: { signal, styrka, procedur: procedurCount, alternativ: alternativCount },
      },
    };
  } catch (err) {
    console.error('[handleFreeProfileSubmit] Fel:', err);
    return { status: 500, body: { error: 'Kunde inte spara svar' } };
  }
}
