import { createSession } from './airtable.js';

const FREE_LIMIT = 10;
const UNLIMITED = ['paid', 'admin'];

// Beräkna usage-status för en användare
export function calcUsage(user) {
  const unlimited = UNLIMITED.includes(user.access_type);
  const used = user.used_sessions ?? 0;
  const remaining = unlimited ? null : Math.max(0, FREE_LIMIT - used);
  const is_blocked = !unlimited && used >= FREE_LIMIT;

  return {
    used_sessions: used,
    remaining_sessions: remaining,   // null = obegränsat
    limit: unlimited ? null : FREE_LIMIT,
    is_blocked,
    access_type: user.access_type,
  };
}

// GET /api/usage
export async function handleUsage(user) {
  return {
    status: 200,
    body: { ok: true, usage: calcUsage(user) },
  };
}

// Kontrollera och logga session innan en skyddad endpoint körs.
// Returnerar null om OK, eller ett svar-objekt om blockerad.
export async function requireUsage(user, moduleType, env) {
  const usage = calcUsage(user);

  if (usage.is_blocked) {
    return {
      status: 402,
      body: {
        ok: false,
        error: 'session_limit_reached',
        message: 'Du har använt dina fria sessioner.',
        paywall: true,
      },
    };
  }

  // Logga sessionen
  await createSession(user.id, moduleType, env);
  return null;
}
