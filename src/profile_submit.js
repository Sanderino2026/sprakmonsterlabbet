import { saveProfileResponse } from './airtable.js';
import { runProfileAnalysis } from './profile_analyse.js';
import { handleReportGenerate } from './report_generate.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function handleProfileSubmit(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'Ogiltig JSON' } };
  }

  const { first_name, email, context, situation, answers, word_clicks, response_times_ms, gift_token } = body;

  // Validera obligatoriska fält
  if (!first_name || !email || !answers || !word_clicks || !response_times_ms) {
    return { status: 400, body: { error: 'Alla fält måste fyllas i' } };
  }

  // Validera e-postformat
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 400, body: { error: 'Ogiltig e-postadress' } };
  }

  // Validera att alla fem svar finns och har minst 20 tecken
  for (const key of ['q1', 'q2', 'q3', 'q4', 'q5']) {
    if (!answers[key] || answers[key].trim().length < 20) {
      return { status: 400, body: { error: `Svar ${key} saknas eller är för kort (minst 20 tecken)` } };
    }
  }

  // Validera ordval — exakt 5
  if (!Array.isArray(word_clicks) || word_clicks.length !== 5) {
    return { status: 400, body: { error: 'Exakt 5 ord måste väljas' } };
  }

  try {
    // ── Present-flöde: gift_token finns ──
    if (gift_token) {
      return await handleGiftSubmit(env, ctx, {
        gift_token, first_name, email, context, situation,
        answers, word_clicks, response_times_ms,
      });
    }

    // ── Normalt flöde ──
    const profileId = await saveProfileResponse(env, {
      first_name,
      email,
      context: context || 'Arbete',
      situation: situation || context || 'Arbete',
      answers,
      word_clicks,
      response_times_ms,
    });

    // Skicka bekräftelsemail
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'holmberg & friends <friends@holmbergfriends.com>',
          to: email,
          subject: 'Dina svar är mottagna — din språkmönsterprofil',
          html: `<p>Hej ${first_name},</p><p>Tack för att du fyllt i din språkmönsterprofil. Vi analyserar dina svar och återkommer inom 2 arbetsdagar med din rapport.</p><p>/ holmberg & friends</p>`,
        }),
      });
    } catch (mailErr) {
      console.error('[handleProfileSubmit] Bekräftelsemail misslyckades:', mailErr);
    }

    // Trigga Claude-analysen asynkront — körs i bakgrunden efter att svaret skickats
    const backgroundWork = async () => {
      try {
        await runProfileAnalysis(env, profileId);
        console.log('[handleProfileSubmit] Analys klar för:', profileId);

        // Generera Report Token och spara på Profiles-raden
        const token = crypto.randomUUID();
        await fetch(`${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`, {
          method: 'PATCH',
          headers: { ...airtableHeaders(env), 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: { 'Report Token': token } }),
        });
        console.log('[handleProfileSubmit] Report Token sparat:', token);

        // Skicka mail med länk till gratisrapporten
        const rapportUrl = `https://sprakmonsterlabbet.holmbergfriends.com/gratis-rapport.html?token=${token}`;
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'holmberg & friends <friends@holmbergfriends.com>',
            to: email,
            subject: 'Din språkmönsterprofil är klar',
            html: `<p>Hej ${first_name},</p><p>Din språkmönsterprofil är nu klar. Klicka på länken nedan för att se ditt resultat:</p><p><a href="${rapportUrl}">${rapportUrl}</a></p><p>/ holmberg & friends</p>`,
          }),
        });
        console.log('[handleProfileSubmit] Gratisrapport-mail skickat till:', email);
      } catch (err) {
        console.error('[handleProfileSubmit] Bakgrundsarbete misslyckades:', err);
      }
    };

    if (ctx && ctx.waitUntil) {
      ctx.waitUntil(backgroundWork());
    }

    return { status: 200, body: { success: true, profile_id: profileId } };
  } catch (err) {
    console.error('[handleProfileSubmit] Fel:', err);
    return { status: 500, body: { error: 'Kunde inte spara svar' } };
  }
}

async function handleGiftSubmit(env, ctx, data) {
  const { gift_token, first_name, email, context, situation, answers, word_clicks, response_times_ms } = data;

  // 1. Hitta Profiles-raden via gift_token (Report Token)
  const formula = encodeURIComponent(`{Report Token}="${gift_token.replace(/"/g, '')}"`);
  const searchRes = await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles?filterByFormula=${formula}&maxRecords=1`,
    { headers: airtableHeaders(env) }
  );

  if (!searchRes.ok) {
    console.error('[handleGiftSubmit] Airtable-sökning misslyckades:', searchRes.status);
    return { status: 500, body: { error: 'Kunde inte söka present-profil' } };
  }

  const searchData = await searchRes.json();
  if (!searchData.records || searchData.records.length === 0) {
    console.error('[handleGiftSubmit] Ingen profil hittad för gift_token:', gift_token);
    return { status: 404, body: { error: 'Present-länk ej giltig' } };
  }

  const giftRecord = searchData.records[0];
  const giftProfileId = giftRecord.id;

  // 2. Skapa/hitta User för mottagaren (via saveProfileResponse som vanligt)
  const profileId = await saveProfileResponse(env, {
    first_name,
    email,
    context: context || 'Arbete',
    situation: situation || context || 'Arbete',
    answers,
    word_clicks,
    response_times_ms,
  });

  // 3. Hämta den nyskapade profilen för att få User-länken
  const newProfileRes = await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`,
    { headers: airtableHeaders(env) }
  );
  const newProfileData = await newProfileRes.json();
  const userId = newProfileData.fields?.['User']?.[0];

  // 4. Uppdatera present-profilen med svar, User-länk och ändra Profile Type
  const answersJson = JSON.stringify({
    answers,
    word_clicks,
    response_times_ms,
    context: context || 'Arbete',
    situation: situation || context || 'Arbete',
    gift: true,
    gifted_by_profile_id: giftRecord.fields?.['Answers JSON']
      ? (() => { try { return JSON.parse(giftRecord.fields['Answers JSON']).gifted_by_profile_id; } catch { return null; } })()
      : null,
    submitted_at: new Date().toISOString(),
  });

  const updateFields = {
    'Answers JSON': answersJson,
    'Profile Type': 'individual',
  };
  if (userId) {
    updateFields['User'] = [userId];
  }

  await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${giftProfileId}`,
    {
      method: 'PATCH',
      headers: { ...airtableHeaders(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: updateFields }),
    }
  );

  // 5. Ta bort den extra profilen som saveProfileResponse skapade (vi använder present-profilen)
  if (profileId !== giftProfileId) {
    await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`,
      { method: 'DELETE', headers: airtableHeaders(env) }
    );
  }

  // 6. Trigga analys + rapportgenerering asynkront
  const giftFlow = async () => {
    try {
      // Kör Claude-analysen
      await runProfileAnalysis(env, giftProfileId);
      console.log('[handleGiftSubmit] Analys klar för:', giftProfileId);

      // Generera och skicka rapport (present-köparen har redan betalat)
      const fakeRequest = { json: async () => ({ profile_id: giftProfileId }) };
      const result = await handleReportGenerate(fakeRequest, env);
      console.log('[handleGiftSubmit] Rapport genererad:', result.status);
    } catch (err) {
      console.error('[handleGiftSubmit] Fel i analys/rapport-kedjan:', err);
    }
  };

  if (ctx && ctx.waitUntil) {
    ctx.waitUntil(giftFlow());
  }

  return { status: 200, body: { success: true, profile_id: giftProfileId } };
}
