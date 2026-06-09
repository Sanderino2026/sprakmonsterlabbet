#!/usr/bin/env node
/**
 * generate_tal_analys.mjs
 *
 * Hämtar ett tal LIVE från svenskatal.se, kör SML:s spann-baserade
 * femmönsteranalys 3 gånger, aggregerar verifierade spann över
 * körningarna, och rapporterar stabiliserade fördelningar.
 *
 * Användning:
 *   node scripts/generate_tal_analys.mjs \
 *     --url "https://www.svenskatal.se/tal/slug" \
 *     --talare "Namn" \
 *     --titel "Titeln" \
 *     --datum "YYYY-MM-DD" \
 *     [--worker "https://sprakmonsterlabbet.holmbergfriends.com"]
 *     [--runs 3]
 *
 * Talet lagras ALDRIG — det streamas genom analysen och kastas.
 */

const DEFAULT_WORKER = 'https://sprakmonsterlabbet.holmbergfriends.com';
const DEFAULT_RUNS = 3;
const CATEGORIES = [
  'Motivationsriktning', 'Förståelse', 'Sinneskanal', 'Beslutsram', 'Detaljnivå',
];
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
  opts.runs = parseInt(opts.runs, 10) || DEFAULT_RUNS;
  return opts;
}

// ── Hämta taltext ───────────────────────────────────────────────
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

// ── Normalisera whitespace ──────────────────────────────────────
function normalize(s) {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

// ── Verifiera spann mot källtext, returnera per-kategori-räkning ─
function verifyRun(patterns, sourceText) {
  const normalizedSource = normalize(sourceText);
  const perCategory = {};

  for (const pattern of patterns) {
    const cat = pattern.category;
    const poles = VALID_POLES[cat];
    if (!poles) continue;

    const verified = [];
    let dropped = 0;

    for (const spann of (pattern.spann || [])) {
      if (!poles.includes(spann.pol)) { dropped++; continue; }
      if (normalizedSource.includes(normalize(spann.text))) {
        verified.push({ text: spann.text, pol: spann.pol });
      } else {
        dropped++;
      }
    }

    // Räkna per pol
    const counts = {};
    for (const p of poles) counts[p] = 0;
    for (const v of verified) counts[v.pol]++;

    perCategory[cat] = { counts, verified, dropped };
  }

  return perCategory;
}

// ── Avrunda till närmaste 5 ─────────────────────────────────────
function roundTo5(n) {
  return Math.round(n / 5) * 5;
}

// ── Bestäm dominant med tie-regel ───────────────────────────────
function determineDominant(fördelning, n) {
  const entries = Object.entries(fördelning).sort((a, b) => b[1] - a[1]);
  if (n === 0) return { dominant: null, procent: 0 };

  const topCount = entries[0][1];
  const secondCount = entries.length >= 2 ? entries[1][1] : 0;

  if (entries.length >= 2 && (topCount - secondCount) <= 1) {
    return {
      dominant: `Delad (${entries[0][0]}/${entries[1][0]})`,
      procent: roundTo5((topCount / n) * 100),
    };
  }
  return {
    dominant: entries[0][0],
    procent: roundTo5((topCount / n) * 100),
  };
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
  process.stderr.write(`Text extraherad: ${text.length} tecken.\n`);
  process.stderr.write(`Kör ${opts.runs} analyser via ${opts.worker}...\n\n`);

  // ── Kör N gånger ──────────────────────────────────────────────
  const runResults = [];
  const runDescriptions = {}; // sista körningens beskrivning/tolkning per kategori

  for (let i = 0; i < opts.runs; i++) {
    process.stderr.write(`  Körning ${i + 1}/${opts.runs}...`);
    const analys = await analyseViaSML(text, opts.worker);
    const verified = verifyRun(analys.patterns, text);
    runResults.push(verified);

    // Spara beskrivning/tolkning från sista körningen
    for (const p of analys.patterns) {
      runDescriptions[p.category] = {
        beskrivning: p.beskrivning,
        tolkning: p.tolkning,
      };
    }

    const totalV = Object.values(verified).reduce((s, c) => s + c.verified.length, 0);
    const totalD = Object.values(verified).reduce((s, c) => s + c.dropped, 0);
    process.stderr.write(` ${totalV} verifierade, ${totalD} borttagna\n`);
  }

  // ── Aggregera över körningar ──────────────────────────────────
  process.stderr.write(`\n── AGGREGERAD ANALYS (${opts.runs} körningar): ${opts.titel} ──\n`);

  const aggregated = [];

  for (const cat of CATEGORIES) {
    const poles = VALID_POLES[cat];

    // Summera verifierade spann per pol, deduplicera på text
    const seenTexts = new Set();
    const totalCounts = {};
    for (const p of poles) totalCounts[p] = 0;

    const allVerified = [];
    for (const run of runResults) {
      const rc = run[cat];
      if (!rc) continue;
      for (const v of rc.verified) {
        const key = normalize(v.text) + '|' + v.pol;
        if (!seenTexts.has(key)) {
          seenTexts.add(key);
          totalCounts[v.pol]++;
          allVerified.push(v);
        }
      }
    }

    const n = Object.values(totalCounts).reduce((a, b) => a + b, 0);
    const underlagsflagga = n < 5 ? 'tunt underlag, tolka försiktigt' : null;

    // Dominant + procent (tie-regel på aggregat)
    const { dominant, procent } = determineDominant(totalCounts, n);

    // Per-körnings-dominant för stabilitetskoll
    const perRunDominants = runResults.map(run => {
      const rc = run[cat];
      if (!rc) return null;
      const rn = Object.values(rc.counts).reduce((a, b) => a + b, 0);
      return determineDominant(rc.counts, rn).dominant;
    });

    const allSame = perRunDominants.every(d => d === perRunDominants[0]);
    const stabilitet = allSame ? 'stabil' : 'instabil';

    // Representativa citat
    let representativt_citat;
    let minoritetscitat = null;
    const entries = Object.entries(totalCounts).sort((a, b) => b[1] - a[1]);

    if (typeof dominant === 'string' && dominant.startsWith('Delad')) {
      representativt_citat = [];
      for (let ei = 0; ei < 2 && ei < entries.length; ei++) {
        const hit = allVerified.find(v => v.pol === entries[ei][0]);
        if (hit) representativt_citat.push(hit.text);
      }
    } else {
      representativt_citat = allVerified
        .filter(v => v.pol === dominant)
        .slice(0, 2)
        .map(v => v.text);

      if (procent < 100 && entries.length > 1 && entries[1][1] > 0) {
        const mc = allVerified.find(v => v.pol === entries[1][0]);
        if (mc) minoritetscitat = { text: mc.text, pol: entries[1][0] };
      }
    }

    // Stderr
    const polStr = Object.entries(totalCounts).map(([k, v]) => `${k}:${v}`).join(' ');
    process.stderr.write(`  ${cat}: ${dominant} ${procent}% (n=${n}) [${polStr}] — ${stabilitet}`);
    if (underlagsflagga) process.stderr.write(` ⚠ ${underlagsflagga}`);
    process.stderr.write(` [${perRunDominants.join(', ')}]\n`);

    aggregated.push({
      category: cat,
      dominant,
      procent,
      n,
      fördelning: totalCounts,
      representativt_citat,
      minoritetscitat,
      underlagsflagga,
      stabilitet,
      per_körning: perRunDominants,
      beskrivning: runDescriptions[cat]?.beskrivning || '',
      tolkning: runDescriptions[cat]?.tolkning || '',
    });
  }

  const totalN = aggregated.reduce((s, a) => s + a.n, 0);
  process.stderr.write(`  Totalt: ${totalN} unika verifierade spann\n\n`);

  const output = {
    meta: {
      talare: opts.talare,
      titel: opts.titel,
      datum: opts.datum,
      kalla: opts.url.replace(/\.pdf$/, ''),
      analyserad: new Date().toISOString(),
      körningar: opts.runs,
    },
    patterns: aggregated,
    note: 'Språkmönster beskriver hur språket används i detta tal, inte fasta egenskaper hos talaren.',
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error('FEL:', err.message); process.exit(1); });
