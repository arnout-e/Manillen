# Manillen Coach

Speel manillen tegen de computer, met een coach die bij elke kaart uitlegt welke je best legt en waarom. Bedoeld om beter te leren manillen: je ziet de redenering, niet alleen het antwoord.

## Wat de tool doet

- **Volledig spel**: 32 kaarten, twee ploegen, 8 slagen per deal, de deler kiest troef of sans, score tot 101. De strenge tafelregels zitten erin: volgen, hoger leggen, troeven en overtroeven als het moet.
- **Advies met uitleg**: bij elke beurt zie je de aangeraden kaart, de reden in gewone taal ("je maat wint zeker: vetten", "hoogste troef die nog meedoet", "geef geen punten weg") en een tabel met alle toegelaten kaarten.
- **Simulaties**: de coach deelt de onbekende kaarten honderden keren opnieuw uit, speelt elke kandidaat uit en toont de verwachte punten. Zo vang je situaties op waar een vuistregel te kort schiet.
- **Drie leerstanden**: advies vooraf, advies na je eigen keuze (met vergelijking), of geen advies. De coach telt hoe vaak je zijn keuze maakt.
- **Kaartenteller**: welke kaarten zijn gespeeld, welke kaart is nog de hoogste van elke kleur, hoeveel troeven zitten er nog bij de anderen, en wie toonde dat hij een kleur kwijt is.
- **Eerlijke tegenstanders**: de computerspelers gebruiken dezelfde vuistregels en zien enkel hun eigen kaarten en wat er op tafel gebeurde.

## Starten

Geen installatie nodig, enkel Node.js voor de kleine server:

```bash
npm start
```

Open dan <http://localhost:8080>. Of bouw één losstaand bestand dat je overal kan openen:

```bash
node build.mjs   # maakt dist/index.html
```

## Tests

```bash
npm test
```

De tests dekken de slagregels (volgen, hoger leggen, troeven, overtroeven, sans), de telling, en het advies (altijd een toegelaten kaart, vetten, niet weggeven, goedkoop winnen, troefkeuze).

## Opbouw

| Bestand | Inhoud |
| --- | --- |
| `js/engine.js` | kaarten, delen, toegelaten zetten, slagwinnaar, telling, openbare informatie |
| `js/advisor.js` | vuistregels met uitleg, simulaties van verborgen handen, troefadvies |
| `js/app.js` | interface: tafel, hand, adviespaneel, instellingen |
| `css/style.css` | opmaak, licht en donker thema |
| `test/` | regel- en adviestests (`node --test`) |
| `build.mjs` | bundelt alles tot één HTML-bestand in `dist/` |

## Gespeelde variant

Manille (10) hoogste, dan aas, koning, dame, boer, 9, 8, 7. Punten 5-4-3-2-1, 60 in totaal. De deler kiest troef na het bekijken van zijn kaarten; sans telt dubbel. Je moet volgen, hoger leggen als je kan, troeven als je niet kan volgen en de tegenpartij voorligt, en overtroeven als dat kan. Ligt je maat voor, dan ben je vrij. Ondertroeven is niet verplicht. Er bestaan lokale varianten (laatste kaart op tafel, mannen en dubbelen, andere troefkiezer); die zitten er nog niet in.

## Ideeën voor later

- Mannen en dubbelen (contra en re).
- Laatste kaart op tafel als troefaanduiding.
- Sterkere computerspelers via simulaties voor elke speler.
- Oefenreeksen rond één thema: vetten, troef trekken, tellen.
