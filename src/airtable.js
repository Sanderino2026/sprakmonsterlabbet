const AIRTABLE_API = 'https://api.airtable.com/v0';

function headers(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function findUserByEmail(email, env) {
  const formula = encodeURIComponent(`LOWER({Email})=LOWER("${email.replace(/"/g, '')}")`);
  const url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users?filterByFormula=${formula}&maxRecords=1`;
  const res = await fetch(url, { headers: headers(env) });
  const data = await res.json();

  if (!data.records || data.records.length === 0) return null;

  const r = data.records[0];
  return {
    id: r.id,
    email: r.fields['Email'],
    name: r.fields['Name'],
    access_type: r.fields['Access Type'],
    status: r.fields['Status'],
    used_sessions: r.fields['Used Sessions'] ?? 0,
    standalone_analyses: r.fields['Standalone Analyses'] ?? 0,
    remaining_analyses: r.fields['Remaining Analyses'] ?? 0,
  };
}

export async function findUserByRecordId(recordId, env) {
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    headers: headers(env),
  });
  if (!res.ok) return null;
  const r = await res.json().catch(() => null);
  if (!r?.fields) return null;
  return {
    id: r.id,
    email: r.fields['Email'] ?? null,
    access_type: r.fields['Access Type'] ?? null,
    remaining_analyses: r.fields['Remaining Analyses'] ?? 0,
  };
}

export async function createGuestRecord(env) {
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'Access Type': 'guest',
        'Status': 'active',
        'Remaining Analyses': 3,
      },
    }),
  });
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

export async function decrementAnalysis(recordId, env) {
  const getRes = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    headers: headers(env),
  });
  if (!getRes.ok) {
    throw new Error(`[decrementAnalysis] GET misslyckades: ${getRes.status}`);
  }
  const data = await getRes.json().catch(() => null);
  const current = data?.fields?.['Remaining Analyses'] ?? 0;
  const next = Math.max(0, current - 1);
  console.log(`[decrementAnalysis] recordId: ${recordId} | current: ${current} | next: ${next}`);
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Remaining Analyses': next } }),
  });
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
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Remaining Analyses': Math.max(0, current - 1) } }),
  });
}


export async function updateLastLogin(recordId, env) {
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Last Login At': new Date().toISOString() } }),
  });
}

export async function createSession(userId, moduleType, env) {
  const sessionKey = crypto.randomUUID();
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Sessions`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'User': [userId],
        'Module Type': moduleType,
        'Source': 'web',
        'Session Key': sessionKey,
      },
    }),
  });
  return sessionKey;
}

export async function saveProfile(userId, answers, result, env) {
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'User': [userId],
        'Answers JSON': JSON.stringify(answers),
        'Result JSON': JSON.stringify(result),
        'Communication Style': result.communication_style ?? '',
        'Development Hint': result.development_hint ?? '',
      },
    }),
  });
}

// Hämta slumpmässig aktiv kuraterad övning
export async function getRandomExercise(env) {
  const formula = encodeURIComponent(`AND({Status}="active",{Source Type}="curated")`);
  const url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Exercises?filterByFormula=${formula}&maxRecords=100`;
  const res = await fetch(url, { headers: headers(env) });
  const data = await res.json();

  if (!data.records || data.records.length === 0) return null;

  const r = data.records[Math.floor(Math.random() * data.records.length)];
  return mapExercise(r);
}

// Hämta specifik övning med Airtable record ID
export async function getExerciseById(recordId, env) {
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Exercises/${recordId}`, {
    headers: headers(env),
  });
  if (!res.ok) return null;
  const r = await res.json();
  return mapExercise(r);
}

function mapExercise(r) {
  const f = r.fields;
  return {
    exercise_id: r.id,
    source_type: f['Source Type'] ?? 'curated',
    category: f['Category'] ?? null,
    pattern_category: f['Pattern Category'] ?? null,
    pattern_signal: f['Pattern Signal'] ?? null,
    text: f['Text'] ?? '',
    question: f['Question'] ?? '',
    options: [f['Option 1'], f['Option 2'], f['Option 3'], f['Option 4']].filter(Boolean),
    // correct_index och explanation används bara internt (returneras inte i GET-svaret)
    correct_index: f['Correct Index'] ?? 0,
    explanation: f['Explanation'] ?? '',
  };
}

// Spara övningsförsök — använder faktiska Airtable-fältnamn (avviker från spec)
export async function saveExerciseAttempt(userId, exerciseId, selectedIndex, isCorrect, env) {
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Exercise Attempts`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'User': [userId],
        'Exercise': [exerciseId],
        'Selected Option Index': selectedIndex,
        'Correct': isCorrect,
      },
    }),
  });
}

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

  const fields = { 'Access Type': config.accessType };
  if (config.remainingSet !== undefined) {
    fields['Remaining Analyses'] = config.remainingSet;
  } else {
    fields['Remaining Analyses'] = (user?.remaining_analyses ?? 0) + config.remainingDelta;
  }

  if (user) {
    await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${user.id}`, {
      method: 'PATCH',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
  } else {
    await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users`, {
      method: 'POST',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Email': email,
          'Status': 'active',
          ...fields,
        },
      }),
    });
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
  const fields = { 'Access Type': config.accessType };
  if (config.remainingSet !== undefined) {
    fields['Remaining Analyses'] = config.remainingSet;
  } else {
    fields['Remaining Analyses'] = (current?.remaining_analyses ?? 0) + config.remainingDelta;
  }

  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export async function findOrCreateLead(email, env) {
  const existing = await findUserByEmail(email, env);
  if (existing) return;
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'Email': email,
        'Access Type': 'lead',
        'Status': 'active',
      },
    }),
  });
}

export async function resetMonthlyAnalyses(env) {
  const formula = encodeURIComponent(`OR({Access Type}="paid_monthly",{Access Type}="paid_yearly")`);
  let offset = null;
  let updated = 0;

  do {
    const url = `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users?filterByFormula=${formula}&pageSize=100${offset ? `&offset=${offset}` : ''}`;
    const res = await fetch(url, { headers: headers(env) });
    const data = await res.json().catch(() => null);

    if (!data?.records?.length) break;

    for (const record of data.records) {
      await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${record.id}`, {
        method: 'PATCH',
        headers: { ...headers(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Remaining Analyses': 20 } }),
      });
      updated++;
    }

    offset = data.offset ?? null;
  } while (offset);

  console.log(`[resetMonthlyAnalyses] Återställde ${updated} poster till 20 analyser`);
  return { updated };
}

export async function saveFeedback(data, env) {
  const airtableRes = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Feedback`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'Email': data.email ?? '',
        'Profile ID': data.profile_id ?? '',
        'Träffsäker': data.traffsakker ?? null,
        'Mest användbart': data.mest_anvandbart ?? '',
        'Saknades eller otydligt': data.saknades ?? '',
        'Skulle du använda det': data.skulle_anvanda ?? '',
        'Övriga tankar': data.ovriga_tankar ?? '',
        'Betalningsvilja': data.betalningsvilja ?? '',
      },
    }),
  });
  await airtableRes.json();
}

export async function setRemainingAnalyses(email, antal, env) {
  const user = await findUserByEmail(email, env);
  let recordId;
  if (user) {
    recordId = user.id;
  } else {
    recordId = await createGuestRecord(env);
    if (recordId) {
      await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
        method: 'PATCH',
        headers: { ...headers(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: { 'Email': email } }),
      });
    }
  }
  if (!recordId) return;
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${recordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Remaining Analyses': antal } }),
  });
}

export async function saveAnalysis(userId, inputText, result, env) {
  const res = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Analyses`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'User': [userId],
        'Input Text': inputText,
        'Result JSON': JSON.stringify(result),
        'Summary': result.summary ?? '',
      },
    }),
  });
  const data = await res.json().catch(() => null);
  return data?.id ?? null;
}

export async function saveProfileResponse(env, data) {
  const { first_name, email, context, situation, answers, word_clicks, response_times_ms } = data;

  // 1. Sök om e-posten redan finns i Users
  let userId;
  const existing = await findUserByEmail(email, env);

  if (existing) {
    userId = existing.id;
  } else {
    // 2. Skapa ny användare med Access Type "respondent"
    const createRes = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users`, {
      method: 'POST',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Name': first_name,
          'Email': email,
          'Access Type': 'guest',
          'Status': 'active',
        },
      }),
    });
    const created = await createRes.json().catch(() => null);
    if (!created?.id) throw new Error('Kunde inte skapa användare i Airtable');
    userId = created.id;
  }

  // 3. Spara i Profiles-tabellen
  const profileRes = await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles`, {
    method: 'POST',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fields: {
        'User': [userId],
        'Answers JSON': JSON.stringify({
          answers,
          word_clicks,
          response_times_ms,
          context: context || 'Arbete',
          situation: situation || context || 'Arbete',
          submitted_at: new Date().toISOString(),
        }),
      },
    }),
  });
  const profileData = await profileRes.json().catch(() => null);
  if (!profileData?.id) throw new Error('Kunde inte spara profil i Airtable');

  return profileData.id;
}

export async function saveToLeadsTable(env, data) {
  const LEADS_TABLE_URL = `${AIRTABLE_API}/${env.LEADS_BASE_ID}/tblSIQ6Z78Jpo366s`;
  const { email, name, source } = data;

  if (!email) return null;

  try {
    // 1. Sök om email redan finns
    const formula = encodeURIComponent(`LOWER({Email})=LOWER("${email.replace(/"/g, '')}")`);
    const searchRes = await fetch(
      `${LEADS_TABLE_URL}?filterByFormula=${formula}&maxRecords=1`,
      { headers: headers(env) }
    );
    const searchData = await searchRes.json();

    if (searchData.records && searchData.records.length > 0) {
      console.log('[saveToLeadsTable] Lead finns redan:', email);
      return searchData.records[0].id;
    }

    // 2. Skapa ny lead
    const fields = {
      'Email': email,
      'Source': source || 'manual',
      'Status': 'new',
    };
    if (name) fields['Name'] = name;

    const createRes = await fetch(LEADS_TABLE_URL, {
      method: 'POST',
      headers: { ...headers(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    const created = await createRes.json();
    console.log('[saveToLeadsTable] Ny lead skapad:', email, '→', created?.id);
    return created?.id ?? null;
  } catch (err) {
    console.error('[saveToLeadsTable] Fel:', err);
    return null;
  }
}

export async function rateAnalysis(analysisRecordId, rating, env) {
  await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Analyses/${analysisRecordId}`, {
    method: 'PATCH',
    headers: { ...headers(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { 'Accuracy Rating': rating } }),
  });
}
