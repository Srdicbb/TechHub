"""Provera svih stranica u pregledaču bez prozora: greške u konzoli, širenje stranice u stranu i labele van scene.
Zahteva: pip install playwright && python -m playwright install chromium
Upotreba: python tools/check_routes.py <izlazni-folder> <širina> <visina> [ruta ...]   (bez ruta = sve rute sa početne)
Sa PRIRUCNIK_LANG=en proverava engleski prevod i javlja srpska slova koja su ostala u tekstu (van primera koda)."""
import os, sys, json, asyncio, pathlib
from playwright.async_api import async_playwright

HTML = (pathlib.Path(__file__).resolve().parent.parent / 'dist' / 'index.html').as_uri()

async def main():
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    W, H = int(sys.argv[2]), int(sys.argv[3])
    routes = sys.argv[4:]
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        pg = await b.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
        errs = []
        pg.on('console', lambda m: errs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: errs.append(f'[pageerror] {e}'))
        await pg.route('**/fonts.googleapis.com/**', lambda r: r.abort())
        await pg.route('**/fonts.gstatic.com/**', lambda r: r.abort())
        EN = os.environ.get('PRIRUCNIK_LANG') == 'en'
        if EN: await pg.add_init_script("localStorage.setItem('prirucnik.jezik', 'en')")
        await pg.goto(HTML)
        await pg.wait_for_timeout(800)
        if not routes:
            # oba sveta: Software sa početne (#) i Hardware sa svoje početne (#hw)
            grab = "[...document.querySelectorAll('.orb-core, .orb-t:not(.orb-all)')].map(a => a.getAttribute('href').slice(1))"
            routes = [''] + await pg.evaluate(grab)
            await pg.evaluate("location.hash = 'hw'")
            await pg.wait_for_timeout(500)
            routes += ['hw'] + await pg.evaluate(grab)
        report = {}
        for r in routes:
            errs.clear()
            await pg.evaluate(f"location.hash = '{r}'")
            await pg.wait_for_timeout(300)
            await pg.evaluate("document.querySelector('.viz')?.scrollIntoView({block: 'center'})")
            await pg.wait_for_timeout(2300)
            name = (r or 'home').replace('/', '_')
            await pg.screenshot(path=str(out / f'{name}.png'))
            # labele se mere prema celoj površini scene (.stage-view); na uskom ekranu ona je šira od kartice i skroluje se vodoravno
            info = await pg.evaluate("""() => { const v = document.querySelector('.stage-view') || document.querySelector('.viz-stage');
              const labs = [...document.querySelectorAll('.stage-labels .lbl')].filter(e => e.style.display !== 'none');
              const r = v ? v.getBoundingClientRect() : null; let off = 0;
              for (const l of labs) { const b = l.getBoundingClientRect(); if (r && (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1)) off++; }
              const view = document.querySelector('#view').cloneNode(true); view.querySelectorAll('pre, script').forEach(e => e.remove());
              const txt = view.textContent + ' ' + labs.map(l => l.textContent).join(' ') + ' ' + (document.querySelector('.viz-say')?.textContent || '');
              // srpska slova, ili česte srpske reči bez njih (je, ili, kada...) koje u engleskom tekstu ne bi trebalo da postoje
              const sr = [...new Set([...(txt.match(/[^\\s]*[čćšžđČĆŠŽĐ][^\\s]*/g) || []), ...(txt.match(/\\b(je|su|se|na|za|da|od|ili|kao|ako|koji|koja|koje|kada|kad|nije|samo|sve|ima|nema|bez|sa|ali|jos|tek|niti|jer|dok|posle|zbog|kroz|iz|uvek|tema|teme|primer|oblast)\\b/g) || [])])].slice(0, 6);
              return { labels: labs.length, offstage: off, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, say: document.querySelector('.viz-say')?.textContent?.slice(0, 80), sr }; }""")
            if not EN: info.pop('sr')   # srpska slova su greška samo u engleskom prevodu
            report[name] = {'errors': list(errs), **info}
        print(json.dumps(report, ensure_ascii=False, indent=1))
        await b.close()

asyncio.run(main())
