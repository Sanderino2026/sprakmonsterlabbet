export async function handleGdprRadera(request, env) {
  try {
    // 1. Verify Authorization
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.GDPR_SECRET}`) {
      return { body: { ok: false, databas: 'sprakmonsterlabbet', error: 'Ogiltig autentisering' }, status: 401 };
    }

    // 2. Parse body
    const body = await request.json();
    const epost = (body.epost || '').toLowerCase().trim();
    if (!epost) {
      return { body: { ok: false, databas: 'sprakmonsterlabbet', error: 'Epost saknas' }, status: 400 };
    }

    const db = env.SML_DB;
    const tabeller = [];
    let raderPaverkade = 0;

    // 3. Execute deletions — cascades first (before anvandare)

    // profil
    const r1 = await db.prepare(
      `DELETE FROM profil WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).run();
    console.log('[gdpr-radera] profil:', r1.meta.changes);
    tabeller.push('profil');
    raderPaverkade += r1.meta.changes;

    // analys
    const r2 = await db.prepare(
      `DELETE FROM analys WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).run();
    console.log('[gdpr-radera] analys:', r2.meta.changes);
    tabeller.push('analys');
    raderPaverkade += r2.meta.changes;

    // sml_lead
    const r3 = await db.prepare(
      `DELETE FROM sml_lead WHERE LOWER(TRIM(epost))=LOWER(TRIM(?))`
    ).bind(epost).run();
    console.log('[gdpr-radera] sml_lead:', r3.meta.changes);
    tabeller.push('sml_lead');
    raderPaverkade += r3.meta.changes;

    // sml_feedback
    const r4 = await db.prepare(
      `DELETE FROM sml_feedback WHERE LOWER(TRIM(epost))=LOWER(TRIM(?))`
    ).bind(epost).run();
    console.log('[gdpr-radera] sml_feedback:', r4.meta.changes);
    tabeller.push('sml_feedback');
    raderPaverkade += r4.meta.changes;

    // session
    const r5 = await db.prepare(
      `DELETE FROM session WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).run();
    console.log('[gdpr-radera] session:', r5.meta.changes);
    tabeller.push('session');
    raderPaverkade += r5.meta.changes;

    // exercise_attempt
    const r6 = await db.prepare(
      `DELETE FROM exercise_attempt WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).run();
    console.log('[gdpr-radera] exercise_attempt:', r6.meta.changes);
    tabeller.push('exercise_attempt');
    raderPaverkade += r6.meta.changes;

    // anvandare (anonymize LAST — after cascades)
    const r7 = await db.prepare(
      `UPDATE anvandare SET namn='Raderad användare', epost='raderad-'||id||'@removed.local', stripe_customer_id=NULL WHERE LOWER(TRIM(epost))=LOWER(TRIM(?))`
    ).bind(epost).run();
    console.log('[gdpr-radera] anvandare:', r7.meta.changes);
    tabeller.push('anvandare');
    raderPaverkade += r7.meta.changes;

    return { body: { ok: true, databas: 'sprakmonsterlabbet', tabeller, rader_paverkade: raderPaverkade }, status: 200 };
  } catch (err) {
    console.error('[gdpr-radera] Fel:', err);
    return { body: { ok: false, databas: 'sprakmonsterlabbet', error: err.message }, status: 500 };
  }
}
