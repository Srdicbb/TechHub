import { dec, grp, lang } from '../i18n.js';
// Algoritmi i strukture podataka
const cs = (t, src) => ({ t, lang: 'csharp', src });

// ---------- pomoćno ----------
const SUPD = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = n => String(n).replace(/\d/g, d => SUPD[d]);
const num = v => (v < 10 ? dec(v).replace(/,0$/, '') : grp(v));
// srpska množina ima tri oblika; na engleskom je jednina samo za 1, a množina je oblik "few" (prevod ga daje u množini)
const pl = (n, one, few, many) => { if (lang === 'en') return n === 1 ? one : few; const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
const rng = seed => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- Big-O: klase kao log10(broja operacija) ----------
const LOG2 = Math.log10(2), YR = Math.log10(31557600);
const BIG = [
  ['O(1)', () => 0],
  ['O(log n)', n => Math.log10(Math.max(1, Math.log2(n)))],
  ['O(n)', n => Math.log10(n)],
  ['O(n log n)', n => Math.log10(n * Math.max(1, Math.log2(n)))],
  ['O(n²)', n => 2 * Math.log10(n)],
  ['O(2ⁿ)', n => n * LOG2],
];
const BIGC = ['#f4f6fb', '#7ee0b5', '#5ec8ff', '#ffd166', '#ff9f68', '#ff5d8f'];
const XT = { 16: [1, 4, 8, 12, 16], 100: [1, 25, 50, 75, 100], 1000: [1, 250, 500, 750, 1000] };
const cnt = L => (L < 15 ? grp(10 ** L) : '≈ 10' + sup(Math.floor(L)));
function dur(L) { // L = log10(operacija), 1 µs po operaciji
  const s = L - 6;
  if (s < -3) return grp(10 ** L) + ' µs';
  if (s < 0) return num(10 ** (s + 3)) + ' ms';
  if (s < Math.log10(60)) return num(10 ** s) + ' s';
  if (s < Math.log10(3600)) return num(10 ** s / 60) + ' min';
  if (s < Math.log10(86400)) return num(10 ** s / 3600) + ' h';
  if (s < YR) return num(10 ** s / 86400) + ' dana';
  const y = s - YR;
  return (y < 9 ? grp(10 ** y) : '≈ 10' + sup(Math.floor(y))) + ' god.';
}

// ---------- sortiranje: lista operacija ----------
function sortOps(alg, src) {
  const a = src.slice(), n = a.length, ops = [];
  const swap = (i, j) => { ops.push(['s', i, j]); [a[i], a[j]] = [a[j], a[i]]; };
  if (alg === 'bubble') {
    let end = n - 1, sw = true;
    while (end > 0 && sw) {
      sw = false;
      for (let i = 0; i < end; i++) { ops.push(['c', i, i + 1]); if (a[i] > a[i + 1]) { swap(i, i + 1); sw = true; } }
      ops.push(['d', end]);
      end--;
    }
    for (let i = end; i >= 0; i--) ops.push(['d', i]);
  } else if (alg === 'insertion') {
    for (let i = 1; i < n; i++) {
      ops.push(['k', i]);
      for (let j = i; j > 0; j--) { ops.push(['c', j - 1, j]); if (a[j - 1] > a[j]) swap(j - 1, j); else break; }
    }
    ops.push(['k', -1]);
    for (let i = 0; i < n; i++) ops.push(['d', i]);
  } else if (alg === 'merge') {
    const rec = (lo, hi) => {
      if (lo >= hi) return;
      const mid = (lo + hi) >> 1;
      rec(lo, mid); rec(mid + 1, hi);
      ops.push(['r', lo, hi]);
      const t = [];
      let i = lo, j = mid + 1;
      while (i <= mid && j <= hi) { ops.push(['c', i, j]); t.push(a[i] <= a[j] ? a[i++] : a[j++]); }
      while (i <= mid) t.push(a[i++]);
      while (j <= hi) t.push(a[j++]);
      t.forEach((v, k) => { ops.push(['w', lo + k, v]); a[lo + k] = v; });
    };
    rec(0, n - 1);
    ops.push(['r', 0, n - 1]);
    for (let i = 0; i < n; i++) ops.push(['d', i]);
  } else {
    const rec = (lo, hi) => {
      if (lo > hi) return;
      if (lo === hi) { ops.push(['d', lo]); return; }
      ops.push(['r', lo, hi], ['k', hi]);
      let i = lo;
      for (let j = lo; j < hi; j++) { ops.push(['c', j, hi]); if (a[j] < a[hi]) { if (i !== j) swap(i, j); i++; } }
      if (i !== hi) swap(i, hi);
      ops.push(['d', i]);
      rec(lo, i - 1); rec(i + 1, hi);
    };
    rec(0, n - 1);
    ops.push(['r', 0, n - 1]);
  }
  return ops;
}

// ---------- pretraga grafa na mreži ----------
const COLS = 14, ROWS = 9;
const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // levo, dole, desno, gore (DFS skida poslednje: gore pa desno)
function search(mode, g, S, G) {
  const n = COLS * ROWS, par = new Int32Array(n).fill(-1), seen = new Uint8Array(n), ev = [];
  const nb = u => {
    const c = u % COLS, r = (u / COLS) | 0, out = [];
    for (const [dc, dr] of DIRS) {
      const cc = c + dc, rr = r + dr;
      if (cc >= 0 && cc < COLS && rr >= 0 && rr < ROWS && g[rr * COLS + cc] !== 1) out.push(rr * COLS + cc);
    }
    return out;
  };
  const cost = u => (g[u] === 2 ? 5 : 1);
  if (mode === 'bfs') {
    const q = [S]; seen[S] = 1; ev.push(['f', S]);
    while (q.length) {
      const u = q.shift(); ev.push(['v', u]);
      if (u === G) break;
      for (const w of nb(u)) if (!seen[w]) { seen[w] = 1; par[w] = u; q.push(w); ev.push(['f', w]); }
    }
  } else if (mode === 'dfs') {
    const st = [[S, -1]];
    while (st.length) {
      const [u, p] = st.pop();
      if (seen[u]) continue;
      seen[u] = 1; par[u] = p; ev.push(['v', u]);
      if (u === G) break;
      for (const w of nb(u)) if (!seen[w]) { st.push([w, u]); ev.push(['f', w]); }
    }
  } else {
    const dist = new Float64Array(n).fill(Infinity), pq = [[0, S]];
    dist[S] = 0; ev.push(['f', S]);
    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
      const [d, u] = pq.splice(bi, 1)[0];
      if (seen[u]) continue;
      seen[u] = 1; ev.push(['v', u]);
      if (u === G) break;
      for (const w of nb(u)) {
        const nd = d + cost(w);
        if (!seen[w] && nd < dist[w]) { dist[w] = nd; par[w] = u; pq.push([nd, w]); ev.push(['f', w]); }
      }
    }
  }
  const path = [];
  if (seen[G]) for (let u = G; u !== -1; u = par[u]) path.unshift(u);
  const total = path.slice(1).reduce((s, u) => s + cost(u), 0);
  return { ev, path, total };
}
function maze(seed) {
  const R = rng(seed * 7919 + 13);
  const S = 4 * COLS + 1, G = 4 * COLS + 12;
  let last = null;
  for (let t = 0; t < 80; t++) {
    const g = new Uint8Array(COLS * ROWS);
    for (let i = 0; i < g.length; i++) g[i] = R() < .22 ? 1 : 0;
    const mw = 2 + Math.floor(R() * 2), mh = 4 + Math.floor(R() * 2);
    const mc = 5 + Math.floor(R() * (6 - mw)), mr = 1 + Math.floor(R() * (8 - mh));
    for (let r = mr; r < mr + mh; r++) for (let c = mc; c < mc + mw; c++) g[r * COLS + c] = 2;
    for (const u of [S, G]) {
      g[u] = 0;
      for (const d of [-1, 1, -COLS, COLS]) { const w = u + d; if (w >= 0 && w < g.length && g[w] === 1) g[w] = 0; }
    }
    const b = search('bfs', g, S, G);
    if (!b.path.length) continue;
    last = { g, S, G };
    if (b.total > search('dij', g, S, G).total) return last;
  }
  return last || { g: new Uint8Array(COLS * ROWS), S, G };
}

export default [
  // ------------------------------------------------------------------ Big-O
  {
    id: 'big-o', d: 'algorithms', sym: 'Bo', title: 'Big-O: kako raste cena',
    tags: ['big o', 'složenost', 'vremenska složenost', 'prostorna složenost', 'o(n)', 'o(log n)', 'o(n log n)', 'o(n2)', 'amortizovano', 'kolekcije', 'list', 'dictionary'],
    desc: 'Big-O kaže kako broj operacija raste kad raste ulaz n. Ne meri sekunde, već oblik rasta: da li dupliran ulaz znači duplo, četiri puta ili milion puta više posla.',
    points: [
      'Konstante i manji članovi se zanemaruju: 3n² + 5n je O(n²).',
      'Redosled koji vredi znati napamet: O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ).',
      'Obično se misli na najgori slučaj. "Prosečno O(1)" (Dictionary) i "amortizovano O(1)" (List.Add) su različite tvrdnje.',
      'Za malo n konstante su važnije od klase: zato pravi algoritmi sortiranja za male delove prelaze na insertion sort.',
      'Memorija ima svoju složenost: HashSet ubrzava proveru na O(1), ali troši O(n) dodatne memorije.',
    ],
    table: [
      {
        title: 'Koliko operacija za n',
        head: ['Klasa', 'Tipičan primer', 'n = 10', 'n = 1 000', 'n = 1 000 000'],
        rows: [
          ['`O(1)`', 'Dictionary po ključu, niz po indeksu', '1', '1', '1'],
          ['`O(log n)`', 'binarna pretraga, B-stablo indeks', '3', '10', '20'],
          ['`O(n)`', 'jedan prolaz kroz listu', '10', '1 000', '1 000 000'],
          ['`O(n log n)`', 'dobro sortiranje', '33', '≈ 10 000', '≈ 20 000 000'],
          ['`O(n²)`', 'dve ugnežđene petlje', '100', '1 000 000', '10¹²'],
          ['`O(2ⁿ)`', 'svi podskupovi, naivni Fibonači', '1 024', '≈ 10³⁰¹', 'nezamislivo'],
        ],
        note: 'Pri 1 µs po operaciji: n log n za milion elemenata traje oko 20 sekundi, a n² oko 11,6 dana.',
      },
      {
        title: 'Složenost .NET kolekcija',
        head: ['Kolekcija', 'Dodavanje', 'Traženje', 'Napomena'],
        rows: [
          ['`List<T>`', 'O(1) amortizovano', 'O(n)', 'indeks O(1); Insert i Remove u sredini O(n)'],
          ['`Dictionary`, `HashSet`', 'O(1) prosečno', 'O(1) prosečno', 'bez garantovanog redosleda'],
          ['`SortedDictionary`', 'O(log n)', 'O(log n)', 'stablo, ključevi sortirani'],
          ['`SortedList`', 'O(n)', 'O(log n)', 'dva niza, manje memorije'],
          ['`Queue`, `Stack`', 'O(1)', 'O(n)', 'brzi su samo krajevi'],
          ['`PriorityQueue`', 'O(log n)', 'O(1) za najmanji', 'heap; Dequeue je O(log n)'],
          ['`LinkedList<T>`', 'O(1) uz poznat čvor', 'O(n)', 'loše koristi keš procesora'],
        ],
      },
    ],
    code: [
      cs('C# · O(n²) i O(n) za isti problem', `
// O(n²): svaki sa svakim
static bool HasDuplicateSlow(int[] a)
{
    for (int i = 0; i < a.Length; i++)
        for (int j = i + 1; j < a.Length; j++)
            if (a[i] == a[j]) return true;
    return false;
}

// O(n): jedan prolaz, HashSet proverava u O(1)
static bool HasDuplicate(int[] a)
{
    var seen = new HashSet<int>();
    foreach (var x in a)
        if (!seen.Add(x)) return true;
    return false;
}`),
      cs('C# · Skriveno O(n) u petlji', `
// O(n·m): List.Contains prolazi kroz celu listu za svaku porudžbinu
List<int> activeIds = GetActiveCustomerIds();
var slow = orders.Where(o => activeIds.Contains(o.CustomerId)).ToList();

// O(n + m): jednom napravi HashSet
var activeSet = activeIds.ToHashSet();
var fast = orders.Where(o => activeSet.Contains(o.CustomerId)).ToList();`),
      cs('C# · string += u petlji je O(n²)', `
// svaki += pravi novi string i kopira sve do sada
string csv = "";
foreach (var row in rows) csv += row + "\\n";

// StringBuilder dopisuje u bafer: O(n)
var sb = new StringBuilder();
foreach (var row in rows) sb.AppendLine(row);
string result = sb.ToString();`),
    ],
    pitfalls: [
      'Skriveno O(n) u petlji: `List.Contains`, `IndexOf`, `ElementAt` ili `Count()` nad `IEnumerable` unutar petlje daju O(n²).',
      'N+1 upita je isti problem na nivou baze: [[n-plus-one]].',
    ],
    rel: ['sorting', 'binary-search', 'hash-table', 'n-plus-one'],
    viz: {
      kind: 'svg',
      knobs: [
        { id: 'n', label: 'Opseg n', value: 16, options: [[16, 'do 16'], [100, 'do 100'], [1000, 'do 1 000']] },
        { id: 'sc', label: 'Y osa', value: 'lin', options: [['lin', 'linearna'], ['log', 'logaritamska']] },
      ],
      build(x) {
        const N = x.p.n, LOG = x.p.sc === 'log';
        const DW = Math.max(x.W, 780), DH = x.H * DW / x.W;
        x.svg.setAttribute('viewBox', `0 0 ${DW} ${DH}`);
        const P = 318, m = { l: 84, r: P + 44, t: 66, b: 62 };
        const pw = DW - m.l - m.r, ph = DH - m.t - m.b;
        const Lmax = LOG ? Math.ceil(2 * Math.log10(N)) + 1 : 2 * Math.log10(N);
        const X = n => m.l + (n - 1) / (N - 1) * pw;
        const Y = L => m.t + ph - Math.min(1.06, LOG ? L / Lmax : 10 ** (L - Lmax)) * ph;
        const cp = x.el('clipPath', { id: 'bo-clip' }, x.el('defs'));
        x.el('rect', { x: m.l, y: m.t - 2, width: pw + 2, height: ph + 4 }, cp);

        x.txt(m.l, 38, LOG ? 'Broj operacija (logaritamska skala)' : 'Broj operacija (linearna skala)', { class: 'hd' });
        const yt = LOG ? Array.from({ length: Lmax + 1 }, (_, i) => i) : [0, .25, .5, .75, 1].map(f => (f ? Lmax + Math.log10(f) : -Infinity));
        for (const L of yt) {
          const y = Y(L);
          x.el('line', { x1: m.l, x2: m.l + pw, y1: y, y2: y, stroke: '#4b5566', 'stroke-opacity': .35 });
          x.txt(m.l - 10, y + 5, LOG && L >= 5 ? '10' + sup(L) : grp(10 ** L), { 'text-anchor': 'end', class: 'sm mut' });
        }
        for (const n of XT[N]) {
          x.el('line', { x1: X(n), x2: X(n), y1: m.t + ph, y2: m.t + ph + 6, stroke: '#aab2c0' });
          x.txt(X(n), m.t + ph + 24, grp(n), { 'text-anchor': 'middle', class: 'sm mut' });
        }
        x.el('path', { d: `M${m.l} ${m.t} V${m.t + ph} H${m.l + pw}`, stroke: '#aab2c0', 'stroke-width': 1.5, fill: 'none' });
        x.txt(m.l + pw, m.t + ph + 48, 'n, veličina ulaza →', { 'text-anchor': 'end', class: 'sm mut' });

        // krive: bleda cela, jaka do kursora
        const S = 220;
        const pathTo = (f, n1) => {
          let s = '';
          for (let i = 0; i <= S; i++) { const n = 1 + (n1 - 1) * (i / S) ** 1.6; s += `${i ? 'L' : 'M'}${X(n).toFixed(1)} ${Y(f(n)).toFixed(1)}`; }
          return s;
        };
        const gC = x.el('g', { 'clip-path': 'url(#bo-clip)' });
        BIG.forEach(([, f], i) => x.el('path', { d: pathTo(f, N), fill: 'none', stroke: BIGC[i], 'stroke-opacity': .22, 'stroke-width': 2 }, gC));
        const strong = BIG.map((_, i) => x.el('path', { d: '', fill: 'none', stroke: BIGC[i], 'stroke-width': 3, 'stroke-linejoin': 'round' }, gC));
        // gde kriva izlazi iz grafika
        const exits = BIG.map(([k, f], i) => {
          if (f(N) <= Lmax + 1e-9) return null;
          let a = 1, b = N;
          for (let it = 0; it < 60; it++) { const c = (a + b) / 2; if (f(c) > Lmax) b = c; else a = c; }
          const ex = X(a), right = ex > m.l + pw - 90;
          const el = x.txt(right ? ex - 8 : ex + 8, m.t + 18, `${k} ↑`, { 'text-anchor': right ? 'end' : 'start', class: 'sm', style: `fill:${BIGC[i]};font-weight:700`, opacity: 0 });
          return { n: a, el };
        });
        const cl = x.el('line', { y1: m.t, y2: m.t + ph, stroke: '#ffffff', 'stroke-opacity': .55, 'stroke-dasharray': '4 5' });
        const dots = BIG.map((_, i) => x.el('circle', { r: 5.5, fill: BIGC[i], stroke: '#161a21', 'stroke-width': 2 }));

        // tabla desno
        const x0 = DW - P - 10;
        const nT = x.txt(x0, m.t + 8, '', { class: 'hd', style: 'font-size:22px' });
        x.txt(x0 + 206, m.t + 42, 'operacija', { 'text-anchor': 'end', class: 'sm mut' });
        x.txt(x0 + P, m.t + 42, 'vreme pri 1 µs', { 'text-anchor': 'end', class: 'sm mut' });
        const rows = BIG.map(([k], i) => {
          const y = m.t + 76 + i * 34;
          x.el('line', { x1: x0, x2: x0 + 18, y1: y - 5, y2: y - 5, stroke: BIGC[i], 'stroke-width': 4, 'stroke-linecap': 'round' });
          x.txt(x0 + 28, y, k);
          return [x.txt(x0 + 206, y, '', { 'text-anchor': 'end', class: 'mono' }), x.txt(x0 + P, y, '', { 'text-anchor': 'end', class: 'mono' })];
        });

        const draw = nc => {
          const n = Math.max(1, Math.round(nc)), xx = X(nc);
          cl.setAttribute('x1', xx); cl.setAttribute('x2', xx);
          nT.textContent = 'n = ' + grp(n);
          BIG.forEach(([, f], i) => {
            strong[i].setAttribute('d', pathTo(f, nc));
            const L = f(nc);
            dots[i].setAttribute('cx', xx); dots[i].setAttribute('cy', Y(L)); dots[i].setAttribute('opacity', L <= Lmax + 1e-9 ? 1 : 0);
            rows[i][0].textContent = cnt(f(n));
            rows[i][1].textContent = dur(f(n));
            if (exits[i]) exits[i].el.setAttribute('opacity', nc >= exits[i].n ? 1 : 0);
          });
        };
        const v = BIG.map(([, f]) => f(N));
        const end = `Za n = ${grp(N)}: O(log n) je ${cnt(v[1])} koraka, O(n log n) ${cnt(v[3])}, O(n²) ${cnt(v[4])} (${dur(v[4])}), a O(2ⁿ) bi trajao ${dur(v[5])}.`
          + (LOG ? ' Na log skali O(2ⁿ) je prava linija koja brzo izlazi iz grafika.' : ' Na linearnoj skali sve ispod n² izgleda kao nula: prebaci Y osu na logaritamsku.');
        draw(1);
        x.spawn(async () => {
          while (x.alive) {
            x.say(`Kursor pomera **n** od 1 do ${grp(N)}. Desno je broj operacija za svaku klasu i koliko bi trajale kad bi jedna operacija trajala 1 µs.`);
            await x.tween(8, k => draw(1 + (N - 1) * k), x.ease.lin);
            x.say(end);
            await x.wait(6);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Sortiranje
  {
    id: 'sorting', d: 'algorithms', sym: 'So', title: 'Sortiranje',
    tags: ['sortiranje', 'sort', 'bubble sort', 'insertion sort', 'merge sort', 'quick sort', 'pivot', 'stabilno', 'introsort', 'array.sort', 'orderby'],
    desc: 'Četiri klasična algoritma na istom nizu: uporedi broj poređenja i zamena. Prebaci ulaz na "obrnut" i pogledaj kako quick sort sa lošim pivotom pada na O(n²).',
    points: [
      'Sortiranje poređenjem ne može biti brže od O(n log n) u najgorem slučaju.',
      'Bubble i insertion su O(n²), ali insertion je odličan za male i skoro sortirane nizove (tada O(n)).',
      'Merge sort je uvek O(n log n) i stabilan, ali traži O(n) dodatne memorije.',
      'Quick sort je u praksi najčešće najbrži; loš pivot (npr. uvek poslednji element na već sortiranom nizu) daje O(n²).',
      'Stabilno sortiranje zadržava redosled jednakih elemenata, što je važno kad sortiraš po više kriterijuma.',
    ],
    table: {
      title: 'Poređenje algoritama',
      head: ['Algoritam', 'Najbolje', 'Prosečno', 'Najgore', 'Memorija', 'Stabilan'],
      rows: [
        ['Bubble', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'da'],
        ['Insertion', 'O(n)', 'O(n²)', 'O(n²)', 'O(1)', 'da'],
        ['Merge', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(n)', 'da'],
        ['Quick', 'O(n log n)', 'O(n log n)', 'O(n²)', 'O(log n)', 'ne'],
        ['Heap', 'O(n log n)', 'O(n log n)', 'O(n log n)', 'O(1)', 'ne'],
      ],
      note: '`Array.Sort` i `List<T>.Sort` koriste introsort (quick sort koji prelazi na heap sort i insertion sort), pa nemaju O(n²) najgori slučaj, ali nisu stabilni. LINQ `OrderBy` je stabilan.',
    },
    code: [
      cs('C# · Quick sort (Lomuto, pivot je poslednji)', `
static void QuickSort(int[] a, int lo, int hi)
{
    if (lo >= hi) return;
    int pivot = a[hi], i = lo;
    for (int j = lo; j < hi; j++)
        if (a[j] < pivot)
        {
            (a[i], a[j]) = (a[j], a[i]);    // manji levo
            i++;
        }
    (a[i], a[hi]) = (a[hi], a[i]);          // pivot na konačno mesto
    QuickSort(a, lo, i - 1);
    QuickSort(a, i + 1, hi);
}`),
      cs('C# · Insertion sort', `
static void InsertionSort(int[] a)
{
    for (int i = 1; i < a.Length; i++)
    {
        int key = a[i], j = i - 1;
        while (j >= 0 && a[j] > key) { a[j + 1] = a[j]; j--; }   // veće pomeri udesno
        a[j + 1] = key;
    }
}`),
      cs('C# · U praksi: ugrađeno sortiranje', `
int[] nums = [5, 3, 9, 1];
Array.Sort(nums);                                    // introsort, u mestu, nije stabilan

var sorted = orders.OrderBy(o => o.Customer)         // stabilno: isti kupac zadržava redosled
                   .ThenByDescending(o => o.Total)
                   .ToList();

list.Sort((a, b) => a.Total.CompareTo(b.Total));     // List<T>.Sort sa poređenjem`),
    ],
    pitfalls: [
      'Poređenje koje nije konzistentno (krši tranzitivnost ili vraća nasumičan rezultat) može da baci izuzetak ili da da pogrešan redosled u `Array.Sort`.',
      'Mešanje sa `OrderBy(_ => Random.Shared.Next())` radi, ali je O(n log n); `Random.Shared.Shuffle(array)` (.NET 8) je O(n).',
    ],
    rel: ['big-o', 'binary-search', 'parallel-for'],
    viz: {
      knobs: [
        { id: 'alg', label: 'Algoritam', value: 'quick', options: [['bubble', 'Bubble'], ['insertion', 'Insertion'], ['merge', 'Merge'], ['quick', 'Quick']] },
        { id: 'in', label: 'Ulaz', value: 'rnd', options: [['rnd', 'nasumičan'], ['near', 'skoro sortiran'], ['rev', 'obrnut']] },
        { id: 'n', label: 'Elemenata', min: 6, max: 24, value: 12 },
      ],
      actions: [{ id: 'shuffle', label: 'Promešaj', icon: 'refresh-cw' }],
      build(x) {
        const { C } = x, n = x.p.n, alg = x.p.alg, inp = x.p.in;
        const R = rng((x.p.seed || 1) * 104729 + n);
        x.on('shuffle', () => { x.p.seed = (x.p.seed || 1) + 1; x.stage.reload(); });
        const SP = Math.min(1.5, Math.max(.8, 14 / n)), BW = SP * .74;
        const Xp = i => (i - (n - 1) / 2) * SP, Hh = v => .45 + v * 5.2 / n;
        const DIM = 0x3d4657;
        x.view({ dir: [.2, .62, 2] });
        x.plate({ at: [0, 0, 0], w: n * SP + .9, d: 2.4 });
        const sC = x.stat('c', 'Poređenja', 0, { color: C.wait });
        const sS = x.stat('s', alg === 'merge' ? 'Upisi' : 'Zamene', 0, { color: C.mag });
        x.legend([[C.wait, 'poređenje'], [C.mag, alg === 'merge' ? 'upis' : 'zamena'], [C.ok, 'na konačnom mestu'],
          ...(alg === 'quick' ? [[C.cat[4], 'pivot']] : alg === 'insertion' ? [[C.cat[4], 'element koji se umeće']] : [])]);
        const mkArr = () => {
          const v = Array.from({ length: n }, (_, i) => i + 1);
          if (inp === 'rev') return v.reverse();
          if (inp === 'near') {
            for (let k = 0; k < Math.max(1, (n / 6) | 0); k++) { const i = Math.floor(R() * (n - 1)); [v[i], v[i + 1]] = [v[i + 1], v[i]]; }
            return v;
          }
          for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [v[i], v[j]] = [v[j], v[i]]; }
          return v;
        };
        let arr = mkArr();
        const bars = arr.map((v, i) => {
          const b = x.bar([Xp(i), 0, 0], Hh(v), C.sky, { w: BW, d: BW });
          if (n <= 16) b.lbl = x.label(String(v), [0, .5, 0], { parent: b, cls: 'ghost', center: [.5, 1] });
          return b;
        });
        const fin = new Array(n).fill(false);
        let special = -1, lo = 0, hi = n - 1;
        const paint = i => bars[i].paint(fin[i] ? C.ok : i === special ? C.cat[4] : (i < lo || i > hi) ? DIM : C.sky);
        const run = async ops => {
          for (const [k, i, j] of ops) {
            if (!x.alive) return;
            if (k === 'c') {
              sC.add(1); bars[i].paint(C.wait); bars[j].paint(C.wait);
              await x.wait(.13); paint(i); paint(j);
            } else if (k === 's') {
              sS.add(1);
              const A = bars[i], B = bars[j], xa = Xp(i), xb = Xp(j);
              A.paint(C.mag); B.paint(C.mag);
              await x.tween(.26, q => {
                const s = Math.sin(q * Math.PI) * SP * .55;
                A.position.x = xa + (xb - xa) * q; A.position.z = s;
                B.position.x = xb + (xa - xb) * q; B.position.z = -s;
              });
              bars[i] = B; bars[j] = A;
              if (special === i) special = j; else if (special === j) special = i;
              paint(i); paint(j);
            } else if (k === 'w') {
              sS.add(1);
              const A = bars[i], h0 = A.scale.y, h1 = Hh(j);
              A.paint(C.mag); A.lbl?.set(String(j));
              if (Math.abs(h1 - h0) > 1e-6) await x.tween(.17, q => A.setH(h0 + (h1 - h0) * q)); else await x.wait(.06);
              paint(i);
            } else if (k === 'r') {
              lo = i; hi = j;
              for (let q = 0; q < n; q++) paint(q);
              await x.wait(.25);
            } else if (k === 'k') {
              const o = special; special = i;
              if (o >= 0) paint(o);
              if (i >= 0) { paint(i); await x.wait(.2); }
            } else if (k === 'd') {
              fin[i] = true; if (special === i) special = -1;
              paint(i); await x.wait(.03);
            }
          }
        };
        const INTRO = {
          bubble: '**Bubble sort** poredi susede i menja ih kad su u pogrešnom redu. Posle svakog prolaza najveći preostali element "ispliva" na kraj. O(n²).',
          insertion: '**Insertion sort** uzima sledeći element (ljubičasto) i pomera ga ulevo dok ne stane na svoje mesto u već sređenom delu. O(n²), a na skoro sortiranom nizu O(n).',
          merge: '**Merge sort** deli niz na polovine dok ne ostanu pojedinačni elementi, pa spaja sortirane delove. Svetliji deo je opseg koji se trenutno spaja. Uvek O(n log n), uz O(n) dodatne memorije.',
          quick: '**Quick sort** bira pivot (ljubičasto, ovde poslednji element), manje elemente prebacuje levo, a pivot staje na konačno mesto. Zatim isto radi za levi i desni deo. Prosečno O(n log n).',
        };
        const NOTE = {
          'quick.rev': ' Na obrnutom nizu pivot je uvek najmanji, pa podela nije na pola: ovo je najgori slučaj, O(n²).',
          'quick.near': ' Na skoro sortiranom nizu poslednji element je loš pivot: podela je neravnomerna i broj poređenja raste ka O(n²).',
          'insertion.near': ' Niz je skoro sortiran, pa nijedan element ne putuje daleko: blizu O(n).',
          'insertion.rev': ' Obrnut niz je najgori slučaj: svaki element putuje do samog početka.',
          'bubble.near': ' Kad prolaz prođe bez ijedne zamene, niz je sortiran i algoritam staje ranije.',
          'bubble.rev': ' Obrnut niz je najgori slučaj: svaki par mora da se zameni.',
          'merge.near': ' Merge sort radi skoro isti posao bez obzira na ulaz.',
          'merge.rev': ' Merge sort radi skoro isti posao bez obzira na ulaz.',
        };
        x.spawn(async () => {
          while (x.alive) {
            bars.forEach((b, i) => { b.position.set(Xp(i), 0, 0); b.setH(Hh(arr[i])); b.lbl?.set(String(arr[i])); });
            fin.fill(false); special = -1; lo = 0; hi = n - 1;
            for (let i = 0; i < n; i++) paint(i);
            sC.set(0); sS.set(0);
            x.say(INTRO[alg] + (NOTE[alg + '.' + inp] || ''));
            await x.wait(1.4);
            await run(sortOps(alg, arr));
            if (!x.alive) return;
            const what = alg === 'merge' ? pl(sS.v, 'upis', 'upisa', 'upisa') : pl(sS.v, 'zamena', 'zamene', 'zamena');
            x.say(`Gotovo za n = ${n}: **${sC.v} ${pl(sC.v, 'poređenje', 'poređenja', 'poređenja')}** i ${sS.v} ${what}. Za poređenje: n² = ${n * n}, a n·log₂n ≈ ${Math.round(n * Math.log2(n))}.`);
            await x.wait(4.5);
            arr = mkArr();
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Binarna pretraga
  {
    id: 'binary-search', d: 'algorithms', sym: 'Bs', title: 'Binarna pretraga',
    tags: ['binarna pretraga', 'binary search', 'log n', 'sortiran niz', 'array.binarysearch', 'lower bound', 'git bisect', 'polovljenje'],
    desc: 'U sortiranom nizu pogledaj sredinu i odbaci polovinu u kojoj cilj ne može biti. Svaki korak prepolovi opseg, pa milion elemenata traži najviše 20 koraka.',
    points: [
      'Radi samo nad sortiranim podacima: poređenje sa sredinom govori u kojoj je polovini cilj.',
      'Najviše ⌊log₂ n⌋ + 1 koraka: 1 000 elemenata za 10, milion za 20.',
      'Sredinu računaj kao `lo + (hi - lo) / 2`, da zbir `lo + hi` ne prekorači opseg int-a.',
      'Kad elementa nema, `Array.BinarySearch` vraća negativan broj; `~rezultat` je mesto za umetanje.',
      'Ista ideja je svuda: B-stablo indeks u bazi, `SortedSet`, `git bisect` za prvu verziju sa bagom.',
    ],
    code: [
      cs('C# · Binarna pretraga', `
static int BinarySearch(int[] a, int target)
{
    int lo = 0, hi = a.Length - 1;
    while (lo <= hi)
    {
        int mid = lo + (hi - lo) / 2;       // ne (lo + hi) / 2: zbir može da prekorači int
        if (a[mid] == target) return mid;
        if (a[mid] < target) lo = mid + 1;  // cilj je desno
        else hi = mid - 1;                  // cilj je levo
    }
    return ~lo;                              // negativno: ~lo je mesto za umetanje
}`),
      cs('C# · Ugrađeno', `
int[] sorted = [3, 8, 15, 23, 42, 57];
int i = Array.BinarySearch(sorted, 23);      // 3
int j = Array.BinarySearch(sorted, 20);      // negativan broj
if (j < 0) Console.WriteLine($"Ubaci na indeks {~j}");   // 3

var list = new List<int>(sorted);
int k = list.BinarySearch(42);               // 4`),
    ],
    pitfalls: [
      'Binarna pretraga nad nesortiranim nizom vraća pogrešan rezultat bez ikakve greške.',
      'Pogrešan uslov petlje (`lo < hi` umesto `lo <= hi`) ili granica (`hi = mid` umesto `mid - 1`) daje beskonačnu petlju ili promašen element.',
    ],
    rel: ['big-o', 'btree', 'sorting'],
    viz: {
      knobs: [{ id: 'mode', label: 'Pretraga', value: 'bin', options: [['bin', 'binarna'], ['lin', 'linearna']] }],
      build(x) {
        const { C } = x, LIN = x.p.mode === 'lin', N = 20, MAXB = Math.floor(Math.log2(N)) + 1;
        const R = rng(31);
        const vals = [];
        let v = 2 + Math.floor(R() * 5);
        for (let i = 0; i < N; i++) { vals.push(v); v += 1 + Math.floor(R() * 4); }
        const SP = 1.04, Xc = i => (i - (N - 1) / 2) * SP, vmax = vals[N - 1], Hc = v => .55 + v / vmax * 4;
        x.view({ dir: [0, .6, 2], top: 56 });
        x.plate({ at: [0, 0, 0], w: N * SP + .8, d: 1.6 });
        const cells = vals.map((val, i) => {
          const h = Hc(val), c = x.box({ at: [Xc(i), 0, 0], size: [.86, h, .86], color: C.box });
          c.lbl = x.label(String(val), [0, h / 2 - .3, .44], { parent: c.o, center: [.5, .5] });
          return c;
        });
        vals.forEach((_, i) => x.label(String(i), [Xc(i), 0, .5], { cls: 'ghost', center: [.5, 0] }));
        const tLo = x.label('lo', [Xc(0), -1.1, .5], { cls: 'tag', color: C.sky, center: [.5, .5] });
        const tHi = x.label('hi', [Xc(N - 1), -1.85, .5], { cls: 'tag', color: C.sky, center: [.5, .5] });
        if (LIN) tLo.visible = tHi.visible = false;
        const g = x.arrow([0, 2.1, 0], [0, .14, 0], { color: C.mag, opacity: .95, head: .42 });
        const gl = x.label(LIN ? 'i = 0' : 'mid', [0, 2.2, 0], { parent: g, cls: 'tag mag', center: [.5, 1] });
        g.position.set(Xc(N - 1), Hc(vmax), 0);
        const sT = x.stat('t', 'Tražimo', '–', { color: C.mag });
        const sK = x.stat('k', 'Koraka', 0, { color: C.wait });
        x.stat('m', 'Najviše', LIN ? N : MAXB);
        const slide = (o, to, d = .35) => { const from = o.position.x; return x.tween(d, q => { o.position.x = from + (to - from) * q; }); };
        const aim = (i, d = .4) => {
          const x0 = g.position.x, y0 = g.position.y, x1 = Xc(i), y1 = Hc(vals[i]);
          return x.tween(d, q => { g.position.x = x0 + (x1 - x0) * q; g.position.y = y0 + (y1 - y0) * q; });
        };

        const binary = async t => {
          let lo = 0, hi = N - 1, steps = 0;
          x.say(`Tražimo **${t}** u sortiranom nizu od ${N} elemenata. Opseg je ceo niz: lo = 0, hi = ${N - 1}.`);
          await Promise.all([slide(tLo, Xc(lo)), slide(tHi, Xc(hi))]);
          await x.wait(1.3);
          while (lo <= hi && x.alive) {
            const mid = lo + ((hi - lo) >> 1), a = vals[mid];
            steps++; sK.set(steps);
            gl.set(`mid = ${mid}`);
            await aim(mid, .4);
            cells[mid].flash(C.wait, .8);
            if (a === t) {
              cells[mid].paint(C.ok); x.ripple(cells[mid].pos, C.ok, 1);
              x.say(`Korak ${steps}: a[${mid}] = ${a}, **pronađeno**. Linearna pretraga bi trebalo ${mid + 1} ${pl(mid + 1, 'korak', 'koraka', 'koraka')}.`);
              return;
            }
            if (a < t) {
              x.say(`Korak ${steps}: a[${mid}] = ${a} < ${t}, pa je cilj desno. Leva polovina otpada: lo = ${mid + 1}.`);
              for (let i = lo; i <= mid; i++) cells[i].dim(true);
              lo = mid + 1;
            } else {
              x.say(`Korak ${steps}: a[${mid}] = ${a} > ${t}, pa je cilj levo. Desna polovina otpada: hi = ${mid - 1}.`);
              for (let i = mid; i <= hi; i++) cells[i].dim(true);
              hi = mid - 1;
            }
            await x.wait(.5);
            await Promise.all([slide(tLo, Xc(Math.min(lo, N - 1))), slide(tHi, Xc(Math.max(hi, 0)))]);
            await x.wait(1.3);
          }
          x.say(`**${t} ne postoji**: posle ${steps} koraka lo (${lo}) je prešao hi (${hi}). \`Array.BinarySearch\` tada vraća negativan broj, a \`~rezultat\` = ${lo} je mesto gde bi ${t} trebalo umetnuti.`);
        };
        const linear = async t => {
          x.say(`Linearna pretraga za **${t}**: proverava element po element, od početka.`);
          gl.set('i = 0');
          await aim(0, .3);
          await x.wait(.8);
          for (let i = 0; i < N && x.alive; i++) {
            sK.set(i + 1); gl.set(`i = ${i}`);
            await aim(i, .16);
            cells[i].flash(C.wait, .5);
            if (vals[i] === t) {
              cells[i].paint(C.ok); x.ripple(cells[i].pos, C.ok, 1);
              x.say(`Pronađeno posle ${i + 1} ${pl(i + 1, 'koraka', 'koraka', 'koraka')}. Binarna pretraga bi trebalo najviše ${MAXB}.`);
              return;
            }
            cells[i].dim(true);
            await x.wait(.22);
          }
          x.say(`**${t} ne postoji**: proveren je ceo niz, svih ${N} elemenata. Binarna pretraga bi to utvrdila za najviše ${MAXB} koraka.`);
        };
        x.spawn(async () => {
          let round = 0;
          while (x.alive) {
            let t;
            if (round % 4 === 3) {
              const gaps = [];
              for (let i = 0; i < N - 1; i++) if (vals[i + 1] - vals[i] > 1) gaps.push(i);
              t = gaps.length ? vals[gaps[Math.floor(R() * gaps.length)]] + 1 : vals[N - 1] + 3;
            } else t = vals[Math.floor(R() * N)];
            round++;
            cells.forEach(c => { c.dim(false); c.reset(); });
            sT.set(t); sK.set(0);
            if (LIN) await linear(t); else await binary(t);
            await x.wait(3);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Hash tabela
  {
    id: 'hash-table', d: 'algorithms', sym: 'Ht', title: 'Hash tabela',
    tags: ['hash tabela', 'hash table', 'dictionary', 'hashset', 'gethashcode', 'equals', 'bucket', 'sudar', 'kolizija', 'load factor', 'popunjenost', 'rehash'],
    desc: 'Ključ se pretvara u broj (hash), a ostatak deljenja sa brojem bucket-a kaže gde ključ stoji. Zato `Dictionary` nalazi vrednost u prosečno O(1), bez obzira na veličinu.',
    points: [
      'Indeks bucket-a = hash(ključ) % broj bucket-a. Pristup je prosečno O(1).',
      'Sudar: dva ključa dobiju isti bucket. Rešava se lancem (ulančavanje) ili traženjem sledećeg slobodnog mesta; u lancu se ključevi porede sa `Equals`.',
      'Kad popunjenost pređe prag, niz se povećava i svi ključevi se ponovo raspoređuju. To umetanje je O(n), ali je retko, pa je amortizovano O(1).',
      '.NET `Dictionary` koristi lance, raste kad se popuni i za novu veličinu bira prost broj. Ako unapred znaš veličinu, zadaj `capacity`.',
      'Loš `GetHashCode` (npr. isti broj za sve) pretvara tabelu u listu: svaki pristup postaje O(n).',
    ],
    code: [
      cs('C# · Dobar ključ: nepromenljiv i sa Equals/GetHashCode', `
// record struct sam generiše Equals i GetHashCode po svim poljima
public readonly record struct PriceKey(int TenantId, string Sku);

var prices = new Dictionary<PriceKey, decimal>(capacity: 10_000);   // bez proširenja usput
prices[new PriceKey(7, "A-100")] = 19.99m;

if (prices.TryGetValue(new PriceKey(7, "A-100"), out var price))
    Console.WriteLine(price);                                         // prosečno O(1)`),
      cs('C# · Ručno: ista polja u Equals i GetHashCode', `
public sealed class Point : IEquatable<Point>
{
    public int X { get; }
    public int Y { get; }
    public Point(int x, int y) => (X, Y) = (x, y);

    public bool Equals(Point? other) => other is not null && X == other.X && Y == other.Y;
    public override bool Equals(object? obj) => Equals(obj as Point);
    public override int GetHashCode() => HashCode.Combine(X, Y);
}`),
      cs('C# · Zamka: promenljiv ključ', `
var p = new MutablePoint { X = 1, Y = 2 };   // GetHashCode koristi X i Y
var set = new HashSet<MutablePoint> { p };

p.X = 5;                                      // hash je sada drugačiji
Console.WriteLine(set.Contains(p));           // False: traži u pogrešnom bucket-u`),
    ],
    pitfalls: [
      'Jednaki objekti moraju imati isti hash. Ako prepišeš `Equals`, prepiši i `GetHashCode`.',
      'Ključ koji se menja posle ubacivanja se više ne nalazi, a i dalje zauzima mesto.',
      'Iteracija kroz `Dictionary` nema garantovan redosled; za sortirane ključeve koristi `SortedDictionary`.',
    ],
    rel: ['big-o', 'consistent-hashing', 'distributed-cache'],
    viz: {
      knobs: [{ id: 'lf', label: 'Prag popunjenosti', value: .75, options: [[.75, '0,75'], [1, '1,0'], [99, 'bez rasta']] }],
      build(x) {
        const { C, V } = x, LF = x.p.lf;
        const LFT = LF === .75 ? '0,75' : LF === 1 ? '1,0' : null;
        const R = rng(17);
        const SP = 1.6, Xb = b => (b - 3.5) * SP, slotY = k => .16 + k * .62;
        x.view({ dir: [0, .62, 2] });
        x.plate({ at: [0, 0, 0], w: 8 * SP + .6, d: 1.9 });
        const tiles = [], idx = [];
        for (let b = 0; b < 8; b++) {
          tiles.push(x.box({ at: [Xb(b), 0, 0], size: [1.36, .16, 1], color: 0x5a7fc0 }));
          idx.push(x.label(String(b), [Xb(b), 0, .52], { cls: 'ghost', center: [.5, 0] }));
        }
        x.label('indeks →', [Xb(0) - .85, 0, .52], { cls: 'ghost', center: [1, 0] });
        x.box({ at: [-8.9, 0, 0], size: [1.5, .3, 1], color: C.dim, label: 'novi ključ', side: 'below' });
        const IN = V(-8.9, 1.1, 0);
        const fl = x.label('hash(ključ) % broj bucket-a = <b>indeks</b>', [0, 4.5, 0], { cls: 't', center: [.5, 1] });
        const sB = x.stat('b', 'Bucket-a', 4);
        const sL = x.stat('l', 'Popunjenost', '0/4', { color: C.wait });
        const sC = x.stat('c', 'Poređenja', 0, { color: C.sky });
        x.legend([[C.mag, 'umetanje'], [C.sky, 'traženje'], [C.wait, 'poređenje (Equals)'], [C.ok, 'pronađeno']]);

        const POOL = ['ana', 'iva', 'luka', 'mila', 'sara', 'nina', 'tea', 'maja', 'ivan', 'marko', 'petar', 'uroš', 'vuk', 'lena', 'ema', 'filip'];
        const H = s => { let h = 0; for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; return h >>> 0; };
        const finalCap = 6 > LF * 4 ? 8 : 4;
        const pick = () => {
          let p = POOL.slice();
          for (let tries = 0; tries < 40; tries++) {
            p = POOL.slice();
            for (let i = p.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
            const cnts = {};
            p.slice(0, 6).forEach(k => { const b = H(k) % finalCap; cnts[b] = (cnts[b] || 0) + 1; });
            const mx = Math.max(...Object.values(cnts));
            if (mx >= 2 && mx <= 3) break;
          }
          return { ks: p.slice(0, 6), miss: p[6] };
        };
        let cap = 4, chains = [], items = [];
        const load = () => sL.set(`${items.length}/${cap} = ${dec(items.length / cap, 2)}`);
        const hashTxt = (key, c) => `hash("${key}") % ${c} = <b>${H(key) % c}</b><small>hash("${key}") = ${grp(H(key))}</small>`;

        const grow = async () => {
          x.say(`Popunjenost ${items.length}/${cap} je prešla prag ${LFT}: pravi se niz od **8 bucket-a** i svaki ključ se ponovo raspoređuje (hash % 8). Ovo umetanje je O(n), ali se dešava retko.`);
          fl.set('hash(ključ) % 8 = <b>novi indeks</b>');
          await x.wait(1.4);
          for (let b = 4; b < 8; b++) { tiles[b].o.visible = true; idx[b].visible = true; x.pop(tiles[b]); }
          cap = 8; sB.set(8);
          const nc = Array.from({ length: 8 }, () => []), moves = [];
          for (const it of items) {
            const b = it.h % 8, k = nc[b].length;
            nc[b].push(it);
            it.node.text(`${it.key}: ${b}`);
            const p0 = it.node.o.position.clone(), p1 = V(Xb(b), slotY(k) + .25, 0), up = 1.3 + k * .1;
            moves.push(x.move(it.node.o, [p0, V(p0.x, p0.y + up, 0), V(p1.x, p1.y + up, 0), p1], 6));
          }
          await Promise.all(moves);
          chains = nc;
          load();
          await x.wait(1.2);
          items.forEach(it => it.node.text(it.key));
          x.say(`Posle proširenja popunjenost je ${items.length}/8 = ${dec(items.length / 8, 2)}: lanci su kraći, pa je traženje opet brzo.`);
          await x.wait(2.2);
        };
        const insert = async key => {
          const h = H(key), b = h % cap, ch = chains[b], k = ch.length;
          fl.set(hashTxt(key, cap));
          const o = x.orb(C.mag, { r: .22, label: key, lcls: 'tag mag', at: IN });
          x.pop(o);
          x.say(k
            ? `Ključ **${key}** ide u bucket ${b}, a tamo već ${k > 1 ? 'stoje' : 'stoji'} ${ch.map(e => '**' + e.key + '**').join(', ').replace(/, (?=[^,]*$)/, ' i ')}: to je **sudar**, pa ključ ide u lanac.`
            : `Ključ **${key}**: hash % ${cap} = ${b}. Bucket ${b} je prazan, upis je O(1).`);
          await x.wait(.8);
          await x.move(o, [IN, V(IN.x, 3.5, 0), V(Xb(b), 3.5, 0), V(Xb(b), slotY(k) + .25, 0)], 9);
          x.remove(o);
          const node = x.box({ at: [Xb(b), slotY(k), 0], size: [1.2, .5, .8], color: C.box, label: key, side: 'in' });
          x.pop(node);
          tiles[b].flash(C.mag, .5);
          const it = { key, h, node };
          ch.push(it); items.push(it);
          load();
          await x.wait(1.3);
          if (items.length > LF * cap && cap === 4) await grow();
        };
        const lookup = async key => {
          const h = H(key), b = h % cap, ch = chains[b];
          sC.set(0);
          fl.set(hashTxt(key, cap));
          const o = x.orb(C.sky, { r: .2, label: `traži ${key}`, lcls: 'tag', at: IN });
          x.pop(o);
          x.say(`Traženje **${key}**: hash % ${cap} = ${b}, pa se gleda samo bucket ${b}${ch.length ? ', a u njemu ključ po ključ (Equals)' : ''}.`);
          await x.wait(.9);
          const sx = Xb(b) + .8;
          await x.move(o, [IN, V(IN.x, 3.5, 0), V(sx, 3.5, 0), V(sx, slotY(ch.length) + .3, 0)], 9);
          for (let k = ch.length - 1; k >= 0 && x.alive; k--) {
            const e = ch[k];
            await x.move(o, [o.position.clone(), V(sx, slotY(k) + .25, 0)], 5);
            sC.add(1);
            if (e.key === key) {
              e.node.paint(C.ok); x.ripple(V(Xb(b), 0, 0), C.ok, 1.1);
              x.say(`**${key}** je pronađen u bucket-u ${b} posle ${sC.v} poređenja. Ostali bucket-i se uopšte ne gledaju.`);
              await x.wait(2.6);
              e.node.reset(); x.remove(o);
              return;
            }
            e.node.flash(C.wait, .6);
            await x.wait(.55);
          }
          o.lbl.set(`${key}: nema`); o.lbl.el.className = 'lbl lbl-tag lbl-err';
          tiles[b].flash(C.err, .8);
          x.say(ch.length
            ? `**${key}** nije u tabeli: prošli smo ceo lanac bucket-a ${b} (${ch.length} ${pl(ch.length, 'ključ', 'ključa', 'ključeva')}) i nema poklapanja.`
            : `**${key}** nije u tabeli: bucket ${b} je prazan, pa je odgovor odmah "nema", bez ijednog poređenja.`);
          await x.wait(2.6);
          x.remove(o);
        };
        x.spawn(async () => {
          while (x.alive) {
            items.forEach(it => x.remove(it.node));
            items = []; cap = 4; chains = Array.from({ length: 8 }, () => []);
            for (let b = 4; b < 8; b++) { tiles[b].o.visible = false; idx[b].visible = false; }
            sB.set(4); sC.set(0); load();
            fl.set('hash(ključ) % broj bucket-a = <b>indeks</b>');
            const { ks, miss } = pick();
            x.say(LFT
              ? `Tabela počinje sa 4 bucket-a. Kad popunjenost (ključevi / bucket-i) pređe ${LFT}, niz se udvostručuje.`
              : 'Tabela ostaje na 4 bucket-a i ne raste: sa više ključeva lanci postaju sve duži, a traženje sporije.');
            await x.wait(2);
            for (const k of ks) { if (!x.alive) return; await insert(k); }
            const deep = items.find(it => { const c = chains[it.h % cap]; return c.indexOf(it) < c.length - 1; }) || items[0];
            await lookup(deep.key);
            await lookup(miss);
            await x.wait(1.5);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Pretraga grafa
  {
    id: 'graph-search', d: 'algorithms', sym: 'Gs', title: 'BFS, DFS i Dijkstra',
    tags: ['graf', 'bfs', 'dfs', 'dijkstra', 'a*', 'najkraći put', 'queue', 'stack', 'priorityqueue', 'pretraga u širinu', 'pretraga u dubinu', 'lavirint'],
    desc: 'Isti lavirint, tri strategije. BFS širi talas i nalazi najmanje koraka, DFS ide u dubinu, a Dijkstra gleda cenu: blato košta 5, obično polje 1.',
    points: [
      'Graf su čvorovi i veze; mreža (grid) je graf u kome je svako polje povezano sa susedima.',
      'BFS (Queue) obrađuje po talasima i daje najmanji broj koraka kad sve veze koštaju isto. O(V + E).',
      'DFS (Stack ili rekurzija) ide u dubinu: dobar za povezanost, cikluse i topološko sortiranje, ne za najkraći put.',
      'Dijkstra (PriorityQueue) daje najjeftiniji put kad veze imaju različitu cenu, ali bez negativnih cena. O((V + E) log V).',
      'A* je Dijkstra sa procenom udaljenosti do cilja: obrađuje manje polja, a put je i dalje najjeftiniji ako procena ne precenjuje.',
    ],
    table: {
      title: 'Koji algoritam kada',
      head: ['Algoritam', 'Struktura', 'Najkraći put', 'Složenost'],
      rows: [
        ['BFS', '`Queue`', 'po broju koraka', 'O(V + E)'],
        ['DFS', '`Stack` ili rekurzija', 'ne', 'O(V + E)'],
        ['Dijkstra', '`PriorityQueue`', 'po ceni, bez negativnih', 'O((V + E) log V)'],
        ['A*', '`PriorityQueue` i procena', 'po ceni, uz dobru procenu', 'zavisi od procene'],
      ],
    },
    code: [
      cs('C# · BFS na mreži: najmanje koraka', `
static int ShortestSteps(bool[,] wall, (int R, int C) start, (int R, int C) goal)
{
    int rows = wall.GetLength(0), cols = wall.GetLength(1);
    var dist = new int[rows, cols];
    for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++) dist[r, c] = -1;

    var queue = new Queue<(int R, int C)>();
    dist[start.R, start.C] = 0;
    queue.Enqueue(start);
    (int, int)[] dirs = [(0, 1), (1, 0), (0, -1), (-1, 0)];

    while (queue.Count > 0)
    {
        var (r, c) = queue.Dequeue();
        if ((r, c) == goal) return dist[r, c];
        foreach (var (dr, dc) in dirs)
        {
            int nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
            if (wall[nr, nc] || dist[nr, nc] >= 0) continue;   // zid ili već viđeno
            dist[nr, nc] = dist[r, c] + 1;
            queue.Enqueue((nr, nc));
        }
    }
    return -1;   // cilj nije dostižan
}`),
      cs('C# · Dijkstra sa PriorityQueue', `
static Dictionary<string, int> Dijkstra(Dictionary<string, List<(string To, int Cost)>> graph, string source)
{
    var dist = new Dictionary<string, int> { [source] = 0 };
    var pq = new PriorityQueue<string, int>();
    pq.Enqueue(source, 0);

    while (pq.TryDequeue(out var node, out var d))
    {
        if (d > dist[node]) continue;                  // zastareo unos: već imamo bolji put
        foreach (var (to, cost) in graph.GetValueOrDefault(node, []))
        {
            int nd = d + cost;
            if (nd < dist.GetValueOrDefault(to, int.MaxValue))
            {
                dist[to] = nd;
                pq.Enqueue(to, nd);
            }
        }
    }
    return dist;
}`),
    ],
    pitfalls: [
      'Bez skupa posećenih čvorova pretraga se vrti u krug na grafu sa ciklusima.',
      'Rekurzivni DFS na velikom grafu može da izazove `StackOverflowException`; koristi eksplicitni `Stack`.',
      'Dijkstra ne radi sa negativnim cenama; tada treba Bellman-Ford.',
    ],
    rel: ['big-o', 'hash-table', 'sorting'],
    viz: {
      knobs: [{ id: 'mode', label: 'Algoritam', value: 'bfs', options: [['bfs', 'BFS'], ['dfs', 'DFS'], ['dij', 'Dijkstra']] }],
      actions: [{ id: 'maze', label: 'Novi lavirint', icon: 'refresh-cw' }],
      build(x) {
        const { C, V, THREE } = x, MODE = x.p.mode, seed = x.p.seed || 1;
        x.on('maze', () => { x.p.seed = seed + 1; x.stage.reload(); });
        const { g, S, G } = maze(seed);
        const TILE = 0x343c4b, MUD = 0x9a6a3c, WALL = 0xb8c4dc;
        const Xc = c => c - (COLS - 1) / 2, Zr = r => r - (ROWS - 1) / 2;
        const at = (u, y = 0) => V(Xc(u % COLS), y, Zr((u / COLS) | 0));
        x.view({ dir: [0, 2.3, 1.15], bottom: 44 });
        const tiles = [];
        for (let u = 0; u < COLS * ROWS; u++) {
          tiles.push(g[u] === 1
            ? x.box({ at: at(u), size: [.94, .5, .94], color: WALL })
            : x.box({ at: at(u), size: [.94, .12, .94], color: g[u] === 2 ? MUD : TILE }));
        }
        tiles[S].paint(C.ok); tiles[G].paint(C.mag);
        x.label('Start', at(S, .12), { cls: 'tag ok', center: [.5, .5] });
        x.label('Cilj', at(G, .12), { cls: 'tag mag', center: [.5, .5] });
        x.legend([[MUD, 'blato, cena 5'], [C.wait, 'čeka u redu'], [C.sky, 'obrađeno'], [C.mag, 'pronađen put']]);
        const sV = x.stat('v', 'Obrađeno polja', 0, { color: C.sky });
        const sP = x.stat('p', 'Koraka', 0, { color: C.mag });
        const sCo = x.stat('c', 'Cena', 0, { color: C.wait });
        const mudC = new THREE.Color(MUD), cA = new THREE.Color(C.sky), cB = new THREE.Color(C.cat[4]), tmp = new THREE.Color();
        const tint = (u, col) => (g[u] === 2 ? tmp.set(col).lerp(mudC, .5).getHex() : tmp.set(col).getHex());
        const res = search(MODE, g, S, G);
        const nV = res.ev.filter(e => e[0] === 'v').length;
        const INTRO = {
          bfs: '**BFS** obrađuje polja redom kojim su otkrivena (Queue), u talasima: prvo sva na 1 korak od starta, pa na 2... Nalazi put sa najmanje koraka, ali ne zna da blato košta više.',
          dfs: '**DFS** ide što dublje može (Stack) i vraća se tek kad zapne. Nalazi neki put, ali obično ne najkraći.',
          dij: '**Dijkstra** uvek obrađuje polje sa najmanjom ukupnom cenom do sada (PriorityQueue). Blato košta 5, pa ga zaobilazi kad je obilazak jeftiniji.',
        };
        const base = u => (u === S ? C.ok : u === G ? C.mag : g[u] === 1 ? WALL : g[u] === 2 ? MUD : TILE);
        const other = MODE === 'bfs' ? 'Dijkstra' : 'BFS';
        x.spawn(async () => {
          while (x.alive) {
            tiles.forEach((t, u) => t.paint(base(u)));
            sV.set(0); sP.set(0); sCo.set(0);
            x.say(INTRO[MODE]);
            await x.wait(1.6);
            let v = 0;
            for (const [k, u] of res.ev) {
              if (!x.alive) return;
              if (k === 'v') { v++; sV.set(v); }
              if (u === S || u === G) continue;
              if (k === 'f') tiles[u].paint(tint(u, C.wait));
              else { tiles[u].paint(tint(u, tmp.lerpColors(cA, cB, v / nV).getHex())); await x.wait(.05); }
            }
            const o = x.orb(C.mag, { r: .22, at: at(S, .45) });
            let cost = 0;
            for (let i = 1; i < res.path.length && x.alive; i++) {
              const u = res.path[i];
              cost += g[u] === 2 ? 5 : 1;
              await x.move(o, [o.position.clone(), at(u, .45)], 7);
              if (u !== G) tiles[u].paint(tint(u, C.mag));
              sP.set(i); sCo.set(cost);
            }
            const steps = res.path.length - 1;
            x.say({
              bfs: `BFS: put od ${steps} koraka, cena ${cost}, obrađeno ${v} ${pl(v, 'polje', 'polja', 'polja')}. Najmanje koraka, ali ako put ide kroz blato, cena je veća nego kod Dijkstre.`,
              dfs: `DFS: put od ${steps} koraka, cena ${cost}. DFS ne garantuje najkraći put.`,
              dij: `Dijkstra: put najmanje cene (${cost}), dug ${steps} koraka. Obrađeno ${v} ${pl(v, 'polje', 'polja', 'polja')}; A* bi uz procenu udaljenosti do cilja obradio manje.`,
            }[MODE] + ` Prebaci na ${other} da vidiš isti lavirint drugim algoritmom.`);
            await x.wait(6);
            x.remove(o);
          }
        });
      },
    },
  },
];
