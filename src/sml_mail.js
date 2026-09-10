// sml_mail.js — Skicka mail via deep-thought mailgate istället för Resend direkt.
// Alla SML-filer importerar denna istället för att anropa api.resend.com.

const GATE_URL = 'https://deep-thought.holmbergfriends.com/api/sml-mail';

export async function skickaSmlMail({ mall_id, epost, variabler = {}, tvinga = false }) {
  try {
    const res = await fetch(GATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mall_id, epost, variabler, tvinga }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('[skickaSmlMail] Gate svarade:', JSON.stringify(data));
    }
    return data;
  } catch (e) {
    console.error('[skickaSmlMail] Nätverksfel:', e.message);
    return { ok: false, error: e.message };
  }
}
