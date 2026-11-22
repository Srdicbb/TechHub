// sysviz.js — uvodna simulacija oblasti System design.
// Zahtevi idu kroz firewall, rate limiter i load balancer do instanci aplikacije, pa u keš ili bazu.
// Model je "fluidni": po instanci se vode red čekanja, CPU i memorija; kad red pojede memoriju, instanca pada (OOM).
// Čestice su uzorak saobraćaja: svaka bira ishod po trenutnim verovatnoćama modela.
import { C } from './viz.js';
import { lang } from './i18n.js';

export const RPS = [100, 500, 2000, 5000, 15000, 40000];
export const SIZES = {
  S: { vcpu: 2, ram: 4, mu: 2500, dim: [.78, .52, .78] },
  M: { vcpu: 4, ram: 8, mu: 5000, dim: [.92, .62, .92] },
  L: { vcpu: 8, ram: 16, mu: 10000, dim: [1.06, .74, 1.06] },
  XL: { vcpu: 16, ram: 32, mu: 18000, dim: [1.22, .88, 1.22] },
};
const PEAK = 1e6 / 9;     // nalet: 1 s rast, 8 s vrh, 1 s pad, ukupno 1 000 000
const BOT = .02;          // udeo zlonamernog saobraćaja koji firewall odbija
const TGT = .6;           // ciljni CPU autoskalera
const TIMEOUT = 3;        // s
const PER_REQ = .0005;    // GB po zahtevu u redu
const BOOT = 3, DOWN = 2, RESIZE = 2.5;
const MAXI = { mono: 12, micro: 5 };
const COL = { cpu: 0x3987e5, ram: 0x199e70, bot: 0xc3a6ff, fw: 0xb5583a, dead: 0x5c2230, boot: 0x8d97a8 };
const HB = 1.2;           // najveća visina stuba CPU/RAM
const sp = ' ';
export const nf = v => Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : sp);
const pc = v => Math.round(Math.max(0, v) * 100) + '%';
const sz = s => `${s} (${SIZES[s].vcpu}${sp}vCPU, ${SIZES[s].ram}${sp}GB)`;
const inst = n => lang === 'en' ? (n === 1 ? 'instance' : 'instances') : n % 10 === 1 && n % 100 !== 11 ? 'instanca' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'instance' : 'instanci';
const instL = n => lang !== 'en' && n % 10 === 1 && n % 100 !== 11 ? 'instanci' : inst(n);   // "na 1 instanci", "na 2 instance"

export const sysViz = {
  warm: 1.2,
  knobs: [
    { id: 'arch', label: 'Arhitektura', value: 'mono', options: [['mono', 'Monolit'], ['micro', 'Mikroservisi']] },
    { id: 'load', label: 'Opterećenje', value: 2, min: 0, max: 5, live: true, w: 11, fmt: v => nf(RPS[v]) + ' req/s' },
    { id: 'size', label: 'Instanca', value: 'M', live: true, options: [['S', 'S'], ['M', 'M'], ['L', 'L'], ['XL', 'XL']] },
    { id: 'auto', label: 'Autoskaliranje', value: false, toggle: true },
    { id: 'rl', label: 'Rate limiter', value: false, toggle: true },
    { id: 'cache', label: 'Keš', value: true, toggle: true },
  ],
  actions: [
    { id: 'burst', label: 'Pusti 1M zahteva', icon: 'zap' },
    { id: 'add', label: 'Instanca', aria: 'Dodaj instancu', icon: 'plus' },
    { id: 'rem', label: 'Instanca', aria: 'Ukloni instancu', icon: 'minus' },
  ],
  build(x) {
    const { THREE, p } = x;
    const micro = p.arch === 'micro';
    const go = id => x.ui.go?.(id);
    const V3 = (a = 0, b = 0, c = 0) => new THREE.Vector3(a, b, c);
    const narrow = (x.stage.el.parentElement?.clientWidth || 1000) < 600;
    const compact = (x.stage.w || x.stage.el.clientWidth || 1000) < 860;   // uska scena: kraće labele
    x.view({ dir: [.3, 1.42, 1], top: narrow ? 92 : 52, bottom: narrow ? 64 : 42 });

    // ---------- zajedničke geometrije i materijali ove scene ----------
    const UB = new THREE.BoxGeometry(1, 1, 1), UE = new THREE.EdgesGeometry(UB);
    const mEdge = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: .3 });
    const mGlass = new THREE.LineBasicMaterial({ color: 0xaab4c4, transparent: true, opacity: .2 });
    const glow = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: .45, roughness: .5 });
    const mCpu = glow(COL.cpu), mRam = glow(COL.ram);
    const mLink = { up: [C.sky, .32], boot: [C.dim, .16], drain: [C.dim, .16], down: [C.err, .5] };
    for (const k in mLink) mLink[k] = new THREE.LineBasicMaterial({ color: mLink[k][0], transparent: true, opacity: mLink[k][1] });
    const cW = new THREE.Color(C.box), cHot = new THREE.Color(C.wait), cErr = new THREE.Color(C.err), cDead = new THREE.Color(COL.dead), cBoot = new THREE.Color(COL.boot), tmp = new THREE.Color();

    // ---------- raspored ----------
    const X = { cl: -13, fw: -10.9, rl: -8.9, lb: -6.8, tier: micro ? -.3 : -.6, data: micro ? 7.1 : 6.6 };
    const TW = micro ? 9 : 7.6;     // širina ploče aplikacije
    const Y = .5, SPD = 9;
    const SV = micro ? [
      { name: 'Katalog', gen: 'kataloga', share: [.55, .7], hit: .9, z: -2.35, cap: 12000 },
      { name: 'Porudžbine', gen: 'porudžbina', share: [.3, .22], hit: .6, z: 0, cap: 12000 },
      { name: 'Plaćanja', gen: 'plaćanja', share: [.15, .08], hit: 0, z: 2.35, cap: 12000 },
    ] : [{ name: 'Monolit', share: [1, 1], hit: .8, z: 0, cap: 30000 }];

    x.plate({ at: [-8.85, 0, 0], w: 5.6, d: 4, label: 'Ulaz u sistem', lpos: 'front' });
    const plateL = (cx, cz, w, d, t) => x.label(t, [cx - w / 2 + .15, .02, cz - d / 2 + .1], { cls: 'plate', center: [0, 1] });
    let tierL = null;
    if (!micro) {
      x.clickable(x.plate({ at: [X.tier, 0, 0], w: TW, d: 6.4 }), () => go('sd-mono-micro'));
      tierL = plateL(X.tier, 0, TW, 6.4, 'Aplikacija · monolit');
    }
    x.plate({ at: [X.data, 0, micro ? -.3 : 0], w: micro ? 4 : 4.4, d: micro ? 7 : 5, label: 'Podaci' });

    // klijenti
    const cl = x.box({ at: [X.cl, 0, 0], size: [1.1, .7, 2], label: 'Klijenti', onClick: () => go('sd-capacity') });
    // firewall: zid od tri reda
    const fw = x.group();
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(UB, new THREE.MeshStandardMaterial({ color: COL.fw, roughness: .85 }));
      m.scale.set(.4, .38, 3); m.position.set(X.fw, .19 + i * .43, 0); m.castShadow = m.receiveShadow = true;
      m.add(new THREE.LineSegments(UE, mEdge));
      fw.add(m);
    }
    x.clickable(fw, () => go('sd-firewall'));
    const fwL = x.label('Firewall · WAF', [X.fw, 1.4, -1.5], { center: [.5, 1] });
    // rate limiter: kutija sa kofom tokena (token bucket)
    const rlB = x.box({ at: [X.rl, 0, 0], size: [.95, .56, 1.5], color: 0x5b6474, onClick: () => go('sd-rate') });
    const rl = rlB.o;
    const toks = [0, 1, 2].map(i => x.token({ at: [X.rl, .6 + i * .09, -.25 + i * .25] }));
    const rlL = x.label('Rate limiter', [X.rl, .82, 0], { center: [.5, 1] });
    // load balancer / API gateway
    const lb = x.box({ at: [X.lb, 0, 0], size: [1.1, .9, 1.7], label: micro ? 'API gateway' : 'Load balancer', side: 'below', onClick: () => go(micro ? 'sd-gateway' : 'sd-lb') });
    const LBP = V3(X.lb + .55, Y, 0);
    // podaci
    const cache = x.db({ at: micro ? [X.data - 1.2, 0, -1.2] : [X.data - 1, 0, 1.2], r: micro ? .48 : .55, h: .66, color: C.cache, label: 'Keš (Redis)', onClick: () => go('sd-cache') });
    let cacheOff = false;
    const dbBar = (node, h) => {
      const g = x.group();
      const b = new THREE.Mesh(UB, glow(C.sky)); b.castShadow = true;
      const gl = new THREE.LineSegments(UE, mGlass);
      gl.scale.set(.25, HB, .25);
      g.add(b, gl); g.position.copy(node.pos).setY(h);
      gl.position.y = HB / 2;
      const set = v => { v = Math.min(1, Math.max(0, v)); b.scale.set(.21, Math.max(.001, v * HB), .21); b.position.y = v * HB / 2; b.material.color.copy(tmp.copy(cW).lerp(cHot, Math.min(1, Math.max(0, (v - .6) / .25))).lerp(cErr, Math.max(0, (v - .85) / .15))); b.material.emissive.copy(b.material.color); };
      set(0);
      return set;
    };
    let sharedDb = null;
    if (!micro) sharedDb = x.db({ at: [X.data + .9, 0, -.8], r: .72, h: 1, label: 'Baza', side: 'right', onClick: () => go('sd-db') });
    const cDb = new THREE.Color(C.db);
    // autoskaler
    const asZ = micro ? 3.75 : 3.8;
    const as = x.box({ at: [X.tier, 0, asZ], size: [1.6, .34, .7], color: 0x7c8699, label: 'Autoskaler', side: 'right', onClick: () => go('sd-scaling') });

    // ---------- servisi (bazeni instanci) ----------
    const pools = SV.map(sv => {
      const P = { sv, insts: [], hit: p.cache ? sv.hit : 0, r: { arr: 0, rej: 0, ok: 0, fail: 0 }, pRej: 0, pDb: 0, dbU: 0, low: 0, p95: 20, tgt: p.size };
      if (micro) {
        x.clickable(x.plate({ at: [X.tier, 0, sv.z], w: TW, d: 1.6 }), () => go('sd-mono-micro'));
        P.lbl = x.label(sv.name, [X.tier - TW / 2 + .2, .02, sv.z], { cls: 'plate', center: [0, .5] });
        P.db = x.db({ at: [X.data + .5, 0, sv.z], r: .45, h: .7, label: 'Baza ' + sv.gen, side: 'right', onClick: () => go('sd-db') });
        P.dbH = .7;
      } else { P.db = sharedDb; P.lbl = tierL; P.dbH = 1; }
      P.dbSet = dbBar(P.db, P.dbH);
      return P;
    });
    const allInst = () => pools.flatMap(P => P.insts);

    // ---------- instance ----------
    const slot = (P, i, n) => {
      if (micro) return [X.tier - TW / 2 + 3 + i * 1.25, P.sv.z];
      const cols = Math.ceil(n / 3), c = Math.floor(i / 3), k = c < cols - 1 ? 3 : n - c * 3, r = i % 3;
      return [X.tier + (c - (cols - 1) / 2) * 1.6, (r - (k - 1) / 2) * 1.75];
    };
    const relayout = (P, snap) => P.insts.forEach((I, i) => {
      const [sx, sz2] = slot(P, i, P.insts.length);
      I.tgt.set(sx, 0, sz2);
      if (snap) I.g.position.copy(I.tgt);
    });
    const setDims = I => {
      const [w, h, d] = I.dim;
      I.box.scale.set(w, h, d); I.box.position.y = h / 2;
      I.bars.forEach(B => { B.x = B.dx * w; B.gl.scale.set(.25, HB, .25); B.gl.position.set(B.x, h + HB / 2, 0); B.base = h; });
    };
    function mkInst(P, size, boot) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: C.box, roughness: .6, metalness: .02, transparent: true });
      const box = new THREE.Mesh(UB, mat); box.castShadow = box.receiveShadow = true;
      box.add(new THREE.LineSegments(UE, mEdge));
      g.add(box);
      const bars = [mCpu, mRam].map((m, j) => {
        const b = new THREE.Mesh(UB, m); b.castShadow = true;
        const gl = new THREE.LineSegments(UE, mGlass);
        g.add(b, gl);
        return { b, gl, dx: j ? .2 : -.2 };
      });
      const lg = new THREE.BufferGeometry().setFromPoints([V3(), V3()]);
      const link = new THREE.Line(lg, mLink.boot); link.userData.nofit = true;
      x.scene.add(g, link);
      x.clickable(g, () => go('sd-mono-micro'));
      const I = { P, g, box, mat, bars, link, size, dim: [...SIZES[size].dim], state: boot ? 'boot' : 'up', tt: boot ? BOOT : 0, q: 0, cpu: 0, u: 0, mem: 0, memK: x.range(.85, 1.15), tgt: V3(), tag: null, remove: false, next: null, rs: false };
      setDims(I);
      I.mem = baseMem();
      P.insts.push(I);
      relayout(P, false);
      I.g.position.copy(I.tgt);
      if (boot) { I.g.scale.setScalar(.01); x.tween(.35, k => I.g.scale.setScalar(Math.max(.01, k)), x.ease.out); tag(I, 'start', 'wait'); }
      return I;
    }
    const baseMem = () => (micro ? .35 : .9);
    function regrow(I, size) {
      I.size = size;
      const d0 = [...I.dim], d1 = SIZES[size].dim;
      x.tween(.6, kk => { I.dim = d0.map((v, j) => v + (d1[j] - v) * kk); setDims(I); }, x.ease.out);
      tag(I, size, 'wait');
    }
    // vertikalno skaliranje: instance se restartuju na novoj veličini, jedna po jedna u svakom servisu
    function rolling() {
      for (const P of pools) {
        for (const I of P.insts) if ((I.state === 'down' || (I.state === 'boot' && !I.rs)) && I.size !== p.size) regrow(I, p.size);
        if (P.insts.some(I => I.rs)) continue;
        const I = P.insts.find(J => J.state === 'up' && J.size !== p.size && !J.remove);
        if (I) { I.state = 'drain'; I.tt = .5; I.next = p.size; I.rs = true; }
      }
    }
    function tag(I, text, cls, dur = 1.8) {
      if (I.tag) x.remove(I.tag);
      const l = I.tag = x.label(text, [0, I.dim[1] + HB + .3, 0], { parent: I.g, cls: cls + ' tag', nofit: true });
      x.wait(dur).then(() => { if (I.tag === l) { x.remove(l); I.tag = null; } });
    }
    function drop(I) {
      const P = I.P, k = P.insts.indexOf(I);
      if (k >= 0) P.insts.splice(k, 1);
      I.g.traverse(o => { if (o.isCSS2DObject) o.element.remove(); });
      I.g.parent?.remove(I.g); I.link.parent?.remove(I.link);
      const ci = x.clicks.indexOf(I.g); if (ci >= 0) x.clicks.splice(ci, 1);
      I.mat.dispose(); I.link.geometry.dispose();
      relayout(P, false);
    }
    pools.forEach(P => { const n = micro ? 1 : 2; for (let i = 0; i < n; i++) mkInst(P, p.size, false); relayout(P, true); });

    // ---------- stanje simulacije ----------
    const S = { off: 0, blk: 0, base: RPS[p.load], burst: null, tot: { ok: 0, fail: 0, rej: 0, blk: 0 }, p95: 20, down: false, crashT: -99, dbT: -99, autoT: 0, hist: [], sampleT: 0, uiT: 0 };
    const stOk = x.stat('ok', 'Uspešno', 0, { color: C.ok, fmt: nf });
    const stFail = x.stat('fail', 'Greške', 0, { color: C.err, fmt: nf });
    const stRej = x.stat('rej', 'Odbijeno 429', 0, { color: C.wait, fmt: nf });
    const stP95 = x.stat('p95', 'p95', 20, { fmt: v => v >= 3000 ? 'timeout' : v ? nf(v) + sp + 'ms' : '–' });
    const stCost = x.stat('cost', 'vCPU', 0, { minor: true, fmt: nf });
    const stBurst = x.stat('burst', 'Nalet', 0, { color: C.pink, fmt: v => nf(v) + ' / 1' + sp + '000' + sp + '000' });
    stBurst.el.hidden = true;
    x.legend([[C.sky, 'zahtev'], [C.wait, 'odbijen (429)'], [C.err, 'greška'], [COL.bot, 'bot'], [COL.cpu, 'CPU'], [COL.ram, 'RAM']]);

    // naracija: novija poruka važnija ili stara poruka istekla
    let sayP = 0, sayT = -99;
    const tell = (m, pr = 1) => { if (pr >= sayP - (x.t - sayT) / 2) { x.say(m); sayP = pr; sayT = x.t; } };

    // ---------- model ----------
    const burstRate = bt => bt < 0 ? 0 : bt < 1 ? PEAK * bt : bt < 9 ? PEAK : bt < 10 ? PEAK * (10 - bt) : 0;
    function crash(I) {
      I.state = 'down'; I.tt = DOWN; I.q = 0; I.cpu = 0; I.u = 0;
      x.flash(I.mat, C.err, .8);
      x.ripple([I.g.position.x, 0, I.g.position.z], C.err, .6);
      tag(I, 'OOM', 'err', 2.2);
      if (x.t - S.crashT > 5) {
        tell(micro
          ? `**${I.P.sv.name}: instanca je pala (OOM).** Zahtevi su stizali brže nego što ih obrađuje, red je pojeo memoriju. Ostali servisi rade dalje: kvar ostaje u jednom servisu.`
          : '**Instanca je pala (OOM).** Red čekanja je pojeo memoriju. Njen saobraćaj sada ide na ostale instance, koje se zato pune još brže: to je kaskadni pad.', 3.5);
      }
      S.crashT = x.t;
    }
    function step(dt) {
      const t = x.t;
      const bt = S.burst ? t - S.burst.t0 : -1, bR = S.burst ? burstRate(bt) : 0;
      const base = RPS[p.load] * (1 + .05 * Math.sin(t * .9) + .03 * Math.sin(t * 2.3 + 1));
      const off = base + bR, bf = off ? bR / off : 0;
      const pass = off * (1 - BOT);
      let okN = 0, failN = 0, rejN = 0;
      const k = 1 - Math.exp(-dt / .5);
      for (const P of pools) {
        const lam = pass * (P.sv.share[0] * (1 - bf) + P.sv.share[1] * bf);
        const up = P.insts.filter(I => I.state === 'up');
        const cap = up.reduce((s, I) => s + SIZES[I.size].mu, 0);
        let adm = lam, rej = 0, fail = 0, served = 0;
        if (p.rl) { const lim = cap * .9; if (adm > lim) { rej = adm - lim; adm = lim; } }
        if (!cap) { fail += adm * dt; adm = 0; }
        for (const I of P.insts) {
          const Z = SIZES[I.size], live = I.state === 'up' || I.state === 'drain';
          if (I.state === 'up' && cap) I.q += adm * Z.mu / cap * dt;
          const c = live ? Z.mu * dt : 0, s = Math.min(I.q, c);
          I.q -= s; served += s;
          I.u = c ? s / c : 0;
          I.cpu += (I.u - I.cpu) * Math.min(1, dt * 3);
          if (I.q > Z.mu * TIMEOUT) { fail += I.q - Z.mu * TIMEOUT; I.q = Z.mu * TIMEOUT; }
          I.mem = baseMem() + .2 * Z.ram * I.cpu + I.q * PER_REQ * I.memK;
          if (I.state === 'up' && I.mem > Z.ram) { fail += I.q; crash(I); }
          else if (I.state === 'down') { I.tt -= dt; I.mem = 0; if (I.tt <= 0) { I.state = 'boot'; I.tt = BOOT; tag(I, 'restart', 'wait'); } }
          else if (I.state === 'boot') { I.tt -= dt; I.mem = baseMem(); if (I.tt <= 0) { I.state = 'up'; I.q = 0; I.rs = false; } }
          else if (I.state === 'drain') {
            I.tt -= dt;
            if (I.tt <= 0) {
              fail += I.q; I.q = 0;
              if (I.remove) { const J = I; x.tween(.3, kk => J.g.scale.setScalar(Math.max(.01, 1 - kk))).then(() => drop(J)); I.state = 'gone'; }
              else { I.state = 'boot'; I.tt = RESIZE; regrow(I, I.next); }
            }
          }
        }
        // keš i baza
        const want = p.cache ? P.sv.hit : 0;
        P.hit = want > P.hit ? Math.min(want, P.hit + dt * .22) : want;
        const dbq = served / dt * (1 - P.hit), dcap = P.sv.cap;
        const dbFrac = dbq > dcap ? 1 - dcap / dbq : 0;
        const dbf = served * (1 - P.hit) * dbFrac;
        fail += dbf;
        const ok = served - dbf;
        P.dbU += (dbq / dcap - P.dbU) * Math.min(1, dt * 3);
        P.pDb += (dbFrac - P.pDb) * k;
        P.r.arr += (lam - P.r.arr) * k; P.r.rej += (rej - P.r.rej) * k;
        P.r.ok += (ok / dt - P.r.ok) * k; P.r.fail += (fail / dt - P.r.fail) * k;
        P.pRej = P.r.arr > 0 ? Math.min(1, P.r.rej / P.r.arr) : 0;
        P.cap = cap;
        // p95: čekanje u redu + M/M/1 rast kašnjenja + baza
        const rho = up.length ? up.reduce((s, I) => s + I.cpu, 0) / up.length : 0;
        const qw = up.reduce((m, I) => Math.max(m, I.q / SIZES[I.size].mu), 0);
        const dr = Math.min(P.dbU, .97);
        const lat = up.length ? 20 + (micro ? 8 : 0) + 7 * rho / (1 - Math.min(rho, .96)) + qw * 1000 + (dr > .5 ? 4 * dr / (1 - dr) : 0) : 3000;
        P.p95 = Math.min(3000, lat);
        okN += ok; failN += fail; rejN += rej * dt;
      }
      const blkN = off * BOT * dt;
      S.tot.ok += okN; S.tot.fail += failN; S.tot.rej += rejN; S.tot.blk += blkN;
      S.off = off; S.blk = off * BOT; S.okR = (S.okR || 0) + (okN / dt - (S.okR || 0)) * k;
      if (S.burst) {
        const B = S.burst;
        B.sent = Math.min(1e6, B.sent + bR * dt);
        B.ok += okN * bf; B.fail += failN * bf; B.rej += rejN * bf; B.blk += blkN * bf;
        if (bt > 11) endBurst();
      }
      S.p95 += (Math.max(...pools.map(P => P.p95)) - S.p95) * Math.min(1, dt * 2);
    }

    // ---------- autoskaler (HPA): željeno = ceil(n × CPU / cilj) ----------
    function autoscale() {
      if (!p.auto) return;
      for (const P of pools) {
        const live = P.insts.filter(I => I.state !== 'gone' && !I.remove);
        const meas = live.filter(I => I.state === 'up' || I.state === 'down');
        if (!meas.length) continue;
        const u = meas.reduce((s, I) => s + (I.state === 'down' ? 1 : I.cpu), 0) / meas.length;
        const want = Math.max(1, Math.min(MAXI[p.arch], Math.ceil(meas.length * u / TGT)));
        const n = live.length;
        if (u > TGT * 1.1 && want > n) {
          for (let i = n; i < want; i++) mkInst(P, p.size, true);
          relayout(P, false);
          P.low = 0;
          as.flash(C.ok, .7);
          as.text(`Autoskaler<small>CPU ${pc(u)}: ${n} → ${want}</small>`); S.asT = x.t;
          tell(`**Autoskaler**: prosečan CPU${micro ? ' servisa ' + P.sv.name : ''} je ${pc(u)}, a cilj je 60%. Traži ceil(${meas.length} × ${pc(u)} / 60%) = ${want} ${inst(want)}. Nove instance se podižu par sekundi pre nego što prime saobraćaj.`, 2.5);
        } else if (u < TGT * .5 && want < n) {
          if (++P.low >= 3) {
            P.low = 0;
            const I = [...live].reverse().find(J => J.state !== 'down') || live[live.length - 1];
            if (I) { I.state = 'drain'; I.tt = .6; I.remove = true; as.text(`Autoskaler<small>CPU ${pc(u)}: ${n} → ${n - 1}</small>`); S.asT = x.t; }
          }
        } else P.low = 0;
      }
    }

    // ---------- nalet od 1M ----------
    function startBurst() {
      if (S.burst) { tell('Nalet je već u toku.', 5); return; }
      S.burst = { t0: x.t, sent: 0, ok: 0, fail: 0, rej: 0, blk: 0 };
      cl.flash(C.mag, 1.2);
      stBurst.set(0); stBurst.el.hidden = false;
      const cap = pools.reduce((s, P) => s + P.insts.filter(I => I.state === 'up').reduce((a, I) => a + SIZES[I.size].mu, 0), 0);
      tell(`Stiže **1 000 000 zahteva** za 10 sekundi, na vrhu oko ${nf(PEAK)} req/s. Trenutni kapacitet je ${nf(cap)} req/s${p.rl ? ', a rate limiter će višak odbiti sa 429.' : cap < PEAK ? ': bez rate limitera red raste dok instance ne padnu.' : '.'}`, 5);
    }
    function endBurst() {
      const B = S.burst; S.burst = null;
      stBurst.el.hidden = true;
      const tot = B.ok + B.fail + B.rej + B.blk || 1, f = 1e6 / tot;
      const ok = B.ok * f, fail = B.fail * f, rej = B.rej * f, blk = B.blk * f;
      const tip = fail > 5e4 ? (p.rl ? ' Za više uspešnih dodaj instance pre naleta: autoskaler je presporo za skok od par sekundi.' : ' Probaj sa rate limiterom, ili unapred skaliraj: XL i 8 instanci imaju kapacitet od 144 000 req/s.')
        : rej > 5e4 ? ` Sistem je preživeo jer je limiter odbio višak.${p.auto ? ' Autoskaler je dodavao instance, ali nova instanca treba par sekundi, a nalet traje deset.' : ''} Da bi i ti zahtevi prošli, kapacitet treba podići unapred.` : ' Sistem je izdržao ceo nalet.';
      tell(`**Nalet je završen.** Od 1 000 000 zahteva: ${nf(ok)} uspešno, ${nf(rej)} odbijeno (429), ${nf(fail)} grešaka, a ${nf(blk)} je zaustavio firewall.${tip}`, 4.5);
    }

    // ---------- objašnjenja na promenu kontrola ----------
    function capNow(P) { return P.insts.filter(I => !I.remove && I.state !== 'gone').reduce((s, I) => s + SIZES[I.state === 'drain' ? I.next || I.size : I.size].mu, 0); }
    function explainLoad() {
      const rps = RPS[p.load], hot = pools.map(P => ({ P, lam: rps * (1 - BOT) * P.sv.share[0], cap: capNow(P) })).sort((a, b) => b.lam / (b.cap || 1) - a.lam / (a.cap || 1))[0];
      const n = hot.P.insts.filter(I => !I.remove).length, rho = hot.lam / (hot.cap || 1);
      const who = micro ? `Najopterećeniji je ${hot.P.sv.name} (${nf(hot.lam)} req/s na ${n} ${instL(n)}): ` : `${nf(rps)} req/s na ${n} ${instL(n)} ${p.size}: `;
      if (rho < .5) tell(`${who}CPU je oko ${pc(rho)} i memorija skoro miruje. Zahtevi se obrađuju odmah, red čekanja je prazan.`, 5);
      else if (rho < .75) tell(`${who}CPU je oko ${pc(rho)}. Ima rezerve, kašnjenje je i dalje nisko.`, 5);
      else if (rho < 1) tell(`${who}CPU je oko ${pc(rho)}. Sistem radi, ali p95 raste jer zahtevi sve češće čekaju u redu.${p.auto ? ' Autoskaler će dodati instance.' : ''}`, 5);
      else if (p.rl) tell(`${who}kapacitet je oko ${nf(hot.cap)} req/s, pa rate limiter propušta ${nf(hot.cap * .9)} i višak odbija sa **429**. Instance ostaju žive.`, 5);
      else tell(`${who}kapacitet je oko ${nf(hot.cap)} req/s. Višak od ${nf(hot.lam - hot.cap)} req/s ide u red, red troši memoriju i instance će za par sekundi pasti (**OOM**). Dodaj instance, uzmi veću instancu ili uključi rate limiter.`, 5);
    }
    function resize() {
      const one = pools.some(P => P.insts.filter(I => !I.remove).length === 1);
      tell(`**Vertikalno skaliranje** na ${sz(p.size)}: svaka instanca se restartuje na većoj ili manjoj mašini, jedna po jedna. Kapacitet instance je sada ${nf(SIZES[p.size].mu)} req/s.${one ? ' Gde je samo jedna instanca, restart znači kratak prekid rada.' : ''}`, 5);
    }
    x.on('knob', key => {
      if (key === 'load') explainLoad();
      else if (key === 'size') resize();
      else if (key === 'auto') { tell(p.auto ? '**Autoskaler** na svake 2 s meri prosečan CPU i traži ceil(n × CPU / 60%) instanci. Smanjuje tek kad je CPU nizak više provera zaredom.' : 'Autoskaler je isključen: broj instanci menjaš ručno dugmićima **+** i **−**.', 5); as.text(p.auto ? 'Autoskaler<small>cilj CPU 60%</small>' : 'Autoskaler<small>isključen</small>'); }
      else if (key === 'rl') tell(p.rl ? '**Rate limiter** uključen. Ovde prati kapacitet zdravih instanci i propušta do 90% njega; višak odmah dobija **429**, umesto da napravi red koji obara instance.' : 'Rate limiter isključen: sve što prođe firewall ide do instanci, pa preopterećenje pravi red i obara ih.', 5);
      else if (key === 'cache') tell(p.cache ? '**Keš** uključen, ali je hladan: pogoci rastu postepeno dok se ne napuni, pa baza još par sekundi vidi pun pritisak.' : 'Keš isključen: svaki obrađen zahtev sada ide u bazu. Gledaj stub iznad baze.', 5);
    });
    x.on('burst', startBurst);
    x.on('add', () => {
      const P = pools.slice().sort((a, b) => avgCpu(b) - avgCpu(a))[0];
      const live = P.insts.filter(I => !I.remove && I.state !== 'gone');
      if (live.length >= MAXI[p.arch]) { tell(`Najviše ${MAXI[p.arch]} instanci${micro ? ' po servisu' : ''} u ovoj sceni. Za više kapaciteta uzmi veću instancu.`, 5); return; }
      mkInst(P, p.size, true);
      tell(`**Horizontalno skaliranje**: još jedna instanca ${p.size}${micro ? ' servisa ' + P.sv.name : ''} iza load balancera. Podiže se oko 3 s, pa tek onda prima saobraćaj.${p.auto ? ' Autoskaler je uključen i može kasnije da promeni broj instanci.' : ''}`, 5);
    });
    x.on('rem', () => {
      const P = pools.slice().sort((a, b) => avgCpu(a) - avgCpu(b))[0];
      const live = P.insts.filter(I => !I.remove && I.state !== 'gone');
      if (live.length <= 1) { tell('Mora da ostane bar jedna instanca.', 5); return; }
      const I = [...live].reverse().find(J => J.state === 'boot') || live[live.length - 1];
      I.state = 'drain'; I.tt = .6; I.remove = true;
      tell(`Instanca${micro ? ' servisa ' + P.sv.name : ''} se gasi: load balancer joj više ne šalje zahteve, a ona završi one koje već ima (draining).`, 5);
    });
    const avgCpu = P => { const u = P.insts.filter(I => I.state === 'up'); return u.length ? u.reduce((s, I) => s + I.cpu, 0) / u.length : 1; };
    x.on('focus', key => {
      const at = { clients: cl.pos, fw: V3(X.fw, 0, 0), rl: V3(X.rl, 0, 0), lb: lb.pos, tier: V3(X.tier, 0, 0), auto: as.pos, cache: cache.pos, db: (sharedDb || pools[0].db).pos }[key];
      const lab = { clients: cl.lbl, fw: fwL, rl: rlL, lb: lb.lbl, tier: tierL || pools[0].lbl, auto: as.lbl, cache: cache.lbl, db: (sharedDb || pools[0].db).lbl }[key];
      if (!at) return;
      for (let i = 0; i < 3; i++) x.wait(i * .45).then(() => x.ripple([at.x, 0, at.z], C.mag, key === 'tier' ? 2.6 : 1.3));
      if (lab) { lab.el.classList.add('lbl-mag', 'lbl-focus'); x.wait(2.6).then(() => lab.el.classList.remove('lbl-mag', 'lbl-focus')); }
    });

    // ---------- vrednosti u labelama, statistika, grafikon ----------
    const chart = x.ui.chart ? mkChart(x.ui.chart()) : null;
    const clT = v => `Klijenti<small>${nf(v)}${compact ? '/s' : ' req/s'}</small>`;
    const dbT = (P, v) => `${micro ? 'Baza ' + P.sv.gen : 'Baza'}<small>${nf(v)} / ${nf(P.sv.cap)}${compact ? '' : ' upita/s'}</small>`;
    function ui() {
      const all = allInst().filter(I => I.state !== 'gone');
      cl.text(clT(S.off));
      if (S.burst) stBurst.set(S.burst.sent);
      fwL.set(compact ? 'Firewall · WAF' : `Firewall · WAF<small>blokira ${nf(S.blk)}/s</small>`);
      const lim = pools.reduce((s, P) => s + P.cap * .9, 0), rej = pools.reduce((s, P) => s + P.r.rej, 0);
      rlL.set(p.rl ? `Rate limiter<small>limit ${nf(lim)}/s</small>${rej > 1 ? `<small>429: ${nf(rej)}/s</small>` : ''}` : 'Rate limiter<small>isključen</small>');
      const upN = all.filter(I => I.state === 'up').length;
      lb.text(`${micro ? 'API gateway' : 'Load balancer'}<small>${micro && !compact ? '3 servisa · ' : ''}${upN} od ${all.length} zdravo</small>`);
      for (const P of pools) {
        const L = P.insts.filter(I => I.state !== 'gone'), up = L.filter(I => I.state === 'up');
        const cpu = up.length ? up.reduce((s, I) => s + I.cpu, 0) / up.length : 0;
        const ram = up.length ? up.reduce((s, I) => s + I.mem / SIZES[I.size].ram, 0) / up.length : 0;
        P.cpuAvg = cpu; P.ramAvg = ram;
        const st = up.length ? `CPU ${pc(cpu)} · RAM ${pc(ram)}` : 'ne radi';
        P.lbl.set(micro ? `${P.sv.name}<small>${L.length} × ${p.size}</small>` : `Aplikacija · monolit<small>${L.length} × ${compact ? p.size : sz(p.size)} · ${st}</small>`);
        P.db.text(dbT(P, P.dbU * P.sv.cap));
        P.db.o.material.color.copy(tmp.copy(cDb).lerp(cErr, Math.min(1, Math.max(0, (P.dbU - .85) / .15))));
      }
      const hit = pools.reduce((s, P) => s + P.hit * P.sv.share[0], 0);
      cache.text(p.cache ? `Keš (Redis)<small>pogoci ${pc(hit)}</small>` : 'Keš (Redis)<small>isključen</small>');
      if (!S.asT || x.t - S.asT > 2.5) as.text(p.auto ? 'Autoskaler<small>cilj CPU 60%</small>' : 'Autoskaler<small>isključen</small>');
      stOk.set(S.tot.ok); stFail.set(S.tot.fail); stRej.set(S.tot.rej);
      stP95.set(upN ? Math.round(S.p95) : 0);
      stCost.set(all.reduce((s, I) => s + SIZES[I.size].vcpu, 0));
      // događaji za naraciju
      const dead = pools.filter(P => !P.insts.some(I => I.state === 'up'));
      if (dead.length && !S.down) { S.down = true; tell(dead.length === pools.length ? `**Sistem je pao**: nema zdravih instanci, pa ${micro ? 'gateway' : 'load balancer'} svima vraća grešku 503. Instance se restartuju, ali ako opterećenje ostane isto, padaju ponovo. Uključi rate limiter ili skaliraj.` : `**${dead.map(P => P.sv.name).join(' i ')} ne radi**, ali ostali servisi i dalje obrađuju svoje zahteve. To je izolacija kvara u mikroservisima.`, 3.5); }
      if (!dead.length && S.down && x.t - S.crashT > 4) { S.down = false; tell('Sistem se oporavio: sve instance su zdrave i prihvataju zahteve.', 2); }
      const dbHot = pools.find(P => P.dbU > 1);
      if (dbHot && x.t - S.dbT > 8) { S.dbT = x.t; tell(`**Baza${micro ? ' ' + dbHot.sv.gen : ''} je usko grlo**: stiže ${nf(dbHot.dbU * dbHot.sv.cap)} upita/s, a podnosi ${nf(dbHot.sv.cap)}. Višak upita ističe i vraća grešku.${p.cache ? '' : ' Uključi keš: svaki pogodak je jedan upit manje.'}`, 3); }
    }
    function sample() {
      const up = allInst().filter(I => I.state === 'up');
      const cpu = up.length ? up.reduce((s, I) => s + I.cpu, 0) / up.length : null;
      const ram = up.length ? up.reduce((s, I) => s + I.mem / SIZES[I.size].ram, 0) / up.length : null;
      S.hist.push({ t: x.t, off: S.off, ok: Math.max(0, S.okR), cpu, ram });
      while (S.hist.length && S.hist[0].t < x.t - 61) S.hist.shift();
      chart?.draw(S.hist, x.t, p.auto);
    }

    // ---------- čestice ----------
    let acc = 0, alive = 0;
    const orb = (c, at) => x.orb(c, { r: .12, at });
    const swap = (o, c) => { const n = orb(c, o.position.clone()); x.remove(o); return n; };
    const end = async (o, c, at, r = .45) => { if (c != null) { o = swap(o, c); x.ripple(at || o.position, c, r); } await x.fadeOut(o, .3); };
    function pickPool() {
      let r = x.rnd() * pools.reduce((s, P) => s + P.r.arr, 0);
      for (const P of pools) { r -= P.r.arr; if (r <= 0) return P; }
      return pools[0];
    }
    function pickInst(P) {
      const up = P.insts.filter(I => I.state === 'up');
      if (!up.length) return null;
      let r = x.rnd() * up.reduce((s, I) => s + SIZES[I.size].mu, 0);
      for (const I of up) { r -= SIZES[I.size].mu; if (r <= 0) return I; }
      return up[0];
    }
    function particle() {
      const bot = x.rnd() < BOT * 2;
      const z0 = x.range(-.8, .8), v = SPD * x.range(.9, 1.1);
      let o = orb(bot ? COL.bot : C.sky, V3(X.cl + .6, Y, z0));
      alive++;
      x.spawn(async () => {
        try {
          await x.move(o, [[X.cl + .6, Y, z0], [X.fw - .3, Y, z0]], v);
          if (bot) { await end(o, null); x.ripple([X.fw - .3, 0, z0], COL.bot, .4); return; }
          await x.move(o, [[X.fw - .3, Y, z0], [X.fw + .3, Y, z0], [X.rl, Y + .1, z0 * .55]], v);
          const P = pickPool();
          if (p.rl && x.rnd() < P.pRej) {
            o = swap(o, C.wait);
            await x.move(o, [o.position.clone(), [X.rl - 1.1, Y + .5, z0 * .7]], v * .5);
            await end(o, null); return;
          }
          await x.move(o, [[X.rl, Y + .1, z0 * .55], [X.lb - .55, Y, z0 * .3], [X.lb, Y, 0], [LBP.x, Y, 0]], v);
          const I = pickInst(P);
          if (!I) { await end(o, C.err, [X.lb, 0, 0], .5); return; }
          const ip = I.g.position, w = I.dim[0];
          const entry = [ip.x - w / 2 - .14, Y, ip.z];
          await x.move(o, [[LBP.x, Y, 0], entry], v);
          const wq = Math.min(1.5, I.q / SIZES[I.size].mu);
          if (wq > .05) {
            await x.move(o, [entry, [entry[0] - x.range(.1, .45), Y + x.range(-.1, .35), ip.z + x.range(-.3, .3)]], 4);
            await x.wait(wq);
          }
          if (I.state === 'down' || I.state === 'boot') { await end(o, C.err, ip, .5); return; }
          const hit = x.rnd() < P.hit, tg = hit ? cache : P.db, top = tg.pos.y + (hit ? .4 : P.dbH / 2) + .05;
          await x.move(o, [o.position.clone(), [ip.x, I.dim[1] + .25, ip.z], [tg.pos.x, top + .4, tg.pos.z]], v);
          if (!hit && x.rnd() < P.pDb) { await end(o, C.err, tg.pos, .6); return; }
          tg.flash(C.ok, .25);
          await x.fadeOut(o, .2);
        } finally { alive--; }
      });
    }

    // ---------- petlja ----------
    x.tick(dt => {
      // model u malim koracima
      let rem = dt;
      while (rem > 1e-6) { const h = Math.min(rem, 1 / 30); step(h); rem -= h; }
      S.autoT += dt; if (S.autoT >= 2) { S.autoT = 0; autoscale(); }
      rolling();
      // vizuelno stanje instanci
      const t = x.t;
      for (const I of allInst()) {
        I.g.position.lerp(I.tgt, Math.min(1, dt * 5));
        const Z = SIZES[I.size], m = I.mat;
        if (I.state === 'down') { m.color.copy(cDead); m.opacity = .6; m.emissive.setHex(0); }
        else if (I.state === 'boot' || I.state === 'drain' || I.state === 'gone') { m.color.copy(cBoot); m.opacity = .38 + .18 * Math.sin(t * 6); m.emissive.setHex(0); }
        else {
          const pr = Math.max((I.cpu - .72) / .28, (I.mem / Z.ram - .5) / .45, 0);
          m.color.copy(cW).lerp(cHot, Math.min(1, pr * 2));
          if (pr > .5) m.color.lerp(cErr, Math.min(1, (pr - .5) * 2));
          m.opacity = 1;
          const qk = Math.min(1, I.q / (Z.mu * .6));
          if (qk > .02) m.emissive.copy(cErr).multiplyScalar(qk * (.22 + .18 * Math.sin(t * 9))); else m.emissive.setHex(0);
        }
        const live = I.state === 'up' || I.state === 'drain';
        const vals = [live ? I.cpu : 0, I.state === 'down' ? 0 : Math.min(1, I.mem / Z.ram)];
        I.bars.forEach((B, j) => { const v = vals[j]; B.b.scale.set(.21, Math.max(.001, v * HB), .21); B.b.position.set(B.x, B.base + v * HB / 2, 0); });
        const pos = I.link.geometry.attributes.position;
        pos.setXYZ(0, LBP.x, Y, 0); pos.setXYZ(1, I.g.position.x - I.dim[0] / 2, I.dim[1] / 2, I.g.position.z); pos.needsUpdate = true;
        I.link.material = mLink[I.state] || mLink.boot;
        I.link.visible = I.state !== 'gone';
      }
      for (const P of pools) P.dbSet(P.dbU);
      // rate limiter: kapija i tokeni
      rl.material.color.setHex(p.rl ? C.wait : 0x5b6474);
      toks.forEach(tk => { tk.visible = p.rl; tk.rotation.y += dt * 2; });
      as.o.material.color.setHex(p.auto ? C.box : 0x7c8699);
      if (cacheOff !== !p.cache) { cacheOff = !p.cache; cache.dim(cacheOff); }
      // čestice: gustina raste sa log(req/s)
      acc += dt * Math.min(22, 2.5 + 5 * Math.log10(Math.max(100, S.off) / 100));
      while (acc >= 1) { acc -= 1; if (alive < 90) particle(); }
      S.uiT += dt; if (S.uiT >= .25) { S.uiT = 0; ui(); }
      S.sampleT += dt; if (S.sampleT >= .25) { S.sampleT = 0; sample(); }
    });

    ui();
    // kadar se računa posle build-a: labele sa brojevima dobijaju najširi tekst, da ne izađu iz kadra kad brojevi porastu
    cl.text(clT(188888)); pools.forEach(P => P.db.text(dbT(P, P.sv.cap * 1.8)));
    as.text(p.auto ? 'Autoskaler<small>cilj CPU 60%</small>' : 'Autoskaler<small>isključen</small>');
    x.say(micro
      ? 'Tri servisa iza **API gateway-a**, svaki sa svojom bazom. Katalog dobija najviše saobraćaja, pa se on prvi zagreje kad opterećenje poraste. Klik na komponentu vodi na njen opis ispod.'
      : `Monolit sa **2 instance ${p.size}** iza load balancera. Stubići iznad instanci su CPU i RAM. Pomeri **Opterećenje** ili pusti **1M zahteva** i gledaj kako se pune; kad sistem počne da pada, skaliraj ga. Klik na komponentu vodi na njen opis ispod.`);
  },
};

// ---------- mini dashboard ispod scene ----------
function mkChart(el) {
  const W = 300, H = 100, LO = 1, HI = Math.log10(3e5);
  const ly = v => H - (Math.log10(Math.max(10, v)) - LO) / (HI - LO) * H;
  const py = v => H - Math.min(1.04, Math.max(0, v)) * H * .92;
  const ticks = [[100, '100'], [1e3, '1k'], [1e4, '10k'], [1e5, '100k']];
  el.innerHTML = `
    <div class="ch">
      <p class="ch-h"><b>Zahtevi u sekundi</b><span class="key"><i class="sw area"></i>poslato</span><span class="key"><i class="sw ln ok"></i>uspešno</span><span class="key"><i class="sw lost"></i>izgubljeno</span></p>
      <div class="ch-p" data-p="0"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Poslati i uspešni zahtevi u sekundi, poslednjih 60 sekundi, logaritamska skala">
        ${ticks.map(([v]) => `<line class="gl" x1="0" x2="${W}" y1="${ly(v)}" y2="${ly(v)}"/>`).join('')}
        <path class="area"/><path class="lost"/><path class="ln ok"/></svg>
        ${ticks.map(([v, t]) => `<span class="ax" style="top:${ly(v)}%">${t}</span>`).join('')}
        <span class="vl" data-v="ok"></span><i class="cx"></i><span class="tip"></span>
      </div>
    </div>
    <div class="ch">
      <p class="ch-h"><b>Prosek po instanci</b><span class="key"><i class="sw ln cpu"></i>CPU</span><span class="key"><i class="sw ln ram"></i>RAM</span></p>
      <div class="ch-p" data-p="1"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Prosečan CPU i RAM instanci, poslednjih 60 sekundi">
        ${[0, .5, 1].map(v => `<line class="gl" x1="0" x2="${W}" y1="${py(v)}" y2="${py(v)}"/>`).join('')}
        <line class="tg" x1="0" x2="${W}" y1="${py(TGT)}" y2="${py(TGT)}"/>
        <path class="ln cpu"/><path class="ln ram"/></svg>
        ${[[0, '0'], [.5, '50%'], [1, '100%']].map(([v, t]) => `<span class="ax" style="top:${py(v)}%">${t}</span>`).join('')}
        <span class="ax tgtl" style="top:${py(TGT)}%">cilj</span>
        <span class="vl" data-v="cpu"></span><span class="vl" data-v="ram"></span><i class="cx"></i><span class="tip"></span>
      </div>
    </div>`;
  const q = s => el.querySelector(s);
  const P = { area: q('path.area'), lost: q('path.lost'), ok: q('path.ok'), cpu: q('path.cpu'), ram: q('path.ram'), tg: q('line.tg'), tgl: q('.ax.tgtl') };
  const V = { ok: q('[data-v=ok]'), cpu: q('[data-v=cpu]'), ram: q('[data-v=ram]') };
  let last = null, now = 0;
  const xs = t => W - (now - t) / 60 * W;
  // linija sa prekidima: tačka bez vrednosti (null) prekida putanju
  const line = (h, f) => { let d = '', pen = false; for (const s of h) { const v = f(s); if (v == null || isNaN(v)) { pen = false; continue; } d += `${pen ? 'L' : 'M'}${xs(s.t).toFixed(1)},${v.toFixed(1)}`; pen = true; } return d; };
  function draw(h, t, auto) {
    last = h; now = t;
    if (h.length < 2) return;
    const off = line(h, s => ly(s.off)), x0 = xs(h[0].t).toFixed(1), x1 = xs(h[h.length - 1].t).toFixed(1);
    P.area.setAttribute('d', `${off}L${x1},${H}L${x0},${H}Z`);
    P.lost.setAttribute('d', off + [...h].reverse().map(s => `L${xs(s.t).toFixed(1)},${ly(s.ok).toFixed(1)}`).join('') + 'Z');
    P.ok.setAttribute('d', line(h, s => ly(s.ok)));
    P.cpu.setAttribute('d', line(h, s => s.cpu == null ? null : py(s.cpu)));
    P.ram.setAttribute('d', line(h, s => s.ram == null ? null : py(s.ram)));
    P.tg.style.display = P.tgl.style.display = auto ? '' : 'none';
    const s = h[h.length - 1];
    V.ok.textContent = nf(s.ok) + '/s'; V.ok.style.top = ly(s.ok) + '%'; V.ok.classList.toggle('dn', ly(s.ok) < 26);
    const dead = s.cpu == null;
    let yc = py(s.cpu || 0), yr = py(s.ram || 0);
    if (Math.abs(yc - yr) < 16) { const m = (yc + yr) / 2, up = yc <= yr ? -8 : 8; yc = m + up; yr = m - up; }
    V.cpu.textContent = dead ? 'nema zdravih instanci' : 'CPU ' + pc(s.cpu); V.cpu.style.top = (dead ? py(.5) : yc) + '%';
    V.ram.textContent = 'RAM ' + pc(s.ram); V.ram.style.top = yr + '%'; V.ram.hidden = dead;
    // labela pri vrhu ide ispod linije, da ne prekrije naslov panela
    V.cpu.classList.toggle('dn', !dead && yc < 26 && yc <= yr); V.ram.classList.toggle('dn', !dead && yr < 26 && yr < yc);
  }
  // hover: krstić i tooltip za tačku ispod pokazivača, u oba panela
  const plots = [...el.querySelectorAll('.ch-p')];
  const hide = () => plots.forEach(pl => { pl.classList.remove('hov'); });
  plots.forEach(pl => {
    pl.addEventListener('pointermove', e => {
      if (!last || last.length < 2) return;
      const r = pl.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width;
      const tt = now - (1 - fx) * 60;
      let best = last[0];
      for (const s of last) if (Math.abs(s.t - tt) < Math.abs(best.t - tt)) best = s;
      const bx = xs(best.t) / W * 100;
      const ago = Math.round(now - best.t);
      plots.forEach(o => {
        o.classList.add('hov');
        o.querySelector('.cx').style.left = bx + '%';
        const tip = o.querySelector('.tip');
        tip.innerHTML = o.dataset.p === '0'
          ? `<b>${ago ? 'pre ' + ago + ' s' : 'sada'}</b>poslato ${nf(best.off)}/s<br>uspešno ${nf(best.ok)}/s`
          : `<b>${ago ? 'pre ' + ago + ' s' : 'sada'}</b>${best.cpu == null ? 'nema zdravih instanci' : `CPU ${pc(best.cpu)}<br>RAM ${pc(best.ram)}`}`;
        tip.style.left = bx + '%';
        tip.classList.toggle('lft', bx > 60);
      });
    });
    pl.addEventListener('pointerleave', hide);
  });
  return { draw };
}
