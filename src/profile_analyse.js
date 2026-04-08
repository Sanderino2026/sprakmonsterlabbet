import { buildProfileAnalysisPrompt } from './prompts/profile_analysis_prompt.js';

const AIRTABLE_API = 'https://api.airtable.com/v0';
const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-20250514';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function runProfileAnalysis(env, profileId) {
  try {
    // 1. Hämta Profiles-raden
    const profileRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`,
      { headers: airtableHeaders(env) }
    );
    if (!profileRes.ok) {
      console.error('[runProfileAnalysis] Kunde inte hämta profil:', profileRes.status);
      return;
    }
    const profileRecord = await profileRes.json();
    const answersRaw = profileRecord.fields?.['Answers JSON'];
    if (!answersRaw) {
      console.error('[runProfileAnalysis] Answers JSON saknas på profil:', profileId);
      return;
    }

    // 2. Parsa Answers JSON
    let parsed;
    try {
      parsed = JSON.parse(answersRaw);
    } catch {
      console.error('[runProfileAnalysis] Kunde inte parsa Answers JSON');
      return;
    }
    const { answers, word_clicks, response_times_ms } = parsed;

    // 3. Bygg prompt
    const prompt = buildProfileAnalysisPrompt(answers, word_clicks, response_times_ms);

    // 4. Anropa Claude API
    const claudeRes = await fetch(CLAUDE_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => '');
      console.error('[runProfileAnalysis] Claude API fel:', claudeRes.status, errText);
      return;
    }

    const claudeData = await claudeRes.json();
    const rawText = claudeData.content?.[0]?.text ?? '';

    // 5. Parsa som JSON (strippa eventuella markdown-kodblock)
    let jsonText = rawText.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    let result;
    try {
      result = JSON.parse(jsonText);
    } catch {
      console.error('[runProfileAnalysis] Claude returnerade ogiltig JSON:', jsonText.slice(0, 200));
      return;
    }

    // 6. Bygg Communication Style-sträng
    const parts = [];
    if (result.motivationsriktning?.signal) parts.push(result.motivationsriktning.signal);
    if (result.beslutsram?.signal) parts.push(result.beslutsram.signal);
    if (result.förståelse?.signal) parts.push(result.förståelse.signal);
    const commStyle = parts.join(' · ');

    // 7. Spara Result JSON tillbaka på Profiles-raden
    const patchRes = await fetch(
      `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles/${profileId}`,
      {
        method: 'PATCH',
        headers: { ...airtableHeaders(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            'Result JSON': JSON.stringify(result),
            'Communication Style': commStyle,
            'Profile Type': 'individual',
          },
        }),
      }
    );

    const patchBody = await patchRes.text();
    console.error('[Airtable PATCH] status:', patchRes.status);
    console.error('[Airtable PATCH] body:', patchBody);

    if (!patchRes.ok) {
      return;
    }

    console.log('[runProfileAnalysis] Analys klar för profil:', profileId, '→', commStyle);
  } catch (err) {
    console.error('[runProfileAnalysis] Oväntat fel:', err);
  }
}
