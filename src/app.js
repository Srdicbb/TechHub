// app.js — navigacija, stranice tema, kontrole scene
import { hljs } from './lib.js';
import { Stage, hex } from './viz.js';
import { DOMAINS } from './domains.js';
import { TABS } from './tabs.js';
import { TOPICS } from './topics/index.js';
import { ICONS } from './icons.js';
import { legendViz } from './legend.js';
import { sysViz } from './sysviz.js';
import { T, lang, setLang } from './i18n.js';
import { LEVELS, levelOf, drawSkills } from './skills.js';

{
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = n => (ICONS[n] || '').replace('<svg', '<svg aria-hidden="true" focusable="false" class="i"');
  const byId = new Map(TOPICS.map(t => [t.id, t]));
  const DM = new Map(DOMAINS.map(d => [d.id, d]));
  // tabovi -> sekcije -> teme
  for (const tab of TABS) {
    if (tab.domains) tab.sections = tab.domains.map(d => ({ id: d, title: DM.get(d).title, icon: DM.get(d).icon, topics: TOPICS.filter(t => t.d === d).map(t => t.id) }));
    for (const s of tab.sections) s.topics = s.topics.filter(id => byId.has(id));
  }
  const TM = new Map(TABS.map(t => [t.id, t]));
  const TAB_OF = new Map(), SEC_OF = new Map();
  for (const tab of TABS) for (const s of tab.sections) for (const id of s.topics) { TAB_OF.set(id, tab); SEC_OF.set(id, s); }
  const DOM_TAB = new Map(DOMAINS.map(d => [d.id, TABS.find(tb => tb.domains?.includes(d.id)) || TAB_OF.get(TOPICS.find(t => t.d === d.id)?.id) || TABS[0]]));
  const SM = new Map(TABS.flatMap(tab => tab.sections.map(sec => [sec.id, tab])));
  const ORDER = TABS.flatMap(tab => tab.sections.flatMap(s => s.topics.map(id => byId.get(id))));
  const IDX = new Map(ORDER.map((t, i) => [t.id, i]));
  const tabTopics = tab => tab.sections.flatMap(s => s.topics).map(id => byId.get(id));
  const tabName = tab => tab.name || tab.title;
  const SYS = TABS.find(t => t.page === 'system');
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // susedne teme za oblast: poslednja pre nje i prva u njoj (ili posle nje, ako je prazna)
  const around = tab => { const ti = TABS.indexOf(tab), b = TABS.slice(0, ti).flatMap(tabTopics); return [b[b.length - 1], tabTopics(tab)[0] || TABS.slice(ti + 1).flatMap(tabTopics)[0]]; };
  { const lost = TOPICS.filter(t => !TAB_OF.has(t.id)); if (lost.length) console.warn('Teme bez taba:', lost.map(t => t.id).join(', ')); }
  const norm = s => String(s ?? '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const fmt = (s, plain = false) => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => {
      const t = byId.get(id);
      if (!t) return m;
      return plain ? esc(t.title) : `<a href="#${id}">${esc(t.title)}</a>`;
    });
  const sayFmt = s => String(s ?? '').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  const plural = n => T((n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'teme' : 'tema', n === 1 ? 'topic' : 'topics');
  const LANG = { csharp: 'C#', typescript: 'TypeScript', sql: 'SQL', yaml: 'YAML', bash: 'Shell', json: 'JSON', xml: 'HTML', plaintext: T('Tekst', 'Text') };

  const stage = new Stage();
  const store = new Map();
  let observers = [];

  // ---------- bočni meni, putanja i pregledane teme ----------
  let curTab = null, auto = null;
  const q = $('#q');
  const opened = new Set(), manual = new Set();
  const TKEY = 'prirucnik.tema', MKEY = 'prirucnik.meni';
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* skladište nije dostupno */ } },
  };
  // priručnik ne prati pregledane ni nedavne teme; brišu se zapisi iz ranijih verzija
  try { localStorage.removeItem('prirucnik.pregledano'); localStorage.removeItem('prirucnik.nedavno'); } catch { /* skladište nije dostupno */ }
  const item = t => `<li><a href="#${t.id}" data-t="${t.id}"><span class="sym">${esc(t.sym)}</span><span class="tt">${esc(t.title)}</span></a></li>`;
  // stablo oblasti: naslovi sekcija i teme, spojeni linijom kao grane
  const tree = tab => `<ul class="tree">${tab.sections.map(sc => `<li class="th">${esc(sc.title)}</li>${sc.topics.map(id => item(byId.get(id))).join('')}`).join('')}</ul>`;
  function renderToc() {
    $('#toc').innerHTML = `<a class="nav-home" href="#" data-tip="${T('Početna', 'Home')}">${icon('house')}<span class="tt">${T('Početna', 'Home')}</span></a><p class="sb-h">${T('Oblasti', 'Areas')}</p>` +
      TABS.map(tab => {
        const n = tabTopics(tab).length, on = n > 0 && opened.has(tab.id);
        return `<section class="nav-tab${on ? ' open' : ''}${tab === curTab ? ' here' : ''}${n ? '' : ' soon'}">
          <div class="nav-row"><a class="nav-t" href="#${tab.id}" data-tab="${tab.id}">${icon(tab.icon)}<span class="tt">${esc(tab.title)}</span><span class="n">${n || T('uskoro', 'soon')}</span></a>${n ? `<button class="nav-x" type="button" data-x="${tab.id}" aria-expanded="${on}" aria-label="${on ? T('Sakrij', 'Hide') : T('Prikaži', 'Show')} ${T('teme', 'topics')}: ${esc(tab.title)}">${icon('chevron-down')}</button>` : '<span class="nav-x ph" aria-hidden="true"></span>'}</div>
          ${on ? tree(tab) : ''}
        </section>`;
      }).join('');
  }
  // tema: dugme u gornjem desnom uglu. Izbor se piše u data-tema, jer data-theme na <html> postavlja i okruženje
  // (claude.ai ga postavlja po svojoj temi i vraća ga nazad), pa bi pregazilo izbor.
  const theme = () => { const r = document.documentElement; return r.dataset.tema || r.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); };
  function markTheme() {
    const b = $('#tema'), dark = theme() === 'dark', lab = dark ? T('Uključi svetlu temu', 'Switch to light theme') : T('Uključi tamnu temu', 'Switch to dark theme');
    b.dataset.on = dark ? 'dark' : 'light';
    b.setAttribute('aria-label', lab);
    b.title = lab;
  }
  function search(qs) {
    const words = norm(qs.trim()).split(/\s+/).filter(Boolean);
    if (!words.length) { $('#qn').textContent = ''; renderToc(); markCurrent(); return; }
    let cnt = 0;
    $('#toc').innerHTML = TABS.map(tab => {
      const hits = tabTopics(tab).filter(t => {
        const hay = norm([t.title, t.sym, (t.tags || []).join(' '), SEC_OF.get(t.id).title, tab.title, tabName(tab), t.desc].join(' '));
        return words.every(w => hay.includes(w));
      });
      cnt += hits.length;
      return hits.length ? `<div class="grp found"><p class="grp-h">${icon(tab.icon)}<span>${esc(tab.title)}</span></p><ul class="tree flat">${hits.map(item).join('')}</ul></div>` : '';
    }).join('');
    $('#qn').textContent = cnt ? `${cnt} ${plural(cnt)}` : T('Nema rezultata', 'No results');
    markCurrent();
  }
  function markCurrent() {
    const h = '#' + decodeURIComponent(location.hash.slice(1));
    $$('#toc a').forEach(a => {
      const on = a.getAttribute('href') === h || (h === '#' && a.classList.contains('nav-home'));
      a.classList.toggle('cur', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function setTab(tab) {
    if (auto && (!tab || auto !== tab.id)) { if (!manual.has(auto)) opened.delete(auto); auto = null; }
    if (tab && tabTopics(tab).length && !opened.has(tab.id)) { opened.add(tab.id); auto = tab.id; }
    curTab = tab;
    if (q.value.trim()) search(q.value); else renderToc();
  }
  function crumbs(parts) {
    $('#crumbs').innerHTML = `<a class="home" href="#" aria-label="${T('Početna', 'Home')}">${icon('house')}</a>` +
      parts.map(([label, href, mid], i) => `<span class="sep${mid ? ' m' : ''}" aria-hidden="true">${icon('chevron-right')}</span>` +
        (href && i < parts.length - 1 ? `<a class="${mid ? 'mid' : ''}" href="${href}">${esc(label)}</a>` : `<b>${esc(label)}</b>`)).join('');
  }

  // ---------- delovi stranice ----------
  // susedne strane za tastaturu (← i →)
  let adj = { prev: null, next: null };
  const pn = (prev, next) => { adj = { prev: prev?.id ?? null, next: next?.id ?? null }; };
  const tile = t => `<a class="tile" href="#${t.id}"><span class="tsym">${esc(t.sym)}</span><span class="tnm">${esc(t.title)}</span></a>`;

  function params(key, viz) {
    if (!store.has(key)) {
      const p = {};
      for (const k of viz.knobs || []) p[k.id] = k.value;
      store.set(key, p);
    }
    return store.get(key);
  }
  const fmtK = (k, v) => k.fmt ? k.fmt(v) : String(v);
  function knobHtml(k, p, key) {
    const v = p[k.id];
    if (k.toggle) return `<button type="button" class="btn tgl" data-tk="${k.id}" aria-pressed="${!!v}"><span class="tk" aria-hidden="true"></span><span>${esc(k.label)}</span></button>`;
    if (k.options) {
      return `<div class="knob"><span class="kl">${esc(k.label)}</span><div class="seg" role="radiogroup" aria-label="${esc(k.label)}">${k.options.map(([val, lab]) =>
        `<button type="button" role="radio" aria-checked="${val === v}" data-k="${k.id}" data-v="${esc(String(val))}">${esc(lab)}</button>`).join('')}</div></div>`;
    }
    return `<label class="knob"><span class="kl">${esc(k.label)}</span><input type="range" id="k-${key}-${k.id}" data-k="${k.id}" min="${k.min}" max="${k.max}" step="${k.step ?? 1}" value="${v}"><output${k.w ? ` style="min-width:${k.w}ch"` : ''}>${esc(fmtK(k, v))}</output></label>`;
  }
  function vizCard(viz, key) {
    const p = params(key, viz);
    const knobs = (viz.knobs || []).map(k => knobHtml(k, p, key)).join('');
    const acts = (viz.actions || []).map(a => `<button type="button" class="btn act" data-act="${a.id}"${a.aria ? ` aria-label="${esc(a.aria)}" title="${esc(a.aria)}"` : ''}>${icon(a.icon || 'zap')}<span>${esc(a.label)}</span></button>`).join('');
    return `<section class="viz" aria-label="${T('Vizualizacija', 'Visualization')}">
      <div class="viz-stage"><div class="viz-scroll"></div><div class="viz-stats"></div><div class="viz-legend"></div>
        <button type="button" class="btn ic viz-fs" aria-label="${T('Ceo ekran', 'Full screen')}" title="${T('Ceo ekran', 'Full screen')}">${icon('maximize')}</button></div>
      <div class="viz-bar">
        <div class="grpc">
          <button type="button" class="btn ic" data-cmd="play" aria-label="${T('Pauza', 'Pause')}" title="${T('Pauza', 'Pause')}">${icon('pause')}</button>
          <button type="button" class="btn ic" data-cmd="restart" aria-label="${T('Pokreni ispočetka', 'Restart')}" title="${T('Pokreni ispočetka', 'Restart')}">${icon('rotate-ccw')}</button>
          <div class="seg" role="group" aria-label="${T('Brzina', 'Speed')}">${[.5, 1, 2].map(s => `<button type="button" data-speed="${s}" aria-pressed="${s === stage.speed}">${s === .5 ? '½' : s}×</button>`).join('')}</div>
        </div>
        ${knobs ? `<div class="grpc knobs">${knobs}</div>` : ''}
        ${acts ? `<div class="grpc acts">${acts}</div>` : ''}
      </div>
      <p class="viz-say" aria-live="polite"></p>
    </section>`;
  }
  function makeUI(card) {
    const st = $('.viz-stats', card), lg = $('.viz-legend', card), say = $('.viz-say', card), pb = $('[data-cmd=play]', card);
    let ch = null;
    return {
      clear() { st.replaceChildren(); lg.replaceChildren(); say.innerHTML = ''; ch?.remove(); ch = null; },
      chart() { if (!ch) { ch = document.createElement('div'); ch.className = 'viz-chart'; $('.viz-stage', card).after(ch); } return ch; },
      go: navTo,
      say(h) { say.innerHTML = sayFmt(h); },
      stat(id, label, v, o = {}) {
        const el = document.createElement('span');
        el.className = 'st' + (o.minor ? ' minor' : '');
        el.dataset.id = id;
        if (o.color != null) el.style.setProperty('--c', hex(o.color));
        el.innerHTML = `<span class="k">${label}</span><b class="v"></b>`;
        st.appendChild(el);
        const ve = $('.v', el), f = o.fmt || (x => x);
        let val = v;
        const h = { set(x) { val = x; ve.textContent = f(x); return h; }, add(d = 1) { return h.set(val + d); }, get v() { return val; }, el };
        return h.set(v);
      },
      legend(items) { lg.innerHTML = items.map(([c, t]) => `<span><i style="--c:${hex(c)}"></i>${t}</span>`).join(''); },
      paused(v) {
        pb.innerHTML = icon(v ? 'play' : 'pause');
        pb.setAttribute('aria-label', v ? T('Pusti', 'Play') : T('Pauza', 'Pause'));
        pb.title = v ? T('Pusti', 'Play') : T('Pauza', 'Pause');
      },
    };
  }
  function mountViz(card, viz, key) {
    const p = params(key, viz), ui = makeUI(card);
    const sc = $('.viz-scroll', card);
    stage.attach(sc);
    sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2);
    const restart = () => { stage.paused = false; ui.paused(false); stage.load(viz, p, ui); };
    restart();
    $('[data-cmd=play]', card).onclick = () => stage.setPaused(!stage.paused);
    $('[data-cmd=restart]', card).onclick = restart;
    $$('[data-speed]', card).forEach(b => {
      b.onclick = () => { stage.speed = +b.dataset.speed; $$('[data-speed]', card).forEach(x => x.setAttribute('aria-pressed', String(x === b))); };
    });
    // živa kontrola menja parametar bez restarta: scena dobija događaj 'knob'
    const changed = k => { if (k.live || k.toggle) stage.ctx?.emit('knob', k.id); else restart(); };
    $$('.seg [data-k]', card).forEach(b => {
      b.onclick = () => {
        const k = viz.knobs.find(q => q.id === b.dataset.k);
        const opt = k.options.find(o => String(o[0]) === b.dataset.v);
        if (k.live && p[k.id] === opt[0]) return;
        p[k.id] = opt[0];
        $$(`.seg [data-k="${k.id}"]`, card).forEach(x => x.setAttribute('aria-checked', String(x === b)));
        changed(k);
      };
    });
    $$('input[type=range]', card).forEach(r => {
      const k = viz.knobs.find(q => q.id === r.dataset.k);
      r.oninput = () => { r.nextElementSibling.textContent = fmtK(k, +r.value); if (k.live && p[k.id] !== +r.value) { p[k.id] = +r.value; changed(k); } };
      r.onchange = () => { if (!k.live) { p[k.id] = +r.value; restart(); } };
    });
    $$('[data-tk]', card).forEach(b => {
      b.onclick = () => {
        const k = viz.knobs.find(q => q.id === b.dataset.tk);
        p[k.id] = !p[k.id];
        b.setAttribute('aria-pressed', String(p[k.id]));
        changed(k);
      };
    });
    $$('[data-act]', card).forEach(b => { b.onclick = () => { if (stage.paused) stage.setPaused(false); stage.ctx?.emit(b.dataset.act); }; });
    $('.viz-fs', card).onclick = async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await card.requestFullscreen(); } catch (e) { /* okvir ne dozvoljava */ }
    };
  }

  function codeHtml(c, i) {
    let h;
    try { h = hljs.highlight(c.src.trim(), { language: c.lang, ignoreIllegals: true }).value; } catch (e) { h = esc(c.src.trim()); }
    return `<figure class="code"><figcaption><span>${esc(c.t || LANG[c.lang] || '')}</span><button type="button" class="btn sm copy" data-i="${i}">${icon('copy')}<span>${T('Kopiraj', 'Copy')}</span></button></figcaption><pre><code class="hljs">${h}</code></pre></figure>`;
  }
  function hookCode(root, code) {
    $$('.copy', root).forEach(b => {
      b.onclick = async () => {
        const lab = $('span', b), src = code[+b.dataset.i].src.trim();
        try { await navigator.clipboard.writeText(src); lab.textContent = T('Kopirano', 'Copied'); }
        catch (e) {
          const r = document.createRange(); r.selectNodeContents($('pre', b.closest('.code')));
          const s = getSelection(); s.removeAllRanges(); s.addRange(r);
          lab.textContent = T('Označeno', 'Selected');
        }
        setTimeout(() => { lab.textContent = T('Kopiraj', 'Copy'); }, 1600);
      };
    });
  }
  const strip = s => String(s).replace(/[`*]/g, '');
  function tableHtml(tb, hx = 'h2', cls = 'sec') {
    return `<section class="${cls}"><${hx}>${esc(tb.title || T('Poređenje', 'Comparison'))}</${hx}><div class="scroll"><table class="stack"><thead><tr>${tb.head.map(h => `<th scope="col">${fmt(h)}</th>`).join('')}</tr></thead>
      <tbody>${tb.rows.map(r => `<tr>${r.map((c, i) => `<td data-l="${esc(strip(tb.head[i]))}"><span>${fmt(c)}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${tb.note ? `<p class="note">${fmt(tb.note)}</p>` : ''}</section>`;
  }
  const figsHtml = t => (t.figs || []).map((f, i) => `<figure class="sfig"><div class="fig" data-fig="${i}"><svg role="img" aria-label="${esc(strip(f.cap))}"></svg></div><figcaption>${fmt(f.cap)}</figcaption></figure>`).join('');
  function hookFigs(root, t) {
    $$('[data-fig]', root).forEach(box => {
      const f = t.figs[+box.dataset.fig], s = $('svg', box);
      const draw = () => { const W = s.clientWidth, H = s.clientHeight; if (!W || !H) return; s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.innerHTML = f.draw(W, H); };
      const ro = new ResizeObserver(draw);
      ro.observe(s);
      observers.push(ro);
    });
  }

  // ---------- stranice ----------
  function showTopic(t) {
    const i = IDX.get(t.id), prev = ORDER[i - 1], next = ORDER[i + 1], tab = TAB_OF.get(t.id);
    setTab(tab);
    crumbs([[tab.title, '#' + tab.id, true], [t.title]]);
    pn(prev, next);
    const tables = t.table ? [].concat(t.table) : [];
    $('#view').innerHTML = `<article class="topic pad"><div class="wrap">
      <header class="t-head"><h1>${esc(t.title)}</h1><p class="lede">${fmt(t.desc)}</p></header>
      ${vizCard(t.viz, t.id)}
      <section class="sec"><h2>${T('Ključno', 'Key points')}</h2><ul class="pts">${t.points.map(p => `<li>${fmt(p)}</li>`).join('')}</ul></section>
      ${figsHtml(t)}
      ${tables.map(tableHtml).join('')}
      ${t.code?.length ? `<section class="sec"><h2>${T('Primeri', 'Examples')}</h2>${t.code.map(codeHtml).join('')}</section>` : ''}
      ${t.pitfalls?.length ? `<section class="sec"><h2>${T('Zamke', 'Pitfalls')}</h2><ul class="pits">${t.pitfalls.map(p => `<li>${icon('triangle-alert')}<span>${fmt(p)}</span></li>`).join('')}</ul></section>` : ''}
      ${t.rel?.length ? `<section class="sec"><h2>${T('Povezano', 'Related')}</h2><div class="tiles rel">${t.rel.filter(id => byId.has(id)).map(id => tile(byId.get(id))).join('')}</div></section>` : ''}
      <nav class="pager" aria-label="${T('Susedne teme', 'Neighboring topics')}">${prev ? `<a href="#${prev.id}" class="pg prev">${icon('arrow-left')}<span><small>${T('Prethodna', 'Previous')}</small>${esc(prev.title)}</span></a>` : '<span></span>'}${next ? `<a href="#${next.id}" class="pg next"><span><small>${T('Sledeća', 'Next')}</small>${esc(next.title)}</span>${icon('arrow-right')}</a>` : ''}</nav>
    </div></article>`;
    const v = $('#view');
    if (t.code) hookCode(v, t.code);
    hookFigs(v, t);
    mountViz($('.viz', v), t.viz, t.id);
  }

  const SHAPES = {
    box: '<path d="M16 4 28 10 16 16 4 10Z" fill="currentColor" opacity=".95"/><path d="M4 10 16 16v12L4 22Z" fill="currentColor" opacity=".55"/><path d="M28 10 16 16v12l12-6Z" fill="currentColor" opacity=".75"/>',
    cyl: '<ellipse cx="16" cy="8" rx="11" ry="4" fill="#5aa9ff"/><path d="M5 8v15c0 2.2 4.9 4 11 4s11-1.8 11-4V8c0 2.2-4.9 4-11 4S5 10.2 5 8Z" fill="#5aa9ff" opacity=".7"/>',
    orb: '<circle cx="16" cy="16" r="12" fill="#e0115f" opacity=".25"/><circle cx="16" cy="16" r="7" fill="#e0115f"/>',
    tube: '<rect x="3" y="10" width="26" height="12" rx="6" fill="none" stroke="currentColor" stroke-width="2" opacity=".8"/><circle cx="12" cy="16" r="3" fill="#e0115f"/><circle cx="20" cy="16" r="3" fill="#5ec8ff"/>',
    plate: '<path d="M2 20 14 12h16L18 20Z" fill="none" stroke="#6b7a93" stroke-width="2"/><path d="M2 20 14 12h16L18 20Z" fill="#2a3140"/>',
    gate: '<rect x="6" y="9" width="3" height="18" fill="currentColor" opacity=".7"/><rect x="23" y="9" width="3" height="18" fill="currentColor" opacity=".7"/><rect x="5" y="7" width="22" height="3" fill="currentColor"/><ellipse cx="12" cy="4.5" rx="3" ry="1.4" fill="#ffd166"/><ellipse cx="20" cy="4.5" rx="3" ry="1.4" fill="#ffd166"/>',
    lane: '<path d="M3 9h26M3 16h26M3 23h26" stroke="#5aa9ff" stroke-width="2" opacity=".6"/><circle cx="10" cy="9" r="2.6" fill="#5aa9ff"/><circle cx="20" cy="16" r="2.6" fill="#5aa9ff"/><circle cx="14" cy="23" r="2.6" fill="#5aa9ff"/>',
    state: '<rect x="2" y="11" width="8" height="10" rx="2" fill="#3ddc97"/><rect x="12" y="11" width="8" height="10" rx="2" fill="#ffd166"/><rect x="22" y="11" width="8" height="10" rx="2" fill="#ff4d6d"/>',
  };
  const shape = k => `<svg viewBox="0 0 32 32" aria-hidden="true">${SHAPES[k]}</svg>`;

  // ---------- početna: mapa oblasti; na prelaz mišem teme oblasti se rašire u krug oko nje ----------
  function roadmapHtml() {
    return `<div class="orb" id="orb">
      <p class="orb-hint">${icon('sparkles')}<span class="d">${T('Pređi mišem preko oblasti i njene teme se rašire oko nje.', 'Hover an area and its topics fan out around it.')}</span><span class="m">${T('Izaberi oblast da vidiš njene teme.', 'Pick an area to see its topics.')}</span></p>
      <svg class="orb-path" aria-hidden="true"><path class="base"/><path class="flow"/></svg>
      <ol class="orb-list">${TABS.map((tab, i) => {
        const ts = tabTopics(tab), nm = esc(tabName(tab));
        return `<li class="orb-n${ts.length ? '' : ' soon'}" style="--i:${i}">
          <a class="orb-core" href="#${tab.id}" aria-label="${nm}"><span class="orb-ring" aria-hidden="true"><i></i></span>${icon(tab.icon)}</a>
          <span class="orb-name"><b>${nm}</b><small>${ts.length ? `${ts.length} ${plural(ts.length)}` : T('u pripremi', 'coming soon')}</small></span>
          ${ts.length ? `<div class="orb-burst" role="group" aria-label="${T('Teme', 'Topics')}: ${nm}"><svg class="orb-rays" aria-hidden="true"></svg>${ts.map((t, k) => `<a class="orb-t" href="#${t.id}" style="--k:${k}"><span class="sym">${esc(t.sym)}</span><span class="tt">${esc(t.title)}</span></a>`).join('')}<a class="orb-t orb-all" href="#${tab.id}" style="--k:${ts.length}"><span class="tt">${T('Cela oblast', 'Whole area')}</span>${icon('arrow-right')}</a></div>` : ''}
        </li>`;
      }).join('')}</ol>
    </div>`;
  }
  // raspored: čvorovi niz blagu krivu, teme svake oblasti na luku kruga levo i desno od nje
  function layoutOrb(orb) {
    const W = orb.clientWidth, list = W < 760, nodes = $$('.orb-n', orb), svg = $('.orb-path', orb);
    orb.classList.toggle('list', list);
    if (list) { nodes.forEach(n => { n.style.left = n.style.top = ''; }); orb.style.height = ''; return; }
    const STEP = 150, TOP = 96, GAP = 46;
    orb.style.setProperty('--pw', Math.round(Math.max(150, Math.min(250, W / 2 - 250))) + 'px');
    const pts = [];
    nodes.forEach((n, i) => {
      const ts = $$('.orb-t:not(.orb-all)', n), mr = Math.ceil(ts.length / 2), ml = ts.length - mr;
      const R = Math.max(118, (Math.max(mr, ml) - 1) * GAP / 2 / .92);
      let wmax = 0, rays = `<circle class="orbit" r="${R.toFixed(1)}"/>`;
      ts.forEach((a, k) => {
        const right = k < mr, j = right ? k : k - mr, m = right ? mr : ml;
        const y = (right ? j - (m - 1) / 2 : (m - 1) / 2 - j) * GAP, x = Math.sqrt(Math.max(0, R * R - y * y)) * (right ? 1 : -1);
        a.classList.toggle('l', !right);
        a.style.setProperty('--x', x.toFixed(1) + 'px');
        a.style.setProperty('--y', y.toFixed(1) + 'px');
        wmax = Math.max(wmax, a.offsetWidth);
        rays += `<line pathLength="1" x1="0" y1="0" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" style="--k:${k}"/><circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" style="--k:${k}"/>`;
      });
      const rs = $('.orb-rays', n);
      if (rs) rs.innerHTML = rays;
      const half = R + 20 + wmax, amp = Math.max(0, W / 2 - half - 10);
      const x = W / 2 + Math.max(-amp, Math.min(amp, Math.sin(i * 1.25 + .5) * Math.min(130, W * .13))), y = TOP + i * STEP;
      n.style.left = x.toFixed(1) + 'px';
      n.style.top = y + 'px';
      n.style.setProperty('--hw', half.toFixed(0) + 'px');
      n.style.setProperty('--hh', (R * .92 + 34).toFixed(0) + 'px');
      pts.push([x, y]);
    });
    const H = TOP + (nodes.length - 1) * STEP + 120;
    orb.style.height = H + 'px';
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let d = `M${pts[0][0].toFixed(1)},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      d += ` C${x0.toFixed(1)},${y0 + STEP * .55} ${x1.toFixed(1)},${y1 - STEP * .55} ${x1.toFixed(1)},${y1}`;
    }
    $$('path', svg).forEach(p => p.setAttribute('d', d));
  }
  let orbOpen = null, orbTimer = 0, orbPointer = 'mouse';
  function orbSet(n) {
    clearTimeout(orbTimer);
    if (orbOpen === n) return;
    orbOpen?.classList.remove('open');
    orbOpen = n;
    n?.classList.add('open');
    $('#orb')?.classList.toggle('has-open', !!n);
  }
  const orbLater = () => { clearTimeout(orbTimer); orbTimer = setTimeout(() => orbSet(null), 240); };
  function hookOrb() {
    const orb = $('#orb');
    if (!orb) return;
    orbOpen = null;
    orb.classList.add('js');
    orb.addEventListener('pointerdown', e => { orbPointer = e.pointerType; });
    for (const n of $$('.orb-n', orb)) {
      if (n.classList.contains('soon')) continue;
      const hover = e => e.pointerType === 'mouse' && !orb.classList.contains('list');
      n.addEventListener('pointerenter', e => { if (hover(e)) orbSet(n); });
      n.addEventListener('pointerleave', e => { if (hover(e)) orbLater(); });
      n.addEventListener('focusin', () => { if (!orb.classList.contains('list')) orbSet(n); });
      n.addEventListener('focusout', e => { if (!n.contains(e.relatedTarget)) orbLater(); });
      // dodir ili uzak raspored: prvi dodir otvara teme; u širokom rasporedu drugi vodi na oblast, a u uskom zatvara
      const core = $('.orb-core', n);
      let wasOpen = false;
      core.addEventListener('pointerdown', () => { wasOpen = orbOpen === n; });
      core.addEventListener('click', e => {
        const list = orb.classList.contains('list');
        if (!list && orbPointer === 'mouse') return;
        const opened = e.detail === 0 ? orbOpen === n : wasOpen;
        if (!opened) { e.preventDefault(); orbSet(n); }
        else if (list) { e.preventDefault(); orbSet(null); }
      });
    }
    // čvorovi se pojavljuju dok se skroluje
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.closest('.orb-n').classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    $$('.orb-core', orb).forEach(c => io.observe(c));
    let raf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => layoutOrb(orb)); });
    ro.observe(orb);
    observers.push(io, ro);
    layoutOrb(orb);
  }
  document.addEventListener('pointerdown', e => { if (orbOpen && !orbOpen.contains(e.target)) orbSet(null); });

  function showHome() {
    setTab(null);
    crumbs([[T('Početna', 'Home')]]);
    pn(null, ORDER[0]);
    $('#view').innerHTML = `<section class="pad home"><div class="wrap">
      <header class="t-head"><h1>${T('Priručnik koncepata', 'Concept Handbook')}</h1>
      <p class="lede">${T(`Put kroz ${ORDER.length} tema u ${TABS.filter(t => tabTopics(t).length).length} oblasti: od mreže i skaliranja sistema, preko niti, poruka, baza i Kubernetes-a, do AI-ja i algoritama. Svaka tema ima scenu koja radi, ključne tačke, primere koda i zamke.`,
        `A route through ${ORDER.length} topics in ${TABS.filter(t => tabTopics(t).length).length} areas: from networking and scaling systems, through threads, messaging, databases and Kubernetes, to AI and algorithms. Every topic has a working scene, key points, code examples and pitfalls.`)}</p></header>
      ${roadmapHtml()}
      <section class="sec legend-sec"><h2>${T('Kako čitati scene', 'How to read the scenes')}</h2>
        <p class="note">${T('Isti oblici i boje znače isto u svakoj temi.', 'The same shapes and colors mean the same thing in every topic.')}</p>
        <ul class="keys">${[
          ['box', 'Kocka', 'servis, proces, komponenta', 'Cube', 'service, process, component'],
          ['cyl', 'Valjak', 'baza, keš, skladište', 'Cylinder', 'database, cache, storage'],
          ['orb', 'Kugla', 'poruka ili zahtev; boja je identitet', 'Orb', 'message or request; color is identity'],
          ['tube', 'Cev', 'red, topic, stream, kanal', 'Tube', 'queue, topic, stream, channel'],
          ['plate', 'Ploča', 'granica: proces, čvor, region', 'Plate', 'boundary: process, node, region'],
          ['gate', 'Kapija i tokeni', 'lock, semafor, limit', 'Gate and tokens', 'lock, semaphore, limit'],
          ['lane', 'Traka', 'nit, particija, vremenska osa', 'Lane', 'thread, partition, timeline'],
          ['state', 'Bljesak', 'uspeh, čekanje, greška', 'Flash', 'success, waiting, error'],
        ].map(([k, a, b, ea, eb]) => `<li>${shape(k)}<span><b>${T(a, ea)}</b> ${T(b, eb)}</span></li>`).join('')}
        </ul>
        ${vizCard(legendViz, 'legend')}
      </section>
    </div></section>`;
    hookOrb();
    mountViz($('.viz', $('#view')), legendViz, 'legend');
  }

  function showTab(tab, secId) {
    setTab(tab);
    crumbs([[tabName(tab)]]);
    const ti = TABS.indexOf(tab);
    pn(...around(tab));
    stage.detach();
    const row = t => `<li><a class="drow" href="#${t.id}"><span class="tsym">${esc(t.sym)}</span><span><b>${esc(t.title)}</b><span class="dd">${fmt(t.desc, true)}</span></span></a></li>`;
    const nb = (o, cls, lab) => o ? `<a href="#${o.id}" class="pg ${cls}">${cls === 'prev' ? icon('arrow-left') : ''}<span><small>${lab}</small>${esc(tabName(o))}</span>${cls === 'next' ? icon('arrow-right') : ''}</a>` : '<span></span>';
    $('#view').innerHTML = `<section class="pad"><div class="wrap dom">
      <header class="t-head"><h1>${esc(tabName(tab))}</h1><p class="lede">${fmt(tab.blurb)}</p></header>
      ${tab.sections.length ? tab.sections.map(s => `<section class="sec" id="s-${s.id}"><h2>${esc(s.title)}</h2><ol class="dlist">${s.topics.map(id => row(byId.get(id))).join('')}</ol></section>`).join('')
        : `<div class="soon-box">${icon(tab.icon)}<p>${T('Još nema tema u ovoj oblasti.', 'No topics in this area yet.')}</p></div>`}
      <nav class="pager" aria-label="${T('Susedne oblasti', 'Neighboring areas')}">${nb(TABS[ti - 1], 'prev', T('Prethodna oblast', 'Previous area'))}${nb(TABS[ti + 1], 'next', T('Sledeća oblast', 'Next area'))}</nav>
    </div></section>`;
    if (secId) { const el = document.getElementById('s-' + secId); if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start' })); }
  }

  // ---------- System design: jedna stranica, simulacija na vrhu, delovi ispod ----------
  let spyLock = 0, sysCur = null;
  function isSys(h) { return !!SYS && (h === SYS.id || !!byId.get(h)?.part || SM.get(h) === SYS); }
  function navTo(id) { if (location.hash === '#' + id) sysGo(id, true); else location.hash = id; }
  function partHtml(t, ci) {
    const tables = t.table ? [].concat(t.table) : [];
    return `<section class="part" id="p-${t.id}" aria-labelledby="h-${t.id}">
      <header class="part-h"><span class="tsym" aria-hidden="true">${esc(t.sym)}</span><h3 id="h-${t.id}">${esc(t.title)}</h3>
        ${t.focus ? `<button type="button" class="btn foc" data-focus="${t.focus}">${icon('crosshair')}<span>${T('Pokaži u simulaciji', 'Show in simulation')}</span></button>` : ''}</header>
      <p class="part-d">${fmt(t.desc)}</p>
      ${t.points?.length ? `<ul class="pts">${t.points.map(x => `<li>${fmt(x)}</li>`).join('')}</ul>` : ''}
      ${tables.map(tb => tableHtml(tb, 'h4', 'ptab')).join('')}
      ${(t.code || []).map((c, i) => codeHtml(c, ci + i)).join('')}
      ${t.sim ? `<p class="part-sim"><b>${T('U simulaciji', 'In the simulation')}</b><span>${fmt(t.sim)}</span></p>` : ''}
      ${t.rel?.length ? `<p class="part-rel"><span>${T('Detaljnije:', 'More detail:')}</span>${t.rel.filter(id => byId.has(id)).map(id => `<a href="#${id}">${esc(byId.get(id).title)}</a>`).join('')}</p>` : ''}
    </section>`;
  }
  // putanja i susedi za trenutni deo stranice
  function sysSet(id) {
    if (sysCur === id) return;
    sysCur = id;
    const t = byId.get(id);
    if (t?.part) {
      crumbs([[tabName(SYS), '#' + SYS.id, true], [t.title]]);
      const i = IDX.get(id);
      pn(ORDER[i - 1], ORDER[i + 1]);
    } else { crumbs([[tabName(SYS)]]); pn(...around(SYS)); }
    markCurrent();
  }
  function sysGo(id, smooth) {
    const t = byId.get(id), soft = smooth && !REDUCED ? 'smooth' : 'auto';
    const el = t?.part ? $('#p-' + id) : SM.get(id) === SYS ? $('#s-' + id) : null;
    sysSet(t?.part ? id : SYS.id);
    spyLock = performance.now() + (soft === 'smooth' ? 1100 : 200);
    if (el) {
      el.scrollIntoView({ behavior: soft, block: 'start' });
      if (t?.part) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
    } else window.scrollTo({ top: 0, behavior: soft });
  }
  function focusSim(key) {
    const card = $('#view .viz');
    if (!card) return;
    spyLock = performance.now() + 1100;
    history.replaceState(null, '', '#' + SYS.id);
    sysSet(SYS.id);
    card.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: key === 'chart' ? 'end' : 'start' });
    setTimeout(() => {
      if (key === 'chart') { const c = $('.viz-chart', card); if (c) { c.classList.remove('hit'); void c.offsetWidth; c.classList.add('hit'); } }
      else { if (stage.paused) stage.setPaused(false); stage.ctx?.emit('focus', key); }
    }, REDUCED ? 0 : 500);
  }
  // dok se skroluje, adresa i meni prate deo koji je pri vrhu ekrana
  function startSpy() {
    const parts = $$('#view .part');
    let raf = 0;
    const check = () => {
      raf = 0;
      if (performance.now() < spyLock || !$('#view .sys')) return;
      const line = innerHeight * .35;
      let cur = null;
      for (const el of parts) { if (el.getBoundingClientRect().top <= line) cur = el; else break; }
      const id = cur ? cur.id.slice(2) : SYS.id;
      if ('#' + id !== location.hash) { history.replaceState(null, '', '#' + id); sysSet(id); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    addEventListener('scroll', onScroll, { passive: true });
    observers.push({ disconnect() { removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); } });
  }
  function showSystem(target) {
    setTab(SYS);
    const ti = TABS.indexOf(SYS), code = [];
    const nb = (o, cls, lab) => o ? `<a href="#${o.id}" class="pg ${cls}">${cls === 'prev' ? icon('arrow-left') : ''}<span><small>${lab}</small>${esc(tabName(o))}</span>${cls === 'next' ? icon('arrow-right') : ''}</a>` : '<span></span>';
    const secs = SYS.sections.map(s => `<section class="sec sys-sec" id="s-${s.id}" aria-labelledby="sh-${s.id}"><h2 id="sh-${s.id}">${esc(s.title)}</h2>${s.topics.map(id => {
      const t = byId.get(id), ci = code.length;
      code.push(...(t.code || []));
      return partHtml(t, ci);
    }).join('')}</section>`).join('');
    $('#view').innerHTML = `<article class="pad sys"><div class="wrap">
      <header class="t-head"><h1>${esc(tabName(SYS))}</h1><p class="lede">${T('Pusti zahteve kroz sistem i gledaj kako se pune CPU i memorija. Kad sistem počne da pada, skaliraj ga vertikalno (veća instanca) ili horizontalno (više instanci), uključi rate limiter ili keš. Klik na komponentu u sceni vodi na njen opis ispod.', 'Send requests through the system and watch CPU and memory fill up. When the system starts to fail, scale it vertically (a bigger instance) or horizontally (more instances), or turn on the rate limiter or cache. Clicking a component in the scene takes you to its description below.')}</p></header>
      ${vizCard(sysViz, SYS.id)}
      <nav class="sys-toc" aria-label="${T('Delovi stranice', 'Page sections')}">${SYS.sections.map(s => `<a href="#${s.id}">${icon(s.icon)}<span>${esc(s.title)}</span></a>`).join('')}</nav>
      ${secs}
      <nav class="pager" aria-label="${T('Susedne oblasti', 'Neighboring areas')}">${nb(TABS[ti - 1], 'prev', T('Prethodna oblast', 'Previous area'))}${nb(TABS[ti + 1], 'next', T('Sledeća oblast', 'Next area'))}</nav>
    </div></article>`;
    const v = $('#view');
    hookCode(v, code);
    mountViz($('.viz', v), sysViz, SYS.id);
    $$('[data-focus]', v).forEach(b => { b.onclick = () => focusSim(b.dataset.focus); });
    startSpy();
    if (target && target !== SYS.id) requestAnimationFrame(() => sysGo(target, false)); else sysSet(SYS.id);
  }

  function route() {
    closeSkills(false);
    const h = decodeURIComponent(location.hash.slice(1));
    document.body.classList.remove('nav-open');
    hideFly(true);
    if (isSys(h) && $('#view .sys')) { sysGo(h, true); return; }   // ista stranica: samo skrol, simulacija radi dalje
    observers.forEach(o => o.disconnect());
    observers = [];
    sysCur = null;
    window.scrollTo(0, 0);
    if (isSys(h)) showSystem(h);
    else if (byId.has(h)) showTopic(byId.get(h));
    else if (TM.has(h)) showTab(TM.get(h));
    else if (SM.has(h)) showTab(SM.get(h), h);
    else if (DM.has(h)) showTab(DOM_TAB.get(h));
    else showHome();
    markCurrent();
    const cur = $('#toc a.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  // ---------- pokretanje ----------
  $('#toc').addEventListener('click', e => {
    const b = e.target.closest('[data-x]');
    if (!b) return;
    const id = b.dataset.x;
    if (opened.has(id)) { opened.delete(id); manual.delete(id); if (auto === id) auto = null; } else { opened.add(id); manual.add(id); }
    renderToc(); markCurrent();
    $(`[data-x="${id}"]`)?.focus();
  });
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href^="#"]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const h = decodeURIComponent(a.getAttribute('href').slice(1));
    if (h && '#' + h === location.hash && isSys(h) && $('#view .sys')) { e.preventDefault(); document.body.classList.remove('nav-open'); sysGo(h, true); }
  });
  q.addEventListener('input', () => search(q.value));
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const a = $$('#toc a[data-t]')[0]; if (a) { location.hash = a.getAttribute('href'); q.blur(); } }
  });
  $('#menu').addEventListener('click', () => document.body.classList.toggle('nav-open'));

  // statični tekst iz index.html na engleskom
  if (lang === 'en') {
    for (const el of $$('[data-en]')) el.innerHTML = el.dataset.en;
    for (const el of $$('[data-en-aria]')) el.setAttribute('aria-label', el.dataset.enAria);
    for (const el of $$('[data-en-ph]')) el.placeholder = el.dataset.enPh;
    for (const el of $$('[data-en-tip]')) el.dataset.tip = el.dataset.enTip;
    document.title = 'Concept Handbook';
  }
  // jezik: EN prevodi na engleski, SR vraća na srpski (latinica); stranica se ponovo učitava na izabranom jeziku
  const lb = $('#lang');
  lb.textContent = lang === 'en' ? 'SR' : 'EN';
  lb.setAttribute('aria-label', lang === 'en' ? 'Prebaci na srpski' : 'Switch to English');
  lb.title = lb.getAttribute('aria-label');
  lb.addEventListener('click', () => setLang(lang === 'en' ? 'sr' : 'en'));

  // tema: izbor se pamti; bez izbora važi tema okruženja ili sistema
  $('#tema').addEventListener('click', () => {
    const th = theme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.tema = th;
    ls.set(TKEY, th);
    markTheme();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', markTheme);
  new MutationObserver(markTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-tema'] });

  // uzak meni: samo ikonice, a teme oblasti iskaču pored ikonice
  const isMini = () => document.documentElement.classList.contains('mini');
  const wide = matchMedia('(min-width: 1100px)');
  function setMini(on) {
    document.documentElement.classList.toggle('mini', on);
    ls.set(MKEY, on ? 'uzak' : 'sirok');
    const f = $('#fold');
    f.setAttribute('aria-expanded', String(!on));
    f.setAttribute('aria-label', on ? T('Proširi meni', 'Expand menu') : T('Skupi meni', 'Collapse menu'));
    if (on) f.dataset.tip = T('Proširi meni', 'Expand menu'); else delete f.dataset.tip;
    if (on && q.value) { q.value = ''; search(''); }
    hideFly(true);
  }
  $('#fold').addEventListener('click', () => setMini(!isMini()));
  $('#qbtn').addEventListener('click', () => { setMini(false); q.focus(); });
  const fly = $('#fly');
  let flyFor = null, flyT = 0;
  function showFly(a) {
    if (!isMini() || !wide.matches) return;
    clearTimeout(flyT);
    if (flyFor === a && !fly.hidden) return;
    flyFor = a;
    const tab = a.dataset.tab ? TM.get(a.dataset.tab) : null;
    if (tab && tabTopics(tab).length) {
      fly.className = 'fly tree-fly';
      fly.innerHTML = `<a class="fly-h" href="#${tab.id}">${esc(tabName(tab))}<span class="n">${tabTopics(tab).length}</span></a>${tree(tab)}`;
      const h = '#' + decodeURIComponent(location.hash.slice(1));
      $$('a', fly).forEach(x => x.classList.toggle('cur', x.getAttribute('href') === h));
    } else {
      fly.className = 'fly tip-fly';
      fly.textContent = a.dataset.tip || (tab ? `${tabName(tab)} (u pripremi)` : a.textContent.trim());
    }
    fly.hidden = false;
    const r = a.getBoundingClientRect(), sr = $('.sb').getBoundingClientRect(), fh = fly.offsetHeight;
    const top = tab && tabTopics(tab).length ? r.top - 6 : r.top + r.height / 2 - fh / 2;
    fly.style.left = Math.round(sr.right + 10) + 'px';
    fly.style.top = Math.round(Math.max(12, Math.min(top, innerHeight - fh - 12))) + 'px';
  }
  function hideFly(now) {
    clearTimeout(flyT);
    const h = () => { fly.hidden = true; flyFor = null; };
    if (now) h(); else flyT = setTimeout(h, 180);
  }
  const tipEl = e => e.target.closest?.('[data-tab],[data-tip]');
  $('#side').addEventListener('mouseover', e => { const a = tipEl(e); if (a) showFly(a); });
  $('#side').addEventListener('mouseout', e => { if (!fly.contains(e.relatedTarget)) hideFly(); });
  $('#side').addEventListener('focusin', e => { const a = tipEl(e); if (a) showFly(a); });
  $('#side').addEventListener('focusout', e => { if (!fly.contains(e.relatedTarget)) hideFly(); });
  fly.addEventListener('mouseover', () => clearTimeout(flyT));
  fly.addEventListener('mouseleave', () => hideFly());
  fly.addEventListener('click', e => { if (e.target.closest('a')) hideFly(true); });
  wide.addEventListener?.('change', () => hideFly(true));
  setMini(isMini());
  $('#scrim').addEventListener('click', () => document.body.classList.remove('nav-open'));
  document.addEventListener('keydown', e => {
    const tg = e.target, tag = (tg.tagName || '').toLowerCase();
    const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || tg.isContentEditable;
    if (e.key === '/' && !typing) { e.preventDefault(); if (isMini()) setMini(false); document.body.classList.add('nav-open'); q.focus(); return; }
    if (e.key === 'Escape') {
      hideFly(true);
      if (tg === q && q.value) { q.value = ''; search(''); }
      else { q.blur(); document.body.classList.remove('nav-open'); }
      return;
    }
    if (typing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const to = e.key === 'ArrowLeft' ? adj.prev : e.key === 'ArrowRight' ? adj.next : null;
    if (to) location.hash = to;
  });
  // ---------- Skillset: iskačući prozor sa radarom oblasti ----------
  const skm = $('#skm');
  let skmRo = null, skmBack = null;
  function openSkills() {
    const areas = TABS.map(tab => ({ title: tab.title, level: levelOf(tab.id) }));
    skm.innerHTML = `<div class="modal-back" data-close></div>
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="skm-h">
        <header class="modal-h"><div><h2 id="skm-h">Skillset</h2><p>${T('Nivo znanja po oblastima iz mape, od 1 do 5.', 'Knowledge level for each roadmap area, from 1 to 5.')}</p></div>
          <button class="btn ic modal-x" type="button" data-close aria-label="${T('Zatvori', 'Close')}">${icon('x')}</button></header>
        <div class="sk-fig"><svg role="img" aria-label="${T('Radar znanja po oblastima', 'Knowledge radar by area')}"></svg></div>
        <ol class="sk-levels">${LEVELS.map((l, i) => `<li><b>${i + 1}</b>${esc(l)}</li>`).join('')}</ol>
        ${areas.some(a => a.level) ? '' : `<p class="sk-empty">${T('Nivoi još nisu popunjeni. Kad odlučimo kako se popunjavaju, ovde će se pojaviti oblik znanja.', 'Levels are not filled in yet. Once we decide how they are filled, the shape of your knowledge will appear here.')}</p>`}
      </section>`;
    skm.hidden = false;
    document.documentElement.classList.add('modal-on');
    const svg = $('.sk-fig svg', skm);
    skmRo = new ResizeObserver(() => drawSkills(svg, areas));
    skmRo.observe(svg);
    skmBack = document.activeElement;
    $('.modal-x', skm).focus();
  }
  function closeSkills(refocus = true) {
    if (skm.hidden) return;
    skm.hidden = true;
    skm.innerHTML = '';
    skmRo?.disconnect();
    skmRo = null;
    document.documentElement.classList.remove('modal-on');
    if (refocus) (skmBack || $('#skills')).focus?.();
  }
  $('#skills').addEventListener('click', openSkills);
  skm.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSkills(); });
  skm.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.stopPropagation(); closeSkills(); }
    else if (e.key === 'Tab') { e.preventDefault(); $('.modal-x', skm).focus(); }   // jedino dugme u prozoru zadržava fokus
    e.stopPropagation();
  });

  window.addEventListener('hashchange', route);
  markTheme();
  route();
}
