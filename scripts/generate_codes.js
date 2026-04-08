#!/usr/bin/env node

// Usage: node scripts/generate_codes.js
// Generates 100 alumni discount codes and saves them to Airtable Codes table.

const AIRTABLE_API = 'https://api.airtable.com/v0';
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || 'appV7UG9UdiWbMVfS';

if (!AIRTABLE_API_KEY) {
  console.error('Miljövariabel saknas: AIRTABLE_API_KEY krävs.');
  console.error('Kör: export AIRTABLE_API_KEY=xxx');
  process.exit(1);
}

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
const COUNT = 100;

function generateCode() {
  let code = 'DCL-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return code;
}

async function main() {
  // Generate unique codes
  const codes = new Set();
  while (codes.size < COUNT) {
    codes.add(generateCode());
  }

  const codeList = [...codes];
  const now = new Date().toISOString();
  let created = 0;

  // Airtable batch create: max 10 records per request
  for (let i = 0; i < codeList.length; i += 10) {
    const batch = codeList.slice(i, i + 10);
    const records = batch.map((code) => ({
      fields: {
        'Code': code,
        'Type': 'alumni',
        'Used': false,
        'Created At': now,
      },
    }));

    const res = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/Codes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${AIRTABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ records }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      console.error(`❌ Airtable-fel vid batch ${i / 10 + 1}:`, res.status, err);
      process.exit(1);
    }

    created += batch.length;
    process.stdout.write(`\r⏳ ${created}/${COUNT} koder skapade...`);
  }

  console.log(`\r✅ Genererade ${created} koder                `);
}

main().catch((err) => {
  console.error('❌ Oväntat fel:', err.message);
  process.exit(1);
});
