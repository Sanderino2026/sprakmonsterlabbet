#!/usr/bin/env node
/**
 * generate_tal_analys.mjs
 *
 * Hämtar ett tal LIVE från svenskatal.se, kör SML:s spann-baserade
 * femmönsteranalys, verifierar varje spann ordagrant mot källtexten,
 * räknar verifierade spann per pol, och beräknar dominant/procent/n.
 *
 * Användning:
 *   node scripts/generate_tal_analys.mjs \
 *     --url "https://www.svenskatal.se/tal/slug" \
 *     --talare "Namn" \
 *     --titel "Titeln" \
 *     --datum "YYYY-MM-DD" \
 *     [--worker "https://sprakmonsterlabbet.holmbergfriends.com"]
 *
 * Talet lagras ALDRIG — det streamas genom analysen och kastas.
 */

const DEFAULT_WORKER = 'https://sprakmonsterlabbet.holmbergfriends.com';

// ── Giltiga poler per mönster ───────────────────────────────────
const VALID_POLES = {
  'Motivationsriktning': ['Till', 'Ifrån'],
  'Förståelse': ['Procedur', 'Alternativ'],
  'Sinneskanal': ['Syn', 'Hörsel', 'Känsel'],
  'Beslutsram': ['Intern', 'Extern'],
  'Detaljnivå': ['Helhet', 'Detalj'],
};

// ── Parse args ──────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    opts[key] = args[i + 1];
  }
  for (const k of ['url', 'talare', 'titel', 'datum']) {
    if (!opts[k]) { console.error(`Saknar --${k}`); process.exit(1); }
  }
  opts.worker = opts.worker || DEFAULT_WORKER;
  return opts;
}

// ── Hämta taltext från svenskatal.se ────────────────────────────
async function fetchSpeechText(url) {
  const pageUrl = url.replace(/\.pdf$/, '');
  const res = await fetch(pageUrl);
  if (!res.ok) throw new Error(`Kunde inte hämta tal: ${res.status} ${pageUrl}`);
  const html = await res.text();

  const bodyMatch = html.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    || html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    || html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  let text;
  if (bodyMatch) {
    text = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#8217;/g, "'")
      .replace(/&#8221;|&#8220;/g, '"')
      .replace(/&#8211;/g, '–')
      .replace(/\s+/g, ' ')
      .trim();
  } else {
    text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (text.length < 100) throw new Error(`För kort text extraherad (${text.length} tecken)`);
  return text;
}

// ── Normalisera whitespace för jämförelse ───────────────────────
function normalize(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Verifiera spann + räkna per pol ─────────────────────────────
function verifyAndCount(patterns, sourceText) {
  const normalizedSource = normalize(sourceText);
  const results = [];

  for (const pattern of patterns) {
    const category = pattern.category;
    const validPoles = VALID_POLES[category];
    if (!validPoles) {
      results.push({ category, error: 'Okänd kategori' });
      continue;
    }

    const verified = [];
    const dropped = [];

    for (const spann of (pattern.spann || [])) {
      const text = spann.text;
      const pol = spann.pol;

      // Kasta spann med ogiltig pol
      if (!validPoles.includes(pol)) {
        dropped.push({ text, pol, reason: `ogiltig pol "${pol}"` });
        continue;
      }

      // Delsträngskoll
      if (normalizedSource.includes(normalize(text))) {
        verified.push({ text, pol });
      } else {
        dropped.push({ text, pol, reason: 'ej ordagrant' });
      }
    }

    // Räkna per pol
    const fördelning = {};
    for (const p of validPoles) fördelning[p] = 0;
    for (const v of verified) fördelning[v.pol]++;

    const n = verified.length;
    const underlagsflagga = n < 5 ? 'tunt underlag, tolka försiktigt' : null;

    // Dominant pol — tie-regel: inom 1 spann = Delad
    let dominant;
    let procent;
    const entries = Object.entries(fördelning).sort((a, b) => b[1] - a[1]);
    if (n === 0) {
      dominant = null;
      procent = 0;
    } else if (entries.length >= 2 && (entries[0][1] - entries[1][1]) <= 1) {
      // Topp-polerna ligger inom 1 spann — Delad
      dominant = `Delad (${entries[0][0]}/${entries[1][0]})`;
      procent = Math.round((entries[0][1] / n) * 100);
    } else {
      dominant = entries[0][0];
      procent = Math.round((entries[0][1] / n) * 100);
    }

    // Representativa citat: 1 per topp-pol vid Delad, 1-2 från dominant annars
    let representativt_citat;
    let minoritetscitat = null;

    if (typeof dominant === 'string' && dominant.startsWith('Delad')) {
      // Vid delad: 1 citat per pol
      representativt_citat = [];
      for (let ei = 0; ei < 2 && ei < entries.length; ei++) {
        const polNamn = entries[ei][0];
        const hit = verified.find(v => v.pol === polNamn);
        if (hit) representativt_citat.push(hit.text);
      }
    } else {
      representativt_citat = verified
        .filter(v => v.pol === dominant)
        .slice(0, 2)
        .map(v => v.text);

      if (procent < 100 && entries.length > 1 && entries[1][1] > 0) {
        const minoritetsPol = entries[1][0];
        const mc = verified.find(v => v.pol === minoritetsPol);
        if (mc) minoritetscitat = { text: mc.text, pol: minoritetsPol };
      }
    }

    results.push({
      category,
      dominant,
      procent,
      n,
      fördelning,
      representativt_citat,
      minoritetscitat,
      underlagsflagga,
      beskrivning: pattern.beskrivning,
      tolkning: pattern.tolkning,
      verification: {
        verified: verified.length,
        dropped: dropped.length,
        dropped_details: dropped,
      },
    });
  }

  return results;
}

// ── Kör analys via SML-worker ───────────────────────────────────
async function analyseViaSML(text, workerUrl) {
  const res = await fetch(`${workerUrl}/api/analyse-tal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Worker ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (!data.ok) throw new Error(`Analys misslyckades: ${data.error}`);
  return data.result;
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  process.stderr.write(`Hämtar tal: ${opts.titel} (${opts.talare})...\n`);

  const text = await fetchSpeechText(opts.url);
  process.stderr.write(`Text extraherad: ${text.length} tecken. Kör analys via ${opts.worker}...\n`);

  const analys = await analyseViaSML(text, opts.worker);

  // Verifiera spann + räkna
  const patterns = verifyAndCount(analys.patterns, text);

  // Stderr-rapport
  let totalVerified = 0, totalDropped = 0;
  process.stderr.write(`\n── SPANN-RÄKNING: ${opts.titel} ──\n`);
  for (const p of patterns) {
    totalVerified += p.verification.verified;
    totalDropped += p.verification.dropped;
    const pcts = Object.entries(p.fördelning).map(([k, v]) => `${k}:${v}`).join(' ');
    process.stderr.write(`  ${p.category}: ${p.dominant} ${p.procent}% (n=${p.n}) [${pcts}]`);
    if (p.underlagsflagga) process.stderr.write(` ⚠ ${p.underlagsflagga}`);
    if (p.verification.dropped > 0) process.stderr.write(` — ${p.verification.dropped} borttagna`);
    process.stderr.write('\n');
  }
  process.stderr.write(`  Totalt: ${totalVerified} verifierade, ${totalDropped} borttagna\n\n`);

  const output = {
    meta: {
      talare: opts.talare,
      titel: opts.titel,
      datum: opts.datum,
      kalla: opts.url.replace(/\.pdf$/, ''),
      analyserad: new Date().toISOString(),
    },
    patterns,
    rubrik: analys.rubrik,
    summary: analys.summary,
    note: analys.note,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error('FEL:', err.message); process.exit(1); });
