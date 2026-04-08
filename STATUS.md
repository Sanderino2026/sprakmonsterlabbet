# Språkmönsterlabbet — STATUS
*Uppdaterad 2026-03-23*

---

## URL:er

| Vad | URL |
|---|---|
| Worker (backend) | https://sprakmonsterlabbet.alexander-894.workers.dev |
| Frontend — profil, rapport | https://sprakmonsterlabbet.holmbergfriends.com |
| Frontend — textanalys | https://www.holmbergfriends.com/sprakmonsterlabbet-analys |

---

## Vad som är byggt ✅

### Infrastruktur
- Cloudflare Pages live på sprakmonsterlabbet.holmbergfriends.com (CNAME via Squarespace DNS)
- Worker live på sprakmonsterlabbet.alexander-894.workers.dev
- Alla live Stripe-nycklar satta (sk_live_, whsec_), webhook aktiv
- Airtable-tabell Codes skapad (alumni/partner/demo-koder)
- Kod i ~/Desktop/Utvecklingsverkstaden-v2/sprakmonsterlabbet/

### Formuläret (pages/profil.html)
- Komplett flöde: välkomstskärm → namn/e-post → 5 öppna frågor → ordklick (välj 5 av 12) → tacksida
- Situationsfält (fritext, valfritt) — ersätter gammalt kategori-val
- Svarstidsmätning i ms per fråga (proxy för Proaktiv/Reaktiv)
- Fisher-Yates-shuffle på ordchipsen
- Validering, progressindikator, mobilanpassat, bara framåt-navigation
- POST /api/profile/submit: sparar i Airtable, skapar/hittar användare, skickar gratisrapport-mail via Resend

### Gratisrapport (pages/gratis-rapport.html)
- Visar ett mönster gratis (Motivationsriktning)
- Betalvägg: köp till mig själv (799 kr) eller present till någon (799 kr)
- Alumni-kod-fält: valideras mot Codes-tabell → 499 kr-pris om giltig
- "Present till någon"-flöde: gift_to_name + gift_to_email skickas i Stripe metadata → presentmail skickas via webhook
- Bekräftelsesida efter köp (både "till mig" och "present")
- Team-sektion med demo-bokningsknapp (mailto)

### Fullständig rapport (pages/rapport.html)
- Sidebar-navigation, 9 sektioner
- Ny JSON-struktur med separata fält per dimension och underrubriker:
  NÄR DU MÖTER SAMMA MÖNSTER / NÄR DU MÖTER MOTSATT MÖNSTER / ÅTERKOPPLING OCH FEEDBACK / RISKER OCH BLINDA FLÄCKAR / I KONFLIKT / I FÖRHANDLING / KOMMUNIKATIONSTIPS
- max_tokens: 8000 för gedigen rapportlängd
- Pollar GET /api/report-by-profile tills rapport är klar (max 10 × 3 sek)

### Rapportgenerering (src/report_generate.js + src/prompts/report_prompt.js)
- Triggas av Stripe webhook (checkout.session.completed)
- JSON-struktur med 8 mönsteravsnitt + helhetsbild + nästa_steg
- Rapport sparas i Profiles-tabellen (Report Text + Report Token)
- Korrekt: Externt mönster = informationsunderlag, inte bekräftelsebehov

### Stripe (live)
- price_1TE6FFHrTws6MQZqOiYLRzGE — Kommunikationsprofil Full, 799 kr
- price_1TE9RZHrTws6MQZqVEhOtaY0 — Kommunikationsprofil Alumni, 499 kr
- price_1TE6O0HrTws6MQZq014UYJG8 — Relationsprofil, 49 kr
- Webhook: checkout.session.completed → rapportgenerering + mail

### Textanalys (frontend/analys.html + Squarespace)
- Fem vyer: Introduktion → Förståelsefrågor → Analys → Resultat → Uppgradering
- guest_id i localStorage, remaining_analyses-räknare
- Onboarding-skärm, kunskapskontroll, navigationslåsning
- Stjärnwidget (1–5) för träffsäkerhetsbetyg
- Stripe-betalvägg (äldre prisstruktur, 49/249/1990 kr — sandlåda)

### Feedback (frontend/feedback.html)
- 5-vyersflöde, Sprak-bilder från Squarespace CDN
- Sparar till Airtable Feedback-tabell, skickar tack-mail

---

## Kända buggar / oklart status 🐛

| Status | Bugg/fråga |
|---|---|
| ⏳ Ej verifierat | Webhook live-verifiering (testköp med riktigt kort) |
| ⏳ Ej klart | Alumni-koder genererade i Codes-tabellen (tabellen finns, koder saknas) |
| ⏳ Ej byggt | "Tipsa en vän"-funktion (skicka rapport till annan via e-post) |
| ⏳ Ej byggt | SoMe-delning av resultat |
| ⏳ Ej byggt | Situationsfältets text används ej i rapportpromptens kontext ännu |

---

## ÄNDRINGSLOGG

### 2026-03-23 — Leads-tabell i separat Airtable-bas

**Ny Airtable-bas för leads:**
- Bas: appQlXrHjAnwDuC5e / Tabell: tblSIQ6Z78Jpo366s
- Fält: Email, Name, Source, Status, Created At
- Secret: LEADS_BASE_ID = appQlXrHjAnwDuC5e (satt via wrangler secret)

**Ny funktion i `src/airtable.js`:**
- `saveToLeadsTable(env, { email, name, source })`: söker om email redan finns, skapar ny rad om inte

**Trigger:**
- `src/stripe.js` webhook: vid present-köp (gift_to_email) → sparar mottagaren som lead med source="gift"

---

### 2026-03-23 — V2-lansering, rapport och Stripe live

**Nya filer:**
- pages/profil.html — formulärsidan (Cloudflare Pages)
- pages/gratis-rapport.html — gratisrapport med betalvägg och kodsystem
- pages/rapport.html — fullständig rapport med sidebar-navigation
- src/profile_submit.js — POST /api/profile/submit
- src/report_generate.js — rapportgenerering via Claude API
- src/prompts/report_prompt.js — rapportprompt, ny JSON-struktur med underrubriker

**Ändringar i befintliga filer:**
- src/airtable.js — saveProfileResponse(), saveReport(), getProfileByToken() m.fl.
- src/stripe.js — RAPPORT_FULL_PRICE_ID, RAPPORT_ALUMNI_PRICE_ID, presentflöde, rapportgenerering i webhook
- src/index.js — nya routes: /api/profile/submit, /api/gratis-rapport, /api/rapport, /api/report-by-profile, /api/validate-code; CORS uppdaterad för sprakmonsterlabbet.holmbergfriends.com

**Airtable:**
- Profiles-tabell: nya fält Report Text, Report Token
- Ny tabell: Codes (Code, Type, Used, Used By, Used At, Created At)
