// i18n.js — jezik priručnika: srpski (latinica) ili engleski.
// Jezik se bira pri učitavanju; promena jezika ponovo učitava stranicu, pa se sav tekst gradi na novom jeziku.
const KEY = 'prirucnik.jezik', NAME = /prirucnik-jezik=(en|sr)/;

function read() {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'en' || v === 'sr') return v;
  } catch { /* skladište nije dostupno */ }
  const m = NAME.exec(window.name || '');
  return m ? m[1] : 'sr';
}

export const lang = read();
document.documentElement.lang = lang === 'en' ? 'en' : 'sr-Latn';

// tekst za interfejs: T('srpski', 'English')
export const T = (sr, en) => (lang === 'en' && en != null ? en : sr);

// broj sa decimalama po pravilu jezika: 1,5 ili 1.5
export const dec = (v, d = 1) => (lang === 'en' ? v.toFixed(d) : v.toFixed(d).replace('.', ','));
// zaokružen broj bez nepotrebne nule: 2,5 / 2.5 / 3
export const dec1 = v => { const s = String(Math.round(v * 10) / 10); return lang === 'en' ? s : s.replace('.', ','); };
// hiljade: 12 000 ili 12,000
export const grp = v => String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, lang === 'en' ? ',' : '\u00a0');

export function setLang(l) {
  let saved = false;
  try { localStorage.setItem(KEY, l); saved = localStorage.getItem(KEY) === l; } catch { /* skladište nije dostupno */ }
  // bez skladišta izbor preživljava ponovno učitavanje kroz ime prozora
  if (!saved) window.name = (window.name || '').replace(NAME, '').trim() + ' prirucnik-jezik=' + l;
  location.reload();
}

// ugrađeni prevodi (build ih ubacuje umesto srpskih niski i šablona, v. tools/i18n.mjs)
export const __L = (sr, en) => (lang === 'en' ? en : sr);
export const __LT = (sr, en, ...v) => (lang === 'en' ? en : sr).replace(/\{(\d+)\}/g, (m, i) => v[+i]);
