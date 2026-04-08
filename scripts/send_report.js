#!/usr/bin/env node

const API = 'https://sprakmonsterlabbet.alexander-894.workers.dev';

const profileId = process.argv[2];

if (!profileId) {
  console.error('Användning: node scripts/send_report.js <profile_id>');
  process.exit(1);
}

async function main() {
  console.log(`Genererar rapport för profil: ${profileId}...`);

  const res = await fetch(`${API}/api/report/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profileId }),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error(`❌ Fel: ${data.error || 'Okänt fel'}`);
    process.exit(1);
  }

  console.log(`✅ Rapport genererad och skickad till ${data.email}`);
  console.log(`🔗 Länk: https://sprakmonsterlabbet.holmbergfriends.com/rapport.html?token=${data.token}`);
}

main().catch((err) => {
  console.error('❌ Oväntat fel:', err.message);
  process.exit(1);
});
