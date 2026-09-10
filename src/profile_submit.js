import { saveProfileResponse } from './airtable.js';
import { runProfileAnalysis } from './profile_analyse.js';
import { skickaSmlMail } from './sml_mail.js';

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleProfileSubmit(request, env, ctx) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'Ogiltig JSON' } };
  }

  const { first_name, email, context, situation, answers, word_clicks, word_data, response_times_ms, nyhetsbrev_opt, utm_source, utm_medium, utm_campaign } = body;

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
    // ── Normalt flöde ──
    const profileId = await saveProfileResponse(env, {
      first_name,
      email,
      context: context || 'Arbete',
      situation: situation || context || 'Arbete',
      answers,
      word_clicks,
      word_data,
      response_times_ms,
    });

    // Registrera lead i deep-thought
    try {
      await fetch('https://deep-thought.holmbergfriends.com/api/sml-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epost: email,
          namn: first_name,
          nyhetsbrev_opt: nyhetsbrev_opt === true,
          handelse: 'sml-profil-inskickad',
          utm: (utm_source || utm_medium || utm_campaign)
            ? { source: utm_source, medium: utm_medium, campaign: utm_campaign }
            : null,
        }),
      });
    } catch (e) {
      console.error('[handleProfileSubmit] Lead-registrering misslyckades:', e.message);
    }

    // Trigga Claude-analysen asynkront
    const backgroundWork = async () => {
      try {
        await runProfileAnalysis(env, profileId);
        console.log('[handleProfileSubmit] Analys klar för:', profileId);

        // Generera Report Token och spara på Profiles-raden
        const token = crypto.randomUUID();
        await env.SML_DB.prepare(
          'UPDATE profil SET rapport_token = ? WHERE id = ?'
        ).bind(token, profileId).run();
        console.log('[handleProfileSubmit] Report Token sparat:', token);

        // Skicka mail med länk till gratisrapporten
        const rapportUrl = `https://sprakmonsterlabbet.holmbergfriends.com/gratis-rapport.html?token=${token}`;
        await skickaSmlMail({
          mall_id: 'sml-rapport-klar',
          epost: email,
          variabler: { namn: first_name, rapport_url: rapportUrl },
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
