// skills.js — Skillset: radar sa jednom osom po oblasti i pet nivoa
import { T } from './i18n.js';

export const LEVELS = [['Početni', 'Beginner'], ['Osnovni', 'Basic'], ['Srednji', 'Intermediate'], ['Napredni', 'Advanced'], ['Ekspert', 'Expert']]
  .map(([sr, en]) => T(sr, en));

// Nivo oblasti od 1 do 5; 0 znači da još nije postavljen.
// Način popunjavanja još nije odlučen: kad bude, menja se samo ova funkcija.
export const levelOf = () => 0;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// prelom naziva ose u najviše dva reda
function wrap(s, max) {
  if (s.length <= max || !s.includes(' ')) return [s];
  const w = s.split(' ');
  let best = [s], bestD = Infinity;
  for (let i = 1; i < w.length; i++) {
    const a = w.slice(0, i).join(' '), b = w.slice(i).join(' '), d = Math.max(a.length, b.length);
    if (d < bestD) { bestD = d; best = [a, b]; }
  }
  return best;
}

// areas: [{ title, level }]; crta se u stvarnoj veličini svg-a
export function drawSkills(svg, areas) {
  const W = svg.clientWidth, H = svg.clientHeight;
  if (!W || !H) return;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const narrow = W < 520, fs = narrow ? 10.5 : 12, lh = fs * 1.2, pad = 6;
  const N = areas.length, cx = W / 2, cy = H / 2;
  const ang = i => (-90 + i * 360 / N) * Math.PI / 180;
  const est = l => l.length * fs * .76;   // širina naziva velikim slovima sa razmakom među slovima
  // kako stoji svaki naziv: pored vrha strelice, a na telefonu skoro vodoravne ose dobijaju naziv iznad ili ispod vrha
  const conf = areas.map((a, i) => {
    const c = Math.cos(ang(i)), sn = Math.sin(ang(i)), lines = wrap(a.title.toUpperCase(), narrow ? 11 : 15);
    const side = narrow && Math.abs(sn) < .45, anchor = side || Math.abs(c) < .3 ? 'middle' : c > 0 ? 'start' : 'end';
    return { c, sn, lines, w: Math.max(...lines.map(est)), side, anchor, off: side ? 22 : narrow ? 30 : 38 };
  });
  // najveći poluprečnik pri kome svi nazivi ostaju u crtežu
  let R = Math.min(W, H) / 2 - 24;
  for (const k of conf) {
    const lx = k.anchor === 'start' ? k.w : k.anchor === 'end' ? k.w : k.w / 2;
    if (Math.abs(k.c) > .05) R = Math.min(R, (W / 2 - pad - lx) / Math.abs(k.c) - k.off);
    const hy = k.lines.length * lh + (k.side ? 10 : 0);
    if (Math.abs(k.sn) > .3) R = Math.min(R, (H / 2 - pad - hy) / Math.abs(k.sn) - k.off);
  }
  R = Math.max(56, R);
  const pt = (i, r) => [cx + r * Math.cos(ang(i)), cy + r * Math.sin(ang(i))];
  const f = v => v.toFixed(1);
  const poly = r => areas.map((_, i) => pt(i, r).map(f).join(',')).join(' ');
  svg.style.setProperty('--cx', f(cx) + 'px');
  svg.style.setProperty('--cy', f(cy) + 'px');
  let s = '';
  // prstenovi nivoa: od spoljnog ka unutrašnjem; providni slojevi se slažu, pa je sredina tamnija
  for (let L = 5; L >= 1; L--) s += `<polygon class="sk-ring" points="${poly(R * L / 5)}" style="--d:${(5 - L) * 70}ms"/>`;
  areas.forEach((a, i) => {
    const { c, sn, lines, side, anchor, off } = conf[i];
    const [x2, y2] = pt(i, R + 14), [tx, ty] = pt(i, R + 22), [bx, by] = pt(i, R + 13);
    const px = -sn * 4.2, py = c * 4.2;
    let [lx, ly] = pt(i, R + off), y0;
    if (side) y0 = sn < 0 ? ty - 9 - (lines.length - 1) * lh : ty + fs + 7;
    else y0 = sn < -.5 ? ly - (lines.length - 1) * lh : sn > .5 ? ly + fs * .8 : ly - (lines.length - 1) * lh / 2 + fs * .36;
    if (side) lx = tx;
    const lvl = a.level ? `${a.level} · ${LEVELS[a.level - 1]}` : T('nivo još nije postavljen', 'level not set yet');
    s += `<g class="sk-ax" style="--d:${320 + i * 45}ms"><title>${esc(a.title)}: ${esc(lvl)}</title>
      <line class="sk-axl" x1="${f(cx)}" y1="${f(cy)}" x2="${f(x2)}" y2="${f(y2)}"/>
      <path class="sk-arr" d="M${f(tx)},${f(ty)}L${f(bx + px)},${f(by + py)}L${f(bx - px)},${f(by - py)}Z"/>
      <text x="${f(lx)}" y="${f(y0)}" text-anchor="${anchor}">${lines.map((l, k) => `<tspan x="${f(lx)}"${k ? ` dy="${f(lh)}"` : ''}>${esc(l)}</tspan>`).join('')}</text>
      <line class="sk-hit" x1="${f(cx)}" y1="${f(cy)}" x2="${f(x2)}" y2="${f(y2)}"/></g>`;
  });
  for (let L = 1; L <= 5; L++) s += `<text class="sk-lv" x="${f(cx + 7)}" y="${f(cy - R * L / 5 - 4)}">${L}</text>`;
  if (areas.some(a => a.level)) {
    const pts = areas.map((a, i) => pt(i, R * a.level / 5));
    s += `<polygon class="sk-shape" points="${pts.map(p => p.map(f).join(',')).join(' ')}"/>`;
    s += pts.map(([x, y]) => `<circle class="sk-dot" cx="${f(x)}" cy="${f(y)}" r="4.5"/>`).join('');
  }
  svg.innerHTML = s;
}
