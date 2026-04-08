# Kontextmodell — Språkmonsterlabbet

## Bakgrund

Samma person kan uppvisa olika språkmönster beroende på sammanhang. En person som är proaktiv i sitt ledarskap kan vara reaktiv i en konflikt. En person med intern beslutsram i arbetet kan ha extern referens i relationer.

Systemet måste därför koppla alla analyser, profiler och övningar till ett specifikt sammanhang — annars är resultaten missvisande och ojämförbara.

---

## V1 — Fast sammanhang: Arbete

I V1 är sammanhanget låst till **arbete/ledarskap**. Det kommuniceras implicit i alla frågor och prompts men är inte valbart av användaren.

**Konsekvens:** Alla analyser, profiler och träningsförsök i V1 är jämförbara med varandra eftersom de mäter samma sammanhang.

**Kontexttagg för V1:** `work`

---

## V2 — Valbart sammanhang

I V2 väljer användaren sammanhang innan analys, profil eller träning. Resultaten lagras med kontexttagg och kan jämföras inom samma sammanhang men inte mellan olika.

**Planerade sammanhang:**

| Tagg | Beskrivning |
|---|---|
| `work` | Arbete och ledarskap (standard, används i V1) |
| `conflict` | Konflikt och svåra samtal |
| `relations` | Nära relationer |
| `change` | Förändring och osäkerhet |
| `coaching` | Coaching och coachande samtal |

Listan är inte definitiv — nya sammanhang kan läggas till utan att bryta befintlig data eftersom varje post redan är taggad.

---

## Designprincip: Tagga från start

Alla frågor, prompts och övningar märks med en kontexttagg redan i V1, även om taggen ännu inte är synlig för användaren. Det gör V2 till en konfigurationsändring snarare än en ombyggnad.

### Vad som ska taggas

**Profilfrågor** — varje fråga har ett `context`-fält:
```json
{
  "question_id": "q1",
  "context": "work",
  "metaprogram": "Motivationsriktning",
  "question": "Vad vill du uppnå med din roll som ledare?"
}
```

**Claude-prompts** — systemprompt inleds med sammanhangsdefinition:
```
Sammanhanget är: arbete och ledarskap.
Analysera svaren utifrån hur personen kommunicerar i detta sammanhang.
```

**Exercises (Airtable)** — fältet `Category` används redan och motsvarar delvis sammanhang. I V2 kompletteras det med ett dedikerat `Context`-fält (single select med samma taggar som ovan).

**Airtable-poster** — Sessions, Analyses, Profiles och Exercise Attempts bör i V2 lagra kontexttaggen. Förslag på fält att lägga till när V2 byggs:

| Tabell | Nytt fält | Typ |
|---|---|---|
| Sessions | Context | Single select |
| Analyses | Context | Single select |
| Profiles | Context | Single select |
| Exercise Attempts | Context | Single select |

I V1 sätts `Context = "work"` hårdkodat i Worker-koden, vilket gör migrering till V2 trivial.

---

## Implikationer för Worker-koden

### V1 — hårdkodat i varje handler

```js
// Sätt context hårdkodat i V1
const context = 'work';
```

Skickas med i Airtable-poster och i Claude-promptens inledning.

### V2 — läses från request-body

```js
const context = body?.context ?? 'work';
```

Frontend skickar valt sammanhang. Worker validerar mot tillåtna värden.

### Promptstruktur (V1 → V2)

V1-prompt inleds med:
```
Sammanhanget är: arbete och ledarskap.
```

V2-prompt varierar beroende på valt sammanhang — en promptmall per sammanhang, eller en mall med sammanhangsvariabel.

---

## Vad som inte förändras i V2

- Endpointstrukturen (`/api/analyse-text`, `/api/profile`, `/api/training/exercise`) är oförändrad
- Svarsformaten är oförändrade
- Sessionsgränsen (10 fria) gäller per användare totalt, inte per sammanhang
- Auth-flödet är oförändrat

---

## Sammanfattning

| | V1 | V2 |
|---|---|---|
| Sammanhang | Fast: `work` | Valbart av användare |
| Kontexttagg i data | Hårdkodad `work` | Dynamisk från request |
| Profilfrågor | Arbetsrelaterade | Sammanhangsstyrda |
| Prompts | Fast arbetskontext | Sammanhangsvariabel |
| Exercises | Category = leadership m.fl. | + Context-fält i Airtable |
| Byggkostnad V2 | — | Konfigurationsändring, inte ombyggnad |
