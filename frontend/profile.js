const BASE_URL = "https://sprakmonsterlabbet.alexander-894.workers.dev";

// V1: arbetssammanhang (hårdkodat)
// V2: ersätt med värde från användargränssnitt
const CONTEXT = "work";

const PROFILE_QUESTIONS = [
  { question_id: "q1", metaprogram: "Motivationsriktning",       question: "Vad vill du uppnå med din roll som ledare?" },
  { question_id: "q2", metaprogram: "Beslutsram",                 question: "Hur vet du att du har gjort ett bra arbete?" },
  { question_id: "q3", metaprogram: "Förståelse",                 question: "Varför valde du ditt nuvarande arbete?" },
  { question_id: "q4", metaprogram: "Förändringsrelation",        question: "Vad är relationen mellan ditt arbete nu och för ett år sedan?" },
  { question_id: "q5", metaprogram: "Detaljnivå",                 question: "Berätta om ett projekt du nyligen arbetat med." },
  { question_id: "q6", metaprogram: "Handlingsstil",              question: "När du får en ny uppgift – vad händer då?" },
  { question_id: "q7", metaprogram: "Sinneskommunikationskanal",  question: "Hur vet du att någon annan har gjort ett bra arbete?" },
];

function smlBuildProfileQuestions() {
  const container = document.getElementById("sml-profile-questions");
  if (!container) return;

  container.innerHTML = PROFILE_QUESTIONS.map((pq, i) => `
    <div class="sml-question-card">
      <div class="sml-question-meta">
        Fråga ${i + 1} / ${PROFILE_QUESTIONS.length} · ${pq.metaprogram}
      </div>
      <div class="sml-question-text">${pq.question}</div>
      <textarea
        class="sml-input"
        id="sml-pq-${pq.question_id}"
        placeholder="Skriv ditt svar…"
      ></textarea>
    </div>
  `).join("");
}

async function smlSaveProfile() {
  const answers = PROFILE_QUESTIONS.map(pq => ({
    question_id: pq.question_id,
    question:    pq.question,
    answer:      (document.getElementById(`sml-pq-${pq.question_id}`)?.value || "").trim(),
  })).filter(a => a.answer.length > 5);

  if (answers.length < 4) {
    alert("Svara på minst 4 frågor för att få din profil.");
    return;
  }

  const btn     = document.getElementById("sml-profile-btn");
  const loading = document.getElementById("sml-profile-loading");
  const result  = document.getElementById("sml-profile-result");

  btn.disabled = true;
  if (loading) loading.style.display = "block";
  if (result)  result.style.display  = "none";

  try {
    const res = await fetch(`${BASE_URL}/api/profile`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers, context: CONTEXT }),
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

    if (!data.ok) {
      renderProfileError("Kunde inte skapa profil. Försök igen.");
      return;
    }

    renderProfile(data.result);
    if (result) result.style.display = "block";
    result?.scrollIntoView({ behavior: "smooth", block: "start" });

  } catch {
    renderProfileError("Kunde inte nå servern. Kontrollera din uppkoppling.");
  } finally {
    btn.disabled = false;
    if (loading) loading.style.display = "none";
  }
}

function renderProfile(data) {
  const out = document.getElementById("sml-profile-output");
  if (!out) return;

  out.innerHTML =
    data.profile.map(p => `
      <div class="sml-pattern-item">
        <div class="sml-pattern-meta">
          <div class="sml-pattern-cat">${p.category}</div>
          <span class="sml-pattern-signal">${p.signal}</span>
          <div class="sml-pattern-strength">${p.strength}</div>
        </div>
        <div>
          <div class="sml-pattern-evidence">
            ${(p.evidence || []).map(e => `"${e}"`).join(" · ")}
          </div>
          <div class="sml-pattern-expl">${p.insight}</div>
        </div>
      </div>
    `).join("") +
    `<div class="sml-profile-strip">
       <div>
         <div class="sml-profile-strip-label">Din kommunikationsstil</div>
         <div class="sml-profile-strip-val">${data.communication_style}</div>
       </div>
       <div>
         <div class="sml-profile-strip-label">Att utforska vidare</div>
         <div class="sml-profile-strip-val">${data.development_hint}</div>
       </div>
     </div>
     <div class="sml-note">${data.note || ""}</div>`;
}

function renderProfileError(message) {
  const out    = document.getElementById("sml-profile-output");
  const result = document.getElementById("sml-profile-result");
  if (out)    out.innerHTML = `<p style="color:#c0392b;font-size:.875rem">${message}</p>`;
  if (result) result.style.display = "block";
}

// Bygg frågorna direkt när scriptet laddas
smlBuildProfileQuestions();
