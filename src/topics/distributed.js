// Distribuirani sistemi
const cs = (t, src) => ({ t, lang: 'csharp', src });
const txt = (t, src) => ({ t, lang: 'plaintext', src });

// FNV-1a 32-bit
const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995) >>> 0; h ^= h >>> 15; return h >>> 0; };

export default [
  // ------------------------------------------------------------------ CAP
  {
    id: 'cap', d: 'distributed', sym: 'Cp', title: 'CAP: particija mreže',
    tags: ['cap', 'pacelc', 'consistency', 'availability', 'partition', 'replikacija', 'replication lag', 'cosmos db', 'kvorum', 'eventual consistency'],
    desc: 'Kad se mreža između replika prekine, sistem bira: da odbije deo zahteva da bi podaci ostali dosledni (**CP**) ili da uvek odgovara, pa replike privremeno imaju različite vrednosti (**AP**).',
    points: [
      'Particija mreže nije izbor nego činjenica: mreže, rutiranje i zone padaju. Bira se samo ponašanje dok traje.',
      'CP: replika koja ne može da potvrdi upis kod ostalih odbija ga (greška ili timeout), ali niko ne čita pogrešne podatke.',
      'AP: svaka replika odgovara, a posle oporavka se usklađuju (last-write-wins, vektorski satovi, CRDT).',
      'PACELC: i bez particije postoji izbor između latencije i doslednosti. Sinhrona replikacija je doslednija, ali sporija.',
      'Kvorum: sa N replika, W potvrda za upis i R za čitanje, ako je W + R > N svako čitanje vidi poslednji upis.',
    ],
    table: {
      title: 'Nivoi doslednosti u Cosmos DB-u',
      head: ['Nivo', 'Šta garantuje', 'Cena'],
      rows: [
        ['Strong', 'Čitanje uvek vidi poslednji potvrđeni upis', 'Najveća latencija; upis čeka replike'],
        ['Bounded staleness', 'Zaostatak najviše K verzija ili T vremena', 'Predvidiva zastarelost'],
        ['Session', 'Tvoja sesija vidi svoje upise, po redu', 'Podrazumevano; dobar kompromis'],
        ['Consistent prefix', 'Upise nikad ne vidiš van redosleda', 'Moguće stare vrednosti'],
        ['Eventual', 'Replike se kad-tad slože', 'Najniža latencija i cena'],
      ],
    },
    code: [
      cs('C# · Cosmos DB: nivo doslednosti klijenta', `
var client = new CosmosClient(connectionString, new CosmosClientOptions
{
    ConsistencyLevel = ConsistencyLevel.Session,   // ne može jače od nivoa naloga
    ApplicationPreferredRegions = new[] { Regions.WestEurope, Regions.NorthEurope }
});`),
      cs('C# · SQL: čitanje sa sekundarne replike', `
// upis uvek ide na primarnu repliku
await using var write = new SqlConnection("Server=shop-sql;Database=Shop;...");

// čitanje sa sekundarne može da kasni za upisom (asinhrona replikacija)
await using var read = new SqlConnection("Server=shop-sql;Database=Shop;ApplicationIntent=ReadOnly;...");`),
      txt('Kvorum', `
N = 3 replike, W = 2 potvrde za upis, R = 2 odgovora za čitanje
W + R = 4 > N  ->  svako čitanje dodirne bar jednu repliku sa poslednjim upisom
W = 1, R = 1   ->  brzo, ali čitanje može da vrati staru vrednost`),
    ],
    pitfalls: [
      '"Biram CA" ne postoji u distribuiranom sistemu: bez particije nema ni izbora.',
      'Čitanje sa replike odmah posle upisa: korisnik ne vidi svoju izmenu. Posle upisa čitaj sa primarne ili koristi sesijsku doslednost.',
      'Last-write-wins sa neusklađenim satovima tiho briše novije upise.',
    ],
    rel: ['consistent-hashing', 'distributed-cache', 'saga'],
    viz: {
      knobs: [{ id: 'mode', label: 'Izbor', value: 'cp', options: [['cp', 'CP: doslednost'], ['ap', 'AP: dostupnost']] }],
      actions: [{ id: 'cut', label: 'Prekini ili vrati mrežu', icon: 'wifi-off' }],
      build(x) {
        const { C, V } = x, cp = x.p.mode === 'cp';
        let part = false, a = 100, b = 100, pending = false;
        const sW = x.stat('w', 'Prihvaćenih upisa', 0, { color: C.ok });
        const sR = x.stat('r', 'Odbijenih zahteva', 0, { color: C.err });
        const sS = x.stat('s', 'Zastarelih čitanja', 0, { color: C.wait });
        x.plate({ at: [-5.2, 0, 0], w: 10.2, d: 7, label: 'Region 1' });
        x.plate({ at: [5.6, 0, 0], w: 10.2, d: 7, label: 'Region 2' });
        const A = x.db({ at: [-2.6, 0, 0], label: 'Replika A: 100' });
        const B = x.db({ at: [3, 0, 0], label: 'Replika B: 100' });
        const link = x.tube(A.port('right'), B.port('left'), { r: .26, color: C.sky });
        const c1 = x.box({ at: [-7.6, 0, 0], size: [2.6, .8, 1.2], label: 'Klijent 1 piše', side: 'in' });
        const c2 = x.box({ at: [8, 0, 0], size: [2.6, .8, 1.2], label: 'Klijent 2 čita', side: 'in' });
        const cut = x.label('Mreža prekinuta', [.2, 1.5, 0], { cls: 'big err', nofit: true });
        cut.visible = false;
        const show = () => { A.text(`Replika A: ${a}`); B.text(`Replika B: ${b}`); };
        const replicate = async val => {
          const o = x.orb(C.sky, { r: .18, label: `${val}` });
          await x.move(o, [link.a, link.b], 7);
          x.remove(o);
          if (!part) { b = Math.max(b, val); show(); B.flash(C.sky, .4); }
          else pending = true;
        };
        const toggle = () => {
          part = !part;
          cut.visible = part;
          link.o.material = link.o.material.clone(); link.o.material.userData.shared = false;
          link.o.material.color.set(part ? C.err : C.glass); link.o.material.opacity = part ? .35 : .15;
          if (part) x.say(cp ? '**Particija.** CP: replika ne može da potvrdi upis kod druge, pa **odbija** upise i čitanja koja bi mogla biti netačna.' : '**Particija.** AP: obe replike i dalje odgovaraju, ali B vraća **staru vrednost**.');
          else if (pending || a !== b) { x.say('Mreža je vraćena: replike se **usklađuju** i B dobija poslednju vrednost.'); pending = false; x.spawn(() => replicate(a)); }
          else x.say('Mreža je vraćena.');
        };
        x.on('cut', toggle);
        x.every(8, toggle, 5);
        x.spawn(async () => {
          while (x.alive) {
            const o = x.orb(C.mag, { r: .22, label: 'upis +10' });
            await x.move(o, [c1.port('right'), A.port('left')], 9);
            if (part && cp) {
              A.flash(C.err, .7); sR.add();
              o.lbl.set('odbijeno'); o.lbl.el.className = 'lbl lbl-tag lbl-err';
              await x.move(o, [A.port('left'), c1.port('right')], 9);
            } else {
              a += 10; show(); A.flash(C.ok, .4); sW.add();
              if (cp) { await replicate(a); }
              else x.spawn(() => replicate(a));
              o.lbl.set('ok'); o.lbl.el.className = 'lbl lbl-tag lbl-ok';
              await x.move(o, [A.port('left'), c1.port('right')], 9);
            }
            x.remove(o);
            await x.wait(1.1);
          }
        });
        x.spawn(async () => {
          await x.wait(.6);
          while (x.alive) {
            const o = x.orb(C.white, { r: .2, halo: false, label: 'čitaj' });
            await x.move(o, [c2.port('left'), B.port('right')], 9);
            if (part && cp) {
              B.flash(C.err, .7); sR.add();
              o.lbl.set('nedostupno'); o.lbl.el.className = 'lbl lbl-tag lbl-err';
            } else {
              const stale = b !== a;
              if (stale) sS.add();
              o.lbl.set(`${b}${stale ? ' (staro)' : ''}`); o.lbl.el.className = 'lbl lbl-tag ' + (stale ? 'lbl-wait' : 'lbl-ok');
            }
            await x.move(o, [B.port('right'), c2.port('left')], 9);
            x.remove(o);
            await x.wait(.9);
          }
        });
        x.say(cp ? 'CP bez particije: upis se potvrđuje tek kad stigne i do B (sinhrono), pa je sporiji, ali čitanje sa B je uvek tačno.' : 'AP bez particije: upis se potvrđuje odmah, a B ga dobija malo kasnije, pa kratko vraća staru vrednost.');
      },
    },
  },

  // ------------------------------------------------------------------ Consistent hashing
  {
    id: 'consistent-hashing', d: 'distributed', sym: 'Hr', title: 'Consistent hashing',
    tags: ['hash ring', 'prsten', 'sharding', 'particionisanje', 'virtual nodes', 'virtuelni čvorovi', 'redis cluster', 'hash slot', 'modulo'],
    desc: 'Ključevi i čvorovi se mapiraju na isti krug. Ključ pripada prvom čvoru u smeru kazaljke na satu. Kad se doda ili ukloni čvor, sele se samo ključevi jednog dela kruga, a ne skoro svi kao kod `hash % N`.',
    points: [
      'Sa `hash(key) % N`, prelaz sa N na N+1 čvorova premešta oko N/(N+1) ključeva, dakle skoro sve. Keš se praktično isprazni.',
      'Na prstenu novi čvor preuzima samo ključeve između sebe i prethodnog čvora: oko 1/N ključeva.',
      'Virtuelni čvorovi (svaki fizički čvor na više tačaka kruga) ravnomernije dele ključeve i opterećenje.',
      'Koriste ga distribuirani keševi, Cassandra i DynamoDB. Redis Cluster koristi srodnu ideju sa 16 384 fiksna slota.',
    ],
    code: [
      cs('C# · Prsten sa virtuelnim čvorovima', `
public sealed class HashRing(int virtualNodes = 100)
{
    private readonly SortedDictionary<uint, string> _ring = new();

    public void Add(string node)
    {
        for (int i = 0; i < virtualNodes; i++) _ring[Hash($"{node}#{i}")] = node;
    }

    public void Remove(string node)
    {
        for (int i = 0; i < virtualNodes; i++) _ring.Remove(Hash($"{node}#{i}"));
    }

    public string GetNode(string key)
    {
        uint h = Hash(key);
        foreach (var (point, node) in _ring)      // prvi čvor u smeru kazaljke
            if (point >= h) return node;          // (u produkciji: binarna pretraga)
        return _ring.First().Value;               // kraj kruga: nazad na početak
    }

    private static uint Hash(string s) => BitConverter.ToUInt32(MD5.HashData(Encoding.UTF8.GetBytes(s)));
}`),
      cs('C# · Modulo: kratko, ali skupo pri promeni', `
string NodeFor(string key, string[] nodes) =>
    nodes[(int)(Hash(key) % (uint)nodes.Length)];   // novi čvor -> skoro svi ključevi se sele`),
      { t: 'Shell · Redis Cluster slotovi', lang: 'bash', src: `
redis-cli -c CLUSTER KEYSLOT user:42        # u koji od 16 384 slota pada ključ
redis-cli -c SET {user:42}:cart "..."       # {hash tag}: ključevi jednog korisnika u istom slotu` },
    ],
    pitfalls: [
      'Bez virtuelnih čvorova jedan čvor lako dobije dvostruko više ključeva od drugog, samo zbog položaja na krugu.',
      'Seljenje ključeva nije besplatno: novi čvor počinje prazan, pa njegov deo kruga kratko ima samo miss-ove.',
    ],
    rel: ['distributed-cache', 'kafka', 'hash-table'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Raspodela', value: 'ring', options: [['ring', 'Prsten'], ['mod', 'hash % N']] },
        { id: 'vn', label: 'Virtuelnih po čvoru', min: 1, max: 8, value: 3 },
      ],
      actions: [{ id: 'add', label: 'Dodaj čvor', icon: 'plus' }, { id: 'rm', label: 'Ukloni čvor', icon: 'minus' }],
      build(x) {
        const { C, V } = x, mod = x.p.mode === 'mod', vn = x.p.vn, R = 5, NK = 48;
        x.view({ dir: [0, 15, 9] });
        const sM = x.stat('m', 'Premešteno', '–', { color: C.mag });
        const sL = x.stat('l', 'Najviše ključeva na čvoru', '–');
        x.plate({ at: [0, 0, 0], w: 15.5, d: 15.5 });
        x.ring([0, .04, 0], R, C.edge, { t: .05 });
        const ang = h => h / 4294967296 * Math.PI * 2;
        const at = (a, r, y = .2) => V(Math.cos(a) * r, y, Math.sin(a) * r);
        const NAMES = ['A', 'B', 'C', 'D', 'E', 'F'];
        let nodes = ['A', 'B', 'C'];
        const nodeVis = {};
        const keys = Array.from({ length: NK }, (_, i) => {
          const h = fnv('key-' + i), a = ang(h);
          const m = x.chip(C.white, { round: true, s: .26, at: at(a, R, .22), glow: .3 });
          return { h, a, m, owner: null };
        });
        const ownerOf = k => {
          if (mod) return nodes[k.h % nodes.length];
          let best = null, bestD = Infinity, first = null, firstA = Infinity;
          for (const n of nodes) for (let i = 0; i < vn; i++) {
            const pa = ang(fnv(n + '#' + i));
            if (pa < firstA) { firstA = pa; first = n; }
            const d = pa - k.a;
            if (d >= 0 && d < bestD) { bestD = d; best = n; }
          }
          return best ?? first;
        };
        const colorOf = n => C.cat[NAMES.indexOf(n) % C.cat.length];
        const drawNode = n => {
          const col = colorOf(n), vis = { marks: [] };
          for (let i = 0; i < vn; i++) {
            const a = ang(fnv(n + '#' + i));
            vis.marks.push(x.box({ at: at(a, R, 0), size: [.34, .5, .34], color: col }));
          }
          const a0 = ang(fnv(n + '#0'));
          vis.box = x.box({ at: at(a0, R + 1.6, 0), size: [1.1, .8, 1.1], color: col, label: `Čvor ${n}`, side: 'top' });
          x.pop(vis.box.o);
          nodeVis[n] = vis;
        };
        const recolor = first => {
          let moved = 0;
          const load = {};
          for (const k of keys) {
            const o = ownerOf(k);
            load[o] = (load[o] || 0) + 1;
            if (!first && o !== k.owner) {
              moved++;
              const m = k.m;
              x.spawn(async () => { await x.tween(.35, t => { m.position.y = .22 + Math.sin(t * Math.PI) * .7; }); });
            }
            k.owner = o;
            const c = colorOf(o);
            k.m.material.color.set(c); k.m.material.emissive.set(c);
          }
          sL.set(Math.max(...Object.values(load)) + ` (idealno ${Math.round(NK / nodes.length)})`);
          if (!first) {
            sM.set(`${moved} od ${NK} (${Math.round(moved / NK * 100)}%)`);
            return moved;
          }
          return 0;
        };
        nodes.forEach(drawNode);
        recolor(true);
        const add = () => {
          const n = NAMES.find(q => !nodes.includes(q));
          if (!n) return;
          nodes = [...nodes, n];
          drawNode(n);
          const moved = recolor(false);
          x.say(mod ? `Dodat je čvor ${n}: sa \`hash % ${nodes.length}\` seli se **${moved} od ${NK}** ključeva.` : `Dodat je čvor ${n}: preuzima samo svoje delove kruga. Seli se **${moved} od ${NK}** ključeva.`);
        };
        const rm = () => {
          if (nodes.length <= 2) return;
          const n = nodes[nodes.length - 1];
          nodes = nodes.slice(0, -1);
          const vis = nodeVis[n];
          vis.marks.forEach(m => x.fadeOut(m, .3)); x.fadeOut(vis.box, .3);
          delete nodeVis[n];
          const moved = recolor(false);
          x.say(mod ? `Uklonjen je čvor ${n}: seli se **${moved} od ${NK}** ključeva, i oni koji nisu bili na ${n}.` : `Uklonjen je čvor ${n}: njegove ključeve preuzima sledeći čvor na krugu (**${moved} od ${NK}**). Ostali ostaju gde su.`);
        };
        x.on('add', add);
        x.on('rm', rm);
        let up = true;
        x.every(4.5, () => { if (up) add(); else rm(); if (nodes.length >= 5) up = false; if (nodes.length <= 3) up = true; }, 3);
        x.say('Boja kugle je čvor koji drži ključ. Ključ pripada **prvom čvoru u smeru kazaljke**. Dodaj ili ukloni čvor i prati koliko kugli promeni boju.');
      },
    },
  },

  // ------------------------------------------------------------------ Saga
  {
    id: 'saga', d: 'distributed', sym: 'Sg', title: 'Saga i kompenzacije',
    tags: ['saga', 'distribuirana transakcija', 'kompenzacija', 'orkestracija', 'koreografija', 'durable functions', 'masstransit', '2pc'],
    desc: 'Transakcija preko više servisa ne može da koristi jedan `ROLLBACK`. Saga je niz lokalnih transakcija, a ako jedan korak padne, prethodni se poništavaju **kompenzacijama** obrnutim redom.',
    points: [
      'Svaki korak je lokalna transakcija u svom servisu i za svaki postoji kompenzacija (naplata, pa povraćaj novca).',
      '**Orkestracija**: centralni orkestrator zna redosled i šalje komande. Lako se prati, ali orkestrator zna za sve.',
      '**Koreografija**: servisi reaguju na događaje jedni drugih. Nema centra, ali je tok teže videti i menjati.',
      'Saga nema izolaciju: drugi vide međustanja (rezervisanu robu pre plaćanja), pa se koriste statusi poput "na čekanju".',
      'Koraci i kompenzacije moraju biti idempotentni, jer poruke mogu da stignu dvaput.',
    ],
    code: [
      cs('C# · Orkestrator (pojednostavljeno)', `
public async Task PlaceOrderAsync(Order order, CancellationToken ct)
{
    var undo = new Stack<Func<Task>>();
    try
    {
        await orders.CreateAsync(order, ct);      undo.Push(() => orders.CancelAsync(order.Id, ct));
        await payments.ChargeAsync(order, ct);    undo.Push(() => payments.RefundAsync(order.Id, ct));
        await inventory.ReserveAsync(order, ct);  undo.Push(() => inventory.ReleaseAsync(order.Id, ct));
        await shipping.ScheduleAsync(order, ct);
    }
    catch (Exception ex)
    {
        logger.LogWarning(ex, "Saga {OrderId} pada, pokrećem kompenzacije", order.Id);
        while (undo.TryPop(out var compensate))
            await compensate();                   // obrnutim redom
        throw;
    }
}`),
      cs('C# · Durable Functions: trajno stanje orkestracije', `
[Function(nameof(OrderSaga))]
public static async Task OrderSaga([OrchestrationTrigger] TaskOrchestrationContext ctx)
{
    var order = ctx.GetInput<Order>()!;
    await ctx.CallActivityAsync("Charge", order);
    try
    {
        await ctx.CallActivityAsync("Reserve", order);
    }
    catch (TaskFailedException)
    {
        await ctx.CallActivityAsync("Refund", order);   // preživljava restart procesa
        throw;
    }
}`),
      cs('C# · Koreografija: servis reaguje na događaj', `
// Inventory servis
public async Task Handle(PaymentCompleted evt, CancellationToken ct)
{
    if (await stock.TryReserveAsync(evt.OrderId, evt.Items, ct))
        await bus.PublishAsync(new StockReserved(evt.OrderId), ct);
    else
        await bus.PublishAsync(new StockReservationFailed(evt.OrderId), ct);   // Payments vraća novac
}`),
    ],
    pitfalls: [
      'Orkestrator sa stanjem samo u memoriji: restart usred sage ostavlja naplatu bez robe. Stanje sage mora biti trajno (baza, Durable Functions, MassTransit).',
      'Kompenzacija ne briše istoriju: povraćaj novca je nova transakcija i vidi se na izvodu.',
      'I kompenzacija može da padne: treba joj retry i plan za ručnu intervenciju.',
    ],
    rel: ['outbox', 'delivery', 'retry-dlq'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Stil', value: 'orch', options: [['orch', 'Orkestracija'], ['chor', 'Koreografija']] },
        { id: 'fail', label: 'Pada', value: 'inv', options: [['none', 'Ništa'], ['inv', 'Inventory'], ['ship', 'Shipping']] },
      ],
      build(x) {
        const { C, V } = x, orch = x.p.mode === 'orch', fail = x.p.fail;
        x.plate({ at: [0, 0, .6], w: 22, d: 9.6 });
        const S = [
          ['Orders', 'kreirana', 'otkazana', 'Cancel'],
          ['Payment', 'naplaćeno', 'vraćeno', 'Refund'],
          ['Inventory', 'rezervisano', 'oslobođeno', 'Release'],
          ['Shipping', 'zakazano', '', ''],
        ].map(([n, ok, undo, cmd], i) => {
          const b = x.box({ at: [-7.5 + i * 5, 0, -1.6], size: [3, 1, 1.4], label: `${n}<small>–</small>`, side: 'in' });
          return { n, ok, undo, cmd, b, i };
        });
        const set = (s, st) => s.b.text(`${s.n}<small>${st}</small>`);
        const orc = orch ? x.box({ at: [0, 0, 3.4], size: [4, 1, 1.4], color: C.mag, label: 'Orkestrator', side: 'in' }) : null;
        const bus = !orch ? x.tube([-9.6, .55, 3.2], [9.6, .55, 3.2], { label: 'Event bus', color: C.sky }) : null;
        if (orc) S.forEach(s => x.rail(orc.port('back'), s.b.port('front'), { opacity: .25 }));
        else S.forEach(s => x.rail(s.b.port('front'), V(s.b.pos.x, .55, 3.2), { opacity: .25 }));
        const send = async (from, to, col, label, speed = 8) => {
          const o = x.orb(col, { label });
          await x.move(o, [from, to], speed);
          x.remove(o);
        };
        const fails = s => (fail === 'inv' && s.n === 'Inventory') || (fail === 'ship' && s.n === 'Shipping');
        const run = async () => {
          S.forEach(s => { set(s, '–'); s.b.reset(); });
          await x.wait(.8);
          let failedAt = -1;
          for (const s of S) {
            x.say(orch ? `Orkestrator šalje komandu servisu **${s.n}**.` : (s.i === 0 ? 'Klijent pokreće sagu u servisu **Orders**.' : `**${s.n}** reaguje na događaj prethodnog koraka.`));
            if (orch) await send(orc.port('back'), s.b.port('front'), C.sky, s.n);
            else if (s.i > 0) await send(V(S[s.i - 1].b.pos.x, .55, 3.2), V(s.b.pos.x, .55, 3.2), C.sky, 'događaj', 6);
            await x.wait(.35);
            if (fails(s)) {
              s.b.paint(C.err); set(s, 'greška'); s.b.flash(C.err, 1);
              x.say(`**${s.n}** ne uspeva (${s.n === 'Inventory' ? 'nema robe' : 'nema kurira'}). Lokalna transakcija nije urađena, a prethodni koraci jesu.`);
              failedAt = s.i;
              await x.wait(1.4);
              break;
            }
            s.b.flash(C.ok, .8); set(s, s.ok);
            if (orch) await send(s.b.port('front'), orc.port('back'), C.ok, 'ok', 10);
            else await send(s.b.port('front'), V(s.b.pos.x, .55, 3.2), C.ok, '', 10);
          }
          if (failedAt < 0) { x.say('Svi koraci su uspeli: saga je završena.'); await x.wait(2.6); return; }
          for (let j = failedAt - 1; j >= 0; j--) {
            const s = S[j];
            x.say(`Kompenzacija: **${s.cmd}** u servisu ${s.n}.`);
            if (orch) await send(orc.port('back'), s.b.port('front'), C.wait, s.cmd);
            else await send(V(S[j + 1].b.pos.x, .55, 3.2), V(s.b.pos.x, .55, 3.2), C.wait, s.cmd, 6);
            s.b.paint(C.wait); set(s, s.undo); s.b.flash(C.wait, .8);
            await x.wait(.6);
          }
          x.say('Kompenzacije su urađene obrnutim redom. Sistem je dosledan, ali **istorija ostaje**: naplata i povraćaj su dve transakcije.');
          await x.wait(3);
        };
        x.spawn(async () => { while (x.alive) await run(); });
      },
    },
  },

  // ------------------------------------------------------------------ Outbox
  {
    id: 'outbox', d: 'distributed', sym: 'Ob', title: 'Outbox pattern',
    tags: ['outbox', 'dual write', 'transakcija', 'relay', 'cdc', 'događaj', 'at-least-once', 'inbox'],
    desc: 'Servis koji upiše u bazu pa objavi događaj može da padne između ta dva koraka. **Outbox** upisuje događaj u istu bazu, u istoj transakciji, a poseban proces ga kasnije objavljuje.',
    points: [
      'Dual write (baza pa broker) nije atomičan: pad između dva koraka daje porudžbinu bez događaja.',
      'Outbox tabela je deo iste transakcije kao poslovni podaci: oba upisa su trajna ili nijedan.',
      'Relay (polling ili CDC iz transakcionog loga) čita outbox, objavljuje i označava šta je poslato.',
      'Isporuka je at-least-once: relay može da objavi dvaput, pa potrošači moraju biti idempotentni (inbox).',
    ],
    code: [
      cs('C# · Porudžbina i događaj u jednoj transakciji', `
db.Orders.Add(order);
db.Outbox.Add(new OutboxMessage
{
    Id = Guid.NewGuid(),
    Type = nameof(OrderCreated),
    Payload = JsonSerializer.Serialize(new OrderCreated(order.Id, order.Total)),
    OccurredAt = DateTime.UtcNow
});

await db.SaveChangesAsync(ct);    // jedan SaveChanges = jedna transakcija: oba reda ili nijedan`),
      cs('C# · Relay kao BackgroundService', `
public sealed class OutboxRelay(IServiceScopeFactory scopes, ServiceBusSender sender) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            using var scope = scopes.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<ShopDb>();

            var batch = await db.Outbox.Where(m => m.SentAt == null)
                .OrderBy(m => m.OccurredAt).Take(50).ToListAsync(ct);

            foreach (var m in batch)
            {
                await sender.SendMessageAsync(new ServiceBusMessage(m.Payload)
                    { MessageId = m.Id.ToString(), Subject = m.Type }, ct);
                m.SentAt = DateTime.UtcNow;
            }
            await db.SaveChangesAsync(ct);
            await Task.Delay(TimeSpan.FromSeconds(1), ct);
        }
    }
}`),
      { t: 'SQL · Outbox tabela', lang: 'sql', src: `
CREATE TABLE Outbox (
    Id          UNIQUEIDENTIFIER PRIMARY KEY,
    Type        NVARCHAR(200)    NOT NULL,
    Payload     NVARCHAR(MAX)    NOT NULL,
    OccurredAt  DATETIME2        NOT NULL,
    SentAt      DATETIME2        NULL
);
CREATE INDEX IX_Outbox_Unsent ON Outbox (OccurredAt) WHERE SentAt IS NULL;` },
    ],
    pitfalls: [
      'Više instanci relay-a bez koordinacije šalje iste poruke paralelno: zaključaj redove (`UPDLOCK, READPAST`) ili pokreni jedan relay.',
      'Outbox koji se nikad ne čisti raste zauvek: briši poslate posle nekoliko dana.',
      'Prosledi `MessageId` iz outbox-a brokeru: tada i detekcija duplikata na brokeru hvata dvostruko slanje.',
    ],
    rel: ['delivery', 'saga', 'queue-vs-topic'],
    viz: {
      knobs: [{ id: 'mode', label: 'Pristup', value: 'dual', options: [['dual', 'Dual write'], ['outbox', 'Outbox']] }],
      build(x) {
        const { C, V } = x, ob = x.p.mode === 'outbox';
        const sO = x.stat('o', 'Porudžbina', 0);
        const sE = x.stat('e', 'Objavljenih događaja', 0, { color: C.ok });
        const sX = x.stat('x', 'Bez događaja', 0, { color: C.err });
        x.plate({ at: [.4, 0, .6], w: 22, d: 9.4, label: ob ? 'Porudžbina i događaj u istoj transakciji' : 'Upis u bazu, pa posebno slanje brokeru' });
        const svc = x.box({ at: [-7.6, 0, -1.4], size: [2.8, 1, 1.4], label: 'Order servis', side: 'in' });
        const db = x.db({ at: [-1.2, 0, -1.4], r: 1.1, h: 1.4, label: 'Baza' });
        const tb = x.tube([3, .55, -1.4], [7.6, .55, -1.4], { label: 'Broker' });
        const con = x.box({ at: [9.6, 0, -1.4], size: [2, .9, 1.2], label: 'Potrošač', side: 'in' });
        x.rail(svc.port('right'), db.port('left'), { opacity: .3 });
        x.label('Orders', [-1.2, .1, 1.1], { cls: 'plate', center: [.5, 0] });
        if (ob) x.label('Outbox', [-1.2, .1, 3.2], { cls: 'plate', color: C.mag, center: [.5, 0] });
        const relay = ob ? x.box({ at: [3.6, 0, 2.8], size: [2.4, .9, 1.2], color: C.mag, label: 'Relay', side: 'in' }) : null;
        if (relay) x.rail(relay.port('top'), tb.a, { opacity: .25 });
        const orders = [], outbox = [];
        const place = (arr, z) => arr.forEach((m, i) => m.position.set(-3 + (i % 7) * .6, .2, z + Math.floor(i / 7) * .6));
        const addRow = (arr, col, z) => { const m = x.chip(col, { s: .42 }); arr.push(m); if (arr.length > 14) x.remove(arr.shift()); place(arr, z); x.pop(m); return m; };
        const publish = async (from, label) => {
          const e = x.orb(C.mag, { r: .22, label });
          await x.move(e, [...from, tb.a, tb.b, con.port('left')], [9, 9, 6, 8]);
          con.flash(C.ok, .4); sE.add();
          x.remove(e);
        };
        let n = 0;
        x.spawn(async () => {
          while (x.alive) {
            const id = ++n, col = C.cat[id % C.cat.length];
            const o = x.orb(col, { label: `#${id}` });
            await x.move(o, [svc.port('right'), db.port('left')], 9);
            x.remove(o);
            db.flash(C.ok, .5);
            const row = addRow(orders, col, 1.8);
            sO.add();
            if (ob) {
              const ev = addRow(outbox, C.mag, 3.9);
              ev.userData.id = id;
              x.say(`#${id}: porudžbina i red u outbox-u upisani **u istoj transakciji**.`);
              await x.wait(.6);
              if (x.rnd() < .35) { svc.flash(C.err, 1); x.say(`Servis je pao posle upisa #${id}, ali događaj **je već u outbox-u**: relay će ga poslati.`); await x.wait(1); }
            } else {
              await x.wait(.6);
              if (x.rnd() < .35) {
                svc.flash(C.err, 1); sX.add();
                row.material.emissive.set(C.err); row.material.emissiveIntensity = .9;
                x.say(`Servis je pao **između upisa i slanja**: porudžbina #${id} postoji, a događaj nikad neće stići.`);
                await x.wait(1.6);
              } else {
                x.say(`#${id}: upis u bazu uspeo, pa servis šalje događaj brokeru.`);
                await publish([svc.port('top'), V(-1.2, 2.4, -1.4)], `#${id}`);
              }
            }
            await x.wait(.7);
          }
        });
        if (ob) {
          x.spawn(async () => {
            await x.wait(2);
            while (x.alive) {
              const pend = outbox.filter(m => !m.userData.sent);
              for (const m of pend) {
                relay.flash(C.mag, .4);
                m.userData.sent = true;
                m.material.color.set(C.dim); m.material.emissive.set(C.dim);
                await publish([relay.port('top'), relay.port('top', .01)], `#${m.userData.id}`);
              }
              await x.wait(1.2);
            }
          });
        }
      },
    },
  },
];
