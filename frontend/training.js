const BASE_URL = "https://sprakmonsterlabbet.alexander-894.workers.dev";

let currentExercise = null;
let trainScore = 0;
let trainTotal = 0;
let answered   = false;

async function smlGetExercise() {
  const container = document.getElementById("sml-exercise-container");
  if (container) container.innerHTML = `<p style="color:#888;font-size:.875rem">Hämtar övning…</p>`;

  try {
    const res = await fetch(`${BASE_URL}/api/training/exercise`, {
      method: "GET",
      credentials: "include",
    });

    if (res.status === 401) {
      document.getElementById("sml-app")?.style.setProperty("display", "none");
      document.getElementById("sml-login")?.style.setProperty("display", "block");
      return;
    }

    if (res.status === 402) {
      document.getElementById("sml-app")?.style.setProperty("display", "none");
      document.getElementById("sml-paywall")?.style.setProperty("display", "block");
      return;
    }

    const data = await res.json();

    if (!data.ok || !data.exercise) {
      if (container) container.innerHTML = `<p style="color:#c0392b;font-size:.875rem">Inga övningar tillgängliga just nu.</p>`;
      return;
    }

    currentExercise = data.exercise;
    answered = false;
    renderExercise(data.exercise);

  } catch {
    if (container) container.innerHTML = `<p style="color:#c0392b;font-size:.875rem">Kunde inte nå servern. Kontrollera din uppkoppling.</p>`;
  }
}

async function smlSubmitAnswer(selectedIndex) {
  if (answered || !currentExercise) return;
  answered = true;

  // Inaktivera alla svarsknappar direkt
  document.querySelectorAll(".sml-choice").forEach(b => b.disabled = true);

  try {
    const res = await fetch(`${BASE_URL}/api/training/answer`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        exercise_id:    currentExercise.exercise_id,
        selected_index: selectedIndex,
      }),
    });

    if (res.status === 401) {
      document.getElementById("sml-app")?.style.setProperty("display", "none");
      document.getElementById("sml-login")?.style.setProperty("display", "block");
      return;
    }

    const data = await res.json();
    if (!data.ok) return;

    const { correct, correct_index, explanation } = data.result;

    trainTotal++;
    if (correct) trainScore++;
    updateScore();

    // Markera rätt/fel på knapparna
    document.querySelectorAll(".sml-choice").forEach(btn => {
      const i = parseInt(btn.dataset.index);
      if (i === correct_index)                btn.classList.add("correct");
      else if (i === selectedIndex && !correct) btn.classList.add("wrong");
    });

    // Visa feedback
    const fb = document.getElementById("sml-feedback");
    if (fb) {
      fb.innerHTML = `<strong>${correct ? "✓ Rätt." : "✗ Inte riktigt."}</strong> ${explanation}`;
      fb.classList.add("show");
    }

    // Visa nästa-knapp
    document.getElementById("sml-next-btn")?.classList.add("show");

  } catch {
    // Återaktivera knappar vid nätverksfel
    answered = false;
    document.querySelectorAll(".sml-choice").forEach(b => b.disabled = false);
  }
}

function renderExercise(ex) {
  const container = document.getElementById("sml-exercise-container");
  if (!container) return;

  updateScore();

  container.innerHTML = `
    <div class="sml-exercise-ctx">
      ${[ex.pattern_category, ex.pattern_signal].filter(Boolean).join(" · ")}
    </div>
    <div class="sml-exercise-quote">${ex.text}</div>
    <div class="sml-exercise-q">${ex.question}</div>
    <div class="sml-choices">
      ${ex.options.map((opt, i) => `
        <button class="sml-choice" data-index="${i}">${opt}</button>
      `).join("")}
    </div>
    <div class="sml-feedback" id="sml-feedback"></div>
    <button class="sml-btn sml-btn-ghost sml-next-btn" id="sml-next-btn">
      Nästa övning →
    </button>
  `;

  // Svarsknappar
  container.querySelectorAll(".sml-choice").forEach(btn => {
    btn.addEventListener("click", () => smlSubmitAnswer(parseInt(btn.dataset.index)));
  });

  // Nästa övning
  document.getElementById("sml-next-btn").addEventListener("click", smlGetExercise);
}

function updateScore() {
  const el = document.getElementById("sml-score");
  if (el) el.textContent = `${trainScore} / ${trainTotal}`;
}

function smlResetTraining() {
  trainScore = 0;
  trainTotal = 0;
  currentExercise = null;
  answered = false;
  updateScore();
  smlGetExercise();
}
