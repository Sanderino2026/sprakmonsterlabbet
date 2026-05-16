import { pedagogik } from './report_content.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

export async function handleGratisRapport(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return { status: 400, body: { error: 'Token saknas' } };
  }

  try {
    // 1. Sök Profiles-raden via Report Token
    const row = await env.SML_DB.prepare(
      'SELECT * FROM profil WHERE rapport_token = ?'
    ).bind(token).first();

    if (!row) {
      return { status: 404, body: { error: 'Rapport ej hittad' } };
    }

    // Parsa profil_json
    let resultJson = null;
    let reportTextRaw = null;
    if (row.profil_json) {
      try {
        const parsed = JSON.parse(row.profil_json);
        if (parsed.report && parsed.result) {
          resultJson = parsed.result;
          reportTextRaw = JSON.stringify(parsed.report);
        } else {
          resultJson = parsed;
        }
      } catch { /* ignore */ }
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

    if (!resultJson || !resultJson.förståelse) {
      return { status: 404, body: { error: 'Profildata saknas' } };
    }

    const förstData = resultJson.förståelse;
    const signal = förstData.signal || '';
    const styrka = förstData.styrka || '';
    const skala = förstData.skala || 5;

    // 2. Försök hämta förståelse-analysen från Report Text
    let analysText = null;

    if (reportTextRaw) {
      try {
        const rapport = JSON.parse(reportTextRaw);
        const analysObj = rapport?.analys?.förståelse;
        if (analysObj) {
          const parts = [];
          if (analysObj.ditt_mönster) parts.push(analysObj.ditt_mönster);
          if (analysObj.i_praktiken) parts.push(analysObj.i_praktiken);
          if (analysObj.hur_andra_uppfattar) parts.push(analysObj.hur_andra_uppfattar);
          if (analysObj.kommunikationstips) parts.push(analysObj.kommunikationstips);
          if (parts.length > 0) analysText = parts.join('\n\n');
        }
      } catch { /* inte JSON, ignorera */ }
    }

    // 3. Om ingen analystext finns, generera kort version via Claude
    if (!analysText) {
      analysText = await generateShortAnalysis(name, signal, styrka, skala, situation, env);
    }

    // Hämta pedagogisk text
    const pedText = pedagogik.förståelse?.text || '';

    return {
      status: 200,
      body: {
        name,
        situation,
        profile_id: row.id,
        pedagogik_text: pedText,
        förståelse: {
          signal,
          styrka,
          skala,
          analys: analysText,
        },
      },
    };
  } catch (err) {
    console.error('[handleGratisRapport] Oväntat fel:', err);
    return { status: 500, body: { error: 'Oväntat fel' } };
  }
}

async function generateShortAnalysis(name, signal, styrka, skala, situation, env) {
  const systemPrompt = `Du är en kommunikationsanalytiker för Språkmönsterlabbet. Skriv en kort, personlig analys av respondentens förståelsemönster.

REGLER:
- Kommunikationen är alltid subjektet, aldrig personen
- Skriv "din kommunikation signalerar..." INTE "du är..."
- Max 200 ord
- Varm, professionell ton
- Referera sammanhanget: ${situation}`;

  const userPrompt = `Respondent: ${name}
Mönster: Förståelse
Signal: ${signal}
Styrka: ${styrka}
Skala: ${skala}/10
Sammanhang: ${situation}

Skriv en kort personlig analys (~200 ord) av detta förståelsemönster.`;

  try {
    const res = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      console.error('[generateShortAnalysis] Claude API-fel:', res.status);
      return 'Analysen kunde inte genereras just nu.';
    }

    const data = await res.json();
    return data.content?.[0]?.text || 'Analysen kunde inte genereras just nu.';
  } catch (err) {
    console.error('[generateShortAnalysis] Nätverksfel:', err);
    return 'Analysen kunde inte genereras just nu.';
  }
}
