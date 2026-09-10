import { findUserByEmail, updateLastLogin } from './airtable.js';
import { skickaSmlMail } from './sml_mail.js';

const MAGIC_LINK_TTL = 900; // 15 minuter
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dagar
const FRONTEND_URL = 'https://www.holmbergfriends.com/sprakmonsterlabbet';

// ── Magic link: POST /api/auth/login ─────────────────────────────
const SAFE_RETURN_ORIGINS = [
  'https://www.holmbergfriends.com/',
  'https://holmbergfriends.com/',
  'https://www.alexanderholmberg.com/',
  'https://alexanderholmberg.com/',
];

export async function handleLogin(request, env) {
  const body = await request.json().catch(() => null);
  const { email: rawEmail, returnUrl = null, analysResult = null } = body ?? {};
  const email = rawEmail?.trim().toLowerCase();

  console.log('[handleLogin] returnUrl:', returnUrl);
  console.log('[handleLogin] analysResult present:', analysResult != null);

  if (!email || !email.includes('@')) {
    return { status: 400, body: { ok: false, error: 'invalid_email', message: 'Ange en giltig e-postadress.' } };
  }

  const user = await findUserByEmail(email, env);

  if (!user) {
    return { status: 404, body: { ok: false, error: 'user_not_found', message: 'Ingen användare med den e-postadressen har tillgång.' } };
  }

  if (user.status === 'blocked') {
    return { status: 403, body: { ok: false, error: 'user_blocked', message: 'Det här kontot är inte aktivt.' } };
  }

  // Skapa engångstoken och spara i KV
  const token = generateToken();
  await env.KV.put(`auth:${token}`, email, { expirationTtl: MAGIC_LINK_TTL });

  // Validera returnUrl mot kända origins, annars använd standard-URL
  const safeBase = returnUrl && SAFE_RETURN_ORIGINS.some(o => returnUrl.startsWith(o))
    ? returnUrl
    : FRONTEND_URL;
  const link = `${safeBase}?token=${token}`;

  await sendMagicLink(email, user.name, link, analysResult, env);

  return { status: 200, body: { ok: true, message: 'Inloggningslänk skickad.' } };
}

// ── Verifiera token: POST /api/auth/verify ───────────────────────
export async function handleVerify(request, env) {
  const body = await request.json().catch(() => null);
  const token = body?.token?.trim();

  if (!token) {
    return { status: 400, body: { ok: false, error: 'missing_token', message: 'Token saknas.' } };
  }

  const email = await env.KV.get(`auth:${token}`);
  if (!email) {
    return { status: 401, body: { ok: false, error: 'invalid_token', message: 'Länken är ogiltig eller har gått ut.' } };
  }

  // Engångsanvändning – ta bort token direkt
  await env.KV.delete(`auth:${token}`);

  const user = await findUserByEmail(email, env);
  if (!user) {
    return { status: 404, body: { ok: false, error: 'user_not_found' } };
  }

  // Uppdatera Last Login At i Airtable
  await updateLastLogin(user.id, env);

  // Skapa signerad session-cookie
  const sessionValue = await signSession(email, env.SESSION_SECRET);
  const cookie = `session=${sessionValue}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${SESSION_MAX_AGE}`;

  return {
    status: 200,
    cookie,
    body: {
      ok: true,
      user: {
        email: user.email,
        name: user.name,
        access_type: user.access_type,
      },
    },
  };
}

// ── Logout: POST /api/auth/logout ────────────────────────────────
export async function handleLogout(request, env) {
  const cookie = 'session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0';
  return { status: 200, cookie, body: { ok: true } };
}

// ── Hämta inloggad användare ─────────────────────────────────────
export async function getSessionUser(request, env) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  if (!match) return null;

  const email = await verifySession(match[1], env.SESSION_SECRET);
  if (!email) return null;

  return findUserByEmail(email, env);
}

// ── Hjälpfunktioner ───────────────────────────────────────────────
function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function signSession(email, secret) {
  const payload = btoa(JSON.stringify({ email, t: Date.now() }));
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

async function verifySession(value, secret) {
  const dotIndex = value.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const payload = value.slice(0, dotIndex);
  const sig = value.slice(dotIndex + 1);
  const expected = await hmacSign(payload, secret);
  if (expected !== sig) return null;
  try {
    const { email } = JSON.parse(atob(payload));
    return email || null;
  } catch {
    return null;
  }
}

function formatAnalysResultHtml(result) {
  if (!result || !Array.isArray(result.patterns)) return '';
  const rows = result.patterns.map(p => `
    <tr>
      <td style="padding:12px 0;border-top:1px solid #eee;vertical-align:top;width:160px;">
        <span style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#999;">${p.category ?? ''}</span><br>
        <strong style="font-size:16px;color:#1C1C1C;">${p.dominant ?? ''}</strong>
      </td>
      <td style="padding:12px 0 12px 20px;border-top:1px solid #eee;vertical-align:top;font-size:14px;color:#5A5A5A;line-height:1.6;">
        ${p.tolkning ?? ''}
      </td>
    </tr>
  `).join('');

  return `
    <hr style="border:none;border-top:1px solid #eee;margin:28px 0">
    <p style="font-size:11px;text-transform:uppercase;letter-spacing:0.1em;color:#999;margin-bottom:4px;">Din analys:</p>
    ${result.rubrik ? `<p style="font-family:Georgia,serif;font-size:22px;font-weight:300;color:#0D0D0D;margin:0 0 20px;">${result.rubrik}</p>` : ''}
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    ${result.summary ? `<p style="font-size:13px;color:#999;font-style:italic;margin-top:16px;">${result.summary}</p>` : ''}
  `;
}

async function sendMagicLink(email, name, link, analysResult, env) {
  const analysHtml = formatAnalysResultHtml(analysResult);
  await skickaSmlMail({
    mall_id: 'sml-magic-link',
    epost: email,
    variabler: { namn: name || '', lank: link, innehall_html: analysHtml },
    tvinga: true,
  });
}
