import { buildReportPrompt } from './prompts/report_prompt.js';
import { pedagogik, utmaningar } from './report_content.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';
const RESEND_API = 'https://api.resend.com/emails';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function handleReportGenerate(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return { status: 400, body: { error: 'Ogiltig JSON' } };
  }

  const { profile_id } = body;
  if (!profile_id) {
    return { status: 400, body: { error: 'profile_id saknas' } };
  }

  try {
    // 1. Hämta Profiles-raden
    const profileRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profile_id}`,
      { headers: airtableHeaders(env) }
    );
    if (!profileRes.ok) {
      return { status: 404, body: { error: 'Profil ej hittad' } };
    }
    const profileRecord = await profileRes.json();

    // 2. Parsa Result JSON
    const resultRaw = profileRecord.fields?.['Result JSON'];
    if (!resultRaw) {
      return { status: 400, body: { error: 'Profilen saknar Result JSON — analysen kanske inte är klar ännu' } };
    }
    let resultJSON;
    try {
      resultJSON = JSON.parse(resultRaw);
    } catch {
      return { status: 500, body: { error: 'Kunde inte parsa Result JSON' } };
    }

    // 3. Hämta respondentens namn och e-post via User-länken
    const userIds = profileRecord.fields?.['User'];
    if (!userIds || userIds.length === 0) {
      return { status: 400, body: { error: 'Profilen saknar User-länk' } };
    }
    const userId = userIds[0];

    const userRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Users/${userId}`,
      { headers: airtableHeaders(env) }
    );
    if (!userRes.ok) {
      return { status: 500, body: { error: 'Kunde inte hämta användare' } };
    }
    const userRecord = await userRes.json();
    const name = userRecord.fields?.['Name'] || 'Respondent';
    const email = userRecord.fields?.['Email'];
    if (!email) {
      return { status: 400, body: { error: 'Användaren saknar e-postadress' } };
    }

    // 4. Hämta kontext från Answers JSON
    let kontext = 'Arbete';
    const answersRaw = profileRecord.fields?.['Answers JSON'];
    if (answersRaw) {
      try {
        const answersData = JSON.parse(answersRaw);
        kontext = answersData.situation || answersData.context || 'Arbete';
      } catch { /* default */ }
    }

    // 5. Lägg till namn, datum, kontext i resultJSON för prompten
    const enrichedResult = {
      namn: name,
      datum: new Date().toISOString().split('T')[0],
      kontext,
      ...resultJSON,
    };

    // 6. Bygg prompt
    const prompt = buildReportPrompt(enrichedResult, name);

    // 7. Anropa Claude API
    const claudeStartTime = Date.now();
    const claudeRes = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });

    const claudeData = await claudeRes.json();
    const claudeElapsed = Date.now() - claudeStartTime;
    console.log('[Claude API] elapsed:', claudeElapsed, 'ms');
    if (claudeElapsed > 25000) {
      console.warn('[Claude API] VARNING: Svarstid över 25s:', claudeElapsed, 'ms');
    }
    console.log('[Claude API] status:', claudeRes.status);
    console.log('[Claude API] stop_reason:', claudeData.stop_reason);
    console.log('[Claude API] usage:', JSON.stringify(claudeData.usage));

    if (!claudeRes.ok) {
      console.error('[Claude API] error:', JSON.stringify(claudeData));
      return { status: 500, body: { error: 'Claude API-fel vid rapportgenerering', detail: claudeData } };
    }

    const rawText = claudeData.content?.[0]?.text ?? '';
    console.log('[Claude API] rawText length:', rawText.length);

    // 8. Parsa Claude-svaret som JSON
    let jsonText = rawText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let analys;
    try {
      analys = JSON.parse(jsonText);
    } catch {
      console.error('[handleReportGenerate] Claude returnerade ogiltig JSON:', jsonText.slice(0, 300));
      console.error('[Claude svar]', rawText.substring(0, 200));
      return { status: 500, body: { error: 'Claude returnerade ogiltig JSON' } };
    }

    // 9. Kombinera statisk pedagogik + dynamisk analys till ett objekt
    const rapport = {
      pedagogik,
      utmaningar,
      analys,
    };

    // 10. Generera unik rapport-token
    const token = crypto.randomUUID();

    // 11. Spara på Profiles-raden i Airtable
    const patchRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profile_id}`,
      {
        method: 'PATCH',
        headers: { ...airtableHeaders(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Report Text': JSON.stringify(rapport),
            'Report Token': token,
            'Report Generated At': new Date().toISOString(),
          },
        }),
      }
    );

    if (!patchRes.ok) {
      console.error('[handleReportGenerate] Airtable PATCH fel:', patchRes.status);
      return { status: 500, body: { error: 'Kunde inte spara rapport i Airtable' } };
    }

    // 12. Skicka e-post via Resend
    const reportUrl = `https://sprakmonsterlabbet.holmbergfriends.com/rapport.html?token=${token}`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;background:#f8f8f8;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f8f8;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#534AB7;padding:32px 40px;">
    <div style="font-family:Georgia,serif;font-size:22px;color:#ffffff;font-weight:300;">Språkmönsterlabbet</div>
  </td></tr>
  <tr><td style="padding:40px;">
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 16px;">Hej ${name},</p>
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 24px;">Din kommunikationsrapport är nu klar.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td style="background:#534AB7;border-radius:4px;padding:14px 28px;">
      <a href="${reportUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">Läs din rapport →</a>
    </td></tr>
    </table>
    <p style="font-size:14px;color:#5A5A5A;line-height:1.6;margin:0 0 8px;">
      Rapporten är personlig och gäller dina kommunikationstendenser i det sammanhang du angav.
      Vi rekommenderar att du läser den tillsammans med din coach.
    </p>
  </td></tr>
  <tr><td style="padding:24px 40px;border-top:1px solid #E2E2E2;">
    <p style="font-size:12px;color:#999999;margin:0;">holmberg &amp; friends</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

    const resendRes = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'noreply@holmbergfriends.com',
        to: email,
        subject: 'Din kommunikationsrapport från Språkmönsterlabbet',
        html: emailHtml,
      }),
    });

    if (!resendRes.ok) {
      const resendErr = await resendRes.text().catch(() => '');
      console.error('[handleReportGenerate] Resend fel:', resendRes.status, resendErr);
      // Rapport sparad men e-post misslyckades — returnera ändå success
    }

    console.log('[handleReportGenerate] Rapport genererad för:', name, '→ token:', token);

    return {
      status: 200,
      body: { success: true, token, profile_id, email },
    };
  } catch (err) {
    console.error('[handleReportGenerate] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel vid rapportgenerering' } };
  }
}

export async function handleReportByProfile(request, env) {
  const url = new URL(request.url);
  const profileId = url.searchParams.get('profile_id');

  if (!profileId) {
    return { status: 400, body: { error: 'profile_id saknas' } };
  }

  try {
    const res = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`,
      { headers: airtableHeaders(env) }
    );
    if (!res.ok) {
      return { status: 404, body: { error: 'Profil ej hittad' } };
    }
    const record = await res.json();
    const token = record.fields?.['Report Token'] || null;
    const reportText = record.fields?.['Report Text'] || null;

    return {
      status: 200,
      body: { token, ready: !!(token && reportText) },
    };
  } catch (err) {
    console.error('[handleReportByProfile] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}

export async function handleGetReport(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return { status: 400, body: { error: 'Token saknas' } };
  }

  try {
    // Sök Profiles-raden via Report Token
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
    const reportTextRaw = record.fields?.['Report Text'];
    const resultJsonRaw = record.fields?.['Result JSON'];
    const generatedAt = record.fields?.['Report Generated At'];

    if (!reportTextRaw) {
      return { status: 404, body: { error: 'Rapport ej hittad' } };
    }

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

    let resultJson = null;
    if (resultJsonRaw) {
      try { resultJson = JSON.parse(resultJsonRaw); } catch { /* ignore */ }
    }

    // Hämta situation från Answers JSON
    let situation = 'Arbete';
    const answersRaw = record.fields?.['Answers JSON'];
    if (answersRaw) {
      try {
        const answersData = JSON.parse(answersRaw);
        situation = answersData.situation || answersData.context || 'Arbete';
      } catch { /* default */ }
    }

    // Parsa rapport-objektet (pedagogik + analys)
    let rapport = null;
    try {
      rapport = JSON.parse(reportTextRaw);
    } catch {
      // Fallback: gammalt format (ren text)
      rapport = null;
    }

    return {
      status: 200,
      body: {
        name,
        profile_id: record.id,
        rapport,
        report_text: rapport ? null : reportTextRaw,
        result_json: resultJson,
        generated_at: generatedAt,
        situation,
      },
    };
  } catch (err) {
    console.error('[handleGetReport] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}
