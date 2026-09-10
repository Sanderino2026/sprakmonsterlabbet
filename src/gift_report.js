import { skickaSmlMail } from './sml_mail.js';

function generateId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handleGiftReport(env, metadata) {
  const { profile_id, gift_to_name, gift_to_email, gift_from_name } = metadata;

  // 1. Skapa en ny Profiles-rad för mottagaren
  const giftToken = crypto.randomUUID();
  const id = generateId();

  await env.SML_DB.prepare(
    'INSERT INTO profil (id, anvandare_id, svar_json, rapport_token) VALUES (?, ?, ?, ?)'
  ).bind(
    id,
    '', // ingen användare ännu
    JSON.stringify({
      gift: true,
      gifted_by_profile_id: profile_id,
    }),
    giftToken
  ).run();

  console.log('[handleGiftReport] Skapade present-profil:', id, '→ token:', giftToken);

  // 2. Skicka presentmail via skickaSmlMail
  const profileUrl = `https://sprakmonsterlabbet.holmbergfriends.com/profil?gift_token=${giftToken}`;

  await skickaSmlMail({
    mall_id: 'sml-present-inbjudan',
    epost: gift_to_email,
    variabler: { mottagare: gift_to_name, avsandare: gift_from_name, profil_url: profileUrl },
  });

  console.log('[handleGiftReport] Presentmail skickat till:', gift_to_email);
}
