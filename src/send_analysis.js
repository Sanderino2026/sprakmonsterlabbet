import { findOrCreateLead } from './airtable.js';
import { skickaSmlMail } from './sml_mail.js';

// ── POST /api/send-analysis ───────────────────────────────────────
export async function handleSendAnalysis(request, env) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const analysResult = body?.analysResult ?? null;

  if (!email || !email.includes('@')) {
    return { status: 400, body: { ok: false, error: 'invalid_email', message: 'Ange en giltig e-postadress.' } };
  }

  const analysHtml = formatAnalysResultHtml(analysResult);
  const result = await skickaSmlMail({
    mall_id: 'sml-analys-skickad',
    epost: email,
    variabler: { analys_html: analysHtml },
  });
  if (!result.ok) {
    return { status: 502, body: { ok: false, error: 'email_failed' } };
  }

  try {
    await findOrCreateLead(email, env);
  } catch (err) {
    console.error('[sendAnalysis] findOrCreateLead fel:', err);
  }

  return { status: 200, body: { ok: true } };
}

function formatAnalysResultHtml(result) {
  if (!result || !Array.isArray(result.patterns)) return '';

  const rubrikHtml = result.rubrik
    ? `<p style="font-family:Georgia,serif;font-size:22px;font-weight:300;color:#0D0D0D;margin:0 0 20px;">${result.rubrik}</p>`
    : '';

  const patternsHtml = result.patterns.map(p => `
    <div style="border-top:1px solid #eee;padding:20px 0;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;margin:0 0 4px;">${p.category ?? ''}</p>
      <p style="font-size:18px;font-weight:600;color:#0D0D0D;margin:0 0 10px;">${p.dominant ?? ''}</p>
      <p style="font-size:14px;color:#555;line-height:1.65;margin:0 0 10px;">${p.beskrivning ?? ''}</p>
      <p style="font-size:14px;color:#1C1C1C;line-height:1.65;margin:0;">${p.tolkning ?? ''}</p>
    </div>
  `).join('');

  const summaryHtml = result.summary
    ? `<p style="font-size:13px;color:#999;font-style:italic;margin:16px 0 0;">${result.summary}</p>`
    : '';

  return rubrikHtml + patternsHtml + summaryHtml;
}
