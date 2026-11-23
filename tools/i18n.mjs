// tools/i18n.mjs — prevod priručnika na engleski.
// Pri buildu se srpski tekst iz izvornih fajlova menja izrazom koji bira jezik, a engleski prevod se ugrađuje direktno
// (prevodi su u i18n/en/*.json, ključ je kratak heš srpskog teksta). Tekst bez prevoda ostaje kakav jeste.
//   node tools/i18n.mjs extract   -> build/i18n/*.todo.txt: srpski tekst koji još nema prevod
//   node tools/i18n.mjs check     -> broj prevedenih i neprevedenih ključeva po fajlu
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import MagicString from 'magic-string';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const FILES = [
  'src/tabs.js', 'src/domains.js', 'src/legend.js', 'src/sysviz.js', 'src/viz.js',
  ...fs.readdirSync(path.join(ROOT, 'src/topics')).filter(f => f.endsWith('.js') && f !== 'index.js').sort().map(f => 'src/topics/' + f),
];
export const idOf = key => crypto.createHash('sha1').update(key).digest('hex').slice(0, 10);

const LETTER = /[A-Za-zČĆŠŽĐčćšžđ]/;
// vrednosti ovih svojstava su identifikatori, ne tekst za čitaoca
const SKIP_PROP = new Set(['id', 'd', 'icon', 'lang', 'cls', 'side', 'rel', 'topics', 'page', 'domains', 'kind', 'href', 'lpos', 'ease', 'world', 'sym', 'tags']);
const COMMENT = { csharp: ['//'], typescript: ['//'], javascript: ['//'], json: ['//'], bash: ['#'], yaml: ['#'], sql: ['--'], xml: ['<!--'] };

// komentari u primeru koda: [{ text, start, end }] gde su start/end granice teksta komentara u src
export function codeComments(src, lang) {
  const out = [], marks = COMMENT[lang];
  if (!marks) return out;
  let off = 0;
  for (const ln of src.split('\n')) {
    for (const mk of marks) {
      let i = -1;
      if (mk === '//') {
        const m = /(^|[\s;,(){}\]])\/\/\/?(?=\s)/.exec(ln);
        if (m) i = m.index + m[1].length;
      } else if (mk === '#') {
        const m = /(^|\s)#(?=\s)/.exec(ln);
        if (m) i = m.index + m[1].length;
      } else if (mk === '--') {
        const m = /(^|\s)--(?=\s)/.exec(ln);
        if (m) i = m.index + m[1].length;
      } else if (mk === '<!--') i = ln.indexOf('<!--');
      if (i < 0) continue;
      let a = i + (ln.startsWith('///', i) ? 3 : mk.length), b = ln.length;
      if (mk === '<!--') { const e = ln.indexOf('-->', a); if (e > 0) b = e; }
      while (a < b && /\s/.test(ln[a])) a++;
      while (b > a && /\s/.test(ln[b - 1])) b--;
      const text = ln.slice(a, b);
      if (LETTER.test(text)) out.push({ text, start: off + a, end: off + b });
      break;
    }
    off += ln.length + 1;
  }
  return out;
}
// srpski tekst u niskama unutar primera koda ("Greška u obradi"), bez identifikatora i adresa
const SRW = /[čćšžđČĆŠŽĐ]|\b(je|i|se|da|na|u|za|ili|od|do|nije|bez|sa|po|ne|samo|nema|ako|koji|kad|kako|gde|šta|Pitanje|Kontekst)\b/;
export function codeStrings(src, lang) {
  if (!COMMENT[lang] || lang === 'yaml' || lang === 'bash') return [];
  const out = [];
  for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) {
    const t = m[1];
    if (/[A-Za-zčćšžđ]{3,}/.test(t) && SRW.test(t) && !/^[\w.\/:#{}-]+$/.test(t)) out.push({ text: t, start: m.index + 1, end: m.index + 1 + t.length });
  }
  return out;
}
export function translateCode(src, lang, dict) {
  if (lang === 'plaintext') return dict.get(idOf(src)) ?? null;
  const cs = [...codeComments(src, lang), ...codeStrings(src, lang)].sort((a, b) => a.start - b.start);
  let out = '', last = 0, hit = false;
  for (const c of cs) {
    const en = dict.get(idOf(c.text));
    if (en == null) continue;
    out += src.slice(last, c.start) + en;
    last = c.end;
    hit = true;
  }
  return hit ? out + src.slice(last) : null;
}

const cooked = q => q.value.cooked ?? q.value.raw;
// prolaz kroz jedan fajl: niske sa tekstom, primeri koda i njihov kontekst
export function scan(file, code) {
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const helpers = new Map();   // const cs = (t, src) => ({ t, lang: 'csharp', src })
  walk.simple(ast, {
    VariableDeclarator(n) {
      const f = n.init;
      if (n.id.type !== 'Identifier' || f?.type !== 'ArrowFunctionExpression' || f.params.length !== 2) return;
      const body = f.body.type === 'ObjectExpression' ? f.body : null;
      const lp = body?.properties.find(p => p.key?.name === 'lang' && p.value.type === 'Literal');
      if (lp && body.properties.some(p => p.key?.name === 'src')) helpers.set(n.id.name, lp.value.value);
    },
  });
  const items = [], propKeys = new Set();
  const ctxOf = (node, anc) => {
    const p = anc[anc.length - 2], g = anc[anc.length - 3];
    if (!p) return '';
    if (p.type === 'Property' && p.value === node) return 'prop:' + (p.key.name ?? p.key.value);
    if (p.type === 'CallExpression') {
      const callee = code.slice(p.callee.start, p.callee.end);
      return 'call:' + callee + '#' + p.arguments.indexOf(node);
    }
    if (p.type === 'ArrayExpression' && g?.type === 'Property') return 'arr:' + (g.key.name ?? g.key.value) + '#' + p.elements.indexOf(node);
    if (p.type === 'ArrayExpression' && g?.type === 'ArrayExpression') return 'arr2#' + p.elements.indexOf(node);
    return p.type;
  };
  const visit = (node, anc) => {
    const p = anc[anc.length - 2];
    if (!p) return;
    if (p.type === 'Property' && p.key === node && !p.computed) return;
    if (p.type === 'MethodDefinition' || p.type === 'PropertyDefinition') { if (p.key === node) return; }
    if (/^(Import|Export)/.test(p.type)) return;
    if (p.type === 'TaggedTemplateExpression') return;
    if (p.type === 'MemberExpression' && p.property === node) return;
    if (node.type === 'Literal' && typeof node.value !== 'string') return;
    // TemplateLiteral unutar ${} se obrađuje posebno; ovde samo čvorovi koji su sami niska
    const ctx = ctxOf(node, anc);
    if (p.type === 'Property' && SKIP_PROP.has(p.key.name ?? p.key.value)) return;
    let key, exprs = [];
    if (node.type === 'Literal') key = node.value;
    else {
      if (node.quasis.some(q => /\{\d+\}/.test(cooked(q)))) return;
      key = node.quasis.map((q, i) => cooked(q) + (i < node.expressions.length ? `{${i}}` : '')).join('');
      exprs = node.expressions;
    }
    if (!LETTER.test(key)) return;
    // primer koda: drugi argument pomoćne funkcije (cs, sh, txt...) ili svojstvo src uz lang
    let codeLang = null;
    if (p.type === 'CallExpression' && p.callee.type === 'Identifier' && helpers.has(p.callee.name) && p.arguments[1] === node) codeLang = helpers.get(p.callee.name);
    if (p.type === 'Property' && (p.key.name ?? p.key.value) === 'src') {
      const obj = anc[anc.length - 3], lp = obj?.properties?.find(q => (q.key?.name ?? q.key?.value) === 'lang' && q.value.type === 'Literal');
      codeLang = lp ? lp.value.value : 'plaintext';
    }
    items.push({ node, key, exprs, ctx, codeLang, line: node.loc.start.line });
  };
  walk.fullAncestor(ast, (node, state, anc) => {
    if (node.type === 'Literal' || node.type === 'TemplateLiteral') visit(node, anc);
    if (node.type === 'Property' && !node.computed) propKeys.add(node.key.name ?? node.key.value);
  });
  return { ast, items, propKeys };
}

// prevodi: i18n/en/*.txt, svaki unos je red "@<id>" pa engleski tekst do sledećeg "@<id>" (može u više redova)
export function loadDict() {
  const dir = path.join(ROOT, 'i18n/en'), dict = new Map();
  if (!fs.existsSync(dir)) return dict;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt')).sort()) {
    let id = null, buf = [];
    const flush = () => {
      if (!id) return;
      while (buf.length && !buf[buf.length - 1].trim()) buf.pop();
      if (dict.has(id) && dict.get(id) !== buf.join('\n')) console.warn(`i18n: ${f} menja prevod ${id}`);
      dict.set(id, buf.join('\n'));
    };
    for (const ln of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      const m = /^@([0-9a-f]{10})\s*$/.exec(ln);
      if (m) { flush(); id = m[1]; buf = []; } else if (id) buf.push(ln);
    }
    flush();
  }
  return dict;
}

// build: srpski tekst sa prevodom postaje __L('srpski', 'English'), a šablon __LT('srpski {0}', 'English {0}', izraz)
export function transform(file, code, dict, report) {
  const { items, propKeys } = scan(file, code);
  const ms = new MagicString(code);
  let n = 0;
  const lit = JSON.stringify;
  for (const it of items) {
    const { node } = it;
    if (it.codeLang) {
      if (node.type === 'TemplateLiteral' && node.expressions.length) continue;
      const src = node.type === 'Literal' ? node.value : cooked(node.quasis[0]);
      const en = translateCode(src, it.codeLang, dict);
      if (en == null) continue;
      ms.overwrite(node.start, node.end, `__L(${code.slice(node.start, node.end)}, ${lit(en)})`);
      n++;
      continue;
    }
    const en = dict.get(idOf(it.key));
    if (en == null) continue;
    if (propKeys.has(it.key) && report) report.push(`${file}:${it.line} prevedena niska "${it.key}" je i ime svojstva`);
    if (!it.exprs.length) ms.overwrite(node.start, node.end, `__L(${code.slice(node.start, node.end)}, ${lit(en)})`);
    else {
      // izrazi ostaju na svom mestu (u njima može biti još prevoda); menjaju se samo delovi šablona
      ms.overwrite(node.start, it.exprs[0].start, `__LT(${lit(it.key)}, ${lit(en)}, `);
      for (let i = 1; i < it.exprs.length; i++) ms.overwrite(it.exprs[i - 1].end, it.exprs[i].start, ', ');
      ms.overwrite(it.exprs[it.exprs.length - 1].end, node.end, ')');
    }
    n++;
  }
  if (!n) return code;
  const rel = path.relative(path.dirname(path.join(ROOT, file)), path.join(ROOT, 'src/i18n.js')).replace(/\\/g, '/');
  ms.prepend(`import { __L, __LT } from '${rel.startsWith('.') ? rel : './' + rel}';\n`);
  return ms.toString();
}

// esbuild dodatak
export const i18nPlugin = (report = []) => ({
  name: 'i18n',
  setup(b) {
    const dict = loadDict(), set = new Set(FILES.map(f => path.join(ROOT, f)));
    b.onLoad({ filter: /\.js$/ }, args => {
      if (!set.has(args.path)) return null;
      const code = fs.readFileSync(args.path, 'utf8');
      return { contents: transform(path.relative(ROOT, args.path), code, dict, report), loader: 'js' };
    });
  },
});

// ---------- komandna linija ----------
const SR = /[čćšžđČĆŠŽĐ]|\b(je|i|se|da|na|u|za|ili|od|do|koji|koja|kad|što|nije|bez|sa|po|pa|ali|kroz|iz|ne|još|samo|sve|isti|ista|dok|posle|pre|kao|ga|ih|već|tek|jer|ovde|nema)\b/i;
// šta ide na spisak za prevod: tekst za čitaoca, ne identifikatori, CSS klase, boje i id-jevi tema
const DISPLAY = /^(call:(x\.say|x\.label|x\.chip|x\.legend|[\w.]*\.set|[\w.]*\.text|x\.stat#1|x\.box|x\.db|x\.plate|x\.orb)|prop:(label|title|name|gen|blurb|desc|text|cap|note|say|t|aria|unit)|arr:(points|pitfalls|head|options#1|rows)|arr2#)/;
function worth(key, ctx) {
  if (/^arr:(topics|rel|tags)#/.test(ctx)) return false;
  if (/^(#|rgba?\(|hsla?\(|https?:|--|data:)/.test(key.trim())) return false;
  if (/[čćšžđČĆŠŽĐ]/.test(key)) return true;
  const t = key.replace(/<[^>]*>/g, ' ').replace(/\{\d+\}/g, ' ').replace(/[*`]/g, '').trim();
  const words = t.match(/[A-Za-z]{2,}/g) || [];
  if (!words.length) return false;
  if (/^\s|\s$/.test(key)) return true;                 // deo rečenice koji se lepi uz drugi tekst
  if (/\s/.test(t)) return true;                         // više reči
  if (/^[A-Z][a-z]+$/.test(t)) return true;               // jedna reč sa velikim slovom: Klijent, Baza
  if (t !== key.trim() && /^[A-Za-z]{3,}$/.test(t)) return true;   // reč u oznakama: Klijenti<small>{0}</small>
  return DISPLAY.test(ctx) && /^[a-z]{3,}$/i.test(t);
}
function todo() {
  const dict = loadDict(), seen = new Set();
  fs.mkdirSync(path.join(ROOT, 'build/i18n'), { recursive: true });
  let total = 0, words = 0;
  for (const f of FILES) {
    const code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const { items } = scan(f, code);
    const rows = [];
    const add = (key, ctx, line, kind) => {
      const id = idOf(key);
      if (dict.has(id) || seen.has(id)) return;
      seen.add(id);
      rows.push(`@${id} ${kind}${ctx ? ' ' + ctx : ''} L${line}\n${key}`);
      words += key.split(/\s+/).length;
    };
    for (const it of items) {
      if (it.codeLang === 'plaintext') { if (SR.test(it.key)) add(it.key, 'blok', it.line, 'code'); continue; }
      if (it.codeLang) {
        for (const c of codeComments(it.key, it.codeLang)) add(c.text, it.codeLang, it.line, 'komentar');
        for (const c of codeStrings(it.key, it.codeLang)) add(c.text, it.codeLang, it.line, 'niska-u-kodu');
        continue;
      }
      if (!worth(it.key, it.ctx)) continue;
      add(it.key, it.ctx, it.line, it.exprs.length ? 'šablon' : 'niska');
    }
    total += rows.length;
    fs.writeFileSync(path.join(ROOT, 'build/i18n', path.basename(f, '.js') + '.todo.txt'), rows.join('\n\n') + '\n');
    console.log(f.padEnd(30), rows.length);
  }
  console.log('ukupno', total, 'ključeva,', words, 'reči');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  if (process.argv[2] === 'extract') todo();
  else if (process.argv[2] === 'check') {
    const report = [], dict = loadDict();
    for (const f of FILES) transform(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), dict, report);
    console.log(report.join('\n') || 'bez sudara');
  } else if (process.argv[2] === 'id') for (const k of process.argv.slice(3)) console.log('@' + idOf(k) + '  ' + JSON.stringify(k));
  else console.log('node tools/i18n.mjs extract|check|id "tekst"');
}
