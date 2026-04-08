const BASE_URL = "https://sprakmonsterlabbet.alexander-894.workers.dev";

function setStatus(message, isError = false) {
  const el = document.getElementById('sml-status');
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? '#c0392b' : '#2e7d52';
}

async function smlLogin(email) {
  setStatus('Skickar…');

  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (data.ok) {
      setStatus('Kolla din e-post – vi har skickat en länk!');
      return;
    }

    if (data.error === 'user_not_found') {
      setStatus('Ingen användare med den e-postadressen har tillgång.', true);
    } else if (data.error === 'user_blocked') {
      setStatus('Det här kontot är inte aktivt.', true);
    } else {
      setStatus('Något gick fel. Försök igen.', true);
    }
  } catch {
    setStatus('Kunde inte nå servern. Kontrollera din uppkoppling.', true);
  }
}

async function smlVerify() {
  const token = new URLSearchParams(window.location.search).get('token');
  if (!token) return;

  // Ta bort token ur URL utan omladdning
  window.history.replaceState({}, '', window.location.pathname);

  setStatus('Loggar in…');

  try {
    const res = await fetch(`${BASE_URL}/api/auth/verify`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });

    const data = await res.json();

    if (data.ok) {
      document.getElementById('sml-login')?.style.setProperty('display', 'none');
      document.getElementById('sml-app')?.style.setProperty('display', 'block');
      return;
    }

    setStatus('Länken är ogiltig eller har gått ut. Begär en ny.', true);
  } catch {
    setStatus('Kunde inte nå servern. Kontrollera din uppkoppling.', true);
  }
}

async function smlLogout() {
  try {
    await fetch(`${BASE_URL}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch {
    // Logga ut lokalt även om anropet misslyckas
  }

  document.getElementById('sml-app')?.style.setProperty('display', 'none');
  document.getElementById('sml-login')?.style.setProperty('display', 'block');
}

// Kör smlVerify automatiskt om ?token= finns i URL
if (new URLSearchParams(window.location.search).has('token')) {
  smlVerify();
}
