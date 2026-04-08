import { findOrCreateLead } from './airtable.js';

// ── POST /api/send-analysis ───────────────────────────────────────
export async function handleSendAnalysis(request, env) {
  const body = await request.json().catch(() => null);
  const email = body?.email?.trim().toLowerCase();
  const analysResult = body?.analysResult ?? null;

  if (!email || !email.includes('@')) {
    return { status: 400, body: { ok: false, error: 'invalid_email', message: 'Ange en giltig e-postadress.' } };
  }

  const html = buildEmailHtml(analysResult);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Språkmonsterlabbet <noreply@holmbergfriends.com>',
        to: email,
        subject: 'Din språkmönsteranalys',
        html,
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      console.error('[sendAnalysis] Resend fel:', res.status, JSON.stringify(data));
      return { status: 502, body: { ok: false, error: 'email_failed' } };
    }
  } catch (err) {
    console.error('[sendAnalysis] Nätverksfel:', err);
    return { status: 502, body: { ok: false, error: 'email_failed' } };
  }

  try {
    await findOrCreateLead(email, env);
  } catch (err) {
    console.error('[sendAnalysis] findOrCreateLead fel:', err);
  }

  return { status: 200, body: { ok: true } };
}

function buildEmailHtml(result) {
  const analysHtml = formatAnalysResultHtml(result);
  return `
    <div style="max-width:600px;font-family:Helvetica Neue,Helvetica,Arial,sans-serif;color:#1C1C1C;">
      <h2 style="font-family:Georgia,serif;font-size:26px;font-weight:300;letter-spacing:-0.02em;margin:0 0 8px;">Din språkmönsteranalys</h2>
      <p style="font-size:14px;color:#666;margin:0 0 28px;line-height:1.6;">Tack för att du använde Språkmönsterlabbet. Här är din analys.</p>

      ${analysHtml}

      <hr style="border:none;border-top:1px solid #eee;margin:36px 0">

      <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 10px;">
        Språkmönsterlabbet är ett verktyg för att förstå kommunikationsmönster i arbetslivet — utvecklat av Holmberg &amp; Vänner.
      </p>
      <p style="font-size:13px;color:#666;line-height:1.6;margin:0 0 16px;">
        Vi utbildar chefer och ledare i coachande ledarskap sedan 20 år. Mer än 3 500 ledare har gått våra program. NPS: +80.
      </p>
      <a href="https://www.holmbergfriends.com/coachandeledarskap" style="font-size:14px;color:#000;">Läs mer om Coachande Ledarskap →</a>

      <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
      <img src="https://images.squarespace-cdn.com/content/v1/62d95e2df2666719f12b020f/76cb7f2e-f305-45a3-8acf-2831d9d55ed9/ahab_logotype_svartvit_vansterstalld_dubbelrad.png" width="180" style="display:block;">
    </div>
  `;
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
