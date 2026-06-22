import { updateUserAfterPayment, updateGuestAfterPayment, saveToLeadsTable } from './airtable.js';
import { handleReportGenerate } from './report_generate.js';
import { handleGiftReport } from './gift_report.js';

const ONE_TIME_PRICE_ID = 'price_1T9j6zQc0eK2st18E4ezJAo0';
const RAPPORT_FULL_PRICE_ID = 'price_1TE6FFHrTws6MQZqOiYLRzGE';
const RAPPORT_ALUMNI_PRICE_ID = 'price_1TE9RZHrTws6MQZqVEhOtaY0';

// ── POST /api/stripe/checkout ──────────────────────────────────────
export async function handleStripeCheckout(request, env) {
  const body = await request.json().catch(() => null);
  const { priceId, email, guest_id, profile_id, price_type, gift_to_name, gift_to_email, gift_from_name } = body ?? {};

  if (!priceId) {
    return { status: 400, body: { ok: false, error: 'missing_params' } };
  }

  const isRapport = price_type === 'rapport_full' || price_type === 'rapport_alumni' || priceId === RAPPORT_FULL_PRICE_ID || priceId === RAPPORT_ALUMNI_PRICE_ID;
  const mode = (priceId === ONE_TIME_PRICE_ID || isRapport) ? 'payment' : 'subscription';

  const successUrl = isRapport
    ? 'https://sprakmonsterlabbet.holmbergfriends.com/gratis-rapport.html?payment=success'
    : 'https://www.holmbergfriends.com/sprakmonsterlabbet-analys?payment=success';
  const cancelUrl = isRapport
    ? 'https://sprakmonsterlabbet.holmbergfriends.com/gratis-rapport.html?payment=cancelled'
    : 'https://www.holmbergfriends.com/sprakmonsterlabbet-analys?payment=cancelled';

  const params = new URLSearchParams();
  params.append('mode', mode);
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('allow_promotion_codes', 'true');
  params.append('metadata[priceId]', priceId);
  if (price_type) {
    params.append('metadata[price_type]', price_type);
  }
  if (profile_id) {
    params.append('metadata[profile_id]', profile_id);
  }
  if (email) {
    params.append('customer_email', email);
    params.append('metadata[email]', email);
  }
  if (guest_id) {
    params.append('metadata[guest_id]', guest_id);
  }
  if (gift_to_name) {
    params.append('metadata[gift_to_name]', gift_to_name);
  }
  if (gift_to_email) {
    params.append('metadata[gift_to_email]', gift_to_email);
  }
  if (gift_from_name) {
    params.append('metadata[gift_from_name]', gift_from_name);
  }

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();

    if (!res.ok) {
      const stripeMessage = data?.error?.message ?? 'Okänt fel från Stripe';
      const stripeCode = data?.error?.code ?? null;
      const stripeType = data?.error?.type ?? null;
      console.error('[stripeCheckout] Stripe fel:', res.status, JSON.stringify(data));
      console.error('[stripeCheckout] params skickade:', params.toString());
      return {
        status: 502,
        body: { ok: false, error: 'stripe_error', message: stripeMessage, code: stripeCode, type: stripeType },
      };
    }

    return { status: 200, body: { ok: true, url: data.url } };
  } catch (err) {
    console.error('[stripeCheckout] Nätverksfel:', err);
    return { status: 502, body: { ok: false, error: 'stripe_error' } };
  }
}

// ── POST /api/stripe/webhook ───────────────────────────────────────
export async function handleStripeWebhook(request, env) {
  const rawBody = await request.text();
  const sigHeader = request.headers.get('stripe-signature') || '';

  const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error('[stripeWebhook] Ogiltig signatur');
    return { status: 400, body: { ok: false, error: 'invalid_signature' } };
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: { ok: false, error: 'invalid_json' } };
  }

  console.log('[webhook] event mottaget:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const email = session.metadata?.email;
    const priceId = session.metadata?.priceId;
    const guestId = session.metadata?.guest_id;
    const priceType = session.metadata?.price_type;
    const profileId = session.metadata?.profile_id;

    console.log('[webhook] priceId från metadata:', priceId ?? '(saknas)');
    console.log('[webhook] email från metadata:', email ?? '(saknas)');
    console.log('[webhook] guest_id från metadata:', guestId ?? '(saknas)');
    console.log('[webhook] price_type från metadata:', priceType ?? '(saknas)');
    console.log('[webhook] profile_id från metadata:', profileId ?? '(saknas)');

    // Present-köp: skicka presentmail istället för rapport
    const giftToEmail = session.metadata?.gift_to_email;
    const giftToName = session.metadata?.gift_to_name;
    const giftFromName = session.metadata?.gift_from_name;

    if (giftToEmail && (priceType === 'rapport_full' || priceType === 'rapport_alumni') && profileId) {
      console.log('[webhook] Present-köp — skickar presentmail till:', giftToEmail);
      try {
        await handleGiftReport(env, {
          profile_id: profileId,
          gift_to_name: giftToName || 'Mottagare',
          gift_to_email: giftToEmail,
          gift_from_name: giftFromName || 'Någon',
        });
        console.log('[webhook] Presentmail skickat till:', giftToEmail);
      } catch (err) {
        console.error('[webhook] handleGiftReport fel:', err);
      }
      // Spara present-mottagaren som lead
      try {
        await saveToLeadsTable(env, {
          email: giftToEmail,
          name: giftToName || undefined,
          source: 'gift',
        });
      } catch (err) {
        console.error('[webhook] saveToLeadsTable fel:', err);
      }
    }
    // Rapport-köp (ej present): generera och skicka fullständig rapport
    else if ((priceType === 'rapport_full' || priceType === 'rapport_alumni') && profileId) {
      console.log('[webhook] Rapport-köp — genererar rapport för profile_id:', profileId);
      try {
        const fakeRequest = { json: async () => ({ profile_id: profileId }) };
        const result = await handleReportGenerate(fakeRequest, env);
        console.log('[webhook] Rapportgenerering klar:', result.status, JSON.stringify(result.body));
      } catch (err) {
        console.error('[webhook] handleReportGenerate fel:', err);
      }
    } else if (!priceId) {
      console.error('[webhook] priceId saknas — kan inte uppdatera användaren');
    } else if (guestId) {
      console.log('[webhook] Uppdaterar via guest_id:', guestId);
      try {
        await updateGuestAfterPayment(guestId, priceId, env);
      } catch (err) {
        console.error('[webhook] updateGuestAfterPayment fel:', err);
      }
    } else if (email) {
      console.log('[webhook] Uppdaterar via email:', email);
      try {
        await updateUserAfterPayment(email, priceId, env);
      } catch (err) {
        console.error('[webhook] updateUserAfterPayment fel:', err);
      }
    } else {
      console.error('[webhook] Varken guest_id eller email finns — kan inte uppdatera användaren');
    }
  }

  return { status: 200, body: { ok: true } };
}

// ── Verifiera Stripe webhook-signatur ─────────────────────────────
async function verifyStripeSignature(rawBody, sigHeader, secret) {
  // Format: "t=TIMESTAMP,v1=SIGNATURE"
  const parts = Object.fromEntries(
    sigHeader.split(',').map(p => {
      const i = p.indexOf('=');
      return [p.slice(0, i), p.slice(i + 1)];
    })
  );
  const timestamp = parts['t'];
  const v1 = parts['v1'];
  if (!timestamp || !v1) return false;

  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computed === v1;
}
