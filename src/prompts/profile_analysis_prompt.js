export function buildProfileAnalysisPrompt(answers, word_clicks, response_times_ms) {
  const system = `Du är analysmotor för Språkmönsterlabbet.
Din uppgift är att analysera svar på språkmönstersorterande frågor och returnera en strukturerad JSON-profil.

Du returnerar ENDAST giltig JSON — inget annat, inga kommentarer, ingen förklarande text.

GRUNDREGLER:
- En person HAR ett mönster, de ÄR det inte
- Basera analysen på vad som faktiskt står i svaren — inte på antaganden
- Styrka sätts baserat på hur tydliga signalerna är:
  "Tydlig" = starka, upprepade signaler
  "Trolig" = tydliga men inte överväldigande signaler
  "Möjlig" = svaga eller motstridiga signaler
  "Otillräcklig data" = för kort svar för att bedöma`;

  const avgTime = Object.values(response_times_ms || {});
  const avgMs = avgTime.length > 0 ? Math.round(avgTime.reduce((a, b) => a + b, 0) / avgTime.length) : 0;
  const avgSec = (avgMs / 1000).toFixed(1);

  const user = `Analysera följande svar på språkmönstersorterande frågor.
Kontext: Arbete

FRÅGA 1 — Motivationsriktning (Till/Ifrån):
"Vad är viktigt för dig i ditt arbete?"
Svar: ${answers.q1}

Signalord Till: mål, uppnå, få, vinna, resultat, möjligheter, framsteg, sträva
Signalord Ifrån: undvika, slippa, problem, risker, inte, förhindra, skydda

FRÅGA 2 — Beslutsram (Intern/Extern):
"Hur vet du att du har gjort ett bra jobb?"
Svar: ${answers.q2}

Signalord Intern: jag vet, jag känner, enligt mig, jag bestämmer, min känsla
Signalord Extern: feedback, andra säger, bekräftelse, mäts, resultat utifrån

FRÅGA 3 — Sinneskanal (Syn/Hörsel/Känsel):
"Hur vet du att någon annan har gjort ett bra jobb?"
Svar: ${answers.q3}

Signalord Syn: ser, tydligt, bild, perspektiv, visar, framgår, uppvisar
Signalord Hörsel: hör, säger, berättar, kommunicerar, uttrycker, resonerar
Signalord Känsel: känner, konkret, hanterbart, grepp om, solid, stabilt

FRÅGA 4 — Förståelse (Procedur/Alternativ):
"Varför valde du ditt nuvarande arbete?"
Svar: ${answers.q4}

Signalord Procedur: rätt väg, steg för steg, hur man gör, process, ordning
Signalord Alternativ: möjligheter, valt, kunde ha, flexibelt, många vägar

FRÅGA 5 — Förändringsrelation (Likhet/Skillnad):
"Vad är relationen mellan ditt nuvarande arbete och ditt förra?"
Svar: ${answers.q5}

Signalord Likhet: samma, liknande, fortsätter, bygger vidare, liknar
Signalord Skillnad: annorlunda, nytt, förändrat, skiljer sig, kontrast

ORDVAL (bekräftande data):
Respondenten valde dessa 5 ord: ${word_clicks.join(', ')}

Ordkodning:
Möjligheter → Till + Alternativ
Tydlighet → Procedur + Intern
Resultat → Till
Trygghet → Ifrån + Procedur
Frihet → Alternativ
Feedback → Extern
Struktur → Procedur
Framsteg → Till
Undvika misstag → Ifrån
Egen övertygelse → Intern
Variation → Alternativ
Bekräftelse → Extern

SVARSTIDER (indikativ data för Proaktiv/Reaktiv):
${JSON.stringify(response_times_ms)}
Genomsnittlig svarstid: ${avgSec} sekunder
Genomsnittlig svarstid under 8 sekunder = Proaktiv-signal
Genomsnittlig svarstid över 15 sekunder = Reaktiv-signal
Däremellan = Neutral

DETALJNIVÅ (meta-mönster):
Analysera svarens struktur tvärs alla fem frågor:
- Korta, övergripande svar = Helhet
- Långa, detaljerade svar med exempel = Detalj

Returnera EXAKT denna JSON-struktur:

{
  "motivationsriktning": {
    "signal": "Till" | "Ifrån",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "skala": 1-10,
    "evidens": ["citat eller observation från svaret"],
    "ordval_bekräftning": true | false
  },
  "beslutsram": {
    "signal": "Intern" | "Extern",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "skala": 1-10,
    "evidens": ["..."],
    "ordval_bekräftning": true | false
  },
  "förståelse": {
    "signal": "Procedur" | "Alternativ",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "skala": 1-10,
    "evidens": ["..."],
    "ordval_bekräftning": true | false
  },
  "sinneskanal": {
    "signal": "Syn" | "Hörsel" | "Känsel",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "evidens": ["..."]
  },
  "förändringsrelation": {
    "signal": "Likhet" | "Likhet med undantag" | "Skillnad med undantag" | "Skillnad",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "evidens": ["..."]
  },
  "detaljnivå": {
    "signal": "Helhet" | "Detalj",
    "styrka": "Tydlig" | "Trolig" | "Möjlig" | "Otillräcklig data",
    "observation": "kort beskrivning av svarsmönstret"
  },
  "handlingsstil": {
    "signal": "Proaktiv" | "Reaktiv" | "Neutral",
    "genomsnittlig_svarstid_sekunder": X,
    "indikation": "kort förklaring"
  },
  "övergripande_notering": "en mening om kombinationens dynamik"
}`;

  return { system, user };
}
