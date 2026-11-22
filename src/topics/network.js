// Mreža: od paketa i DNS-a do HTTP-a i TLS-a
const cs = (t, src) => ({ t, lang: 'csharp', src });
const sh = (t, src) => ({ t, lang: 'bash', src });
const txt = (t, src) => ({ t, lang: 'plaintext', src });
const hx = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
const dec = (v, d = 1) => v.toFixed(d).replace('.', ',');

// ---------- waterfall učitavanja stranice (model u milisekundama) ----------
const RES = [
  ['index.html', 30], ['app.css', 40], ['app.js', 120], ['vendor.js', 300], ['font.woff2', 60], ['logo.svg', 8],
  ['slika-1.jpg', 140], ['slika-2.jpg', 140], ['slika-3.jpg', 140], ['slika-4.jpg', 140], ['slika-5.jpg', 140], ['slika-6.jpg', 140],
];
const RTT = 100, THINK = 20, BW = 1, STALL = 300, LOST = 3;   // BW: KB po ms (oko 8 Mbit/s)
function waterfall(ver, loss) {
  const h1 = ver === 'h1', SET = ver === 'h3' ? RTT : 2 * RTT;
  const rs = RES.map(([n, kb], i) => ({ n, kb, i, left: kb, st: i ? 'hidden' : 'queue', segs: [], until: 0, c: null, opener: false, end: 0 }));
  const conns = [];
  let lossT = Infinity, hit = null, conCount = 0;
  const seg = (r, k, t) => { const s = r.segs[r.segs.length - 1]; if (s && s.k === k && s.b === t) s.b = t + 1; else r.segs.push({ k, a: t, b: t + 1 }); };
  for (let t = 0; t < 12000 && rs.some(r => r.st !== 'done'); t++) {
    for (const c of conns) if (c.st === 'setup' && t >= c.until) c.st = 'open';
    // dodela zahteva vezama
    for (const r of rs) {
      if (r.st !== 'queue') continue;
      if (!h1) {
        if (!conns.length) { conns.push({ st: 'setup', until: t + SET }); conCount++; r.opener = true; }
        r.c = conns[0]; r.st = 'wait';
      } else {
        let c = conns.find(q => q.st === 'open' && !q.r);
        if (!c && conns.length < 6) { c = { st: 'setup', until: t + SET }; conns.push(c); conCount++; r.opener = true; }
        if (c) { c.r = r; r.c = c; r.st = 'wait'; }
      }
    }
    for (const r of rs) {
      if (r.st === 'wait' && r.c.st === 'open') { r.st = 'ttfb'; r.until = t + RTT + THINK; }
      if (r.st === 'ttfb' && t >= r.until) r.st = 'dl';
    }
    // jedan izgubljen paket iz vendor.js: TCP (HTTP/1.1 i 2) zaustavlja celu vezu, QUIC samo taj tok
    if (loss && lossT === Infinity && rs[LOST].st === 'dl' && rs[LOST].kb - rs[LOST].left > 60) {
      lossT = t;
      hit = new Set(ver === 'h2' ? rs.filter(r => r.st === 'dl' || r.st === 'ttfb').map(r => r.i) : [LOST]);
    }
    const stalled = r => hit && hit.has(r.i) && t >= lossT && t < lossT + STALL;
    const act = rs.filter(r => r.st === 'dl' && !stalled(r));
    for (const r of act) r.left -= BW / act.length;
    for (const r of rs) {
      if (r.st === 'hidden' || r.st === 'done') continue;
      if (stalled(r)) { seg(r, 'stall', t); if (r.st === 'ttfb') r.until++; continue; }
      seg(r, r.st === 'queue' || (r.st === 'wait' && !r.opener) ? 'queue' : r.st === 'wait' ? 'conn' : r.st, t);
      if (r.st === 'dl' && r.left <= 1e-9) {
        r.st = 'done'; r.end = t + 1;
        if (r.c && h1) r.c.r = null;
        if (r.i === 0) rs.forEach(q => { if (q.st === 'hidden') q.st = 'queue'; });
      }
    }
  }
  return { rs, total: Math.max(...rs.map(r => r.end)), conns: conCount };
}
const WF_MAX = Math.ceil(Math.max(...['h1', 'h2', 'h3'].flatMap(v => [0, 1].map(l => waterfall(v, l).total))) / 500) * 500 + 250;

export default [
  // ------------------------------------------------------------------ Slojevi
  {
    id: 'net-layers', d: 'network', sym: 'Ip', title: 'TCP/IP slojevi i put paketa',
    tags: ['tcp/ip', 'osi', 'slojevi', 'layers', 'enkapsulacija', 'paket', 'ip adresa', 'port', 'mac', 'ruter', 'ttl', 'mtu', 'nat', 'l4', 'l7'],
    desc: 'Mreža je složena u slojeve. Svaki sloj rešava jedan problem i dodaje svoje **zaglavlje** ispred podataka sloja iznad: HTTP poruka ulazi u TCP segment, segment u IP paket, paket u Ethernet ili Wi‑Fi okvir. Na putu ruteri čitaju samo IP zaglavlje, a server skida zaglavlja obrnutim redom.',
    points: [
      '**Aplikacija** (HTTP, DNS, gRPC): poruke koje program razume.',
      '**Transport** (TCP, UDP): od procesa do procesa, preko portova. TCP dodaje redosled, potvrde i ponovno slanje; UDP samo port i kontrolni zbir.',
      '**Internet** (IP): od mašine do mašine, preko adresa i rutera. Ne garantuje isporuku ni redosled; TTL sprečava da paket kruži zauvek.',
      '**Link** (Ethernet, Wi‑Fi): samo do sledećeg uređaja, preko MAC adresa. Na svakom skoku okvir se pravi iznova.',
      'Port razlikuje procese na istoj mašini: 443 je HTTPS, 5432 PostgreSQL. Adrese i portovi obe strane zajedno određuju jednu TCP vezu.',
      'OSI model ima sedam slojeva; u praksi se koriste četiri iz TCP/IP modela, a oznake L4 i L7 (na primer kod load balancera) dolaze iz OSI brojanja.',
    ],
    table: {
      title: 'Slojevi i šta dodaju',
      head: ['Sloj', 'Protokoli', 'Adresa', 'Zaglavlje'],
      rows: [
        ['Aplikacija (L7)', 'HTTP, DNS, gRPC, SMTP', 'URL, ime hosta', 'zavisi od protokola'],
        ['Transport (L4)', 'TCP, UDP, QUIC', 'port', 'TCP 20 B, UDP 8 B'],
        ['Internet (L3)', 'IPv4, IPv6, ICMP', 'IP adresa', 'IPv4 20 B, IPv6 40 B'],
        ['Link (L2)', 'Ethernet, Wi‑Fi', 'MAC adresa', 'Ethernet 14 B + 4 B na kraju'],
      ],
    },
    code: [
      sh('Shell · put paketa i otvorene veze', `
traceroute shop.rs             # svaki red je jedan ruter (skok); Windows: tracert shop.rs
ss -tn state established       # otvorene TCP veze; Windows: netstat -an | findstr ESTABLISHED
ss -ltnp                       # ko sluša na kom portu; Windows: netstat -abno`),
    ],
    pitfalls: [
      'MTU je obično 1 500 bajtova. VPN i tuneli ga smanjuju, pa veliki paketi negde puknu: mali zahtevi prolaze, veliki vise bez greške.',
      'Firewall koji odbacuje sav ICMP lomi otkrivanje MTU-a na putu (Path MTU Discovery) i veze koje "samo vise".',
      'NAT krije privatne adrese iza jedne javne. Iza proksija ili L7 load balancera server vidi njihovu adresu, a adresu klijenta nosi `X-Forwarded-For`, kome treba verovati samo kad ga postavlja tvoj proksi.',
    ],
    rel: ['tcp-udp', 'dns', 'sd-lb'],
    viz: {
      knobs: [{ id: 'hops', label: 'Rutera na putu', value: 2, options: [[1, '1'], [2, '2'], [3, '3']] }],
      build(x) {
        const { C, THREE } = x, N = x.p.hops;
        x.view({ dir: [1.6, 5.4, 12], top: 52 });
        const LAY = [
          { name: 'Aplikacija', p: 'HTTP', col: 0xff5d8f, b: 0, f: 'GET /korpa' },
          { name: 'Transport', p: 'TCP', col: 0xffd166, b: 20, f: ':51234 → :443' },
          { name: 'Internet', p: 'IP', col: 0x5ec8ff, b: 20, f: 'ttl' },
          { name: 'Link', p: 'Ethernet', col: 0x7ee0b5, b: 14, f: 'MAC' },
        ];
        const XC = -8.6, XS = 8.6, ZP = 1.5, yl = i => (3 - i) * 1.35, pale = new THREE.Color(C.box);
        const stacks = {};
        for (const [xx, who] of [[XC, 'c'], [XS, 's']]) {
          stacks[who] = LAY.map((l, i) => {
            const b = x.box({ at: [xx, yl(i), 0], size: [3, .5, 2.1], color: l.col });
            b.o.material.color.lerp(pale, .45); b.base = b.o.material.color.clone();
            return b;
          });
          for (const dx of [-1.42, 1.42]) for (const dz of [-.95, .95]) x.rail([xx + dx, 0, dz], [xx + dx, yl(0) + .5, dz], { color: C.edge, opacity: .5, r: .03 });
          x.label(who === 'c' ? 'Klijent<small>pregledač, 10.0.0.12</small>' : 'Server<small>shop.rs, 203.0.113.10</small>', [xx, yl(0) + .7, 0]);
        }
        LAY.forEach((l, i) => x.label(`${l.name} <span class="m">${l.p}</span>`, [XC - 1.65, yl(i) + .25, 0], { center: [1, .5] }));
        const RX = N === 1 ? [0] : Array.from({ length: N }, (_, i) => -4.3 + i * 8.6 / (N - 1));
        const routers = RX.map((rx, i) => x.db({ at: [rx, 0, ZP], r: .62, h: .42, color: 0x9aa4b5, label: N === 1 ? 'Ruter' : `Ruter ${i + 1}` }));
        const WY = .28;
        x.rail([XC + 1.5, WY, ZP], [XS - 1.5, WY, ZP], { color: C.sky, opacity: .3 });
        // paket: HTTP je desno, svako zaglavlje se dodaje levo od prethodnog
        const pk = x.group({ nofit: true }), chips = [], GAP = .5;
        const head = x.label('', [.4, 0, 0], { parent: pk, cls: 'tag', nofit: true, center: [0, .5] });
        let ttl = 64, hops = 0, bytes = 0;
        const sHop = x.stat('hop', 'Skokova', 0), sTtl = x.stat('ttl', 'TTL', 64), sB = x.stat('b', 'Zaglavlja', '0 B');
        const upd = () => {
          const parts = [];
          for (let k = 3; k >= 0; k--) if (chips[k]) parts.push(`<b style="color:${hx(LAY[k].col)}">${LAY[k].p === 'Ethernet' ? 'Eth' : LAY[k].p}</b> ${LAY[k].f === 'ttl' ? 'ttl ' + ttl : LAY[k].f}`);
          head.set(parts.join(' · '));
          side();
          sTtl.set(ttl); sHop.set(hops); sB.set(bytes + ' B');
        };
        // labela ide desno od paketa, a kod servera levo, da ne prekrije imena slojeva
        const side = () => {
          const right = pk.position.x < XS - 3, top = chips.reduce((m, c, k) => (c ? k : m), 0);
          head.center.set(right ? 0 : 1, .5);
          head.position.set(right ? .4 : -top * GAP - .4, 0, 0);
        };
        x.tick(side);
        const add = k => { const c = x.chip(LAY[k].col, { s: .4, parent: pk }); c.position.set(-k * GAP, 0, 0); c.scale.setScalar(.01); x.pop(c); chips[k] = c; bytes += LAY[k].b; upd(); };
        const drop = k => { const c = chips[k]; chips[k] = null; if (c) x.fadeOut(c, .25); bytes -= LAY[k].b; upd(); };
        const at = (xx, y) => new THREE.Vector3(xx, y, ZP);
        const go = (xx, y, v = 2.6) => x.move(pk, [pk.position.clone(), at(xx, y)], v);
        const DOWN = [
          '**Aplikacija** pravi HTTP zahtev `GET /korpa`. Ona ne zna ništa o mreži: samo predaje poruku sloju ispod.',
          '**Transport (TCP)** dodaje zaglavlje sa portovima (51234 → 443), brojem sekvence i potvrdama. Port kaže kom procesu na serveru poruka pripada.',
          '**Internet (IP)** dodaje adresu pošiljaoca i primaoca (10.0.0.12 → 203.0.113.10) i TTL. IP ne garantuje isporuku: paket može da se izgubi ili zakasni.',
          '**Link (Ethernet ili Wi‑Fi)** pakuje sve u okvir sa MAC adresama, ali samo do sledećeg uređaja na putu: rutera.',
        ];
        const UP = ['', '**TCP** po portu 443 nađe proces koji sluša, složi bajtove po redu i pošalje potvrdu.', '**IP**: adresa odredišta je serverova, pa skida IP zaglavlje i predaje segment TCP-u.', 'Server prima okvir, vidi da je MAC njegov i skida **Ethernet** zaglavlje.'];
        const cycle = async () => {
          chips.length = 0; ttl = 64; hops = 0; bytes = 0;
          pk.position.copy(at(XC + 1.15, yl(0) + .3));
          stacks.c[0].flash(LAY[0].col, .8);
          add(0); x.say(DOWN[0]);
          await x.wait(2.4);
          for (let k = 1; k < 4; k++) {
            await go(XC + 1.15, yl(k) + .3);
            stacks.c[k].flash(LAY[k].col, .8);
            add(k); x.say(DOWN[k]);
            await x.wait(2.6);
          }
          for (let i = 0; i < N; i++) {
            await go(RX[i] + .25, WY + .3, 4.2);
            routers[i].flash(C.sky, .9);
            drop(3); await x.wait(.35);
            ttl--; hops++; add(3);
            x.say(i ? `**Ruter ${i + 1}**: isto, TTL je sada ${ttl}. Nijedan ruter ne otvara TCP ni HTTP.` : `**Ruter** čita samo IP zaglavlje: smanji TTL (${ttl + 1} → ${ttl}), u tabeli rutiranja nađe sledeći skok i napravi novi Ethernet okvir. TCP i HTTP ostaju netaknuti.`);
            await x.wait(i ? 1.8 : 3);
          }
          await go(XS + 1.15, WY + .3, 4.2);
          for (let k = 3; k >= 1; k--) {
            if (k < 3) await go(XS + 1.15, yl(k) + .3);
            stacks.s[k].flash(LAY[k].col, .8);
            drop(k); x.say(UP[k]);
            await x.wait(2);
          }
          await go(XS + 1.15, yl(0) + .3);
          stacks.s[0].flash(C.ok, 1);
          x.say('**Aplikacija na serveru** dobija samo HTTP zahtev, kao da je stigao direktno. Odgovor ide istim putem nazad, sa novim zaglavljima.');
          await x.wait(1.6);
          drop(0);
          const o = x.orb(C.ok, { r: .2, label: '200 OK', at: at(XS - 1.5, WY + .3) });
          await x.move(o, [at(XS - 1.5, WY + .3), at(XC + 1.5, WY + .3)], 7);
          x.remove(o);
          stacks.c[0].flash(C.ok, 1);
          await x.wait(2);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ TCP i UDP
  {
    id: 'tcp-udp', d: 'network', sym: 'Tc', title: 'TCP i UDP: handshake i pouzdanost',
    tags: ['tcp', 'udp', 'handshake', 'three-way handshake', 'syn', 'ack', 'retransmisija', 'prozor', 'window', 'head-of-line', 'time_wait', 'keep-alive', 'connection pool'],
    desc: '**TCP** pre podataka otvara vezu (**handshake**: SYN, SYN-ACK, ACK), numeriše bajtove, čeka potvrde i ponavlja izgubljeno, pa aplikacija dobija sve, po redu. **UDP** samo šalje datagrame: nema veze, potvrda ni redosleda, ali ni čekanja.',
    points: [
      'Handshake košta jedan RTT pre prvog bajta. Zato se veze drže otvorenim (keep-alive) i koriste ponovo (connection pooling).',
      'Potvrde su kumulativne: ACK 4 znači "imam sve do 3, sledeći je 4". Kad segment izostane, prijemnik drži kasnije segmente u baferu i ne predaje ih aplikaciji dok rupa ne bude popunjena.',
      'Izgubljen segment se šalje ponovo kad istekne tajmer (RTO) ili ranije, posle tri duplirane potvrde (fast retransmit).',
      'Prozor (window) određuje koliko nepotvrđenih podataka sme da bude u letu; kontrola zagušenja ga smanjuje kad ima gubitaka.',
      'Zatvaranje ide sa FIN u oba smera, a strana koja zatvori prva neko vreme drži vezu u stanju TIME_WAIT.',
      'UDP koriste DNS, glas i video uživo, igre i QUIC (HTTP/3): tamo gde je zakasneo paket gori od izgubljenog ili gde protokol iznad sam rešava pouzdanost.',
    ],
    table: {
      title: 'TCP ili UDP',
      head: ['', 'TCP', 'UDP'],
      rows: [
        ['Veza', 'Da, handshake pre podataka', 'Ne, šalje odmah'],
        ['Isporuka', 'Garantovana, sa ponovnim slanjem', 'Bez garancije'],
        ['Redosled', 'Uvek po redu', 'Kako stigne'],
        ['Zaglavlje', '20 B i više', '8 B'],
        ['Primeri', 'HTTP/1.1 i HTTP/2, baze, SSH', 'DNS, video uživo, igre, QUIC'],
      ],
    },
    code: [
      cs('C# · Veze se koriste ponovo: jedan klijent po servisu, ne po zahtevu', `
builder.Services.AddHttpClient("katalog", c => c.BaseAddress = new Uri("https://katalog"))
    .ConfigurePrimaryHttpMessageHandler(() => new SocketsHttpHandler
    {
        PooledConnectionLifetime = TimeSpan.FromMinutes(2),   // povremeno nova veza, da stignu DNS promene
        MaxConnectionsPerServer = 50,
    });`),
      cs('C# · UDP: pošalji i ne čekaj (StatsD metrika)', `
using var udp = new UdpClient();
await udp.SendAsync(Encoding.UTF8.GetBytes("korpa.dodato:1|c"), "statsd", 8125);`),
    ],
    pitfalls: [
      '`new HttpClient()` po zahtevu otvara novu TCP vezu svaki put: plaća handshake i ostavlja hiljade veza u TIME_WAIT dok ne ponestane portova (socket exhaustion).',
      'Klijent koji drži veze zauvek ne vidi promene DNS-a; zato `PooledConnectionLifetime`.',
      'Nagle algoritam spaja male upise u veće segmente i dodaje kašnjenje malim porukama; interaktivni protokoli ga isključuju (`NoDelay`).',
    ],
    rel: ['net-layers', 'https-tls', 'http-basics'],
    viz: {
      knobs: [
        { id: 'proto', label: 'Protokol', value: 'tcp', options: [['tcp', 'TCP'], ['udp', 'UDP']] },
        { id: 'loss', label: 'Gubitak', value: 1, options: [[0, 'bez gubitka'], [1, 'jedan paket'], [2, 'dva paketa']] },
      ],
      build(x) {
        const { C } = x, TCP = x.p.proto === 'tcp', LOSS = x.p.loss;
        x.view({ dir: [0, 9, 8.6], top: 52 });
        const XC = -7, XS = 7, ZA = -.6, ZB = .6, Y = .65, ONE = 1.7, N = 8, W = 6, RTO = 3.2 * ONE;
        const A = XC + .9, B = XS - .9, SP = (B - A) / ONE;
        x.box({ at: [XC, 0, 0], size: [1.8, 1.2, 1.9], label: 'Klijent' });
        const srv = x.box({ at: [XS, 0, 0], size: [1.8, 1.2, 1.9], label: 'Server' });
        x.rail([A, Y, ZA], [B, Y, ZA], { color: C.sky, opacity: .22 });
        x.rail([B, Y, ZB], [A, Y, ZB], { color: C.ok, opacity: .22 });
        const sx = (cx, i) => cx - (N - 1) * .31 + i * .62, ZR = 2.6;
        const snd = Array.from({ length: N }, (_, i) => x.chip(0x5b6474, { s: .4, at: [sx(XC, i), .2, ZR], label: String(i + 1), fit: true }));
        for (let i = 0; i < N; i++) x.box({ at: [sx(XS, i), 0, ZR], size: [.48, .04, .48], color: C.edge });
        x.label('Za slanje', [XC, 0, ZR + .45], { center: [.5, 0], cls: 'ghost' });
        const appL = x.label('', [XS, 0, ZR + .45], { center: [.5, 0], cls: 'ghost' });
        const sSent = x.stat('s', 'Poslato', 0), sX = TCP ? x.stat('r', 'Ponovljeno', 0, { color: C.wait }) : x.stat('l', 'Izgubljeno', 0, { color: C.err });
        const sD = x.stat('d', 'Predato aplikaciji', '0 / 8', { color: C.ok }), sT = x.stat('t', 'Trajanje', '–');
        x.legend([[C.pink, 'handshake'], [C.sky, 'podaci'], [C.ok, 'potvrda'], [C.wait, 'čeka u baferu'], [C.err, 'izgubljen']]);
        let rcv = [], got = [], sent = 0, extra = 0, t0 = 0;
        const paint = (c, col) => { c.material.color.setHex(col); c.material.emissive.setHex(col); };
        const place = (n, col) => {
          let c = rcv[n];
          if (!c) { c = rcv[n] = x.chip(col, { s: .4, at: [sx(XS, n - 1), .22, ZR], label: String(n) }); x.pop(c); } else paint(c, col);
        };
        const showApp = () => { appL.set(`Prijemni bafer<small>aplikacija dobija: ${got.length ? got.join(' ') : '–'}</small>`); sD.set(`${got.length} / 8`); };
        const trip = async (lbl, dir, col, lost, speed = SP) => {
          const [a, b, z] = dir > 0 ? [A, B, ZA] : [B, A, ZB];
          const o = x.orb(col, { r: .2, label: lbl });
          if (lost) {
            const m = a + (b - a) * .55;
            await x.move(o, [[a, Y, z], [m, Y, z]], speed);
            x.ripple([m, 0, z], C.err, .5);
            o.lbl.set(lbl + ' ✕');
            await x.move(o, [[m, Y, z], [m, -.5, z]], 2.5);
            x.remove(o);
            return false;
          }
          await x.move(o, [[a, Y, z], [b, Y, z]], speed);
          x.remove(o);
          return true;
        };
        const reset = () => {
          rcv.forEach(c => c && x.remove(c)); rcv = []; got = []; sent = 0; extra = 0;
          snd.forEach(c => paint(c, 0x5b6474));
          sSent.set(0); sX.set(0); sT.set('–'); showApp();
        };
        const rtts = () => dec((x.t - t0) / (2 * ONE)) + ' RTT';

        // ---------- TCP: prozor od 4 segmenta, kumulativne potvrde, RTO i fast retransmit ----------
        const tcp = () => new Promise(res => {
          const DROP = [[], ['3:1'], ['3:1', '6:1']][LOSS], tries = {}, sentAt = {};
          let base = 1, next = 1, expected = 1, dup = 0, pumping = false, done = false;
          const buf = new Set();
          const send = n => {
            tries[n] = (tries[n] || 0) + 1; sentAt[n] = x.t; sSent.set(++sent);
            if (tries[n] > 1) sX.set(++extra);
            paint(snd[n - 1], C.sky);
            const lost = DROP.includes(`${n}:${tries[n]}`);
            if (lost) x.wait(ONE * .55).then(() => x.say(`Segment **${n}** se izgubio na putu. Klijent to još ne zna: čeka potvrdu.`));
            x.spawn(async () => { if (await trip(tries[n] > 1 ? `${n} ↺` : String(n), 1, C.sky, lost)) onSeg(n); });
          };
          const pump = () => {
            if (pumping) return;
            pumping = true;
            x.spawn(async () => {
              while (next < base + W && next <= N) { send(next++); await x.wait(.3); }
              pumping = false;
            });
          };
          const onSeg = n => {
            if (n === expected) {
              const before = expected;
              place(n, C.ok); got.push(n); expected++;
              while (buf.has(expected)) { buf.delete(expected); place(expected, C.ok); got.push(expected); expected++; }
              if (expected - before > 1) x.say(`Stigao je **${before}**: rupa je popunjena, pa bafer predaje aplikaciji ${before}–${expected - 1} odjednom.`);
              showApp();
            } else if (n > expected) {
              buf.add(n); place(n, C.wait);
              x.say(`Segment ${n} je stigao, ali čeka u baferu: aplikacija ne dobija ništa posle ${expected - 1} dok ne stigne **${expected}**. To je head-of-line blocking unutar TCP-a.`);
            }
            const a = expected;
            x.spawn(async () => { if (await trip('ACK ' + a, -1, C.ok, false)) onAck(a); });
          };
          const onAck = a => {
            if (done) return;
            if (a > base) {
              for (let i = base; i < a; i++) paint(snd[i - 1], C.ok);
              base = a; dup = 0;
              if (base > N) { done = true; res(); return; }
              pump();
            } else if (a === base && ++dup === 3 && tries[base] === 1) {
              x.say(`Tri potvrde **ACK ${base}** zaredom: klijent ponavlja ${base} odmah, ne čeka tajmer (fast retransmit).`);
              send(base);
            }
          };
          const off = x.tick(() => {
            if (done) { off(); return; }
            if (base > N || !sentAt[base] || x.t - sentAt[base] < RTO) return;
            x.say(`Potvrda za **${base}** nije stigla na vreme (RTO): klijent ga šalje ponovo.`);
            send(base);
          });
          pump();
        });
        const runTcp = async () => {
          x.say('**Handshake**: klijent šalje SYN, server odgovara SYN-ACK, klijent potvrđuje ACK. Podaci kreću tek posle jednog RTT-a.');
          t0 = x.t;
          await trip('SYN', 1, C.pink); srv.flash(C.pink, .6);
          await trip('SYN-ACK', -1, C.pink);
          x.spawn(() => trip('ACK', 1, C.pink));
          await x.wait(.35);
          x.say('Veza je otvorena. Prozor je 6 segmenata: klijent šalje 6 bez čekanja, a svaki sledeći tek kad stigne potvrda.');
          await tcp();
          sT.set(rtts());
          x.say(`Svih 8 segmenata predato je aplikaciji **po redu**, za ${rtts()} od prvog SYN-a${extra ? `, uz ${extra} ponovljena slanja` : ''}. Veza se zatvara sa FIN u oba smera.`);
          await trip('FIN', 1, C.pink); await trip('FIN-ACK', -1, C.pink);
        };
        const runUdp = async () => {
          x.say('**UDP** nema handshake ni potvrde: klijent šalje svih 8 datagrama odmah, jedan za drugim.');
          t0 = x.t;
          const DROP = [[], [3], [3, 6]][LOSS];
          let arrived = 0, lastT = 0;
          for (let n = 1; n <= N; n++) {
            sSent.set(++sent); paint(snd[n - 1], C.sky);
            const lost = DROP.includes(n), m = n;
            x.spawn(async () => {
              if (await trip(String(m), 1, C.sky, lost, SP * (m === 5 ? 1.4 : 1))) { place(m, C.ok); got.push(m); arrived++; lastT = x.t; showApp(); }
              else sX.set(++extra);
            });
            await x.wait(.3);
          }
          await x.wait(ONE + 1.2);
          DROP.forEach(n => x.label('✕', [sx(XS, n - 1), .1, ZR], { cls: 'err', nofit: true }));
          sT.set(dec((lastT - t0) / (2 * ONE)) + ' RTT');
          x.say(`Stiglo je ${arrived} od 8, redom **${got.join(' ')}**. UDP ne ponavlja i ne slaže po redu: to radi aplikacija kad joj treba (DNS ponovi upit, video preskoči kadar).`);
          await x.wait(2.5);
          x.scene.children.filter(o => o.isCSS2DObject && o.element.textContent === '✕').forEach(o => x.remove(o));
        };
        showApp();
        x.spawn(async () => { while (x.alive) { reset(); await (TCP ? runTcp() : runUdp()); await x.wait(3); } });
      },
    },
  },

  // ------------------------------------------------------------------ DNS
  {
    id: 'dns', d: 'network', sym: 'Dn', title: 'DNS: od imena do IP adrese',
    tags: ['dns', 'resolver', 'root', 'tld', 'autoritativni', 'a zapis', 'cname', 'ns', 'mx', 'txt', 'ttl', 'coredns', 'geodns', 'traffic manager'],
    desc: 'Pre bilo kakve veze klijent mora da pretvori ime (`api.shop.rs`) u IP adresu. Pita **rekurzivni resolver** (provajdera, 1.1.1.1 ili DNS u klasteru), a on, ako odgovor nema u kešu, ide redom: **root** server ga upućuje na **TLD** (`.rs`), TLD na **autoritativni** server domena, koji daje konačan odgovor. Svaki odgovor ima **TTL** i kešira se.',
    points: [
      'Keš postoji na više mesta: pregledač, operativni sistem, resolver. Većina upita se reši iz keša za par milisekundi.',
      'TTL je kompromis: dug TTL znači manje upita, ali promena IP adrese stiže do svih tek kad stari unosi isteknu.',
      'Pre migracije ili prebacivanja na rezervu TTL se smanji danima ranije, da promena kasnije bude brza.',
      'DNS može i da raspoređuje saobraćaj: više A zapisa (round robin), odgovor po lokaciji klijenta (GeoDNS) ili po zdravlju servisa (Azure Traffic Manager).',
      'U Kubernetes-u CoreDNS daje imena servisima: `katalog.prod.svc.cluster.local` vodi na ClusterIP servisa.',
    ],
    table: {
      title: 'Najčešći zapisi',
      head: ['Zapis', 'Šta daje', 'Primer'],
      rows: [
        ['A / AAAA', 'IPv4 / IPv6 adresu', 'api.shop.rs → 203.0.113.10'],
        ['CNAME', 'Drugo ime (alias)', 'www.shop.rs → shop.azurefd.net'],
        ['NS', 'Koji serveri su autoritativni za domen', 'shop.rs → ns1.shop.rs'],
        ['MX', 'Server za poštu', 'shop.rs → mail.shop.rs'],
        ['TXT', 'Proizvoljan tekst: provera domena, SPF', 'v=spf1 include:…'],
      ],
    },
    code: [
      sh('Shell · dig i nslookup', `
dig api.shop.rs +short          # samo odgovor
dig api.shop.rs +trace          # ceo put: root → .rs → autoritativni
nslookup api.shop.rs 1.1.1.1    # Windows i Linux: pitaj baš ovaj resolver`),
    ],
    pitfalls: [
      '"Promenio sam DNS, a deo korisnika i dalje ide na stari server": stari unosi žive do isteka TTL-a u svakom kešu, a neki klijenti TTL ni ne poštuju.',
      'Aplikacija koja drži TCP veze zauvek ili zapamti IP pri startu ne vidi promenu DNS-a ni posle isteka TTL-a.',
      'Spor DNS izgleda kao spora aplikacija: prvi zahtev ka novom hostu čeka razrešavanje imena.',
    ],
    rel: ['net-layers', 'k8s-basics', 'sd-lb'],
    viz: {
      knobs: [{ id: 'ttl', label: 'TTL A zapisa', value: 20, options: [[8, '8 s'], [20, '20 s'], [45, '45 s']] }],
      actions: [{ id: 'ask', label: 'Novi upit', icon: 'search' }, { id: 'flush', label: 'Isprazni keš', icon: 'refresh-cw' }],
      build(x) {
        const { C } = x, TTL = x.p.ttl;
        x.view({ dir: [1.2, 11, 10], top: 52 });
        x.plate({ at: [5.6, 0, 0], w: 4.6, d: 10, label: 'Autoritativni DNS' });
        const br = x.box({ at: [-10.4, 0, 0], size: [1.8, 1, 1.4], label: 'Pregledač' });
        const rs = x.box({ at: [-3.6, 0, 0], size: [2.2, 1.1, 1.6], label: 'Rekurzivni resolver<small>1.1.1.1 ili DNS provajdera</small>' });
        const root = x.db({ at: [4.8, 0, -3.3], r: .6, h: .9, color: 0xc3a6ff, label: 'Root .<small>zna ko vodi .rs</small>', side: 'right' });
        const tld = x.db({ at: [4.8, 0, 0], r: .6, h: .9, color: 0x5ec8ff, label: 'TLD .rs<small>zna ko vodi shop.rs</small>', side: 'right' });
        const auth = x.db({ at: [4.8, 0, 3.3], r: .6, h: .9, color: 0x7ee0b5, label: 'ns1.shop.rs<small>zna adresu api.shop.rs</small>', side: 'right' });
        const api = x.box({ at: [-7, 0, 4.6], size: [1.9, 1, 1.4], label: 'api.shop.rs<small>203.0.113.10</small>', side: 'right' });
        const Y = .55, P = (n, side) => n.port(side).setY(Y);
        for (const s of [root, tld, auth]) x.rail(P(rs, 'right'), P(s, 'left'), { opacity: .22 });
        x.rail(P(br, 'right'), P(rs, 'left'), { opacity: .22 });
        x.rail(P(br, 'front'), P(api, 'left'), { opacity: .22, color: C.ok });
        const cacheL = x.label('', [rs.pos.x, 0, 1.25], { center: [.5, 0] });
        const sQ = x.stat('q', 'Upita dalje', 0), sMs = x.stat('ms', 'Vreme odgovora', '–'), sH = x.stat('h', 'Iz keša', 0, { color: C.ok });
        let cache = {}, busy = false, hits = 0;
        const aLeft = () => cache.a ? Math.max(0, Math.ceil(cache.a - x.t)) : 0;
        const showCache = () => {
          const L = [];
          if (cache.rs) L.push('NS .rs · 2 dana');
          if (cache.dom) L.push('NS shop.rs · 1 h');
          if (aLeft()) L.push(`A api.shop.rs · ${aLeft()} s`);
          cacheL.set('Keš resolvera' + (L.length ? L.map(s => `<small>${s}</small>`).join('') : '<small>prazan</small>'));
        };
        x.tick(() => { if (cache.a && x.t >= cache.a) { cache.a = 0; x.say('A zapis je istekao (TTL). NS zapisi žive duže, pa sledeći upit ide samo do ns1.shop.rs.'); } });
        x.every(.25, showCache);
        const hop = async (a, b, lbl, col, v = 9) => { const o = x.orb(col, { r: .2, label: lbl }); await x.move(o, [a, b], v); x.remove(o); };
        const ask = async (s, a, col) => { await hop(P(rs, 'right'), P(s, 'left'), 'api.shop.rs ?', C.sky); s.flash(col, .7); await hop(P(s, 'left'), P(rs, 'right'), a, col); };
        const resolve = async () => {
          if (busy) return;
          busy = true;
          let ms = 12, q = 0;
          await hop(P(br, 'right'), P(rs, 'left'), 'api.shop.rs ?', C.sky);
          if (aLeft()) {
            rs.flash(C.ok, .8); sH.set(++hits);
            x.say(`Odgovor je u kešu resolvera (još ${aLeft()} s): nijedan upit dalje, oko 12 ms. Tako se reši većina DNS upita.`);
          } else {
            rs.flash(C.wait, .6);
            const full = !cache.rs;
            if (!cache.rs) { q++; ms += 25; await ask(root, 'pitaj .rs', 0xc3a6ff); cache.rs = true; }
            if (!cache.dom) { q++; ms += 30; await ask(tld, 'pitaj ns1.shop.rs', 0x5ec8ff); cache.dom = true; }
            q++; ms += 40; await ask(auth, `A 203.0.113.10 · TTL ${TTL} s`, 0x7ee0b5);
            cache.a = x.t + TTL;
            x.say(full ? `Keš je prazan, pa resolver ide redom: **root** ga upućuje na .rs, **.rs** na ns1.shop.rs, a **ns1.shop.rs** daje A zapis sa TTL-om ${TTL} s. Tri upita, oko ${ms} ms.`
              : `Resolver već zna ko je autoritativan za shop.rs (NS zapis je još u kešu), pa pita samo **ns1.shop.rs**: jedan upit, oko ${ms} ms.`);
          }
          sQ.set(q); sMs.set(ms + ' ms');
          await hop(P(rs, 'left'), P(br, 'right'), '203.0.113.10', C.ok);
          await hop(P(br, 'front'), P(api, 'left'), 'TCP 203.0.113.10:443', C.sky, 7);
          api.flash(C.ok, .8);
          busy = false;
        };
        x.on('ask', () => x.spawn(resolve));
        x.on('flush', () => { cache = {}; showCache(); x.say('Keš je prazan: sledeći upit ide celim putem, od root servera.'); });
        showCache();
        x.spawn(async () => { while (x.alive) { await resolve(); await x.wait(4.5); } });
      },
    },
  },

  // ------------------------------------------------------------------ HTTP
  {
    id: 'http-basics', d: 'network', sym: 'Hp', title: 'HTTP: zahtev, odgovor i verzije',
    tags: ['http', 'zahtev', 'odgovor', 'status', 'zaglavlja', 'headers', 'http/1.1', 'http/2', 'http/3', 'quic', 'multipleksiranje', 'head-of-line blocking', 'keep-alive', '404', '500', '502', '503'],
    desc: 'HTTP je razgovor zahtev–odgovor: klijent šalje **metodu**, **putanju**, **zaglavlja** i po potrebi telo, a server vraća **status**, zaglavlja i telo. Poruka je ista u svim verzijama; menja se kako putuje: HTTP/1.1 jedan zahtev po vezi u jednom trenutku, HTTP/2 mnogo tokova kroz jednu TCP vezu, HTTP/3 isto to preko QUIC-a na UDP-u.',
    points: [
      'Statusi po grupama: **2xx** uspeh, **3xx** preusmerenje, **4xx** greška klijenta (400, 401, 403, 404, 409, 429), **5xx** greška servera (500, 502, 503, 504).',
      'Zaglavlja nose sve ostalo: `Content-Type`, `Authorization`, `Cache-Control`, `ETag`, `Accept-Encoding`.',
      'HTTP/1.1 drži vezu otvorenom (keep-alive), ali po vezi ide jedan zahtev u jednom trenutku, pa pregledač otvara do 6 veza po hostu.',
      'HTTP/2 šalje sve zahteve odjednom kroz jednu vezu (multipleksiranje) i sažima zaglavlja. Ali jedan izgubljen TCP paket zaustavi sve tokove (head-of-line blocking).',
      'HTTP/3 radi preko QUIC-a: tokovi su nezavisni, pa gubitak zaustavi samo svoj tok, a veza se otvara u jednom RTT-u.',
    ],
    code: [
      txt('HTTP poruke · zahtev i odgovor', `
GET /api/proizvodi/42 HTTP/1.1
Host: shop.rs
Accept: application/json
Authorization: Bearer eyJhbGciOi...

HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Cache-Control: max-age=60
ETag: "a1b2c3"

{"id":42,"naziv":"Slušalice","cena":7990}`),
      cs('C# · Traži HTTP/3, a prihvati 2 ili 1.1 ako server ne može', `
var req = new HttpRequestMessage(HttpMethod.Get, "https://shop.rs/api/proizvodi/42")
{
    Version = HttpVersion.Version30,
    VersionPolicy = HttpVersionPolicy.RequestVersionOrLower,
};
using var res = await http.SendAsync(req);
Console.WriteLine($"{(int)res.StatusCode} preko HTTP/{res.Version}");`),
    ],
    pitfalls: [
      '`200 OK` sa `{"error": ...}` u telu lomi klijente, keševe i monitoring: greška treba da ima 4xx ili 5xx status.',
      'Deljenje resursa na više domena (domain sharding) pomagalo je HTTP/1.1; sa HTTP/2 samo usporava, jer svaki domen traži novu vezu.',
      '`502` i `504` vraća proksi ili gateway, ne tvoja aplikacija: prvo proveri da li je zahtev uopšte stigao do nje.',
    ],
    rel: ['tcp-udp', 'https-tls', 'http-methods', 'sd-gateway'],
    viz: {
      kind: 'svg',
      knobs: [
        { id: 'ver', label: 'Verzija', value: 'h1', options: [['h1', 'HTTP/1.1'], ['h2', 'HTTP/2'], ['h3', 'HTTP/3']] },
        { id: 'loss', label: 'Mreža', value: 0, options: [[0, 'bez gubitaka'], [1, 'jedan izgubljen paket']] },
      ],
      build(x) {
        const { ver } = x.p, loss = !!x.p.loss, wf = waterfall(ver, loss);
        const W = x.W, H = x.H, NAR = W < 700;
        const L = NAR ? 132 : 190, R = W - 22, T = 64, B = 74, rh = Math.min(32, (H - T - B) / RES.length), YB = T + RES.length * rh;
        const X = ms => L + ms / WF_MAX * (R - L);
        const COL = { queue: '#6b7686', conn: '#ff9f68', ttfb: '#7ee0b5', dl: '#5ec8ff', stall: '#ff4d6d' };
        const NAMES = [['queue', 'u redu'], ['conn', ver === 'h3' ? 'veza: QUIC + TLS' : 'veza: TCP + TLS'], ['ttfb', 'čeka odgovor'], ['dl', 'preuzimanje'], ['stall', 'zastoj']];
        let lx = 16;
        for (const [k, t] of NAMES) {
          if (k === 'stall' && !loss) continue;
          x.el('rect', { x: lx, y: H - 27, width: 14, height: 12, rx: 2, fill: COL[k] });
          x.txt(lx + 20, H - 16, t, { class: 'sm mut' });
          lx += 20 + t.length * 7 + 22;
        }
        for (let ms = 0; ms <= WF_MAX; ms += 500) {
          x.el('line', { x1: X(ms), x2: X(ms), y1: T - 8, y2: YB + 4, stroke: '#4b5566', 'stroke-opacity': .35 });
          x.txt(X(ms), YB + 24, ms ? dec(ms / 1000) + ' s' : '0', { 'text-anchor': 'middle', class: 'sm mut' });
        }
        const clipR = x.el('rect', { x: L, y: 0, width: 0, height: H }, x.el('clipPath', { id: 'wf-clip' }, x.el('defs')));
        const g = x.el('g', { 'clip-path': 'url(#wf-clip)' });
        wf.rs.forEach((r, i) => {
          const y = T + i * rh;
          if (i % 2) x.el('rect', { x: 8, y: y - 2, width: W - 16, height: rh, fill: '#ffffff', 'fill-opacity': .03 });
          x.txt(16, y + rh / 2 + 3, r.n, { class: 'sm' });
          if (!NAR) x.txt(L - 14, y + rh / 2 + 3, r.kb + ' KB', { class: 'sm mut', 'text-anchor': 'end' });
          for (const s of r.segs) x.el('rect', { x: X(s.a), y: y + rh / 2 - 6, width: Math.max(1.5, X(s.b) - X(s.a)), height: 12, rx: 2, fill: COL[s.k] }, g);
        });
        const endX = X(wf.total);
        const fin = x.el('g', { opacity: 0 });
        x.el('line', { x1: endX, x2: endX, y1: T - 8, y2: YB + 4, stroke: '#eef1f6', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }, fin);
        const endTxt = x.txt(endX + (endX > R - 150 ? -8 : 8), YB - 8, `učitano za ${dec(wf.total / 1000, 2)} s`, { class: 'hd', 'text-anchor': endX > R - 150 ? 'end' : 'start' }, fin);
        const cur = x.el('line', { y1: T - 8, y2: YB + 4, stroke: '#ffffff', 'stroke-opacity': .55 });
        const sT = x.stat('t', 'Učitano za', '–'), sC = x.stat('c', ver === 'h3' ? 'QUIC veza' : 'TCP veza', wf.conns), sR = x.stat('r', 'Otvaranje veze', ver === 'h3' ? '1 RTT' : '2 RTT');
        const SAY = {
          h1: '**HTTP/1.1**: po vezi ide jedan zahtev u jednom trenutku. Pregledač otvara do 6 veza i svaka plaća svoj handshake (narandžasto), a ostali resursi čekaju u redu (sivo) da se neka veza oslobodi.',
          h2: '**HTTP/2**: jedna veza, a svih 11 zahteva ide odjednom čim stigne HTML. Nema čekanja u redu ni dodatnih handshake-ova; tokovi dele isti propusni opseg.',
          h3: '**HTTP/3**: isto multipleksiranje, ali preko QUIC-a na UDP-u, pa se veza (zajedno sa TLS-om) otvara u jednom RTT-u umesto dva.',
        };
        const LOSSAY = {
          h1: ' Izgubljen paket iz vendor.js zaustavlja samo vezu na kojoj je on; ostale veze rade dalje.',
          h2: ' **Head-of-line blocking**: jedan izgubljen TCP paket zaustavlja sve tokove na vezi (crveno) dok se ne pošalje ponovo, iako je izgubljen samo deo vendor.js.',
          h3: ' QUIC zna kom toku paket pripada: čeka samo vendor.js, a ostali tokovi idu dalje i koriste oslobođen opseg.',
        };
        x.say(SAY[ver] + (loss ? LOSSAY[ver] : ''));
        if (ver !== 'h3') { sR.el.title = 'TCP handshake 1 RTT + TLS 1.3 1 RTT'; }
        const DUR = 6.5;
        let t = 0;
        x.tick(dt => {
          t += dt;
          const ms = Math.min(WF_MAX, t / DUR * WF_MAX), xx = X(ms);
          clipR.setAttribute('width', Math.max(0, xx - L));
          cur.setAttribute('x1', xx); cur.setAttribute('x2', xx);
          const reached = ms >= wf.total;
          fin.setAttribute('opacity', reached ? 1 : 0);
          sT.set(reached ? dec(wf.total / 1000, 2) + ' s' : '…');
          if (t > DUR + 3) t = 0;
        });
        endTxt.textContent = `učitano za ${dec(wf.total / 1000, 2)} s`;
      },
    },
  },

  // ------------------------------------------------------------------ Metode i idempotentnost
  {
    id: 'http-methods', d: 'network', sym: 'Hm', title: 'HTTP metode i idempotentnost',
    tags: ['get', 'post', 'put', 'patch', 'delete', 'idempotentnost', 'idempotent', 'bezbedna metoda', 'safe', 'idempotency-key', 'retry', 'rest', '201', '204', '404', '409'],
    desc: 'Metoda kaže šta zahtev radi sa resursom. Dve osobine određuju da li sme da se ponovi: **bezbedna** metoda ne menja stanje (GET, HEAD), a **idempotentna** ostavlja isto stanje bez obzira koliko puta je pozvana (GET, PUT, DELETE). POST nije idempotentan: ponovljen POST pravi novi resurs.',
    points: [
      '**GET** čita, **POST** pravi novi resurs ili pokreće radnju, **PUT** postavlja ceo resurs, **PATCH** menja deo, **DELETE** briše.',
      'Idempotentnost se odnosi na stanje, ne na odgovor: drugi DELETE vrati 404, ali resursa i dalje nema.',
      'Mreža može da izgubi odgovor posle uspešne obrade. Klijent tada ne zna da li je server uradio posao, pa ponavlja; zato automatski retry sme samo na idempotentnim operacijama.',
      'POST se pravi idempotentnim pomoću ključa: klijent šalje `Idempotency-Key`, server pamti ključ i rezultat, a ponovljen zahtev dobija isti odgovor (tako radi Stripe i većina platnih API-ja).',
      'PATCH može, ali ne mora biti idempotentan: "postavi status na plaćeno" jeste, "povećaj količinu za 1" nije.',
    ],
    table: {
      title: 'Metode',
      head: ['Metoda', 'Bezbedna', 'Idempotentna', 'Tipičan uspeh'],
      rows: [
        ['GET', 'da', 'da', '200 OK'],
        ['POST', 'ne', 'ne', '201 Created + Location'],
        ['PUT', 'ne', 'da', '200 OK ili 204 No Content'],
        ['PATCH', 'ne', 'zavisi od izmene', '200 OK'],
        ['DELETE', 'ne', 'da', '204 No Content'],
      ],
    },
    code: [
      cs('C# · POST sa Idempotency-Key', `
app.MapPost("/porudzbine", async (NovaPorudzbina dto,
    [FromHeader(Name = "Idempotency-Key")] string? kljuc, AppDb db, CancellationToken ct) =>
{
    if (kljuc is null) return Results.BadRequest("Idempotency-Key je obavezan");

    var ranije = await db.IdemKljucevi.FindAsync([kljuc], ct);
    if (ranije is not null)                                   // ponovljen zahtev: isti odgovor, bez nove porudžbine
        return Results.Created($"/porudzbine/{ranije.PorudzbinaId}", await db.Porudzbine.FindAsync([ranije.PorudzbinaId], ct));

    var p = new Porudzbina(dto);
    db.Porudzbine.Add(p);
    db.IdemKljucevi.Add(new IdemKljuc { Kljuc = kljuc, Porudzbina = p });   // ista transakcija kao porudžbina
    await db.SaveChangesAsync(ct);                                          // jedinstven ključ hvata istovremene pokušaje
    return Results.Created($"/porudzbine/{p.Id}", p);
});`),
    ],
    pitfalls: [
      'GET koji menja stanje (`GET /obrisi?id=7`) izvršiće pregledač pri prefetch-u, crawler ili keš koji ga ponovi.',
      'Automatski retry na POST-u (Polly, gateway, mobilni klijent) bez idempotency ključa pravi duple porudžbine i dvostruke naplate.',
      'Ključu treba jedinstveni indeks i upis u istoj transakciji kao rezultat. Bez indeksa dva istovremena pokušaja oba prođu proveru, a bez transakcije pad između dva upisa ostavi porudžbinu bez ključa.',
    ],
    rel: ['http-basics', 'delivery', 'sd-resilience', 'retry-dlq'],
    viz: {
      knobs: [
        { id: 'm', label: 'Metoda', value: 'POST', options: [['GET', 'GET'], ['POST', 'POST'], ['PUT', 'PUT'], ['DELETE', 'DELETE']] },
        { id: 'key', label: 'Idempotency-Key', value: false, toggle: true },
      ],
      actions: [{ id: 'send', label: 'Pošalji ponovo', icon: 'send' }],
      build(x) {
        const { C } = x, M = x.p.m;
        x.view({ dir: [1.4, 10, 10.5], top: 52 });
        const cli = x.box({ at: [-8.6, 0, 0], size: [1.9, 1.1, 1.5], label: 'Klijent<small>mobilna aplikacija</small>' });
        const api = x.box({ at: [-1.8, 0, 0], size: [2, 1.1, 1.6], label: 'API' });
        const db = x.db({ at: [4.8, 0, -.4], r: .8, h: 1.1 });
        const store = x.box({ at: [-1.8, 0, 2.7], size: [1.8, .28, 1], color: 0x7c8699, label: 'Sačuvani ključevi', side: 'below' });
        const Y = .62, ZQ = -.55, ZS = .55, A = cli.port('right').x, Bx = api.port('left').x;
        x.rail([A, Y, ZQ], [Bx, Y, ZQ], { opacity: .22 });
        x.rail([Bx, Y, ZS], [A, Y, ZS], { opacity: .22, color: C.ok });
        x.rail(api.port('right').setY(Y), db.port('left').setY(Y), { opacity: .22 });
        const sCall = x.stat('c', 'Poziva API-ju', 0), sRows = x.stat('r', 'Porudžbina u bazi', 3), sPaid = x.stat('p', 'Naplaćeno', '0 din', { color: C.wait });
        const tab = x.label('', [db.pos.x + 1, .55, db.pos.z], { center: [0, .5] });
        let rows = [], calls = 0, paid = 0, nextId = 8, busy = false, seq = 0;
        const keys = new Map();
        const COLR = { new: '#ffeab8', dup: '#ffb3c0', hit: '#bfe0ff', ok: '#c6f7e0' };
        const render = () => {
          tab.set('Baza · porudžbine' + rows.map(r => `<small${r.k ? ` style="color:${COLR[r.k]}"` : ''}>#${r.id} · ${r.st}</small>`).join(''));
          sRows.set(rows.length);
        };
        const mark = (r, k, dur = 1.4) => { r.k = k; render(); if (dur) x.wait(dur).then(() => { if (r.k === k) { r.k = ''; render(); } }); };
        const resetRows = () => {
          rows = [[5, 'poslato'], [6, 'plaćeno'], [7, 'čeka plaćanje']].map(([id, st]) => ({ id, st, k: '' }));
          nextId = 8; paid = 0; sPaid.set('0 din'); render();
        };
        const paintStore = () => store.o.material.color.setHex(x.p.key ? 0xe8ebf0 : 0x7c8699);
        const fly = async (lbl, dir, col, lost = false) => {
          const [a, b, z] = dir > 0 ? [A, Bx, ZQ] : [Bx, A, ZS];
          const o = x.orb(col, { r: .2, label: lbl });
          if (lost) {
            const m = (a + b) / 2;
            await x.move(o, [[a, Y, z], [m, Y, z]], 7);
            x.ripple([m, 0, z], C.err, .55); o.lbl.set('odgovor izgubljen');
            await x.move(o, [[m, Y, z], [m, -.5, z]], 2.2);
            x.remove(o);
            return;
          }
          await x.move(o, [[a, Y, z], [b, Y, z]], 7);
          x.remove(o);
        };
        const toDb = async (lbl, col = C.sky) => {
          const o = x.orb(col, { r: .16, label: lbl });
          await x.move(o, [api.port('right').setY(Y), db.port('left').setY(Y)], 9);
          db.flash(col, .6);
          x.remove(o);
        };
        const row7 = () => rows.find(r => r.id === 7);
        // obrada na serveru; vraća status odgovora
        const handle = async (KEY, key, attempt) => {
          sCall.set(++calls);
          api.flash(C.sky, .5);
          if (KEY && keys.has(key)) {
            store.flash(C.ok, .9);
            x.say(`Ključ **${key}** je već viđen: server vraća sačuvan odgovor 201, bez nove porudžbine i bez nove naplate.`);
            await x.wait(.6);
            return '201 Created (sačuvan)';
          }
          if (M === 'GET') { await toDb('SELECT'); const r = row7(); if (r) mark(r, 'hit'); return '200 OK'; }
          if (M === 'PUT') {
            await toDb('UPDATE');
            const r = row7();
            if (r) { r.st = 'plaćeno'; mark(r, 'ok'); }
            return '200 OK';
          }
          if (M === 'DELETE') {
            const r = row7();
            if (!r) { await toDb('DELETE'); return '404 Not Found'; }
            await toDb('DELETE', C.err);
            rows = rows.filter(q => q !== r); render();
            return '204 No Content';
          }
          await toDb('INSERT', C.wait);
          const r = { id: nextId++, st: attempt > 1 ? 'nova · duplikat' : 'nova', k: '' };
          rows.push(r);
          mark(r, attempt > 1 ? 'dup' : 'new', attempt > 1 ? 0 : 2.5);
          paid += 1200; sPaid.set(String(paid).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0') + '\u00a0din');
          if (KEY) {
            keys.set(key, r.id);
            const k = x.chip(C.wait, { s: .3, at: [store.pos.x - .55 + (keys.size - 1) % 4 * .36, .4, store.pos.z] });
            x.pop(k);
          }
          return '201 Created';
        };
        const INTRO = {
          GET: '**GET** samo čita: bezbedan je (ne menja stanje) i idempotentan. Odgovor će se izgubiti, a ponovljen GET vraća isti podatak.',
          POST: '**POST** pravi novu porudžbinu. Gledaj šta se desi kad se odgovor izgubi, a klijent posle timeout-a pošalje isti zahtev ponovo.',
          PUT: '**PUT** postavlja porudžbinu #7 na stanje "plaćeno". Odgovor će se izgubiti, a klijent će ponoviti zahtev.',
          DELETE: '**DELETE** briše porudžbinu #7. Odgovor će se izgubiti, a klijent će ponoviti zahtev.',
        };
        const send = async () => {
          if (busy) return;
          busy = true;
          if (M !== 'POST' || rows.length >= 5) resetRows();
          const KEY = M === 'POST' && x.p.key, key = 'k-' + (0x4a1f + 97 * ++seq).toString(16);
          const path = M === 'POST' ? 'POST /porudzbine' : `${M} /porudzbine/7`;
          x.say(INTRO[M] + (M === 'POST' && KEY ? ` Klijent uz zahtev šalje ključ **${key}**.` : ''));
          await fly(path + (KEY ? ` · ${key}` : ''), 1, C.sky);
          const r1 = await handle(KEY, key, 1);
          await fly(r1, -1, C.ok, true);
          cli.flash(C.wait, 1.2);
          const tl = x.label('timeout, šaljem ponovo', [0, .75, 0], { parent: cli.o, cls: 'wait', nofit: true });
          await x.wait(1.3);
          x.remove(tl);
          await fly('↺ ' + path + (KEY ? ` · ${key}` : ''), 1, C.sky);
          const r2 = await handle(KEY, key, 2);
          await fly(r2, -1, C.ok);
          cli.flash(C.ok, .8);
          const END = {
            GET: 'Oba GET-a vratila su isti podatak, a baza se nije promenila. Ponavljanje je bezbedno.',
            PUT: 'Drugi PUT postavio je isto stanje: #7 je i dalje "plaćeno". Ponavljanje je bezbedno.',
            DELETE: 'Drugi DELETE dobio je **404**, ali stanje je isto: porudžbine #7 nema. Idempotentnost je o stanju, ne o odgovoru.',
            POST: KEY ? 'Isti ključ u oba pokušaja: **jedna porudžbina, jedna naplata**, a klijent je dobio odgovor 201.'
              : `Odgovor na prvi POST se izgubio, klijent je ponovio i nastala je **druga porudžbina** (#${nextId - 1}), a kupac je naplaćen dvaput. Uključi **Idempotency-Key**.`,
          };
          x.say(END[M]);
          busy = false;
        };
        x.on('send', () => x.spawn(send));
        x.on('knob', k => { if (k === 'key') { paintStore(); if (M !== 'POST') x.say('Idempotency-Key se koristi za POST; GET, PUT i DELETE su idempotentni sami po sebi.'); } });
        resetRows(); paintStore();
        x.spawn(async () => { await x.wait(.6); while (x.alive) { await send(); await x.wait(4); } });
      },
    },
  },

  // ------------------------------------------------------------------ HTTPS i TLS
  {
    id: 'https-tls', d: 'network', sym: 'Tl', title: 'HTTPS i TLS handshake',
    tags: ['https', 'tls', 'ssl', 'handshake', 'sertifikat', 'certificate', 'ca', 'tls 1.3', 'tls 1.2', 'quic', '0-rtt', 'hsts', 'mtls', 'ecdhe', 'forward secrecy'],
    desc: 'HTTPS je HTTP kroz **TLS**. Pre prvog zahteva klijent i server u **handshake-u** dogovore algoritme, server dokaže identitet **sertifikatom** potpisanim od izdavaoca kome klijent veruje (CA), a obe strane izvedu zajednički **ključ sesije** kojim se dalje sve šifruje. TLS 1.3 za to troši jedan RTT, TLS 1.2 dva, a HTTP/3 spaja TCP i TLS korak u jedan.',
    points: [
      'Sertifikat vezuje ime domena za javni ključ. Klijent proverava lanac do CA kome veruje, rok važenja i da li ime odgovara hostu.',
      'Razmena ključeva (ECDHE) daje isti tajni ključ na obe strane, a da on nikad ne putuje mrežom. Kasnija krađa ključa servera ne otkriva stare sesije (forward secrecy).',
      'Pri nastavku sesije klijent može da pošalje zahtev već u prvoj poruci (0-RTT, TLS 1.3 i QUIC). Takvi podaci mogu biti ponovljeni (replay), pa smeju samo za idempotentne zahteve.',
      'TLS se obično završava na ivici (load balancer, Application Gateway, ingress); unutra se po potrebi šifruje ponovo ili koristi mTLS, gde i klijent ima sertifikat.',
      '**HSTS** kaže pregledaču da domen uvek otvara preko HTTPS-a, pa ni prvi zahtev ne ide nešifrovano.',
    ],
    table: {
      title: 'Čekanje pre prvog bajta odgovora',
      head: ['Veza', 'Handshake', 'Do odgovora'],
      rows: [
        ['HTTP preko TCP-a', '1 RTT (TCP)', '2 RTT'],
        ['HTTPS, TLS 1.2', '1 RTT TCP + 2 RTT TLS', '4 RTT'],
        ['HTTPS, TLS 1.3', '1 RTT TCP + 1 RTT TLS', '3 RTT'],
        ['HTTP/3 (QUIC)', '1 RTT za oba', '2 RTT'],
        ['HTTP/3, 0-RTT (nastavak sesije)', 'zahtev ide odmah', '1 RTT'],
      ],
      note: 'Sa RTT-om od 80 ms razlika između TLS 1.2 i HTTP/3 je 160 ms na svakoj novoj vezi.',
    },
    code: [
      cs('C# · HTTPS preusmerenje i HSTS u ASP.NET Core', `
builder.Services.AddHsts(o => { o.MaxAge = TimeSpan.FromDays(365); o.IncludeSubDomains = true; });

var app = builder.Build();
if (!app.Environment.IsDevelopment()) app.UseHsts();
app.UseHttpsRedirection();`),
      sh('Shell · verzija TLS-a, sertifikat i lanac', `
curl -sv https://shop.rs/ -o /dev/null 2>&1 | grep -E "SSL connection|subject:|issuer:|expire"
openssl s_client -connect shop.rs:443 -servername shop.rs </dev/null   # ceo lanac sertifikata`),
    ],
    pitfalls: [
      'Istekao sertifikat obara sve klijente odjednom. Potrebno je automatsko obnavljanje (Let’s Encrypt, Key Vault, cert-manager) i alarm 30 dana pre isteka.',
      'Isključena provera sertifikata (`ServerCertificateCustomValidationCallback = (...) => true`) iz testa koja stigne u produkciju otvara vrata napadu "čovek u sredini".',
      'Server koji ne šalje međusertifikate radi u pregledaču, koji ih ima u kešu, a puca u `HttpClient`-u i na mobilnim uređajima.',
    ],
    rel: ['tcp-udp', 'http-basics', 'sd-firewall'],
    viz: {
      knobs: [
        { id: 'ver', label: 'Veza', value: 'tls13', options: [['http', 'HTTP'], ['tls12', 'TLS 1.2'], ['tls13', 'TLS 1.3'], ['h3', 'HTTP/3'], ['rtt0', '0-RTT']] },
        { id: 'rtt', label: 'RTT', value: 80, live: true, options: [[20, '20 ms'], [80, '80 ms'], [200, '200 ms']] },
      ],
      build(x) {
        const { C } = x, V = x.p.ver;
        x.view({ dir: [0, 8.5, 9.5], top: 52 });
        const cli = x.box({ at: [-7, 0, 0], size: [1.9, 1.1, 1.7], label: 'Pregledač' });
        const srv = x.box({ at: [7, 0, 0], size: [1.9, 1.1, 1.7], label: 'shop.rs' });
        const Y = .62, ZQ = -.6, ZS = .6, A = cli.port('right').x, B = srv.port('left').x, SP = (B - A) / 1.6;
        const r1 = x.rail([A, Y, ZQ], [B, Y, ZQ], { opacity: .3, color: C.dim }), r2 = x.rail([B, Y, ZS], [A, Y, ZS], { opacity: .3, color: C.dim });
        for (const r of [r1, r2]) r.material = new x.THREE.MeshBasicMaterial({ color: C.dim, transparent: true, opacity: .3, depthWrite: false });   // svoj materijal: boja kanala se menja
        const chan = x.label('', [0, 1.45, 0]);
        const sR = x.stat('r', 'Čekanja (RTT)', 0), sM = x.stat('m', 'Do prvog bajta', '–');
        x.legend([[C.pink, 'TCP'], [C.wait, 'TLS dogovor'], [C.ok, 'šifrovani podaci'], [C.err, 'nešifrovani podaci']]);
        const SCR = {
          http: [['>', 'SYN', 'tcp'], ['<', 'SYN-ACK', 'tcp'], ['>', 'ACK + GET /', 'plain'], ['<', '200 OK', 'plain']],
          tls12: [['>', 'SYN', 'tcp'], ['<', 'SYN-ACK', 'tcp'], ['>', 'ACK + ClientHello', 'tls'], ['<', 'ServerHello + sertifikat', 'tls cert'], ['>', 'razmena ključa + Finished', 'tls key'], ['<', 'Finished', 'tls enc'], ['>', 'GET /', 'sec'], ['<', '200 OK', 'sec']],
          tls13: [['>', 'SYN', 'tcp'], ['<', 'SYN-ACK', 'tcp'], ['>', 'ACK + ClientHello + key share', 'tls'], ['<', 'ServerHello + sertifikat + Finished', 'tls cert key'], ['>', 'Finished + GET /', 'sec enc'], ['<', '200 OK', 'sec']],
          h3: [['>', 'QUIC Initial: ClientHello', 'tls'], ['<', 'ServerHello + sertifikat + Finished', 'tls cert key'], ['>', 'Finished + GET /', 'sec enc'], ['<', '200 OK', 'sec']],
          rtt0: [['>', 'ClientHello + GET / (0-RTT)', 'sec'], ['<', 'ServerHello + Finished + 200 OK', 'sec']],
        }[V];
        const INTRO = {
          http: '**HTTP bez TLS-a**: posle TCP handshake-a zahtev ide odmah, ali kao čist tekst: svaki ruter i Wi‑Fi usput može da ga pročita i izmeni.',
          tls12: '**TLS 1.2**: posle TCP-a još dva kruga. Server šalje sertifikat, klijent šalje svoj deo razmene ključa, pa obe strane potvrde (Finished).',
          tls13: '**TLS 1.3**: klijent već u prvoj poruci šalje svoj deo ključa (key share), pa je dogovor gotov u jednom krugu, a zahtev ide zajedno sa Finished.',
          h3: '**HTTP/3 (QUIC)** spaja transport i TLS: nema posebnog TCP handshake-a, pa su i veza i šifrovanje gotovi u jednom RTT-u.',
          rtt0: '**0-RTT** (HTTP/3, nastavak sesije): klijent ima ključ iz prošle sesije, pa zahtev šalje već u prvoj QUIC poruci. Najbrže je, ali takvi podaci mogu biti ponovljeni (replay), pa samo za idempotentne zahteve. Preko TCP-a bi pre toga išao i TCP handshake.',
        }[V];
        const COLK = { tcp: C.pink, tls: C.wait, sec: C.ok, plain: C.err };
        let certL = null, n = 0;
        const setChan = s => chan.set(s === 'enc' ? 'Kanal<small>šifrovan ključem sesije</small>' : s === 'tls' ? 'Kanal<small>dogovor u toku</small>' : 'Kanal<small>nešifrovan</small>');
        const enc = on => { for (const r of [r1, r2]) { r.material.color.setHex(on ? C.ok : C.dim); r.material.opacity = on ? .55 : .3; } setChan(on ? 'enc' : 'tcp'); };
        const giveKeys = lbl => { cli.text(`Pregledač<small>${lbl}</small>`); srv.text(`shop.rs<small>${lbl}</small>`); cli.flash(C.wait, .9); srv.flash(C.wait, .9); };
        const ms = () => x.p.rtt;
        const showMs = () => { if (n) sM.set(`${n} × ${ms()} = ${n * ms()} ms`); };
        x.on('knob', k => { if (k === 'rtt') showMs(); });
        const reset = () => { cli.text('Pregledač'); srv.text('shop.rs'); if (certL) x.remove(certL); certL = null; n = 0; sR.set(0); sM.set('–'); enc(V === 'rtt0'); if (V === 'rtt0') giveKeys('ključ iz prošle sesije'); };
        const flight = async ([d, lbl, tags]) => {
          const T = tags.split(' '), col = COLK[T[0]], to = d === '>' ? 1 : -1;
          const [a, b, z] = to > 0 ? [A, B, ZQ] : [B, A, ZS];
          if (T.includes('tls') && !T.includes('enc')) setChan('tls');
          if (T.includes('key') && to < 0) giveKeys('ključ sesije');
          const o = x.orb(col, { r: .22, label: lbl });
          let card = null;
          if (T.includes('cert')) { card = x.box({ at: [a, Y + .32, z], size: [.62, .05, .44], color: 0xf4f6fb }); card.o.userData.nofit = true; }
          const path = [[a, Y, z], [b, Y, z]];
          await Promise.all([x.move(o, path, SP), card ? x.move(card.o, path.map(p => [p[0], p[1] + .32, p[2]]), SP) : null]);
          x.remove(o);
          (to > 0 ? srv : cli).flash(col, .6);
          if (card) {
            x.remove(card.o);
            cli.flash(C.ok, .9);
            certL = x.label('sertifikat proveren: ime, potpis CA, rok', [cli.pos.x - .95, 0, 1.1], { cls: 'ok', center: [0, 0], nofit: true });
          }
          if (T.includes('enc')) enc(true);
          if (to < 0) { sR.set(++n); showMs(); }
        };
        x.spawn(async () => {
          while (x.alive) {
            reset();
            x.say(INTRO);
            await x.wait(1.2);
            for (const f of SCR) await flight(f);
            x.say(`Prvi bajt odgovora stigao je posle **${n} RTT**: sa RTT-om od ${ms()} ms to je **${n * ms()} ms** na svakoj novoj vezi. ${V === 'http' ? 'Brzo, ali bez ikakve zaštite.' : 'Postojeća veza se koristi ponovo, pa se ovo plaća samo jednom.'}`);
            await x.wait(4);
          }
        });
      },
    },
  },
];
