// Paralelno programiranje
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Parallel.For i podela posla
  {
    id: 'parallel-for', d: 'parallel', sym: 'Pf', title: 'Parallel.For i podela posla',
    tags: ['parallel', 'plinq', 'foreachasync', 'work stealing', 'partitioning', 'amdahl', 'jezgra', 'cpu', 'data parallelism'],
    desc: '`Parallel.For`, `Parallel.ForEachAsync` i PLINQ dele kolekciju na delove i izvršavaju ih na više jezgara. Način podele odlučuje koliko dugo jezgra stoje besposlena.',
    points: [
      'Ubrzanje ograničava deo koji ne može paralelno (Amdahlov zakon): ako je 10% posla sekvencijalno, maksimum je 10×, ma koliko jezgara bilo.',
      'Statička podela (svako jezgro unapred dobije svoj komad) je jeftina, ali neravnomerni poslovi ostavljaju jezgra da čekaju najsporije.',
      'Dinamička podela i **work-stealing**: jezgro koje ostane bez posla uzima ga sa kraja tuđeg reda.',
      '`Parallel.ForEachAsync` je za I/O sa ograničenim paralelizmom; `Parallel.For` i PLINQ su za CPU posao.',
      'Paralelizam ima cenu: raspodelu, sinhronizaciju i keš procesora. Za male kolekcije sekvencijalna petlja je često brža.',
    ],
    figs: [{
      cap: 'Amdahlov zakon: ubrzanje = 1 / ((1 − p) + p / n), gde je p paralelni deo posla. Čak i sa 95% paralelnog posla, 64 jezgra daju oko 15×.',
      draw(W, H) {
        const narrow = W < 520, m = { l: 46, r: narrow ? 56 : 104, t: 16, b: 34 }, w = W - m.l - m.r, h = H - m.t - m.b;
        const X = n => m.l + Math.log2(n) / 6 * w, Y = s => m.t + h - s / 20 * h;
        let g = '';
        for (const n of [1, 2, 4, 8, 16, 32, 64]) g += `<line x1="${X(n)}" x2="${X(n)}" y1="${m.t}" y2="${m.t + h}" stroke="currentColor" stroke-opacity=".1"/><text x="${X(n)}" y="${H - 12}" text-anchor="middle">${n}</text>`;
        for (const s of [0, 5, 10, 15, 20]) g += `<line x1="${m.l}" x2="${m.l + w}" y1="${Y(s)}" y2="${Y(s)}" stroke="currentColor" stroke-opacity=".1"/><text x="${m.l - 8}" y="${Y(s) + 4}" text-anchor="end">${s}×</text>`;
        g += `<text x="${m.l + w}" y="${H - 12}" text-anchor="end" dx="${narrow ? 0 : 60}">jezgara</text>`;
        for (const [p, op, col] of [[.5, .3, 'currentColor'], [.75, .5, 'currentColor'], [.9, .8, 'currentColor'], [.95, 1, '#e0115f']]) {
          const pts = [];
          for (let i = 0; i <= 60; i++) { const n = 2 ** (i / 10); pts.push(`${X(n).toFixed(1)},${Y(1 / ((1 - p) + p / n)).toFixed(1)}`); }
          const end = 1 / ((1 - p) + p / 64);
          g += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-opacity="${op}" stroke-width="${p === .95 ? 3 : 2}"/>`;
          g += `<text x="${X(64) + 8}" y="${Y(end) + 4}" style="fill:${col === 'currentColor' ? 'var(--mute)' : col};font-weight:600">${narrow ? '' : 'p = '}${p * 100}%${narrow ? '' : ' · ' + end.toFixed(1) + '×'}</text>`;
        }
        return g;
      },
    }],
    code: [
      cs('C# · CPU posao preko svih jezgara', `
Parallel.For(0, images.Length,
    new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount },
    i => thumbnails[i] = Resize(images[i], 256));

// PLINQ
decimal total = orders.AsParallel()
                      .Where(o => o.IsPaid)
                      .Sum(o => o.Total);`),
      cs('C# · I/O sa ograničenim paralelizmom', `
await Parallel.ForEachAsync(urls,
    new ParallelOptions { MaxDegreeOfParallelism = 8, CancellationToken = ct },
    async (url, token) =>
    {
        var html = await http.GetStringAsync(url, token);
        await store.SaveAsync(url, html, token);
    });`),
      cs('C# · Lokalni zbir po niti, spajanje na kraju', `
long total = 0;
Parallel.ForEach(numbers,
    () => 0L,                                      // početno lokalno stanje niti
    (n, _, local) => local + n,                    // bez zaključavanja u petlji
    local => Interlocked.Add(ref total, local));   // jednom po niti`),
    ],
    pitfalls: [
      '`Parallel.ForEach` sa `async` lambdom se vraća odmah, a poslovi rade bez kontrole (async void). Koristi `ForEachAsync`.',
      'Deljena kolekcija bez zaštite unutar petlje (`list.Add`) daje izgubljene elemente ili izuzetke.',
      'Paralelna petlja unutar ASP.NET zahteva uzima niti drugim zahtevima.',
    ],
    rel: ['threads', 'channels', 'race'],
    viz: {
      knobs: [{ id: 'mode', label: 'Podela', value: 'static', options: [['static', 'Statička'], ['steal', 'Work-stealing']] }],
      build(x) {
        const { C, V } = x, steal = x.p.mode === 'steal', NI = 24;
        const sT = x.stat('t', 'Vreme', '0.0 s');
        const sU = x.stat('u', 'Iskorišćenost jezgara', '–', { color: C.ok });
        const sS = steal ? x.stat('s', 'Ukradeno', 0, { color: C.mag }) : null;
        x.plate({ at: [-.6, 0, 0], w: 21, d: 9.6, label: steal ? 'Besposleno jezgro krade sa kraja tuđeg reda' : 'Svako jezgro unapred dobija 6 poslova' });
        const cores = [0, 1, 2, 3].map(i => {
          const z = -3.3 + i * 2.2;
          const box = x.box({ at: [2, 0, z], size: [2.2, .9, 1.4], label: `Jezgro ${i + 1}`, side: 'in' });
          return { i, z, box, dq: [] };
        });
        const items = [];
        const layoutC = c => { let cur = .55; for (const it of c.dq) { it.t = V(cur - it.len / 2, .23, c.z); cur -= it.len + .12; } };
        x.tick(dt => { for (const it of items) if (it.t) it.m.o.position.lerp(it.t, Math.min(1, dt * 8)); });
        const round = async () => {
          items.length = 0;
          for (let k = 0; k < NI; k++) {
            const heavy = k >= 1 && k <= 4;
            const d = heavy ? x.range(1.5, 2.1) : x.range(.25, .65);
            const owner = cores[Math.floor(k / 6)];
            const len = .3 + d * .55;
            const m = x.box({ at: [-9, 0, owner.z], size: [len, .46, .6], color: C.cat[owner.i], nofit: true });
            const it = { d, len, m, owner };
            items.push(it);
            owner.dq.push(it);
          }
          cores.forEach(layoutC);
          await x.wait(1.2);
          const t0 = x.t, total = items.reduce((s, it) => s + it.d, 0);
          let fin = 0;
          const clock = x.tick(() => sT.set((x.t - t0).toFixed(1) + ' s'));
          const loop = async c => {
            while (x.alive) {
              let it = c.dq.shift();
              if (it) layoutC(c);
              if (!it && steal) {
                const v = cores.filter(o => o !== c && o.dq.length).sort((a, b) => b.dq.reduce((s, q) => s + q.d, 0) - a.dq.reduce((s, q) => s + q.d, 0))[0];
                if (v) { it = v.dq.pop(); layoutC(v); c.box.flash(C.mag, .7); sS.add(); }
              }
              if (!it) { c.box.paint(C.dim); return; }
              c.box.reset();
              it.t = null;
              await x.move(it.m, [it.m.o.position.clone(), c.box.port('top', .28)], 16);
              c.box.paint(C.sky);
              const L0 = it.m.o.scale.x;
              await x.tween(it.d, k => { it.m.o.scale.x = Math.max(.01, L0 * (1 - k)); }, x.ease.lin);
              x.remove(it.m);
              c.box.reset();
              fin++;
            }
          };
          await Promise.all(cores.map(loop));
          clock();
          const span = x.t - t0;
          sT.set(span.toFixed(1) + ' s');
          sU.set(Math.round(total / (4 * span) * 100) + '%');
          x.say(steal
            ? `Gotovo za **${span.toFixed(1)} s**. Jezgra su pomogla preopterećenom jezgru 1, pa su sva radila skoro do kraja.`
            : `Gotovo za **${span.toFixed(1)} s**. Jezgro 1 je dobilo teške poslove, a ostala su završila rano i stajala. Probaj work-stealing.`);
          await x.wait(3.2);
          cores.forEach(c => c.box.reset());
        };
        x.spawn(async () => { while (x.alive) await round(); });
        x.say('Dužina kocke je trajanje posla. Jezgro 1 je dobilo četiri teška posla.');
      },
    },
  },

  // ------------------------------------------------------------------ Channel<T>
  {
    id: 'channels', d: 'parallel', sym: 'Ch', title: 'Producer–consumer i Channel<T>',
    tags: ['channel', 'kanal', 'producer consumer', 'backpressure', 'bounded', 'pipeline', 'backgroundservice', 'red u memoriji'],
    desc: '`Channel<T>` je asinhroni red u memoriji između dela koji proizvodi i dela koji troši. **Ograničen** kanal usporava proizvođača kad se napuni: to je backpressure.',
    points: [
      'Neograničen kanal nikad ne čeka, ali troši memoriju bez granice kad je potrošač sporiji.',
      'Ograničen kanal sa `FullMode = Wait`: `WriteAsync` čeka dok se ne oslobodi mesto, pa proizvođač prirodno uspori.',
      'Drugi režimi za pun kanal: odbaci najstariji, odbaci najnoviji, odbaci upis. Za telemetriju je to često bolje od čekanja.',
      'Više potrošača na istom kanalu: svaku stavku dobija tačno jedan, kao competing consumers u memoriji.',
      '`Writer.Complete()` javlja kraj, i tada se `ReadAllAsync` petlja završava.',
    ],
    code: [
      cs('C# · Ograničen kanal i backpressure', `
var channel = Channel.CreateBounded<Order>(new BoundedChannelOptions(capacity: 100)
{
    FullMode = BoundedChannelFullMode.Wait,
    SingleWriter = true
});

foreach (var order in source)
    await channel.Writer.WriteAsync(order, ct);   // čeka kad je kanal pun
channel.Writer.Complete();`),
      cs('C# · Više potrošača', `
var consumers = Enumerable.Range(0, 4).Select(_ => Task.Run(async () =>
{
    await foreach (var order in channel.Reader.ReadAllAsync(ct))
        await ProcessAsync(order, ct);
}));
await Task.WhenAll(consumers);`),
      cs('C# · BackgroundService kao potrošač u ASP.NET Core', `
public sealed class EmailWorker(Channel<EmailJob> jobs, IEmailSender sender) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        await foreach (var job in jobs.Reader.ReadAllAsync(ct))
            await sender.SendAsync(job, ct);
    }
}

// Program.cs
builder.Services.AddSingleton(Channel.CreateBounded<EmailJob>(500));
builder.Services.AddHostedService<EmailWorker>();`),
    ],
    pitfalls: [
      'Kanal živi u memoriji procesa: restart ili pad briše sve što je u njemu. Za trajnost treba broker.',
      '`TryWrite` na punom kanalu vraća `false`. Ignorisan rezultat znači tiho izgubljene stavke.',
      'Zaboravljen `Complete()` ostavlja potrošače da čekaju zauvek.',
    ],
    rel: ['load-leveling', 'async-await', 'parallel-for'],
    viz: {
      warm: 3,
      knobs: [
        { id: 'mode', label: 'Kanal', value: 'bounded', options: [['bounded', 'Ograničen'], ['unbounded', 'Neograničen']] },
        { id: 'cap', label: 'Kapacitet', min: 1, max: 8, value: 4 },
        { id: 'n', label: 'Potrošača', min: 1, max: 3, value: 1 },
      ],
      build(x) {
        const { C, V } = x, bounded = x.p.mode === 'bounded', cap = x.p.cap, nc = x.p.n;
        const sIn = x.stat('c', 'U kanalu', bounded ? `0/${cap}` : '0', { color: C.sky });
        const sW = x.stat('w', 'Producer čekao', '0.0 s', { color: C.wait });
        const sD = x.stat('d', 'Obrađeno', 0, { color: C.ok });
        const sM = bounded ? null : x.stat('m', 'Memorija', '0 KB', { color: C.err });
        x.plate({ at: [-.4, 0, 0], w: 21, d: Math.max(5.6, nc * 2.2 + 1.4), label: bounded ? 'Pun kanal zaustavlja proizvođača' : 'Neograničen kanal raste bez kraja' });
        const prod = x.box({ at: [-8.6, 0, 0], size: [2, .9, 1.2], label: 'Producer', side: 'in' });
        const tb = x.tube([-7.3, .55, 0], [1.6, .55, 0], { color: C.sky, label: bounded ? `CreateBounded(${cap})` : 'CreateUnbounded()' });
        const SL = bounded ? cap : 12, step = Math.min(1, (tb.len - .4) / Math.max(SL, 8));
        if (bounded) for (let i = 0; i < cap; i++) x.box({ at: [tb.b.x - (i + .5) * step - .2, 0, 0], size: [step * .8, .04, 1.2], color: C.edge, nofit: true });
        const ch = [];
        const more = x.label('', tb.a.clone().add(V(.4, .9, 0)), { cls: 'tag err', nofit: true });
        more.visible = false;
        const layout = () => {
          ch.forEach((o, i) => { o.visible = i < SL; o.userData.t = tb.b.clone().add(V(-(i + .5) * step - .2, 0, 0)); });
          more.visible = !bounded && ch.length > SL; more.set('+' + Math.max(0, ch.length - SL));
          sIn.set(bounded ? `${ch.length}/${cap}` : String(ch.length));
          if (sM) sM.set(ch.length * 4 + ' KB');
        };
        x.tick(dt => { for (const o of ch) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 7)); });
        const cons = Array.from({ length: nc }, (_, i) => {
          const c = x.box({ at: [6, 0, (i - (nc - 1) / 2) * 2.2], size: [2.2, .9, 1.2], label: `Consumer ${i + 1}`, side: 'in' });
          x.rail(tb.b, c.port('left'), { opacity: .3 });
          return c;
        });
        let waited = 0, k = 0;
        x.spawn(async () => {
          while (x.alive) {
            if (bounded && ch.length >= cap) {
              prod.paint(C.wait); prod.text('WriteAsync čeka');
              const t0 = x.t;
              while (ch.length >= cap) await x.wait(.05);
              waited += x.t - t0; sW.set(waited.toFixed(1) + ' s');
              prod.reset(); prod.text('Producer');
            }
            const o = x.orb(C.cat[k++ % C.cat.length], { r: .22 });
            prod.flash(C.sky, .25);
            o.position.copy(prod.port('right'));
            ch.push(o); layout();
            await x.wait(.42);
          }
        });
        for (const c of cons) {
          x.spawn(async () => {
            while (x.alive) {
              if (!ch.length) { await x.wait(.08); continue; }
              const o = ch.shift(); o.visible = true; o.userData.t = null; layout();
              await x.move(o, [o.position.clone(), tb.b, c.port('left')], 11);
              o.position.copy(c.port('top', .3));
              c.paint(C.ok);
              await x.wait(1.15);
              c.reset(); sD.add();
              x.remove(o);
            }
          });
        }
        x.say(bounded
          ? `Proizvođač je brži od potrošača. Kad se kanal napuni (${cap}), \`WriteAsync\` **čeka** i proizvođač uspori na brzinu potrošača.`
          : 'Neograničen kanal nikad ne kaže "stani": stavke se gomilaju i **memorija raste** dok potrošač ne stigne.');
      },
    },
  },
];
