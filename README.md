# Priručnik koncepata

Lični priručnik za pripremu intervjua i obnavljanje osnova: mreža i protokoli, system design, konkurentnost i paralelizam, arhitektura, podaci, cloud, .NET i Angular, AI i algoritmi. Svaka tema ima živu scenu (three.js ili SVG), ključne tačke, primere koda i zamke. System design ima interaktivnu simulaciju sistema pod opterećenjem.

## Pokretanje

Potreban je Node.js 18 ili noviji.

```bash
npm install
npm run build
```

Rezultat je jedan fajl, `dist/index.html`, u kome je sve: stilovi, kod, three.js i ikone. Otvori ga direktno u pregledaču ili ga postavi na bilo koji statički hosting (GitHub Pages, Netlify, Azure Static Web Apps). Fontovi se učitavaju sa Google Fonts; bez interneta stranica radi sa sistemskim fontom.

Posle izmene u `src/` ponovo pokreni `npm run build` i osveži stranicu.

## Struktura

| Putanja | Šta je |
|---|---|
| `src/index.html` | Kostur stranice: meni i gornja traka. Build ubacuje CSS, kod i ikone. |
| `src/style.css` | Svi stilovi, svetla i tamna tema (`data-theme` na `<html>`). |
| `src/app.js` | Rutiranje (`#id-teme`), meni, roadmap na početnoj, stranice tema i stranica System design. |
| `src/viz.js` | Mali engine za scene: renderer, kamera i labele (Stage), simulirani sat (`wait`, `tween`, `move`, `spawn`) i primitivi (`box`, `db`, `orb`, `plate`...). |
| `src/sysviz.js` | Simulacija sistema na vrhu oblasti System design: red čekanja, CPU i memorija po instanci, skaliranje, rate limiter, keš. |
| `src/tabs.js` | Oblasti i njihove sekcije: redosled u meniju i na roadmapi. |
| `src/domains.js` | Domeni za oblasti koje se pune automatski. |
| `src/topics/*.js` | Teme: tekst, tačke, tabele, kod i scena. |
| `src/legend.js` | Scena "Kako čitati scene" na početnoj. |
| `build.mjs` | esbuild bundle, ikone iz lucide-static i spajanje u jedan HTML fajl. |
| `tools/check_routes.py` | Provera svih stranica u pregledaču bez prozora (Playwright). |

## Dodavanje teme

1. U odgovarajući fajl u `src/topics/` dodaj objekat sa poljima `id`, `d` (domen), `sym` (dva slova), `title`, `desc`, `points`, a po želji `code`, `table`, `pitfalls`, `viz` i `rel` (veze ka drugim temama).
2. Dodaj `id` teme u sekciju u `src/tabs.js`, ili koristi oblast koja se puni iz domena.
3. Pokreni `npm run build`.

## Provera

```bash
pip install playwright
python -m playwright install chromium
python tools/check_routes.py /tmp/provera 1366 900
```

Skripta obiđe sve stranice sa početne i za svaku prijavi greške u konzoli i da li se stranica širi u stranu.
