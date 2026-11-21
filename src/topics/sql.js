// Baze i SQL
const cs = (t, src) => ({ t, lang: 'csharp', src });
const sql = (t, src) => ({ t, lang: 'sql', src });

const NAME = { RU: 'Read Uncommitted', RC: 'Read Committed (lock-ovi)', RR: 'Repeatable Read', SER: 'Serializable', SNAP: 'Snapshot' };
const fin = (steps, bad, name) => Object.assign(steps, {
  verdict: bad ? { bad, text: `Anomalija: ${name}`, say: `Na ovom nivou anomalija se **desila**: ${name}.` } : { bad, text: 'Nema anomalije', say: 'Na ovom nivou anomalija se **ne dešava**. Cena je čekanje (lock) ili čuvanje starih verzija.' },
});
const SCEN = {
  dirty: lv => {
    const s = [
      { t: 1, l: ['BEGIN TRAN'], d: 'potvrđeno: stanje = 100' },
      { t: 1, l: ['UPDATE', 'stanje = 50', 'bez COMMIT-a'], d: 'potvrđeno: 100, nepotvrđeno: 50', say: 'T1 menja stanje na 50, ali još nije uradila COMMIT.' },
    ];
    if (lv === 'RU') return fin([...s,
      { t: 2, l: ['SELECT stanje', '→ 50'], k: 'bad', say: 'Read Uncommitted: T2 čita **nepotvrđenih 50**.' },
      { t: 1, l: ['ROLLBACK'], d: 'potvrđeno: stanje = 100', say: 'T1 poništava izmenu. Vrednost 50 nikad nije postojala, a T2 ju je već iskoristila.' },
    ], true, 'prljavo čitanje');
    if (lv === 'SNAP') return fin([...s,
      { t: 2, l: ['SELECT stanje', '→ 100', 'stara verzija'], k: 'good', say: 'Snapshot: T2 čita **poslednju potvrđenu verziju**, bez čekanja.' },
      { t: 1, l: ['ROLLBACK'], d: 'potvrđeno: stanje = 100' },
    ], false);
    return fin([...s,
      { t: 2, l: ['SELECT stanje', 'čeka lock'], k: 'wait', say: `${NAME[lv]}: T2 **čeka**, jer je red zaključan dok T1 ne završi.` },
      { t: 1, l: ['ROLLBACK'], d: 'potvrđeno: stanje = 100', say: 'T1 poništava izmenu i pušta lock.' },
      { t: 2, l: ['SELECT', 'nastavlja', '→ 100'], k: 'good', say: 'T2 dobija potvrđenu vrednost.' },
    ], false);
  },
  nonrep: lv => {
    const s = [
      { t: 1, l: ['BEGIN TRAN'], d: 'stanje = 100' },
      { t: 1, l: ['SELECT stanje', '→ 100'], say: 'T1 čita stanje: 100.' },
    ];
    if (lv === 'RR' || lv === 'SER') return fin([...s,
      { t: 2, l: ['UPDATE', 'stanje = 50', 'čeka lock'], k: 'wait', say: `${NAME[lv]}: T1 drži deljeni lock na pročitanom redu do kraja, pa T2 **čeka**.` },
      { t: 1, l: ['SELECT stanje', '→ 100'], k: 'good', say: 'T1 čita ponovo i dobija istu vrednost.' },
      { t: 1, l: ['COMMIT'], say: 'T1 završava i pušta lock.' },
      { t: 2, l: ['UPDATE prolazi', 'i COMMIT'], d: 'stanje = 50' },
    ], false);
    if (lv === 'SNAP') return fin([...s,
      { t: 2, l: ['UPDATE', 'stanje = 50'] },
      { t: 2, l: ['COMMIT'], d: 'stanje = 50 (stara verzija se čuva)' },
      { t: 1, l: ['SELECT stanje', '→ 100', 'stara verzija'], k: 'good', say: 'Snapshot: T1 vidi bazu kakva je bila **na početku svoje transakcije**.' },
      { t: 1, l: ['COMMIT'] },
    ], false);
    return fin([...s,
      { t: 2, l: ['UPDATE', 'stanje = 50'], say: `${NAME[lv]}: T1 ne drži lock posle čitanja, pa T2 menja red.` },
      { t: 2, l: ['COMMIT'], d: 'stanje = 50' },
      { t: 1, l: ['SELECT stanje', '→ 50'], k: 'bad', say: 'Isti upit u istoj transakciji vraća **drugu vrednost**.' },
      { t: 1, l: ['COMMIT'] },
    ], true, 'neponovljivo čitanje');
  },
  phantom: lv => {
    const s = [
      { t: 1, l: ['BEGIN TRAN'], d: 'porudžbina većih od 100: 3' },
      { t: 1, l: ['COUNT(*)', 'iznos > 100', '→ 3'], say: 'T1 broji porudžbine veće od 100: ima ih 3.' },
    ];
    if (lv === 'SER') return fin([...s,
      { t: 2, l: ['INSERT 500', 'čeka na', 'range lock'], k: 'wait', say: 'Serializable zaključava i **opseg ključeva**, pa INSERT u taj opseg čeka.' },
      { t: 1, l: ['COUNT(*)', 'iznos > 100', '→ 3'], k: 'good' },
      { t: 1, l: ['COMMIT'] },
      { t: 2, l: ['INSERT prolazi', 'i COMMIT'], d: 'porudžbina većih od 100: 4' },
    ], false);
    if (lv === 'SNAP') return fin([...s,
      { t: 2, l: ['INSERT 500'] },
      { t: 2, l: ['COMMIT'], d: 'porudžbina većih od 100: 4' },
      { t: 1, l: ['COUNT(*)', 'iznos > 100', '→ 3 (verzija)'], k: 'good', say: 'Snapshot: T1 i dalje vidi svoju verziju podataka.' },
      { t: 1, l: ['COMMIT'] },
    ], false);
    return fin([...s,
      { t: 2, l: ['INSERT 500'], say: lv === 'RR' ? 'Repeatable Read zaključava pročitane redove, ali **ne i prazan prostor** između njih.' : 'Ništa ne sprečava novi red u opsegu koji T1 čita.' },
      { t: 2, l: ['COMMIT'], d: 'porudžbina većih od 100: 4' },
      { t: 1, l: ['COUNT(*)', 'iznos > 100', '→ 4'], k: 'bad', say: 'Isti upit sada vidi **red koji ranije nije postojao**.' },
      { t: 1, l: ['COMMIT'] },
    ], true, 'fantomsko čitanje');
  },
};

export default [
  // ------------------------------------------------------------------ B+ stablo
  {
    id: 'btree', d: 'sql', sym: 'Bt', title: 'Indeks: B+ stablo',
    tags: ['index', 'indeks', 'b-tree', 'b+ tree', 'seek', 'scan', 'clustered', 'nonclustered', 'key lookup', 'include', 'stranica', 'execution plan'],
    desc: 'Indeks u SQL Serveru je B+ stablo stranica od 8 KB. Pretraga po ključu (**seek**) prolazi kroz par nivoa do lista, a bez odgovarajućeg indeksa baza čita sve stranice redom (**scan**).',
    points: [
      'Koren i unutrašnji čvorovi čuvaju opsege ključeva; listovi čuvaju redove (clustered) ili ključ i pokazivač na red (nonclustered).',
      'Dubina raste logaritamski: milioni redova staju u 3 do 4 nivoa, pa je seek svega nekoliko čitanja stranica.',
      'Listovi su povezani, pa je upit po opsegu (`BETWEEN`) jedan seek do početka i zatim šetnja po listovima.',
      'Nonclustered indeks bez svih kolona upita radi **key lookup** za svaki red. `INCLUDE` kolone prave pokrivajući indeks.',
      'Indeks ubrzava čitanje, a usporava upis: svaki INSERT, UPDATE i DELETE menja i stablo.',
    ],
    code: [
      sql('SQL · clustered i pokrivajući nonclustered indeks', `
CREATE CLUSTERED INDEX CX_Orders ON dbo.Orders (Id);

CREATE NONCLUSTERED INDEX IX_Orders_Customer
    ON dbo.Orders (CustomerId, OrderDate DESC)
    INCLUDE (Total, Status);                     -- upit ne mora do tabele

SELECT OrderDate, Total
FROM dbo.Orders
WHERE CustomerId = 42 AND OrderDate >= '2026-01-01';   -- Index Seek, bez Key Lookup`),
      sql('SQL · šta upit stvarno čita', `
SET STATISTICS IO ON;                           -- broj pročitanih stranica (logical reads)

SELECT * FROM dbo.Orders WHERE Total > 100;     -- bez indeksa na Total: Clustered Index Scan

-- funkcija nad kolonom sprečava seek:
SELECT * FROM dbo.Orders WHERE YEAR(OrderDate) = 2026;                            -- scan
SELECT * FROM dbo.Orders WHERE OrderDate >= '2026-01-01' AND OrderDate < '2027-01-01';  -- seek`),
      cs('C# · EF Core indeks sa INCLUDE kolonama', `
modelBuilder.Entity<Order>()
    .HasIndex(o => new { o.CustomerId, o.OrderDate })
    .IncludeProperties(o => new { o.Total, o.Status });   // SQL Server provider`),
    ],
    pitfalls: [
      'Indeks na koloni sa malo različitih vrednosti (npr. `IsDeleted`) retko pomaže: optimizer ipak bira scan.',
      'Nasumičan GUID kao clustered ključ cepa stranice pri upisu. Sekvencijalni ključ (identity, `NEWSEQUENTIALID`) to izbegava.',
      'Previše indeksa na tabeli sa mnogo upisa: svaki upis plaća održavanje svih stabala.',
    ],
    rel: ['isolation', 'n-plus-one', 'binary-search'],
    viz: {
      knobs: [{ id: 'mode', label: 'Upit', value: 'seek', options: [['seek', 'WHERE Id = x'], ['range', 'BETWEEN'], ['scan', 'Bez indeksa (scan)']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode;
        x.view({ dir: [0, 13, 11] });
        const sP = x.stat('p', 'Pročitanih stranica', 0, { color: C.mag });
        x.plate({ at: [0, 0, .3], w: 25, d: 10.6 });
        const leaves = Array.from({ length: 9 }, (_, i) => {
          const lo = i === 0 ? 1 : i * 10, hi = i * 10 + 9;
          const b = x.box({ at: [-10 + i * 2.5, 0, 3], size: [2.1, .34, 1.1], label: `${lo}–${hi}`, side: 'in' });
          b.lo = lo; b.hi = hi;
          return b;
        });
        const inner = [['10 | 20', 0], ['40 | 50', 3], ['70 | 80', 6]].map(([k, f], i) => {
          const b = x.box({ at: [-7.5 + i * 7.5, 0, -.3], size: [2.8, .34, 1.1], label: k, side: 'in' });
          for (let j = f; j < f + 3; j++) x.rail(b.port('front', -.1), leaves[j].port('back', -.1), { opacity: .35 });
          b.first = f;
          return b;
        });
        const root = x.box({ at: [0, 0, -3.6], size: [3.2, .34, 1.1], label: '30 | 60', side: 'in' });
        inner.forEach(b => x.rail(root.port('front', -.1), b.port('back', -.1), { opacity: .35 }));
        for (let i = 0; i < 8; i++) x.arrow(leaves[i].port('right', -.05), leaves[i + 1].port('left', -.05), { color: C.sky, opacity: .6, r: .03, head: .22 });
        x.label('Koren', [-12.9, .1, -3.6], { cls: 'plate', center: [1, .5] });
        x.label('Unutrašnji', [-12.9, .1, -.3], { cls: 'plate', center: [1, .5] });
        x.label('Listovi', [-12.9, .1, 3], { cls: 'plate', center: [1, .5] });
        const all = [root, ...inner, ...leaves];
        const visit = async (o, node) => {
          await x.move(o, [o.position.clone(), node.port('top', .35)], 9);
          node.paint(C.mag); node.flash(C.mag, .5);
          sP.add();
          await x.wait(.35);
        };
        x.spawn(async () => {
          while (x.alive) {
            all.forEach(b => b.reset());
            sP.set(0);
            const o = x.orb(C.mag, { r: .24 });
            o.position.copy(root.port('top', 1.4));
            if (mode === 'scan') {
              x.say('Bez indeksa na traženoj koloni baza čita **sve stranice** redom. Ovde ih je 9, u pravoj tabeli hiljade.');
              for (const lf of leaves) await visit(o, lf);
            } else {
              const k = mode === 'seek' ? 5 + Math.floor(x.rnd() * 84) : 34 + Math.floor(x.rnd() * 10);
              const k2 = k + 22;
              const ii = k < 30 ? 0 : k < 60 ? 1 : 2;
              const lf = leaves.findIndex(l => k >= l.lo && k <= l.hi);
              x.say(mode === 'seek' ? `**WHERE Id = ${k}**: koren, pa unutrašnji čvor, pa list. Tri stranice umesto svih.` : `**WHERE Id BETWEEN ${k} AND ${k2}**: seek do prvog lista, pa šetnja po povezanim listovima.`);
              await visit(o, root);
              await visit(o, inner[ii]);
              await visit(o, leaves[lf]);
              if (mode === 'range') {
                for (let j = lf + 1; j < leaves.length && leaves[j].lo <= k2; j++) await visit(o, leaves[j]);
              }
            }
            x.fadeOut(o, .3);
            await x.wait(2.4);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Izolacija
  {
    id: 'isolation', d: 'sql', sym: 'Il', title: 'Izolacioni nivoi',
    tags: ['isolation level', 'izolacija', 'transakcija', 'acid', 'dirty read', 'non-repeatable read', 'phantom', 'snapshot', 'rcsi', 'serializable', 'lock'],
    desc: 'Izolacioni nivo određuje šta transakcija vidi od tuđih izmena: nepotvrđene, upravo potvrđene ili samo stanje sa svog početka. Viši nivo daje manje anomalija, a plaća se čekanjem ili verzijama.',
    points: [
      '**Prljavo čitanje**: čitaš izmenu koja još nije potvrđena i možda će biti poništena.',
      '**Neponovljivo čitanje**: isti red pročitan dvaput u istoj transakciji vraća različite vrednosti.',
      '**Fantom**: isti upit po opsegu dvaput vraća različit skup redova, jer je neko ubacio novi.',
      'SQL Server podrazumevano koristi Read Committed sa lock-ovima; Azure SQL Database ima uključen RCSI, pa čitanja ne čekaju upise.',
      'Snapshot sprečava sve tri anomalije, ali dozvoljava **write skew**, a pri sukobu upisa jednu transakciju prekida greškom 3960.',
    ],
    table: {
      title: 'Nivoi i anomalije',
      head: ['Nivo', 'Prljavo', 'Neponovljivo', 'Fantom', 'Kako'],
      rows: [
        ['Read Uncommitted', 'da', 'da', 'da', 'čita bez deljenih lock-ova'],
        ['Read Committed', 'ne', 'da', 'da', 'lock samo dok čita red (podrazumevano)'],
        ['RCSI', 'ne', 'da', 'da', 'čita poslednju potvrđenu verziju (Azure SQL)'],
        ['Repeatable Read', 'ne', 'ne', 'da', 'drži lock nad pročitanim redovima do kraja'],
        ['Serializable', 'ne', 'ne', 'ne', 'zaključava i opsege ključeva'],
        ['Snapshot', 'ne', 'ne', 'ne', 'cela transakcija vidi jednu verziju'],
      ],
    },
    code: [
      sql('SQL · nivo za jednu transakciju i za celu bazu', `
SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
BEGIN TRAN;
    SELECT Balance FROM Accounts WHERE Id = 1;   -- deljeni lock do kraja transakcije
    SELECT Balance FROM Accounts WHERE Id = 1;   -- garantovano ista vrednost
COMMIT;

ALTER DATABASE Shop SET READ_COMMITTED_SNAPSHOT ON;   -- RCSI za celu bazu
ALTER DATABASE Shop SET ALLOW_SNAPSHOT_ISOLATION ON;  -- dozvoli SNAPSHOT nivo`),
      cs('C# · EF Core transakcija sa nivoom', `
await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable, ct);

var taken = await db.Seats.CountAsync(s => s.FlightId == id && s.Taken, ct);
if (taken < capacity)
    db.Bookings.Add(new Booking(id, userId));

await db.SaveChangesAsync(ct);
await tx.CommitAsync(ct);        // greška 1205 (deadlock) ili 3960 (snapshot sukob): ponovi`),
      cs('C# · Optimistička konkurentnost (rowversion)', `
public class Product
{
    public int Id { get; set; }
    public decimal Price { get; set; }
    [Timestamp] public byte[] RowVersion { get; set; } = [];   // menja se pri svakom upisu
}

try { await db.SaveChangesAsync(ct); }
catch (DbUpdateConcurrencyException) { /* neko je promenio red u međuvremenu: učitaj ponovo */ }`),
    ],
    pitfalls: [
      'Serializable "za svaki slučaj": više deadlock-ova i čekanja čim poraste opterećenje.',
      '`NOLOCK` radi brzine ne čita samo nepotvrđeno: pri cepanju stranica može da pročita isti red dvaput ili nijednom.',
    ],
    rel: ['deadlock', 'btree', 'race'],
    viz: {
      kind: 'svg',
      knobs: [
        { id: 'sc', label: 'Anomalija', value: 'nonrep', options: [['dirty', 'Prljavo čitanje'], ['nonrep', 'Neponovljivo'], ['phantom', 'Fantom']] },
        { id: 'lvl', label: 'Nivo', value: 'RC', options: [['RU', 'RU'], ['RC', 'RC'], ['RR', 'RR'], ['SER', 'Serializable'], ['SNAP', 'Snapshot']] },
      ],
      build(x) {
        const { C } = x, lv = x.p.lvl, steps = SCEN[x.p.sc](lv);
        const DW = Math.max(x.W, 880), DH = x.H * DW / x.W;
        x.svg.setAttribute('viewBox', `0 0 ${DW} ${DH}`);
        const m = { l: 74, r: 22, t: 70, b: 62 };
        const lane = { 1: m.t + (DH - m.t - m.b) * .24, 2: m.t + (DH - m.t - m.b) * .76 };
        const n = steps.length, colW = (DW - m.l - m.r) / n, bw = Math.min(colW - 12, 200);
        for (const t of [1, 2]) {
          x.el('line', { x1: m.l - 6, x2: DW - m.r, y1: lane[t], y2: lane[t], stroke: '#4b5566', 'stroke-dasharray': '4 7', 'stroke-width': 1.5 });
          x.txt(22, lane[t] + 5, `T${t}`, { class: 'hd' });
        }
        x.txt(m.l, 36, `Nivo: ${NAME[lv]}`, { class: 'hd' });
        const verdict = x.txt(DW - m.r, 36, '', { class: 'hd', 'text-anchor': 'end' });
        const data = x.txt(m.l, DH - 24, '', { class: 'mono mut' });
        x.txt(DW - m.r, DH - 24, 'vreme →', { class: 'sm mut', 'text-anchor': 'end' });
        const g = x.el('g');
        const COL = { op: '#5aa9ff', bad: '#ff4d6d', good: '#3ddc97', wait: '#ffd166' };
        x.spawn(async () => {
          while (x.alive) {
            g.replaceChildren();
            verdict.textContent = '';
            const pos = [];
            for (let i = 0; i < n; i++) {
              const s = steps[i], k = s.k || 'op';
              const cx = m.l + colW * i + colW / 2, cy = lane[s.t], bh = 22 + s.l.length * 18;
              pos.push([cx, cy, bh]);
              const bx = x.el('g', { opacity: 0 }, g);
              x.el('rect', { x: cx - bw / 2, y: cy - bh / 2, width: bw, height: bh, rx: 10, fill: '#161a21', stroke: COL[k], 'stroke-width': k === 'op' ? 1.5 : 2.5, 'stroke-dasharray': k === 'wait' ? '6 5' : null }, bx);
              s.l.forEach((ln, j) => {
                const last = j === s.l.length - 1 && s.l.length > 1;
                const tx = x.txt(cx, cy - (s.l.length - 1) * 9 + j * 18 + 5, ln, { 'text-anchor': 'middle', class: j ? 'sm' : '' }, bx);
                if (last && k !== 'op') tx.setAttribute('style', `fill:${COL[k]};font-weight:700`);
              });
              const resumeOf = s.l[0].includes('prolazi') || s.l[1] === 'nastavlja';
              if (resumeOf) {
                const wi = steps.findIndex(q => q.k === 'wait');
                if (wi >= 0) {
                  const [wx, wy, wh] = pos[wi];
                  x.el('path', { d: `M${wx + bw / 2} ${wy} L${cx - bw / 2 - 4} ${cy}`, stroke: COL.wait, 'stroke-width': 1.5, 'stroke-dasharray': '3 5', fill: 'none', 'marker-end': 'url(#m-arw)' }, bx);
                }
              }
              await x.tween(.35, q => bx.setAttribute('opacity', q));
              if (s.say) x.say(s.say);
              if (s.d) data.textContent = s.d;
              await x.wait(1.6);
            }
            verdict.textContent = steps.verdict.text;
            verdict.setAttribute('style', `fill:${steps.verdict.bad ? COL.bad : COL.good}`);
            x.say(steps.verdict.say);
            await x.wait(3.6);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ N+1
  {
    id: 'n-plus-one', d: 'sql', sym: 'N1', title: 'N+1 upit',
    tags: ['n+1', 'ef core', 'include', 'lazy loading', 'orm', 'projekcija', 'select', 'asplitquery', 'roundtrip', 'latencija'],
    desc: 'Jedan upit za listu, pa po jedan upit za svaki element liste: N+1 upit umesto jednog. Na lokalnoj mašini se ne primeti, a u produkciji svaki odlazak do baze košta milisekunde.',
    points: [
      'Nastaje kad se povezani podaci učitavaju u petlji: lazy loading ili ručni upit po elementu.',
      'Ukupno vreme je otprilike broj upita × latencija do baze: 200 porudžbina × 2 ms = 400 ms samo na čekanje mreže.',
      '`Include` spaja podatke u jedan upit (JOIN). Projekcija `Select` vraća samo kolone koje ekran prikazuje.',
      'Više `Include` kolekcija u jednom upitu pravi kartezijanski proizvod. `AsSplitQuery` ga deli na nekoliko upita.',
      'Vidi se u logu (isti SQL ponovljen N puta) ili u tracingu kao niz istih kratkih spanova.',
    ],
    code: [
      cs('C# · N+1', `
var orders = await db.Orders.Where(o => o.CustomerId == id).ToListAsync(ct);    // 1 upit

foreach (var o in orders)
    o.Items = await db.OrderItems.Where(i => i.OrderId == o.Id).ToListAsync(ct); // + N upita`),
      cs('C# · Jedan upit', `
var orders = await db.Orders
    .Where(o => o.CustomerId == id)
    .Include(o => o.Items)              // JOIN u jednom upitu
    .AsNoTracking()
    .ToListAsync(ct);

// ili samo ono što ekran prikazuje
var rows = await db.Orders
    .Where(o => o.CustomerId == id)
    .Select(o => new { o.Id, o.OrderDate, Items = o.Items.Count, o.Total })
    .ToListAsync(ct);`),
      cs('C# · Uključi log SQL-a da se N+1 vidi', `
builder.Services.AddDbContext<ShopDb>(o => o
    .UseSqlServer(connectionString)
    .LogTo(Console.WriteLine, LogLevel.Information)     // svaki upit u konzoli
    .EnableSensitiveDataLogging(builder.Environment.IsDevelopment()));`),
    ],
    pitfalls: [
      'Lazy loading proxy (`UseLazyLoadingProxies`) pravi N+1 neprimetno, čim šablon ili serializer dotakne navigaciju.',
      '`Include` svega "za svaki slučaj" vuče megabajte koje ekran ne prikazuje.',
    ],
    rel: ['latency', 'tracing', 'btree'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Kod', value: 'n1', options: [['n1', 'Upit u petlji'], ['inc', 'Include'], ['sel', 'Select projekcija']] },
        { id: 'n', label: 'Porudžbina', min: 4, max: 20, value: 10 },
      ],
      build(x) {
        const { C, V } = x, mode = x.p.mode, N = x.p.n;
        const sQ = x.stat('q', 'Upita', 0, { color: C.mag });
        const sT = x.stat('t', 'Vreme', '0 ms', { color: C.wait });
        x.plate({ at: [.4, 0, .9], w: 22.6, d: 8.6, label: { n1: '1 upit za listu + 1 upit po porudžbini', inc: 'Jedan upit sa JOIN-om', sel: 'Jedan upit, samo potrebne kolone' }[mode] });
        const app = x.box({ at: [-7.8, 0, -.6], size: [3, 1, 1.4], label: 'Aplikacija (EF Core)', side: 'in' });
        const db = x.db({ at: [7.6, 0, -.6], r: 1.1, h: 1.5, label: 'SQL baza' });
        x.rail(app.port('right'), db.port('left'), { opacity: .3 });
        x.label('oko 2 ms po odlasku i povratku', [0, .1, .4], { cls: 'plate', center: [.5, 0] });
        const res = [];
        const chip = (col, i, s = .34) => { const m = x.chip(col, { s }); m.position.set(-10.3 + (i % 10) * .5, .2, 2.2 + Math.floor(i / 10) * .5); res.push(m); x.pop(m); return m; };
        const trip = async (label, col, r = .2, speed = 30) => {
          const o = x.orb(col, { r, label });
          await x.move(o, [app.port('right'), db.port('left')], speed);
          db.flash(C.wait, .25);
          await x.move(o, [db.port('left'), app.port('right')], speed);
          x.remove(o);
        };
        x.spawn(async () => {
          while (x.alive) {
            res.splice(0).forEach(m => x.remove(m));
            let q = 0, ms = 0;
            const upd = () => { sQ.set(q); sT.set(Math.round(ms) + ' ms'); };
            upd();
            await x.wait(.8);
            if (mode === 'n1') {
              x.say('Prvi upit vraća listu porudžbina...');
              await trip('SELECT Orders', C.sky, .26, 18); q++; ms += 2 + N * .02; upd();
              for (let i = 0; i < N; i++) chip(C.sky, i);
              x.say(`...a zatim **po jedan upit za stavke svake porudžbine**: još ${N} odlazaka do baze.`);
              for (let i = 0; i < N; i++) { await trip(`Items #${i + 1}`, C.mag, .18, 34); q++; ms += 2.1; upd(); res[i].material.color.set(C.mag); res[i].material.emissive.set(C.mag); }
              x.say(`**${q} upita**, oko ${Math.round(ms)} ms samo na čekanje mreže. Sa 200 porudžbina bilo bi preko 400 ms.`);
            } else {
              x.say(mode === 'inc' ? 'Jedan upit sa JOIN-om vraća porudžbine i stavke odjednom.' : 'Jedan upit vraća samo kolone koje ekran prikazuje.');
              await trip(mode === 'inc' ? 'SELECT … JOIN' : 'SELECT Id, Total…', mode === 'inc' ? C.mag : C.ok, mode === 'inc' ? .42 : .3, 16);
              q = 1; ms = 2 + N * (mode === 'inc' ? .08 : .02); upd();
              for (let i = 0; i < N; i++) chip(mode === 'inc' ? C.mag : C.ok, i);
              x.say(`**1 upit**, oko ${Math.round(ms)} ms. ${mode === 'inc' ? 'Više podataka po upitu, ali jedan odlazak do baze.' : 'Najmanje podataka i jedan odlazak do baze.'}`);
            }
            await x.wait(3);
          }
        });
      },
    },
  },
];
