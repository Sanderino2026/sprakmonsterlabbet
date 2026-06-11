// ── D1-baserad datalagring (ersätter Airtable) ──────────────────────
// Alla funktioner behåller samma signaturer som förut så att
// anropande kod (index.js, auth.js, etc.) inte behöver ändras.

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Användare ────────────────────────────────────────────────────────

export async function findUserByEmail(email, env) {
  const row = await env.SML_DB.prepare(
    'SELECT * FROM anvandare WHERE LOWER(epost) = LOWER(?)'
  ).bind(email).first();
  if (!row) return null;
  return mapUser(row);
}

export async function findUserByRecordId(recordId, env) {
  const row = await env.SML_DB.prepare(
    'SELECT * FROM anvandare WHERE id = ?'
  ).bind(recordId).first();
  if (!row) return null;
  return mapUser(row);
}

function mapUser(row) {
  return {
    id: row.id,
    email: row.epost,
    name: row.namn,
    access_type: row.access_type ?? 'guest',
    status: row.status ?? 'active',
    used_sessions: 0,
    standalone_analyses: 0,
    remaining_analyses: row.analyser_kvar ?? 0,
  };
}

export async function createGuestRecord(env) {
  const id = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO anvandare (id, epost, access_type, status, analyser_kvar) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, `guest_${id}@tmp`, 'guest', 'active', 3).run();
  return id;
}

export async function decrementAnalysis(recordId, env) {
  const row = await env.SML_DB.prepare(
    'SELECT analyser_kvar FROM anvandare WHERE id = ?'
  ).bind(recordId).first();
  const current = row?.analyser_kvar ?? 0;
  const next = Math.max(0, current - 1);
  console.log(`[decrementAnalysis] recordId: ${recordId} | current: ${current} | next: ${next}`);
  await env.SML_DB.prepare(
    'UPDATE anvandare SET analyser_kvar = ? WHERE id = ?'
  ).bind(next, recordId).run();
  return next;
}

export async function getUserAnalysesStatus(email, env) {
  if (!email) return null;
  const user = await findUserByEmail(email, env);
  if (!user) return null;
  return {
    remaining_analyses: user.remaining_analyses,
    access_type: user.access_type,
  };
}

export async function decrementRemainingAnalyses(recordId, current, env) {
  await env.SML_DB.prepare(
    'UPDATE anvandare SET analyser_kvar = ? WHERE id = ?'
  ).bind(Math.max(0, current - 1), recordId).run();
}

export async function updateLastLogin(recordId, env) {
  await env.SML_DB.prepare(
    'UPDATE anvandare SET last_login_at = ? WHERE id = ?'
  ).bind(new Date().toISOString(), recordId).run();
}

// ── Sessions ─────────────────────────────────────────────────────────

export async function createSession(userId, moduleType, env) {
  const id = generateId();
  const sessionKey = crypto.randomUUID();
  const giltigTill = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.SML_DB.prepare(
    'INSERT INTO session (id, anvandare_id, token, giltig_till) VALUES (?, ?, ?, ?)'
  ).bind(id, userId, sessionKey, giltigTill).run();
  return sessionKey;
}

// ── Profiler ─────────────────────────────────────────────────────────

export async function saveProfile(userId, answers, result, env) {
  const id = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO profil (id, anvandare_id, svar_json, profil_json, communication_style, development_hint) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    userId,
    JSON.stringify(answers),
    JSON.stringify(result),
    result.communication_style ?? '',
    result.development_hint ?? ''
  ).run();
}

export async function saveProfileResponse(env, data) {
  const { first_name, email, context, situation, answers, word_clicks, word_data, response_times_ms } = data;

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

  const profileId = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO profil (id, anvandare_id, svar_json) VALUES (?, ?, ?)'
  ).bind(
    profileId,
    userId,
    JSON.stringify({
      answers,
      word_clicks,
      word_data,
      response_times_ms,
      context: context || 'Arbete',
      situation: situation || context || 'Arbete',
      submitted_at: new Date().toISOString(),
    })
  ).run();

  return profileId;
}

// ── Analyser ─────────────────────────────────────────────────────────

export async function saveAnalysis(userId, inputText, result, env) {
  const id = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO analys (id, anvandare_id, input_text, resultat_json, summary) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, inputText, JSON.stringify(result), result.summary ?? '').run();
  return id;
}

export async function rateAnalysis(analysisRecordId, rating, env) {
  await env.SML_DB.prepare(
    'UPDATE analys SET accuracy_rating = ? WHERE id = ?'
  ).bind(rating, analysisRecordId).run();
}

// ── Övningar (exercises) ─────────────────────────────────────────────

export async function getRandomExercise(env) {
  const row = await env.SML_DB.prepare(
    "SELECT * FROM exercise WHERE status = 'active' AND source_type = 'curated' ORDER BY RANDOM() LIMIT 1"
  ).first();
  if (!row) return null;
  return mapExercise(row);
}

export async function getExerciseById(recordId, env) {
  const row = await env.SML_DB.prepare(
    'SELECT * FROM exercise WHERE id = ?'
  ).bind(recordId).first();
  if (!row) return null;
  return mapExercise(row);
}

function mapExercise(r) {
  return {
    exercise_id: r.id,
    source_type: r.source_type ?? 'curated',
    category: r.category ?? null,
    pattern_category: r.pattern_category ?? null,
    pattern_signal: r.pattern_signal ?? null,
    text: r.text_content ?? '',
    question: r.question ?? '',
    options: [r.option_1, r.option_2, r.option_3, r.option_4].filter(Boolean),
    correct_index: r.correct_index ?? 0,
    explanation: r.explanation ?? '',
  };
}

export async function saveExerciseAttempt(userId, exerciseId, selectedIndex, isCorrect, env) {
  const id = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO exercise_attempt (id, anvandare_id, exercise_id, selected_index, correct) VALUES (?, ?, ?, ?, ?)'
  ).bind(id, userId, exerciseId, selectedIndex, isCorrect ? 1 : 0).run();
}

// ── Betalning ────────────────────────────────────────────────────────

const PRICE_CONFIG = {
  'price_1T9j6zQc0eK2st18E4ezJAo0': { accessType: 'paid_once',    remainingDelta: 3  },
  'price_1T9j7LQc0eK2st18vGZHIUq5': { accessType: 'paid_monthly', remainingSet:   20 },
  'price_1T9j7cQc0eK2st18NIrthzpG': { accessType: 'paid_yearly',  remainingSet:   20 },
};

export async function updateUserAfterPayment(email, priceId, env) {
  const config = PRICE_CONFIG[priceId];
  console.log('[updateUserAfterPayment] priceId mottaget:', priceId);
  if (!config) {
    console.error('[updateUserAfterPayment] Okänt priceId — ingen matchning i PRICE_CONFIG');
    return;
  }
  console.log('[updateUserAfterPayment] Träffar case:', config.accessType, '| email:', email);

  const user = await findUserByEmail(email, env);

  const newRemaining = config.remainingSet !== undefined
    ? config.remainingSet
    : (user?.remaining_analyses ?? 0) + config.remainingDelta;

  if (user) {
    await env.SML_DB.prepare(
      'UPDATE anvandare SET access_type = ?, analyser_kvar = ? WHERE id = ?'
    ).bind(config.accessType, newRemaining, user.id).run();
  } else {
    const id = generateId();
    await env.SML_DB.prepare(
      'INSERT INTO anvandare (id, epost, access_type, status, analyser_kvar) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, email, config.accessType, 'active', newRemaining).run();
  }
}

export async function updateGuestAfterPayment(recordId, priceId, env) {
  const config = PRICE_CONFIG[priceId];
  console.log('[updateGuestAfterPayment] priceId:', priceId, '| recordId:', recordId);
  if (!config) {
    console.error('[updateGuestAfterPayment] Okänt priceId — ingen matchning i PRICE_CONFIG');
    return;
  }
  console.log('[updateGuestAfterPayment] Träffar case:', config.accessType);

  const current = await findUserByRecordId(recordId, env);
  const newRemaining = config.remainingSet !== undefined
    ? config.remainingSet
    : (current?.remaining_analyses ?? 0) + config.remainingDelta;

  await env.SML_DB.prepare(
    'UPDATE anvandare SET access_type = ?, analyser_kvar = ? WHERE id = ?'
  ).bind(config.accessType, newRemaining, recordId).run();
}

// ── Leads & feedback ─────────────────────────────────────────────────

export async function findOrCreateLead(email, env) {
  const existing = await findUserByEmail(email, env);
  if (existing) return;
  const id = generateId();
  await env.SML_DB.prepare(
    "INSERT INTO anvandare (id, epost, access_type, status) VALUES (?, ?, 'lead', 'active')"
  ).bind(id, email).run();
}

export async function saveFeedback(data, env) {
  const id = generateId();
  await env.SML_DB.prepare(
    'INSERT INTO sml_feedback (id, epost, profile_id, traffsakker, mest_anvandbart, saknades, skulle_anvanda, ovriga_tankar, betalningsvilja) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    id,
    data.email ?? '',
    data.profile_id ?? '',
    data.traffsakker ?? null,
    data.mest_anvandbart ?? '',
    data.saknades ?? '',
    data.skulle_anvanda ?? '',
    data.ovriga_tankar ?? '',
    data.betalningsvilja ?? ''
  ).run();
}

export async function setRemainingAnalyses(email, antal, env) {
  const user = await findUserByEmail(email, env);
  let recordId;
  if (user) {
    recordId = user.id;
  } else {
    recordId = generateId();
    await env.SML_DB.prepare(
      "INSERT INTO anvandare (id, epost, access_type, status) VALUES (?, ?, 'guest', 'active')"
    ).bind(recordId, email).run();
  }
  await env.SML_DB.prepare(
    'UPDATE anvandare SET analyser_kvar = ? WHERE id = ?'
  ).bind(antal, recordId).run();
}

export async function saveToLeadsTable(env, data) {
  const { email, name, source } = data;
  if (!email) return null;

  try {
    const existing = await env.SML_DB.prepare(
      'SELECT id FROM sml_lead WHERE LOWER(epost) = LOWER(?)'
    ).bind(email).first();

    if (existing) {
      console.log('[saveToLeadsTable] Lead finns redan:', email);
      return existing.id;
    }

    const id = generateId();
    await env.SML_DB.prepare(
      'INSERT INTO sml_lead (id, epost, namn, kalla) VALUES (?, ?, ?, ?)'
    ).bind(id, email, name ?? null, source ?? 'manual').run();
    console.log('[saveToLeadsTable] Ny lead skapad:', email, '→', id);
    return id;
  } catch (err) {
    console.error('[saveToLeadsTable] Fel:', err);
    return null;
  }
}

// ── Cron: månatlig reset ─────────────────────────────────────────────

export async function resetMonthlyAnalyses(env) {
  const result = await env.SML_DB.prepare(
    "UPDATE anvandare SET analyser_kvar = 20 WHERE access_type IN ('paid_monthly', 'paid_yearly')"
  ).run();
  const updated = result.meta?.changes ?? 0;
  console.log(`[resetMonthlyAnalyses] Återställde ${updated} poster till 20 analyser`);
  return { updated };
}
