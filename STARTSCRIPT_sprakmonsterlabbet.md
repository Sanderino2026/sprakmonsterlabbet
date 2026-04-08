# STARTSCRIPT — Språkmönsterlabbet
*Uppdaterad 2026-03-23*

---

## PROJEKTÖVERSIKT

Du hjälper mig bygga **Språkmönsterlabbet** — ett webbaserat verktyg för kommunikationsmönsteranalys (metaprogram) i arbetslivet, byggt på Shelle Rose Charvet's LAB Profile-modell.

**Bolag:** Communigo (separat från Holmberg & Friends)
**Varumärke:** Holmberg & Friends (holmbergfriends.com)

---

## TEKNISK STACK

| Komponent | Teknologi | URL |
|---|---|---|
| Backend | Cloudflare Worker | https://sprakmonsterlabbet.alexander-894.workers.dev |
| Frontend (profil + rapport) | Cloudflare Pages | https://sprakmonsterlabbet.holmbergfriends.com |
| Frontend (textanalys) | Squarespace | https://www.holmbergfriends.com/sprakmonsterlabbet-analys |
| Databas | Airtable | Base ID: appV7UG9UdiWbMVfS |
| Betalning | Stripe (live-läge) | — |
| E-post | Resend | noreply@holmbergfriends.com |
| AI | Anthropic Claude API | claude-sonnet-4-20250514 |
| Lokalt | ~/Desktop/Utvecklingsverkstaden-v2/sprakmonsterlabbet/ | — |

---

## SÅ HÄR ARBETAR VI

1. Alexander kodar inte själv — aldrig.
2. Tre verktyg: **Claude (planering/strategi)** · **Claude Code (all kod)** · **Terminal (deploy, secrets)**
3. Instruktioner till Claude Code ska ALLTID ligga i ett kodblock.
4. En modul i taget.
5. Var 5–6 kodändringar: uppdatera STARTSCRIPT och STATUS.md.
6. Frontend (Pages) deployas med:
   cd ~/Desktop/Utvecklingsverkstaden-v2/sprakmonsterlabbet && npx wrangler pages deploy pages/ --project-name sprakmonsterlabbet
7. Backend deployas med:
   cd ~/Desktop/Utvecklingsverkstaden-v2/sprakmonsterlabbet && npx wrangler deploy
8. Loggar: npx wrangler tail sprakmonsterlabbet
9. wrangler login måste köras i standard Terminal (kräver browser OAuth)
10. Om OAuth-token löper ut: starta CC med ANTHROPIC_API_KEY=sk-ant-... claude

---

## MAPPSTRUKTUR

~/Desktop/Utvecklingsverkstaden-v2/sprakmonsterlabbet/
  src/
    index.js                    ← Worker router, ALLOWED_ORIGINS, CORS
    airtable.js                 ← alla Airtable-funktioner
    stripe.js                   ← handleStripeCheckout, handleStripeWebhook
    profile_submit.js           ← POST /api/profile/submit
    report_generate.js          ← genererar rapport via Claude API
    send_analysis.js            ← skickar analysresultat via Resend
    analyse_standalone.js       ← POST /api/analyse-text-standalone
    auth.js                     ← magic link-auth (äldre modul, ej primär)
    feedback.js                 ← POST /api/feedback
    prompts/
      report_prompt.js          ← rapportprompt med ny JSON-struktur
      analyse_standalone_prompt.js
  pages/
    profil.html                 ← formulärsidan (Cloudflare Pages)
    gratis-rapport.html         ← gratisrapport med betalvägg
    rapport.html                ← fullständig rapport (sidebar-navigation)
  frontend/
    analys.html                 ← textanalys-sidan (Squarespace copy-paste)
    feedback.html               ← feedbackflöde (5 vyer)

---

## CLOUDFLARE SECRETS (alla satta, live-läge)

| Namn | Vad |
|---|---|
| AIRTABLE_API_KEY | Airtable-autentisering |
| AIRTABLE_BASE_ID | appV7UG9UdiWbMVfS |
| ANTHROPIC_API_KEY | Claude API |
| RESEND_API_KEY | Transaktionell e-post |
| STRIPE_SECRET_KEY | Stripe REST API (live sk_live_) |
| STRIPE_WEBHOOK_SECRET | Verifierar Stripe webhook-signatur (live whsec_) |
| SESSION_SECRET | HMAC-SHA256-signering |
| LEADS_BASE_ID | Airtable bas-ID för Leads-tabellen (appQlXrHjAnwDuC5e) |

---

## AIRTABLE — TABELLER & FÄLT

### Users
Email · Name · Status (active/blocked) · Access Type (guest/lead/respondent/paid_once/paid_monthly/paid_yearly/admin) · Remaining Analyses · Standalone Analyses · Used Sessions · Last Login At

### Profiles
User (link) · Answers JSON · Result JSON · Report Text · Report Token · Communication Style · Development Hint

### Analyses
User (link) · Input Text · Result JSON · Summary · Accuracy Rating (number 1–5)

### Feedback
Email · Träffsäker (1–5) · Mest användbart · Saknades eller otydligt · Skulle du använda det (Ja/Kanske/Nej) · Övriga tankar · Skapad

### Codes
Code · Type (single select: alumni/partner/demo) · Used (checkbox) · Used By · Used At · Created At

### Sessions, Exercises, Exercise Attempts
(äldre tabeller, används ej aktivt i v2)

---

## STRIPE — PRISALTERNATIV (LIVE)

| Produkt | Price ID | Pris |
|---|---|---|
| Kommunikationsprofil — Full | price_1TE6FFHrTws6MQZqOiYLRzGE | 799 kr |
| Kommunikationsprofil — Alumni | price_1TE9RZHrTws6MQZqVEhOtaY0 | 499 kr |
| Relationsprofil | price_1TE6O0HrTws6MQZq014UYJG8 | 49 kr |

Alla priser inkl. moms. Alexander sköter momsredovisning manuellt.
Webhook: checkout.session.completed → /api/stripe/webhook

---

## API-ENDPOINTS

| Method | Path | Funktion |
|---|---|---|
| POST | /api/profile/submit | Sparar profilsvar i Airtable, skapar/hittar användare, skickar gratisrapport-mail |
| POST | /api/stripe/checkout | Skapar Stripe Checkout Session |
| POST | /api/stripe/webhook | Hanterar checkout.session.completed, triggar rapportgenerering |
| GET | /api/gratis-rapport | Hämtar gratisrapportdata (ett mönster) via token/profile_id |
| GET | /api/rapport | Hämtar fullständig rapport via Report Token |
| GET | /api/report-by-profile | Pollar om rapport är klar via profile_id |
| POST | /api/validate-code | Validerar alumni-/partnerkod mot Codes-tabell |
| POST | /api/analyse-text-standalone | Textanalys som gäst (guest_id i body) |
| GET | /api/analyses-status | Hämtar remaining_analyses (guest_id som query-param) |
| POST | /api/send-analysis | Skickar analysresultat via Resend |
| POST | /api/feedback | Sparar feedback, sätter Remaining Analyses = 10, skickar tack-mail |
| POST | /api/analyses/rate | Sparar Accuracy Rating (1–5) på analysrad |

---

## SPRAK-BILDER (Squarespace CDN)

OBS: Worker har ingen bildroute — alla bilder hämtas från Squarespace CDN.
- sprak_base: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/f43d6801-6439-4747-90ed-a5d9c0741499/sprak_base.png?content-type=image%2Fpng
- glad: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/69c7ba3c-da19-4b2e-a0d7-771a8cd9844a/glad.png?content-type=image%2Fpng
- cool: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/e330cfd6-e36c-4b03-abd8-828562656512/cool.png?content-type=image%2Fpng
- fundersam: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/cd0a6fda-f771-4464-afee-8ced37341c69/fundersam.png?content-type=image%2Fpng

---

## VIKTIGA REGLER (läs alltid)

- Skriv ALDRIG "Till-personer", "Procedur-personer" etc. — personen HAR ett mönster, ÄR det inte.
- Bolagsnamn: alltid "Holmberg & Friends" (aldrig "Holmberg & Vänner")
- Maskoten heter "Sprak" (inte Sprock)
- Externt mönster = söker information som beslutsunderlag — INTE bekräftelsebehov
- Cross-origin cookies fungerar inte mellan Squarespace och Cloudflare Workers — använd localStorage
- Patcha aldrig trasig logik upprepade gånger — skriv om den från grunden

---

## PRODUKTSTRATEGI

Tre produkter på samma plattform:

**1. Textanalys** — Klistra in en text, få språkmönsteranalys. Freemium (3 gratis → betalt).
**2. Språkmönsterprofilen** — 5 öppna frågor + ordklick → gratisrapport (ett mönster) → betalvägg för fullständig ~20-sidors Claude-genererad PDF. Köps till sig själv (799 kr) eller som present. Alumni-pris 499 kr via kod.
**3. Relationsprofilen** — Lätt version för par. 49 kr/person (98 kr som par).

Lead-funnel mot Coachande Ledarskap.

*Se STATUS.md för fullständig ändringslogg.*
