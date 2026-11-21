// viz.js — mali "viz-kit": scena, vizuelni jezik (primitive), animacija, kontrole.
// Svaka tema daje viz = { kind: '3d' | 'svg', knobs, actions, warm, build(x) }.
import { THREE, OrbitControls, CSS2DRenderer, CSS2DObject } from './lib.js';

// ---------- vizuelni jezik: boje ----------
export const C = {
  ground: 0x161a21, grid: 0x2a303b, plate: 0x222833, edge: 0x5a6880,
  box: 0xe8ebf0, ink: 0x161a21, white: 0xf4f6fb,
  sky: 0x5aa9ff, db: 0x5aa9ff, cache: 0x5fe0bd, glass: 0xcfe0ff,
  mag: 0xe0115f, pink: 0xff5d8f,
  ok: 0x3ddc97, wait: 0xffd166, err: 0xff4d6d, token: 0xffd166, dim: 0x7c8699,
  cat: [0xff5d8f, 0xffd166, 0x5ec8ff, 0x7ee0b5, 0xc3a6ff, 0xff9f68, 0xf4f6fb],
};
export const hex = c => '#' + (c >>> 0).toString(16).padStart(6, '0');
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const toV = p => (p && p.isVector3) ? p.clone() : Array.isArray(p) ? V(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0) : V();
export const ease = {
  io: k => (k < .5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2),
  out: k => 1 - ((1 - k) ** 3),
  lin: k => k,
};
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const NS = 'http://www.w3.org/2000/svg';
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const NOUI = { clear() {}, say() {}, stat: () => ({ set() { return this; }, add() { return this; }, v: 0 }), legend() {}, paused() {} };

// ---------- deljeni resursi (ne brišu se pri promeni scene) ----------
const shared = o => { o.userData.shared = true; return o; };
const G = new Map(), M = new Map();
const geo = (k, f) => { let g = G.get(k); if (!g) { g = shared(f()); G.set(k, g); } return g; };
const mat = (k, f) => { let m = M.get(k); if (!m) { m = shared(f()); M.set(k, m); } return m; };
const gBox = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const gEdge = (w, h, d) => geo(`e${w},${h},${d}`, () => new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)));
const gSph = r => geo(`s${r}`, () => new THREE.SphereGeometry(r, 24, 16));
const gCyl = (r, h, n = 40) => geo(`c${r},${h},${n}`, () => new THREE.CylinderGeometry(r, r, h, n));
const gTor = (R, t) => geo(`t${R},${t}`, () => new THREE.TorusGeometry(R, t, 10, 56));
const gRing = () => geo('ring', () => new THREE.RingGeometry(.86, 1, 56));
const gCircle = r => geo(`o${r}`, () => new THREE.BufferGeometry().setFromPoints(
  Array.from({ length: 65 }, (_, i) => V(Math.cos(i / 64 * Math.PI * 2) * r, 0, Math.sin(i / 64 * Math.PI * 2) * r))));
const mLine = (c, o = .35) => mat(`l${c},${o}`, () => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: o }));
const mBasic = (c, o = 1) => mat(`b${c},${o}`, () => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 }));
const mStd = (c, o = {}) => mat(`s${c}${JSON.stringify(o)}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: .55, metalness: .04, ...o }));
let HALO = null;
function haloTex() {
  if (HALO) return HALO;
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,.85)'); gr.addColorStop(.3, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  HALO = shared(new THREE.CanvasTexture(cv)); HALO.colorSpace = THREE.SRGBColorSpace;
  return HALO;
}
const mHalo = c => mat(`h${c}`, () => new THREE.SpriteMaterial({ map: haloTex(), color: c, transparent: true, opacity: .65, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
const mOrb = c => mStd(c, { emissive: c, emissiveIntensity: .5, roughness: .3 });

// yield na makrotask (za brzo "zagrevanje" scene sa async procesima)
const mc = new MessageChannel(), mq = [];
mc.port1.onmessage = () => { const r = mq.shift(); if (r) r(); };
const flush = () => new Promise(r => { mq.push(r); mc.port2.postMessage(0); });

// najveći zum k (px po jedinici) tako da sve tačke i labele stanu, plus centar
function solve(items, S, lo, hi) {
  const avail = S - lo - hi;
  let k = Infinity;
  for (const i of items) for (const j of items) {
    const da = i.a - j.a;
    if (da <= 1e-9) continue;
    const room = avail - i.f - j.b;
    k = Math.min(k, room > 0 ? room / da : 1e-3);
  }
  if (!isFinite(k)) k = 40;
  k = Math.max(k, 1e-3);
  const c = kk => {
    let mn = -Infinity, mx = Infinity;
    for (const i of items) { mn = Math.max(mn, kk * i.a + i.f - S / 2 + hi); mx = Math.min(mx, kk * i.a - i.b + S / 2 - lo); }
    return (mn + mx) / 2 / kk;
  };
  return { k, c };
}

// ======================= Stage =======================
export class Stage {
  constructor() {
    const el = this.el = document.createElement('div');
    el.className = 'stage-view';
    this.svgHost = document.createElement('div');
    this.svgHost.className = 'stage-svg';
    el.appendChild(this.svgHost);
    try {
      const r = this.renderer = new THREE.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      r.setClearColor(C.ground, 1);
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFShadowMap;
      r.domElement.className = 'stage-gl';
      el.appendChild(r.domElement);
    } catch (e) {
      this.renderer = null;
      const n = document.createElement('p');
      n.className = 'stage-nogl';
      n.textContent = 'Ovaj pregledač ne podržava WebGL, pa 3D scene ovde nisu dostupne.';
      el.appendChild(n);
    }
    this.css = new CSS2DRenderer();
    this.css.domElement.className = 'stage-labels';
    el.appendChild(this.css.domElement);
    this.ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, .1, 500);
    this.persp = new THREE.PerspectiveCamera(38, 1, .1, 800);
    this.camera = this.ortho;
    if (this.renderer) {
      const c = this.controls = new OrbitControls(this.ortho, this.renderer.domElement);
      c.enableDamping = true; c.dampingFactor = .08;
      c.maxPolarAngle = Math.PI * .49; c.minZoom = .5; c.maxZoom = 4;
      c.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
      this.renderer.domElement.style.touchAction = 'pan-y';
      this._picking(this.renderer.domElement);
    }
    this.speed = 1; this.paused = false; this.visible = true; this.w = 0; this.h = 0;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.io = new IntersectionObserver(es => { this.visible = es[es.length - 1].isIntersecting; });
    this.io.observe(el);
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  attach(host) { host.appendChild(this.el); this.w = 0; this.resize(); }
  detach() { this.unload(); this.el.remove(); }

  _picking(dom) {
    const ray = new THREE.Raycaster(), p = new THREE.Vector2();
    let sx = 0, sy = 0, st = 0;
    const hit = e => {
      const ctx = this.ctx;
      if (!ctx || !ctx.clicks.length) return null;
      const r = dom.getBoundingClientRect();
      p.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(p, this.camera);
      for (const h of ray.intersectObjects(ctx.clicks, true)) {
        let o = h.object;
        while (o && !o.userData.onClick) o = o.parent;
        if (o) return o;
      }
      return null;
    };
    dom.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; st = performance.now(); });
    dom.addEventListener('pointerup', e => {
      if (Math.hypot(e.clientX - sx, e.clientY - sy) < 6 && performance.now() - st < 450) { const o = hit(e); if (o) o.userData.onClick(); }
    });
    dom.addEventListener('pointermove', e => { if (!e.buttons) dom.style.cursor = hit(e) ? 'pointer' : ''; });
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h || (w === this.w && h === this.h)) return;
    this.w = w; this.h = h;
    if (this.renderer) this.renderer.setSize(w, h);
    this.css.setSize(w, h);
    if (this.ctx && this.ctx.kind === 'svg') { clearTimeout(this._rt); this._rt = setTimeout(() => this.reload(), 140); }
    else this.fit();
  }

  setPaused(v) { this.paused = v; if (this.last) this.last.ui.paused?.(v); }

  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(.05, Math.max(0, (now - (this._t ?? now)) / 1000));
    this._t = now;
    const ctx = this.ctx;
    if (!ctx || ctx.warming || !this.visible || document.hidden || !this.el.isConnected) return;
    if (!this.paused) ctx._step(dt * this.speed);
    if (ctx.kind === '3d' && this.renderer) {
      this.controls.update(dt);
      this.renderer.render(ctx.scene, this.camera);
      this.css.render(ctx.scene, this.camera);
    }
  }

  load(viz, params = {}, ui = NOUI) {
    this.unload();
    this.last = { viz, params, ui };
    const kind = viz.kind || '3d';
    this.el.dataset.kind = kind;
    ui.clear();
    if (kind === '3d' && !this.renderer) { ui.say('3D prikaz nije dostupan u ovom pregledaču.'); return; }
    if (!this.w) this.resize();
    const ctx = this.ctx = new Ctx(this, kind, params, ui);
    try { viz.build(ctx); } catch (e) { console.error(e); ui.say('Greška u sceni: ' + e.message); }
    if (kind === '3d') this.fit();
    const after = () => { if (REDUCED) this.setPaused(true); };
    if (viz.warm && !REDUCED) this._warm(ctx, viz.warm).then(after); else after();
  }

  reload() { if (this.last) this.load(this.last.viz, this.last.params, this.last.ui); }

  async _warm(ctx, secs) {
    ctx.warming = true;
    this.el.classList.add('warming');
    const n = Math.ceil(secs * 30);
    for (let i = 0; i < n && ctx.alive; i++) { ctx._step(1 / 30); await flush(); }
    ctx.warming = false;
    this.el.classList.remove('warming');
  }

  unload() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx._dispose();
    this.ctx = null;
    this.css.domElement.replaceChildren();
    this.svgHost.replaceChildren();
  }

  fit() {
    const ctx = this.ctx;
    if (!ctx || ctx.kind !== '3d' || !this.w || !this.renderer) return;
    const v = ctx.viewOpt, W = this.w, H = this.h;
    const cam = v.persp ? this.persp : this.ortho;
    this.camera = cam;
    this.controls.object = cam;
    ctx.scene.updateMatrixWorld(true);
    const pts = [], labs = [];
    const walk = o => {
      if (o.userData.nofit || o.visible === false) return;
      if (o.isCSS2DObject) labs.push(o);
      else if ((o.isMesh || o.isLine) && o.geometry) {
        const g = o.geometry;
        if (!g.boundingBox) g.computeBoundingBox();
        const b = g.boundingBox;
        for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(o.matrixWorld));
      }
      o.children.forEach(walk);
    };
    walk(ctx.scene);
    const lp = labs.map(l => l.getWorldPosition(V()));
    const all = pts.concat(lp);
    if (!all.length) return;
    const box = new THREE.Box3().setFromPoints(all), center = box.getCenter(V());
    const R = Math.max(4, box.getSize(V()).length() / 2);
    ctx.sun.position.copy(center).add(V(.45, 1, .6).multiplyScalar(R * 1.4));
    ctx.sun.target.position.copy(center);
    const sc = ctx.sun.shadow.camera;
    sc.left = sc.bottom = -R * 1.15; sc.right = sc.top = R * 1.15; sc.near = .1; sc.far = R * 5;
    sc.updateProjectionMatrix();
    ctx.grid.position.set(Math.round(center.x), Math.min(-.13, box.min.y - .02), Math.round(center.z));
    const dir = toV(v.dir).normalize();
    if (v.persp) {
      cam.fov = v.fov ?? 38; cam.aspect = W / H;
      const sph = new THREE.Sphere(); box.getBoundingSphere(sph);
      const half = THREE.MathUtils.degToRad(cam.fov / 2), hh = Math.atan(Math.tan(half) * cam.aspect);
      const dist = sph.radius / Math.sin(Math.min(half, hh)) * (v.pad ?? .95);
      cam.position.copy(sph.center).addScaledVector(dir, dist);
      cam.lookAt(sph.center);
      cam.near = dist / 40; cam.far = dist * 8;
      cam.updateProjectionMatrix();
      this.controls.target.copy(sph.center);
      this.controls.minDistance = dist * .35; this.controls.maxDistance = dist * 2.5;
    } else {
      cam.up.set(0, 1, 0);
      cam.position.copy(center).addScaledVector(dir, R * 4 + 20);
      cam.lookAt(center);
      cam.updateMatrixWorld(true);
      cam.near = .1; cam.far = R * 10 + 80;
      this.css.render(ctx.scene, cam); // ubaci labele u DOM da bismo izmerili njihove dimenzije
      const inv = cam.matrixWorldInverse, t = V();
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const p of pts) { t.copy(p).applyMatrix4(inv); x0 = Math.min(x0, t.x); x1 = Math.max(x1, t.x); y0 = Math.min(y0, t.y); y1 = Math.max(y1, t.y); }
      const ax = [], ay = [];
      if (pts.length) { ax.push({ a: x0, b: 0, f: 0 }, { a: x1, b: 0, f: 0 }); ay.push({ a: y0, b: 0, f: 0 }, { a: y1, b: 0, f: 0 }); }
      labs.forEach((l, i) => {
        const e = l.element, d = e.style.display;
        e.style.display = '';
        const w = e.offsetWidth, h = e.offsetHeight;
        e.style.display = d;
        t.copy(lp[i]).applyMatrix4(inv);
        ax.push({ a: t.x, b: w * l.center.x, f: w * (1 - l.center.x) });
        ay.push({ a: t.y, b: h * (1 - l.center.y), f: h * l.center.y });
      });
      const fx = solve(ax, W, 12, 12), fy = solve(ay, H, v.bottom ?? 12, v.top ?? 48);
      const k = Math.min(fx.k, fy.k, 140) * (v.zoom ?? 1);
      const right = V().setFromMatrixColumn(cam.matrixWorld, 0), up = V().setFromMatrixColumn(cam.matrixWorld, 1);
      const shift = right.multiplyScalar(fx.c(k)).add(up.multiplyScalar(fy.c(k)));
      const target = center.clone().add(shift);
      cam.position.add(shift);
      cam.lookAt(target);
      cam.left = -W / 2 / k; cam.right = W / 2 / k; cam.top = H / 2 / k; cam.bottom = -H / 2 / k; cam.zoom = 1;
      cam.updateProjectionMatrix();
      this.controls.target.copy(target);
    }
    this.controls.autoRotate = !!v.autoRotate;
    this.controls.autoRotateSpeed = .55;
    this.controls.update();
  }
}

// ======================= Ctx: ono što scena dobija =======================
class Ctx {
  constructor(stage, kind, p, ui) {
    Object.assign(this, { stage, kind, p, ui, C, V, THREE, ease });
    this.alive = true; this.t = 0; this.timers = []; this.tickers = new Set(); this.handlers = {}; this.clicks = [];
    this.viewOpt = { dir: [4, 12, 13] };
    this._seed = 9;
    if (kind === 'svg') this._svg(); else this._3d();
  }

  _3d() {
    const s = this.scene = new THREE.Scene();
    s.add(new THREE.HemisphereLight(0xe8ecf4, C.ground, 1.35));
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2.1);
    sun.position.set(8, 16, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -.0005;
    s.add(sun, sun.target);
    const grid = this.grid = new THREE.GridHelper(140, 140, C.grid, C.grid);
    grid.material.transparent = true; grid.material.opacity = .5;
    grid.position.y = -.13;
    grid.userData.nofit = true;
    s.add(grid);
  }

  _svg() {
    const host = this.stage.svgHost;
    const W = this.W = Math.max(300, this.stage.w || host.clientWidth || 800);
    const H = this.H = Math.max(240, this.stage.h || host.clientHeight || 420);
    const s = this.svg = this.el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H }, host);
    const defs = this.el('defs', {}, s);
    for (const [id, c] of [['ar', '#d3d8e0'], ['arm', hex(C.mag)], ['aro', hex(C.ok)], ['are', hex(C.err)], ['arw', hex(C.wait)]]) {
      const m = this.el('marker', { id: 'm-' + id, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      this.el('path', { d: 'M0,0 L10,5 L0,10 z', fill: c }, m);
    }
  }

  // ---------- vreme ----------
  _step(dt) {
    this.t += dt;
    for (const f of this.tickers) f(dt);
    if (this.timers.length) {
      let due = null;
      this.timers = this.timers.filter(x => { if (x.at <= this.t) { (due || (due = [])).push(x); return false; } return true; });
      if (due) for (const x of due) x.res();
    }
  }
  wait(s) { return new Promise(res => { if (this.alive) this.timers.push({ at: this.t + Math.max(0, s), res }); }); }
  tick(f) { this.tickers.add(f); return () => this.tickers.delete(f); }
  tween(dur, f, e = ease.io) {
    return new Promise(res => {
      if (!this.alive) return;
      let t = 0; f(0);
      const g = dt => { t += dt; const k = Math.min(1, t / dur); f(e(k)); if (k >= 1) { this.tickers.delete(g); res(); } };
      this.tickers.add(g);
    });
  }
  move(o, pts, speed = 6) {
    const obj = o.o || o, P = pts.map(toV), segs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const len = P[i].distanceTo(P[i + 1]);
      if (len > 1e-6) segs.push({ a: P[i], b: P[i + 1], len, v: Array.isArray(speed) ? (speed[i] ?? speed[speed.length - 1]) : speed });
    }
    obj.position.copy(P[0]);
    if (!segs.length) return Promise.resolve();
    return new Promise(res => {
      if (!this.alive) return;
      let i = 0, d = 0;
      const g = dt => {
        let rem = dt;
        while (rem > 0 && i < segs.length) {
          const s = segs[i], need = (s.len - d) / s.v;
          if (rem >= need) { rem -= need; i++; d = 0; } else { d += rem * s.v; rem = 0; }
        }
        if (i >= segs.length) { obj.position.copy(P[P.length - 1]); this.tickers.delete(g); res(); }
        else { const s = segs[i]; obj.position.lerpVectors(s.a, s.b, d / s.len); }
      };
      this.tickers.add(g);
    });
  }
  spawn(fn) { return (async () => { try { await fn(); } catch (e) { if (this.alive) console.error(e); } })(); }
  every(s, fn, delay = 0) {
    this.spawn(async () => {
      if (delay) await this.wait(delay);
      while (this.alive) { fn(); await this.wait(typeof s === 'function' ? s() : s); }
    });
  }
  on(n, f) { (this.handlers[n] || (this.handlers[n] = [])).push(f); }
  emit(n, v) { (this.handlers[n] || []).forEach(f => f(v)); }
  rnd() { this._seed = this._seed * 16807 % 2147483647; return (this._seed - 1) / 2147483646; }
  pick(a) { return a[Math.floor(this.rnd() * a.length)]; }
  range(a, b) { return a + (b - a) * this.rnd(); }
  // semafor i kanal za simulacije
  sem(n) {
    const q = [];
    const s = {
      free: n,
      get waiting() { return q.length; },
      acquire: () => new Promise(r => { if (s.free > 0) { s.free--; r(); } else q.push(r); }),
      release: () => { const r = q.shift(); if (r) r(); else s.free++; },
    };
    return s;
  }
  chan() {
    const items = [], waiters = [];
    return {
      items,
      get size() { return items.length; },
      push(x) { const w = waiters.shift(); if (w) w(x); else items.push(x); },
      take: () => new Promise(r => { if (items.length) r(items.shift()); else waiters.push(r); }),
    };
  }

  // ---------- UI ----------
  say(h) { this.ui.say(h); }
  stat(id, label, v = 0, o = {}) { return this.ui.stat(id, label, v, o); }
  legend(items) { this.ui.legend(items); }
  view(o) { Object.assign(this.viewOpt, o); }

  // ---------- primitive (vizuelni jezik) ----------
  label(text, at, o = {}) {
    const el = document.createElement('div');
    el.className = 'lbl' + (o.cls ? ' ' + o.cls.split(' ').map(c => 'lbl-' + c).join(' ') : '');
    el.innerHTML = text;
    if (o.color != null) el.style.setProperty('--c', hex(o.color));
    const obj = new CSS2DObject(el);
    const c = o.center || [.5, 1];
    obj.center.set(c[0], c[1]);
    obj.position.copy(toV(at));
    if (o.nofit) obj.userData.nofit = true;
    (o.parent || this.scene).add(obj);
    obj.set = t => { el.innerHTML = t; return obj; };
    obj.el = el;
    return obj;
  }
  _node(mesh, dims, o) {
    const n = new Node(this, mesh, dims);
    const { h, w } = dims;
    const side = o.side || 'top';
    if (o.label != null) {
      const pos = { top: [[0, h / 2 + .18, 0], [.5, 1]], below: [[0, -h / 2, dims.d / 2 + .1], [.5, 0]], right: [[w / 2 + .18, 0, 0], [0, .5]], left: [[-w / 2 - .18, 0, 0], [1, .5]], in: [[0, 0, dims.d / 2], [.5, .5]] }[side];
      n.lbl = this.label(o.label, pos[0], { parent: mesh, cls: o.lcls, center: pos[1], color: o.lcolor });
    }
    if (o.nofit) mesh.userData.nofit = true;
    if (o.onClick) this.clickable(mesh, o.onClick);
    return n;
  }
  box(o = {}) {
    const [w, h, d] = o.size || [1.3, 1, 1.3];
    const at = toV(o.at);
    const m = new THREE.MeshStandardMaterial({ color: o.color ?? C.box, roughness: .6, metalness: .02 });
    const mesh = new THREE.Mesh(gBox(w, h, d), m);
    mesh.position.set(at.x, at.y + h / 2, at.z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(gEdge(w, h, d), mLine(o.edge ?? C.ink, .3)));
    (o.parent || this.scene).add(mesh);
    return this._node(mesh, { w, h, d }, o);
  }
  db(o = {}) {
    const r = o.r ?? .75, h = o.h ?? 1.1, at = toV(o.at);
    const m = new THREE.MeshStandardMaterial({ color: o.color ?? C.db, roughness: .45, metalness: .05 });
    const mesh = new THREE.Mesh(gCyl(r, h), m);
    mesh.position.set(at.x, at.y + h / 2, at.z);
    mesh.castShadow = mesh.receiveShadow = true;
    for (const f of [0, .34, .67, 1]) {
      const ring = new THREE.Line(gCircle(r * 1.004), mLine(C.ink, f % 1 ? .3 : .45));
      ring.position.y = -h / 2 + h * f;
      mesh.add(ring);
    }
    (o.parent || this.scene).add(mesh);
    return this._node(mesh, { w: 2 * r, h, d: 2 * r }, o);
  }
  plate(o = {}) {
    const w = o.w ?? 10, d = o.d ?? 6, at = toV(o.at);
    const mesh = new THREE.Mesh(gBox(w, .12, d), mStd(o.fill ?? C.plate, { roughness: .95 }));
    mesh.position.set(at.x, at.y - .06, at.z);
    mesh.receiveShadow = true;
    mesh.add(new THREE.LineSegments(gEdge(w, .12, d), mLine(o.color ?? C.edge, .75)));
    this.scene.add(mesh);
    if (o.label) {
      const front = o.lpos === 'front';
      this.label(o.label, [at.x - w / 2 + .15, at.y + .02, front ? at.z + d / 2 + .05 : at.z - d / 2 + .1], { cls: 'plate', center: front ? [0, 0] : [0, 1], color: o.color });
    }
    return mesh;
  }
  tube(a, b, o = {}) {
    a = toV(a); b = toV(b);
    const r = o.r ?? .5, dir = V().subVectors(b, a), len = dir.length(), n = dir.clone().normalize();
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 40, 1, true),
      mStd(C.glass, { transparent: true, opacity: .15, roughness: .15, depthWrite: false, side: THREE.DoubleSide }));
    glass.position.copy(a).addScaledVector(dir, .5);
    glass.quaternion.setFromUnitVectors(UP, n);
    this.scene.add(glass);
    const col = o.color ?? C.sky;
    const rim = mStd(col, { emissive: col, emissiveIntensity: .55 }), rib = mBasic(col, .25);
    const q = new THREE.Quaternion().setFromUnitVectors(FWD, n);
    const ribs = Math.max(1, Math.round(len / 1.1));
    for (let i = 0; i <= ribs; i++) {
      const end = i === 0 || i === ribs;
      const t = new THREE.Mesh(end ? gTor(r + .01, .045) : gTor(r, .012), end ? rim : rib);
      t.position.copy(a).addScaledVector(dir, i / ribs);
      t.quaternion.copy(q);
      this.scene.add(t);
    }
    if (o.label) this.label(o.label, a.clone().lerp(b, .5).add(V(0, r + .2, 0)), { cls: o.lcls, color: col });
    return { a, b, len, r, o: glass, at: t => a.clone().lerp(b, t) };
  }
  rail(a, b, o = {}) {
    a = toV(a); b = toV(b);
    const dir = V().subVectors(b, a), len = dir.length();
    if (len < 1e-4) return null;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(o.r ?? .035, o.r ?? .035, len, 8, 1, true), mBasic(o.color ?? C.sky, o.opacity ?? .45));
    m.position.copy(a).addScaledVector(dir, .5);
    m.quaternion.setFromUnitVectors(UP, dir.normalize());
    if (o.nofit) m.userData.nofit = true;
    (o.parent || this.scene).add(m);
    return m;
  }
  arrow(a, b, o = {}) {
    a = toV(a); b = toV(b);
    const dir = V().subVectors(b, a), n = dir.clone().normalize(), hl = o.head ?? .32;
    const g = new THREE.Group();
    const r = this.rail(a, b.clone().addScaledVector(n, -hl * .9), { ...o, parent: g });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(hl * .45, hl, 12), mBasic(o.color ?? C.sky, Math.min(1, (o.opacity ?? .8) + .2)));
    cone.position.copy(b).addScaledVector(n, -hl / 2);
    cone.quaternion.setFromUnitVectors(UP, n);
    g.add(cone);
    if (o.nofit) g.userData.nofit = true;
    this.scene.add(g);
    if (o.label) this.label(o.label, a.clone().lerp(b, .5).add(V(0, .25, 0)), { cls: o.lcls || 'tag', color: o.color, parent: g });
    g.rail = r;
    return g;
  }
  orb(color = C.mag, o = {}) {
    const r = o.r ?? .26;
    const mesh = new THREE.Mesh(gSph(r), mOrb(color));
    mesh.castShadow = true;
    mesh.userData.nofit = true;
    if (o.halo !== false) { const h = new THREE.Sprite(mHalo(color)); h.scale.setScalar(r * 4.4); h.renderOrder = 2; mesh.add(h); }
    if (o.at) mesh.position.copy(toV(o.at));
    if (o.label != null) mesh.lbl = this.label(o.label, [0, r + .1, 0], { parent: mesh, cls: o.lcls || 'tag', nofit: true });
    this.scene.add(mesh);
    mesh.color = color;
    return mesh;
  }
  chip(color, o = {}) {
    const s = o.s ?? .34;
    const m = new THREE.MeshStandardMaterial({ color, roughness: .45, emissive: color, emissiveIntensity: o.glow ?? .15 });
    const mesh = new THREE.Mesh(o.round ? gSph(s / 2) : gBox(s, s, s), m);
    mesh.castShadow = true;
    if (!o.fit) mesh.userData.nofit = true;
    if (o.at) mesh.position.copy(toV(o.at));
    if (o.label != null) mesh.lbl = this.label(o.label, [0, s / 2 + .08, 0], { parent: mesh, cls: o.lcls || 'tag', nofit: !o.fit });
    (o.parent || this.scene).add(mesh);
    mesh.color = color;
    return mesh;
  }
  token(o = {}) {
    const mesh = new THREE.Mesh(gCyl(.2, .07, 24), mStd(o.color ?? C.token, { emissive: o.color ?? C.token, emissiveIntensity: .35, metalness: .3, roughness: .35 }));
    mesh.castShadow = true;
    mesh.userData.nofit = !o.fit;
    if (o.at) mesh.position.copy(toV(o.at));
    this.scene.add(mesh);
    return mesh;
  }
  bar(at, h, color, o = {}) {
    const w = o.w ?? .7, d = o.d ?? .7;
    const m = new THREE.MeshStandardMaterial({ color, roughness: .5, emissive: color, emissiveIntensity: o.glow ?? .08 });
    const mesh = new THREE.Mesh(gBox(1, 1, 1), m);
    const p = toV(at);
    mesh.scale.set(w, Math.max(.001, h), d);
    mesh.position.set(p.x, p.y + h / 2, p.z);
    mesh.castShadow = mesh.receiveShadow = true;
    if (o.nofit) mesh.userData.nofit = true;
    (o.parent || this.scene).add(mesh);
    mesh.setH = hh => { mesh.scale.y = Math.max(.001, hh); mesh.position.y = p.y + hh / 2; };
    mesh.paint = c => { m.color.set(c); m.emissive.set(c); };
    return mesh;
  }
  ring(at, R, color, o = {}) {
    const mesh = new THREE.Mesh(gTor(R, o.t ?? .05), mStd(color, { emissive: color, emissiveIntensity: .4 }));
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(toV(at));
    this.scene.add(mesh);
    return mesh;
  }
  line(points, color = C.sky, o = {}) {
    const g = new THREE.BufferGeometry().setFromPoints(points.map(toV));
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: o.opacity ?? .8 }));
    if (o.nofit) l.userData.nofit = true;
    this.scene.add(l);
    return l;
  }
  group(o = {}) { const g = new THREE.Group(); if (o.nofit) g.userData.nofit = true; this.scene.add(g); return g; }
  clickable(obj, fn) { const o = obj.o || obj; o.userData.onClick = fn; this.clicks.push(o); }
  flash(material, color = C.ok, dur = .6, k0 = .85) {
    const col = new THREE.Color(color);
    let t = 0;
    const g = dt => {
      t += dt;
      const k = Math.max(0, 1 - t / dur);
      material.emissive.copy(col).multiplyScalar(k * k0);
      if (k <= 0) this.tickers.delete(g);
    };
    this.tickers.add(g);
  }
  ripple(at, color = C.ok, r = .9) {
    const m = new THREE.Mesh(gRing(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, side: THREE.DoubleSide, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    const p = toV(at);
    m.position.set(p.x, .03, p.z);
    m.scale.setScalar(r);
    m.userData.nofit = true;
    this.scene.add(m);
    this.tween(.7, k => { m.scale.setScalar(r * (1 + k)); m.material.opacity = .8 * (1 - k); }, ease.out).then(() => this.remove(m));
  }
  pop(obj, to = 1, dur = .3) { const o = obj.o || obj; return this.tween(dur, k => o.scale.setScalar(Math.max(.001, to * k)), ease.out); }
  fadeOut(obj, dur = .35) {
    const o = obj.o || obj, s0 = o.scale.x;
    return this.tween(dur, k => o.scale.setScalar(Math.max(.001, s0 * (1 - k)))).then(() => this.remove(o));
  }
  remove(obj) {
    if (!obj) return;
    const o = obj.o || obj;
    o.traverse(x => { if (x.isCSS2DObject) x.element.remove(); });
    if (o.parent) o.parent.remove(o);
    const i = this.clicks.indexOf(o);
    if (i >= 0) this.clicks.splice(i, 1);
    o.traverse(x => {
      if (x.geometry && !x.geometry.userData.shared) x.geometry.dispose();
      if (x.material && !x.material.userData.shared) x.material.dispose();
    });
  }

  // ---------- SVG ----------
  el(tag, a = {}, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    (parent || this.svg).appendChild(e);
    return e;
  }
  txt(x, y, s, a = {}, parent) { const e = this.el('text', { x, y, ...a }, parent); e.textContent = s; return e; }

  _dispose() {
    this.alive = false;
    this.tickers.clear();
    this.timers = [];
    if (this.scene) {
      this.scene.traverse(x => {
        if (x.geometry && !x.geometry.userData.shared) x.geometry.dispose();
        if (x.material && !x.material.userData.shared) x.material.dispose();
      });
      this.scene.clear();
    }
  }
}

class Node {
  constructor(ctx, mesh, dims) { this.ctx = ctx; this.o = mesh; this.dims = dims; this.base = mesh.material.color.clone(); }
  get pos() { return this.o.position; }
  port(side = 'top', dy = 0) {
    const { w, h, d } = this.dims, p = this.o.position;
    const y = p.y + dy;
    switch (side) {
      case 'left': return V(p.x - w / 2, y, p.z);
      case 'right': return V(p.x + w / 2, y, p.z);
      case 'front': return V(p.x, y, p.z + d / 2);
      case 'back': return V(p.x, y, p.z - d / 2);
      case 'top': return V(p.x, p.y + h / 2 + dy, p.z);
      default: return V(p.x, y, p.z);
    }
  }
  flash(color = C.ok, dur = .6) { this.ctx.flash(this.o.material, color, dur); return this; }
  paint(c) { this.o.material.color.set(c); return this; }
  reset() { this.o.material.color.copy(this.base); return this; }
  text(t) { if (this.lbl) this.lbl.set(t); return this; }
  dim(on = true) {
    const m = this.o.material;
    m.transparent = on; m.opacity = on ? .3 : 1; m.depthWrite = !on; m.needsUpdate = true;
    if (this.lbl) this.lbl.el.style.opacity = on ? .45 : 1;
    return this;
  }
}
