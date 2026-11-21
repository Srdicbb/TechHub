// Arhitektura i otpornost
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Clean Architecture
  {
    id: 'clean-architecture', d: 'architecture', sym: 'Cl', title: 'Clean Architecture',
    tags: ['slojevi', 'layers', 'dependency rule', 'dependency inversion', 'domain', 'application', 'infrastructure', 'onion', 'hexagonal', 'ports and adapters'],
    desc: 'Slojevi su poređani tako da zavisnosti idu samo ka unutra: domen ne zna za bazu, HTTP ni framework. Spoljni slojevi implementiraju interfejse koje definišu unutrašnji.',
    points: [
      '**Domain**: entiteti i poslovna pravila, bez zavisnosti od infrastrukture.',
      '**Application**: slučajevi korišćenja (use case) i interfejsi koje oni traže (`IOrderRepository`, `IClock`).',
      '**Infrastructure**: EF Core, Redis, Service Bus, implementacije tih interfejsa.',
      '**Presentation**: API, kontroleri ili minimal API; prevodi HTTP u poziv use case-a.',
      'Inverzija zavisnosti: Application definiše interfejs, Infrastructure ga implementira, a DI kontejner ih spaja u `Program.cs`.',
    ],
    code: [
      cs('C# · Interfejs u Application, implementacija u Infrastructure', `
// Application
public interface IOrderRepository
{
    Task<Order?> GetAsync(OrderId id, CancellationToken ct);
    Task AddAsync(Order order, CancellationToken ct);
}

public sealed class PlaceOrder(IOrderRepository orders, IClock clock)
{
    public async Task<OrderId> Handle(PlaceOrderCommand cmd, CancellationToken ct)
    {
        var order = Order.Create(cmd.CustomerId, cmd.Lines, clock.UtcNow);   // pravila su u domenu
        await orders.AddAsync(order, ct);
        return order.Id;
    }
}

// Infrastructure
public sealed class EfOrderRepository(ShopDb db) : IOrderRepository { /* EF Core */ }`),
      cs('C# · Spajanje u Program.cs', `
builder.Services.AddScoped<IOrderRepository, EfOrderRepository>();
builder.Services.AddSingleton<IClock, SystemClock>();
builder.Services.AddScoped<PlaceOrder>();

app.MapPost("/orders", async (PlaceOrderCommand cmd, PlaceOrder useCase, CancellationToken ct) =>
    Results.Created($"/orders/{await useCase.Handle(cmd, ct)}", null));`),
      cs('C# · Test arhitekture (NetArchTest)', `
var result = Types.InAssembly(typeof(Order).Assembly)
    .ShouldNot().HaveDependencyOn("Microsoft.EntityFrameworkCore")
    .GetResult();

Assert.True(result.IsSuccessful);   // domen ne sme da zna za EF Core`),
    ],
    pitfalls: [
      'Generički repozitorijum preko EF Core-a (`IRepository<T>` sa `GetAll`) ponavlja DbContext i krije upite. Pravi interfejse po potrebi use case-a.',
      'Četiri projekta za mali CRUD servis su ceremonija bez koristi. Slojevi se isplate kad postoji pravi domen.',
      'Domen pun javnih setera je DTO, ne domen: pravila treba da žive u metodama entiteta.',
    ],
    rel: ['di-lifetimes', 'middleware', 'circuit-breaker'],
    viz: {
      knobs: [{ id: 'mode', label: 'Zavisnosti', value: 'ok', options: [['ok', 'Ka unutra'], ['bad', 'Kršenje pravila']] }],
      build(x) {
        const { C, V } = x, bad = x.p.mode === 'bad';
        x.view({ dir: [0, 12, 11] });
        x.db({ at: [0, 0, 0], r: 6.3, h: .34, color: 0x2d3a52 });
        x.db({ at: [0, .34, 0], r: 4.1, h: .44, color: 0x4f74b3 });
        const dom = x.db({ at: [0, .78, 0], r: 2, h: .56, color: C.mag });
        x.label('<b>Domain</b><small>entiteti i pravila</small>', [0, 1.5, 0], { center: [.5, .5] });
        x.label('<b>Application</b><small>use case, interfejsi</small>', [0, .9, 3.05], { center: [.5, .5] });
        x.label('<b>Presentation</b><small>API</small>', [-4.9, .45, 2.9], { center: [.5, .5] });
        x.label('<b>Infrastructure</b><small>EF Core, Redis, Bus</small>', [4.9, .45, 2.9], { center: [.5, .5] });
        const http = x.box({ at: [-9.4, 0, -1], size: [2, .9, 1.2], label: 'HTTP zahtev', side: 'in' });
        const ifc = x.box({ at: [2.6, .78, -2.4], size: [.9, .3, .9], color: C.white, label: 'IOrderRepository', side: 'left' });
        const impl = x.box({ at: [5.6, .34, -3.7], size: [1, .45, 1], color: C.sky, label: 'EfOrderRepository', side: 'right' });
        const sqlDb = x.db({ at: [9.6, 0, -1.2], r: .8, h: 1.1, label: 'SQL' });
        x.arrow(impl.port('top', .1), ifc.port('top', .1), { color: C.ok, opacity: .9, r: .045, head: .35 });
        for (const [a, b] of [[[-5.6, .55, 0], [-3.7, 1, 0]], [[0, .55, -5.6], [0, 1, -3.7]], [[-3.4, 1, .5], [-1.8, 1.5, .5]], [[0, 1, -3.4], [0, 1.5, -1.9]]]) {
          x.arrow(a, b, { color: C.ok, opacity: .85, r: .04, head: .32 });
        }
        if (bad) {
          x.arrow(dom.port('top', .1).add(V(1, 0, -.6)), impl.port('top', .4), { color: C.err, opacity: 1, r: .07, head: .45, label: 'Domain → EF Core' });
          x.say('**Kršenje pravila**: domen direktno koristi EF Core. Promena baze sada menja i pravila poslovanja, a testovi domena traže bazu.');
        } else x.say('Zelene strelice su zavisnosti: sve vode **ka centru**. Infrastruktura implementira interfejs iz Application sloja, pa domen ne zna za bazu.');
        x.spawn(async () => {
          while (x.alive) {
            const o = x.orb(C.mag, { label: 'POST /orders' });
            await x.move(o, [http.port('right'), V(-5, .7, -1), V(-3.2, 1.05, -.8)], 6);
            o.lbl.set('PlaceOrder.Handle');
            await x.move(o, [V(-3.2, 1.05, -.8), V(-1.2, 1.6, -.4)], 5);
            o.lbl.set('Order.Create');
            dom.flash(C.ok, .6);
            await x.wait(.5);
            o.lbl.set('orders.AddAsync');
            await x.move(o, [V(-1.2, 1.6, -.4), ifc.port('top', .3)], 5);
            ifc.flash(C.mag, .5);
            await x.move(o, [ifc.port('top', .3), impl.port('top', .3)], 5);
            o.lbl.set('EF Core: INSERT');
            await x.move(o, [impl.port('top', .3), sqlDb.port('top', .2)], 6);
            sqlDb.flash(C.ok, .5);
            await x.wait(.3);
            x.remove(o);
            await x.wait(1);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Circuit breaker
  {
    id: 'circuit-breaker', d: 'architecture', sym: 'Cb', title: 'Circuit breaker',
    tags: ['circuit breaker', 'osigurač', 'polly', 'resilience', 'otpornost', 'fail fast', 'half-open', 'fallback', 'standard resilience handler'],
    desc: 'Kad zavisnost počne da pada, circuit breaker prestaje da je zove i odmah vraća grešku (**open**). Posle pauze pušta probni zahtev (**half-open**); ako prođe, vraća se normalan rad (**closed**).',
    points: [
      'Closed: pozivi prolaze, a breaker broji greške u kliznom prozoru.',
      'Open: posle praga grešaka pozivi se odbijaju odmah (fail fast), bez čekanja timeout-a, pa zavisnost dobija vazduha.',
      'Half-open: posle pauze pušta se probni poziv. Uspeh zatvara breaker, greška ga opet otvara.',
      'Uz breaker ide fallback: keširan odgovor, podrazumevana vrednost ili jasna poruka korisniku.',
      'Redosled u pipeline-u: retry spolja, breaker unutra, pa timeout po pokušaju. Dok je breaker otvoren, pokušaji padaju odmah i ne opterećuju zavisnost.',
    ],
    code: [
      cs('C# · Polly v8: retry, breaker, timeout', `
var pipeline = new ResiliencePipelineBuilder<HttpResponseMessage>()
    .AddRetry(new RetryStrategyOptions<HttpResponseMessage> { MaxRetryAttempts = 2, UseJitter = true })
    .AddCircuitBreaker(new CircuitBreakerStrategyOptions<HttpResponseMessage>
    {
        FailureRatio = 0.5,                           // 50% grešaka...
        SamplingDuration = TimeSpan.FromSeconds(10),  // ...u prozoru od 10 s
        MinimumThroughput = 8,                        // tek posle bar 8 poziva
        BreakDuration = TimeSpan.FromSeconds(30)      // koliko ostaje otvoren
    })
    .AddTimeout(TimeSpan.FromSeconds(2))              // po pokušaju
    .Build();`),
      cs('C# · Standardni handler za HttpClient', `
builder.Services.AddHttpClient<CatalogClient>(c => c.BaseAddress = new Uri("https://catalog"))
    .AddStandardResilienceHandler();   // rate limit, timeout, retry, circuit breaker, timeout po pokušaju`),
      cs('C# · Fallback dok je breaker otvoren', `
public async Task<Prices> GetPricesAsync(CancellationToken ct)
{
    try
    {
        var res = await pipeline.ExecuteAsync(async t => await http.GetAsync("/prices", t), ct);
        return await res.Content.ReadFromJsonAsync<Prices>(ct) ?? Prices.Empty;
    }
    catch (BrokenCircuitException)
    {
        return cache.LastKnownPrices();   // brz odgovor umesto čekanja na mrtvu zavisnost
    }
}`),
    ],
    pitfalls: [
      'Jedan breaker za sve zavisnosti: pad jedne zatvara pristup svima. Breaker ide po zavisnosti (po hostu).',
      'Prag postavljen prenisko otvara breaker na prvi šum; previsoko ga otvara kad je već kasno.',
    ],
    rel: ['retry-dlq', 'rate-limiting', 'tracing'],
    viz: {
      actions: [{ id: 'toggle', label: 'Zavisnost pada ili se oporavlja', icon: 'bug' }],
      build(x) {
        const { C, V } = x, WIN = 8, BREAK = 3.5;
        let state = 'closed', hist = [], openUntil = 0, healthy = true, probing = false;
        const sS = x.stat('s', 'Stanje', 'Closed', { color: C.ok });
        const sO = x.stat('o', 'Uspešno', 0, { color: C.ok });
        const sF = x.stat('f', 'Greška', 0, { color: C.err });
        const sQ = x.stat('q', 'Odbijeno odmah', 0, { color: C.wait });
        x.plate({ at: [0, 0, 0], w: 21, d: 6.6 });
        const cli = x.box({ at: [-8.2, 0, 0], size: [2.2, .9, 1.3], label: 'Klijent', side: 'in' });
        const br = x.box({ at: [-.8, 0, 0], size: [2.6, 1.1, 1.6], color: C.ok, label: 'Closed', side: 'in' });
        const piv = x.group();
        piv.position.set(-.8, 1.1, 0);
        x.box({ at: [0, 0, 0], size: [.2, 1.1, .2], color: C.white, parent: piv });
        const svc = x.box({ at: [6.8, 0, 0], size: [2.8, 1, 1.4], label: 'Zavisnost', side: 'in' });
        x.rail(cli.port('right'), br.port('left'), { opacity: .3 });
        x.rail(br.port('right'), svc.port('left'), { opacity: .3 });
        const NAMES = { closed: 'Closed', open: 'Open', half: 'Half-open' }, COLS = { closed: C.ok, open: C.err, half: C.wait }, ANG = { closed: 0, open: -1, half: -.5 };
        const setState = s => {
          state = s;
          br.paint(COLS[s]); br.text(NAMES[s]);
          sS.set(NAMES[s]); sS.el.style.setProperty('--c', '#' + COLS[s].toString(16).padStart(6, '0'));
          const a0 = piv.rotation.z;
          x.tween(.3, k => { piv.rotation.z = a0 + (ANG[s] - a0) * k; });
        };
        x.tick(() => { if (state === 'open') br.text(`Open ${Math.max(0, openUntil - x.t).toFixed(1)} s`); });
        const setHealth = h => {
          healthy = h;
          if (h) svc.reset(); else svc.paint(C.err);
          x.say(h ? 'Zavisnost se **oporavila**. Breaker će to otkriti probnim pozivom kad istekne pauza.' : 'Zavisnost **pada**: pozivi traju dugo i završavaju greškom. Breaker broji greške.');
        };
        x.on('toggle', () => setHealth(!healthy));
        x.every(15, () => { setHealth(false); x.wait(6).then(() => setHealth(true)); }, 2.5);
        const call = async () => {
          const o = x.orb(C.sky, { r: .2, halo: false });
          await x.move(o, [cli.port('right'), br.port('left')], 10);
          if (state === 'open' && x.t >= openUntil) { setState('half'); x.say('Pauza je istekla: **half-open**, jedan probni poziv ide do zavisnosti.'); }
          if (state === 'open' || (state === 'half' && probing)) {
            sQ.add(); br.flash(C.wait, .3);
            o.material = o.material.clone(); o.material.userData.shared = false; o.material.color.set(C.wait); o.material.emissive.set(C.wait);
            await x.move(o, [br.port('left'), cli.port('right')], 12);
            x.remove(o);
            return;
          }
          const probe = state === 'half';
          if (probe) probing = true;
          await x.move(o, [br.port('right'), svc.port('left')], 10);
          const ok = healthy ? x.rnd() > .05 : x.rnd() < .1;
          if (!ok) await x.wait(.9);
          svc.flash(ok ? C.ok : C.err, .4);
          o.material = o.material.clone(); o.material.userData.shared = false;
          o.material.color.set(ok ? C.ok : C.err); o.material.emissive.set(ok ? C.ok : C.err);
          await x.move(o, [svc.port('left'), cli.port('right')], 12);
          x.remove(o);
          (ok ? sO : sF).add();
          if (probe) {
            probing = false;
            if (ok) { hist = []; setState('closed'); x.say('Probni poziv je uspeo: breaker se **zatvara** i saobraćaj ide normalno.'); }
            else { openUntil = x.t + BREAK; setState('open'); x.say('Probni poziv nije uspeo: breaker se ponovo **otvara**.'); }
            return;
          }
          if (state !== 'closed') return;
          hist.push(ok); if (hist.length > WIN) hist.shift();
          const fails = hist.filter(v => !v).length;
          if (hist.length >= 6 && fails / hist.length >= .5) {
            openUntil = x.t + BREAK; setState('open');
            x.say(`${fails} od poslednjih ${hist.length} poziva je palo: breaker se **otvara** i odbija pozive odmah, bez čekanja.`);
          }
        };
        x.every(.5, () => x.spawn(call));
        x.say('Breaker stoji između klijenta i zavisnosti. Prati stanje (boja) i ručicu.');
      },
    },
  },

  // ------------------------------------------------------------------ Rate limiting
  {
    id: 'rate-limiting', d: 'architecture', sym: 'Rl', title: 'Rate limiting: token bucket',
    tags: ['rate limit', 'ograničenje', 'token bucket', 'kofa', 'fixed window', 'sliding window', '429', 'throttling', 'apim'],
    desc: 'Rate limiter štiti servis od previše zahteva. **Token bucket**: kofa prima najviše B tokena i puni se brzinom r; svaki zahtev troši token, a kad je kofa prazna, zahtev dobija `429`.',
    points: [
      'Kapacitet kofe dozvoljava kratke nalete (burst), a brzina punjenja određuje dugoročni prosek.',
      '**Fixed window** broji zahteve po minutu. Jednostavno je, ali oko granice prozora pušta i do dvostruko više.',
      '**Sliding window** deli prozor na segmente i ublažava granicu; **concurrency limiter** ograničava istovremene, a ne ukupne zahteve.',
      'Odbijen zahtev dobija `429 Too Many Requests` i, po mogućstvu, zaglavlje `Retry-After`.',
      'Limit treba da bude po korisniku ili API ključu: jedan bučan klijent ne sme da ugasi ostale.',
    ],
    code: [
      cs('C# · ASP.NET Core rate limiter', `
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddTokenBucketLimiter("api", opt =>
    {
        opt.TokenLimit = 10;                                // kapacitet (burst)
        opt.TokensPerPeriod = 5;                            // punjenje:
        opt.ReplenishmentPeriod = TimeSpan.FromSeconds(1);  // 5 tokena u sekundi
        opt.QueueLimit = 0;                                 // bez čekanja: odmah 429
    });
});

app.UseRateLimiter();
app.MapGet("/products", GetProducts).RequireRateLimiting("api");`),
      cs('C# · Limit po korisniku', `
o.AddPolicy("per-user", ctx =>
    RateLimitPartition.GetTokenBucketLimiter(
        ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
        _ => new TokenBucketRateLimiterOptions
        {
            TokenLimit = 20,
            TokensPerPeriod = 10,
            ReplenishmentPeriod = TimeSpan.FromSeconds(1),
            QueueLimit = 0
        }));`),
      { t: 'Azure API Management · politika', lang: 'xml', src: `
<rate-limit-by-key calls="100" renewal-period="60"
    counter-key="@(context.Subscription.Id)" />` },
    ],
    pitfalls: [
      'Limiter u memoriji svake instance: sa 5 instanci stvarni limit je 5× veći. Za globalni limit treba zajednički brojač (Redis) ili gateway.',
      'Klijent koji na 429 odmah ponavlja pravi još veću gužvu: poštuj `Retry-After` i backoff.',
    ],
    rel: ['semaphore', 'circuit-breaker', 'load-leveling'],
    viz: {
      knobs: [
        { id: 'rate', label: 'Punjenje', min: 1, max: 6, value: 2, fmt: v => v + '/s' },
        { id: 'cap', label: 'Kapacitet', min: 3, max: 12, value: 6 },
      ],
      actions: [{ id: 'burst', label: 'Nalet od 15 zahteva', icon: 'zap' }],
      build(x) {
        const { C, V } = x, rate = x.p.rate, cap = x.p.cap;
        const sO = x.stat('o', 'Propušteno', 0, { color: C.ok });
        const sR = x.stat('r', 'Odbijeno (429)', 0, { color: C.err });
        const sT = x.stat('t', 'Tokena', `${cap}/${cap}`, { color: C.token });
        x.plate({ at: [0, 0, 0], w: 21, d: 7 });
        const cli = x.box({ at: [-8.4, 0, 0], size: [2.2, .9, 1.3], label: 'Klijenti', side: 'in' });
        const H = .3 + cap * .14;
        x.tube([0, 0, 0], [0, H + .3, 0], { r: .95, color: C.token, label: `Kofa: najviše ${cap}` });
        const api = x.box({ at: [7.6, 0, 0], size: [2.4, 1, 1.4], label: 'API', side: 'in' });
        const toks = [];
        const place = () => { toks.forEach((t, i) => t.position.set(0, .12 + i * .14, 0)); sT.set(`${toks.length}/${cap}`); };
        for (let i = 0; i < cap; i++) toks.push(x.token());
        place();
        x.label(`+${rate} tokena u sekundi`, [.5, H + 1.4, 0], { cls: 'tag wait', center: [0, .5] });
        x.every(1 / rate, () => x.spawn(async () => {
          if (toks.length >= cap) return;
          const t = x.token({ at: [0, H + 1.4, 0] });
          await x.move(t, [t.position.clone(), V(0, .12 + toks.length * .14, 0)], 6);
          if (toks.length >= cap) { x.remove(t); return; }
          toks.push(t); place();
        }));
        const request = async () => {
          const o = x.orb(C.sky, { r: .2, halo: false });
          await x.move(o, [cli.port('right'), V(-1.3, .5, 0)], 11);
          if (toks.length) {
            const t = toks.pop(); place();
            await x.move(t, [t.position.clone(), V(-1.3, 1, 0)], 12);
            x.remove(t);
            await x.move(o, [V(-1.3, .5, 0), V(1.3, .5, 0), api.port('left')], 11);
            api.flash(C.ok, .3); sO.add();
          } else {
            o.material = o.material.clone(); o.material.userData.shared = false; o.material.color.set(C.err); o.material.emissive.set(C.err);
            const l = x.label('429', [0, .4, 0], { parent: o, cls: 'tag err', nofit: true });
            sR.add();
            await x.move(o, [V(-1.3, .5, 0), cli.port('right')], 9);
          }
          x.remove(o);
        };
        x.spawn(async () => { while (x.alive) { x.spawn(request); await x.wait(x.range(.15, .65)); } });
        x.on('burst', () => {
          for (let i = 0; i < 15; i++) x.wait(i * .06).then(() => x.spawn(request));
          x.say(`Nalet od 15: prvih **${toks.length}** prolazi na tokene iz kofe, ostali dobijaju **429** dok se kofa ne dopuni.`);
        });
        x.say(`Zahtevi stižu oko 2,5 u sekundi, a kofa se puni ${rate} u sekundi. Kad su tokeni potrošeni, višak dobija **429**.`);
      },
    },
  },
];
