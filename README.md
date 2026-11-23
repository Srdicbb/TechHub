# Priručnik koncepata

Lični knowledge base u dva odvojena sveta, sa prekidačem **Software | Hardware** na vrhu menija:

- **Software:** network, system design, konkurentnost i paralelizam, arhitektura, podaci, cloud, .NET i Angular, AI, algoritmi i security. System design ima interaktivnu simulaciju sistema pod opterećenjem.
- **Hardware:** struja i razvodni ormani (Electrical), elektronika i IoT, smart home, video nadzor (CCTV) i sopstveni projekti.

Svaka gotova tema ima živu scenu (three.js ili SVG), ključne tačke, primere koda i zamke. Tema u pripremi ima naslov, kratak opis i plan sadržaja. Svaki svet ima svoju početnu stranu sa roadmapom, svoje oblasti u meniju, svoj tab u Skillsetu i svoju boju (Hardware je tirkizni). Pretraga ide kroz oba sveta.

Stranica je na srpskom (latinica) i engleskom: dugme **EN** / **SR** u gornjem desnom uglu menja jezik celog sajta. Pored njega su Skillset chart (radar sa osom po oblasti) i promena svetle i tamne teme.

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
| `src/style.css` | Svi stilovi, svetla i tamna tema (`data-tema` na `<html>`, izbor sa dugmeta u gornjem desnom uglu; bez izbora važi `data-theme` okruženja ili tema sistema). |
| `src/app.js` | Rutiranje, prekidač svetova, meni, roadmap na početnoj (oblasti sa temama koje se otvaraju u krug), Skillset prozor, stranice tema, tema u pripremi i stranica System design. Adrese: `#id-teme` za Software, `#hw` i `#hw/id-teme` za Hardware. |
| `src/i18n.js` | Izabrani jezik (`lang`), `T('srpski', 'English')`, formatiranje brojeva (`dec`, `dec1`, `grp`) i promena jezika. |
| `src/skills.js` | Skillset chart: nivoi i crtanje radara. `levelOf(oblast)` vraća nivo 0–5; za sada je uvek 0. |
| `src/viz.js` | Mali engine za scene: renderer, kamera i labele (Stage), simulirani sat (`wait`, `tween`, `move`, `spawn`) i primitivi (`box`, `db`, `orb`, `plate`...). |
| `src/sysviz.js` | Simulacija sistema na vrhu oblasti System design: red čekanja, CPU i memorija po instanci, skaliranje, rate limiter, keš. |
| `src/tabs.js` | Svetovi (`WORLDS`) i oblasti sa sekcijama: redosled u meniju i na roadmapi. Oblast Hardware sveta ima `world: 'hw'`; `skill: false` je izostavlja iz Skillseta. |
| `src/domains.js` | Domeni za oblasti koje se pune automatski. |
| `src/topics/*.js` | Teme: tekst, tačke, tabele, kod i scena. `hardware.js` ima teme Hardware sveta koje su još u pripremi; puna tema sa istim `id` (npr. iz `smarthome.js`) zamenjuje plan. |
| `src/legend.js` | Scena "Kako čitati scene" na početnoj. |
| `build.mjs` | esbuild bundle, prevod, ikone iz lucide-static i spajanje u jedan HTML fajl. |
| `i18n/en/*.txt` | Engleski prevodi. |
| `tools/i18n.mjs` | Prevod u buildu i alat za prevodioca (`extract`, `check`, `id`). |
| `tools/check_routes.py` | Provera svih stranica u pregledaču bez prozora (Playwright). |

## Dodavanje teme

1. U odgovarajući fajl u `src/topics/` dodaj objekat sa poljima `id`, `d` (domen), `sym` (dva slova), `title`, `desc`, `points`, a po želji `code`, `table`, `pitfalls`, `viz` i `rel` (veze ka drugim temama, i iz drugog sveta; pločica tada nosi oznaku tog sveta).
2. Dodaj `id` teme u sekciju u `src/tabs.js`, ili koristi oblast koja se puni iz domena.
3. Pokreni `npm run build`.

Tema u pripremi ima `soon: true`, `title`, `sym`, `desc` i `plan` (šta će biti obrađeno). Kad tema bude gotova, napiši punu temu sa istim `id`: ona zamenjuje plan, pa plan možeš da obrišeš iz `hardware.js`.

## Prevod na engleski

Srpski tekst u `src/` je izvor. Pri buildu `tools/i18n.mjs` pronađe niske i šablone sa tekstom i, ako za njih postoji prevod, zameni ih sa `__L('srpski', 'English')`, odnosno `__LT('srpski {0}', 'English {0}', izraz)`. U primerima koda prevode se komentari i srpske niske, a imena u kodu ostaju ista.

Prevodi su u `i18n/en/*.txt`. Svaki počinje redom `@id`, a ispod je engleski tekst (može u više redova). `id` je prvih 10 heks znakova SHA-1 srpskog teksta:

```text
@0007a2fadf
Idempotency-Key is required
```

```bash
npm run i18n:extract                 # niske bez prevoda, sa id-jem, u build/i18n/*.todo.txt
npm run i18n:check                   # prevedene niske koje se koriste i kao ključ ili za poređenje
node tools/i18n.mjs id "Neki tekst"  # id za tekst
```

Kad se srpski tekst promeni, menja se i njegov id, pa se niska ponovo javlja u `extract`. Prevedena niska ne sme biti ključ objekta niti se porediti sa podacima koji se ne prevode; to javlja `check`. Brojeve formatiraj sa `dec`, `dec1` i `grp` iz `src/i18n.js` (u engleskom tačka za decimale i zarez za hiljade). Izabrani jezik se čuva u `localStorage` (`prirucnik.jezik`), a promena jezika ponovo učitava stranicu.

## Provera

```bash
pip install playwright
python -m playwright install chromium
python tools/check_routes.py /tmp/provera 1366 900
```

Skripta obiđe sve stranice sa početne i za svaku prijavi greške u konzoli, labele van scene i da li se stranica širi u stranu. Sa `PRIRUCNIK_LANG=en` proverava engleski i javlja reči sa srpskim slovima koje su ostale u tekstu van primera koda.
