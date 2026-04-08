# STARTSCRIPT — Språkmönsterlabbet
*Klistra in detta i början av en ny chatt med Claude*

---

## PROJEKTÖVERSIKT

Du hjälper mig bygga **Språkmönsterlabbet** — ett webbaserat verktyg för analys och träning av kommunikationsmönster (metaprogram) i arbetslivet.

**Teknisk stack:**
- Backend: Cloudflare Worker → `https://sprakmonsterlabbet.alexander-894.workers.dev`
- Frontend (labbet): Squarespace på `https://www.holmbergfriends.com/sprakmonsterlabbet`
- Frontend (standalone analys): Squarespace på `https://www.holmbergfriends.com/sprakmonsterlabbet-analys`
- Databas: Airtable (Base ID: `appV7UG9UdiWbMVfS`)
- Auth: Magic link via Resend (`noreply@holmbergfriends.com`)
- AI: Anthropic Claude API
- Kod lokal: `~/Desktop/sprakmonsterlabbet/`
- GitHub: `Sanderino2026/sprakmonsterlabbet`

---

## SÅ HÄR ARBETAR VI

**1. Jag kodar inte själv — aldrig.**

**2. Tre verktyg används alltid:**
- **Claude (denna chatt)** — strategi, instruktioner, beslut, felsökning
- **Claude Code (i terminal)** — skriver och redigerar ALL kod
- **Terminal (separat fönster)** — kör wrangler deploy, wrangler tail, secrets

**3. Instruktioner till Claude Code ska ALLTID ligga i ett kodblock** så jag kan kopiera enkelt.

**4. En modul i taget** — aldrig flera saker samtidigt.

**5. Var 5–6 kodändringar** — uppdatera STARTSCRIPT och STATUS.md.

**6. Claude Code körs i terminalen** — inte i denna chatt.

**7. Frontend (analys.html) kopieras alltid med:**
```
cat ~/Desktop/sprakmonsterlabbet/frontend/analys.html | pbcopy
```
Sedan klistras den in manuellt i Squarespace Code Block.

**8. Backend deployas alltid med:**
```
cd ~/Desktop/sprakmonsterlabbet && npx wrangler deploy
```

---

## TEKNISK STATUS (uppdaterad 2026-03-11)

**✅ Klart och live:**
- Auth-flöde: login → magic link → verify → session-cookie
- Airtable-integration med korrekt API-nyckel och Base ID
- CORS konfigurerat för alexanderholmberg.com + holmbergfriends.com
- Frontend `index.html` med alla fyra moduler (auth, analys, profil, träning)
- Övningsbank byggd från `samples.xlsx` → Airtable Exercises-tabell
- Standalone-analys GUI live på holmbergfriends.com/sprakmonsterlabbet-analys
- Route POST /api/analyse-text-standalone — öppen utan auth, prompt för Till/Ifrån + Alternativ/Procedur
- Backend-räknare med Airtable (ersätter gamla localStorage-räknaren)
- guest_id sparas i localStorage, skickas i request body vid varje anrop
- Spärr: remaining_analyses <= 0 → HTTP 402, frontend visar betalväggen
- Dynamisk rubrik baserad på mönsterkombination (genereras av AI)
- Pedagogiska beskrivningar per mönster + arbets- och relationskontext
- Laddningsanimation med roterande texter (Fnular... Petar... Pillar... etc.)
- "Ladda hem ditt resultat" → e-postfält → skickar analys som HTML-mail via /api/send-analysis
- Mobilanpassad med responsiv CSS
- Stripe Checkout live (sandlåda): tre prisalternativ — Engång 49kr, Månad 249kr, År 1990kr
- Webhook: checkout.session.completed uppdaterar Airtable via guest_id eller email
- Header uppdateras från backend efter varje analys och vid sidladdning
- ?payment=success: retry-logik (4 försök × 2 sek), specifikt bekräftelsemeddelande per plan
- findOrCreateLead() sparar e-post som "lead" i Airtable efter mailutskick
- Samtyckestext under analysknappen och e-postfältet (GDPR)
- Promptförbättringar: förbjuder "Till-personer" etc., beskrivning specifik per dominant-pol

**Cloudflare Secrets (alla satta):**
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID` = `appV7UG9UdiWbMVfS`
- `ANTHROPIC_API_KEY`
- `RESEND_API_KEY`
- `SESSION_SECRET`
- `STRIPE_SECRET_KEY` ← sandlådenyckel
- `STRIPE_WEBHOOK_SECRET` ← sandlådenyckel

**Mappstruktur:**
```
~/Desktop/sprakmonsterlabbet/
  src/
    index.js                  ← Worker router, ALLOWED_ORIGINS
    auth.js                   ← handleLogin, handleVerify, handleLogout, getSessionUser
    airtable.js               ← findUserByEmail, findUserByRecordId, createGuestRecord,
                                 decrementAnalysis, updateUserAfterPayment,
                                 updateGuestAfterPayment, findOrCreateLead,
                                 saveFeedback, setRemainingAnalyses, rateAnalysis m.fl.
    analyse.js                ← handleAnalyseText (inloggad)
    analyse_standalone.js     ← handleAnalyseTextStandalone (gäst via guest_id)
    stripe.js                 ← handleStripeCheckout, handleStripeWebhook
    feedback.js               ← handleFeedback — sparar feedback + sätter 10 analyser + tack-mail via Resend
    send_analysis.js          ← skickar analysresultat via Resend
    profile.js                ← handleProfile
    training.js               ← handleGetExercise, handleAnswer
    usage.js                  ← handleUsage
    prompts/
      analyse_prompt.js
      analyse_standalone_prompt.js
      profile_prompt.js
  frontend/
    index.html                ← produktionsfil för Squarespace Code Block
    analys.html               ← standalone-analyssidan
    feedback.html             ← testgrupp-feedback, 5 vyer, Sprak-bilder från Squarespace CDN
  icons/
    sprak_-_grund.png
    sprak_-_tio_olika_humo_r.png
  samples.xlsx
```

**Airtable — Users-tabellen:**
- Fält: Name, Email, Access Type, Status, Created At, Last Login At, Remaining Analyses, Standalone Analyses, Used Sessions, m.fl.
- Access Type-alternativ: `guest`, `lead`, `paid_once`, `paid_monthly`, `paid_yearly`, (admin/active för testanvändare)
- Remaining Analyses: number — minskas vid varje analys, sätts till 20 vid månads/årsköp, +3 vid engångsköp

**Stripe — prisalternativ (sandlåda):**
| Produkt | Price ID | Effekt |
|---------|----------|--------|
| Engång 49 kr | `price_1T9j6zQc0eK2st18E4ezJAo0` | Access Type = paid_once, +3 analyser |
| Månad 249 kr | `price_1T9j7LQc0eK2st18vGZHIUq5` | Access Type = paid_monthly, 20 analyser |
| År 1990 kr | `price_1T9j7cQc0eK2st18NIrthzpG` | Access Type = paid_yearly, 20 analyser |

**⏳ Nästa steg:**
1. Verifiera feedback-flödet live ✅ Klart
2. Verifiera Accuracy Rating ✅ Klart
3. ✅ Verifiera att headern visar 20 analyser korrekt efter månads/årsköp
2. ✅ Cron job för månadsåterställning av Remaining Analyses (paid_monthly/paid_yearly)
3. Byta från sandlåde-nycklar till live-nycklar i Stripe när allt är testat klart
4. ✅ Lås navigationen i analys.html — bara framåt i ordning
5. ✅ Länk till Coachande Ledarskap i upgrade-vyn

---

## Sprak-bilder (Squarespace CDN)

OBS: Worker har ingen bildroute — alla bilder hämtas från Squarespace CDN.
- sprak_base: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/f43d6801-6439-4747-90ed-a5d9c0741499/sprak_base.png?content-type=image%2Fpng
- glad: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/69c7ba3c-da19-4b2e-a0d7-771a8cd9844a/glad.png?content-type=image%2Fpng
- cool: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/e330cfd6-e36c-4b03-abd8-828562656512/cool.png?content-type=image%2Fpng
- fundersam: https://images.squarespace-cdn.com/content/62d95e2df2666719f12b020f/cd0a6fda-f771-4464-afee-8ced37341c69/fundersam.png?content-type=image%2Fpng

---

## PRODUKTSTRATEGI

Tre separata produkter på samma plattform med tydligt olika syften och målgrupper:

### 1. Textanalys — Det praktiska vardagsverktyget (standalone: Språkmönsterlabbet ANALYS)
Användaren tar en text de redan har — ett mail de fått, ett citat från en kund de ska förhandla med, något någon sagt som de inte riktigt förstår. Klistrar in texten och får en språkmönsteranalys.

- **Syfte:** Omedelbart användbart arbetsverktyg, inte ett träningsverktyg
- **Målgrupp:** Alla som kommunicerar professionellt — bred ingång
- **Affärsmodell:** 3 gratis analyser → prenumeration
- **Nyckelformulering:** *"Förstå vad kommunikationen egentligen säger"*

### 2. Språkmönsterprofil — Den kommersiella fristående produkten
Coachen eller konsulten gör en profil på sin klient som underlag för coaching och kommunikationsutveckling. Inte självskattning — ett externt kommunikationsunderlag baserat på hur klienten faktiskt uttrycker sig.

- **Syfte:** Stärker coachens/konsultens erbjudande med ett faktabaserat situationsspecifikt verktyg
- **Målgrupp (fas 1):** Coacher och konsulter som vill differentiera sig på marknaden
- **Målgrupp (fas 2):** HR, rekrytering, ledarutveckling
- **Affärsmodell:** Standalone produkt, B2B-orienterad
- **Differentiering:** Inte en identitetstypning — ett kommunikationsunderlag. *"Vi är inte våra mönster."*

### 3. Träningsmodul — Fördjupning för kursdeltagare
Exklusivt för alumni från Coachande Ledarskap. Sprock Monster som pedagog. Syftet är att befästa förmågan att faktiskt känna igen mönster i levande kommunikation — inte bara förstå dem teoretiskt.

- **Syfte:** Praktisk träning och fördjupning efter utbildning
- **Målgrupp:** Kursdeltagare Coachande Ledarskap (exklusivt)
- **Affärsmodell:** Ingår i kursen, inget separat pris
- **Format:** Gamifierat med progression och Sprock Monster

**De tre modulernas kärnskillnad:**
- Textanalys = *Göra något nu* (förstå ett konkret budskap)
- Profil = *Förstå någon annan djupare* (underlag för coaching)
- Träning = *Bli duktigare själv* (befästa kunskap)

**Differentiering mot DISC/färgtester:**
Alltid situationsspecifik. Kommunikationsbaserad. Inte identitetsbaserad.
Nyckelformulering: *"Vi är inte våra mönster."*

---

## SPROCK MONSTER

Maskot för träningsmodulen. Orange, energisk, med horn.

**Sprite-sheet innehåller 10 humör (3 rader × 4 kolumner minus 2):**

| Namn | Trigger |
|------|---------|
| `arg.png` | Fel svar |
| `ledsen.png` | Många fel i rad |
| `skrattande.png` | Rätt svar |
| `glad.png` | Streak (3+ rätt) |
| `chockad.png` | Oväntat rätt |
| `fundersam.png` | Ny övning visas |
| `somnig.png` | Inaktiv länge |
| `cool.png` | 5/5 rätt (solglasögon + tumme upp) |
| `tront.png` | Halvbra (3/5) |
| `explosiv.png` | 0–2/5 rätt |

**Sprock är "rösten" i träningsmodulen.** Han pratar i korta meningar, aldrig formellt.

**Gamification-regler:**
- Daglig utmaning: 5 övningar/dag
- 5/5 rätt → "Språkmönsterproffs!" + `cool.png`
- Under 3/5 → `explosiv.png` + hänvisning till kursmaterial
- 3–4/5 → `tront.png` + uppmuntran

---

## SPRÅKMODELLEN (de 7 mönstren)

| Mönster | Poler |
|---------|-------|
| Motivationsriktning | Till ↔ Ifrån |
| Beslutsram | Intern ↔ Extern |
| Förändringsrelation | Likhet ↔ Skillnad (+ undantag) |
| Detaljnivå | Helhet ↔ Detalj |
| Handlingsstil | Proaktiv ↔ Reaktiv |
| Förståelse | Alternativ ↔ Procedur |
| Sinneskommunikationskanal | Syn / Hörsel / Känsel |

**Grundmodell:** Identitet → Beteende → Kommunikation → Språkmönster

Språkmönster är observerbara kommunikationsfilter. De beskriver inte identitet eller personlighet. En text "signalerar" ett mönster — personen "är" det inte.

**Viktigt om sinneskommunikationskanaler:**
Känsel = kroppslig/fysisk förnimmelse och konkretion — INTE emotion.

**Språkmönstersorterande frågor:**
Specifikt utformade frågor vars svar avslöjar mönstret. Kräver egen promptlogik skild från fri textanalys.
- *"Hur vet du att du gjort ett bra jobb?"* → Intern/Extern
- *"Varför valde du ditt nuvarande arbete?"* → Procedur/Alternativ
- *"Vad är viktigt för dig i arbetet?"* → Till/Ifrån

**Sammanhang (kontextmodell):**
- V1: Sammanhang = Arbete (fast)
- V2: Valbart sammanhang (Arbete / Privata relationer / Ledarskap / etc.)
Samma person kan ha helt olika mönster i olika sammanhang. Alla frågor och övningar ska märkas med sammanhang-tagg från start.

---

## PEDAGOGISKA TEXTER FRÅN MERCURIOUS

**Om vad analysen INTE är:**
> "Det här är inte en profil av din identitet, vem du är, eller ditt beteende. Det är däremot en tydlig form av feedback på vilka mönster du har i din kommunikation."

**Om att vi inte är våra mönster:**
> "Vi är inte färger och vi är inte testresultat. Vi är människor med en mångfald av komplexa och skiftande aspekter, som inget test kan identifiera."

**Tre perspektiv (onboarding):**
- **Identitet** — vem vi upplever att vi är i stunden
- **Beteende** — allt vi gör i vardagen
- **Kommunikation** — de tolkningar vi gör av vad som händer inom oss och runt oss

**Fem viktiga perspektiv på mönster:**
1. Alla kommunikationsmönster är lika värdefulla i rätt situation.
2. Mönstren beskriver kommunikationen, inte personen.
3. Mönstren avslöjar tendenser, inte universella sanningar.
4. En person kan ha ett mönster extremt, men de flesta har en mix.
5. Var uppmärksam på kontexten — mönster kan skilja sig åt beroende på situation.

---

## AIRTABLE — USERS-TABELLEN

Fält: Name, Email, Access Type, Course Alumni, Status, Created At, Last Login At, Remaining Sessions, Is Blocked By Limit, Can Access, Sessions, Exercises, Exercise Attempts, Analyses, Profiles, Used Sessions

**Testanvändare (admin/active):**
- alexander@alexanderholmberg.se
- alexander@holmbergfriends.com
- alexander@coachholmberg.com

---

## API-ENDPOINTS

| Method | Path | Auth | Funktion |
|--------|------|------|----------|
| POST | /api/auth/login | Nej | Skicka magic link |
| POST | /api/auth/verify | Nej | Sätt session-cookie |
| POST | /api/auth/logout | Nej | Logga ut |
| GET | /api/analyses-status | Nej | Hämta remaining_analyses (guest_id som query-param) |
| POST | /api/analyse-text-standalone | Nej | Analysera text som gäst (guest_id i body) |
| POST | /api/send-analysis | Nej | Skicka analysresultat via mail |
| POST | /api/stripe/checkout | Nej | Skapa Stripe Checkout Session |
| POST | /api/stripe/webhook | Nej | Ta emot Stripe-händelser |
| GET | /api/usage | Ja | Visa sessionsanvändning |
| POST | /api/analyse-text | Ja | Analysera text (inloggad) |
| POST | /api/profile | Ja | Skapa profil |
| GET | /api/training/exercise | Ja | Hämta övning |
| POST | /api/training/answer | Ja | Svara på övning |

---

*Se STATUS.md för fullständig ändringslogg och buggar.*
