// GET /api/gratis-rapport-stream?token=X
// Strömmar Claude-genererad rapport som SSE.
// Sparar i D1 och skickar mail när klar.

import { pedagogik } from './report_content.js';
import { skickaSmlMail } from './sml_mail.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function handleGratisRapportStream(request, env) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return new Response('data: {"error":"Token saknas"}\n\n', {
      headers: sseHeaders(request),
    });
  }

  // 1. Hämta profil
  const row = await env.SML_DB.prepare(
    'SELECT * FROM profil WHERE rapport_token = ?'
  ).bind(token).first();

  if (!row) {
    return new Response('data: {"error":"Rapport ej hittad"}\n\n', {
      headers: sseHeaders(request),
    });
  }

  let resultJson = null;
  if (row.profil_json) {
    try {
      const parsed = JSON.parse(row.profil_json);
      if (parsed.result) resultJson = parsed.result;
      else resultJson = parsed;
    } catch { /* ignore */ }
  }

  if (!resultJson || !resultJson.förståelse) {
    return new Response('data: {"error":"Profildata saknas"}\n\n', {
      headers: sseHeaders(request),
    });
  }

  const förstData = resultJson.förståelse;
  const signal = förstData.signal || '';
  const skala = förstData.skala || 5;

  // Namn
  let name = 'Respondent';
  let email = '';
  if (row.anvandare_id) {
    const userRow = await env.SML_DB.prepare(
      'SELECT namn, epost FROM anvandare WHERE id = ?'
    ).bind(row.anvandare_id).first();
    if (userRow?.namn) name = userRow.namn;
    if (userRow?.epost) email = userRow.epost;
  }

  // Situation
  let situation = 'Arbete';
  if (row.svar_json) {
    try {
      const ad = JSON.parse(row.svar_json);
      situation = ad.situation || ad.context || 'Arbete';
    } catch { /* default */ }
  }

  // Storleksklass
  const pctVal = ((skala - 1) / 9 * 100);
  let storleksklass;
  if (pctVal <= 55) storleksklass = 'Jämnt fördelat';
  else if (pctVal <= 65) storleksklass = 'Övervikt';
  else if (pctVal <= 80) storleksklass = 'Tydlig övervikt';
  else if (pctVal <= 90) storleksklass = 'Stark övervikt';
  else storleksklass = 'Nästan uteslutande';

  const isAlt = signal && signal.toLowerCase().includes('alternativ');
  const skKlass = skala <= 5.5 ? 'jämnt fördelat' : skala <= 6.5 ? 'övervikt' : skala <= 8 ? 'tydlig övervikt' : skala <= 9 ? 'stark övervikt' : 'nästan uteslutande';

  const pedText = pedagogik.förståelse?.text || '';

  // 2. Skicka metadata direkt
  const meta = JSON.stringify({
    type: 'meta',
    name,
    signal,
    skala,
    storleksklass,
    pedagogik_text: pedText,
    situation,
    profile_id: row.id,
  });

  // 3. Starta Claude-ström
  const systemPrompt = `Du är en kommunikationsanalytiker för Språkmönsterlabbet. Skriv en generös, personlig analys av respondentens förståelsemönster. Det här är INTE en teaser — det är en fullständig analys av EN dimension.

FORMAT — exakt fyra stycken med dessa rubriker (skriv rubrikerna som ## Markdown):
## Vad det ger dig
## Vad det kostar
## När ni krockar
## En sak att pröva

REGLER:
- Kommunikationen är alltid subjektet, aldrig personen. Skriv "din kommunikation signalerar..." INTE "du är..."
- Inramning: "du och den du pratar mest med".
- Förklara vad Procedur och Alternativ BETYDER i praktiken.
- "Vad det kostar": den blinda fläcken.
- "När ni krockar": Procedur möter Alternativ.
- "En sak att pröva": konkret reflektion, inte råd.
- BÖRJA ALDRIG med en rubrik som upprepar signalen.
- Inga exakta tal, inga poäng, inga procent.
- 400–500 ord. Varm, professionell ton.
- Referera sammanhanget: ${situation}`;

  const userPrompt = `Respondent: ${name}
Mönster: Förståelse
Signal: ${signal} (${skKlass})
Sammanhang: ${situation}

Skriv fyra stycken med rubrikerna: Vad det ger dig, Vad det kostar, När ni krockar, En sak att pröva. 400-500 ord.`;

  const claudeRes = await fetch(CLAUDE_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.text();
    console.error('[stream] Claude API-fel:', claudeRes.status, err);
    return new Response('data: {"error":"AI-fel"}\n\n', {
      headers: sseHeaders(request),
    });
  }

  // 4. Skapa TransformStream som vidarebefordrar till klienten
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  let fullText = '';

  // Skicka metadata först
  writer.write(encoder.encode('data: ' + meta + '\n\n'));

  // Processa Claude-strömmen
  const processStream = async () => {
    try {
      const reader = claudeRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            if (event.type === 'content_block_delta' && event.delta?.text) {
              const chunk = event.delta.text;
              fullText += chunk;
              writer.write(encoder.encode('data: ' + JSON.stringify({ type: 'chunk', text: chunk }) + '\n\n'));
            }
          } catch { /* skip unparseable */ }
        }
      }

      // Strömmen klar — skicka done-event
      writer.write(encoder.encode('data: ' + JSON.stringify({ type: 'done' }) + '\n\n'));
      writer.close();

      // Spara i D1 (icke-blockerande)
      try {
        const combined = JSON.stringify({
          result: resultJson,
          analys_text: fullText,
        });
        await env.SML_DB.prepare(
          'UPDATE profil SET profil_json = ? WHERE rapport_token = ?'
        ).bind(combined, token).run();
      } catch (e) {
        console.error('[stream] D1-sparning misslyckades:', e.message);
      }

      // Skicka rapportmail
      if (email) {
        try {
          const rapportUrl = `https://sprakmonsterlabbet.holmbergfriends.com/gratis-rapport?token=${token}`;
          await skickaSmlMail({
            mall_id: 'sml-rapport-klar',
            epost: email,
            variabler: { namn: name, rapport_url: rapportUrl },
          });
        } catch (e) {
          console.error('[stream] Mail misslyckades:', e.message);
        }
      }
    } catch (e) {
      console.error('[stream] Strömmningsfel:', e.message);
      try {
        writer.write(encoder.encode('data: ' + JSON.stringify({ type: 'error', message: 'Strömmen avbröts' }) + '\n\n'));
        writer.close();
      } catch { /* already closed */ }
    }
  };

  // Kör strömprocesseringen utan att vänta (den skrivs till TransformStream)
  processStream();

  return new Response(readable, {
    headers: sseHeaders(request),
  });
}

function sseHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = [
    'https://sprakmonsterlabbet.holmbergfriends.com',
    'https://holmbergfriends.com',
    'https://www.holmbergfriends.com',
  ];
  const ao = allowed.includes(origin) ? origin : allowed[0];
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': ao,
    'Access-Control-Allow-Credentials': 'true',
  };
}
