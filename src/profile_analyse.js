import { buildProfileAnalysisPrompt } from './prompts/profile_analysis_prompt.js';

const CLAUDE_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-4-6';

export async function runProfileAnalysis(env, profileId) {
  try {
    // 1. Hämta Profiles-raden
    const profileRow = await env.SML_DB.prepare(
      'SELECT * FROM profil WHERE id = ?'
    ).bind(profileId).first();

    if (!profileRow) {
      console.error('[runProfileAnalysis] Kunde inte hämta profil:', profileId);
      return;
    }

    const answersRaw = profileRow.svar_json;
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
    await env.SML_DB.prepare(
      'UPDATE profil SET profil_json = ?, communication_style = ? WHERE id = ?'
    ).bind(JSON.stringify(result), commStyle, profileId).run();

    console.log('[runProfileAnalysis] Analys klar för profil:', profileId, '→', commStyle);
  } catch (err) {
    console.error('[runProfileAnalysis] Oväntat fel:', err);
  }
}
