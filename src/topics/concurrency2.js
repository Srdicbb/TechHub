import { dec1 as dec, lang } from '../i18n.js';
// Konkurentnost i paralelizam: nove teme (osnove, ThreadPool, sinhronizacija, mapa biblioteka)
const cs = (t, src) => ({ t, lang: 'csharp', src });
const sh = (t, src) => ({ t, lang: 'bash', src });
// srpska množina ima tri oblika; na engleskom je jednina samo za 1, a množina je oblik "few" (prevod ga daje u množini)
const pl = (n, one, few, many) => { if (lang === 'en') return n === 1 ? one : few; const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };

export default [
  // ------------------------------------------------------------------ Konkurentnost i paralelizam
  {
    id: 'concurrency-vs-parallelism', d: 'concurrency', sym: 'Kp', title: 'Konkurentnost i paralelizam',
    tags: ['konkurentnost', 'paralelizam', 'concurrency', 'parallelism', 'multithreading', 'cpu-bound', 'io-bound', 'async', 'time slicing', 'smenjivanje'],
    desc: 'Konkurentnost znači da je više poslova u toku u istom periodu, pa se mogu i smenjivati na jednom jezgru. Paralelizam znači da se više poslova izvršava u istom trenutku, na više jezgara. Paralelizam je jedan oblik konkurentnosti.',
    points: [
      'Konkurentnost je pitanje **strukture**: program je napisan tako da više poslova napreduje nezavisno. Paralelizam je pitanje **izvršavanja**: ti poslovi stvarno rade istovremeno.',
      'Na jednom jezgru konkurentnost postoji kroz smenjivanje (time slicing). Za paralelizam treba više jezgara.',
      'CPU-bound posao (računanje, kompresija, obrada slika) ubrzava se paralelizmom: `Parallel.For`, PLINQ, `Task.Run`.',
      'I/O-bound posao (baza, HTTP, fajlovi) dobija od konkurentnosti bez dodatnih niti: `await` pusti nit dok se čeka.',
      'Multithreading je mehanizam ispod oba: više niti u istom procesu. Asinhroni kod može biti konkurentan i bez dodatnih niti.',
    ],
    table: {
      title: 'Šta koristiti kada',
      head: ['Posao', 'Primer', 'Alat u .NET-u', 'Šta dobijaš'],
      rows: [
        ['CPU-bound, deljiv', 'obrada 10 000 slika', '`Parallel.For`, PLINQ', 'sva jezgra rade'],
        ['I/O-bound', '1 000 HTTP poziva', '`async/await`, `Task.WhenAll`', 'malo niti, mnogo poslova u letu'],
        ['Tok poruka', 'proizvođač i više potrošača', '`Channel<T>`', 'red u memoriji i backpressure'],
        ['Mešovito', 'preuzmi pa obradi', '`Parallel.ForEachAsync` uz limit', 'kontrolisan paralelizam'],
        ['Pozadinski posao', 'slanje mejlova', '`BackgroundService`', 'odvojeno od zahteva'],
      ],
    },
    code: [
      cs('C# · CPU-bound: paralelizam', `
// računanje: svako jezgro uzima svoj deo opsega
int primes = Enumerable.Range(2, 5_000_000)
                       .AsParallel()
                       .Count(IsPrime);`),
      cs('C# · I/O-bound: konkurentnost bez dodatnih niti', `
// 100 HTTP poziva je u letu istovremeno, a nijedna nit ne stoji dok se čeka
var tasks = urls.Select(url => http.GetStringAsync(url, ct));
string[] pages = await Task.WhenAll(tasks);`),
      cs('C# · Isto, ali pogrešno: paralelizam za I/O', `
// svaka nit stoji i čeka mrežu; pool mora da pravi nove niti
var pages = urls.AsParallel()
                .Select(url => http.GetStringAsync(url).Result)
                .ToList();`),
    ],
    pitfalls: [
      '`Parallel.For` ili PLINQ za I/O drži niti blokiranim dok čekaju. Za I/O koristi `async` ili `Parallel.ForEachAsync`.',
      '`async` ne ubrzava računanje. U ASP.NET-u `await Task.Run(...)` samo prebacuje posao na drugu nit iz istog pool-a.',
    ],
    rel: ['os-scheduler', 'thread-pool', 'async-await', 'parallel-for'],
    viz: {
      kind: 'svg',
      knobs: [{ id: 'work', label: 'Posao', value: 'cpu', options: [['cpu', 'CPU (računanje)'], ['io', 'I/O (čekanje)']] }],
      build(x) {
        const IO = x.p.work === 'io';
        const VW = Math.max(300, Math.min(x.W, x.stage.el.parentElement?.clientWidth || x.W)), NAR = VW < 640;
        const DW = NAR ? x.W : Math.max(x.W, 780), DH = x.H * DW / x.W;
        x.svg.setAttribute('viewBox', `0 0 ${DW} ${DH}`);
        const XL = NAR ? (x.W - VW) / 2 + 12 : 16, XR = NAR ? (x.W + VW) / 2 - 12 : DW - 16;
        const L = NAR ? XL + 18 : 238, R = NAR ? 76 : 112, T = NAR ? 46 : 62, B = 48, TM = 16;
        const X = t => L + t / TM * (XR + 16 - L - R);
        const COL = ['#ff5d8f', '#ffd166', '#5ec8ff', '#7ee0b5'];
        const J = [0, 1, 2, 3];
        const job = s => [{ a: s, b: s + .5, k: 'run' }, { a: s + .5, b: s + 3.5, k: 'io' }, { a: s + 3.5, b: s + 4, k: 'run' }];
        const SC = IO ? [
          { t: 'Sekvencijalno', s: '1 nit, blokira dok čeka', lanes: J.map(j => job(j * 4)) },
          { t: 'Konkurentno (async)', s: '1 nit, ne čeka nego radi dalje', lanes: J.map(j => [{ a: j * .5, b: j * .5 + .5, k: 'run' }, { a: j * .5 + .5, b: j * .5 + 3.5, k: 'io' }, { a: 3.5 + j * .5, b: 4 + j * .5, k: 'run' }]) },
          { t: 'Paralelno', s: '4 niti, uglavnom čekaju', lanes: J.map(() => job(0)) },
        ] : [
          { t: 'Sekvencijalno', s: '1 jezgro, jedan za drugim', lanes: J.map(j => [{ a: j * 4, b: j * 4 + 4, k: 'run' }]) },
          {
            t: 'Konkurentno', s: '1 jezgro, OS ih smenjuje',
            lanes: J.map(j => {
              const s = j ? [{ a: 0, b: j, k: 'rdy' }] : [];
              for (let q = 0; q < 4; q++) { const a = q * 4 + j; s.push({ a, b: a + 1, k: 'run' }); if (q < 3) s.push({ a: a + 1, b: a + 4, k: 'rdy' }); }
              return s;
            }),
          },
          { t: 'Paralelno', s: '4 jezgra istovremeno', lanes: J.map(() => [{ a: 0, b: 4, k: 'run' }]) },
        ];
        for (const sc of SC) sc.end = Math.max(...sc.lanes.flat().map(g => g.b));

        // legenda
        let lx = NAR ? XL : L;
        const leg = (draw, text) => { draw(lx); x.txt(lx + 30, 31, text, { class: 'sm mut' }); lx += 30 + text.length * 7 + 26; };
        leg(px => x.el('rect', { x: px, y: 21, width: 22, height: 12, rx: 3, fill: '#d3d8e0' }), 'radi na jezgru');
        if (IO) leg(px => x.el('rect', { x: px, y: 22, width: 22, height: 10, rx: 3, fill: '#d3d8e0', 'fill-opacity': .14, stroke: '#d3d8e0', 'stroke-dasharray': '4 3', 'stroke-width': 1.5 }), 'čeka I/O');
        else leg(px => x.el('line', { x1: px, x2: px + 22, y1: 27, y2: 27, stroke: '#d3d8e0', 'stroke-width': 2, 'stroke-dasharray': '2 4' }), 'čeka na jezgro');
        if (!NAR) x.txt(16, 31, 'Zadaci A, B, C i D', { class: 'hd' });

        const cp = x.el('clipPath', { id: 'kp-clip' }, x.el('defs'));
        const clip = x.el('rect', { x: L - 2, y: 0, width: 0, height: DH }, cp);
        const ph = (DH - T - B) / 3, ends = [];
        SC.forEach((sc, i) => {
          const head = NAR ? 22 : 0, y0 = T + i * ph, lh = Math.max(8, Math.min(20, (ph - 18 - head) / 4 - 4)), ly = j => y0 + head + j * (lh + 4);
          if (i) x.el('line', { x1: XL, x2: XR, y1: y0 - 9, y2: y0 - 9, stroke: '#4b5566', 'stroke-opacity': .4 });
          if (NAR) {
            const tt = x.txt(XL, y0 + 12, '', { class: 'sm' });
            x.el('tspan', { style: 'font-weight:700' }, tt).textContent = sc.t + ': ';
            x.el('tspan', { class: 'mut' }, tt).textContent = sc.s;
          } else {
            x.txt(16, y0 + 15, sc.t, { class: 'hd' });
            x.txt(16, y0 + 35, sc.s, { class: 'sm mut' });
          }
          const g = x.el('g', { 'clip-path': 'url(#kp-clip)' });
          sc.lanes.forEach((segs, j) => {
            const y = ly(j);
            x.txt(L - 12, y + lh / 2 + 5, 'ABCD'[j], { 'text-anchor': 'end', class: 'sm', style: `fill:${COL[j]};font-weight:700` });
            x.el('line', { x1: L, x2: X(TM), y1: y + lh / 2, y2: y + lh / 2, stroke: '#4b5566', 'stroke-opacity': .25 });
            for (const s of segs) {
              const x0 = X(s.a), w = X(s.b) - X(s.a);
              if (s.k === 'run') x.el('rect', { x: x0, y, width: w, height: lh, rx: 3, fill: COL[j] }, g);
              else if (s.k === 'io') x.el('rect', { x: x0 + 1, y: y + 2, width: Math.max(1, w - 2), height: lh - 4, rx: 3, fill: COL[j], 'fill-opacity': .14, stroke: COL[j], 'stroke-dasharray': '4 3', 'stroke-width': 1.5 }, g);
              else x.el('line', { x1: x0 + 3, x2: x0 + w - 3, y1: y + lh / 2, y2: y + lh / 2, stroke: COL[j], 'stroke-width': 2, 'stroke-dasharray': '2 4' }, g);
            }
          });
          ends.push([sc.end, x.txt(X(sc.end) + 12, ly(1.5) + lh / 2 + 6, `${dec(sc.end)} jed.`, { class: 'hd', opacity: 0 })]);
        });
        const ay = DH - B + 10;
        x.el('line', { x1: L, x2: X(TM), y1: ay, y2: ay, stroke: '#aab2c0', 'stroke-width': 1.5 });
        for (const t of [0, 4, 8, 12, 16]) {
          x.el('line', { x1: X(t), x2: X(t), y1: ay, y2: ay + 6, stroke: '#aab2c0' });
          x.txt(X(t), ay + 23, String(t), { 'text-anchor': 'middle', class: 'sm mut' });
        }
        if (!NAR) x.txt(16, ay + 23, 'vreme, u jedinicama →', { class: 'sm mut' });
        const cur = x.el('line', { y1: T - 12, y2: ay, stroke: '#ffffff', 'stroke-opacity': .6, 'stroke-dasharray': '4 5' });
        const draw = t => {
          const xx = X(t);
          cur.setAttribute('x1', xx); cur.setAttribute('x2', xx);
          clip.setAttribute('width', Math.max(0, xx - L + 2));
          for (const [e, el] of ends) el.setAttribute('opacity', t >= e - 1e-6 ? 1 : 0);
        };
        draw(0);
        x.spawn(async () => {
          while (x.alive) {
            x.say(IO
              ? 'Četiri zadatka koja uglavnom **čekaju I/O** (baza, HTTP): kratak rad na procesoru, dugo čekanje, pa opet kratak rad.'
              : 'Četiri zadatka sa po **4 jedinice rada na procesoru**, izvršena na tri načina. Prati kada se koji završava.');
            await x.tween(10, k => draw(k * TM), x.ease.lin);
            x.say(IO
              ? 'Sekvencijalno traje 16 jer nit stoji dok čeka. **Async na jednoj niti** završava za 5,5: dok jedan zadatak čeka, nit pokreće sledeći. Paralelno sa 4 niti traje 4, ali te niti uglavnom samo čekaju.'
              : 'Sekvencijalno i konkurentno na jednom jezgru traju isto, 16. Smenjivanje daje utisak da svi napreduju zajedno, ali jezgro je jedno. Tek **paralelno**, na 4 jezgra, posao traje 4.');
            await x.wait(6);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Procesor, jezgra i keš
  {
    id: 'cpu-cores', d: 'concurrency', sym: 'Jz', title: 'Procesor, jezgra i keš',
    tags: ['procesor', 'cpu', 'jezgro', 'core', 'hyper-threading', 'smt', 'cache line', 'keš procesora', 'l1', 'l2', 'l3', 'false sharing', 'mesi', 'processorcount'],
    desc: 'Jezgro izvršava jednu nit u datom trenutku (uz hyper-threading dve). Podaci putuju iz RAM-a kroz keš L3, L2 i L1 u blokovima od 64 bajta, i to često više određuje brzinu konkurentnog koda nego sam algoritam.',
    points: [
      '`Environment.ProcessorCount` vraća broj **logičkih** jezgara: uz hyper-threading (SMT) jedno fizičko jezgro izgleda kao dva. U kontejneru vraća CPU limit.',
      'Svako jezgro ima svoj L1 i L2 keš, a L3 je zajednički. Pristup L1 traje oko 1 ns, RAM-u oko 100 ns. Više o tome u [[latency]].',
      'Keš radi sa blokovima od 64 bajta (**cache line**). Kad jedno jezgro upiše u liniju, kopije te linije u drugim jezgrima postaju nevažeće.',
      '**False sharing**: dve niti pišu u različite promenljive koje leže u istoj liniji, pa se linija stalno seli između jezgara. Kod je ispravan, ali višestruko sporiji.',
      'Više niti od jezgara ne ubrzava CPU posao: niti se smenjuju, a svako smenjivanje i hladan keš koštaju.',
    ],
    code: [
      cs('C# · Koliko jezgara vidi proces', `
Console.WriteLine(Environment.ProcessorCount);   // logička jezgra
// u kontejneru sa limits.cpu: "2" ovde dobijaš 2, a ne broj jezgara mašine
// DOTNET_PROCESSOR_COUNT=4 menja vrednost koju runtime vidi`),
      cs('C# · False sharing i rešenje', `
// Sporo: brojači su jedan do drugog, u istoj cache liniji
long[] counters = new long[4];
Parallel.For(0, 4, i =>
{
    for (int k = 0; k < 50_000_000; k++) counters[i]++;   // svaka nit svoj element, ali ista linija
});

// Brže: svaki brojač u svojoj liniji
[StructLayout(LayoutKind.Explicit, Size = 128)]
struct Padded { [FieldOffset(64)] public long Value; }

var padded = new Padded[4];
Parallel.For(0, 4, i =>
{
    for (int k = 0; k < 50_000_000; k++) padded[i].Value++;
});`),
      cs('C# · Najbolje: lokalna promenljiva i jedan upis na kraju', `
long[] results = new long[4];
Parallel.For(0, 4, i =>
{
    long local = 0;                                       // živi u registru, ništa se ne deli
    for (int k = 0; k < 50_000_000; k++) local++;
    results[i] = local;                                   // jedan upis
});`),
    ],
    pitfalls: [
      'Niz brojača po niti (`counts[threadIndex]++`) je klasičan false sharing.',
      '`MaxDegreeOfParallelism` veći od broja jezgara za CPU posao samo dodaje smenjivanje.',
      'Merenje na laptopu sa 16 jezgara ne govori ništa o podu sa limitom od 2 jezgra.',
    ],
    rel: ['latency', 'os-scheduler', 'parallel-for', 'atomic'],
    viz: {
      knobs: [{ id: 'layout', label: 'Raspored', value: 'shared', options: [['shared', 'x i y u istoj liniji'], ['padded', 'svaka u svojoj liniji']] }],
      build(x) {
        const { C, V, THREE } = x, PAD = x.p.layout === 'padded';
        x.view({ dir: [0, 1.3, 1.45] });
        x.plate({ at: [0, 0, 1], w: 17.4, d: 9.4, label: 'Procesor: 4 jezgra', lpos: 'front' });
        const CX = [-6, -2, 2, 6], USE = [0, 3];
        CX.forEach((cx, i) => x.box({ at: [cx, 0, -1.4], size: [3, .8, 1.9], color: USE.includes(i) ? C.box : 0x8a93a3, label: `Jezgro ${i}`, side: 'in' }));
        const l1 = CX.map(cx => x.box({ at: [cx, 0, 1.2], size: [3, .22, 1.4], color: 0x4f74b3 }));
        CX.forEach(cx => x.label('L1 i L2', [cx, 0, 1.95], { cls: 'ghost', center: [.5, 0] }));
        x.box({ at: [0, 0, 4.3], size: [15.6, .22, 1.2], color: 0x3a4a66, label: 'L3: zajednički keš', side: 'in' });
        x.db({ at: [11.6, 0, 4.3], r: 1.05, h: 1.1, label: 'RAM', side: 'below' });
        x.rail([7.9, .12, 4.3], [10.5, .12, 4.3], { opacity: .35 });
        const name = k => (k ? 'T1: y++' : 'T0: x++');
        const th = USE.map((ci, k) => x.orb(k ? C.sky : C.mag, { r: .3, at: [CX[ci], 1.3, -1.4], label: name(k), lcls: k ? 'tag' : 'tag mag' }));
        const GRAY = 0x5d6678;
        const mkLine = (cells, title) => {
          const g = x.group();
          g.cells = cells.map((c, i) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(.3, .16, .52), new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .25, roughness: .5 }));
            m.position.set((i - 3.5) * .34, 0, 0);
            m.castShadow = true;
            g.add(m);
            return m;
          });
          g.lbl = x.label(title, [0, .22, 0], { parent: g, cls: 'tag', center: [.5, 1] });
          return g;
        };
        const sW = x.stat('w', 'Upisa', 0, { color: C.ok });
        const sM = x.stat('m', 'Seljenja linije', 0, { color: C.err });
        x.legend([[C.mag, 'x, piše T0'], [C.sky, 'y, piše T1'], [C.err, 'nevažeća kopija']]);
        const nW = [0, 0];
        const wrote = (k, line, cell) => {
          x.flash(line.cells[cell].material, C.white, .3);
          l1[USE[k]].flash(C.ok, .25);
          nW[k]++; sW.add(1);
          th[k].lbl.set(`${name(k)} &nbsp;${nW[k]}`);
        };
        const at = ci => V(CX[ci], .42, 1.2);
        if (PAD) {
          const lines = [mkLine([C.mag, ...Array(7).fill(GRAY)], 'linija A: x'), mkLine([C.sky, ...Array(7).fill(GRAY)], 'linija B: y')];
          lines.forEach((g, k) => g.position.copy(at(USE[k])));
          [0, 1].forEach(k => x.spawn(async () => {
            await x.wait(.8 + k * .11);
            while (x.alive) { wrote(k, lines[k], 0); await x.wait(.22); }
          }));
          x.say('Sa razmakom (padding) x i y su u **različitim linijama**. Svako jezgro drži svoju liniju u L1 i piše bez čekanja. Isti kod radi višestruko više upisa.');
        } else {
          const line = mkLine([C.mag, C.sky, ...Array(6).fill(GRAY)], '64 B: x i y');
          let owner = 0;
          line.position.copy(at(USE[0]));
          const own = x.sem(1);
          [0, 1].forEach(k => x.spawn(async () => {
            await x.wait(.8 + k * .2);
            while (x.alive) {
              await own.acquire();
              if (owner !== k) {
                const from = USE[owner], to = USE[k];
                l1[from].flash(C.err, .8);
                sM.add(1);
                await x.move(line, [at(from), V(CX[from], .42, 4.3), V(CX[to], .42, 4.3), at(to)], 16);
                owner = k;
              }
              wrote(k, line, k);
              await x.wait(.22);
              own.release();
              await x.wait(.02);
            }
          }));
          x.say('x i y su **različite promenljive** u istoj cache liniji od 64 bajta. Pre svakog upisa jezgro mora da preuzme celu liniju, a kopija u drugom jezgru postaje nevažeća (crveno). Linija se seli tamo-amo: to je **false sharing**.');
        }
      },
    },
  },

  // ------------------------------------------------------------------ OS scheduler
  {
    id: 'os-scheduler', d: 'concurrency', sym: 'Os', title: 'OS scheduler i context switch',
    tags: ['scheduler', 'raspoređivač', 'context switch', 'quantum', 'time slice', 'odsečak', 'preemption', 'run queue', 'stanja niti', 'blokirana nit', 'thread.yield'],
    desc: 'Operativni sistem odlučuje koja nit radi na kom jezgru. Nit dobija kratak odsečak vremena (quantum), pa je scheduler prekida i pušta sledeću spremnu. Nit koja čeka I/O ili lock uopšte ne troši jezgro.',
    points: [
      'Nit je u jednom od tri glavna stanja: **radi** (na jezgru), **spremna** (čeka slobodno jezgro) ili **blokirana** (čeka I/O, lock, `Sleep`).',
      'Scheduler je preemptivan: kad istekne odsečak ili se pojavi nit višeg prioriteta, trenutna nit se prekida bez pitanja.',
      '**Context switch**: sačuvaj registre jedne niti, učitaj drugu. Traje mikrosekunde, ali posle njega je keš hladan.',
      'CLR ne raspoređuje niti po jezgrima, to radi OS. .NET odlučuje samo koliko niti postoji (ThreadPool) i šta one rade.',
      'Više spremnih niti nego jezgara znači čekanje u redu: CPU posao se ne ubrzava, samo se češće smenjuje.',
    ],
    table: {
      title: 'Stanja niti',
      head: ['Stanje', 'Šta znači', 'Primer u .NET-u'],
      rows: [
        ['Radi', 'izvršava se na jezgru', 'petlja koja računa'],
        ['Spremna', 'čeka slobodno jezgro', 'nit kojoj je istekao odsečak'],
        ['Blokirana', 'čeka događaj, ne troši CPU', '`Thread.Sleep`, zauzet `lock`, sinhroni I/O'],
        ['Završena', 'metoda niti je izašla', 'posle `Join`'],
      ],
      note: '`await` ne blokira nit: metoda se prekida, a nit se vraća u pool i radi drugi posao dok se čeka.',
    },
    code: [
      cs('C# · Stanja niti', `
var t = new Thread(() => Thread.Sleep(500));
Console.WriteLine(t.ThreadState);   // Unstarted

t.Start();
Thread.Sleep(50);
Console.WriteLine(t.ThreadState);   // WaitSleepJoin: blokirana, ne troši CPU

t.Join();
Console.WriteLine(t.ThreadState);   // Stopped`),
      cs('C# · Prepuštanje jezgra (retko potrebno)', `
Thread.Yield();     // prepusti ostatak odsečka drugoj spremnoj niti na istom jezgru
Thread.Sleep(0);    // prepusti nekoj spremnoj niti istog prioriteta

// SpinWait: kratko vrtenje umesto blokiranja, za čekanja od par mikrosekundi
var spin = new SpinWait();
while (!_ready) spin.SpinOnce();   // posle nekoliko krugova sam prelazi na Yield i Sleep`),
      sh('Shell · Koliko se niti smenjuje', `
# Linux: dobrovoljna (cswch/s) i prinudna (nvcswch/s) smenjivanja procesa po sekundi
pidstat -w -p $(pgrep -f MyApi) 1

# Windows: Performance Monitor, brojač System\\Context Switches/sec`),
    ],
    pitfalls: [
      'Busy-wait petlja (`while (!done) { }`) drži celo jezgro dok čeka.',
      '`Thread.Sleep` za čekanje na nešto (polling) drži nit. Koristi događaj, `await Task.Delay` ili `PeriodicTimer`.',
      'Visok prioritet niti (`ThreadPriority.Highest`) može da izgladni ostale niti i skoro nikad nije rešenje.',
    ],
    rel: ['threads', 'thread-pool', 'cpu-cores', 'concurrency-vs-parallelism', 'ei-firmware'],
    viz: {
      knobs: [
        { id: 'cores', label: 'Jezgara', value: 2, options: [[1, '1'], [2, '2'], [4, '4']] },
        { id: 'threads', label: 'Niti', value: 5, options: [[3, '3'], [5, '5'], [7, '7']] },
        { id: 'work', label: 'Posao', value: 'mix', options: [['cpu', 'samo CPU'], ['mix', 'CPU i I/O']] },
      ],
      build(x) {
        const { C, V } = x, NC = x.p.cores, NT = x.p.threads, MIX = x.p.work === 'mix', Q = 1.6;
        x.view({ dir: [0, 1.35, 1.2] });
        x.plate({ at: [-6.7, 0, -1.3], w: 8.8, d: 3.2, label: 'Spremne niti (run queue)' });
        const tb = x.tube([-10.5, .5, -1.1], [-3.4, .5, -1.1], { r: .46 });
        x.plate({ at: [-6.7, 0, 3.3], w: 8.8, d: 3.6, color: C.wait, label: 'Blokirane: čekaju I/O, lock, Sleep' });
        const span = Math.max(4.6, NC * 2.3 + 1.4);
        x.plate({ at: [3.9, 0, 1], w: 7.6, d: span, color: C.ok, label: 'Procesor' });
        const cz = i => 1 + (i - (NC - 1) / 2) * 2.3;
        const cores = Array.from({ length: NC }, (_, i) => {
          const z = cz(i);
          const box = x.box({ at: [2.7, 0, z], size: [2.8, .7, 1.6], label: `Jezgro ${i + 1}`, side: 'left' });
          x.box({ at: [5.5, 0, z], size: [.56, .06, .56], color: C.dim });
          const bar = x.bar([5.5, .06, z], .001, C.mag, { w: .36, d: .36 });
          return { box, bar, z, th: null };
        });
        x.label('odsečak', [5.5, 0, cores[NC - 1].z + .45], { cls: 'ghost', center: [.5, 0] });
        const sS = x.stat('s', 'Context switch', 0, { color: C.mag });
        const sR = x.stat('r', 'Spremne', 0, { color: C.wait });
        const sB = MIX ? x.stat('b', 'Blokirane', 0, { color: C.wait }) : null;
        const sU = x.stat('u', 'Jezgra zauzeta', '–', { color: C.ok });
        const rq = x.chan(), SL = 7, step = (tb.len - .5) / SL;
        const slot = i => tb.b.clone().add(V(-(i + .5) * step - .1, 0, 0));
        const layoutQ = () => { rq.items.forEach((t, i) => { t.o.userData.t = slot(Math.min(i, SL - 1)); }); sR.set(rq.size); };
        x.tick(dt => { for (const t of rq.items) if (t.o.userData.t) t.o.position.lerp(t.o.userData.t, Math.min(1, dt * 7)); });
        const spots = [-9.6, -7.6, -5.6, -3.8].flatMap(sx => [V(sx, .45, 2.8), V(sx, .45, 4.1)]), used = new Set();
        const threads = Array.from({ length: NT }, (_, i) => ({ n: i + 1, io: MIX && i % 2 === 1, o: x.orb(C.cat[i % C.cat.length], { r: .27, label: `T${i + 1}` }) }));
        threads.forEach((t, i) => { t.o.position.copy(slot(Math.min(i, SL - 1))); rq.push(t); });
        layoutQ();
        let busy = 0, tot = 0, blocked = 0, saidQ = false, saidB = false;
        x.tick(dt => { tot += dt * NC; busy += dt * cores.filter(c => c.th).length; });
        x.every(.5, () => sU.set(tot > .5 ? Math.round(busy / tot * 100) + ' %' : '–'));
        const toQueue = async t => {
          await x.move(t.o, [t.o.position.clone(), V(t.o.position.x - .6, 1.9, t.o.position.z), V(tb.a.x - .4, 1.9, tb.a.z), tb.a.clone()], 15);
          rq.push(t); layoutQ();
        };
        const block = async t => {
          const i = [...spots.keys()].find(k => !used.has(k));
          used.add(i);
          blocked++; sB?.set(blocked);
          t.o.lbl.el.className = 'lbl lbl-tag lbl-wait';
          await x.move(t.o, [t.o.position.clone(), V(t.o.position.x, 1.6, spots[i].z), spots[i]], 13);
          await x.wait(x.range(1.8, 3.2));
          used.delete(i);
          blocked--; sB?.set(blocked);
          t.o.lbl.el.className = 'lbl lbl-tag';
          await toQueue(t);
        };
        cores.forEach(c => x.spawn(async () => {
          while (x.alive) {
            const t = await rq.take();
            layoutQ();
            c.th = t; t.o.userData.t = null;
            sS.add(1); c.box.flash(C.mag, .45);
            await x.move(t.o, [t.o.position.clone(), V(-1.4, 1.2, c.z), V(2.7, 1.15, c.z)], 20);
            let more = true;
            while (more && x.alive) {
              const run = t.io ? .55 : Q;
              await x.tween(run, k => c.bar.setH(Math.max(.001, k * 1.5 * run / Q)), x.ease.lin);
              more = !t.io && rq.size === 0;   // niko ne čeka: nit nastavlja bez smenjivanja
            }
            c.bar.setH(.001); c.th = null;
            if (t.io) {
              if (!saidB) { saidB = true; x.say(`**T${t.n}** čeka I/O: prelazi u blokirane i ne troši jezgro, pa jezgro odmah dobija sledeću spremnu nit. Kad I/O stigne, T${t.n} se vraća u red.`); }
              x.spawn(() => block(t));
            } else {
              if (!saidQ) { saidQ = true; x.say(`**T${t.n}** je potrošila svoj odsečak: scheduler je vraća na kraj reda, a jezgro dobija sledeću spremnu nit. To je **context switch**.`); }
              x.spawn(() => toQueue(t));
            }
          }
        }));
        x.say(MIX
          ? `${NT} niti, ${NC} ${pl(NC, 'jezgro', 'jezgra', 'jezgara')}. Neparne niti stalno računaju, a parne kratko rade pa čekaju I/O (žuto).`
          : `${NT} niti, ${NC} ${pl(NC, 'jezgro', 'jezgra', 'jezgara')}, sve stalno računaju. U svakom trenutku radi najviše ${NC}, ostale čekaju u redu i smenjuju se kad istekne odsečak.`);
      },
    },
  },

  // ------------------------------------------------------------------ ThreadPool
  {
    id: 'thread-pool', d: 'concurrency', sym: 'Tp', title: 'ThreadPool: od Task.Run do jezgra',
    tags: ['threadpool', 'thread pool', 'task.run', 'work stealing', 'lokalni red', 'globalni red', 'hill climbing', 'starvation', 'longrunning', 'taskscheduler', 'setminthreads'],
    desc: '`Task.Run` ne pravi nit. Stavlja posao u red ThreadPool-a, odakle ga uzima jedna od niti koje pool drži spremne, a OS tu nit raspoređuje na jezgro. Pool pazi da niti ne bude ni premalo ni previše.',
    points: [
      'Put posla: `Task.Run` → red ThreadPool-a → slobodna nit iz pool-a → OS scheduler → jezgro.',
      'Pool ima **globalni red** i **lokalni red za svaku nit**. Task pokrenut iz niti pool-a ide u njen lokalni red, a nit bez posla krade iz tuđeg (work stealing).',
      'Do minimuma (podrazumevano broj jezgara) niti se prave odmah. Preko toga pool dodaje niti postepeno i meri da li to povećava protok (hill climbing).',
      'Blokiranje niti iz pool-a (`.Result`, `.Wait()`, sinhroni I/O) izaziva **thread starvation**: red raste, nove niti stižu sporo, a CPU stoji.',
      'Sa `await` posao napušta nit dok čeka I/O, a nastavak kasnije preuzima bilo koja slobodna nit. Zato isti pool opslužuje mnogo više zahteva.',
    ],
    figs: [{
      cap: 'Put posla: `Task.Run` stavlja delegat u red, slobodna nit iz pool-a ga preuzima, a operativni sistem tu nit raspoređuje na jezgro. .NET odlučuje koliko niti postoji, a OS kada koja radi.',
      draw(W, H) {
        const S = [['Task.Run(posao)', 'tvoj kod'], ['Red ThreadPool-a', 'globalni i lokalni'], ['Nit iz pool-a', 'radnik u .NET-u'], ['OS scheduler', 'bira ko radi'], ['Jezgro CPU-a', 'izvršava']];
        const LAY = ['aplikacija', '.NET runtime', '.NET runtime', 'operativni sistem', 'hardver'];
        const n = S.length;
        let g = '';
        const box = (bx, by, bw, bh, i) => {
          const hot = i === 0 || i === n - 1;
          g += `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="10" fill="${hot ? '#e0115f' : 'currentColor'}" fill-opacity="${hot ? .12 : .06}" stroke="${hot ? '#e0115f' : 'currentColor'}" stroke-opacity="${hot ? .8 : .3}" stroke-width="1.5"/>`;
        };
        if (W < 640) {
          const bh = 40, gap = (H - 16 - n * bh) / (n - 1), bw = W - 32;
          S.forEach(([a, b], i) => {
            const by = 8 + i * (bh + gap);
            box(16, by, bw, bh, i);
            g += `<text x="30" y="${by + 25}" style="fill:var(--ink);font-weight:700">${a}</text><text x="${16 + bw - 14}" y="${by + 25}" text-anchor="end">${b}</text>`;
            if (i < n - 1) g += `<path d="M${W / 2 - 6} ${by + bh + 4} L${W / 2 + 6} ${by + bh + 4} L${W / 2} ${by + bh + gap - 4} Z" fill="currentColor" fill-opacity=".55"/>`;
          });
          return g;
        }
        const gap = 30, bw = (W - 32 - (n - 1) * gap) / n, bh = 76, by = H / 2 - bh / 2 - 14;
        S.forEach(([a, b], i) => {
          const bx = 16 + i * (bw + gap);
          box(bx, by, bw, bh, i);
          g += `<text x="${bx + bw / 2}" y="${by + 32}" text-anchor="middle" style="fill:var(--ink);font-weight:700">${a}</text><text x="${bx + bw / 2}" y="${by + 54}" text-anchor="middle">${b}</text>`;
          if (i < n - 1) { const ax = bx + bw + 5; g += `<path d="M${ax} ${by + bh / 2 - 7} L${ax + gap - 10} ${by + bh / 2} L${ax} ${by + bh / 2 + 7} Z" fill="currentColor" fill-opacity=".55"/>`; }
        });
        let i = 0;
        while (i < n) {
          let j = i;
          while (j + 1 < n && LAY[j + 1] === LAY[i]) j++;
          const x0 = 16 + i * (bw + gap) + 6, x1 = 16 + j * (bw + gap) + bw - 6, yy = by + bh + 18;
          g += `<path d="M${x0} ${yy - 6} V${yy} H${x1} V${yy - 6}" fill="none" stroke="currentColor" stroke-opacity=".35"/><text x="${(x0 + x1) / 2}" y="${yy + 20}" text-anchor="middle">${LAY[i]}</text>`;
          i = j + 1;
        }
        return g;
      },
    }],
    table: {
      title: 'Kako pokrenuti posao',
      head: ['Način', 'Gde se izvršava', 'Kada'],
      rows: [
        ['`await` I/O metode', 'nigde dok čeka; nastavak na niti iz pool-a', 'baza, HTTP, fajlovi'],
        ['`Task.Run(...)`', 'nit iz pool-a', 'kratak CPU posao van UI niti'],
        ['`Parallel.For`, PLINQ', 'više niti iz pool-a', 'CPU posao nad kolekcijom'],
        ['`Task.Factory.StartNew(..., LongRunning)`', 'zasebna nit', 'beskonačna petlja, slušanje reda'],
        ['`new Thread(...)`', 'zasebna nit pod tvojom kontrolom', 'retko: prioritet, STA, veličina steka'],
      ],
      note: '`TaskScheduler.Default` je ThreadPool. UI aplikacije imaju i `SynchronizationContext` koji nastavak vraća na UI nit.',
    },
    code: [
      cs('C# · Task ide u red pool-a, ne pravi nit', `
Task<int> work = Task.Run(() => Compute(data));   // delegat u red ThreadPool-a
int result = await work;

ThreadPool.GetMinThreads(out int minWorkers, out _);
Console.WriteLine($"min: {minWorkers}, niti: {ThreadPool.ThreadCount}, u redu: {ThreadPool.PendingWorkItemCount}");`),
      cs('C# · Dugotrajan posao na zasebnoj niti', `
var listener = Task.Factory.StartNew(
    () => ListenForever(ct),
    ct,
    TaskCreationOptions.LongRunning,   // zasebna nit, ne zauzima pool
    TaskScheduler.Default);`),
      sh('Shell · Prati pool u produkciji', `
dotnet-counters monitor -n MyApi --counters System.Runtime
# threadpool-thread-count i threadpool-queue-length koji stalno rastu = starvation`),
    ],
    pitfalls: [
      '`new Thread()` za svaki zahtev: skupo i bez gornje granice.',
      'Povećanje `SetMinThreads` sakriva blokiranje umesto da ga ukloni.',
      'Stanje vezano za nit (`[ThreadStatic]`) ne prati async tok, jer posle `await` možeš biti na drugoj niti. Koristi `AsyncLocal<T>`.',
    ],
    rel: ['os-scheduler', 'async-await', 'parallel-for', 'threads'],
    viz: {
      warm: 3,
      knobs: [
        { id: 'mode', label: 'Posao', value: 'short', options: [['short', 'Kratak CPU'], ['block', 'Blokira (.Result)'], ['async', 'Async I/O (await)']] },
        { id: 'min', label: 'Niti na startu', min: 2, max: 4, value: 3 },
      ],
      build(x) {
        const { C, V } = x, mode = x.p.mode, block = mode === 'block', asy = mode === 'async', MAX = mode === 'short' ? 5 : 7;
        const sT = x.stat('t', 'Niti', 0);
        const sQ = x.stat('q', 'U redu', 0, { color: C.wait });
        const sD = x.stat('d', 'Završeno', 0, { color: C.ok });
        const sI = asy ? x.stat('i', 'Čeka I/O bez niti', 0, { color: C.sky }) : null;
        x.view({ dir: [0, 1.5, 1.25] });
        x.plate(mode === 'short' ? { at: [.6, 0, .4], w: 22.6, d: 9.4, label: 'Proces: ThreadPool', lpos: 'front' } : { at: [.6, 0, 1.9], w: 22.6, d: 12.4, label: 'Proces: ThreadPool', lpos: 'front' });
        if (asy) x.plate({ at: [-6.9, 0, 3.6], w: 6.4, d: 5.2, color: C.sky, label: 'Čeka I/O, nit je slobodna' });
        const src = x.box({ at: [-9.2, 0, -3.2], size: [1.9, .9, 1.2], label: 'Task.Run', side: 'in' });
        const tb = x.tube([-8, .55, -3.2], [-3.6, .55, -3.2], { label: 'Red ThreadPool-a' });
        const SL = 7, step = (tb.len - .4) / SL, q = [];
        const more = x.label('', tb.a.clone().add(V(.4, .9, 0)), { cls: 'tag wait', nofit: true });
        more.visible = false;
        const layout = () => {
          q.forEach((o, i) => { o.visible = i < SL; o.userData.t = tb.b.clone().add(V(-(i + .5) * step - .2, 0, 0)); });
          more.visible = q.length > SL; more.set('+' + Math.max(0, q.length - SL)); sQ.set(q.length);
        };
        x.tick(dt => { for (const o of q) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 7)); });
        const ioSpots = [-8.8, -7.5, -6.2, -4.9].flatMap(sx => [V(sx, .4, 2.2), V(sx, .4, 3.6), V(sx, .4, 5)]), ioUsed = new Set();
        let io = 0;
        const threads = [];
        const addThread = () => {
          const i = threads.length, z = -1.6 + i * 1.3;
          const box = x.box({ at: [-1.9, 0, z], size: [1.8, .6, .74], label: `Nit ${i + 1}`, side: 'in' });
          x.rail([-1, .2, z], [9.6, .2, z], { opacity: .22 });
          x.rail(tb.b, box.port('left'), { opacity: .15 });
          threads.push(box);
          sT.set(threads.length);
          x.pop(box.o);
          x.spawn(async () => {
            while (x.alive) {
              if (!q.length) { await x.wait(.1); continue; }
              const o = q.shift();
              o.visible = true; o.userData.t = null;
              layout();
              await x.move(o, [o.position.clone(), tb.b, box.port('left')], asy ? 18 : 12);
              if (asy) {
                box.paint(C.ok);
                await x.move(o, [box.port('right'), box.port('right').add(V(1.4, 0, 0))], 5.6);
                box.reset();
                if (!o.userData.cont) {
                  o.userData.cont = true;
                  x.spawn(async () => {
                    const k = [...ioSpots.keys()].find(s => !ioUsed.has(s)) ?? 0;
                    ioUsed.add(k); io++; sI.set(io);
                    await x.move(o, [o.position.clone(), V(o.position.x, 1.6, o.position.z), ioSpots[k]], 13);
                    await x.wait(2.4);
                    ioUsed.delete(k); io--; sI.set(io);
                    o.lbl = x.label('nastavak', [0, .32, 0], { parent: o, cls: 'tag', nofit: true });
                    await x.move(o, [o.position.clone(), V(o.position.x, 1.4, o.position.z), tb.a.clone()], 13);
                    q.push(o); layout();
                  });
                  continue;
                }
                x.spawn(async () => { await x.move(o, [o.position.clone(), V(9.4, .55, z)], 14); x.remove(o); });
                box.flash(C.ok, .4);
                sD.add();
                continue;
              } else {
                const dur = block ? 3.6 : x.range(.5, 1.1);
                box.paint(block ? C.wait : C.ok);
                await x.move(o, [box.port('right'), V(9.4, .55, z)], 10.4 / dur);
                box.reset();
              }
              box.flash(C.ok, .4);
              sD.add();
              x.remove(o);
            }
          });
        };
        for (let i = 0; i < x.p.min; i++) addThread();
        let k = 0, starving = 0;
        x.every(asy ? .6 : .5, () => x.spawn(async () => {
          const o = x.orb(C.cat[k++ % C.cat.length], { r: .22 });
          src.flash(C.sky, .25);
          await x.move(o, [src.port('right'), tb.a], 9);
          q.push(o); layout();
        }));
        x.every(.5, () => {
          starving = q.length > 2 ? starving + .5 : 0;
          if (starving >= 1.5 && threads.length < MAX) {
            starving = 0;
            addThread();
            x.say(`Sve niti su zauzete i red raste: ThreadPool **dodaje nit ${threads.length}**, ali polako. Ovo je thread starvation.`);
          }
        });
        x.say(asy
          ? 'Na `await` posao napušta nit i čeka I/O **bez nje** (levo). Kad I/O završi, nastavak ide u red i preuzima ga bilo koja slobodna nit. Iste niti stižu sav posao.'
          : block
            ? 'Svaki posao **blokira** nit dok čeka I/O (žuto). Red raste, a pool dodaje niti tek posle čekanja.'
            : 'Slobodna nit uzima sledeći posao iz reda. Niti se ne prave za svaki posao, nego se koriste ponovo.');
      },
    },
  },

  // ------------------------------------------------------------------ Thread safety
  {
    id: 'thread-safety', d: 'concurrency', sym: 'Ts', title: 'Thread safety',
    tags: ['thread safe', 'thread-safe', 'bezbedno za niti', 'deljeno stanje', 'immutable', 'nepromenljivo', 'concurrentdictionary', 'threadlocal', 'asynclocal', 'striping'],
    desc: 'Kod je thread-safe kad radi ispravno i kad ga više niti koristi istovremeno. Postiže se na četiri načina: ne deli stanje, deli samo nepromenljivo, zaštiti pristup lock-om ili koristi atomične operacije i konkurentne kolekcije.',
    points: [
      '**Bez deljenja**: lokalne promenljive, parametri i objekti napravljeni u metodi bezbedni su sami po sebi.',
      '**Nepromenljivo**: objekat koji se posle konstrukcije ne menja (`record`, `ImmutableList`, `FrozenDictionary`) može da čita bilo koliko niti.',
      '**Sinhronizovano**: deljeno promenljivo stanje menja se samo pod `lock`-om ili kroz konkurentnu kolekciju.',
      '**Vezano za nit ili tok**: `ThreadLocal<T>` daje svakoj niti svoju kopiju, a `AsyncLocal<T>` prati async tok.',
      'Bezbedne pojedinačne operacije ne čine bezbednu celinu: provera pa upis je race i nad bezbednom kolekcijom.',
    ],
    table: {
      title: 'Da li je thread-safe?',
      head: ['Tip', 'Istovremeno čitanje', 'Istovremeni upis', 'Napomena'],
      rows: [
        ['`List<T>`, `Dictionary`', 'da, ako niko ne piše', 'ne', 'pucaju retko i čudno'],
        ['`ConcurrentDictionary`', 'da', 'da', 'svaka operacija posebno; čitanje bez lock-a'],
        ['`ImmutableList`, `FrozenDictionary`', 'da', 'nema upisa', 'izmena pravi novu verziju'],
        ['`HttpClient`', 'da', 'da', 'deli se; ne menjaj `DefaultRequestHeaders` u letu'],
        ['`DbContext`', 'ne', 'ne', 'jedan po zahtevu (scoped)'],
        ['`Random`', 'ne', 'ne', 'iz više niti koristi `Random.Shared`'],
        ['`StringBuilder`', 'ne', 'ne', 'samo lokalno u metodi'],
      ],
    },
    code: [
      cs('C# · Učitaj tačno jednom, i iz više niti', `
// GetOrAdd može da pozove factory više puta pod gužvom, ali Lazy osigurava jedno učitavanje
private readonly ConcurrentDictionary<string, Lazy<Task<Product>>> _cache = new();

public Task<Product> GetAsync(string id) =>
    _cache.GetOrAdd(id, key => new Lazy<Task<Product>>(() => LoadAsync(key))).Value;`),
      cs('C# · Nepromenljivo stanje: zameni celu referencu', `
private ImmutableList<Rule> _rules = ImmutableList<Rule>.Empty;

public void Add(Rule rule) =>
    ImmutableInterlocked.Update(ref _rules, list => list.Add(rule));   // atomična zamena

public IReadOnlyList<Rule> Rules => _rules;   // čitalac uvek vidi celu, doslednu verziju`),
      cs('C# · Provera pa upis: race i sa bezbednom kolekcijom', `
// dve niti mogu obe da prođu proveru
if (!_users.ContainsKey(id)) _users[id] = Create(id);

// jedna atomična operacija
var user = _users.GetOrAdd(id, Create);`),
    ],
    pitfalls: [
      'Statičko polje ili singleton sa promenljivim stanjem deli se između svih zahteva.',
      'Iteracija kroz `ConcurrentDictionary` ne zaključava kolekciju: vidiš mešavinu starog i novog stanja.',
      'Thread-safe klasa ne znači thread-safe upotrebu: dve bezbedne operacije zaredom nisu jedna bezbedna operacija.',
    ],
    rel: ['race', 'lock', 'atomic', 'di-lifetimes'],
    viz: {
      knobs: [{ id: 'mode', label: 'Tabela', value: 'striped', options: [['none', 'Dictionary bez zaštite'], ['lock', 'jedan lock'], ['striped', 'ConcurrentDictionary']] }],
      build(x) {
        const { C, V } = x, MODE = x.p.mode;
        x.view({ dir: [0, 1.2, 1.5] });
        const SCOL = [0x5ec8ff, 0xffd166, 0x7ee0b5, 0xc3a6ff], NB = 8;
        const BX = b => 2.2 + (b - 3.5) * 1.6, BZ = -.2;
        x.plate({ at: [1.1, 0, -.2], w: 18.8, d: 8.6, label: MODE === 'none' ? 'Dictionary bez zaštite' : MODE === 'lock' ? 'Dictionary sa jednim lock-om' : 'ConcurrentDictionary: lock po delu tabele', lpos: 'front' });
        const cnt = new Array(NB).fill(0);
        const buckets = Array.from({ length: NB }, (_, b) => x.box({ at: [BX(b), 0, BZ], size: [1.34, .5, 1.3], color: MODE === 'striped' ? SCOL[b % 4] : 0x6f9be8, label: '0', side: 'in' }));
        buckets.forEach((_, b) => x.label(String(b), [BX(b), 0, BZ + .72], { cls: 'ghost', center: [.5, 0] }));
        const locks = MODE === 'lock'
          ? [x.box({ at: [BX(3.5), 0, -3], size: [3.2, .5, 1], color: 0x8a93a3, label: 'lock (_sync)', side: 'in' })]
          : MODE === 'striped' ? [0, 1, 2, 3].map(k => x.box({ at: [BX(3.5) + (k - 1.5) * 2.9, 0, -3], size: [2.3, .5, 1], color: SCOL[k], label: `lock ${k}`, side: 'in' })) : [];
        const sems = locks.map(() => x.sem(1));
        const TZ = t => -2.6 + t * 1.65;
        const thr = [0, 1, 2, 3].map(t => x.box({ at: [-7.6, 0, TZ(t)], size: [1.9, .6, 1.1], label: `T${t + 1}`, side: 'in' }));
        const sOk = x.stat('ok', 'Upisa', 0, { color: C.ok });
        const sLost = MODE === 'none' ? x.stat('l', 'Izgubljeno', 0, { color: C.err }) : null;
        const sWait = MODE !== 'none' ? x.stat('w', 'Čekanja na lock', 0, { color: C.wait }) : null;
        x.legend(MODE === 'none' ? [[C.mag, 'upis u toku'], [C.err, 'izgubljen upis']] : [[C.mag, 'upis, lock zauzet'], [C.wait, 'nit čeka lock']]);
        const inProg = Array.from({ length: NB }, () => []);
        let said = false;
        thr.forEach((tb, t) => x.spawn(async () => {
          await x.wait(.4 + t * .33);
          while (x.alive) {
            const b = Math.floor(x.rnd() * NB), li = MODE === 'lock' ? 0 : b % 4, sem = sems[li];
            if (sem) {
              if (sem.free === 0) { sWait.add(1); tb.paint(C.wait); }
              await sem.acquire();
              tb.reset();
              locks[li].paint(C.mag);
            }
            const o = x.orb(C.mag, { r: .2 });
            const p0 = tb.port('right');
            await x.move(o, [p0, V(p0.x + 1, 1.1, p0.z), V(BX(b), 1.1, BZ), V(BX(b), .7, BZ)], 15);
            const w = { lost: false };
            inProg[b].forEach(q => { q.lost = true; });
            inProg[b].push(w);
            buckets[b].paint(C.mag);
            await x.wait(.5);
            inProg[b].splice(inProg[b].indexOf(w), 1);
            if (!inProg[b].length) buckets[b].reset();
            if (w.lost) {
              sLost.add(1);
              x.ripple(V(BX(b), 0, BZ), C.err, 1.1);
              buckets[b].flash(C.err, .7);
              if (!said) { said = true; x.say(`T${t + 1} i još jedna nit upisivale su u **bucket ${b} u isto vreme**: jedan upis je pregažen i nestao. U pravom \`Dictionary\`-ju istovremen upis može da ošteti i celu strukturu.`); }
            } else {
              cnt[b]++; buckets[b].text(String(cnt[b])); sOk.add(1);
              buckets[b].flash(C.ok, .35);
            }
            x.remove(o);
            if (sem) { locks[li].reset(); sem.release(); }
            await x.wait(x.range(.15, .55));
          }
        }));
        x.say(MODE === 'none'
          ? '`Dictionary` bez zaštite: četiri niti upisuju istovremeno. Kad dve pogode isti bucket u isto vreme, jedan upis se **izgubi** (crveno).'
          : MODE === 'lock'
            ? 'Jedan `lock` oko cele tabele: ništa se ne gubi, ali niti **čekaju jedna drugu** (žuto) čak i kad pišu u različite bucket-e. Uporedi broj upisa sa ConcurrentDictionary.'
            : '`ConcurrentDictionary` ima više lock-ova i svaki čuva svoj deo bucket-a (ista boja). Niti koje pišu u različite delove rade istovremeno, a čekaju samo kad pogode isti deo. Čitanje ne zaključava ništa.');
      },
    },
  },

  // ------------------------------------------------------------------ lock i Monitor
  {
    id: 'lock', d: 'concurrency', sym: 'Lk', title: 'lock i Monitor',
    tags: ['lock', 'monitor', 'kritična sekcija', 'critical section', 'mutual exclusion', 'system.threading.lock', 'readerwriterlockslim', 'spinlock', 'reentrant', 'lock convoy'],
    desc: '`lock` pušta jednu nit u kritičnu sekciju, a ostale čekaju dok ona ne izađe. Ispod je `Monitor.Enter` i `Monitor.Exit` u `try/finally`, a od .NET 9 postoji i namenski tip `System.Threading.Lock`.',
    points: [
      'Kompajler `lock (obj) { ... }` pretvara u `Monitor.Enter` i `Monitor.Exit` u `finally`, pa se lock oslobađa i kad pukne izuzetak.',
      'Monitor je **reentrant**: nit koja već drži lock može ponovo da uđe, ali mora izaći isti broj puta.',
      'Kritična sekcija treba da bude kratka: bez I/O-a, bez `await` (kompajler ga ni ne dozvoljava) i bez poziva nepoznatog koda.',
      '`ReaderWriterLockSlim` pušta više čitalaca zajedno, a pisca samog. Isplati se tek kad čitanja ima mnogo više i kad traju.',
      'Pod velikom gužvom niti se gomilaju na istom lock-u (**lock convoy**) i sistem radi kao da ima jednu nit.',
    ],
    table: {
      title: 'Koji lock kada',
      head: ['Mehanizam', 'Ko ulazi', '`await` unutra', 'Napomena'],
      rows: [
        ['`lock` / `Monitor`', 'jedna nit', 'ne', 'najčešći izbor, reentrant'],
        ['`Lock` (.NET 9)', 'jedna nit', 'ne', 'namenski tip za `lock`, brži od `object`'],
        ['`ReaderWriterLockSlim`', 'više čitalaca ili jedan pisac', 'ne', 'kad čitanja dominiraju'],
        ['`SpinLock`', 'jedna nit, vrti se umesto da spava', 'ne', 'samo za vrlo kratke sekcije'],
        ['`SemaphoreSlim(1, 1)`', 'jedna nit ili async tok', 'da', 'async "lock" preko `WaitAsync`'],
      ],
    },
    code: [
      cs('C# · Šta kompajler napravi od lock-a', `
lock (_sync) { _balance += amount; }

// otprilike isto kao:
bool taken = false;
try
{
    Monitor.Enter(_sync, ref taken);
    _balance += amount;
}
finally
{
    if (taken) Monitor.Exit(_sync);
}`),
      cs('C# · .NET 9: namenski Lock tip', `
private readonly Lock _sync = new();     // umesto new object()
private decimal _balance;

public void Deposit(decimal amount)
{
    lock (_sync) { _balance += amount; }   // kompajler koristi _sync.EnterScope()
}`),
      cs('C# · ReaderWriterLockSlim: više čitalaca, jedan pisac', `
private readonly ReaderWriterLockSlim _rw = new();
private readonly Dictionary<string, decimal> _prices = new();

public decimal? Get(string sku)
{
    _rw.EnterReadLock();
    try { return _prices.TryGetValue(sku, out var p) ? p : null; }
    finally { _rw.ExitReadLock(); }
}

public void Set(string sku, decimal price)
{
    _rw.EnterWriteLock();
    try { _prices[sku] = price; }
    finally { _rw.ExitWriteLock(); }
}`),
    ],
    pitfalls: [
      '`lock (this)`, `lock (typeof(X))` ili lock na string: kod van klase može da zaključa isti objekat.',
      '`Monitor.Enter` na vrednosnom tipu svaki put pakuje novu kopiju (boxing), pa ne štiti ništa. Naredba `lock` to ni ne dozvoljava.',
      'Spor posao pod lock-om (I/O, logovanje, poziv servisa) drži sve ostale niti da čekaju.',
    ],
    rel: ['race', 'semaphore', 'deadlock', 'thread-safety'],
    viz: {
      warm: 3,
      knobs: [{ id: 'mode', label: 'Mehanizam', value: 'lock', options: [['lock', 'lock (Monitor)'], ['rw', 'ReaderWriterLockSlim']] }],
      build(x) {
        const { C, V } = x, RW = x.p.mode === 'rw';
        x.view({ dir: [0, 1.25, 1.45] });
        const sIn = x.stat('i', 'Unutra', 0, { color: C.ok });
        const sW = x.stat('w', 'Čeka', 0, { color: C.wait });
        const sR = RW ? x.stat('r', 'Čitanja', 0, { color: C.sky }) : null;
        const sP = x.stat('p', 'Upisa', 0, { color: C.mag });
        x.plate({ at: [-4.6, 0, 0], w: 9.6, d: 6.4, label: 'Čekaju na ulazu' });
        x.plate({ at: [5.6, 0, 0], w: 9.2, d: 6.4, color: C.ok, label: RW ? 'Više čitalaca ili jedan pisac' : 'Kritična sekcija: jedna nit' });
        for (const z of [-2.3, 2.3]) x.box({ at: [.6, 0, z], size: [.3, 1.8, .3], color: C.dim });
        x.box({ at: [.6, 1.8, 0], size: [.4, .18, 4.9], color: C.dim, label: RW ? 'ReaderWriterLockSlim' : 'lock (_sync)' });
        let balance = 1000;
        const obj = x.box({ at: [6.6, 0, -1.9], size: [3.4, .7, 1.4], color: 0xffd166, label: RW ? 'cenovnik' : `_balance = ${balance}`, side: 'in' });
        if (RW) x.legend([[C.sky, 'čitalac'], [C.mag, 'pisac']]);
        // RW lock sa prednošću za pisca; u režimu lock svi su pisci
        const st = { readers: 0, writer: false, q: [] };
        const grant = () => {
          while (st.q.length) {
            const h = st.q[0];
            if (h.w) { if (!st.writer && st.readers === 0) { st.writer = true; st.q.shift(); h.res(); } break; }
            if (st.writer) break;
            st.readers++; st.q.shift(); h.res();
          }
        };
        const acquire = w => new Promise(res => { st.q.push({ w, res }); grant(); });
        const release = w => { if (w) st.writer = false; else st.readers--; grant(); };
        const WSPOT = V(4.4, .4, -1.9);
        const RSPOTS = [3.6, 5.2, 6.8, 8.4].flatMap(sx => [V(sx, .4, .5), V(sx, .4, 1.9)]), used = new Set();
        const line = [];
        const layout = () => { line.forEach((o, i) => { o.userData.t = V(-.9 - i * .8, .4, 0); }); sW.set(line.length); };
        x.tick(dt => { for (const o of line) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 6)); });
        let inside = 0, k = 0, saidW = false;
        x.every(RW ? .55 : 1.1, () => {
          if (line.length >= 9) return;
          x.spawn(async () => {
            const w = !RW || x.rnd() < .25;
            const o = x.orb(w && RW ? C.mag : C.sky, { r: .26, label: RW ? (w ? 'piše' : 'čita') : `T${++k}`, lcls: w && RW ? 'tag mag' : 'tag' });
            o.position.set(-8.8, .4, 0);
            line.push(o); layout();
            await acquire(w);
            line.splice(line.indexOf(o), 1); layout();
            const si = w ? -1 : [...RSPOTS.keys()].find(i => !used.has(i)) ?? 0;
            if (si >= 0) used.add(si);
            inside++; sIn.set(inside);
            await x.move(o, [o.position.clone(), V(.6, .4, 0), w ? WSPOT : RSPOTS[si]], 7);
            if (w) {
              balance += 100; sP.add(1);
              obj.text(RW ? 'cenovnik (menja se)' : `_balance = ${balance}`);
              obj.flash(C.mag, .8);
              if (RW && !saidW) { saidW = true; x.say('Pisac je unutra **sam**: čeka da izađu svi čitaoci, a dok on čeka, novi čitaoci staju iza njega, da pisac ne bi čekao zauvek.'); }
            } else { sR.add(1); obj.flash(C.sky, .4); }
            await x.wait(w ? x.range(1, 1.4) : x.range(1.6, 2.6));
            if (RW && w) obj.text('cenovnik');
            inside--; sIn.set(inside);
            if (si >= 0) used.delete(si);
            release(w);
            await x.move(o, [o.position.clone(), V(10.6, .4, o.position.z)], 7);
            x.remove(o);
          });
        });
        x.say(RW
          ? '**Čitaoci** (plavo) ulaze zajedno i ne smetaju jedni drugima. **Pisac** (magenta) mora da bude sam u sekciji.'
          : '`lock` pušta **jednu** nit u kritičnu sekciju, a ostale čekaju na ulazu. Svaka nit menja `_balance` sama, pa nema izgubljenih izmena, ali pod gužvom red raste.');
      },
    },
  },

  // ------------------------------------------------------------------ Atomične operacije
  {
    id: 'atomic', d: 'concurrency', sym: 'At', title: 'Atomične operacije i Interlocked',
    tags: ['atomic', 'atomično', 'interlocked', 'compareexchange', 'cas', 'compare-and-swap', 'lock-free', 'volatile', 'memory model', 'increment'],
    desc: 'Atomična operacija se izvrši cela ili nikako, bez prekida između koraka. `Interlocked` koristi posebne instrukcije procesora za sabiranje, zamenu i compare-and-swap, pa radi bez lock-a.',
    points: [
      '`Interlocked.Increment(ref x)` čita, sabira i upisuje kao jednu nedeljivu operaciju procesora.',
      '**Compare-and-swap** (`Interlocked.CompareExchange`): upiši novu vrednost samo ako je trenutna jednaka očekivanoj. Ako nije, neko te je pretekao, pa pročitaj ponovo i pokušaj opet.',
      'CAS petlja je osnova lock-free struktura kao što su `ConcurrentQueue` i `ConcurrentStack`. Pod velikom gužvom raste broj ponavljanja.',
      'Čitanje i upis `int`-a i reference su atomični sami po sebi; `long` samo u 64-bitnom procesu. `volatile` i `Volatile.Read/Write` garantuju vidljivost i redosled, ali ne i atomičnost složenih operacija.',
      'Atomično je samo jedno polje. Dve promenljive koje moraju da se promene zajedno traže `lock`.',
    ],
    table: {
      title: 'Interlocked metode',
      head: ['Metoda', 'Šta radi', 'Primer'],
      rows: [
        ['`Increment`, `Decrement`', '±1 atomično', 'brojač zahteva'],
        ['`Add`', 'dodaje vrednost', 'zbir poslatih bajtova'],
        ['`Exchange`', 'upisuje i vraća staru vrednost', 'preuzmi bafer i ostavi novi'],
        ['`CompareExchange`', 'upisuje samo ako je vrednost očekivana', 'CAS petlja, jednokratna inicijalizacija'],
        ['`Read`', 'atomično čita `long`', 'i u 32-bitnom procesu'],
        ['`And`, `Or`', 'bitovske operacije', 'zastavice'],
      ],
    },
    code: [
      cs('C# · Brojač bez lock-a', `
private long _requests;

public void OnRequest() => Interlocked.Increment(ref _requests);
public long Requests => Interlocked.Read(ref _requests);`),
      cs('C# · CAS petlja: atomičan maksimum', `
static void UpdateMax(ref long max, long value)
{
    long current = Volatile.Read(ref max);
    while (value > current)
    {
        long seen = Interlocked.CompareExchange(ref max, value, current);
        if (seen == current) return;   // uspeh: niko nas nije pretekao
        current = seen;                // neko jeste: pokušaj ponovo sa novom vrednošću
    }
}`),
      cs('C# · Jednokratna inicijalizacija bez lock-a', `
private Config? _config;

public Config Config
{
    get
    {
        var c = Volatile.Read(ref _config);
        if (c is not null) return c;
        var fresh = LoadConfig();                                          // može da se pozove dvaput
        return Interlocked.CompareExchange(ref _config, fresh, null) ?? fresh;   // prvi upis pobeđuje
    }
}
// jednostavnije: Lazy<Config> ili LazyInitializer.EnsureInitialized`),
    ],
    pitfalls: [
      '`volatile int count; count++` i dalje gubi upise: `volatile` ne pravi čitaj-izmeni-upiši atomičnim.',
      'Mešanje `Interlocked` i običnog upisa nad istim poljem ruši garanciju.',
      'Skup proračun unutar CAS petlje pod gužvom troši CPU na ponavljanja. Tada je `lock` jednostavniji i često brži.',
    ],
    rel: ['race', 'lock', 'cpu-cores', 'thread-safety'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Operacija', value: 'cas', options: [['cas', 'CompareExchange petlja'], ['inc', 'Interlocked.Increment']] },
        { id: 'n', label: 'Niti', value: 4, options: [[2, '2'], [4, '4'], [6, '6']] },
      ],
      build(x) {
        const { C, V } = x, N = x.p.n, CAS = x.p.mode === 'cas';
        x.view({ dir: [0, 1.15, 1.5] });
        const TX = i => (i - (N - 1) / 2) * 2.7;
        x.plate({ at: [0, 0, .7], w: Math.max(13, N * 2.7 + 2.2), d: 8.4, label: 'Deljena memorija i niti', lpos: 'front' });
        let value = 0, attempts = 0, fails = 0;
        const cell = x.box({ at: [0, 0, -1.9], size: [3.6, 1, 1.6], color: C.box, label: 'x = 0', side: 'in', lcls: 'big' });
        const thr = Array.from({ length: N }, (_, i) => x.box({ at: [TX(i), 0, 2.8], size: [2.1, .55, 1], label: `T${i + 1}`, side: 'in' }));
        const stl = thr.map((_, i) => x.label('', [TX(i), .62, 2.8], { cls: 'tag', center: [.5, 1] }));
        const st = (i, t, cls = '') => { stl[i].set(t); stl[i].el.className = 'lbl lbl-tag' + (cls ? ' lbl-' + cls : ''); };
        thr.forEach((_, i) => st(i, CAS ? 'čeka' : 'radi'));
        const sV = x.stat('v', 'x', 0);
        const sOk = x.stat('ok', 'Uspešnih upisa', 0, { color: C.ok });
        const sF = CAS ? x.stat('f', 'Neuspelih CAS', 0, { color: C.err }) : null;
        const from = i => thr[i].port('back', .1), to = () => cell.port('front', 0);
        thr.forEach((tb, i) => x.spawn(async () => {
          await x.wait(.4 + i * .27);
          while (x.alive) {
            if (CAS) {
              st(i, 'čita x');
              const r = x.orb(C.sky, { r: .16 });
              await x.move(r, [to(), from(i)], 11);
              x.remove(r);
              const seen = value;
              st(i, `pročitano ${seen}, računa`, 'wait');
              tb.paint(C.wait);
              await x.wait(x.range(.3, .9));
              tb.reset();
              st(i, `CAS: ${seen} → ${seen + 1}`);
              const o = x.orb(C.mag, { r: .2 });
              await x.move(o, [from(i), to()], 11);
              x.remove(o);
              attempts++;
              if (value === seen) {
                value = seen + 1; sV.set(value); sOk.add(1);
                cell.text(`x = ${value}`); cell.flash(C.ok, .5);
                st(i, 'uspeh', 'ok');
                await x.wait(x.range(.4, .9));
              } else {
                fails++; sF.add(1);
                cell.flash(C.err, .5);
                st(i, `neuspeh: x je već ${value}`, 'err');
                await x.wait(.45);
              }
            } else {
              st(i, 'Increment');
              const o = x.orb(C.mag, { r: .2 });
              await x.move(o, [from(i), to()], 11);
              x.remove(o);
              value++; sV.set(value); sOk.add(1);
              cell.text(`x = ${value}`); cell.flash(C.ok, .4);
              st(i, 'radi ostatak posla');
              await x.wait(x.range(.9, 1.6));
            }
          }
        }));
        if (CAS) x.spawn(async () => {
          await x.wait(16);
          if (x.alive && attempts) x.say(`Od ${attempts} CAS pokušaja ${fails} nije uspelo (${Math.round(fails / attempts * 100)} %). Ništa se ne gubi, ali svaki neuspeh znači ponovno čitanje. ${N < 6 ? 'Sa više niti neuspeha je još više.' : 'Sa manje niti neuspeha je manje.'}`);
        });
        x.say(CAS
          ? 'Svaka nit čita x, računa x + 1 i radi **CompareExchange**: upis uspeva samo ako je x i dalje ono što je pročitala. Ako ju je druga nit pretekla, CAS ne upisuje ništa (crveno) i nit čita ponovo.'
          : '`Interlocked.Increment` je jedna nedeljiva instrukcija procesora: nema čitanja unapred, pa nema ni neuspelih pokušaja. Zbir je uvek tačan.');
      },
    },
  },

  // ------------------------------------------------------------------ Mapa .NET biblioteka
  {
    id: 'concurrency-map', d: 'concurrency', sym: 'Mp', title: '.NET biblioteke: šta koristiti kada',
    tags: ['biblioteke', 'namespace', 'system.threading', 'tpl', 'channels', 'dataflow', 'concurrent', 'immutable', 'frozen', 'rx', 'cancellationtoken', 'periodictimer', 'mapa'],
    desc: 'Mapa tipova koje .NET nudi za konkurentan i paralelan kod, grupisanih po nameni. Klikni na tip u sceni za kratak opis i preporuku kada da ga koristiš.',
    points: [
      '**Izvršavanje**: `Task`, `ThreadPool`, `Parallel`, PLINQ i, retko, `Thread`.',
      '**Sinhronizacija**: `lock` i `Lock`, `SemaphoreSlim`, `ReaderWriterLockSlim`, `Mutex` i signali kao `ManualResetEventSlim` ili `Barrier`.',
      '**Atomično i lokalno**: `Interlocked`, `Volatile`, `ThreadLocal<T>`, `AsyncLocal<T>`, `Lazy<T>`.',
      '**Kolekcije**: `System.Collections.Concurrent` za deljeni upis, a `Immutable` i `Frozen` za deljeno čitanje.',
      '**Tokovi i kontrola**: `Channel<T>`, TPL Dataflow, `IAsyncEnumerable<T>`, Rx.NET, `CancellationToken`, `PeriodicTimer`.',
    ],
    table: {
      title: 'Treba mi... koristi',
      head: ['Treba mi', 'Koristi'],
      rows: [
        ['da čekam bazu ili HTTP bez blokiranja', '`async/await`'],
        ['više I/O poziva odjednom', '`Task.WhenAll` ili `Parallel.ForEachAsync` sa limitom'],
        ['CPU obradu velike kolekcije', '`Parallel.For`, PLINQ'],
        ['najviše N istovremenih operacija', '`SemaphoreSlim`'],
        ['red između proizvođača i potrošača', '`Channel<T>`'],
        ['brojač ili zastavicu iz više niti', '`Interlocked`'],
        ['deljeni keš koji se menja', '`ConcurrentDictionary`'],
        ['konfiguraciju koju svi samo čitaju', '`FrozenDictionary`, `ImmutableDictionary`'],
        ['prekid dugog posla', '`CancellationToken`'],
        ['periodičan posao u pozadini', '`BackgroundService` i `PeriodicTimer`'],
        ['obradu u više faza sa različitim limitima', 'TPL Dataflow'],
      ],
    },
    code: [
      cs('C# · Odakle šta dolazi', `
using System.Threading;                 // Thread, Monitor, Lock, SemaphoreSlim, Interlocked, CancellationToken
using System.Threading.Tasks;           // Task, ValueTask, Parallel, TaskScheduler
using System.Threading.Channels;        // Channel<T>
using System.Collections.Concurrent;    // ConcurrentDictionary, ConcurrentQueue, BlockingCollection
using System.Collections.Immutable;     // ImmutableList, ImmutableDictionary
using System.Collections.Frozen;        // FrozenDictionary, FrozenSet (.NET 8)
// NuGet: System.Threading.Tasks.Dataflow, System.Reactive`),
      cs('C# · Periodičan posao u pozadini', `
public sealed class Heartbeat(ILogger<Heartbeat> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(30));
        while (await timer.WaitForNextTickAsync(ct))
            log.LogInformation("Živ sam u {Time}", DateTimeOffset.UtcNow);
    }
}`),
      cs('C# · TPL Dataflow: preuzmi, obradi, sačuvaj', `
var download = new TransformBlock<string, string>(url => http.GetStringAsync(url),
    new ExecutionDataflowBlockOptions { MaxDegreeOfParallelism = 8 });
var parse = new TransformBlock<string, Product>(html => Parse(html),
    new ExecutionDataflowBlockOptions { MaxDegreeOfParallelism = Environment.ProcessorCount });
var save = new ActionBlock<Product>(p => db.SaveAsync(p));

var link = new DataflowLinkOptions { PropagateCompletion = true };
download.LinkTo(parse, link);
parse.LinkTo(save, link);

foreach (var url in urls) await download.SendAsync(url);
download.Complete();
await save.Completion;`),
    ],
    pitfalls: [
      'Mešanje blokirajućih i async primitiva (`lock` oko `await`, `.Result` u async kodu) je najčešći izvor grešaka.',
      'Novi kod retko treba `Thread` i `ManualResetEvent`: `Task`, `Channel<T>` i `CancellationToken` pokrivaju skoro sve slučajeve.',
    ],
    rel: ['thread-pool', 'channels', 'semaphore', 'thread-safety'],
    viz: {
      kind: 'svg',
      build(x) {
        const MAP = [
          ['Izvršavanje', '#5ec8ff', [
            ['Task i Task<T>', 'System.Threading.Tasks', 'Jedinica posla sa rezultatom i osnova za async/await.', 'povratni tip async metoda, `Task.WhenAll` za više poslova odjednom.'],
            ['ValueTask<T>', 'System.Threading.Tasks', 'Task bez alokacije kad je rezultat često već spreman.', 'vruće putanje sa kešom. Ne await-uj ga dvaput.'],
            ['ThreadPool', 'System.Threading', 'Grupa niti koje izvršavaju poslove iz reda.', 'indirektno, preko `Task.Run`, `Parallel` i async nastavaka.'],
            ['Thread', 'System.Threading', 'Zasebna nit pod tvojom kontrolom.', 'retko: dugotrajna petlja, poseban prioritet ili STA.'],
            ['Parallel', 'System.Threading.Tasks', '`For`, `ForEach` i `ForEachAsync` dele posao na niti.', 'CPU obrada kolekcije, a `ForEachAsync` za I/O uz limit.'],
            ['PLINQ', 'System.Linq', '`AsParallel()` izvršava LINQ upit na više jezgara.', 'CPU-skupi upiti nad velikim kolekcijama u memoriji.'],
          ]],
          ['Sinhronizacija', '#ffd166', [
            ['lock i Monitor', 'System.Threading', 'Jedna nit u kritičnoj sekciji; reentrant.', 'kratke izmene deljenog stanja, bez await-a unutra.'],
            ['Lock', 'System.Threading, .NET 9', 'Namenski tip za `lock`, brži od `object`.', 'novi kod na .NET 9 i novijem umesto `new object()`.'],
            ['SemaphoreSlim', 'System.Threading', 'Najviše N niti ili async tokova istovremeno; ima `WaitAsync`.', 'limit paralelnih poziva, async "lock" sa `(1, 1)`.'],
            ['ReaderWriterLockSlim', 'System.Threading', 'Više čitalaca ili jedan pisac.', 'kad čitanja dominiraju i traju; inače je `lock` jednostavniji.'],
            ['Mutex', 'System.Threading', 'Lock sa vlasnikom koji radi i između procesa.', 'jedna instanca aplikacije, resurs deljen između procesa.'],
            ['Eventi i Barrier', 'System.Threading', '`ManualResetEventSlim`, `CountdownEvent`, `Barrier`: signali između niti.', 'retko u novom kodu; često ih zameni `Task` ili `Channel<T>`.'],
          ]],
          ['Atomično i lokalno', '#ff5d8f', [
            ['Interlocked', 'System.Threading', 'Atomično sabiranje, zamena i compare-and-swap.', 'brojači, zastavice, lock-free izmena jedne vrednosti.'],
            ['Volatile', 'System.Threading', '`Volatile.Read` i `Write` garantuju vidljivost i redosled.', 'zastavica koju jedna nit piše, a druga čita.'],
            ['ThreadLocal<T>', 'System.Threading', 'Svaka nit dobija svoju instancu.', 'skup objekat po niti (bafer) u paralelnoj petlji.'],
            ['AsyncLocal<T>', 'System.Threading', 'Vrednost koja prati async tok kroz await.', 'correlation id i kontekst zahteva.'],
            ['Lazy<T>', 'System', 'Inicijalizacija tačno jednom, bezbedno iz više niti.', 'skup singleton ili keš koji se puni na prvi zahtev.'],
          ]],
          ['Kolekcije', '#7ee0b5', [
            ['ConcurrentDictionary', 'System.Collections.Concurrent', 'Mapa za istovremeno čitanje i upis, sa lock-om po delu tabele.', 'deljen keš i brojači po ključu.'],
            ['ConcurrentQueue', 'System.Collections.Concurrent', 'FIFO red bez zaključavanja.', 'jednostavan red poslova; za čekanje je bolji `Channel<T>`.'],
            ['ConcurrentBag', 'System.Collections.Concurrent', 'Neuređena kolekcija, brza kad ista nit i dodaje i uzima.', 'retko, npr. pul objekata po niti.'],
            ['BlockingCollection', 'System.Collections.Concurrent', 'Red koji blokira nit dok čeka.', 'stariji kod; za novi `Channel<T>`.'],
            ['Immutable kolekcije', 'System.Collections.Immutable', 'Izmena pravi novu verziju, a stara ostaje ista.', 'deljeno stanje koje se retko menja, snimci stanja.'],
            ['Frozen kolekcije', 'System.Collections.Frozen', '`FrozenDictionary` i `FrozenSet` za najbrže čitanje.', 'konfiguracija i tabele koje se posle starta ne menjaju.'],
          ]],
          ['Tokovi i kontrola', '#c3a6ff', [
            ['Channel<T>', 'System.Threading.Channels', 'Async red između proizvođača i potrošača, sa backpressure.', 'pozadinska obrada i pipeline u memoriji.'],
            ['TPL Dataflow', 'NuGet System.Threading.Tasks.Dataflow', 'Blokovi povezani u pipeline, svaki sa svojim paralelizmom.', 'obrada u više faza sa različitim limitima.'],
            ['IAsyncEnumerable<T>', 'System.Collections.Generic', 'Tok elemenata koji stižu asinhrono, kroz `await foreach`.', 'strimovanje rezultata iz baze ili API-ja.'],
            ['Rx.NET', 'NuGet System.Reactive', 'Tokovi događaja sa operatorima (filtriranje, prozori, spajanje).', 'događaji u realnom vremenu, UI i telemetrija.'],
            ['CancellationToken', 'System.Threading', 'Kooperativni prekid posla.', 'svaka async metoda koja može da traje.'],
            ['PeriodicTimer', 'System.Threading', 'Async tajmer: `await WaitForNextTickAsync`.', 'periodičan posao u `BackgroundService`-u.'],
          ]],
        ];
        const flat = MAP.flatMap(([, col, items], ci) => items.map((it, ii) => ({ ci, ii, it, col })));
        let cur = -1, lastUser = -99, shown = new Map(), showCat = null;
        const paint = (e, on) => {
          e.r.setAttribute('fill', on ? '#3a4458' : '#232934');
          e.r.setAttribute('stroke-opacity', on ? 1 : .4);
          e.r.setAttribute('stroke-width', on ? 2.5 : 1.5);
        };
        const select = (fi, user) => {
          const f = flat[fi];
          if (showCat) showCat(f.ci);
          if (shown.has(cur)) paint(shown.get(cur), false);
          cur = fi;
          if (shown.has(fi)) paint(shown.get(fi), true);
          if (user) lastUser = x.t;
          const [name, ns, what, when] = f.it;
          const h = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          x.say(`**${h(name)}** (${h(ns)}). ${h(what)} Kada: ${h(when)}`);
        };
        const chip = (fi, cx, y, w, parent) => {
          const f = flat[fi];
          const g = x.el('g', { tabindex: 0, role: 'button', 'aria-label': f.it[0], style: 'cursor:pointer;outline:none' }, parent);
          const r = x.el('rect', { x: cx, y, width: w, height: 34, rx: 8, fill: '#232934', stroke: f.col, 'stroke-opacity': .4, 'stroke-width': 1.5 }, g);
          x.txt(cx + 12, y + 22, f.it[0], { style: 'font-weight:600' }, g);
          g.addEventListener('click', () => select(fi, true));
          g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(fi, true); } });
          g.addEventListener('focus', () => r.setAttribute('stroke-dasharray', '5 3'));
          g.addEventListener('blur', () => r.removeAttribute('stroke-dasharray'));
          const e = { r };
          shown.set(fi, e);
          if (fi === cur) paint(e, true);
        };
        if (x.W >= 900) {
          // široko: svih pet grupa u kolonama
          const DW = Math.max(x.W, 1060), DH = x.H * DW / x.W;
          x.svg.setAttribute('viewBox', `0 0 ${DW} ${DH}`);
          const gap = 14, cw = (DW - 32 - gap * 4) / 5, rg = 9;
          const rows = Math.max(...MAP.map(m => m[2].length)), total = 44 + rows * (34 + rg);
          const top = Math.max(62, (DH - total) / 2 + 10);
          MAP.forEach(([cat, col], ci) => {
            const cx = 16 + ci * (cw + gap);
            x.el('rect', { x: cx, y: top, width: cw, height: 4, rx: 2, fill: col });
            x.txt(cx, top + 27, cat, { class: 'hd', style: `fill:${col}` });
          });
          flat.forEach((f, fi) => chip(fi, 16 + f.ci * (cw + gap), top + 44 + f.ii * (34 + rg), cw));
          x.txt(16, top - 22, 'Klikni na tip za opis i preporuku. Bez klika, mapa se sama obilazi.', { class: 'sm mut' });
        } else {
          // usko: jedna grupa odjednom, poravnato na vidljivi deo scene
          const VW = Math.max(300, Math.min(x.W, x.stage.el.parentElement?.clientWidth || x.W));
          const x0 = (x.W - VW) / 2 + 12, cwid = VW - 24, pw = (cwid - 16) / 3, cw2 = (cwid - 8) / 2;
          const SHORT = ['Izvršavanje', 'Sinhronizacija', 'Atomično', 'Kolekcije', 'Tokovi'];
          const top = 56;
          const pills = MAP.map(([cat, col], ci) => {
            const px = x0 + (ci % 3) * (pw + 8), py = top + Math.floor(ci / 3) * 42;
            const g = x.el('g', { tabindex: 0, role: 'button', 'aria-label': cat, style: 'cursor:pointer;outline:none' });
            const r = x.el('rect', { x: px, y: py, width: pw, height: 34, rx: 17, fill: '#232934', stroke: col, 'stroke-opacity': .5, 'stroke-width': 1.5 }, g);
            x.txt(px + pw / 2, py + 22, SHORT[ci], { 'text-anchor': 'middle', style: `fill:${col};font-weight:700` }, g);
            const go = () => select(flat.findIndex(f => f.ci === ci), true);
            g.addEventListener('click', go);
            g.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
            return r;
          });
          const list = x.el('g');
          let curCat = -1;
          showCat = ci => {
            if (ci === curCat) return;
            curCat = ci;
            pills.forEach((r, i) => { r.setAttribute('fill', i === ci ? '#3a4458' : '#232934'); r.setAttribute('stroke-opacity', i === ci ? 1 : .5); });
            list.replaceChildren();
            shown = new Map();
            flat.forEach((f, fi) => { if (f.ci === ci) chip(fi, x0 + (f.ii % 2) * (cw2 + 8), top + 98 + Math.floor(f.ii / 2) * 42, cw2, list); });
          };
          x.txt(x0, top - 20, 'Izaberi grupu, pa tip.', { class: 'sm mut' });
        }
        x.every(4.5, () => { if (x.t - lastUser > 14) select((cur + 1) % flat.length, false); });
      },
    },
  },
];
