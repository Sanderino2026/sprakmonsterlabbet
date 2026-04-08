import { requireUsage } from './usage.js';
import { getRandomExercise, getExerciseById, saveExerciseAttempt } from './airtable.js';

const OPTION_POOLS = {
  sinneskommunikation: ['Syn', 'Hörsel', 'Känsel'],
  språkpåverkan:       ['Till', 'Ifrån', 'Intern', 'Extern', 'Likhet', 'Skillnad', 'Alternativ', 'Procedur'],
};

function getOptionCategory(signal) {
  const s = (signal ?? '').toLowerCase();
  if (['syn', 'hörsel', 'känsel'].includes(s)) return 'sinneskommunikation';
  return 'språkpåverkan';
}

// Deterministisk hash så att samma exercise+user alltid ger samma ordning
function djb2(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

function buildOptions(correctSignal, optionCategory, seed) {
  const pool = [...OPTION_POOLS[optionCategory]].filter(o => o.toLowerCase() !== correctSignal.toLowerCase());
  // Deterministisk Fisher-Yates
  for (let i = pool.length - 1; i > 0; i--) {
    const j = djb2(seed + i) % (i + 1);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const opts = pool.slice(0, 3);
  const pos = djb2(seed + 'pos') % (opts.length + 1);
  opts.splice(pos, 0, correctSignal);
  return { options: opts, correct_index: pos };
}

// ── GET /api/training/exercise ────────────────────────────────────
export async function handleGetExercise(request, user, env) {
  // Kontrollera sessionsgräns och logga session
  const blocked = await requireUsage(user, 'training', env);
  if (blocked) return blocked;

  const exercise = await getRandomExercise(env);

  if (!exercise) {
    return {
      status: 404,
      body: { ok: false, error: 'no_exercises_available', message: 'Det finns inga tillgängliga övningar just nu.' },
    };
  }

  const optionCategory = getOptionCategory(exercise.pattern_signal);
  const seed = exercise.exercise_id + user.id;
  const { options, correct_index } = buildOptions(exercise.pattern_signal, optionCategory, seed);

  return {
    status: 200,
    body: {
      ok: true,
      exercise: {
        ...exercise,
        option_category: optionCategory,
        options,
        // correct_index skickas INTE till klienten
      },
    },
  };
}

// ── POST /api/training/answer ─────────────────────────────────────
export async function handleAnswer(request, user, env) {
  const body = await request.json().catch(() => null);
  const { exercise_id, selected_index } = body ?? {};

  if (!exercise_id || selected_index === undefined || selected_index === null) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'exercise_id och selected_index krävs.' } };
  }

  if (!Number.isInteger(selected_index) || selected_index < 0 || selected_index > 3) {
    return { status: 400, body: { ok: false, error: 'invalid_input', message: 'selected_index måste vara 0–3.' } };
  }

  const exercise = await getExerciseById(exercise_id, env);

  if (!exercise) {
    return { status: 404, body: { ok: false, error: 'exercise_not_found', message: 'Övningen kunde inte hittas.' } };
  }

  // Reproducera samma options-ordning som i GET med samma seed
  const optionCategory = getOptionCategory(exercise.pattern_signal);
  const seed = exercise_id + user.id;
  const { correct_index } = buildOptions(exercise.pattern_signal, optionCategory, seed);

  const correct = selected_index === correct_index;

  // Spara försök i Airtable (asynkront)
  saveExerciseAttempt(user.id, exercise_id, selected_index, correct, env).catch(() => {});

  return {
    status: 200,
    body: {
      ok: true,
      result: {
        correct,
        correct_index: exercise.correct_index,
        explanation: exercise.explanation,
      },
    },
  };
}
