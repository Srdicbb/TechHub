"""Provera svih stranica u pregledaču bez prozora: greške u konzoli, širenje stranice u stranu i labele van scene.
Zahteva: pip install playwright && python -m playwright install chromium
Upotreba: python tools/check_routes.py <izlazni-folder> <širina> <visina> [ruta ...]   (bez ruta = sve rute sa početne)"""
import sys, json, asyncio, pathlib
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
        await pg.goto(HTML)
        await pg.wait_for_timeout(800)
        if not routes:
            routes = [''] + await pg.evaluate("[...document.querySelectorAll('.rm-node, .rm-t')].map(a => a.getAttribute('href').slice(1))")
        report = {}
        for r in routes:
            errs.clear()
            await pg.evaluate(f"location.hash = '{r}'")
            await pg.wait_for_timeout(300)
            await pg.evaluate("document.querySelector('.viz')?.scrollIntoView({block: 'center'})")
            await pg.wait_for_timeout(2300)
            name = r or 'home'
            await pg.screenshot(path=str(out / f'{name}.png'))
            info = await pg.evaluate("""() => { const v = document.querySelector('.viz-stage');
              const labs = [...document.querySelectorAll('.stage-labels .lbl')].filter(e => e.style.display !== 'none');
              const r = v ? v.getBoundingClientRect() : null; let off = 0;
              for (const l of labs) { const b = l.getBoundingClientRect(); if (r && (b.left < r.left - 1 || b.right > r.right + 1 || b.top < r.top - 1 || b.bottom > r.bottom + 1)) off++; }
              return { labels: labs.length, offstage: off, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, say: document.querySelector('.viz-say')?.textContent?.slice(0, 80) }; }""")
            report[name] = {'errors': list(errs), **info}
        print(json.dumps(report, ensure_ascii=False, indent=1))
        await b.close()

asyncio.run(main())
