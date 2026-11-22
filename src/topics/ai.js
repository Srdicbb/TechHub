import { dec } from '../i18n.js';
// AI i LLM
const cs = (t, src) => ({ t, lang: 'csharp', src });
const txt = (t, src) => ({ t, lang: 'plaintext', src });

export default [
  // ------------------------------------------------------------------ Embeddings
  {
    id: 'embeddings', d: 'ai', sym: 'Em', title: 'Embeddings i semantička pretraga',
    tags: ['embedding', 'vektor', 'vector search', 'kosinusna sličnost', 'cosine similarity', 'knn', 'hnsw', 'semantička pretraga', 'azure sql vector'],
    desc: 'Embedding model pretvara tekst u vektor od nekoliko stotina ili hiljada brojeva, tako da tekstovi sličnog značenja budu blizu. Pretraga po značenju je onda traženje najbližih vektora.',
    points: [
      'Sličnost se meri kosinusom ugla između vektora: 1 znači isti smer (isto značenje), 0 nepovezano.',
      'Isti model mora da se koristi i za dokumente i za upit: vektori različitih modela nisu uporedivi.',
      'Tačna pretraga upoređuje upit sa svim vektorima (O(n)); indeksi poput HNSW nalaze približno najbliže za delić vremena.',
      'Embedding hvata značenje, ne tačne reči: "kuče" nalazi "pas", ali šifru artikla bolje nalazi klasična pretraga. Hibridna pretraga spaja oba.',
      'Prikaz je 3D projekcija; pravi vektori imaju stotine dimenzija (npr. 1 536).',
    ],
    code: [
      cs('C# · Microsoft.Extensions.AI: vektor i sličnost', `
IEmbeddingGenerator<string, Embedding<float>> generator = /* Azure OpenAI, Ollama... */;

ReadOnlyMemory<float> a = await generator.GenerateVectorAsync("Kako da vratim porudžbinu?");
ReadOnlyMemory<float> b = await generator.GenerateVectorAsync("Povraćaj robe i novca");

float similarity = TensorPrimitives.CosineSimilarity(a.Span, b.Span);   // blizu 1 = slično značenje`),
      cs('C# · k najbližih, bez indeksa', `
var top = docs
    .Select(d => (d.Text, Score: TensorPrimitives.CosineSimilarity(query.Span, d.Vector.Span)))
    .OrderByDescending(x => x.Score)
    .Take(5)
    .ToList();`),
      { t: 'SQL · vektorska pretraga u Azure SQL', lang: 'sql', src: `
SELECT TOP (5) Id, Title,
       VECTOR_DISTANCE('cosine', Embedding, @queryVector) AS Distance
FROM dbo.Articles
ORDER BY Distance;            -- manja kosinusna distanca = sličnije` },
    ],
    pitfalls: [
      'Promena embedding modela znači ponovno računanje svih vektora.',
      'Predugačak tekst u jednom vektoru razvodni značenje: deli ga na delove (chunking).',
    ],
    rel: ['rag', 'agents', 'hash-table'],
    viz: {
      knobs: [{ id: 'k', label: 'Najbližih (k)', min: 1, max: 5, value: 3 }],
      build(x) {
        const { C, V } = x, k = x.p.k;
        x.view({ dir: [1, .75, 1.35], persp: true, autoRotate: true, fov: 40, pad: .72 });
        const sQ = x.stat('q', 'Upit', '–', { color: C.mag });
        // četiri grupe u pravcima tetraedra; reči u grupi su blizu po uglu (kosinusu)
        const cats = [
          ['Životinje', C.cat[0], V(1, 1, 1), ['mačka', 'pas', 'zec', 'konj', 'papagaj']],
          ['Hrana', C.cat[1], V(-1, 1, -1), ['pasta', 'sir', 'hleb', 'pica', 'jabuka']],
          ['Programiranje', C.cat[2], V(-1, -1, 1), ['C#', 'Angular', 'Kubernetes', 'SQL', 'bug']],
          ['Sport', C.cat[3], V(1, -1, -1), ['trčanje', 'plivanje', 'fudbal', 'tenis', 'košarka']],
        ];
        x.legend(cats.map(([n, c]) => [c, n]));
        const SL = [[0, 0, 0], [1, 0, .5], [-1, 0, -.5], [0, 1.4, .35], [0, -1.4, -.35]], R = 4, TH = .5;
        const frame = d => { d = d.clone().normalize(); const u = V().crossVectors(d, V(0, 1, 0)).normalize(); return [d, u, V().crossVectors(d, u)]; };
        const dirAt = ([d, u, v], a, b) => {
          const t = Math.hypot(a, b) * TH;
          if (t < 1e-9) return d.clone();
          const w = u.clone().multiplyScalar(a).addScaledVector(v, b).normalize();
          return d.clone().multiplyScalar(Math.cos(t)).addScaledVector(w, Math.sin(t));
        };
        const pts = [], tc = {};
        for (const [, col, dir, words] of cats) {
          const F = frame(dir);
          words.forEach((w, j) => {
            const [a, b, r] = SL[j], p = dirAt(F, a, b).multiplyScalar(R + r);
            pts.push({ w, p, m: x.chip(col, { round: true, s: .34, at: p, fit: true, glow: .4, label: w }) });
            tc[w] = [F, a, b];
          });
        }
        x.chip(C.white, { round: true, s: .22, at: [0, 0, 0], fit: true, label: '0' });
        // reči su niske (ne ključevi objekta), pa prevod menja i reči u oblaku i reči u upitu isto
        const Q = [['kuče', [['pas', .75], ['mačka', .25]]], ['lazanje', [['pasta', .6], ['sir', .4]]], ['TypeScript', [['Angular', .65], ['C#', .35]]],
          ['maraton', [['trčanje', .8], ['plivanje', .2]]], ['mače', [['mačka', .8], ['zec', .2]]], ['testenina', [['pasta', .8], ['hleb', .2]]]];
        const cos = (a, b) => a.dot(b) / (a.length() * b.length());
        const f2 = v => dec(v, 2);
        x.spawn(async () => {
          let i = 0;
          while (x.alive) {
            const [word, mix] = Q[i++ % Q.length];
            let qa = 0, qb = .25, F;
            for (const [w, wt] of mix) { F = tc[w][0]; qa += tc[w][1] * wt; qb += tc[w][2] * wt; }
            const qp = dirAt(F, qa, qb).multiplyScalar(R + .2);
            sQ.set(word);
            const o = x.orb(C.mag, { r: .3, label: word, lcls: 'tag mag' });
            const tmp = [];
            await x.move(o, [V(0, 0, 0), qp], 5);
            tmp.push(x.line([V(0, 0, 0), qp], C.mag, { opacity: .9, nofit: true }));
            const ranked = pts.map(p => ({ ...p, s: cos(qp, p.p) })).sort((a, b) => b.s - a.s);
            const top = ranked.slice(0, k);
            for (const t of top) {
              tmp.push(x.line([qp, t.p], C.sky, { opacity: .9, nofit: true }));
              tmp.push(x.line([V(0, 0, 0), t.p], C.sky, { opacity: .35, nofit: true }));
              t.m.lbl.set(`${t.w} ${f2(t.s)}`);
              t.m.lbl.el.className = 'lbl lbl-tag lbl-ok';
              await x.wait(.35);
            }
            x.say(`Upit **${word}**: najbliži po kosinusnoj sličnosti su ${top.map(t => `${t.w} (${f2(t.s)})`).join(', ')}. Poklapanje je po značenju, ne po slovima.`);
            await x.wait(4);
            for (const t of top) { t.m.lbl.set(t.w); t.m.lbl.el.className = 'lbl lbl-tag'; }
            tmp.forEach(l => x.remove(l));
            x.remove(o);
            await x.wait(.5);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ RAG
  {
    id: 'rag', d: 'ai', sym: 'Rg', title: 'RAG: odgovori iz tvojih dokumenata',
    tags: ['rag', 'retrieval augmented generation', 'chunking', 'vektorska baza', 'prompt', 'kontekst', 'llm', 'citati', 'hibridna pretraga', 'reranking'],
    desc: 'Retrieval-Augmented Generation: pre nego što model odgovori, sistem pronađe relevantne delove tvojih dokumenata i ubaci ih u prompt. Model tako odgovara iz tvojih podataka i može da navede izvor.',
    points: [
      'Indeksiranje (unapred): dokumenti se dele na delove (chunk), svaki dobija embedding i ide u vektorsku bazu.',
      'Upit: pitanje dobija embedding, baza vraća k najsličnijih delova, a oni idu u prompt kao kontekst.',
      'Kvalitet zavisi najviše od pretrage: sa lošim delovima i najbolji model odgovara pogrešno.',
      'Hibridna pretraga (vektori i ključne reči) i reranking podižu preciznost.',
      'Uputstvo modelu "odgovaraj samo iz konteksta, inače reci da ne znaš" smanjuje izmišljanje.',
    ],
    code: [
      cs('C# · Indeksiranje', `
foreach (var doc in documents)
foreach (var chunk in TextChunker.Split(doc.Text, maxTokens: 400, overlap: 50))   // sopstveni helper
{
    var vector = await embeddings.GenerateVectorAsync(chunk, cancellationToken: ct);
    await store.UpsertAsync(new Chunk(doc.Id, chunk, vector), ct);
}`),
      cs('C# · Pitanje: pretraga pa prompt', `
var q = await embeddings.GenerateVectorAsync(question, cancellationToken: ct);
var hits = await store.SearchAsync(q, top: 4, ct);

var context = string.Join("\\n---\\n", hits.Select(h => $"[{h.DocId}] {h.Text}"));
List<ChatMessage> messages =
[
    new(ChatRole.System, "Odgovaraj samo na osnovu konteksta i navedi [izvor]. Ako odgovora nema u kontekstu, reci da ne znaš."),
    new(ChatRole.User, $"Kontekst:\\n{context}\\n\\nPitanje: {question}")
];
ChatResponse answer = await chat.GetResponseAsync(messages, cancellationToken: ct);`),
      txt('Šta model zapravo dobija', `
[system] Odgovaraj samo na osnovu konteksta i navedi [izvor] ...
[user]   Kontekst:
         [pravilnik-3] Robu možete vratiti u roku od 14 dana od prijema ...
         ---
         [faq-7] Povraćaj novca se obrađuje u roku od 5 radnih dana ...

         Pitanje: Kako da vratim robu i kad dobijam novac?`),
    ],
    pitfalls: [
      'Ceo dokument u prompt "za svaki slučaj": skupo, sporo, a model se gubi u višku.',
      'Bez provere prava pristupa pri pretrazi korisnik dobija odgovor iz dokumenta koji ne sme da vidi.',
    ],
    rel: ['embeddings', 'agents', 'cache-aside'],
    viz: {
      build(x) {
        const { C, V } = x;
        x.plate({ at: [0, 0, -3.2], w: 23.6, d: 3.6, color: C.sky, label: 'Indeksiranje (unapred)', lpos: 'front' });
        x.plate({ at: [0, 0, 2.6], w: 23.6, d: 4.4, color: C.mag, label: 'Pitanje (svaki put)', lpos: 'front' });
        const names = ['Pravilnik', 'FAQ', 'Ugovor'];
        const docs = names.map((n, i) => x.box({ at: [-10.4, 0, -4.2 + i * 1], size: [1.6, 1.2 - i * .1, .7], color: C.white, label: i === 1 ? 'Dokumenti' : null, side: 'left' }));
        const chunker = x.box({ at: [-5.4, 0, -3.2], size: [2.4, .8, 1.2], label: 'Deljenje na delove', side: 'in' });
        const emb = x.box({ at: [-2.2, 0, -.4], size: [2.4, .9, 1.3], color: C.sky, label: 'Embedding model', side: 'in' });
        const vdb = x.db({ at: [2.6, 0, -.4], r: 1.1, h: 1.2, color: C.cache, label: 'Vektorska baza' });
        const user = x.box({ at: [-10.2, 0, 2.6], size: [2.2, .9, 1.2], label: 'Korisnik', side: 'in' });
        const prompt = x.box({ at: [6.2, 0, 2.6], size: [2.4, .8, 1.2], color: C.white, label: 'Prompt', side: 'in' });
        const llm = x.box({ at: [10, 0, 2.6], size: [2.2, 1, 1.3], color: C.mag, label: 'LLM', side: 'in' });
        const stored = [];
        const sP = x.stat('p', 'Delova u bazi', 0, { color: C.cache });
        const index = async () => {
          x.say('**Indeksiranje**: dokumenti se dele na delove, svaki deo dobija vektor i ide u vektorsku bazu.');
          for (let d = 0; d < 3; d++) {
            for (let c = 0; c < 3; c++) {
              const col = C.cat[d];
              const ch = x.chip(col, { s: .36 });
              await x.move(ch, [docs[d].port('right'), chunker.port('left')], 16);
              await x.move(ch, [chunker.port('right'), emb.port('left')], 14);
              x.remove(ch);
              const o = x.orb(col, { r: .16, halo: false });
              const ang = stored.length / 9 * Math.PI * 2;
              const dst = vdb.port('top').add(V(Math.cos(ang) * .75, .2, Math.sin(ang) * .75));
              await x.move(o, [emb.port('right'), vdb.port('left'), dst], 14);
              stored.push({ o, d, src: `${names[d].toLowerCase()}-${c + 1}` });
              sP.set(stored.length);
            }
          }
        };
        const QS = [['Kako da vratim robu?', [0, 1]], ['Šta piše o raskidu ugovora?', [2, 0]]];
        const ask = async ([question, docIdx]) => {
          x.say(`Pitanje: **${question}** Prvo dobija svoj vektor istim embedding modelom.`);
          const q = x.orb(C.mag, { r: .26, label: question, lcls: 'tag mag' });
          await x.move(q, [user.port('right'), V(-4, .6, 2.6), emb.port('front')], 8);
          q.lbl.set('vektor pitanja');
          await x.move(q, [emb.port('right'), vdb.port('left', .2)], 8);
          q.lbl.visible = false;
          x.say('Vektorska baza vraća **3 najsličnija dela** (top-k).');
          const hits = stored.filter(s => docIdx.includes(s.d)).slice(0, 3);
          const flying = [];
          for (const h of hits) {
            h.o.scale.setScalar(1.8);
            const c = x.orb(h.o.color, { r: .2, label: `[${h.src}]` });
            c.position.copy(h.o.position);
            flying.push(x.move(c, [c.position.clone(), V(3.8, .7, 1.4), prompt.port('left', .2)], 6).then(() => c));
          }
          const cs2 = await Promise.all(flying);
          q.lbl.visible = true;
          await x.move(q, [vdb.port('left', .2), V(3.8, .9, 2.2), prompt.port('left', .5)], 8);
          x.say('Prompt = uputstvo + pronađeni delovi + pitanje. Tek sada ide modelu.');
          prompt.flash(C.mag, .6);
          await x.wait(.6);
          cs2.forEach(c => x.remove(c));
          hits.forEach(h => h.o.scale.setScalar(1));
          q.lbl.set('prompt');
          await x.move(q, [prompt.port('right'), llm.port('left')], 8);
          llm.flash(C.white, .8);
          await x.wait(.8);
          q.lbl.set(`odgovor + [${hits[0].src}]`);
          q.lbl.el.className = 'lbl lbl-tag lbl-ok';
          await x.move(q, [llm.port('front'), V(10, .6, 4.4), V(-10.2, .6, 4.4), user.port('front')], 9);
          x.say('Odgovor stiže sa **oznakom izvora**, pa korisnik može da proveri odakle je informacija.');
          x.remove(q);
          await x.wait(2);
        };
        x.spawn(async () => { await index(); let i = 0; while (x.alive) await ask(QS[i++ % QS.length]); });
      },
    },
  },

  // ------------------------------------------------------------------ Agenti
  {
    id: 'agents', d: 'ai', sym: 'Ag', title: 'Agent i pozivanje alata',
    tags: ['agent', 'tool calling', 'function calling', 'alati', 'llm', 'petlja', 'microsoft.extensions.ai', 'semantic kernel', 'prompt injection'],
    desc: 'Agent je petlja: model dobija zadatak i listu alata, odluči koji alat da pozove, aplikacija ga izvrši i vrati rezultat, i tako dok model ne da konačan odgovor.',
    points: [
      'Model ne izvršava alat: vraća ime funkcije i argumente, a tvoj kod je poziva i šalje rezultat nazad.',
      'Opis alata (ime, parametri, kratak opis) je deo prompta: dobar opis je pola posla.',
      'Petlja mora da ima granicu: najviše N koraka, budžet tokena i timeout.',
      'Alati koji menjaju stanje (plaćanje, brisanje) traže potvrdu korisnika ili uske dozvole.',
      'Beleži svaki korak (tracing): bez toga se ne vidi zašto je agent uradio to što je uradio.',
    ],
    code: [
      cs('C# · Microsoft.Extensions.AI sa alatima', `
IChatClient client = new ChatClientBuilder(innerClient)
    .UseFunctionInvocation()            // izvršava pozive alata u petlji
    .Build();

var options = new ChatOptions
{
    Tools =
    [
        AIFunctionFactory.Create(GetOrderStatus, "get_order_status", "Status porudžbine po broju"),
        AIFunctionFactory.Create(GetShippingEta, "get_shipping_eta", "Procena isporuke za porudžbinu")
    ]
};

var response = await client.GetResponseAsync("Gde je moja porudžbina 1042 i kad stiže?", options);
Console.WriteLine(response.Text);

static string GetOrderStatus(int orderId) => orders.Status(orderId);
static DateOnly GetShippingEta(int orderId) => shipping.Eta(orderId);`),
      txt('Jedan prolaz kroz petlju', `
1. korisnik:    "Gde je porudžbina 1042 i kad stiže?"
2. model:       poziv alata get_order_status(orderId: 1042)
3. aplikacija:  rezultat "poslata, kurir DExpress"
4. model:       poziv alata get_shipping_eta(orderId: 1042)
5. aplikacija:  rezultat 2026-11-24
6. model:       "Poslata je i stiže u utorak, 24. novembra."`),
    ],
    pitfalls: [
      'Rezultat alata se vraća u prompt: tekst spolja (e-mail, web stranica) može da sadrži uputstva i preusmeri agenta (prompt injection).',
      'Agent bez granice koraka može da vrti petlju i troši tokene.',
    ],
    rel: ['rag', 'embeddings', 'tracing'],
    viz: {
      build(x) {
        const { C, V } = x;
        const sK = x.stat('k', 'Korak petlje', '0 / 5', { color: C.mag });
        x.plate({ at: [0, 0, 0], w: 22, d: 9.6 });
        const user = x.box({ at: [-9.4, 0, 0], size: [2.2, .9, 1.3], label: 'Korisnik', side: 'in' });
        const app = x.box({ at: [-4, 0, 0], size: [2.8, 1, 1.4], color: C.sky, label: 'Aplikacija (petlja)', side: 'in' });
        const llm = x.box({ at: [1.6, 0, -2.8], size: [2.6, 1.1, 1.4], color: C.mag, label: 'Model', side: 'in' });
        const tools = ['get_order_status', 'get_shipping_eta', 'search_docs'].map((n, i) => x.box({ at: [7.4, 0, -2.8 + i * 2.8], size: [3.6, .8, 1.2], color: C.box, label: n, side: 'in' }));
        x.rail(user.port('right'), app.port('left'), { opacity: .3 });
        x.rail(app.port('right'), llm.port('left'), { opacity: .3 });
        tools.forEach(t => x.rail(app.port('right'), t.port('left'), { opacity: .25 }));
        const hop = async (from, to, label, col = C.white) => {
          const o = x.orb(col, { r: .22, label, lcls: col === C.mag ? 'tag mag' : 'tag' });
          await x.move(o, [from, to], 7);
          x.remove(o);
        };
        x.spawn(async () => {
          while (x.alive) {
            sK.set('0 / 5');
            x.say('Korisnik postavlja pitanje. Aplikacija ga šalje modelu **zajedno sa opisom alata**.');
            await hop(user.port('right'), app.port('left'), 'Gde je porudžbina 1042?', C.sky);
            await hop(app.port('right'), llm.port('left'), 'pitanje + alati');
            sK.set('1 / 5'); llm.flash(C.white, .6);
            x.say('Model ne zna gde je porudžbina, pa vraća **zahtev za poziv alata**: ime i argumente.');
            await hop(llm.port('left'), app.port('right'), 'get_order_status(1042)', C.mag);
            await hop(app.port('right'), tools[0].port('left'), '1042');
            tools[0].flash(C.ok, .6);
            x.say('**Aplikacija** izvršava alat (model to ne radi sam) i vraća rezultat modelu.');
            await hop(tools[0].port('left'), app.port('right'), 'poslata, DExpress', C.ok);
            await hop(app.port('right'), llm.port('left'), 'rezultat');
            sK.set('2 / 5'); llm.flash(C.white, .6);
            x.say('Model sada traži **drugi alat** za procenu isporuke.');
            await hop(llm.port('left'), app.port('right'), 'get_shipping_eta(1042)', C.mag);
            await hop(app.port('right'), tools[1].port('left'), '1042');
            tools[1].flash(C.ok, .6);
            await hop(tools[1].port('left'), app.port('right'), '2026-11-24', C.ok);
            await hop(app.port('right'), llm.port('left'), 'rezultat');
            sK.set('3 / 5'); llm.flash(C.white, .6);
            x.say('Model ima sve što mu treba i daje **konačan odgovor**. Petlja staje; da je stigla do 5 koraka, aplikacija bi je prekinula.');
            await hop(llm.port('left'), app.port('right'), 'odgovor', C.ok);
            await hop(app.port('left'), user.port('right'), 'stiže u utorak, 24. 11.', C.ok);
            user.flash(C.ok, .6);
            await x.wait(3);
          }
        });
      },
    },
  },
];
