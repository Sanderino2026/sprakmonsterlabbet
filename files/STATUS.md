# Språkmönsterlabbet — STATUS
*Uppdaterad 2026-03-11*

---

## URL:er

| Vad | URL |
|---|---|
| Worker (backend) | `https://sprakmonsterlabbet.alexander-894.workers.dev` |
| Frontend — labbet | `https://www.holmbergfriends.com/sprakmonsterlabbet` |
| Frontend — standalone analys | `https://www.holmbergfriends.com/sprakmonsterlabbet-analys` |
| Claude API | `https://api.anthropic.com/v1/messages` |
| Resend API | `https://api.resend.com/emails` |
| Airtable API | `https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/` |
| Stripe API | `https://api.stripe.com/v1/` |

---

## Secrets (sätts via `npx wrangler secret put <NAMN>`)

| Namn | Vad |
|---|---|
| `AIRTABLE_API_KEY` | Airtable-autentisering |
| `AIRTABLE_BASE_ID` | `appV7UG9UdiWbMVfS` |
| `ANTHROPIC_API_KEY` | Claude API |
| `RESEND_API_KEY` | Magic link-mail via Resend |
| `SESSION_SECRET` | Signerar session-cookies (HMAC-SHA256) |
| `STRIPE_SECRET_KEY` | Stripe REST API (sandlåda) |
| `STRIPE_WEBHOOK_SECRET` | Verifierar Stripe webhook-signatur (sandlåda) |

## KV (wrangler.toml)

| Binding | ID |
|---|---|
| `KV` | `a507970ece464c57be2f38b537041f70` |

## Hårdkodade konstanter

| Var | Värde |
|---|---|
| `FRONTEND_URL` | `https://www.holmbergfriends.com/sprakmonsterlabbet` |
| `WORKER_URL` | `https://sprakmonsterlabbet.alexander-894.workers.dev` |
| AI-modell | `claude-sonnet-4-20250514` |
| Magic link TTL | 15 min |
| Session TTL | 30 dagar |
| Gästkvot (gratis analyser) | 3 |
| ALLOWED_ORIGINS | `holmbergfriends.com`, `alexanderholmberg.com` (+ www) |

## Sprak-bilder (Squarespace CDN)

OBS: Worker har ingen bildroute — alla bilder hämtas från Squarespace CDN.
- sprak_base: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/f43d6801-6439-4747-90ed-a5d9c0741499/sprak_base.png?content-type=image%2Fpng
- glad: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/69c7ba3c-da19-4b2e-a0d7-771a8cd9844a/glad.png?content-type=image%2Fpng
- cool: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/e330cfd6-e36c-4b03-abd8-828562656512/cool.png?content-type=image%2Fpng
- fundersam: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/cd0a6fda-f771-4464-afee-8ced37341c69/fundersam.png?content-type=image%2Fpng

---

## Airtable — tabeller & fältnamn

### Users
`Email` · `Name` · `Status` (active/blocked) · `Access Type` (guest/lead/paid_once/paid_monthly/paid_yearly/admin) · `Remaining Analyses` (number) · `Standalone Analyses` (number) · `Used Sessions` · `Last Login At`

### Sessions
`User` (link) · `Module Type` (text_analysis/profile/training) · `Source` · `Session Key`

### Analyses
`User` (link) · `Input Text` · `Result JSON` · `Summary`
Analyses: lägg till fältet `Accuracy Rating` (number 1–5)

### Profiles
`User` (link) · `Answers JSON` · `Result JSON` · `Communication Style` · `Development Hint`

### Exercises
`Status` (active/inactive) · `Source Type` (curated/generated) · `Category` · `Pattern Category` · `Pattern Signal` · `Text` · `Question` · `Option 1`–`Option 4` · `Correct Index` (0–3) · `Explanation`

### Exercise Attempts
`User` (link) · `Exercise` (link) · `Selected Option Index` · `Correct` · `Timestamp`

> **OBS avvikande fältnamn** (spec → faktiskt): `Selected Index` → `Selected Option Index` · `Is Correct` → `Correct` · `Created At` → `Timestamp`

### Feedback
`Email` · `Träffsäker` (number 1–5) · `Mest användbart` (long text) · `Saknades eller otydligt` (long text) · `Skulle du använda det` (single select: Ja/Kanske/Nej) · `Övriga tankar` (long text) · `Skapad` (created time)

---

## Stripe — prisalternativ (sandlåda)

| Produkt | Price ID | Effekt i Airtable |
|---------|----------|-------------------|
| Engång 49 kr | `price_1T9j6zQc0eK2st18E4ezJAo0` | Access Type = paid_once, +3 analyser |
| Månad 249 kr | `price_1T9j7LQc0eK2st18vGZHIUq5` | Access Type = paid_monthly, 20 analyser |
| År 1990 kr | `price_1T9j7cQc0eK2st18NIrthzpG` | Access Type = paid_yearly, 20 analyser |

Webhook: `checkout.session.completed` → uppdaterar Airtable-rad via `guest_id` (i metadata) eller `email`.

---

## Vad som är byggt ✅

**Backend:**
- Magic link-auth (Resend), HMAC-signerade session-cookies
- CORS för tillåtna origins
- Textanalys via Claude (standalone, öppen) + inloggad variant
- Profilanalys + träningsmodul
- Airtable-persistens för alla moduler
- Backend-räknare: `Remaining Analyses` minskas vid varje analys, sätts vid köp
- Spärr: `remaining_analyses <= 0` → HTTP 402
- Stripe Checkout (sandlåda): skapar session via REST, skickar guest_id i metadata
- Stripe Webhook: verifierar signatur, uppdaterar Airtable via guest_id eller email
- `/api/analyses-status`: returnerar remaining_analyses för gäst (via query-param guest_id) eller inloggad
- `findOrCreateLead()`: sparar e-post som "lead" i Airtable efter mailutskick
- Cron job: schema `0 3 1 * *` — återställer Remaining Analyses = 20 för paid_monthly/paid_yearly den 1:a varje månad
- /api/feedback: sparar i Airtable Feedback-tabell, sätter Remaining Analyses = 10, skickar tack-mail med Sprak (glad.png) via Resend
- /api/analyses/rate: sparar Accuracy Rating (1–5) på analysrad i Airtable
- analyse_standalone.js returnerar analysis_record_id i svaret

**Frontend (analys.html):**
- Fem vyer: Introduktion, Förståelsefrågor, Analys, Resultat, Välj prenumeration
- guest_id sparas i localStorage, skickas i request body (inte cookie)
- Header visar remaining_analyses från backend — uppdateras vid sidladdning och efter varje analys
- Betalvägg (upgrade-vy) visas automatiskt vid 402 eller 0 analyser kvar
- Prenumerationsvy: tre prisboxar med Stripe Checkout-knappar
- ?payment=success: banner + retry-logik (4 försök × 2 sek), specifikt bekräftelsemeddelande per plan — URL rensas direkt efter visning
- Laddningsanimation med 25+ roterande fraser (Fnular... Grammatiserar... Tar en kaffe... etc.)
- "Ladda hem ditt resultat" → e-post → skickar HTML-mail via /api/send-analysis
- Samtyckestext (GDPR) under analysknappen och e-postfältet
- Mobilanpassad med responsiv CSS
- Onboarding-skärm för förstagångsbesökare (localStorage: `sml_onboarding_done`)
- Kunskapskontroll på förståelsefrågorna — rätt svar på båda krävs för att låsa upp ③ Analys
- ③ Analys låst tills båda förståelsefrågorna godkänts; ④ Resultat låst tills analysen körts klart
- Navigationssteg ⑤ (uppgradering) stylas orange/bold för att skilja sig från processtegen
- Pedagogiska informationsrutor om Motivationsriktning och Förståelsemönster i introduktionsvyn
- Resultatvyn: länk till holmbergfriends.com/coachandeledarskap för vidare lärande
- analys.html: stjärnwidget (1–5) i resultatvyn, tonar in via IntersectionObserver

**Frontend (feedback.html):**
- feedback.html: 5-vyersflöde (Välkomst → Instruktioner → Frågor → E-post → Tack), Sprak-bilder från Squarespace CDN

---

## Nästa steg 🔜

1. **Stripe live-nycklar** — byt från sandlåde- till live-nycklar
2. **Testgrupp** — samla feedback, buggar och justeringar

---

## Kända buggar och pågående felsökning 🐛

| Status | Bugg |
|--------|------|
| ✅ Löst | Tredjepartscookies blockerades cross-origin → bytt till localStorage |
| ✅ Löst | decrementAnalysis satte remaining till 0 vid GET-fel → kastar nu fel |
| ✅ Löst | guest_id skickades inte med i Stripe metadata → nu tillagt |
| ⏳ Ej verifierat | Headern visar 20 analyser efter månads/årsköp — ej live-testat |

---

## ÄNDRINGSLOGG

### 2026-03-11 — Feedback-system och träffsäkerhetsbetyg

**Nya filer:**
- src/feedback.js — POST /api/feedback: sparar i Airtable Feedback-tabell, sätter Remaining Analyses = 10, skickar tack-mail med Sprak (glad.png) via Resend
- frontend/feedback.html — 5-vyersflöde med Sprak-bilder från Squarespace CDN

**Ändringar i befintliga filer:**
- src/airtable.js — nya funktioner: saveFeedback(), setRemainingAnalyses(), rateAnalysis()
- src/feedback.js — Resend-anrop för tack-mail tillagt efter bugfix
- src/index.js — nya routes: /api/feedback, /api/analyses/rate
- src/analyse_standalone.js — returnerar nu analysis_record_id i svaret
- frontend/analys.html — stjärnwidget (1–5) i resultatvyn, tonar in via IntersectionObserver

**Airtable:**
- Ny tabell: Feedback (Email, Träffsäker, Mest användbart, Saknades eller otydligt, Skulle du använda det, Övriga tankar, Skapad)
- Analyses-tabell: nytt fält Accuracy Rating (number 1–5)

**Sprak-bilder:**
- Alla bilder serveras från Squarespace CDN (Worker saknar bildroute)
- sprak_base, glad, cool, fundersam uppladdade och URL:er hårdkodade i feedback.html

**Buggar lösta:**
- saveFeedback: fältnamnet "Skulle använda" → "Skulle du använda det" (matchade inte Airtable)
- feedback.js: Resend-anrop saknades helt — tillagt

---

### 2026-03-11 — UX-förbättringar och navigationslåsning

**Ändringar i frontend/analys.html:**
- Onboarding-skärm tillagd för förstagångsbesökare — visas tills `sml_onboarding_done` sätts i localStorage
- Kunskapskontroll på förståelsefrågorna: rätt svar krävs på båda, fel svar → röd markering + förklaringstext → återställs efter 2,5 sek
- ③ Analys låst (grå, ej klickbar) vid sidladdning — låses upp när båda frågorna besvarats korrekt
- ④ Resultat låst tills analysen körts klart
- Navigationssteg ⑤ stylas orange (#E8622A) och bold för att skilja sig från processtegen
- Laddningstexter utökade till 25+ roterande fraser
- Pedagogiska informationsrutor om Motivationsriktning och Förståelsemönster tillagda i introduktionsvyn
- Mönsterbadgar (tagg) ovanför varje förståelsefråga
- ?payment=success rensas från URL direkt efter att bekräftelsebannern visats (`history.replaceState`)
- Resultatvyn: länk till holmbergfriends.com/coachandeledarskap ersätter statisk text om fler mönster

**Ändringar i backend:**
- `src/airtable.js` — `resetMonthlyAnalyses()`: återställer Remaining Analyses = 20 för paid_monthly/paid_yearly med paginering
- `src/index.js` — `scheduled()`-handler tillagd för cron
- `wrangler.toml` — cron trigger `0 3 1 * *` tillagd

---

### 2026-03-11 — Stripe-integration och räknarsystem

**Nya filer:**
- `src/stripe.js` — POST /api/stripe/checkout (Stripe Checkout Session via REST), POST /api/stripe/webhook (hanterar checkout.session.completed, verifierar HMAC-SHA256-signatur)

**Ändringar i befintliga filer:**
- `src/index.js` — nya routes: /api/stripe/checkout, /api/stripe/webhook, /api/analyses-status (guest_id via query-param, 1500ms fördröjning vid after_payment=1)
- `src/airtable.js` — nya funktioner: updateUserAfterPayment(), updateGuestAfterPayment(), decrementAnalysis() (med res.ok-kontroll), findUserByRecordId(), createGuestRecord(), findOrCreateLead()
- `src/analyse_standalone.js` — komplett omskrivning: bara gästflöde (guest_id från body), spärr vid remaining_analyses <= 0 (HTTP 402), decrementAnalysis efter varje analys, returnerar guest_id och remaining_analyses i svaret
- `frontend/analys.html` — prenumerationsvy (49/249/1990 kr), header från backend, guest_id i localStorage, retry-logik vid ?payment=success (4 × 2 sek), specifika bekräftelsemeddelanden per plan

**Stripe:**
- Sandlåda: tre produkter — Engång (price_1T9j6zQc0eK2st18E4ezJAo0), Månad (price_1T9j7LQc0eK2st18vGZHIUq5), År (price_1T9j7cQc0eK2st18NIrthzpG)
- Webhook registrerad: checkout.session.completed → /api/stripe/webhook
- guest_id skickas i Stripe metadata → webhook uppdaterar rätt Airtable-rad

**Airtable:**
- Users-tabell: nytt fält "Remaining Analyses" (number)
- Access Type: nya alternativ paid_once, paid_monthly, paid_yearly, guest

**Felsökning:**
- Tredjepartscookies blockerades cross-origin (Squarespace → Workers) — löst: byt till localStorage för guest_id
- decrementAnalysis: bugg med felaktig räkning (current = 0 vid GET-fel) åtgärdad
- guest_id saknades i Stripe metadata — tillagt i checkout + webhook
- analyses-status läste sml_gid-cookie (fungerade ej cross-origin) — bytt till guest_id query-param

---

### 2026-03-11 — Leadhantering, samtycke och promptförbättringar

**Ändringar i befintliga filer:**
- `src/airtable.js` — ny funktion findOrCreateLead(email)
- `src/send_analysis.js` — anropar findOrCreateLead(email) efter lyckat mailutskick
- `frontend/analys.html` — samtyckestext under ANALYSERA-knappen och e-postfältet
- `src/prompts/analyse_standalone_prompt.js` — förbjuder "Till-personer" etc., beskrivning specifik per dominant-pol, konkreta BESKRIVNING-exempel per pol tillagda

**Airtable:**
- Access Type: nytt alternativ "lead" tillagt

---

### 2026-03-10 — Standalone-analys kopplad till backend

**Nya filer:**
- `src/analyse_standalone.js` — route POST /api/analyse-text-standalone
- `src/prompts/analyse_standalone_prompt.js` — prompt för Till/Ifrån + Alternativ/Procedur
- `frontend/analys.html` — ny produktionsfil (fem vyer)
- `src/send_analysis.js` — POST /api/send-analysis via Resend

**Ändringar i befintliga filer:**
- `src/index.js` — nya routes: /api/analyse-text-standalone, /api/send-analysis
- `src/auth.js` — magic link pekar på sprakmonsterlabbet-analys, returnUrl från body
- `src/airtable.js` — standalone_analyses-fält, incrementStandaloneCount()

**Airtable:**
- Users-tabell: nytt fält "Standalone Analyses" (number)

---

### 2026-03-09 — Grundplattform live

**Byggt:**
- Magic link-auth (Resend), HMAC-signerade session-cookies, KV-lagring av tokens
- Airtable-integration: Users, Sessions, Analyses, Profiles, Exercises, Exercise Attempts
- Textanalys + profilanalys via Claude
- Träningsmodul med 104 övningar importerade
- CORS för holmbergfriends.com + alexanderholmberg.com
- `frontend/index.html` — self-contained med alla fyra moduler
