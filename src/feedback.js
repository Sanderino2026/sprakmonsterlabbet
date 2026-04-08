import { saveFeedback, findOrCreateLead, setRemainingAnalyses } from './airtable.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

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

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${env.RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'noreply@holmbergfriends.com',
        to: email,
        subject: 'Tack för din feedback — här är dina 10 analyser',
        html: `
          <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <img src="https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/69c7ba3c-da19-4b2e-a0d7-771a8cd9844a/glad.png?content-type=image%2Fpng" alt="Sprak" style="width:120px;display:block;margin:0 auto 24px auto;" />
            <h2 style="text-align:center;">Tack!</h2>
            <p>Du har nu fått 10 analyser på Språkmönsterlabbet som tack för din feedback.</p>
            <p style="text-align:center;margin-top:32px;">
              <a href="https://www.holmbergfriends.com/sprakmonsterlabbet-analys" style="background:#000;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;">Gå till labbet →</a>
            </p>
          </div>
        `
      })
    });
    console.log('Resend svar:', resendRes.status, await resendRes.text());
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
    const formula = encodeURIComponent(`{Report Token}="${token.replace(/"/g, '')}"`);
    const searchRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles?filterByFormula=${formula}&maxRecords=1`,
      { headers: airtableHeaders(env) }
    );

    if (!searchRes.ok) {
      return { status: 500, body: { error: 'Kunde inte söka i Airtable' } };
    }

    const searchData = await searchRes.json();
    if (!searchData.records || searchData.records.length === 0) {
      return { status: 404, body: { error: 'Rapport ej hittad' } };
    }

    const record = searchData.records[0];
    const profileId = record.id;

    // Hämta namn via User-länk
    let name = 'Respondent';
    const userIds = record.fields?.['User'];
    if (userIds && userIds.length > 0) {
      const userRes = await fetch(
        `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${userIds[0]}`,
        { headers: airtableHeaders(env) }
      );
      if (userRes.ok) {
        const userData = await userRes.json();
        name = userData.fields?.['Name'] || 'Respondent';
      }
    }

    return {
      status: 200,
      body: { name, profile_id: profileId },
    };
  } catch (err) {
    console.error('[handleFeedbackReport] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}
