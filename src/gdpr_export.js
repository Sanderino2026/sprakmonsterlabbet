export async function handleGdprExport(request, env) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.GDPR_SECRET}`) {
      return { body: { ok: false, databas: 'sprakmonsterlabbet', error: 'Ogiltig autentisering' }, status: 401 };
    }

    const body = await request.json();
    const epost = (body.epost || '').toLowerCase().trim();
    if (!epost) {
      return { body: { ok: false, databas: 'sprakmonsterlabbet', error: 'Epost saknas' }, status: 400 };
    }

    const db = env.SML_DB;

    const anvandare = await db.prepare(
      `SELECT * FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?))`
    ).bind(epost).all();

    const profil = await db.prepare(
      `SELECT * FROM profil WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).all();

    const analys = await db.prepare(
      `SELECT * FROM analys WHERE anvandare_id IN (SELECT id FROM anvandare WHERE LOWER(TRIM(epost))=LOWER(TRIM(?)))`
    ).bind(epost).all();

    return {
      body: {
        ok: true,
        databas: 'sprakmonsterlabbet',
        data: {
          anvandare: anvandare.results,
          profil: profil.results,
          analys: analys.results,
        }
      },
      status: 200
    };
  } catch (err) {
    console.error('[gdpr-export] Fel:', err);
    return { body: { ok: false, databas: 'sprakmonsterlabbet', error: err.message }, status: 500 };
  }
}
