# Språkmönsterlabbet — Produktspecifikation v2
*Skapad: 2026-03-22*

---

## 1. Övergripande produktstruktur

### Vad som försvinner
- Träningsmodulen tas bort från den kommersiella produkten
- Träningen lever vidare i **Utvecklingsverkstaden** — en separat portal för alumni av Coachande Ledarskap

### Ny produktlogik
Profilen är ingångspunkten. Textanalysen låses upp efter genomförd profil.

| Nivå | Innehåll | Pris |
|---|---|---|
| Gratis | Procedur/Alternativ-resultat (gratisnivå efter profil) | 0 kr |
| Individuell rapport | Alla 3 mönsterpar + sinneskanal, ~20 sidor, dynamiskt genererad av Claude | Betalt |
| Grupprapport | Aggregerad teamanalys — likheter, skillnader, kommunikationsdynamik | Betalt (högre) |

### Coach-licens
Coacher köper rapportpaket: 10 / 20 / 50 stycken (ev. löpande abonnemang).
Ger tillgång till gruppvyn för sina klienter.

---

## 2. Formuläret — Språkmönsterprofilen

### Princip
En sammansatt upplevelse där respondenten inte förstår vad som mäts.
De svarar, väljer, reagerar — mönstren framträder ur helheten.

### Formulärets flöde

| # | Typ | Innehåll | Mäter |
|---|---|---|---|
| 1 | Välkomstskärm | Kort förklaring av vad som händer (skapar tillit) | — |
| 2 | Öppen text | "Vad är viktigt för dig i ditt arbete?" | Till / Ifrån |
| 3 | Öppen text | "Hur vet du att du har gjort ett bra jobb?" | Intern / Extern |
| 4 | Öppen text | "Hur vet du att någon annan har gjort ett bra jobb?" | Syn / Hörsel / Känsel |
| 5 | Öppen text | "Varför valde du ditt nuvarande arbete?" | Procedur / Alternativ |
| 6 | Öppen text | "Vad är relationen mellan ditt nuvarande arbete och ditt förra?" | Likhet / Skillnad |
| 7 | Ordklick (välj 5 av 12) | Kodade neutrala ord | Till/Ifrån + Intern/Extern (bekräftelse) |
| 8 | Osynlig mätning | Svarstid på frågorna 2–6 | Proaktiv / Reaktiv |
| 9 | Svarens struktur tvärs alla frågor | Analyseras av Claude automatiskt | Helhet / Detalj |
| 10 | Tacksida | "Din profil genereras..." | — |

**Uppskattad tid: 5–6 minuter**

### Ordlista — ordklick-momentet
**Instruktion:** *"Välj de 5 ord som känns mest relevanta för dig i ditt arbete just nu."*

| Ord | Kodat mot |
|---|---|
| Möjligheter | Till / Alternativ |
| Tydlighet | Procedur / Intern |
| Resultat | Till |
| Trygghet | Ifrån / Procedur |
| Frihet | Alternativ |
| Feedback | Extern |
| Struktur | Procedur |
| Framsteg | Till |
| Undvika misstag | Ifrån |
| Egen övertygelse | Intern |
| Variation | Alternativ |
| Bekräftelse | Extern |

### Analysprincip
- **Textsvaren** = primär data (Claude gör djupanalysen här)
- **Ordvalen** = bekräftande data (stärker eller nyanserar texten)
- **Svarstiden** = indikativ data (signal, inte bevis)
- **Svarens struktur** = meta-mönster som Claude identifierar tvärs alla svar (Helhet/Detalj)

---

## 3. Mönster som mäts

### Spindeldiagram — 6 axlar (3 mönsterpar)

| Mönsterpar | Axel 1 | Axel 2 |
|---|---|---|
| Motivationsriktning | Till | Ifrån |
| Beslutsram | Intern | Extern |
| Förståelse | Procedur | Alternativ |

### Övriga mönster — visas separat i rapporten

| Mönster | Poler | Identifieras via |
|---|---|---|
| Sinneskanal | Syn / Hörsel / Känsel | Sorteringsfråga |
| Förändringsrelation | Likhet / Skillnad | Sorteringsfråga |
| Handlingsstil | Proaktiv / Reaktiv | Svarstid |
| Detaljnivå | Helhet / Detalj | Svarens struktur tvärs alla frågor |

---

## 4. Rapporten — individuell

### Generering
Claude genererar hela rapporten dynamiskt baserat på respondentens mönsterkombination.
Texten anpassas efter *kombinationen* — en Auditiv-Procedur-Intern-rapport ska ha en specifik röst och vinkel genom hela rapporten, inte bara separata avsnitt per mönster.

### Struktur

1. **Omslag** — namn, datum, kontext
2. **Introduktion** — vad mönster är, vad de inte är (filosofin: *har* ett mönster, *är* det inte)
3. **Sammanfattning** — spindeldiagram + sinneskanal + kort kommentar
4. **Kapitel: Motivationsriktning** — pedagogik + ditt resultat + praktiska implikationer
5. **Kapitel: Beslutsram** — pedagogik + ditt resultat + praktiska implikationer
6. **Kapitel: Förståelse** — pedagogik + ditt resultat + praktiska implikationer
7. **Kapitel: Sinneskanal** — pedagogik + ditt resultat + praktiska implikationer
8. **Avslut** — hur du använder rapporten vidare, nästa steg

### Per kapitel innehåller (inspirerat av Mercurious-strukturen)
- Vad mönstret innebär generellt
- Var du landar på skalan
- Vad det betyder i praktiken för dig
- Hur du uppfattas av andra med samma / motsatt mönster
- Vad som händer under stress
- Hur du kan utveckla din kommunikation
- Konkreta fraser du kan använda

---

## 5. Rapporten — grupp

Samma individdata aggregeras.

**Grupprapporten visar:**
- Teamets samlade mönsterprofil (spindeldiagram för hela gruppen)
- Var teamet är homogent vs. heterogent
- Kommunikationsdynamik: vilka mönsterkombinationer som finns
- Potentiella friktionspunkter
- Styrkor i teamets sammansättning

**Användningsfall:** Coach presenterar rapporten i en teamutvecklingsinsats.
"4 personer från samma företag — vad säger profilen om hur ni kommunicerar?"

---

## 6. Tekniska överväganden

### Datainsamling
- Textsvaren skickas till Claude API med en promptlogik specifik för sorteringsfrågor
- Sorteringsfrågor kräver **annan promptlogik** än fri textanalys — Claude letar efter svarsstruktur, inte nyckelord
- Bildklikken sparas som numeriska val (1/2/3) i Airtable
- Svarstid mäts i JavaScript (ms från fråga visas till svar skickas)

### Rapportgenerering
- Claude genererar rapporten som strukturerad text
- Rapporten levereras som PDF (nedladdningsbar) och/eller visas i webbläsare
- Sammanhang (V1: Arbete fast, V2: valbart) taggas på all data från start

### Befintlig stack
- Backend: Cloudflare Workers
- Frontend: Squarespace / ny standalone-sida
- Databas: Airtable
- AI: Anthropic Claude API
- Betalning: Stripe

---

## 7. Designsystem — grafisk standard

### Färger
- **Lila** (#534AB7 / ramp c-purple) — spindeldiagram + primära mönsterpar (Till/Ifrån, Intern/Extern, Procedur/Alternativ)
- **Grön** (#1D9E75 / ramp c-teal) — bekräftande/troliga resultat
- **Grå** (c-gray) — neutrala indikatorer (Handlingsstil, Detaljnivå)

### Komponenter

**Spindeldiagram**
- 6 axlar: Till, Intern, Alternativ, Ifrån, Extern, Procedur
- Skala 1–10 per axel
- Fyllt område: lila, fill-opacity 0.18, stroke 1.5px
- Datapunkter: lila fyllda cirklar r=4
- Ringar: 3 st, 0.5px border-tertiary
- Badgar under: visar dominerande pol + skalvärde

**Skalor per mönsterpar**
- Horisontell track, 6px hög, border-radius 3px
- Tumme: 16px cirkel, vit kant, färgad ring
- Lila gradient för Till/Intern-hållet, grön för Alternativ-hållet
- Styrkebadge till höger om rubriken

**Sinneskanal**
- 3 chips (Syn / Hörsel / Känsel) i rad
- Aktiv: lila bakgrund (#EEEDFE), lila text (#3C3489), lila ikon
- Inaktiv: border-tertiary, grå ikon

**Förändringsrelation**
- 4 segment i rad (Likhet / Likhet m. undantag / Skillnad m. undantag / Skillnad)
- Aktiva segment: lila (#534AB7)
- Inaktiva: border-tertiary

**Handlingsstil & Detaljnivå**
- Kompakt chip med färgad punkt + etikett
- Grön punkt = Reaktiv, Lila punkt = Helhet/Proaktiv
- Meta-notering i 11px grå text

**Styrkebadgar**
- Tydlig: #EEEDFE bakgrund, #3C3489 text
- Trolig: #E1F5EE bakgrund, #085041 text
- Möjlig: #F1EFE8 bakgrund, #444441 text
- Otillräcklig data: background-secondary, text-tertiary

### Princip
Inget är dekorativt — varje visuellt element har en fast semantisk funktion.

---

## 8. Parkerade idéer (för senare)

- **Parrapport** — båda i ett par gör var sin profil → betald rapport visar kombinationen och vad det betyder för er kommunikation
- **Kontextval (V2)** — respondenten väljer sammanhang (arbete / privat / ledarskap) innan formuläret
- **PWA** — mobilanpassad webbapp som kan läggas till på hemskärmen

---

## 8. Rapportprompt — låst

Se separat fil: `Sprakmonsterlabbet_Rapportprompt.md`

Prompten täcker:
- 12 avsnitt, ~20 sidor
- Alla 7 mönster
- Kombinationsdynamik i avsnitt 11
- Visualiseringsinstruktioner för systemet
- Förbjudna formuleringar
- Tonalitetskrav

---

## 9. Nästa steg

1. Börja bygga formuläret i Claude Code
2. Bygga analyslogiken (sorteringsfrågeprompt → JSON-profil)
3. Koppla ihop JSON-profil med rapportprompt
4. Bygga PDF-rendering av rapporten
5. Stripe-integration för betalda rapporter
