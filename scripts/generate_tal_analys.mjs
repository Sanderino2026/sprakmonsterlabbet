#!/usr/bin/env node
/**
 * generate_tal_analys.mjs
 *
 * Hämtar ett tal LIVE från svenskatal.se, kör SML:s
 * femmönsteranalys via SML-workerns /api/analyse-tal endpoint,
 * och skriver strukturerad JSON till stdout.
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

  // Extrahera taltext från entry-content div
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

  const output = {
    meta: {
      talare: opts.talare,
      titel: opts.titel,
      datum: opts.datum,
      kalla: opts.url.replace(/\.pdf$/, ''),
      analyserad: new Date().toISOString(),
    },
    ...analys,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch(err => { console.error('FEL:', err.message); process.exit(1); });
