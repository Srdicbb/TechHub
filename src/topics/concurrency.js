// Konkurentnost
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Proces i nit
  {
    id: 'threads', d: 'concurrency', sym: 'Nt', title: 'Proces i nit',
    tags: ['thread', 'nit', 'proces', 'stek', 'stack', 'heap', 'deljena memorija', 'foreground', 'background', 'threadlocal', 'asynclocal'],
    desc: 'Proces je program sa svojim adresnim prostorom. Nit je tok izvršavanja unutar procesa: ima svoj stek i registre, a heap i statička polja deli sa svim ostalim nitima tog procesa.',
    points: [
      'Svaka nit ima **svoj stek**: lokalne promenljive i lanac poziva. Objekti na **heap-u** i statička polja su zajednički za sve niti procesa.',
      'Zato je lokalna promenljiva bezbedna sama po sebi, a deljen objekat traži sinhronizaciju čim ga neka nit menja.',
      'Nova nit nije besplatna: kernel objekat, rezervisan stek (obično oko 1 MB) i trošak smenjivanja. Zato postoji ThreadPool.',
      'Foreground nit drži proces živim dok ne završi. Background nit (i sve niti iz pool-a) se prekida kad se proces gasi.',
      'Neuhvaćen izuzetak u bilo kojoj niti (`new Thread`, callback tajmera) ruši ceo proces. Izuzetak u `Task`-u se čuva u task-u i javlja se na `await`.',
    ],
    table: {
      title: 'Proces, nit, Task',
      head: ['', 'Proces', 'Nit', 'Task'],
      rows: [
        ['Šta je', 'Izolovan program u memoriji', 'Tok izvršavanja u procesu', 'Jedinica posla, obećanje rezultata'],
        ['Memorija', 'Svoja', 'Svoj stek, deli heap procesa', 'Nema svoju; izvršava ga nit iz pool-a'],
        ['Cena pravljenja', 'Velika', 'Srednja (stek, kernel objekat)', 'Mala (objekat u redu)'],
        ['Komunikacija', 'IPC, mreža, fajlovi', 'Deljena memorija uz sinhronizaciju', '`await`, rezultat, nastavci'],
      ],
    },
    code: [
      cs('C# · Lokalno je na steku, deljeno je na heap-u', `
var results = new List<int>();       // objekat na heap-u: vide ga obe niti
var gate = new object();

void Work()
{
    int local = 0;                    // na steku ove niti, niko drugi ga ne vidi
    for (int i = 0; i < 1_000; i++) local++;
    lock (gate) results.Add(local);   // deljen objekat: treba lock
}

var t1 = new Thread(Work);
var t2 = new Thread(Work);
t1.Start(); t2.Start();
t1.Join(); t2.Join();`),
      cs('C# · Imenovana background nit', `
var worker = new Thread(ImportLoop)
{
    Name = "import-worker",   // vidi se u debugger-u i u dump-u
    IsBackground = true       // ne drži proces živim pri gašenju
};
worker.Start();`),
      cs('C# · Podaci po niti i po async toku', `
// svaka nit dobija svoju instancu
private static readonly ThreadLocal<StringBuilder> Buffer = new(() => new StringBuilder());

// prati async tok i posle await-a, čak i kad se promeni nit
private static readonly AsyncLocal<string?> CorrelationId = new();`),
    ],
    pitfalls: [
      '`new Thread()` za svaki zahtev: skupo i bez gornje granice. Za kratke poslove koristi ThreadPool (`Task.Run`) ili async.',
      'Statičko polje sa promenljivim stanjem deli se između svih niti, pa i svih HTTP zahteva.',
      '`[ThreadStatic]` ne prati async tok, jer posle `await` kod nastavlja na drugoj niti. Za to je `AsyncLocal<T>`.',
    ],
    rel: ['os-scheduler', 'thread-pool', 'race', 'memory-gc'],
    viz: {
      build(x) {
        const { C, V } = x;
        x.view({ dir: [0, 1.25, 1.5] });
        x.plate({ at: [0, 0, .3], w: 16.6, d: 11, label: 'Proces: jedan adresni prostor' });
        x.plate({ at: [-.6, 0, -2.7], w: 13.8, d: 3.8, color: C.sky, label: 'Heap: zajednički za sve niti' });
        const cache = x.box({ at: [4.5, 0, -2.7], size: [2.6, .5, 1.3], color: 0xffd166, label: 'static cache', side: 'in' });
        const TX = [-4.9, 0, 4.9], TZ = 2.7, COL = [C.cat[0], C.cat[2], C.cat[3]];
        const base = TX.map((tx, i) => x.box({ at: [tx, 0, TZ], size: [2.9, .12, 1.5], color: C.dim, label: `Nit ${i + 1}: radi`, side: 'below', lcls: 'ok' }));
        TX.forEach(tx => x.label('stek', [tx - 1.6, .06, TZ], { cls: 'ghost', center: [1, .5] }));
        const SX = [-6.6, -5.2, -3.8, -2.4, -1, .4, 1.8], SZ = [-3.6, -1.9];
        const slots = SX.flatMap(sx => SZ.map(sz => V(sx, .25, sz))), used = new Set();
        const sF = x.stat('f', 'Okvira na stekovima', 0, { color: C.sky });
        const sO = x.stat('o', 'Objekata na heap-u', 0);
        const sW = x.stat('w', 'Istovremen pristup cache-u', 0, { color: C.wait });
        x.legend([[C.cat[0], 'nit 1'], [C.cat[2], 'nit 2'], [C.cat[3], 'nit 3'], [C.wait, 'deljeno stanje']]);
        const SCRIPTS = [
          [['call', 'Main()'], ['call', 'HandleRequest()'], ['new'], ['call', 'Validate()'], ['ret'], ['touch'], ['ret'], ['ret']],
          [['call', 'Main()'], ['call', 'Import()'], ['new'], ['io'], ['new'], ['touch'], ['ret'], ['ret']],
          [['call', 'Main()'], ['call', 'Report()'], ['new'], ['call', 'Sum()'], ['touch'], ['ret'], ['ret'], ['ret']],
        ];
        let frames = 0, objs = 0, users = 0, warned = false;
        const state = (i, txt, cls) => { base[i].text(`Nit ${i + 1}: ${txt}`); base[i].lbl.el.className = `lbl lbl-${cls}`; };
        TX.forEach((tx, i) => x.spawn(async () => {
          await x.wait(i * .55);
          const stack = [];
          while (x.alive) {
            for (const [op, arg] of SCRIPTS[i]) {
              if (!x.alive) return;
              const top = stack[stack.length - 1];
              if (op === 'call') {
                const k = stack.length;
                const f = x.box({ at: [tx, .12 + k * .54, TZ], size: [2.6, .48, 1.2], color: COL[i], label: arg, side: 'in' });
                x.pop(f);
                stack.push({ f, refs: [] });
                sF.set(++frames);
                await x.wait(.7);
              } else if (op === 'ret') {
                const fr = stack.pop();
                fr.refs.forEach(r => {
                  x.remove(r.line);
                  x.wait(.7).then(() => { used.delete(r.s); sO.set(--objs); x.fadeOut(r.chip); });
                });
                x.remove(fr.f);
                sF.set(--frames);
                await x.wait(.55);
              } else if (op === 'new') {
                const s = [...slots.keys()].find(k => !used.has(k));
                if (s == null) { await x.wait(.5); continue; }
                used.add(s);
                const chip = x.chip(COL[i], { s: .5, at: slots[s] });
                x.pop(chip);
                const line = x.line([top.f.port('back', .2), slots[s]], COL[i], { opacity: .75, nofit: true });
                top.refs.push({ chip, line, s });
                sO.set(++objs);
                await x.wait(.75);
              } else if (op === 'touch') {
                const line = x.line([top.f.port('back', .2), cache.port('front', .1)], COL[i], { opacity: .9, nofit: true });
                users++;
                state(i, 'čita i menja cache', users > 1 ? 'wait' : 'ok');
                if (users > 1) {
                  cache.flash(C.wait, .9); sW.add(1);
                  if (!warned) { warned = true; x.say('Dve niti istovremeno menjaju **isti objekat** na heap-u. Lokalne promenljive na steku su bezbedne same po sebi, ali deljen objekat traži `lock` ili konkurentnu kolekciju.'); }
                } else cache.flash(C.white, .4);
                await x.wait(1.1);
                users--;
                x.remove(line);
                state(i, 'radi', 'ok');
              } else if (op === 'io') {
                state(i, 'čeka I/O (blokirana)', 'wait');
                stack.forEach(fr => fr.f.paint(C.wait));
                await x.wait(1.9);
                stack.forEach(fr => fr.f.reset());
                state(i, 'radi', 'ok');
              }
            }
            await x.wait(.9);
          }
        }));
        x.say('Svaka nit ima **svoj stek**: pozivi metoda se slažu jedan na drugi i nestaju kad metoda vrati. Objekti idu na **zajednički heap**, a linija pokazuje ko na njih pokazuje.');
      },
    },
  },

  // ------------------------------------------------------------------ Race condition
  {
    id: 'race', d: 'concurrency', sym: 'Rc', title: 'Race condition',
    tags: ['trka', 'lost update', 'izgubljen upis', 'interlocked', 'atomic', 'atomično', 'lock', 'count++', 'thread safety'],
    desc: 'Kad dve niti istovremeno rade **čitaj, izmeni, upiši** nad istom promenljivom, jedna pregazi rezultat druge. `count++` nije jedna operacija nego tri.',
    points: [
      '`count++` je čitanje, sabiranje i upis. Između ta tri koraka druga nit može da upiše svoju vrednost.',
      'Ishod zavisi od rasporeda niti, pa se greška javlja retko i nepredvidivo, obično tek pod opterećenjem.',
      '`lock` čini ceo blok nedeljivim za sve niti koje koriste isti lock objekat.',
      '`Interlocked.Increment` radi isto za jednu promenljivu, atomično u procesoru i bez zaključavanja.',
      'Najbolja zaštita je stanje koje se ne deli: nepromenljivi objekti, poruke, lokalne kopije koje se spoje na kraju.',
    ],
    code: [
      cs('C# · Problem', `
int count = 0;

Parallel.For(0, 100_000, _ => count++);   // čitaj, +1, upiši: nije atomično

Console.WriteLine(count);                 // npr. 63 412 umesto 100 000`),
      cs('C# · Tri ispravna rešenja', `
// 1) lock: kritična sekcija za više naredbi
lock (_sync) { _count++; _total += amount; }

// 2) Interlocked: atomično za jednu promenljivu
Interlocked.Increment(ref _count);
Interlocked.Add(ref _total, amount);

// 3) bez deljenog stanja: svaka nit računa svoje, spajanje na kraju
long sum = orders.AsParallel().Sum(o => o.Amount);`),
      cs('C# · Konkurentne kolekcije', `
var hits = new ConcurrentDictionary<string, int>();
hits.AddOrUpdate(url, 1, (_, old) => old + 1);   // bezbedno iz više niti`),
    ],
    pitfalls: [
      '`Dictionary<,>` i `List<>` nisu bezbedni za istovremeni upis. Pucaju retko i čudno: izgubljen element, izuzetak, beskonačna petlja.',
      '`volatile` ne čini `count++` atomičnim. Samo garantuje da se vidi najnovija vrednost.',
      'Provera pa radnja (`if (!dict.ContainsKey(k)) dict.Add(k, v)`) je race čak i kad je svaka metoda zasebno bezbedna.',
    ],
    rel: ['atomic', 'lock', 'thread-safety', 'threads'],
    viz: {
      knobs: [{ id: 'mode', label: 'Zaštita', value: 'none', options: [['none', 'Bez zaštite'], ['lock', 'lock'], ['atomic', 'Interlocked']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode;
        x.view({ dir: [0, 12, 12] });
        const sE = x.stat('e', 'Očekivano', 0);
        const sA = x.stat('a', 'Stvarno', 0, { color: C.sky });
        const sL = x.stat('l', 'Izgubljeno', 0, { color: C.err });
        x.plate({ at: [0, 0, .2], w: 19, d: 8.6, label: 'Deljena memorija' });
        const mem = x.box({ at: [0, 0, -1.9], size: [3.4, 1.2, 1.8], color: C.sky, label: 'count = 0', lcls: 'big', side: 'below' });
        const T = [-6.2, 6.2].map((tx, i) => x.box({ at: [tx, 0, 1.8], size: [2.6, 1, 1.4], label: `Nit ${i + 1}`, side: 'in' }));
        const regs = T.map(t => x.label('registar: –', [t.pos.x, 0, 3.15], { center: [.5, 0], cls: 'v' }));
        T.forEach(t => x.rail(t.port('top'), mem.port('top'), { opacity: .2 }));
        let value = 0, expected = 0;
        const lock = mode === 'lock' ? x.sem(1) : null;
        const tok = lock ? x.token({ at: mem.port('top', .3) }) : null;
        const upd = () => { sE.set(expected); sA.set(value); sL.set(expected - value); mem.text(`count = ${value}`); };
        const worker = async i => {
          const th = T[i], reg = regs[i];
          await x.wait(i * .41);
          while (x.alive) {
            if (lock) {
              th.paint(C.wait); reg.set('čeka lock');
              await lock.acquire();
              th.reset();
              await x.move(tok, [tok.position.clone(), th.port('top', .3)], 12);
            }
            if (mode === 'atomic') {
              const o = x.orb(C.mag, { label: '+1 atomično' });
              reg.set('Interlocked.Increment');
              await x.move(o, [th.port('top', .3), mem.port('top', .3)], 7);
              x.remove(o);
              value++; expected++; mem.flash(C.ok); upd();
            } else {
              const o = x.orb(C.sky, { label: 'čitaj' });
              await x.move(o, [mem.port('top', .3), th.port('top', .3)], 7);
              x.remove(o);
              const r = value;
              reg.set(`pročitala ${r}`);
              await x.wait(x.range(.25, 1));
              reg.set(`${r} + 1 = ${r + 1}`);
              await x.wait(.25);
              const w = x.orb(C.mag, { label: `upiši ${r + 1}` });
              await x.move(w, [th.port('top', .3), mem.port('top', .3)], 7);
              x.remove(w);
              expected++;
              const lost = value !== r;
              value = r + 1;
              upd();
              if (lost) {
                mem.flash(C.err, 1);
                x.say(`**Izgubljen upis**: Nit ${i + 1} je pročitala ${r}, a druga nit je u međuvremenu upisala svoju vrednost. Upis ${r + 1} je pregazio njen rezultat.`);
              } else mem.flash(C.ok);
            }
            if (lock) { await x.move(tok, [tok.position.clone(), mem.port('top', .3)], 12); lock.release(); }
            reg.set('–');
            await x.wait(x.range(.1, .6));
          }
        };
        x.spawn(() => worker(0));
        x.spawn(() => worker(1));
        x.say({
          none: 'Obe niti rade **čitaj, +1, upiši** bez zaštite. Kad se koraci preklope, jedan upis pregazi drugi.',
          lock: 'Sa `lock`-om nit drži token od čitanja do upisa, a druga čeka. Nema izgubljenih upisa, ali niti se smenjuju.',
          atomic: '`Interlocked.Increment` je jedan nedeljiv korak u procesoru: nema prozora između čitanja i upisa.',
        }[mode]);
      },
    },
  },

  // ------------------------------------------------------------------ Semafor
  {
    id: 'semaphore', d: 'concurrency', sym: 'Sm', title: 'Semafor: SemaphoreSlim i Mutex',
    tags: ['semafor', 'semaphore', 'semaphoreslim', 'mutex', 'throttling', 'ograničenje paralelizma', 'waitasync', 'async lock', 'single instance'],
    desc: 'Semafor je kapija sa N tokena: nit uzima token na ulazu i vraća ga na izlazu, pa je unutra najviše N niti. `SemaphoreSlim` je lagan i može da se čeka asinhrono, a `Semaphore` i `Mutex` rade i između procesa.',
    points: [
      'Nit uzima token pri ulasku (`Wait`) i vraća ga pri izlasku (`Release`). Kad tokena nema, čeka.',
      'Tipično: najviše N istovremenih poziva ka API-ju, ograničen broj konekcija, najviše N poslova u obradi.',
      '`WaitAsync` čeka bez blokiranja niti, pa je `SemaphoreSlim(1, 1)` uobičajen async "lock" (unutar `lock` bloka `await` nije dozvoljen).',
      'Semafor nema vlasnika: token može da vrati i druga nit. `Mutex` ima vlasnika i radi između procesa, npr. za jednu instancu aplikacije.',
      '`Release` uvek ide u `finally`. Token koji se ne vrati je zauvek izgubljen i kapija se polako zatvara.',
    ],
    table: {
      title: 'Koji mehanizam',
      head: ['', 'lock / Monitor', 'SemaphoreSlim', 'Mutex, Semaphore'],
      rows: [
        ['Niti unutra', '1', 'N', '1 / N'],
        ['`await` unutra', 'Ne', 'Da, preko `WaitAsync`', 'Ne'],
        ['Između procesa', 'Ne', 'Ne', 'Da (imenovani)'],
        ['Cena', 'Najjeftiniji', 'Jeftin', 'Sistemski poziv, skuplji'],
      ],
    },
    code: [
      cs('C# · Najviše 3 istovremena HTTP poziva', `
var gate = new SemaphoreSlim(3);        // 3 tokena

var tasks = urls.Select(async url =>
{
    await gate.WaitAsync(ct);
    try   { return await http.GetStringAsync(url, ct); }
    finally { gate.Release(); }         // token se vraća i kad pukne
});
string[] pages = await Task.WhenAll(tasks);`),
      cs('C# · Async "lock" sa SemaphoreSlim(1, 1)', `
private readonly SemaphoreSlim _mutex = new(1, 1);

public async Task RefreshTokenAsync(CancellationToken ct)
{
    await _mutex.WaitAsync(ct);
    try   { _token = await _auth.GetTokenAsync(ct); }   // await unutra je u redu
    finally { _mutex.Release(); }
}`),
      cs('C# · Mutex: samo jedna instanca aplikacije', `
using var mutex = new Mutex(initiallyOwned: false, name: @"Global\\MyApp.SingleInstance");
if (!mutex.WaitOne(TimeSpan.Zero))
{
    Console.WriteLine("Aplikacija već radi.");
    return;
}
try   { RunApp(); }
finally { mutex.ReleaseMutex(); }`),
    ],
    pitfalls: [
      '`Release` bez prethodnog `Wait` (ili dvaput) dodaje token: kapija pušta više niti nego što treba.',
      'Sinhroni `Wait()` u async kodu blokira nit. Uz `async` uvek ide `WaitAsync`.',
      'Semafor ograničava broj niti u jednom procesu. Za limit preko više instanci servisa treba distribuirani limit (npr. u Redis-u).',
    ],
    rel: ['lock', 'rate-limiting', 'deadlock', 'thread-safety'],
    viz: {
      warm: 3,
      knobs: [
        { id: 'n', label: 'Tokena (N)', min: 1, max: 5, value: 2 },
        { id: 'leak', label: 'Release', value: 'ok', options: [['ok', 'U finally'], ['leak', 'Ponekad zaboravljen']] },
      ],
      build(x) {
        const { C, V } = x, N = x.p.n, leak = x.p.leak === 'leak';
        const sIn = x.stat('i', 'Unutra', 0, { color: C.ok });
        const sW = x.stat('w', 'Čeka', 0, { color: C.wait });
        const sF = x.stat('f', 'Slobodnih tokena', N, { color: C.token });
        x.plate({ at: [-4.6, 0, 0], w: 9.6, d: 6, label: 'Čekaju na kapiji' });
        x.plate({ at: [5.4, 0, 0], w: 8.4, d: 6, color: C.ok, label: `Kritična sekcija (najviše ${N})` });
        for (const z of [-2.2, 2.2]) x.box({ at: [.4, 0, z], size: [.3, 1.8, .3], color: C.dim });
        x.box({ at: [.4, 1.8, 0], size: [.4, .18, 4.7], color: C.dim, label: N === 1 ? 'lock (1 token)' : `SemaphoreSlim(${N})` });
        const slotZ = i => (i - (N - 1) / 2) * .8;
        const free = Array.from({ length: N }, (_, i) => x.token({ at: [.4, 2.15, slotZ(i)] }));
        const home = new Map(free.map((t, i) => [t, V(.4, 2.15, slotZ(i))]));
        const sem = x.sem(N), line = [];
        const spots = Array.from({ length: 6 }, (_, i) => V(3 + (i % 3) * 2, .4, -1.3 + Math.floor(i / 3) * 2.6));
        const used = new Set();
        const layout = () => { line.forEach((o, i) => { o.userData.t = V(-1 - i * .78, .4, 0); }); sW.set(line.length); };
        x.tick(dt => {
          for (const o of line) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 6));
        });
        let inside = 0, k = 0, leaked = 0;
        x.every(.75, () => x.spawn(async () => {
          const o = x.orb(C.sky, { r: .26, label: `T${++k}` });
          o.position.set(-9.4, .4, 0);
          line.push(o); layout();
          await sem.acquire();
          line.splice(line.indexOf(o), 1); layout();
          const tok = free.shift();
          sF.set(free.length);
          await x.move(tok, [tok.position.clone(), o.position.clone().add(V(0, .55, 0))], 12);
          const follow = x.tick(() => tok.position.copy(o.position).add(V(0, .55, 0)));
          const s = spots.findIndex((_, i) => !used.has(i));
          used.add(s);
          await x.move(o, [o.position.clone(), V(.4, .4, 0), spots[s]], 6);
          inside++; sIn.set(inside);
          await x.wait(x.range(1.4, 2.6));
          inside--; sIn.set(inside);
          used.delete(s);
          if (leak && x.rnd() < .3) {
            follow();
            leaked++;
            x.say(`${o.lbl.el.textContent} je izašla bez \`Release\`: token je **izgubljen** zauvek. U opticaju je ostalo ${N - leaked}.`);
            tok.material = tok.material.clone(); tok.material.userData.shared = false;
            tok.material.color.set(C.err); tok.material.emissive.set(C.err);
            x.fadeOut(tok, .6);
          } else {
            follow();
            await x.move(tok, [tok.position.clone(), home.get(tok)], 10);
            free.push(tok);
            sF.set(free.length);
            sem.release();
          }
          await x.move(o, [o.position.clone(), V(9.6, .4, o.position.z)], 7);
          x.remove(o);
        }));
        x.every(1, () => {
          if (leak && leaked >= N) x.say('Svi tokeni su procureli: **kapija je zatvorena zauvek**, sve niti čekaju. Zato `Release` ide u `finally`.');
        });
        x.say(N === 1 ? 'Sa jednim tokenom ovo je **lock**: unutra je uvek najviše jedna nit, ostale čekaju u redu.' : `Kapija ima **${N} tokena**: unutra je najviše ${N} niti istovremeno, ostale čekaju svoj red.`);
      },
    },
  },

  // ------------------------------------------------------------------ Deadlock
  {
    id: 'deadlock', d: 'concurrency', sym: 'Dl', title: 'Deadlock',
    tags: ['uzajamno blokiranje', 'kružno čekanje', 'coffman', 'lock ordering', 'trylock', 'timeout', 'livelock', '1205'],
    desc: 'Deadlock nastaje kad dve niti drže po jedan resurs i čekaju resurs one druge. Nijedna ne može dalje i bez spoljne intervencije ostaju tako zauvek.',
    points: [
      'Četiri uslova (Coffman): uzajamno isključivanje, držanje uz čekanje, nema oduzimanja, kružno čekanje. Ukloni jedan i deadlock nestaje.',
      'Najjednostavnija odbrana je **isti redosled zaključavanja** svuda: prvo A pa B, nikad obrnuto.',
      'Timeout (`Monitor.TryEnter`, `WaitAsync` sa rokom) prekida čekanje, ali može da pređe u livelock ako se niti stalno povlače u istom trenutku.',
      'Baze rade isto: SQL Server pronalazi kružno čekanje i prekida jednu transakciju (greška 1205), a aplikacija je ponavlja.',
      'Sync over async (`.Result` u kontekstu sa jednom niti) je klasičan .NET deadlock bez ijednog `lock`-a.',
    ],
    code: [
      cs('C# · Suprotan redosled: deadlock', `
void TransferAtoB() { lock (_a) { lock (_b) { Move(_a, _b); } } }
void TransferBtoA() { lock (_b) { lock (_a) { Move(_b, _a); } } }   // obrnut redosled

// TransferAtoB i TransferBtoA paralelno -> obe niti stoje zauvek`),
      cs('C# · Isti redosled, određen ključem', `
void Transfer(Account from, Account to, decimal amount)
{
    var (first, second) = from.Id < to.Id ? (from, to) : (to, from);
    lock (first.Sync)
    lock (second.Sync)
    {
        from.Balance -= amount;
        to.Balance += amount;
    }
}`),
      cs('C# · Timeout i povlačenje', `
bool done = false;
while (!done)
{
    lock (_a)
    {
        if (Monitor.TryEnter(_b, TimeSpan.FromMilliseconds(200)))
        {
            try { Move(_a, _b); done = true; }
            finally { Monitor.Exit(_b); }
        }
    }
    if (!done) Thread.Sleep(Random.Shared.Next(5, 30));   // slučajan razmak protiv livelock-a
}`),
    ],
    pitfalls: [
      'Poziv nepoznatog koda (event, callback, virtuelna metoda) dok držiš lock: taj kod može da traži drugi lock obrnutim redom.',
      'Deadlock se retko vidi u testovima jer traži baš nezgodno preplitanje. Dump procesa (`dotnet-dump`, `clrstack`) pokazuje ko šta čeka.',
    ],
    rel: ['lock', 'semaphore', 'race', 'isolation'],
    viz: {
      knobs: [{ id: 'mode', label: 'Redosled', value: 'bad', options: [['bad', 'Suprotan'], ['order', 'Isti (A pa B)'], ['timeout', 'Timeout']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode;
        x.view({ dir: [0, 13, 10] });
        x.plate({ at: [0, 0, 0], w: 19, d: 10.4 });
        const A = x.box({ at: [0, 0, -3.2], size: [2.4, 1, 1.3], color: C.token, label: 'Lock A', side: 'in' });
        const B = x.box({ at: [0, 0, 3.2], size: [2.4, 1, 1.3], color: C.token, label: 'Lock B', side: 'in' });
        const T1 = x.box({ at: [-6.6, 0, 0], size: [2.6, 1, 1.4], label: 'Nit 1', side: 'in' });
        const T2 = x.box({ at: [6.6, 0, 0], size: [2.6, 1, 1.4], label: 'Nit 2', side: 'in' });
        x.legend([[C.ok, 'drži lock'], [C.wait, 'čeka lock']]);
        const links = new Map();
        const ends = (a, b) => {
          const pa = a.port('center', .1), pb = b.port('center', .1), d = pb.clone().sub(pa).normalize();
          return [pa.clone().addScaledVector(d, 1.3), pb.clone().addScaledVector(d, -1.3)];
        };
        const unlink = (t, l) => { const g = links.get(t.lbl.el.textContent + l.lbl.el.textContent); if (g) { x.remove(g); links.delete(t.lbl.el.textContent + l.lbl.el.textContent); } };
        const link = (t, l, kind) => {
          unlink(t, l);
          const [p, q] = kind === 'hold' ? ends(l, t) : ends(t, l);
          const g = x.arrow(p, q, { color: kind === 'hold' ? C.ok : kind === 'wait' ? C.wait : C.err, opacity: .95, r: .07, head: .5, nofit: true });
          links.set(t.lbl.el.textContent + l.lbl.el.textContent, g);
        };
        const clear = () => { for (const g of links.values()) x.remove(g); links.clear(); [T1, T2].forEach(t => t.reset()); };
        const say = async (s, d = 1.5) => { x.say(s); await x.wait(d); };
        x.spawn(async () => {
          while (x.alive) {
            clear();
            if (mode === 'bad') {
              link(T1, A, 'hold'); await say('Nit 1 zaključava **A**.');
              link(T2, B, 'hold'); await say('Nit 2 zaključava **B**.');
              link(T1, B, 'wait'); T1.paint(C.wait); await say('Nit 1 traži **B**, a njega drži Nit 2. Čeka.');
              link(T2, A, 'wait'); T2.paint(C.wait); await say('Nit 2 traži **A**, a njega drži Nit 1. Čeka.');
              link(T1, B, 'dead'); link(T2, A, 'dead'); T1.paint(C.err); T2.paint(C.err);
              const big = x.label('Deadlock', [0, 1.4, 0], { cls: 'big err', nofit: true });
              await say('**Kružno čekanje**: svaka nit drži ono što drugoj treba. Nijedna nikad neće nastaviti.', 3.4);
              x.remove(big);
            } else if (mode === 'order') {
              link(T1, A, 'hold'); await say('Obe niti zaključavaju istim redom, **prvo A pa B**. Nit 1 uzima A.');
              link(T2, A, 'wait'); T2.paint(C.wait); await say('Nit 2 traži **A** i čeka, ali ne drži ništa, pa ne blokira Nit 1.');
              link(T1, B, 'hold'); T1.paint(C.ok); await say('Nit 1 uzima **B** i završava posao.');
              unlink(T1, A); unlink(T1, B); T1.reset(); T1.flash(C.ok); await say('Nit 1 pušta oba locka.', 1);
              link(T2, A, 'hold'); T2.reset(); await say('Nit 2 dobija **A**...', 1);
              link(T2, B, 'hold'); T2.paint(C.ok); await say('...pa **B**. Gotovo, bez zastoja.');
              clear(); T2.flash(C.ok); await x.wait(1);
            } else {
              link(T1, A, 'hold'); link(T2, B, 'hold'); await say('Nit 1 drži **A**, Nit 2 drži **B**.');
              link(T1, B, 'wait'); link(T2, A, 'wait'); T1.paint(C.wait); T2.paint(C.wait);
              await say('Obe traže drugi lock, ali sa **rokom od 200 ms** (`Monitor.TryEnter`).');
              unlink(T2, A); unlink(T2, B); T2.paint(C.err);
              await say('Niti 2 ističe rok: **pušta B**, čeka slučajno kratko vreme i pokušaće ponovo.');
              unlink(T1, B); link(T1, B, 'hold'); T1.paint(C.ok); T2.reset();
              await say('Nit 1 sada dobija **B** i završava.');
              clear(); T1.flash(C.ok);
              link(T2, B, 'hold'); link(T2, A, 'hold'); T2.paint(C.ok); await say('Nit 2 ponavlja pokušaj i uspeva. Cena: vreme i ponovljen posao.');
              clear(); T2.flash(C.ok); await x.wait(1);
            }
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ async/await
  {
    id: 'async-await', d: 'concurrency', sym: 'Aw', title: 'async/await i niti',
    tags: ['async', 'await', 'task', 'i/o', 'blokiranje', '.result', 'sync over async', 'state machine', 'propusnost'],
    desc: 'Dok čeka bazu ili mrežu, `await` vraća nit u pool, pa ista nit opslužuje druge zahteve. Blokirajuće čekanje (`.Result`) drži nit zauzetom ni zbog čega.',
    points: [
      'Na `await` metoda se prekida i nit se vraća u pool. Nastavak posle I/O-a izvrši bilo koja slobodna nit.',
      'Blokiranje (`.Result`, `.Wait()`, `Thread.Sleep`) drži nit dok čeka. Pod opterećenjem niti nestanu, a CPU stoji.',
      'Async ne ubrzava jedan zahtev, nego povećava broj zahteva koje isti broj niti može da opsluži.',
      'Kompajler od async metode pravi state machine: svaki `await` je tačka gde metoda može da stane i nastavi.',
      'Za CPU posao async ne pomaže; tu treba paralelizam (`Parallel`, `Task.Run`).',
      'U UI aplikacijama `SynchronizationContext` vraća nastavak na UI nit. U bibliotekama `ConfigureAwait(false)` kaže da nastavak može na bilo kojoj niti; ASP.NET Core takav kontekst nema.',
    ],
    table: {
      title: 'Async alati',
      head: ['Potreba', 'Alat'],
      rows: [
        ['više poziva odjednom', '`Task.WhenAll`'],
        ['prvi koji stigne', '`Task.WhenAny`'],
        ['rok za čekanje', '`WaitAsync(TimeSpan)` ili `CancellationTokenSource.CancelAfter`'],
        ['prekid na zahtev', '`CancellationToken`'],
        ['tok rezultata', '`IAsyncEnumerable<T>` i `await foreach`'],
        ['rezultat je često već spreman', '`ValueTask<T>`'],
      ],
    },
    code: [
      cs('C# · Blokira nit (izbegavaj)', `
public IActionResult Get(int id)
{
    var order = _db.Orders.FindAsync(id).AsTask().Result;   // nit stoji dok baza ne odgovori
    return Ok(order);
}`),
      cs('C# · Oslobađa nit dok čeka', `
public async Task<IActionResult> Get(int id, CancellationToken ct)
{
    var order = await _db.Orders.FindAsync([id], ct);      // nit se vraća u pool
    return order is null ? NotFound() : Ok(order);
}`),
      cs('C# · Dva I/O poziva istovremeno', `
var userTask = users.GetAsync(id, ct);
var ordersTask = orders.GetForUserAsync(id, ct);

await Task.WhenAll(userTask, ordersTask);                 // oba poziva su u letu zajedno
return new Profile(userTask.Result, ordersTask.Result);   // ovde su već završeni`),
      cs('C# · Biblioteka i rok za čekanje', `
// biblioteka: nastavak ne mora da se vrati na pozivaočev kontekst (npr. UI nit)
public async Task<Report> BuildAsync(CancellationToken ct)
{
    var data = await _repo.LoadAsync(ct).ConfigureAwait(false);
    return Render(data);
}

// rok od 2 s bez ručnog CancellationTokenSource-a (.NET 6+)
var user = await client.GetUserAsync(id).WaitAsync(TimeSpan.FromSeconds(2), ct);`),
    ],
    pitfalls: [
      '`async void` baca izuzetke koje niko ne može da uhvati (osim u event handler-ima). Koristi `async Task`.',
      'Sync over async u okruženju sa `SynchronizationContext`-om (WPF, WinForms, stari ASP.NET) pravi deadlock.',
      'Zaboravljen `await` (fire and forget) gubi izuzetke i nastavlja da radi posle kraja zahteva.',
    ],
    rel: ['thread-pool', 'concurrency-vs-parallelism', 'channels', 'deadlock'],
    viz: {
      warm: 4,
      knobs: [
        { id: 'mode', label: 'Kod', value: 'sync', options: [['sync', '.Result (blokira)'], ['async', 'await']] },
        { id: 'rate', label: 'Zahteva', min: 1, max: 4, step: .5, value: 2.5, fmt: v => v + '/s' },
      ],
      build(x) {
        const { C, V } = x, asy = x.p.mode === 'async', rate = x.p.rate;
        const sB = x.stat('b', 'Zauzete niti', '0/4');
        const sQ = x.stat('q', 'U redu', 0, { color: C.wait });
        const sIO = asy ? x.stat('io', 'Čeka bazu', 0, { color: C.sky }) : null;
        const sT = x.stat('t', 'Propusnost', '0/s', { color: C.ok });
        x.plate({ at: [.4, 0, 0], w: 23.4, d: 9.4, label: asy ? 'await: nit se vraća u pool dok baza radi' : '.Result: nit stoji dok baza radi' });
        const tb = x.tube([-9.6, .55, 0], [-4.4, .55, 0], { label: 'Zahtevi' });
        const SL = 7, step = (tb.len - .4) / SL, q = [];
        const more = x.label('', tb.a.clone().add(V(.4, .9, 0)), { cls: 'tag wait', nofit: true });
        more.visible = false;
        const layout = () => {
          q.forEach((o, i) => { o.visible = i < SL; o.userData.t = tb.b.clone().add(V(-(i + .5) * step - .2, 0, 0)); });
          more.visible = q.length > SL; more.set('+' + Math.max(0, q.length - SL)); sQ.set(q.length);
        };
        x.tick(dt => { for (const o of q) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 7)); });
        const threads = [0, 1, 2, 3].map(i => {
          const z = (i - 1.5) * 1.9;
          const b = x.box({ at: [-.9, 0, z], size: [2.4, .8, 1.2], label: `Nit ${i + 1}`, side: 'in' });
          b.n = i + 1;
          x.rail(tb.b, b.port('left'), { opacity: .2 });
          return b;
        });
        const db = x.db({ at: [7.6, 0, 0], r: 1.05, h: 1.5, label: 'Baza: 2 s I/O' });
        threads.forEach(t => x.rail(t.port('right'), db.port('left'), { opacity: .18 }));
        const free = [...threads], waiters = [];
        const busy = () => sB.set(`${4 - free.length}/4`);
        const take = () => new Promise(r => { const t = free.shift(); if (t) { busy(); r(t); } else waiters.push(r); });
        const give = t => { const w = waiters.shift(); if (w) w(t); else free.push(t); busy(); };
        const doneAt = [];
        let io = 0, k = 0;
        x.every(.5, () => { const now = x.t; while (doneAt.length && doneAt[0] < now - 5) doneAt.shift(); sT.set((doneAt.length / Math.min(5, Math.max(1, now))).toFixed(1) + '/s'); });
        const request = async o => {
          q.push(o); layout();
          const th = await take();
          q.splice(q.indexOf(o), 1); o.visible = true; o.userData.t = null; layout();
          await x.move(o, [o.position.clone(), tb.b, th.port('left')], 12);
          th.paint(C.ok);
          await x.move(o, [th.port('left'), th.port('right')], 8);
          if (!asy) {
            th.paint(C.wait); th.text(`Nit ${th.n} · čeka`);
            await x.move(o, [th.port('right'), db.port('left')], 9);
            await x.wait(2); db.flash(C.ok, .3);
            await x.move(o, [db.port('left'), th.port('right')], 9);
            th.paint(C.ok); th.text(`Nit ${th.n}`);
            await x.wait(.25);
            th.reset(); give(th);
          } else {
            th.reset(); give(th);
            sIO.set(++io);
            await x.move(o, [th.port('right'), db.port('left').add(V(-.5, 0, x.range(-1.3, 1.3)))], 9);
            await x.wait(2); db.flash(C.ok, .3);
            sIO.set(--io);
            const t2 = await take();
            await x.move(o, [o.position.clone(), t2.port('right')], 11);
            t2.paint(C.ok);
            await x.wait(.25);
            t2.reset(); give(t2);
          }
          doneAt.push(x.t);
          x.fadeOut(o, .25);
        };
        x.every(1 / rate, () => {
          const o = x.orb(C.cat[k++ % C.cat.length], { r: .22 });
          o.position.copy(tb.a);
          x.spawn(() => request(o));
        });
        x.say(asy
          ? 'Sa `await` nit radi samo dok ima CPU posla. Za vreme čekanja baze nit je slobodna i uzima **sledeći zahtev**, pa red ne raste.'
          : 'Sa `.Result` svaka nit **stoji 2 s** dok baza radi (žuto). Četiri niti stignu oko 1,5 zahteva u sekundi; ostalo čeka u redu. Prebaci na `await`.');
      },
    },
  },
];
