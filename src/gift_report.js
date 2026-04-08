const AIRTABLE_API = 'https://api.airtable.com/v0';
const RESEND_API = 'https://api.resend.com/emails';

function airtableHeaders(env) {
  return { Authorization: `Bearer ${env.AIRTABLE_API_KEY}` };
}

export async function handleGiftReport(env, metadata) {
  const { profile_id, gift_to_name, gift_to_email, gift_from_name } = metadata;

  // 1. Skapa en ny Profiles-rad för mottagaren
  const giftToken = crypto.randomUUID();

  const createRes = await fetch(
    `${AIRTABLE_API}/${env.AIRTABLE_BASE_ID}/Profiles`,
    {
      method: 'POST',
      headers: { ...airtableHeaders(env), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          'Answers JSON': JSON.stringify({
            gift: true,
            gifted_by_profile_id: profile_id,
          }),
          'Profile Type': 'gift_pending',
          'Report Token': giftToken,
        },
      }),
    }
  );

  if (!createRes.ok) {
    const err = await createRes.text().catch(() => '');
    console.error('[handleGiftReport] Kunde inte skapa Profiles-rad:', createRes.status, err);
    throw new Error('Kunde inte skapa present-profil');
  }

  const created = await createRes.json();
  console.log('[handleGiftReport] Skapade present-profil:', created.id, '→ token:', giftToken);

  // 2. Skicka presentmail via Resend
  const profileUrl = `https://sprakmonsterlabbet.holmbergfriends.com/profil.html?gift_token=${giftToken}`;

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
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 16px;">Hej ${gift_to_name},</p>
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 16px;"><strong>${gift_from_name}</strong> har gett dig en personlig kommunikationsrapport från Språkmönsterlabbet.</p>
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 24px;">Rapporten analyserar hur du kommunicerar — inte vem du är, utan hur ditt språk rör sig. Det tar 5–6 minuter att svara på frågorna.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td style="background:#534AB7;border-radius:4px;padding:14px 28px;">
      <a href="${profileUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">Gör din profil →</a>
    </td></tr>
    </table>
    <p style="font-size:14px;color:#5A5A5A;line-height:1.6;margin:0 0 8px;">
      När du är klar genereras din personliga rapport och skickas till din e-post.
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
      to: gift_to_email,
      subject: `${gift_from_name} har gett dig en kommunikationsrapport`,
      html: emailHtml,
    }),
  });

  if (!resendRes.ok) {
    const resendErr = await resendRes.text().catch(() => '');
    console.error('[handleGiftReport] Resend fel:', resendRes.status, resendErr);
  }

  console.log('[handleGiftReport] Presentmail skickat till:', gift_to_email);
}
