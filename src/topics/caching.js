// Keširanje
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Latencije
  {
    id: 'latency', d: 'caching', sym: 'Lt', title: 'Hijerarhija memorije i latencije',
    tags: ['latency', 'latencija', 'l1', 'l2', 'ram', 'ssd', 'mreža', 'numbers every programmer should know', 'lokalnost'],
    desc: 'Što je podatak dalje od procesora, to je skuplje doći do njega: od nanosekunde u L1 kešu do stotina milisekundi preko okeana. Keširanje premešta podatke na brži nivo.',
    points: [
      'Razlike su u redovima veličine: RAM je oko 100× sporiji od L1, a poziv do Redisa u istom regionu oko 5 000× sporiji od RAM-a.',
      'Zato je jedan dodatni poziv ka bazi u petlji skuplji od hiljada operacija u memoriji.',
      'Svaki nivo keša je kompromis: brži nivo je manji i skuplji, i čuva kopiju koja može da zastari.',
      'Lokalnost: podaci kojima se pristupa zajedno treba da stoje zajedno (niz struktura umesto mreže objekata po heap-u).',
    ],
    table: {
      title: 'Ljudska skala',
      head: ['Nivo', 'Približno', 'Kad bi L1 bio 1 s'],
      rows: [
        ['L1 keš', '1 ns', '1 s'], ['L2 keš', '4 ns', '4 s'], ['L3 keš', '15 ns', '15 s'], ['RAM', '100 ns', '1,7 min'],
        ['NVMe SSD, čitanje', '20 µs', '5,5 h'], ['Redis u istom regionu', '0,5 ms', '6 dana'], ['SQL upit preko indeksa', '2 ms', '23 dana'],
        ['Poziv u drugi region', '80 ms', '2,5 godine'], ['Poziv preko okeana', '150 ms', '4,8 godina'],
      ],
      note: 'Red veličine, ne tačne vrednosti: zavise od hardvera, mreže i opterećenja.',
    },
    code: [
      cs('C# · BenchmarkDotNet: izmeri umesto da pogađaš', `
[MemoryDiagnoser]
public class LookupBench
{
    private readonly Dictionary<int, Product> _local = LoadAll();
    private readonly IDatabase _redis = ConnectRedis();

    [Benchmark] public Product? Memory() => _local.GetValueOrDefault(42);
    [Benchmark] public async Task<RedisValue> Redis() => await _redis.StringGetAsync("product:42");
}
// dotnet run -c Release`),
      cs('C# · Lokalnost: niz struktura protiv liste objekata', `
struct Point { public float X, Y; }
Point[] points = new Point[1_000_000];   // jedan neprekinut blok: keš procesora pomaže

List<PointClass> objects = new();        // milion referenci razbacanih po heap-u`),
    ],
    pitfalls: [
      'Mikrobenchmark u Debug režimu ili bez zagrevanja meri JIT, ne tvoj kod.',
      '"Samo jedan poziv" u petlji od 1 000 elemenata je 1 000 poziva: sabiraj latencije, ne operacije.',
    ],
    rel: ['cache-aside', 'distributed-cache', 'n-plus-one'],
    viz: {
      knobs: [{ id: 'scale', label: 'Visina stuba', value: 'log', options: [['log', 'Logaritamska skala'], ['lin', 'Linearna skala']] }],
      build(x) {
        const { C, V } = x, lin = x.p.scale === 'lin';
        const L = [['L1', 1, '1 ns', '1 s'], ['L2', 4, '4 ns', '4 s'], ['L3', 15, '15 ns', '15 s'], ['RAM', 100, '100 ns', '1,7 min'],
          ['SSD', 2e4, '20 µs', '5,5 h'], ['Redis', 5e5, '0,5 ms', '6 dana'], ['SQL', 2e6, '2 ms', '23 dana'], ['Region', 8e7, '80 ms', '2,5 god.'], ['Okean', 1.5e8, '150 ms', '4,8 god.']];
        x.view({ dir: [1.5, 7, 14] });
        x.plate({ at: [1.6, 0, 0], w: 24.4, d: 4.4, lpos: 'front', label: lin ? 'Linearno: sve do SSD-a je praktično nula' : 'Logaritamski: svaka jedinica visine je 10× sporija' });
        const cpu = x.box({ at: [-9.2, 0, 0], size: [2, 1, 1.4], color: C.mag, label: 'CPU', side: 'in' });
        const H = v => lin ? Math.max(.04, v / 1.5e8 * 9) : .3 + Math.log10(v) * 1.02;
        const bars = L.map(([n, v, s], i) => {
          const bx = -6.4 + i * 2.2;
          const b = x.bar([bx, 0, 0], H(v), C.sky, { w: 1.2, d: 1.2 });
          x.label(`<b>${n}</b><small>${s}</small>`, [bx, H(v) + .15, 0], { center: [.5, 1] });
          return { b, bx, v };
        });
        x.spawn(async () => {
          let i = 0;
          while (x.alive) {
            const k = i++ % L.length, br = bars[k], [n, v, s, hum] = L[k];
            br.b.paint(C.mag);
            x.say(`**${n}: ${s}.** Kad bi L1 trajao jednu sekundu, ovo bi trajalo **${hum}**.`);
            const o = x.orb(C.mag);
            const t = .35 + .32 * Math.log10(v), a = cpu.port('right', -.2), b = V(br.bx, .35, 1.4);
            const dist = a.distanceTo(b);
            await x.move(o, [a, V(a.x + .3, .35, 1.4), b], dist / (t / 2));
            await x.move(o, [b, V(a.x + .3, .35, 1.4), a], dist / (t / 2));
            x.remove(o);
            cpu.flash(C.ok, .4);
            await x.wait(.6);
            br.b.paint(C.sky);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Cache-aside
  {
    id: 'cache-aside', d: 'caching', sym: 'Ca', title: 'Cache-aside i TTL',
    tags: ['cache aside', 'lazy loading', 'ttl', 'hit', 'miss', 'hit ratio', 'invalidacija', 'write-through', 'write-behind', 'imemorycache', 'output cache'],
    desc: 'Aplikacija prvo pita keš. Ako podatka nema (**miss**), čita iz baze i upisuje ga u keš sa rokom trajanja (**TTL**), pa sledeći zahtev dobija brz odgovor (**hit**).',
    points: [
      'Cache-aside (lazy loading): keš puni aplikacija, i to samo podacima koji se stvarno traže.',
      'TTL ograničava koliko dugo podatak sme da bude zastareo. Kraći TTL je svežiji, ali više zahteva ide u bazu.',
      'Pri izmeni: upiši u bazu, pa **obriši** ključ iz keša (invalidacija). Sledeće čitanje napuni svežu vrednost.',
      'Hit ratio (pogoci podeljeni svim zahtevima) je glavna metrika: 95% znači da baza vidi 5% saobraćaja.',
    ],
    table: {
      title: 'Strategije upisa',
      head: ['Strategija', 'Kako radi', 'Prednost', 'Rizik'],
      rows: [
        ['Cache-aside', 'Aplikacija na miss čita bazu i puni keš', 'Jednostavno; keš drži samo traženo', 'Prvi zahtev je spor; zastarelost do TTL-a'],
        ['Write-through', 'Upis ide kroz keš u bazu, sinhrono', 'Keš je uvek svež', 'Sporiji upis; keš puni i nečitane podatke'],
        ['Write-behind', 'Upis u keš, baza kasnije u pozadini', 'Najbrži upis', 'Gubitak podataka ako keš padne pre upisa'],
        ['Write-around', 'Upis direktno u bazu, keš se ne dira', 'Jednokratni upisi ne zagađuju keš', 'Prvo čitanje posle upisa je miss'],
      ],
    },
    code: [
      cs('C# · IMemoryCache.GetOrCreateAsync', `
public Task<Product?> GetAsync(int id) =>
    _cache.GetOrCreateAsync($"product:{id}", async entry =>
    {
        entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5);   // TTL
        entry.SlidingExpiration = TimeSpan.FromMinutes(1);
        return await _db.Products.FindAsync(id);
    });`),
      cs('C# · Izmena: prvo baza, pa invalidacija', `
public async Task UpdatePriceAsync(int id, decimal price, CancellationToken ct)
{
    await _db.Products.Where(p => p.Id == id)
        .ExecuteUpdateAsync(s => s.SetProperty(p => p.Price, price), ct);

    _cache.Remove($"product:{id}");     // sledeće čitanje puni svežu vrednost
}`),
      cs('C# · Output caching za ceo HTTP odgovor', `
builder.Services.AddOutputCache(o =>
    o.AddPolicy("products", p => p.Expire(TimeSpan.FromSeconds(30)).Tag("products")));

app.UseOutputCache();
app.MapGet("/products/{id}", GetProduct).CacheOutput("products");

// posle izmene:
await outputCache.EvictByTagAsync("products", ct);`),
    ],
    pitfalls: [
      'Keširaj i "ne postoji" (null) sa kratkim TTL-om. Inače zahtevi za nepostojeće ID-jeve uvek idu u bazu.',
      'Isti TTL za hiljade ključeva napunjenih u istom trenutku: svi ističu zajedno (vidi [[stampede]]). Dodaj slučajan pomak.',
      'Keš bez ograničenja veličine (`SizeLimit`) je curenje memorije koje izgleda kao optimizacija.',
    ],
    rel: ['eviction', 'stampede', 'distributed-cache'],
    viz: {
      warm: 5,
      knobs: [{ id: 'ttl', label: 'TTL', min: 2, max: 12, value: 6, fmt: v => v + ' s' }],
      actions: [{ id: 'update', label: 'Izmeni A u bazi', icon: 'hammer' }],
      build(x) {
        const { C, V } = x, ttl = x.p.ttl;
        const sH = x.stat('h', 'Hit', 0, { color: C.ok });
        const sM = x.stat('m', 'Miss', 0, { color: C.wait });
        const sR = x.stat('r', 'Hit ratio', '–');
        x.plate({ at: [.8, 0, .2], w: 22.4, d: 9.4 });
        const cli = x.box({ at: [-9, 0, .2], size: [1.9, .9, 1.2], label: 'Klijent', side: 'in' });
        const app = x.box({ at: [-3.8, 0, .2], size: [2.4, 1, 1.4], label: 'Aplikacija', side: 'in' });
        const cache = x.db({ at: [2, 0, -2.4], r: .85, h: 1, color: C.cache, label: 'Keš' });
        const db = x.db({ at: [2, 0, 2.8], r: 1, h: 1.4, label: 'Baza (spora)' });
        x.rail(cli.port('right'), app.port('left'), { opacity: .3 });
        x.rail(app.port('right'), cache.port('left'), { opacity: .3 });
        x.rail(app.port('right'), db.port('left'), { opacity: .3 });
        const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'], W = [.34, .22, .16, .12, .09, .07];
        const slot = i => V(4.4 + i * 1.15, .25, -2.4);
        KEYS.forEach((kk, i) => x.box({ at: [slot(i).x, 0, -2.4], size: [.95, .03, .95], color: C.edge, nofit: false }));
        const ent = {};
        let hit = 0, miss = 0;
        const ratio = () => sR.set(Math.round(hit / Math.max(1, hit + miss) * 100) + '%');
        x.tick(() => {
          for (const kk of KEYS) {
            const e = ent[kk];
            if (!e) continue;
            const left = e.exp - x.t;
            if (left <= 0) { x.fadeOut(e.m, .3); delete ent[kk]; continue; }
            e.m.lbl.set(`${kk} · ${Math.ceil(left)} s`);
          }
        });
        const pick = () => { let r = x.rnd(); for (let i = 0; i < KEYS.length; i++) { r -= W[i]; if (r <= 0) return i; } return 0; };
        const request = async i => {
          const kk = KEYS[i], col = C.cat[i];
          const o = x.orb(col, { label: kk });
          await x.move(o, [cli.port('right'), app.port('left')], 10);
          await x.move(o, [app.port('right'), cache.port('left')], 10);
          if (ent[kk]) {
            hit++; sH.add(); ratio();
            cache.flash(C.ok, .4); ent[kk].m.material.emissiveIntensity = .9;
            x.wait(.3).then(() => { if (ent[kk]) ent[kk].m.material.emissiveIntensity = .15; });
            await x.move(o, [cache.port('left'), app.port('right'), cli.port('right')], 12);
          } else {
            miss++; sM.add(); ratio();
            cache.flash(C.wait, .5);
            await x.move(o, [cache.port('left'), app.port('right'), db.port('left')], 9);
            db.flash(C.wait, .9);
            await x.wait(.9);
            await x.move(o, [db.port('left'), app.port('right'), cache.port('left')], 9);
            if (!ent[kk]) {
              const m = x.chip(col, { s: .62, at: slot(i), label: `${kk} · ${ttl} s` });
              x.pop(m);
              ent[kk] = { m, exp: x.t + ttl };
            }
            await x.move(o, [cache.port('left'), app.port('right'), cli.port('right')], 12);
          }
          x.remove(o);
        };
        x.every(.85, () => x.spawn(() => request(pick())));
        x.on('update', async () => {
          db.flash(C.mag, 1);
          if (ent.A) { x.fadeOut(ent.A.m, .3); delete ent.A; }
          x.say('A je izmenjen u bazi, a ključ **A je obrisan iz keša**. Sledeći zahtev za A je miss i puni svežu vrednost.');
        });
        x.say(`Popularni ključevi (A, B) skoro uvek su u kešu. Svaki unos živi **${ttl} s** (TTL), pa ističe i sledeći zahtev ide u bazu.`);
      },
    },
  },

  // ------------------------------------------------------------------ Eviction
  {
    id: 'eviction', d: 'caching', sym: 'Ev', title: 'Izbacivanje: LRU i LFU',
    tags: ['eviction', 'lru', 'lfu', 'least recently used', 'least frequently used', 'kapacitet', 'maxmemory-policy', 'thrashing'],
    desc: 'Keš ima ograničen kapacitet. Kad se napuni, nešto mora napolje: **LRU** izbacuje ono što najduže nije korišćeno, a **LFU** ono što je najređe korišćeno.',
    points: [
      'LRU brzo prati promene u tome šta je popularno, ali jedno skeniranje svih ključeva izbaci ceo radni skup.',
      'LFU čuva stalne favorite i otporan je na skeniranje, ali sporo zaboravlja ključeve koji su nekad bili popularni.',
      'Redis ima obe politike (`allkeys-lru`, `allkeys-lfu`) i varijante samo za ključeve sa TTL-om (`volatile-*`).',
      'LRU u O(1): heš mapa plus dvostruko povezana lista. Pri pristupu čvor ide na početak, a izbacuje se sa kraja.',
    ],
    code: [
      cs('C# · LRU keš u O(1)', `
public sealed class LruCache<TKey, TValue>(int capacity) where TKey : notnull
{
    private readonly Dictionary<TKey, LinkedListNode<(TKey Key, TValue Value)>> _map = new();
    private readonly LinkedList<(TKey Key, TValue Value)> _order = new();   // početak = najsvežije

    public bool TryGet(TKey key, out TValue value)
    {
        if (_map.TryGetValue(key, out var node))
        {
            _order.Remove(node);
            _order.AddFirst(node);                 // upravo korišćeno: na početak
            value = node.Value.Value;
            return true;
        }
        value = default!;
        return false;
    }

    public void Put(TKey key, TValue value)
    {
        if (_map.TryGetValue(key, out var old)) _order.Remove(old);
        else if (_map.Count == capacity)
        {
            var lru = _order.Last!;                // najduže nekorišćeno
            _order.RemoveLast();
            _map.Remove(lru.Value.Key);
        }
        _map[key] = _order.AddFirst((key, value));
    }
}`),
      { t: 'Redis · politika izbacivanja', lang: 'bash', src: `
# redis.conf
maxmemory 2gb
maxmemory-policy allkeys-lfu     # ili allkeys-lru, volatile-lru, volatile-ttl` },
      cs('C# · MemoryCache sa ograničenjem veličine', `
var cache = new MemoryCache(new MemoryCacheOptions { SizeLimit = 10_000 });

cache.Set(key, value, new MemoryCacheEntryOptions
{
    Size = 1,                                  // obavezno kad postoji SizeLimit
    Priority = CacheItemPriority.Low           // prvi kandidat za izbacivanje
});`),
    ],
    pitfalls: [
      '`MemoryCache` sa `SizeLimit`: unos bez `Size` baca izuzetak.',
      'Keš manji od radnog skupa stalno izbacuje ono što će odmah opet trebati (thrashing), pa hit ratio pada skoro na nulu.',
    ],
    rel: ['cache-aside', 'hash-table', 'distributed-cache'],
    viz: {
      warm: 4,
      knobs: [
        { id: 'pol', label: 'Politika', value: 'lru', options: [['lru', 'LRU'], ['lfu', 'LFU']] },
        { id: 'cap', label: 'Kapacitet', min: 3, max: 6, value: 4 },
      ],
      actions: [{ id: 'scan', label: 'Skeniraj sve ključeve', icon: 'scissors' }],
      build(x) {
        const { C, V } = x, lfu = x.p.pol === 'lfu', cap = x.p.cap;
        const KEYS = 'ABCDEFGH'.split(''), W = [.32, .2, .14, .1, .07, .07, .05, .05];
        const sR = x.stat('r', 'Hit ratio', '–', { color: C.ok });
        const sE = x.stat('e', 'Izbačeno', 0, { color: C.err });
        const pos = i => V(-2.2 + i * 1.75, 0, 0);
        x.plate({ at: [1, 0, .4], w: 19.4, d: 6.4, label: lfu ? 'Levo = najređe korišćen, prvi za izbacivanje' : 'Levo = najduže nekorišćen, prvi za izbacivanje' });
        for (let i = 0; i < cap; i++) x.box({ at: pos(i), size: [1.5, .03, 1.3], color: C.edge });
        x.label('← sledeći za izbacivanje', [pos(0).x - .7, 0, 2.1], { cls: 'plate', color: C.err, center: [0, 0] });
        const src = x.box({ at: [-8.6, 0, 0], size: [2, .9, 1.2], label: 'Zahtevi', side: 'in' });
        const ents = [];
        let hits = 0, total = 0, tick = 0;
        const sort = () => ents.sort((a, b) => lfu ? (a.f - b.f) || (a.last - b.last) : a.last - b.last);
        const layout = () => {
          sort();
          ents.forEach((e, i) => { e.t = pos(i).add(V(0, .45, 0)); e.n.text(lfu ? `${e.k} ×${e.f}` : e.k); });
        };
        x.tick(dt => { for (const e of ents) if (e.t) e.n.o.position.lerp(e.t, Math.min(1, dt * 7)); });
        const access = async k => {
          const i = KEYS.indexOf(k), col = C.cat[i % C.cat.length];
          const o = x.orb(col, { label: k });
          await x.move(o, [src.port('right'), V(-4.4, .55, 0)], 12);
          total++; tick++;
          const e = ents.find(q => q.k === k);
          if (e) {
            hits++; e.f++; e.last = tick;
            await x.move(o, [o.position.clone(), e.n.port('top', .3)], 12);
            e.n.flash(C.ok, .5);
            x.remove(o);
          } else {
            if (ents.length >= cap) {
              sort();
              const v = ents.shift();
              v.n.flash(C.err, .6);
              sE.add();
              x.say(lfu ? `Miss za **${k}**. Izbačen je **${v.k}**: najmanje puta korišćen (${v.f}).` : `Miss za **${k}**. Izbačen je **${v.k}**: najduže nije korišćen.`);
              x.spawn(async () => { await x.move(v.n, [v.n.o.position.clone(), v.n.o.position.clone().add(V(0, -.2, 2.6))], 6); x.fadeOut(v.n, .3); });
            }
            const n = x.box({ at: [-4.4, 0, 0], size: [1.4, .9, 1.2], color: col, label: k, side: 'in', nofit: true });
            const ne = { k, n, f: 1, last: tick };
            ents.push(ne);
            x.remove(o);
          }
          layout();
          sR.set(Math.round(hits / total * 100) + '%');
        };
        const pick = () => { let r = x.rnd(); for (let i = 0; i < KEYS.length; i++) { r -= W[i]; if (r <= 0) return KEYS[i]; } return 'A'; };
        let scanning = false;
        x.spawn(async () => {
          while (x.alive) {
            if (!scanning) await access(pick());
            await x.wait(.55);
          }
        });
        x.on('scan', async () => {
          if (scanning) return;
          scanning = true;
          x.say(lfu ? 'Skeniranje: svaki ključ jednom. LFU **čuva A i B** jer imaju mnogo pristupa.' : 'Skeniranje: svaki ključ jednom. LRU **izbacuje i A i B**, iako su najpopularniji.');
          for (const k of 'EFGHCD') { await access(k); await x.wait(.25); }
          scanning = false;
        });
        x.say(lfu ? 'Brojač pored ključa je broj pristupa. Izbacuje se onaj sa najmanjim brojem.' : 'Svaki pogodak pomera ključ udesno (najsvežije). Izbacuje se onaj skroz levo.');
      },
    },
  },

  // ------------------------------------------------------------------ Stampede
  {
    id: 'stampede', d: 'caching', sym: 'St', title: 'Cache stampede',
    tags: ['thundering herd', 'dogpile', 'stampede', 'single flight', 'lock', 'hybridcache', 'rano osvežavanje', 'jitter', 'ttl'],
    desc: 'Kad popularan ključ istekne, mnogo zahteva istovremeno dobije miss i svi krenu u bazu po istu vrednost. Baza dobija talas identičnih upita baš kad je keš prazan.',
    points: [
      'Uzrok: mnogo zahteva za isti ključ, istovremeno isticanje i skup upit za ponovno punjenje.',
      '**Single-flight** (lock po ključu): samo prvi zahtev puni keš, a ostali čekaju njegov rezultat.',
      '**Rano osvežavanje**: vrednost se osveži u pozadini pre isteka, pa korisnici nikad ne vide prazan keš.',
      '**Jitter na TTL**: ključevi napunjeni zajedno ne ističu u istoj sekundi.',
      '`HybridCache` u .NET 9 ima ugrađenu zaštitu: paralelni zahtevi za isti ključ čekaju jedno punjenje.',
    ],
    code: [
      cs('C# · HybridCache: jedno punjenje za sve paralelne zahteve', `
builder.Services.AddHybridCache();

public async Task<Product?> GetAsync(int id, CancellationToken ct) =>
    await _cache.GetOrCreateAsync(
        $"product:{id}",
        async token => await _db.Products.FindAsync([id], token),   // izvršava se jednom
        cancellationToken: ct);`),
      cs('C# · Single-flight ručno', `
private readonly ConcurrentDictionary<string, Lazy<Task<Product>>> _inflight = new();

public async Task<Product> LoadOnceAsync(string key, Func<Task<Product>> load)
{
    var lazy = _inflight.GetOrAdd(key, _ => new Lazy<Task<Product>>(load));
    try   { return await lazy.Value; }            // svi čekaju isti Task
    finally { _inflight.TryRemove(key, out _); }
}`),
      cs('C# · TTL sa slučajnim pomakom', `
var ttl = TimeSpan.FromMinutes(10) + TimeSpan.FromSeconds(Random.Shared.Next(0, 120));

await _cache.SetStringAsync(key, json, new DistributedCacheEntryOptions
{
    AbsoluteExpirationRelativeToNow = ttl
});`),
    ],
    pitfalls: [
      'Lock po ključu radi samo unutar jednog procesa: deset instanci i dalje pošalje deset upita. Za strožu zaštitu treba rano osvežavanje ili distribuirani lock.',
      'Restart cele flote sa praznim kešom je stampede za sve ključeve odjednom: zagrej keš ili uvodi instance postepeno.',
    ],
    rel: ['cache-aside', 'distributed-cache', 'retry-dlq'],
    viz: {
      knobs: [{ id: 'mode', label: 'Zaštita', value: 'none', options: [['none', 'Bez zaštite'], ['lock', 'Single-flight'], ['early', 'Rano osvežavanje']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode, TTL = 5;
        const sW = x.stat('w', 'Upita u poslednjem talasu', 0, { color: C.err });
        const sT = x.stat('t', 'Upita ka bazi', 0);
        x.plate({ at: [.2, 0, 0], w: 21.6, d: 11.4 });
        const cache = x.db({ at: [-1, 0, 0], r: 1, h: 1.1, color: C.cache, label: 'Keš: početna strana' });
        const db = x.db({ at: [6.4, 0, 0], r: 1.1, h: 1.5, label: 'Baza' });
        const load = x.bar([9.2, 0, 0], .05, C.ok, { w: .9, d: .9 });
        const loadL = x.label('opterećenje: 0', [9.2, 0, .8], { center: [.5, 0] });
        x.rail(cache.port('right'), db.port('left'), { opacity: .35 });
        const cl = Array.from({ length: 12 }, (_, i) => {
          const a = (i / 11 - .5) * 2.3;
          const b = x.box({ at: [-6.4 - Math.cos(a) * 2.4, 0, Math.sin(a) * 4.6], size: [.9, .6, .7], color: C.box });
          return b;
        });
        let valid = true, exp = TTL, loading = null, inflight = 0, wave = 0, waveMax = 0, refreshing = false;
        const ttlL = x.label('', [-1, 1.95, 0], { cls: 'tag', nofit: true });
        const setLoad = () => {
          load.setH(.05 + inflight * .55);
          load.paint(inflight > 3 ? C.err : inflight > 1 ? C.wait : C.ok);
          loadL.set(`opterećenje: ${inflight}`);
        };
        const fetchDb = async (o) => {
          inflight++; wave++; waveMax = Math.max(waveMax, inflight); sT.add(); setLoad();
          if (o) await x.move(o, [cache.port('right'), db.port('left')], 10);
          db.flash(inflight > 3 ? C.err : C.wait, .8);
          await x.wait(1.3 + inflight * .12);
          inflight--; setLoad();
          if (o) await x.move(o, [db.port('left'), cache.port('right')], 10);
          valid = true; exp = x.t + TTL;
        };
        x.tick(() => {
          if (valid && x.t >= exp) { valid = false; wave = 0; }
          ttlL.set(valid ? `TTL ${(exp - x.t).toFixed(1)} s` : 'isteklo');
          ttlL.el.className = 'lbl lbl-tag ' + (valid ? 'lbl-ok' : 'lbl-err');
          if (!inflight && wave) { sW.set(waveMax); waveMax = 0; wave = 0; }
          if (mode === 'early' && valid && !refreshing && x.t > exp - 1.6) {
            refreshing = true;
            x.spawn(async () => {
              const o = x.orb(C.mag, { r: .2, label: 'osvežavanje' });
              await fetchDb(o);
              x.remove(o);
              refreshing = false;
            });
          }
        });
        const request = async c => {
          const o = x.orb(C.sky, { r: .18, halo: false });
          await x.move(o, [c.port('right'), cache.port('left')], 11);
          if (valid) {
            cache.flash(C.ok, .3);
          } else if (mode === 'lock' && loading) {
            o.material = o.material.clone(); o.material.userData.shared = false; o.material.color.set(C.wait); o.material.emissive.set(C.wait);
            await loading;
          } else {
            cache.flash(C.err, .4);
            if (mode === 'lock') { loading = fetchDb(o); await loading; loading = null; }
            else await fetchDb(o);
          }
          await x.move(o, [o.position.clone(), c.port('right')], 13);
          c.flash(C.ok, .3);
          x.remove(o);
        };
        cl.forEach((c, i) => x.spawn(async () => {
          await x.wait(i * .09);
          while (x.alive) { await request(c); await x.wait(x.range(.5, 1.1)); }
        }));
        x.say({
          none: 'Svakih 5 s ključ istekne i **svi klijenti koji naiđu** odu u bazu po istu vrednost. Prati stub opterećenja.',
          lock: 'Single-flight: prvi zahtev posle isteka ide u bazu, a ostali **čekaju njegov rezultat** (žuto). Baza vidi jedan upit.',
          early: 'Vrednost se **osvežava u pozadini** pre isteka, pa keš nikad nije prazan i nema talasa.',
        }[mode]);
      },
    },
  },

  // ------------------------------------------------------------------ Distribuirani keš
  {
    id: 'distributed-cache', d: 'caching', sym: 'Dc', title: 'Distribuirani keš',
    tags: ['redis', 'idistributedcache', 'hybridcache', 'l1', 'l2', 'zastarelost', 'invalidacija', 'azure cache for redis', 'instance'],
    desc: 'Sa više instanci aplikacije, lokalni keš svake instance se razilazi: posle izmene neke instance vraćaju staru vrednost. **Redis** je jedan zajednički keš za sve, a **HybridCache** kombinuje brz lokalni nivo (L1) sa zajedničkim (L2).',
    points: [
      'Lokalni keš (`IMemoryCache`) je najbrži, ali svaka instanca ima svoju kopiju i svoju zastarelost.',
      'Distribuirani keš (Redis) daje jednu istinu za sve instance, po cenu mrežnog poziva (oko 0,5 ms) i serijalizacije.',
      'Dvonivojski keš: memorija, pa Redis, pa baza. L1 kopije na drugim instancama žive do svog kratkog TTL-a, zato je L1 TTL kratak.',
      'Redis Cluster deli ključeve na 16 384 slota (CRC16 ključa). Azure Cache for Redis to radi umesto tebe.',
    ],
    code: [
      cs('C# · Redis kao IDistributedCache', `
builder.Services.AddStackExchangeRedisCache(o =>
{
    o.Configuration = builder.Configuration.GetConnectionString("Redis");
    o.InstanceName = "shop:";
});

public async Task<Product?> GetAsync(int id, CancellationToken ct)
{
    var json = await _cache.GetStringAsync($"product:{id}", ct);
    if (json is not null) return JsonSerializer.Deserialize<Product>(json);

    var product = await _db.Products.FindAsync([id], ct);
    await _cache.SetStringAsync($"product:{id}", JsonSerializer.Serialize(product),
        new DistributedCacheEntryOptions { AbsoluteExpirationRelativeToNow = TimeSpan.FromMinutes(5) }, ct);
    return product;
}`),
      cs('C# · HybridCache: L1 + L2 i tagovi', `
builder.Services.AddStackExchangeRedisCache(o => o.Configuration = redisConn);   // L2
builder.Services.AddHybridCache(o => o.DefaultEntryOptions = new HybridCacheEntryOptions
{
    Expiration = TimeSpan.FromMinutes(5),            // L2
    LocalCacheExpiration = TimeSpan.FromSeconds(30)  // L1: kratko
});

var product = await _hybrid.GetOrCreateAsync($"product:{id}",
    async token => await _db.Products.FindAsync([id], token),
    tags: ["products"], cancellationToken: ct);

await _hybrid.RemoveByTagAsync("products", ct);       // posle izmene`),
      { t: 'Shell · redis-cli', lang: 'bash', src: `
redis-cli SET product:42 '{"price":120}' EX 300   # vrednost sa TTL-om od 5 minuta
redis-cli TTL product:42                           # preostale sekunde
redis-cli --latency                                # stvarna latencija do servera` },
    ],
    pitfalls: [
      'Lokalni keš na više instanci bez invalidacije: korisnik osvežava stranicu i vidi čas staru, čas novu cenu, zavisno od instance.',
      'Ogromne vrednosti u Redisu (desetine MB) blokiraju jednonitni server i zagušuju mrežu.',
      'Redis kao jedini izvor istine bez perzistencije: restart briše podatke.',
    ],
    rel: ['cache-aside', 'stampede', 'consistent-hashing'],
    viz: {
      warm: 3,
      knobs: [{ id: 'mode', label: 'Keš', value: 'local', options: [['local', 'Samo lokalni'], ['redis', 'Samo Redis'], ['hybrid', 'HybridCache']] }],
      actions: [{ id: 'update', label: 'Promeni cenu (+20)', icon: 'hammer' }],
      build(x) {
        const { C, V } = x, mode = x.p.mode, L1TTL = mode === 'local' ? 40 : 4;
        const sS = x.stat('s', 'Zastarelih odgovora', 0, { color: C.err });
        const sR = mode !== 'local' ? x.stat('r', 'Poziva ka Redisu', 0, { color: C.cache }) : null;
        const sD = x.stat('d', 'Poziva ka bazi', 0, { color: C.sky });
        x.plate({ at: [.8, 0, 0], w: 22.4, d: 10.4 });
        let dbVal = 100, redisVal = 100;
        const db = x.db({ at: [9, 0, 0], r: 1, h: 1.4, label: `Baza: cena ${dbVal}` });
        const redis = mode !== 'local' ? x.db({ at: [3.6, 0, 0], r: .95, h: 1.1, color: C.cache, label: `Redis: ${redisVal}` }) : null;
        if (redis) x.rail(redis.port('right'), db.port('left'), { opacity: .3 });
        const inst = [-3.4, 0, 3.4].map((z, i) => {
          const b = x.box({ at: [-3.6, 0, z], size: [2.4, .9, 1.3], label: `Instanca ${i + 1}`, side: 'in' });
          const it = { b, z, l1: mode !== 'redis' ? { val: 100, exp: L1TTL } : null };
          if (mode !== 'redis') it.c = x.db({ at: [-.8, 0, z], r: .5, h: .7, color: C.cache, label: 'L1: 100' });
          x.rail(b.port('right'), redis ? redis.port('left') : db.port('left'), { opacity: .2 });
          return it;
        });
        const show = () => {
          db.text(`Baza: cena ${dbVal}`);
          if (redis) redis.text(`Redis: ${redisVal ?? '–'}`);
          inst.forEach(it => { if (it.c) it.c.text(`L1: ${it.l1 && it.l1.exp > x.t ? it.l1.val : '–'}`); });
        };
        x.tick(show);
        const request = async it => {
          const o = x.orb(C.white, { r: .18, halo: false });
          await x.move(o, [V(-9.6, .45, it.z), it.b.port('left')], 12);
          let val;
          if (it.l1 && it.l1.exp > x.t) { val = it.l1.val; it.c.flash(C.ok, .3); }
          else if (redis) {
            sR.add();
            await x.move(o, [it.b.port('right'), redis.port('left')], 12);
            if (redisVal == null) {
              sD.add();
              await x.move(o, [redis.port('right'), db.port('left')], 12);
              db.flash(C.wait, .4); await x.wait(.5);
              redisVal = dbVal;
              await x.move(o, [db.port('left'), redis.port('right')], 12);
            }
            val = redisVal; redis.flash(C.ok, .3);
            await x.move(o, [redis.port('left'), it.b.port('right')], 12);
            if (it.l1) it.l1 = { val, exp: x.t + L1TTL };
          } else {
            sD.add();
            await x.move(o, [it.b.port('right'), db.port('left')], 12);
            db.flash(C.wait, .4); await x.wait(.5);
            val = dbVal;
            await x.move(o, [db.port('left'), it.b.port('right')], 12);
            it.l1 = { val, exp: x.t + L1TTL };
          }
          const stale = val !== dbVal;
          if (stale) sS.add();
          x.remove(o);
          const r = x.orb(stale ? C.err : C.ok, { r: .18, halo: false, label: `${val}`, lcls: stale ? 'tag err' : 'tag ok' });
          await x.move(r, [it.b.port('left'), V(-9.6, .45, it.z)], 9);
          x.remove(r);
        };
        inst.forEach((it, i) => x.spawn(async () => { await x.wait(i * .4); while (x.alive) { await request(it); await x.wait(x.range(.4, 1)); } }));
        const update = () => {
          dbVal += 20;
          db.flash(C.mag, 1);
          inst[0].b.flash(C.mag, .8);
          if (redis) redisVal = null;
          if (inst[0].l1) inst[0].l1.exp = 0;
          x.say({
            local: `Cena je sada **${dbVal}**. Instanca 1 je obrisala svoj keš, ali instance 2 i 3 **i dalje vraćaju staru cenu** dok im ne istekne lokalni TTL.`,
            redis: `Cena je sada **${dbVal}** i ključ je obrisan iz Redisa. Sve instance čitaju istu, svežu vrednost, ali svaki zahtev ide preko mreže.`,
            hybrid: `Cena je sada **${dbVal}**. Redis i L1 instance 1 su očišćeni; instance 2 i 3 vraćaju staru cenu još najviše ${L1TTL} s (kratak L1 TTL).`,
          }[mode]);
        };
        x.on('update', update);
        x.every(11, update, 5);
        x.say('Zelena kugla je tačan odgovor, crvena je **zastarela cena**. Cena se menja svakih 11 s.');
      },
    },
  },
];
