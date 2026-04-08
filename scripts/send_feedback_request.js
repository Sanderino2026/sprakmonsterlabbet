#!/usr/bin/env node

// Usage: node scripts/send_feedback_request.js <profile_id>
// Sends a feedback request email to the respondent.

const AIRTABLE_API = 'https://api.airtable.com/v0';
const RESEND_API = 'https://api.resend.com/emails';

const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appV7UG9UdiWbMVfS';
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const profileId = process.argv[2];

if (!profileId) {
  console.error('Användning: node scripts/send_feedback_request.js <profile_id>');
  process.exit(1);
}

if (!AIRTABLE_API_KEY || !RESEND_API_KEY) {
  console.error('Miljövariabler saknas: AIRTABLE_API_KEY och RESEND_API_KEY krävs.');
  console.error('Kör: export AIRTABLE_API_KEY=xxx RESEND_API_KEY=xxx');
  process.exit(1);
}

async function main() {
  // 1. Hämta Profiles-raden
  const profileRes = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/Profiles/${profileId}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!profileRes.ok) {
    console.error('Kunde inte hämta profil:', profileRes.status);
    process.exit(1);
  }
  const profileRecord = await profileRes.json();
  const reportToken = profileRecord.fields?.['Report Token'];
  if (!reportToken) {
    console.error('Profilen saknar Report Token — rapporten kanske inte är genererad ännu.');
    process.exit(1);
  }

  // 2. Hämta User
  const userIds = profileRecord.fields?.['User'];
  if (!userIds || userIds.length === 0) {
    console.error('Profilen saknar User-länk.');
    process.exit(1);
  }

  const userRes = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/Users/${userIds[0]}`, {
    headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
  });
  if (!userRes.ok) {
    console.error('Kunde inte hämta användare:', userRes.status);
    process.exit(1);
  }
  const userRecord = await userRes.json();
  const name = userRecord.fields?.['Name'] || 'Respondent';
  const email = userRecord.fields?.['Email'];
  if (!email) {
    console.error('Användaren saknar e-postadress.');
    process.exit(1);
  }

  // 3. Skicka e-post via Resend
  const feedbackUrl = `https://sprakmonsterlabbet.holmbergfriends.com/feedback.html?token=${reportToken}`;

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
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 16px;">För några dagar sedan fick du din kommunikationsrapport från Språkmönsterlabbet.</p>
    <p style="font-size:16px;color:#1C1C1C;line-height:1.6;margin:0 0 24px;">Vi skulle uppskatta om du tog en minut och berättade hur du upplevde den.</p>
    <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
    <tr><td style="background:#534AB7;border-radius:4px;padding:14px 28px;">
      <a href="${feedbackUrl}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;letter-spacing:0.04em;text-transform:uppercase;">Ge feedback →</a>
    </td></tr>
    </table>
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
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'noreply@holmbergfriends.com',
      to: email,
      subject: 'Hur upplevde du din kommunikationsrapport?',
      html: emailHtml,
    }),
  });

  if (!resendRes.ok) {
    const errText = await resendRes.text().catch(() => '');
    console.error('Resend-fel:', resendRes.status, errText);
    process.exit(1);
  }

  console.log(`✅ Feedbackförfrågan skickad till ${email}`);
}

main().catch((err) => {
  console.error('Oväntat fel:', err);
  process.exit(1);
});
