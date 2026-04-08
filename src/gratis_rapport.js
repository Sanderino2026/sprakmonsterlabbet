import { pedagogik } from './report_content.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function handleGratisRapport(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return { status: 400, body: { error: 'Token saknas' } };
  }

  try {
    // 1. Sök Profiles-raden via Report Token
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

    // Hämta situation från Answers JSON
    let situation = 'Arbete';
    const answersRaw = record.fields?.['Answers JSON'];
    if (answersRaw) {
      try {
        const answersData = JSON.parse(answersRaw);
        situation = answersData.situation || answersData.context || 'Arbete';
      } catch { /* default */ }
    }

    // Parsa Result JSON för skala/signal/styrka
    let resultJson = null;
    if (resultJsonRaw) {
      try { resultJson = JSON.parse(resultJsonRaw); } catch { /* ignore */ }
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
        profile_id: record.id,
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
