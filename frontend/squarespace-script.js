// ─────────────────────────────────────────────────────────────────
//  Språkmonsterlabbet — Squarespace frontend
//  V1: sammanhang = arbete (hårdkodat)
//  V2: byt ut CONTEXT mot ett värde från användargränssnittet
// ─────────────────────────────────────────────────────────────────

const WORKER_URL = 'https://sprakmonsterlabbet.alexander-894.workers.dev';
const CONTEXT = 'work'; // V2: ersätt med valt sammanhang

// ── Kärn-API-funktion ─────────────────────────────────────────────
// Hanterar credentials, 401 och 402 för alla anrop automatiskt.
// Kasta aldrig direkt — läs .ok och .error i returnerat objekt.

async function callAPI(method, path, body = null) {
  const options = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  };

  if (body !== null) {
    options.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${WORKER_URL}${path}`, options);
  } catch {
    return { ok: false, error: 'network_error', message: 'Kunde inte nå servern.' };
  }

  if (res.status === 401) {
    showLoginForm();
    return { ok: false, error: 'unauthorized' };
  }

  if (res.status === 402) {
    showPaywall();
    return { ok: false, error: 'session_limit_reached', paywall: true };
  }

  const data = await res.json().catch(() => null);
  if (!data) return { ok: false, error: 'parse_error', message: 'Ogiltigt svar från server.' };

  return data;
}

// ── Auth ──────────────────────────────────────────────────────────

export async function login(email) {
  return callAPI('POST', '/api/auth/login', { email });
}

export async function verifyToken(token) {
  return callAPI('POST', '/api/auth/verify', { token });
}

export async function logout() {
  const result = await callAPI('POST', '/api/auth/logout');
  if (result.ok) showLoginForm();
  return result;
}

// ── Usage ─────────────────────────────────────────────────────────

export async function getUsage() {
  return callAPI('GET', '/api/usage');
}

// ── Analysera text ────────────────────────────────────────────────
// V2: lägg till context i body: { text, context }

export async function analyseText(text) {
  return callAPI('POST', '/api/analyse-text', { text, context: CONTEXT });
}

// ── Profil ────────────────────────────────────────────────────────
// answers = [{ question_id, question, answer }]
// V2: lägg till context i body: { answers, context }

export async function saveProfile(answers) {
  return callAPI('POST', '/api/profile', { answers, context: CONTEXT });
}

// ── Träning ───────────────────────────────────────────────────────
// V2: lägg till context som query-param eller i body

export async function getExercise() {
  return callAPI('GET', '/api/training/exercise');
}

export async function submitAnswer(exerciseId, selectedIndex) {
  return callAPI('POST', '/api/training/answer', {
    exercise_id: exerciseId,
    selected_index: selectedIndex,
  });
}

// ── UI-hjälpfunktioner ────────────────────────────────────────────
// Dessa förutsätter att element med dessa ID:n finns i Squarespace-sidan.
// Byt ut mot din faktiska HTML-struktur.

function showLoginForm() {
  const loginEl = document.getElementById('sml-login');
  const appEl = document.getElementById('sml-app');
  if (loginEl) loginEl.style.display = 'block';
  if (appEl) appEl.style.display = 'none';
}

function showPaywall() {
  const paywallEl = document.getElementById('sml-paywall');
  if (paywallEl) {
    paywallEl.style.display = 'block';
    paywallEl.innerHTML = `
      <div class="sml-paywall-box">
        <h3>Du har använt dina fria sessioner</h3>
        <p>För att fortsätta analysera, utforska din profil och träna vidare behöver du uppgradera din tillgång.</p>
      </div>
    `;
  }
}

// ── Initiering vid sidladdning ────────────────────────────────────
// Kontrollera om användaren är inloggad och visa rätt vy.

async function init() {
  // Kontrollera om det finns en ?token= i URL:en (magic link-retur)
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');

  if (token) {
    // Ta bort token ur URL utan omladdning
    window.history.replaceState({}, '', window.location.pathname);
    const result = await verifyToken(token);
    if (!result.ok) return; // showLoginForm anropas av callAPI vid 401
    showApp(result.user);
    return;
  }

  // Ingen token — kolla om användaren redan har en giltig session
  const usage = await getUsage();
  if (usage.ok) {
    showApp();
  }
  // Annars visar callAPI login-formuläret via 401-hanteraren
}

function showApp(user = null) {
  const loginEl = document.getElementById('sml-login');
  const appEl = document.getElementById('sml-app');
  if (loginEl) loginEl.style.display = 'none';
  if (appEl) appEl.style.display = 'block';
}

// Starta när DOM är klar
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
