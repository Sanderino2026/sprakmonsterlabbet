import { saveFeedback, findOrCreateLead, setRemainingAnalyses } from './airtable.js';
import { skickaSmlMail } from './sml_mail.js';

export async function handleFeedback(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return { status: 400, body: { success: false, message: 'Ogiltig förfrågan.' } };

  const { email, profile_id, traffsakker, mest_anvandbart, saknades, skulle_anvanda, ovriga_tankar, betalningsvilja } = body;

  // Rapport-feedback (via profile_id) kräver inte e-post
  if (!profile_id && !email) {
    return { status: 400, body: { success: false, message: 'E-post eller profile_id krävs.' } };
  }
  if (!traffsakker) {
    return { status: 400, body: { success: false, message: 'Betyg krävs.' } };
  }

  await saveFeedback({ email, profile_id, traffsakker, mest_anvandbart, saknades, skulle_anvanda, ovriga_tankar, betalningsvilja }, env);

  // Standalone-feedback ger 10 analyser + tack-mail
  if (email) {
    await findOrCreateLead(email, env);
    await setRemainingAnalyses(email, 10, env);

    await skickaSmlMail({
      mall_id: 'sml-feedback-tack',
      epost: email,
      variabler: {},
    });
  }

  return { status: 200, body: { success: true, message: 'Tack för din feedback!' } };
}

export async function handleFeedbackReport(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return { status: 400, body: { error: 'Token saknas' } };
  }

  try {
    const row = await env.SML_DB.prepare(
      'SELECT * FROM profil WHERE rapport_token = ?'
    ).bind(token).first();

    if (!row) {
      return { status: 404, body: { error: 'Rapport ej hittad' } };
    }

    // Hämta namn via User-länk
    let name = 'Respondent';
    if (row.anvandare_id) {
      const userRow = await env.SML_DB.prepare(
        'SELECT namn FROM anvandare WHERE id = ?'
      ).bind(row.anvandare_id).first();
      if (userRow?.namn) name = userRow.namn;
    }

    return {
      status: 200,
      body: { name, profile_id: row.id },
    };
  } catch (err) {
    console.error('[handleFeedbackReport] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}
