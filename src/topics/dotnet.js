// .NET runtime
const cs = (t, src) => ({ t, lang: 'csharp', src });
const sh = (t, src) => ({ t, lang: 'bash', src });

export default [
  // ------------------------------------------------------------------ Memorija i GC
  {
    id: 'memory-gc', d: 'dotnet', sym: 'Gc', title: 'Stack, heap i GC',
    tags: ['garbage collector', 'gc', 'stack', 'heap', 'generacije', 'gen0', 'gen1', 'gen2', 'loh', 'boxing', 'value type', 'reference type', 'memorija', 'curenje'],
    desc: 'Lokalne promenljive i reference žive na **steku** i nestaju kad se metoda završi. Objekti žive na **heap-u**, a garbage collector uklanja one do kojih se više ne može doći i deli heap na generacije, jer većina objekata umire mlada.',
    points: [
      'Value tipovi (`int`, `struct`) kao lokalne promenljive žive na steku; reference tipovi (`class`) su uvek na heap-u, a na steku je samo referenca.',
      'GC kreće od korena (stek, statička polja, registri), označi sve dostupne objekte, a ostale oslobodi.',
      'Gen0 se skuplja često i brzo. Ko preživi ide u Gen1, pa u Gen2, gde se skuplja retko.',
      'Objekti od 85 000 bajtova naviše idu na **Large Object Heap** (LOH), koji se skuplja sa Gen2 i podrazumevano se ne sabija.',
      'Boxing: kad value tip ode u `object`, pravi se kopija na heap-u. U petlji to je nepotrebno smeće.',
    ],
    code: [
      cs('C# · Stek, heap i boxing', `
void Handle()
{
    int count = 42;                          // stek
    var order = new Order();                 // objekat na heap-u, referenca na steku
    object boxed = count;                    // boxing: nova kopija na heap-u
    Span<byte> buf = stackalloc byte[256];   // privremeni bafer na steku, bez GC-a
}   // stek se oslobađa; Order čeka GC ako niko drugi ne pokazuje na njega`),
      cs('C# · Manje alokacija', `
byte[] buffer = ArrayPool<byte>.Shared.Rent(64 * 1024);   // pozajmi umesto new
try { await stream.ReadAsync(buffer, ct); }
finally { ArrayPool<byte>.Shared.Return(buffer); }

var sb = new StringBuilder();     // umesto s += ... u petlji`),
      sh('Shell · šta GC radi u produkciji', `
dotnet-counters monitor -n MyApi --counters System.Runtime
# gen-0-gc-count, gen-2-gc-count, loh-size, time-in-gc
dotnet-gcdump collect -n MyApi    # snimak heap-a za traženje curenja`),
    ],
    pitfalls: [
      'Statička kolekcija ili event od kog se niko ne odjavi drži objekte zauvek: curenje memorije postoji i u jeziku sa GC-om.',
      'Česti nizovi veći od 85 KB (veliki JSON, slike) pune LOH i fragmentišu memoriju. Koristi `ArrayPool` ili stream.',
      '`GC.Collect()` u produkcionom kodu skoro uvek škodi: GC bolje zna kada.',
    ],
    rel: ['di-lifetimes', 'latency', 'threads'],
    viz: {
      build(x) {
        const { C, V } = x;
        const s0 = x.stat('g0', 'Gen0 GC', 0, { color: C.sky });
        const s1 = x.stat('g1', 'Gen1 GC', 0, { color: C.wait });
        const sA = x.stat('a', 'Alocirano', 0);
        x.legend([[C.ok, 'dostupan'], [C.err, 'nedostupan']]);
        x.plate({ at: [-8.6, 0, 0], w: 4.2, d: 7.2, label: 'Stek', lpos: 'front' });
        const G = [['Gen0', -2.6, C.sky], ['Gen1', 2.3, C.wait], ['Gen2', 7.2, C.ok]].map(([n, gx, col]) => ({ n, gx, col, plate: x.plate({ at: [gx, 0, 0], w: 4.6, d: 7.2, color: col, label: n }), objs: [] }));
        const loh = { n: 'LOH', gx: 11.6, objs: [], plate: x.plate({ at: [11.6, 0, 0], w: 3.4, d: 7.2, color: C.mag, label: 'LOH' }) };
        const statik = x.box({ at: [-8.6, 0, 2.6], size: [3.2, .5, 1.1], color: C.dim, label: 'static cache', side: 'in' });
        const slot = (g, i) => V(g.gx - 1.5 + (i % 4) * 1, .25, -2.6 + Math.floor(i / 4) * 1);
        const frames = [];
        const push = name => {
          const f = x.box({ at: [-8.6, frames.length * .62, -2.2 + frames.length * .02], size: [3.2, .58, 1.4], color: C.box, label: name, side: 'in' });
          f.refs = new Set();
          frames.push(f);
          x.pop(f.o);
          return f;
        };
        const lines = new Set();
        const link = (from, obj) => {
          const l = x.line([from.port('right'), obj.m.position], C.sky, { opacity: .5, nofit: true });
          l.userData.from = from; l.userData.obj = obj;
          lines.add(l); obj.lines.add(l);
          return l;
        };
        x.tick(() => {
          for (const l of lines) {
            const p = l.geometry.attributes.position;
            const a = l.userData.from.port('right'), b = l.userData.obj.m.position;
            p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z); p.needsUpdate = true;
          }
        });
        const unlinkFrom = f => { for (const l of [...lines]) if (l.userData.from === f) { lines.delete(l); l.userData.obj.lines.delete(l); x.remove(l); } };
        const layout = g => g.objs.forEach((o, i) => { o.t = g === loh ? V(g.gx, .45, -2 + i * 1.6) : slot(g, i); });
        x.tick(dt => { for (const g of [...G, loh]) for (const o of g.objs) if (o.t) o.m.position.lerp(o.t, Math.min(1, dt * 6)); });
        const alloc = (from, big) => {
          const g = big ? loh : G[0];
          const m = x.chip(C.white, { s: big ? .9 : .5 });
          m.position.copy(from.port('right'));
          const o = { m, roots: new Set([from]), lines: new Set() };
          from.refs.add(o);
          g.objs.push(o); layout(g); link(from, o);
          sA.add();
          return o;
        };
        const reachable = o => [...o.roots].some(r => r === statik || frames.includes(r));
        const collect = async (gi, label) => {
          const g = G[gi], next = G[gi + 1];
          x.say(`**${label}**: GC kreće od korena (stek, statička polja) i označava dostupne objekte.`);
          for (const o of g.objs) { const ok = reachable(o); o.m.material.emissive.set(ok ? C.ok : C.err); o.m.material.emissiveIntensity = .8; }
          await x.wait(1);
          const dead = g.objs.filter(o => !reachable(o)), live = g.objs.filter(reachable);
          for (const o of dead) { for (const l of o.lines) { lines.delete(l); x.remove(l); } x.fadeOut(o.m, .3); }
          g.objs = [];
          for (const o of live) { o.m.material.emissiveIntensity = .15; o.m.material.emissive.set(C.white); }
          if (next) { next.objs.push(...live); layout(next); } else { g.objs = live; layout(g); }
          x.say(`Nedostupni objekti (${dead.length}) su oslobođeni, a ${live.length} preživelih ${next ? `prelazi u **${next.n}**` : 'ostaje u Gen2'}.`);
          await x.wait(1.2);
        };
        const main = push('Main');
        let n0 = 0;
        x.spawn(async () => {
          while (x.alive) {
            const h = push('HandleRequest');
            x.say('Nova metoda dobija okvir na steku. Objekti koje pravi idu u **Gen0**, a okvir drži reference na njih.');
            for (let i = 0; i < 3; i++) { alloc(h); await x.wait(.35); }
            if (x.rnd() < .5) { const o = alloc(h); o.roots.add(statik); link(statik, o); }
            const p = push('ParseOrder');
            for (let i = 0; i < 2; i++) { alloc(p); await x.wait(.35); }
            if (x.rnd() < .25) { alloc(p, true); x.say('Niz veći od 85 KB ide pravo na **Large Object Heap**.'); }
            await x.wait(.6);
            for (const f of [p, h]) {
              unlinkFrom(f);
              frames.splice(frames.indexOf(f), 1);
              x.fadeOut(f, .25);
              await x.wait(.5);
            }
            x.say('Metode su završile: okviri su skinuti sa steka, pa njihovi objekti više **nemaju korena**.');
            if (G[0].objs.length >= 10) {
              await collect(0, 'Gen0 GC'); s0.add(); n0++;
              if (n0 % 3 === 0) {
                await collect(1, 'Gen1 GC'); s1.add();
                const deadL = loh.objs.filter(o => !reachable(o));
                for (const o of deadL) x.fadeOut(o.m, .3);
                loh.objs = loh.objs.filter(reachable); layout(loh);
              }
            }
            await x.wait(.5);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ DI lifetimes
  {
    id: 'di-lifetimes', d: 'dotnet', sym: 'Di', title: 'DI: Singleton, Scoped, Transient',
    tags: ['dependency injection', 'di', 'ioc', 'singleton', 'scoped', 'transient', 'lifetime', 'captive dependency', 'iservicescopefactory', 'dbcontext'],
    desc: 'DI kontejner pravi objekte umesto tebe i odlučuje koliko dugo žive. **Singleton** postoji jednom za celu aplikaciju, **Scoped** jednom po zahtevu, a **Transient** se pravi pri svakom traženju.',
    points: [
      'Singleton: jedna instanca dok aplikacija radi, pa mora biti bezbedna za istovremeni rad više niti.',
      'Scoped: jedna instanca po scope-u, a u ASP.NET Core scope je jedan HTTP zahtev. `DbContext` je tipično scoped.',
      'Transient: nova instanca svaki put kad se traži, i dvaput u istom zahtevu. Za lake objekte bez stanja.',
      '**Captive dependency**: singleton koji primi scoped servis zarobi ga zauvek, pa taj `DbContext` dele svi zahtevi.',
      'U `BackgroundService` (singleton) scoped servis se dobija preko `IServiceScopeFactory.CreateScope()`.',
    ],
    code: [
      cs('C# · Registracija', `
builder.Services.AddSingleton<IClock, SystemClock>();               // jedan za aplikaciju
builder.Services.AddScoped<IOrderService, OrderService>();          // jedan po zahtevu
builder.Services.AddTransient<IValidator<Order>, OrderValidator>(); // svaki put nov
builder.Services.AddDbContext<ShopDb>(o => o.UseSqlServer(conn));    // scoped`),
      cs('C# · Scoped servis u pozadinskom poslu', `
public sealed class Cleanup(IServiceScopeFactory scopes) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var scope = scopes.CreateScope();          // novi scope = novi DbContext
            var db = scope.ServiceProvider.GetRequiredService<ShopDb>();
            await db.Carts.Where(c => c.ExpiresAt < DateTime.UtcNow).ExecuteDeleteAsync(ct);
            await Task.Delay(TimeSpan.FromMinutes(5), ct);
        }
    }
}`),
      cs('C# · Uhvati captive dependency pri pokretanju', `
builder.Host.UseDefaultServiceProvider(o =>
{
    o.ValidateScopes = true;    // izuzetak ako singleton traži scoped servis
    o.ValidateOnBuild = true;   // proveri sve registracije pri startu
});`),
    ],
    pitfalls: [
      'Stanje u singletonu bez zaštite (lista, brojač): svi zahtevi ga menjaju istovremeno.',
      '`IDisposable` transient razrešen iz root provider-a živi do kraja aplikacije, jer ga kontejner pamti radi oslobađanja.',
    ],
    rel: ['clean-architecture', 'memory-gc', 'middleware'],
    viz: {
      knobs: [{ id: 'mode', label: 'Registracija', value: 'ok', options: [['ok', 'Ispravna'], ['captive', 'Captive dependency']] }],
      build(x) {
        const { C, V } = x, captive = x.p.mode === 'captive';
        const sS = x.stat('s', 'Singleton', 0, { color: C.mag });
        const sC = x.stat('c', 'Scoped', 0, { color: C.sky });
        const sT = x.stat('t', 'Transient', 0, { color: C.wait });
        x.legend([[C.mag, 'Singleton'], [C.sky, 'Scoped'], [C.wait, 'Transient']]);
        x.plate({ at: [0, 0, -3.6], w: 21, d: 2.8, color: C.mag, label: 'Aplikacija (root)' });
        const scopes = [-6.6, 0, 6.6].map((sx, i) => ({ sx, plate: x.plate({ at: [sx, 0, 1.4], w: 6, d: 5.4, label: `Zahtev ${i + 1}` }), objs: [] }));
        const cont = x.box({ at: [-9.6, 0, -3.6], size: [2.2, .8, 1.2], color: C.dim, label: 'Kontejner', side: 'in' });
        const single = x.box({ at: [0, 0, -3.6], size: [3, .8, 1.2], color: C.mag, label: captive ? 'ReportService #1' : 'Clock #1', side: 'in' });
        sS.set(1);
        let nS = 0, nT = 0, captured = null;
        x.spawn(async () => {
          let r = 0;
          while (x.alive) {
            const sc = scopes[r % 3];
            r++;
            sc.objs.forEach(o => x.remove(o)); sc.objs = [];
            sc.plate.material = sc.plate.material.clone(); sc.plate.material.userData.shared = false; sc.plate.material.color.set(0x1a3f86);
            x.say(`**Zahtev ${r}** otvara novi scope. Kontroler traži Clock, OrderService (dvaput) i Validator (dvaput).`);
            const mk = async (label, col, z, xoff) => {
              const o = x.orb(col, { r: .16, halo: false });
              await x.move(o, [cont.port('right'), V(sc.sx + xoff, .6, z)], 14);
              x.remove(o);
              const b = x.box({ at: [sc.sx + xoff, 0, z], size: [2.4, .6, .9], color: col, label, side: 'in' });
              x.pop(b.o); sc.objs.push(b);
              return b;
            };
            const rail = x.rail(single.port('front'), V(sc.sx, .4, -.6), { color: C.mag, opacity: .7 });
            single.flash(C.white, .5);
            x.say(`Singleton **${captive ? 'ReportService' : 'Clock'} #1** se ne pravi ponovo: isti objekat dobija svaki zahtev.`);
            await x.wait(1.2);
            const svc = await mk(`OrderService #${++nS}`, C.sky, .2, -1.4);
            sC.set(nS);
            await x.wait(.6);
            svc.flash(C.white, .5);
            x.say(`Scoped **OrderService #${nS}** je napravljen jednom; drugo traženje u istom zahtevu dobija **isti** objekat.`);
            await x.wait(1.2);
            const t1 = await mk(`Validator #${++nT}`, C.wait, 2.6, -1.4); sT.set(nT);
            const t2 = await mk(`Validator #${++nT}`, C.wait, 2.6, 1.4); sT.set(nT);
            x.say('Transient **Validator** se pravi pri svakom traženju: dve instance u istom zahtevu.');
            await x.wait(1.4);
            if (captive) {
              if (!captured) {
                captured = await mk('ShopDb #1', C.err, .2, 1.4);
                sc.objs.splice(sc.objs.indexOf(captured), 1);
                x.say('**Captive dependency**: singleton ReportService je dobio scoped `ShopDb #1` i drži ga zauvek.');
                await x.wait(1.6);
              } else {
                x.rail(single.port('front'), captured.port('top'), { color: C.err, opacity: .8 });
                captured.flash(C.err, .8);
                x.say(`Zahtev ${r} koristi **isti ShopDb #1** iz prvog zahteva: deljen između niti, sa zastarelim podacima, a možda i već oslobođen.`);
                await x.wait(1.8);
              }
            }
            x.say(`Kraj zahteva ${r}: scope se zatvara i oslobađa scoped i transient objekte. Singleton ostaje.`);
            for (const o of sc.objs) x.fadeOut(o, .3);
            sc.objs = [];
            x.remove(rail);
            sc.plate.material.color.set(C.plate);
            await x.wait(1);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Middleware pipeline
  {
    id: 'middleware', d: 'dotnet', sym: 'Mw', title: 'ASP.NET Core pipeline',
    tags: ['middleware', 'pipeline', 'asp.net core', 'request', 'response', 'use', 'next', 'short-circuit', 'authentication', 'authorization', 'exception handler'],
    desc: 'Zahtev prolazi kroz middleware komponente redom kojim su registrovane, a odgovor se vraća kroz iste komponente unazad. Svaka može da uradi nešto pre i posle sledeće, ili da prekine lanac.',
    points: [
      'Redosled je bitan: `UseAuthentication` ide pre `UseAuthorization`, a exception handler na sam početak.',
      'Middleware koji ne pozove `next` prekida lanac (short-circuit): tako rade statički fajlovi, CORS preflight i 401.',
      'Kod posle `await next()` izvršava se na povratku: tu se mere trajanja i beleži ishod.',
      'Izuzetak bačen duboko u lancu putuje unazad do prvog middleware-a koji ga hvata.',
      '`UseRouting` bira endpoint ranije, pa middleware posle njega (autorizacija, CORS) zna koji će se endpoint izvršiti.',
    ],
    code: [
      cs('C# · Redosled u Program.cs', `
var app = builder.Build();

app.UseExceptionHandler();      // hvata sve što pukne ispod (uz AddProblemDetails)
app.UseHttpsRedirection();
app.UseStaticFiles();           // fajl? odgovori i ne idi dalje
app.UseRouting();
app.UseCors();
app.UseAuthentication();        // ko si
app.UseAuthorization();         // smeš li
app.UseRateLimiter();
app.MapControllers();           // endpoint
app.Run();`),
      cs('C# · Sopstveni middleware: pre i posle', `
app.Use(async (ctx, next) =>
{
    var sw = Stopwatch.StartNew();                        // pre: na putu ka endpoint-u
    ctx.Response.OnStarting(() =>
    {
        ctx.Response.Headers["X-Elapsed-Ms"] = sw.ElapsedMilliseconds.ToString();
        return Task.CompletedTask;
    });
    await next(ctx);
    app.Logger.LogInformation("{Path}: {Ms} ms", ctx.Request.Path, sw.ElapsedMilliseconds);  // posle
});`),
      cs('C# · Prekid lanca', `
app.Use(async (ctx, next) =>
{
    if (!ctx.Request.Headers.ContainsKey("X-Api-Key"))
    {
        ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
        return;                       // next se ne poziva: lanac staje ovde
    }
    await next(ctx);
});`),
    ],
    pitfalls: [
      '`UseAuthorization` pre `UseAuthentication`: korisnik je uvek anoniman, pa svaki zaštićen endpoint vraća 401.',
      'Čitanje tela zahteva u middleware-u bez `EnableBuffering`: endpoint posle toga dobija prazno telo.',
      'Upis zaglavlja posle `next` kad je odgovor već krenuo baca izuzetak (headers already sent).',
    ],
    rel: ['di-lifetimes', 'rate-limiting', 'tracing'],
    viz: {
      knobs: [{ id: 'mode', label: 'Zahtev', value: 'ok', options: [['ok', '200 OK'], ['unauth', 'Bez prava (403)'], ['error', 'Izuzetak (500)']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode;
        const sS = x.stat('s', 'Status', '–');
        x.plate({ at: [1.6, 0, 0], w: 24, d: 6.4 });
        const MW = ['ExceptionHandler', 'HttpsRedirection', 'Routing', 'Authentication', 'Authorization'];
        const gx = i => -6.4 + i * 3.2;
        const gates = MW.map((n, i) => {
          const r = x.ring([gx(i), 1.25, 0], 1.15, C.sky, { t: .09 });
          r.rotation.set(0, Math.PI / 2, 0);
          r.material = r.material.clone(); r.material.userData.shared = false;
          x.label(n, [gx(i), 2.65, 0], { center: [.5, 1] });
          return r;
        });
        const cli = x.box({ at: [-10.2, 0, 0], size: [2, .9, 1.3], label: 'Klijent', side: 'in' });
        const ep = x.box({ at: [11.6, 0, 0], size: [2.6, 1.1, 1.6], color: C.mag, label: 'Endpoint', side: 'in' });
        const pulse = (i, col) => { const r = gates[i]; r.material.emissive.set(col); x.tween(.6, k => { r.material.emissiveIntensity = 1.2 * (1 - k) + .4; }); };
        x.spawn(async () => {
          while (x.alive) {
            gates.forEach(r => { r.material.emissive.set(C.sky); r.material.emissiveIntensity = .4; });
            sS.set('–');
            const o = x.orb(C.sky, { label: 'GET /orders' });
            x.say('Zahtev ulazi i prolazi middleware komponente **redom registracije**. Svaka radi svoj deo pre poziva `next()`.');
            const stop = mode === 'unauth' ? 4 : MW.length;
            let i = 0;
            await x.move(o, [cli.port('right'), V(gx(0) - 1, 1.25, 0)], 8);
            for (; i < stop; i++) { await x.move(o, [o.position.clone(), V(gx(i), 1.25, 0)], 8); pulse(i, C.sky); await x.wait(.25); }
            let status = 200, col = C.ok;
            if (mode === 'unauth') {
              pulse(4, C.err);
              await x.move(o, [o.position.clone(), V(gx(4) - .2, 1.25, 0)], 8);
              status = 403; col = C.err;
              x.say('**Authorization** odbija zahtev i ne poziva `next()`: lanac staje, endpoint se nikad ne izvršava.');
              i = 4;
            } else {
              await x.move(o, [o.position.clone(), ep.port('left', .7)], 8);
              ep.flash(mode === 'error' ? C.err : C.ok, .8);
              if (mode === 'error') { status = 500; col = C.wait; x.say('Endpoint baca **izuzetak**. On putuje unazad kroz lanac...'); }
              else x.say('Endpoint vraća rezultat. Odgovor ide **unazad** kroz iste komponente: kod posle `await next()` sada se izvršava.');
              i = MW.length;
            }
            await x.wait(.6);
            o.material = o.material.clone(); o.material.userData.shared = false;
            o.material.color.set(mode === 'error' ? C.err : col); o.material.emissive.set(mode === 'error' ? C.err : col);
            o.lbl.set(mode === 'error' ? 'izuzetak' : `${status}`);
            for (let j = Math.min(i, MW.length) - 1; j >= 0; j--) {
              await x.move(o, [o.position.clone(), V(gx(j), 1.25, 0)], 8);
              if (mode === 'error' && j === 0) {
                pulse(0, C.wait);
                o.material.color.set(C.wait); o.material.emissive.set(C.wait);
                o.lbl.set('500 ProblemDetails');
                x.say('**ExceptionHandler** hvata izuzetak i pretvara ga u uredan odgovor 500 (ProblemDetails).');
              } else pulse(j, mode === 'error' ? C.err : col);
              await x.wait(.2);
            }
            await x.move(o, [o.position.clone(), cli.port('right')], 8);
            sS.set(String(status));
            cli.flash(col, .6);
            x.remove(o);
            await x.wait(2);
          }
        });
      },
    },
  },
];
