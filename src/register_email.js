import { findUserByRecordId, saveToLeadsTable } from './airtable.js';

// POST /api/register-email
// Tar { email, nyhetsbrev_opt, guest_id }
// Kopplar e-post till gästsession och sparar lead
export async function handleRegisterEmail(request, env) {
  const body = await request.json().catch(() => null);
  const email = (body?.email || '').trim().toLowerCase();
  const nyhetsbrevOpt = body?.nyhetsbrev_opt ? 1 : 0;
  const guestId = body?.guest_id ?? null;

  if (!email || !email.includes('@') || !email.includes('.')) {
    return { status: 400, body: { ok: false, error: 'invalid_email', message: 'Ange en giltig e-postadress.' } };
  }

  if (!guestId) {
    return { status: 400, body: { ok: false, error: 'missing_guest_id', message: 'Ingen session hittad.' } };
  }

  const guest = await findUserByRecordId(guestId, env);
  if (!guest) {
    return { status: 404, body: { ok: false, error: 'guest_not_found', message: 'Sessionen hittades inte.' } };
  }

  // Uppdatera anvandare-raden: byt fejk-epost till riktig
  try {
    await env.SML_DB.prepare(
      'UPDATE anvandare SET epost = ? WHERE id = ? AND epost LIKE ?'
    ).bind(email, guestId, 'guest_%').run();
  } catch (err) {
    // UNIQUE constraint — e-posten finns redan. Koppla gästen till befintlig.
    console.log('[register-email] Epost finns redan i anvandare:', email);
  }

  // Spara lead med nyhetsbrevs-opt
  const leadId = await saveToLeadsTable(env, { email, source: 'sml-analys-gate' });
  if (leadId && nyhetsbrevOpt) {
    await env.SML_DB.prepare(
      'UPDATE sml_lead SET nyhetsbrev_opt = 1 WHERE id = ?'
    ).bind(leadId).run();
  }

  return { status: 200, body: { ok: true, guest_id: guestId } };
}
