// Monitoring
const cs = (t, src) => ({ t, lang: 'csharp', src });
const txt = (t, src) => ({ t, lang: 'plaintext', src });

export default [
  // ------------------------------------------------------------------ Distribuirani tracing
  {
    id: 'tracing', d: 'observability', sym: 'Tr', title: 'Distribuirani tracing',
    tags: ['trace', 'span', 'opentelemetry', 'otel', 'traceparent', 'w3c', 'application insights', 'jaeger', 'kritična putanja', 'activity'],
    desc: 'Trace prati jedan zahtev kroz sve servise. Svaki korak je **span** sa početkom, trajanjem i roditeljem, a zajedno daju vodopad iz kog se vidi gde je vreme potrošeno.',
    points: [
      'Trace ID se prenosi zaglavljem `traceparent` (W3C Trace Context) kroz HTTP i poruke, pa svi servisi pišu u isti trace.',
      'Span ima roditelja: ugnježdeni spanovi pokazuju ko je koga pozvao, a paralelni pozivi se vide kao preklopljeni.',
      '**Kritična putanja** je lanac spanova koji određuje ukupno trajanje. Ubrzavanje bilo čega van nje ne pomaže.',
      'U .NET-u span je `Activity`. OpenTelemetry ga izvozi u Application Insights, Jaeger, Tempo ili bilo koji OTLP backend.',
      'Uzorkovanje (sampling) čuva deo trace-ova: dovoljno za statistiku, ali greške vredi čuvati sve.',
    ],
    code: [
      cs('C# · OpenTelemetry u ASP.NET Core', `
builder.Services.AddOpenTelemetry()
    .ConfigureResource(r => r.AddService("orders-api"))
    .WithTracing(t => t
        .AddAspNetCoreInstrumentation()
        .AddHttpClientInstrumentation()
        .AddSqlClientInstrumentation()
        .AddSource("Orders")                 // naši spanovi
        .AddOtlpExporter())
    .WithMetrics(m => m
        .AddAspNetCoreInstrumentation()
        .AddRuntimeInstrumentation()
        .AddOtlpExporter());

// Azure: builder.Services.AddOpenTelemetry().UseAzureMonitor();`),
      cs('C# · Sopstveni span', `
private static readonly ActivitySource Source = new("Orders");

public async Task ReserveAsync(Order order, CancellationToken ct)
{
    using var activity = Source.StartActivity("ReserveStock");
    activity?.SetTag("order.id", order.Id);
    activity?.SetTag("order.lines", order.Lines.Count);
    try
    {
        await _inventory.ReserveAsync(order, ct);
    }
    catch (Exception ex)
    {
        activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
        throw;
    }
}`),
      txt('Zaglavlje traceparent', `
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             │  │                                │                └ uzorkovan (sampled)
             │  │                                └ span-id roditelja
             │  └ trace-id: isti kroz sve servise
             └ verzija`),
      txt('KQL · Application Insights: zavisnosti koje padaju', `
dependencies
| where timestamp > ago(1h) and success == false
| summarize failures = count(), p95 = percentile(duration, 95) by target, name
| order by failures desc`),
    ],
    pitfalls: [
      'Ručno napravljen HTTP poziv ili poruka bez zaglavlja: trace se prekida na granici servisa.',
      'Vrednosti visoke kardinalnosti (user id, URL sa ID-jem) kao dimenzije metrika eksplodiraju broj serija. U spanove mogu, u metrike ne.',
    ],
    rel: ['percentiles-slo', 'n-plus-one', 'middleware'],
    viz: {
      knobs: [{ id: 'slow', label: 'SQL upit', value: 'ok', options: [['ok', 'Normalan'], ['slow', 'Spor']] }],
      build(x) {
        const { C, V } = x, slow = x.p.slow === 'slow', X0 = -4.6, S = 3.5;
        x.view({ dir: [1, 13, 11] });
        const sT = x.stat('t', 'Trajanje zahteva', '–', { color: C.mag });
        const sql = { name: 'SQL: SELECT stock', lane: 4, s: .7, e: slow ? 3.3 : 1.4, parent: 3 };
        const inv = { name: 'Inventory: Reserve', lane: 3, s: .45, e: sql.e + .2, parent: 1 };
        const pay = { name: 'Payment: Charge', lane: 2, s: .45, e: 1.45, parent: 1 };
        const ord = { name: 'Orders: PlaceOrder', lane: 1, s: .15, e: Math.max(pay.e, inv.e) + .25, parent: 0 };
        const gw = { name: 'GET /orders', lane: 0, s: 0, e: ord.e + .15 };
        const spans = [gw, ord, pay, inv, sql];
        const crit = [gw, ord, inv, sql];
        const LANES = ['Gateway', 'Orders', 'Payment', 'Inventory', 'SQL baza'];
        const lz = i => -3.4 + i * 1.7;
        const endX = X0 + Math.max(...spans.map(s => s.e)) * S;
        x.plate({ at: [(X0 - 4 + endX + .6) / 2, 0, -.1], w: endX + .6 - (X0 - 4), d: 9.6, label: 'traceparent: 00-4bf92f35…-01' });
        LANES.forEach((n, i) => x.box({ at: [X0 - 2.2, 0, lz(i)], size: [2.6, .6, 1.1], color: i === 4 ? C.db : C.box, label: n, side: 'in' }));
        for (let t = 0; t <= Math.ceil(gw.e * 2) / 2 + .01; t += .5) {
          x.box({ at: [X0 + t * S, 0, -.1], size: [.03, .02, 8.4], color: C.edge, nofit: true });
          if (Math.abs(t % 1) < .01) x.label(`${Math.round(t * 1000)} ms`, [X0 + t * S, 0, 4.7], { cls: 'ghost', center: [.5, 0] });
        }
        const bars = spans.map(sp => {
          const m = x.box({ at: [0, .05, lz(sp.lane)], size: [1, .32, .8], color: C.sky, nofit: true });
          m.o.visible = false;
          const lab = x.label(sp.name, [X0 + sp.s * S, .45, lz(sp.lane) - .42], { center: [0, 1], cls: 'tag', nofit: true });
          lab.visible = false;
          return { sp, m, lab };
        });
        const now = x.box({ at: [X0, 0, -.1], size: [.06, .02, 9.4], color: C.mag, nofit: true });
        x.spawn(async () => {
          while (x.alive) {
            bars.forEach(b => { b.m.o.visible = false; b.lab.visible = false; b.m.paint(C.sky); b.m.o.material.emissive.set(0); });
            sT.set('–');
            x.say('Zahtev ulazi u gateway. Svaki servis otvara span i prosleđuje `traceparent` dalje.');
            let t = 0;
            await new Promise(res => {
              const stop = x.tick(dt => {
                t += dt * .55;
                now.o.position.x = X0 + Math.min(t, gw.e) * S;
                for (const b of bars) {
                  const { sp } = b;
                  if (t < sp.s) continue;
                  const len = Math.max(.02, (Math.min(t, sp.e) - sp.s) * S);
                  b.m.o.visible = true; b.lab.visible = true;
                  b.m.o.scale.x = len;
                  b.m.o.position.x = X0 + sp.s * S + len / 2;
                  if (t >= sp.e && !b.done) { b.done = true; b.lab.set(`${sp.name} (${Math.round((sp.e - sp.s) * 1000)} ms)`); }
                }
                if (t >= gw.e) { stop(); res(); }
              });
            });
            sT.set(Math.round(gw.e * 1000) + ' ms');
            for (const b of bars) if (crit.includes(b.sp)) { b.m.paint(C.mag); b.m.o.material.emissive.set(C.mag); b.m.o.material.emissiveIntensity = .35; }
            x.say(slow
              ? `**Kritična putanja** (magenta): Gateway, Orders, Inventory, SQL. Spor SQL upit produžava ceo zahtev na ${Math.round(gw.e * 1000)} ms; Payment je paralelan i nije problem.`
              : '**Kritična putanja** (magenta) je lanac koji određuje trajanje. Payment radi paralelno sa Inventory-jem, pa njegovo ubrzanje ne bi skratilo zahtev.');
            await x.wait(4);
            bars.forEach(b => { b.done = false; b.lab.set(b.sp.name); });
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Percentili i SLO
  {
    id: 'percentiles-slo', d: 'observability', sym: 'Pc', title: 'Percentili i SLO',
    tags: ['percentil', 'p50', 'p95', 'p99', 'latencija', 'slo', 'sli', 'sla', 'error budget', 'budžet grešaka', 'histogram', 'prosek'],
    desc: 'Prosek sakriva rep: ako je 1% zahteva sporo, prosek se jedva pomeri, a svaki stoti korisnik čeka. **Percentili** pokazuju šta korisnici stvarno vide, a **SLO** kaže koliko loših zahteva je dozvoljeno.',
    points: [
      'p99 = 300 ms znači: 99% zahteva je brže od 300 ms, a 1% sporije.',
      'Rep raste sa razgranavanjem: stranica koja čeka 10 servisa vidi p99 nekog od njih mnogo češće nego u 1% slučajeva.',
      'SLI je merenje (udeo zahteva bržih od 300 ms), SLO je cilj (99,5% za 30 dana), SLA je ugovor sa posledicama.',
      'Budžet grešaka je 1 − SLO. Sa SLO od 99,9% mesečno, dozvoljeno je oko 43 minuta lošeg rada.',
      'Percentili se ne mogu usrednjavati između instanci: saberi histograme, pa tek onda računaj percentil.',
    ],
    table: {
      title: 'SLO i budžet grešaka',
      head: ['SLO', 'Dozvoljeno za 30 dana', 'Dnevno'],
      rows: [['99%', '7 h 12 min', '14 min 24 s'], ['99,5%', '3 h 36 min', '7 min 12 s'], ['99,9%', '43 min 12 s', '1 min 26 s'], ['99,95%', '21 min 36 s', '43 s'], ['99,99%', '4 min 19 s', '8,6 s']],
    },
    code: [
      txt('KQL · Application Insights', `
requests
| where timestamp > ago(1h)
| summarize p50 = percentile(duration, 50),
            p95 = percentile(duration, 95),
            p99 = percentile(duration, 99),
            avg = avg(duration)
  by bin(timestamp, 5m)
| render timechart`),
      txt('PromQL · p99 iz histograma', `
histogram_quantile(0.99,
  sum by (le) (rate(http_server_request_duration_seconds_bucket[5m])))`),
      cs('C# · Sopstveni histogram', `
private static readonly Meter Meter = new("Orders");
private static readonly Histogram<double> Checkout =
    Meter.CreateHistogram<double>("orders.checkout.duration", unit: "ms");

var sw = Stopwatch.StartNew();
await PlaceOrderAsync(cmd, ct);
Checkout.Record(sw.Elapsed.TotalMilliseconds,
    new KeyValuePair<string, object?>("payment.method", cmd.Method));`),
    ],
    pitfalls: [
      'Alarm na prosek: rep može da se udvostruči, a prosek da ostane isti.',
      'Merenje samo na serveru: korisnik vidi i mrežu, DNS i iscrtavanje. Dodaj merenje u browseru (RUM).',
    ],
    rel: ['tracing', 'latency', 'hpa'],
    viz: {
      warm: 6,
      knobs: [{ id: 'tail', label: 'Sporih zahteva', min: 0, max: 8, value: 2, fmt: v => v + '%' }],
      build(x) {
        const { C, V } = x, tail = x.p.tail / 100, NB = 20, BW = .95, X0 = -9.5, WIN = 320, SLO = 300;
        x.view({ dir: [0, 8, 14] });
        const st = { avg: x.stat('a', 'Prosek', '–'), p50: x.stat('p50', 'p50', '–', { color: C.sky }), p95: x.stat('p95', 'p95', '–', { color: C.wait }), p99: x.stat('p99', 'p99', '–', { color: C.mag }), ok: x.stat('ok', 'Ispod 300 ms', '–', { color: C.ok }) };
        x.plate({ at: [0, 0, 0], w: 21.6, d: 4.4, lpos: 'front', label: 'Histogram trajanja poslednjih 320 zahteva' });
        const bx = ms => X0 + ms / 50 * BW;
        const bars = Array.from({ length: NB }, (_, i) => x.bar([X0 + (i + .5) * BW, 0, 0], .02, C.sky, { w: BW * .82, d: 1.4, nofit: true }));
        for (const ms of [0, 250, 500, 750, 1000]) x.label(`${ms} ms`, [bx(ms), 0, 1.3], { cls: 'ghost', center: [.5, 0] });
        const slo = x.box({ at: [bx(SLO), 0, 0], size: [.05, 6.2, 2], color: C.err });
        slo.o.material.transparent = true; slo.o.material.opacity = .4;
        x.label('SLO: 99% ispod 300 ms', [bx(SLO), 6.3, 0], { cls: 'tag err', center: [.5, 1] });
        const mk = (col, name, h) => {
          const m = x.box({ at: [0, 0, -.9], size: [.08, h, .08], color: col, nofit: true });
          m.o.material.emissive.set(col); m.o.material.emissiveIntensity = .6;
          const l = x.label(name, [0, h + .2, -.9], { cls: 'tag', color: col, center: [.5, 1], nofit: true });
          return { m, l, x: X0 };
        };
        const M = { avg: mk(C.white, 'prosek', 3.4), p50: mk(C.sky, 'p50', 4.3), p95: mk(C.wait, 'p95', 5.2), p99: mk(C.mag, 'p99', 6.1) };
        const win = [], counts = new Array(NB).fill(0);
        const sample = () => {
          if (x.rnd() < tail) return 380 + x.rnd() * 560;
          return 55 + 40 * (x.rnd() + x.rnd() + x.rnd());
        };
        const binOf = ms => Math.min(NB - 1, Math.floor(ms / 50));
        const H = c => .02 + c * .055;
        x.tick(dt => {
          for (const k in M) { const o = M[k]; o.m.o.position.x += (o.x - o.m.o.position.x) * Math.min(1, dt * 6); o.l.position.x = o.m.o.position.x; }
        });
        const recompute = () => {
          if (!win.length) return;
          const s = [...win].sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
          const avg = s.reduce((a, b) => a + b, 0) / s.length;
          const v = { avg, p50: q(.5), p95: q(.95), p99: q(.99) };
          for (const k in M) { M[k].x = bx(v[k]); st[k].set(Math.round(v[k]) + ' ms'); M[k].l.set(`${k === 'avg' ? 'prosek' : k} ${Math.round(v[k])}`); }
          const ok = s.filter(z => z < SLO).length / s.length;
          st.ok.set((ok * 100).toFixed(1) + '%');
          st.ok.el.style.setProperty('--c', ok >= .99 ? '#3ddc97' : '#ff4d6d');
        };
        x.every(.5, recompute);
        x.every(.09, () => {
          const ms = sample(), b = binOf(ms);
          x.spawn(async () => {
            const o = x.orb(ms > SLO ? C.mag : C.sky, { r: .13, halo: false });
            const px = X0 + (b + .5) * BW;
            await x.move(o, [V(px, 7, 0), V(px, H(counts[b]) + .1, 0)], 18);
            x.remove(o);
            win.push(ms); counts[b]++; bars[b].setH(H(counts[b]));
            if (win.length > WIN) { const old = win.shift(), ob = binOf(old); counts[ob]--; bars[ob].setH(H(counts[ob])); }
          });
        });
        bars.forEach((b, i) => b.paint(i * 50 >= SLO ? C.mag : C.sky));
        x.say(tail ? `**${x.p.tail}% zahteva je sporo.** Prosek se jedva pomera, a p99 je duboko u repu. Zato se alarmira na percentile, ne na prosek.` : 'Bez sporih zahteva p99 je blizu p95 i daleko ispod SLO praga. Pojačaj udeo sporih i prati p99.');
      },
    },
  },
];
