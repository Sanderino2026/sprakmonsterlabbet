import { buildReportPrompt } from './prompts/report_prompt.js';
import { pedagogik, utmaningar } from './report_content.js';
import { skickaSmlMail } from './sml_mail.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

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
    const profileRow = await env.SML_DB.prepare(
      'SELECT * FROM profil WHERE id = ?'
    ).bind(profile_id).first();

    if (!profileRow) {
      return { status: 404, body: { error: 'Profil ej hittad' } };
    }

    // 2. Parsa Result JSON
    const resultRaw = profileRow.profil_json;
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
    const userId = profileRow.anvandare_id;
    if (!userId) {
      return { status: 400, body: { error: 'Profilen saknar User-länk' } };
    }

    const userRow = await env.SML_DB.prepare(
      'SELECT * FROM anvandare WHERE id = ?'
    ).bind(userId).first();

    if (!userRow) {
      return { status: 500, body: { error: 'Kunde inte hämta användare' } };
    }
    const name = userRow.namn || 'Respondent';
    const email = userRow.epost;
    if (!email) {
      return { status: 400, body: { error: 'Användaren saknar e-postadress' } };
    }

    // 4. Hämta kontext från Answers JSON
    let kontext = 'Arbete';
    if (profileRow.svar_json) {
      try {
        const answersData = JSON.parse(profileRow.svar_json);
        kontext = answersData.situation || answersData.context || 'Arbete';
      } catch { /* default */ }
    }

    // 5. Lägg till datum, kontext i resultJSON för prompten (namn utelämnat — dataminimering)
    const enrichedResult = {
      datum: new Date().toISOString().split('T')[0],
      kontext,
      ...resultJSON,
    };

    // 6. Bygg prompt
    const prompt = buildReportPrompt(enrichedResult);

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

    // 11. Spara på Profiles-raden i D1
    await env.SML_DB.prepare(
      'UPDATE profil SET profil_json = ?, rapport_token = ? WHERE id = ?'
    ).bind(JSON.stringify({ ...resultJSON, _report: rapport }), token, profile_id).run();

    // Spara rapport separat som ett JSON-fält — vi lägger det i profil_json med en wrapper
    // Egentligen: spara Report Text + Report Token
    await env.SML_DB.prepare(
      "UPDATE profil SET rapport_token = ? WHERE id = ?"
    ).bind(token, profile_id).run();

    // Vi behöver ett fält för report_text — låt oss använda en pragmatisk lösning:
    // Lagra rapport-JSON i ett nytt prep-steg. Profil-tabellen har profil_json som redan
    // innehåller Result JSON. Vi skapar en KV-liknande lösning genom att uppdatera svar_json
    // med rapport-data bifogat. Bättre: lägg rapport i profil_json som ett wrappat objekt.
    //
    // Enklast: Vi sparar rapporten + result i profil_json som { result: ..., report: ... }
    const combinedJson = JSON.stringify({ result: resultJSON, report: rapport });
    await env.SML_DB.prepare(
      'UPDATE profil SET profil_json = ?, rapport_token = ? WHERE id = ?'
    ).bind(combinedJson, token, profile_id).run();

    // 12. Skicka e-post via skickaSmlMail
    const reportUrl = `https://sprakmonsterlabbet.holmbergfriends.com/rapport.html?token=${token}`;

    await skickaSmlMail({
      mall_id: 'sml-rapport-klar',
      epost: email,
      variabler: { namn: name, rapport_url: reportUrl },
    });

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
    const row = await env.SML_DB.prepare(
      'SELECT rapport_token, profil_json FROM profil WHERE id = ?'
    ).bind(profileId).first();

    if (!row) {
      return { status: 404, body: { error: 'Profil ej hittad' } };
    }

    const token = row.rapport_token || null;
    const hasReport = !!(token && row.profil_json);

    return {
      status: 200,
      body: { token, ready: hasReport },
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
    const row = await env.SML_DB.prepare(
      'SELECT * FROM profil WHERE rapport_token = ?'
    ).bind(token).first();

    if (!row) {
      return { status: 404, body: { error: 'Rapport ej hittad' } };
    }

    // Parsa profil_json (kan vara { result, report } eller bara result)
    let resultJson = null;
    let rapport = null;
    if (row.profil_json) {
      try {
        const parsed = JSON.parse(row.profil_json);
        if (parsed.report && parsed.result) {
          rapport = parsed.report;
          resultJson = parsed.result;
        } else {
          resultJson = parsed;
        }
      } catch { /* ignore */ }
    }

    if (!rapport && !resultJson) {
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

    // Hämta situation från Answers JSON
    let situation = 'Arbete';
    if (row.svar_json) {
      try {
        const answersData = JSON.parse(row.svar_json);
        situation = answersData.situation || answersData.context || 'Arbete';
      } catch { /* default */ }
    }

    return {
      status: 200,
      body: {
        name,
        profile_id: row.id,
        rapport,
        report_text: rapport ? null : (row.profil_json || null),
        result_json: resultJson,
        generated_at: row.skapad_at,
        situation,
      },
    };
  } catch (err) {
    console.error('[handleGetReport] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}
