// Angular
const ts = (t, src) => ({ t, lang: 'typescript', src });

export default [
  // ------------------------------------------------------------------ Change detection
  {
    id: 'change-detection', d: 'angular', sym: 'Cd', title: 'Detekcija promena i signali',
    tags: ['change detection', 'onpush', 'zone.js', 'zoneless', 'signal', 'computed', 'effect', 'detekcija promena', 'performanse'],
    desc: 'Kad se nešto desi (klik, HTTP odgovor, tajmer), Angular proverava komponente i osvežava DOM. **Default** proverava celo stablo, **OnPush** preskače grane čiji ulazi nisu promenjeni, a **signali** osvežavaju samo ono što ih čita.',
    points: [
      'Default (zone.js): svaki događaj pokreće proveru svih komponenti, od korena nadole.',
      'OnPush: komponenta se proverava kad joj se promeni referenca ulaza (`input`), kad u njoj nastane događaj ili kad `async` pipe dobije vrednost.',
      'Signali: šablon koji čita `count()` beleži zavisnost, pa promena signala označava samo te komponente.',
      'Zoneless (`provideZonelessChangeDetection`) uklanja zone.js; promene javljaju signali, događaji iz šablona i `async` pipe.',
      'Mutacija niza ili objekta (`items.push`) ne menja referencu, pa je OnPush ne vidi. Pravi novu referencu.',
    ],
    code: [
      ts('TypeScript · OnPush komponenta sa signalima', `
@Component({
  selector: 'app-cart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: \`
    <p>Stavki: {{ count() }}, ukupno: {{ total() }} RSD</p>
    <button (click)="add(item())">Dodaj</button>
  \`,
})
export class CartComponent {
  item = input.required<Item>();
  items = signal<Item[]>([]);
  count = computed(() => this.items().length);
  total = computed(() => this.items().reduce((s, i) => s + i.price, 0));

  add(item: Item) {
    this.items.update(list => [...list, item]);   // nova referenca, computed se preračuna
  }
}`),
      ts('TypeScript · aplikacija bez zone.js', `
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection(), provideHttpClient()],
});`),
      ts('TypeScript · OnPush zamka', `
// ne vidi se sa OnPush: ista referenca niza
this.items.push(newItem);

// radi: nova referenca
this.items = [...this.items, newItem];`),
    ],
    pitfalls: [
      'Poziv obične funkcije u šablonu (`{{ calc() }}` koja nije signal) izvršava se pri svakoj proveri, dakle mnogo puta.',
      '`ChangeDetectorRef.detectChanges()` razbacan po kodu krije problem sa tokom podataka umesto da ga reši.',
    ],
    rel: ['rxjs-flattening', 'middleware', 'big-o'],
    viz: {
      knobs: [{ id: 'mode', label: 'Strategija', value: 'default', options: [['default', 'Default'], ['onpush', 'OnPush'], ['signals', 'Signali']] }],
      build(x) {
        const { C, V } = x, mode = x.p.mode;
        x.view({ dir: [0, 13, 10] });
        const sN = x.stat('n', 'Proverenih komponenti', 0, { color: C.wait });
        x.legend([[C.wait, 'proverena'], [C.mag, 'izvor promene'], [C.dim, 'preskočena']]);
        x.plate({ at: [0, 0, .4], w: 20, d: 10.6 });
        const T = [
          ['AppComponent', 0, -4, null], ['Header', -5.5, -1.2, 0], ['Main', 4, -1.2, 0],
          ['ProductList', 0, 1.6, 2], ['Cart', 4.6, 1.6, 2], ['Filter', 9, 1.6, 2],
          ['CartItem', 2.6, 4.4, 4], ['CartTotal', 6.8, 4.4, 4], ['Logo', -5.5, 1.6, 1],
        ].map(([n, nx, nz, p]) => ({ n, p, b: x.box({ at: [nx, 0, nz], size: [3.2, .7, 1.2], label: n, side: 'in' }) }));
        T.forEach(t => { if (t.p != null) x.rail(T[t.p].b.port('front', -.2), t.b.port('back', -.2), { opacity: .4 }); });
        const depth = t => (t.p == null ? 0 : depth(T[t.p]) + 1);
        const pathTo = i => { const s = new Set(); let t = T[i]; while (t) { s.add(t); t = t.p == null ? null : T[t.p]; } return s; };
        const scen = [
          { src: 4, what: 'klik na "Dodaj" u komponenti **Cart**', sig: [7] },
          { src: 3, what: 'HTTP odgovor stiže u **ProductList**', sig: [3] },
        ];
        x.spawn(async () => {
          let k = 0;
          while (x.alive) {
            const sc = scen[k++ % scen.length];
            T.forEach(t => { t.b.reset(); t.b.dim(false); });
            sN.set(0);
            await x.wait(.8);
            const src = T[sc.src];
            const o = x.orb(C.mag, { r: .3 });
            await x.move(o, [src.b.port('top', 2.5), src.b.port('top', .3)], 6);
            x.remove(o);
            src.b.paint(C.mag);
            await x.wait(.5);
            let check;
            if (mode === 'default') check = T;
            else if (mode === 'onpush') {
              const p = pathTo(sc.src);
              check = T.filter(t => p.has(t) || (t.p != null && T[t.p] === src));
            } else check = sc.sig.map(i => T[i]);
            const skip = T.filter(t => !check.includes(t));
            x.say({
              default: `Događaj: ${sc.what}. **Default** proverava **celo stablo** od korena nadole.`,
              onpush: `Događaj: ${sc.what}. **OnPush** proverava samo putanju do izvora i decu sa promenjenim ulazima.`,
              signals: `Događaj: ${sc.what}. Sa **signalima** osvežava se samo komponenta koja čita promenjeni signal.`,
            }[mode]);
            skip.forEach(t => t.b.dim(true));
            const byD = [...check].sort((a, b) => depth(a) - depth(b));
            let n = 0;
            for (const t of byD) {
              if (t !== src) t.b.paint(C.wait);
              t.b.flash(C.wait, .5);
              sN.set(++n);
              await x.wait(.35);
            }
            x.say(`Provereno **${n} od ${T.length}** komponenti.` + (mode === 'default' ? ' Na velikom ekranu to su stotine provera po kliku.' : ''));
            await x.wait(2.6);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ RxJS
  {
    id: 'rxjs-flattening', d: 'angular', sym: 'Rx', title: 'switchMap, mergeMap, concatMap, exhaustMap',
    tags: ['rxjs', 'observable', 'switchmap', 'mergemap', 'concatmap', 'exhaustmap', 'operator', 'flattening', 'http', 'pretraga'],
    desc: 'Kad svaka vrednost spolja pokreće unutrašnji tok (npr. HTTP poziv), operator odlučuje šta sa preklapanjem: **switchMap** otkazuje prethodni, **mergeMap** pušta sve paralelno, **concatMap** ih ređa jedan za drugim, a **exhaustMap** ignoriše nove dok traje tekući.',
    points: [
      '**switchMap**: pretraga dok kucaš. Bitan je samo poslednji upit, a stari HTTP pozivi se otkazuju.',
      '**mergeMap**: nezavisni poslovi paralelno (npr. upload više fajlova); redosled rezultata nije garantovan.',
      '**concatMap**: redosled je bitan (čuvanje izmena jedne po jedne), pa sledeći čeka da se prethodni završi.',
      '**exhaustMap**: dugme za prijavu ili "Sačuvaj". Dupli klikovi dok zahtev traje se ignorišu.',
      'Otkazivanje u switchMap stvarno prekida HTTP zahtev kod `HttpClient`-a (unsubscribe).',
    ],
    code: [
      ts('TypeScript · pretraga sa switchMap', `
results$ = this.query.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(q => this.http.get<Product[]>(\`/api/products?q=\${q}\`)),   // stari zahtev se otkazuje
);`),
      ts('TypeScript · ostala tri operatora', `
// čuvaj izmene redom
changes$.pipe(concatMap(c => this.api.save(c)));

// prijava: ignoriši duple klikove dok traje
loginClick$.pipe(exhaustMap(() => this.auth.login(this.form.value)));

// paralelni upload, najviše 3 istovremeno
files$.pipe(mergeMap(f => this.api.upload(f), 3));`),
      ts('TypeScript · signal iz Observable-a', `
results = toSignal(this.results$, { initialValue: [] });   // u šablonu: results()`),
    ],
    pitfalls: [
      'mergeMap za čuvanje forme: odgovori stižu van redosleda i stariji prepiše noviji.',
      'switchMap za POST: otkazani zahtev je možda već stigao do servera, a klijent misli da nije.',
      'Ugnežđen `subscribe` unutar `subscribe`: curenje pretplata i izgubljeno otkazivanje. Koristi operatore.',
    ],
    rel: ['change-detection', 'channels', 'async-await'],
    viz: {
      knobs: [{ id: 'op', label: 'Operator', value: 'switchMap', options: [['switchMap', 'switchMap'], ['mergeMap', 'mergeMap'], ['concatMap', 'concatMap'], ['exhaustMap', 'exhaustMap']] }],
      build(x) {
        const { C, V } = x, op = x.p.op, X0 = -8.4, S = 2, D = 2, E = [.6, 1.2, 1.8];
        x.view({ dir: [0, 12, 11] });
        const src = [['a', .3, C.cat[0]], ['b', 1.2, C.cat[1]], ['c', 2.0, C.cat[2]], ['d', 4.6, C.cat[4]]];
        const plan = [];
        let busyUntil = -1, queueEnd = 0;
        src.forEach(([n, t0, col], i) => {
          const p = { n, t0, col, i, start: t0, cancel: Infinity, ignored: false };
          if (op === 'concatMap') { p.start = Math.max(t0, queueEnd); queueEnd = p.start + D; }
          if (op === 'exhaustMap') { if (t0 < busyUntil) p.ignored = true; else busyUntil = t0 + D; }
          plan.push(p);
        });
        if (op === 'switchMap') plan.forEach((p, i) => { if (plan[i + 1]) p.cancel = plan[i + 1].t0; });
        const endT = Math.max(...plan.map(p => p.ignored ? p.t0 : p.start + D)) + .6;
        const lz = { src: -4.2, out: 4.2 }, inz = i => -2.4 + i * 1.5;
        const tx = t => X0 + t * S;
        x.plate({ at: [tx(endT / 2), 0, 0], w: endT * S + 6, d: 10.6, label: `${op}` });
        const lanes = [['izvor', lz.src], ...plan.map(p => [`unutrašnji ${p.n}`, inz(p.i)]), ['rezultat', lz.out]];
        lanes.forEach(([n, z]) => { x.rail([tx(0) - .6, .1, z], [tx(endT), .1, z], { opacity: .35 }); x.label(n, [tx(0) - .9, .1, z], { cls: 'ghost', center: [1, .5] }); });
        const now = x.box({ at: [tx(0), 0, 0], size: [.05, .03, 10.2], color: C.mag, nofit: true });
        const events = [];
        for (const p of plan) {
          events.push({ t: p.t0, f: () => {
            const m = x.chip(p.col, { round: true, s: .55, at: [tx(p.t0), .3, lz.src], label: p.n });
            x.pop(m);
            if (p.ignored) { m.material.opacity = .35; m.material.transparent = true; m.lbl.set(`${p.n} ignorisano`); m.lbl.el.className = 'lbl lbl-tag lbl-dim'; x.say(`**${p.n}** stiže dok unutrašnji tok još radi: exhaustMap ga **ignoriše**.`); }
            else if (p.start > p.t0) { m.lbl.set(`${p.n} čeka red`); x.say(`**${p.n}** stiže, ali concatMap ga stavlja **u red** dok se prethodni ne završi.`); }
          } });
          if (p.ignored) continue;
          events.push({ t: p.start, f: () => { x.rail([tx(p.start), .1, lz.src], [tx(p.start), .1, inz(p.i)], { color: p.col, opacity: .6 }); } });
          E.forEach((dt, k) => {
            const t = p.start + dt;
            if (t >= p.cancel) return;
            events.push({ t, f: () => {
              const m = x.chip(p.col, { round: true, s: .34, at: [tx(t), .25, inz(p.i)] }); x.pop(m);
              const o = x.chip(p.col, { round: true, s: .42, at: [tx(t), .3, lz.out], label: `${p.n}${k + 1}` }); x.pop(o);
            } });
          });
          if (p.cancel < p.start + D) {
            events.push({ t: p.cancel, f: () => {
              x.box({ at: [tx(p.cancel), 0, inz(p.i)], size: [.12, .9, .9], color: C.err });
              x.label('otkazano', [tx(p.cancel) + .3, .3, inz(p.i)], { cls: 'tag err', center: [0, .5] });
              x.say(`Stigao je **${plan[p.i + 1].n}**: switchMap **otkazuje** unutrašnji tok ${p.n} i prelazi na novi.`);
            } });
          } else {
            events.push({ t: p.start + D, f: () => { x.box({ at: [tx(p.start + D), 0, inz(p.i)], size: [.1, .7, .7], color: C.white }); } });
          }
        }
        events.sort((a, b) => a.t - b.t);
        let t = 0, ei = 0;
        x.tick(dt => {
          if (t > endT + 3) return;
          t += dt * .9;
          now.o.position.x = tx(Math.min(t, endT));
          while (ei < events.length && events[ei].t <= t) events[ei++].f();
          if (t > endT && t - dt * .9 <= endT) x.say({
            switchMap: 'Rezultat ima samo vrednosti dok tok nije otkazan, i poslednji tok ceo. Idealno za pretragu.',
            mergeMap: 'Svi unutrašnji tokovi rade **paralelno**, pa se njihove vrednosti u rezultatu prepliću.',
            concatMap: 'Tokovi idu **jedan za drugim**: redosled je sačuvan, ali c i d čekaju.',
            exhaustMap: 'Obrađeni su samo a i d; b i c su stigli dok je a radio i **ignorisani** su.',
          }[op] + ' Dugme ⟲ pušta ponovo.');
        });
        x.say('Vreme teče sleva nadesno. Gornja traka su spoljne vrednosti, srednje su unutrašnji tokovi (npr. HTTP), a donja je rezultat.');
      },
    },
  },
];
