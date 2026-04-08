# SML-MARS — Sessionslogg mars 2026

## Vad som byggts och beslutats

### Leads-tabell
- Ny dedikerad Leads-tabell i separat Airtable-bas (appQlXrHjAnwDuC5e / tblSIQ6Z78Jpo366s)
- Fält: Email, Name, Source, Status, Created At, Notes
- LEADS_BASE_ID satt som Cloudflare secret
- saveToLeadsTable() tillagd i airtable.js
- Leads sparas vid presentköp (source: gift)
- Respondenter sparas INTE i Leads — de går till Users-tabellen (Access Type: respondent)

### Dokumentation
- STARTSCRIPT_sprakmonsterlabbet.md uppdaterad med korrekt nuläge (v2, Pages, live Stripe, ny mappsökväg)
- STATUS.md uppdaterad med fullständig ändringslogg från 22–23 mars

### Portal & adminläge
- Kartlagt portal.holmbergfriends.com (Cloudflare Pages + Clerk auth)
- Adminläget finns på portal.holmbergfriends.com/admin.html
- Åtkomst: @holmbergfriends.com eller alexander@alexanderholmberg.se
- Befintlig alumni-funktion i functions/api/alumni.js med skicka-mail-action

### Pågående / nästa steg
- Uppdatera alumni-mailet med erbjudande om Språkmönsterlabbet
  Avsändare: alexander@holmbergfriends.com
  Länk: https://sprakmonsterlabbet.holmbergfriends.com/profil.html
  Ton: Alexanders egen röst — personlig, direkt, ej generisk
- Bygga utskicksfunktion i adminläget: välj 10 mottagare, skicka, följ upp
- Verifiera live-webhook med riktigt testköp
- Generera alumni-koder i Codes-tabellen

## Tekniskt nuläge (2026-03-24)

| Komponent | Status |
|---|---|
| Worker (backend) | Live — sprakmonsterlabbet.alexander-894.workers.dev |
| Pages (frontend) | Live — sprakmonsterlabbet.holmbergfriends.com |
| Stripe | Live-nycklar aktiva |
| Leads-tabell | Aktiv, tar emot gift-leads |
| Alumni-mail | Ej uppdaterat med SML-erbjudande |
| Admin-utskick | Ej byggt |
