const BASE_URL = "https://sprakmonsterlabbet.alexander-894.workers.dev";

async function smlAnalyse() {
  const text = document.getElementById('sml-analyse-input')?.value.trim();
  if (!text) return;

  const btn     = document.getElementById('sml-analyse-btn');
  const loading = document.getElementById('sml-analyse-loading');
  const result  = document.getElementById('sml-analyse-result');

  btn.disabled = true;
  if (loading) loading.style.display = 'block';
  if (result)  result.style.display  = 'none';

  try {
    const res = await fetch(`${BASE_URL}/api/analyse-text`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (res.status === 401) {
      document.getElementById('sml-app')?.style.setProperty('display', 'none');
      document.getElementById('sml-login')?.style.setProperty('display', 'block');
      return;
    }

    if (res.status === 402) {
      document.getElementById('sml-app')?.style.setProperty('display', 'none');
      document.getElementById('sml-paywall')?.style.setProperty('display', 'block');
      return;
    }

    const data = await res.json();

    if (!data.ok) {
      renderError('Kunde inte analysera texten. Försök igen.');
      return;
    }

    renderResult(data.result);
    if (result) result.style.display = 'block';

  } catch {
    renderError('Kunde inte nå servern. Kontrollera din uppkoppling.');
  } finally {
    btn.disabled = false;
    if (loading) loading.style.display = 'none';
  }
}

function smlAnalyseClear() {
  const input  = document.getElementById('sml-analyse-input');
  const result = document.getElementById('sml-analyse-result');
  if (input)  input.value = '';
  if (result) result.style.display = 'none';
}

function renderResult(data) {
  const out = document.getElementById('sml-analyse-output');
  if (!out) return;

  out.innerHTML =
    data.patterns.map(p => `
      <div class="sml-pattern-item">
        <div class="sml-pattern-meta">
          <div class="sml-pattern-cat">${p.category}</div>
          <span class="sml-pattern-signal">${p.signal}</span>
          <div class="sml-pattern-strength">${p.strength} signal</div>
        </div>
        <div>
          <div class="sml-pattern-evidence">
            ${(p.evidence || []).map(e => `"${e}"`).join(' · ')}
          </div>
          <div class="sml-pattern-expl">${p.explanation}</div>
        </div>
      </div>
    `).join('') +
    `<div class="sml-summary">${data.summary}</div>
     <div class="sml-note">${data.note || ''}</div>`;
}

function renderError(message) {
  const out = document.getElementById('sml-analyse-output');
  const result = document.getElementById('sml-analyse-result');
  if (out)    out.innerHTML = `<p style="color:#c0392b;font-size:.875rem">${message}</p>`;
  if (result) result.style.display = 'block';
}
