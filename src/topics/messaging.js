// Poruke i brokeri
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Queue i topic
  {
    id: 'queue-vs-topic', d: 'messaging', sym: 'Qt', title: 'Queue i topic',
    tags: ['point-to-point', 'publish subscribe', 'pub/sub', 'service bus', 'rabbitmq', 'fan-out', 'competing consumers', 'pretplata', 'broker'],
    desc: '**Queue** isporučuje svaku poruku tačno jednom potrošaču, pa instance istog servisa dele posao. **Topic** šalje kopiju svakoj pretplati, pa različiti servisi reaguju na isti događaj.',
    points: [
      'Queue (point-to-point): poruka nestaje iz reda tek kad je jedan potrošač potvrdi (`Complete`, ack).',
      'Više instanci na istom queue-u su **competing consumers**: tako se obrada skalira horizontalno.',
      'Topic (publish/subscribe): svaka pretplata je zaseban red sa svojom kopijom poruke.',
      'Pretplata može da ima filter (npr. `Country = \'RS\'`), pa ne dobija svaka pretplata sve.',
      'Producer ne zna ko sluša topic: novi servis se pretplati i dobija događaje bez izmene producera.',
    ],
    table: {
      title: 'Poređenje',
      head: ['', 'Queue', 'Topic'],
      rows: [
        ['Ko dobija poruku', 'Tačno jedan potrošač', 'Svaka pretplata dobija kopiju'],
        ['Tipična poruka', 'Komanda: "obradi porudžbinu"', 'Događaj: "porudžbina je kreirana"'],
        ['Azure Service Bus', 'Queue', 'Topic + subscriptions'],
        ['RabbitMQ', 'Red na default exchange-u', 'Fanout ili topic exchange, red po servisu'],
        ['Skaliranje', 'Više instanci čita isti red', 'Više instanci čita istu pretplatu'],
      ],
    },
    code: [
      cs('C# · Azure Service Bus: slanje (isto za queue i topic)', `
await using var client = new ServiceBusClient(connectionString);
ServiceBusSender sender = client.CreateSender("orders"); // ime queue-a ili topica

var msg = new ServiceBusMessage(JsonSerializer.Serialize(order))
{
    MessageId = order.Id.ToString(),          // za detekciju duplikata
    Subject = "OrderCreated",
    ApplicationProperties = { ["Country"] = order.Country }
};
await sender.SendMessageAsync(msg);`),
      cs('C# · Worker na queue-u (competing consumers)', `
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 4,
    AutoCompleteMessages = false
});

processor.ProcessMessageAsync += async args =>
{
    var order = args.Message.Body.ToObjectFromJson<Order>();
    await billing.ChargeAsync(order, args.CancellationToken);
    await args.CompleteMessageAsync(args.Message);   // tek sada poruka nestaje
};
processor.ProcessErrorAsync += args =>
{
    logger.LogError(args.Exception, "Greška u obradi");
    return Task.CompletedTask;
};
await processor.StartProcessingAsync();`),
      cs('C# · Pretplata na topic sa filterom', `
var admin = new ServiceBusAdministrationClient(connectionString);
await admin.CreateSubscriptionAsync(
    new CreateSubscriptionOptions("orders", "email"),
    new CreateRuleOptions("SerbiaOnly", new SqlRuleFilter("Country = 'RS'")));

// svaki servis čita SVOJU pretplatu; sve instance tog servisa dele je
var emailProcessor = client.CreateProcessor("orders", "email");`),
    ],
    pitfalls: [
      'Topic bez ijedne pretplate tiho odbacuje poruke: nema greške, nema podataka.',
      'Ako svaka instanca istog servisa napravi svoju pretplatu, poruka se obradi onoliko puta koliko ima instanci. Instance jednog servisa dele jednu pretplatu.',
      'Kad više potrošača čita isti red, redosled nije garantovan. Ako je bitan, koristi sesije (`SessionId`) ili particije po ključu.',
    ],
    rel: ['load-leveling', 'kafka', 'delivery'],
    viz: {
      warm: 7,
      knobs: [{ id: 'n', label: 'Potrošača', min: 2, max: 4, value: 3 }],
      build(x) {
        const { C } = x, n = x.p.n, gap = 2.1, half = (n - 1) * gap / 2 + 1.3;
        const sent = x.stat('s', 'Poslato', 0);
        const lanes = [
          { z: -(half + .25), kind: 'queue', col: C.sky, names: ['Worker 1', 'Worker 2', 'Worker 3', 'Worker 4'], title: 'Queue: svaka poruka ide jednom workeru', st: x.stat('q', 'Isporuka iz queue-a', 0, { color: C.sky }) },
          { z: half + .25, kind: 'topic', col: C.pink, names: ['Email', 'Billing', 'Analytics', 'Audit'], title: 'Topic: svaka pretplata dobija kopiju', st: x.stat('t', 'Isporuka iz topica', 0, { color: C.pink }) },
        ];
        for (const L of lanes) {
          x.plate({ at: [1.6, 0, L.z], w: 21.6, d: half * 2, color: L.col, label: L.title });
          L.prod = x.box({ at: [-7.4, 0, L.z], size: [1.9, .9, 1.2], label: 'Producer', side: 'in' });
          L.tb = x.tube([-6.2, .55, L.z], [-.6, .55, L.z], { color: L.col });
          L.j = x.V(.6, .55, L.z);
          x.chip(L.col, { round: true, s: .44, at: L.j, fit: true, glow: .6 });
          x.rail(L.tb.b, L.j, { color: L.col });
          L.rr = 0;
          L.cons = L.names.slice(0, n).map((nm, i) => {
            const z = L.z + (i - (n - 1) / 2) * gap;
            const c = x.box({ at: [5, 0, z], size: [1.9, .9, 1.2], label: nm, side: 'in' });
            x.rail(L.j, c.port('left'), { color: L.col, opacity: .3 });
            c.inbox = []; c.z = z;
            return c;
          });
        }
        const deliver = (L, c, o) => {
          x.remove(o);
          c.flash(C.ok);
          L.st.add();
          const ch = x.chip(o.color, { round: true, s: .3 });
          c.inbox.push(ch);
          if (c.inbox.length > 7) x.remove(c.inbox.shift());
          c.inbox.forEach((m, k) => m.position.set(6.75 + k * .42, .45, c.z));
          x.pop(ch);
        };
        let k = 0;
        x.every(1.25, () => {
          const col = C.cat[k++ % C.cat.length];
          sent.add();
          for (const L of lanes) {
            x.spawn(async () => {
              const o = x.orb(col);
              L.prod.flash(C.sky, .35);
              await x.move(o, [L.prod.port('right'), L.tb.a, L.tb.b, L.j], [7, 3.2, 7]);
              if (L.kind === 'queue') {
                const c = L.cons[L.rr++ % n];
                await x.move(o, [L.j, c.port('left')], 7);
                deliver(L, c, o);
              } else {
                x.remove(o);
                await Promise.all(L.cons.map(async c => { const o2 = x.orb(col); await x.move(o2, [L.j, c.port('left')], 7); deliver(L, c, o2); }));
              }
            });
          }
        });
        x.say('Ista poruka (ista boja) ide u **queue** i u **topic**. U queue-u svaku boju dobije samo jedan worker, a u topicu kopiju dobije svaki pretplatnik.');
      },
    },
  },

  // ------------------------------------------------------------------ Load leveling
  {
    id: 'load-leveling', d: 'messaging', sym: 'Ll', title: 'Queue kao amortizer',
    tags: ['load leveling', 'backlog', 'competing consumers', 'autoscaling', 'keda', 'little', 'kapacitet', 'nalet', 'burst'],
    desc: 'Queue između dva servisa upija nalete. Producer šalje svojim tempom, a workeri obrađuju onoliko koliko mogu. Kad posla ima više od kapaciteta, raste red umesto broja grešaka.',
    points: [
      'Kapacitet je broj workera podeljen vremenom obrade jedne poruke. Ako stiže više od toga, red raste stalnom brzinom.',
      'Littleov zakon: prosečan broj poruka u sistemu = brzina dolaska × prosečno vreme zadržavanja (`L = λ · W`).',
      'Dužina reda i starost najstarije poruke su najbolji signali za autoskaliranje workera (KEDA, Azure Functions, Container Apps).',
      'Queue ne ubrzava obradu: preopterećenje pretvara u kašnjenje. Kašnjenje zato mora da ima granicu (TTL, alarm na starost poruke).',
    ],
    code: [
      { t: 'YAML · KEDA: skaliranje workera po dužini reda', lang: 'yaml', src: `
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: orders-worker
spec:
  scaleTargetRef:
    name: orders-worker        # Deployment koji se skalira
  minReplicaCount: 1
  maxReplicaCount: 20
  triggers:
    - type: azure-servicebus
      metadata:
        queueName: orders
        messageCount: "50"     # cilj: oko 50 poruka po replici
      authenticationRef:
        name: servicebus-auth` },
      cs('C# · Propusnost jedne instance', `
var processor = client.CreateProcessor("orders", new ServiceBusProcessorOptions
{
    MaxConcurrentCalls = 8,   // poruke koje jedna instanca obrađuje paralelno
    PrefetchCount = 16        // poruke unapred u memoriji: manje odlazaka do brokera
});`),
      cs('C# · Koliko čeka u redu', `
var admin = new ServiceBusAdministrationClient(connectionString);
QueueRuntimeProperties q = await admin.GetQueueRuntimePropertiesAsync("orders");

Console.WriteLine($"Aktivnih: {q.ActiveMessageCount}, u DLQ: {q.DeadLetterMessageCount}");`),
    ],
    pitfalls: [
      'Autoskaliranje bez gornje granice samo prebacuje problem: 50 novih workera može da obori bazu iza njih.',
      'Prefetch uz sporu obradu: zaključanim porukama u memoriji jedne instance istekne lock i vraćaju se u red.',
      'Red koji stalno raste nije amortizer nego curenje: kapacitet je trajno manji od dolaska.',
    ],
    rel: ['queue-vs-topic', 'hpa', 'channels'],
    viz: {
      warm: 4,
      knobs: [
        { id: 'rate', label: 'Dolazak', min: .5, max: 4, step: .5, value: 1.5, fmt: v => v + '/s' },
        { id: 'n', label: 'Workera', min: 1, max: 4, value: 2 },
      ],
      actions: [{ id: 'burst', label: 'Nalet od 15 poruka', icon: 'zap' }],
      build(x) {
        const { C, V } = x, n = x.p.n, rate = x.p.rate, T = 1.2, cap = n / T;
        const sQ = x.stat('b', 'U redu', 0, { color: C.wait });
        const sD = x.stat('d', 'Obrađeno', 0, { color: C.ok });
        x.stat('c', 'Kapacitet', cap.toFixed(1) + '/s');
        const depth = Math.max(5.4, n * 2.1 + 1.4);
        x.plate({ at: [0, 0, 0], w: 20.5, d: depth });
        const prod = x.box({ at: [-8.4, 0, 0], size: [1.9, .9, 1.2], label: 'Producer', side: 'in' });
        const tb = x.tube([-7.2, .55, 0], [1.6, .55, 0], { label: 'Queue', color: C.sky });
        const SL = 13, step = (tb.len - .5) / SL;
        const q = [];
        const more = x.label('', tb.a.clone().add(V(.4, .9, 0)), { cls: 'tag wait', nofit: true });
        more.visible = false;
        const layout = () => {
          q.forEach((o, i) => { o.visible = i < SL; o.userData.t = tb.b.clone().add(V(-(i + .5) * step - .25, 0, 0)); });
          more.visible = q.length > SL;
          more.set('+' + Math.max(0, q.length - SL));
          sQ.set(q.length);
        };
        x.tick(dt => { for (const o of q) if (o.userData.t) o.position.lerp(o.userData.t, Math.min(1, dt * 7)); });
        const cons = Array.from({ length: n }, (_, i) => {
          const z = (i - (n - 1) / 2) * 2.1;
          const c = x.box({ at: [6, 0, z], size: [1.9, .9, 1.2], label: `Worker ${i + 1}`, side: 'in' });
          x.rail(tb.b, c.port('left'), { opacity: .3 });
          return c;
        });
        let k = 0;
        const emit = () => x.spawn(async () => {
          const o = x.orb(C.cat[k++ % C.cat.length]);
          prod.flash(C.sky, .3);
          await x.move(o, [prod.port('right'), tb.a], 8);
          o.userData.t = null;
          q.push(o);
          layout();
        });
        x.every(1 / rate, emit);
        x.on('burst', () => { for (let i = 0; i < 15; i++) x.wait(i * .07).then(emit); });
        for (const c of cons) {
          x.spawn(async () => {
            while (x.alive) {
              if (!q.length) { await x.wait(.1); continue; }
              const o = q.shift();
              o.visible = true; o.userData.t = null;
              layout();
              await x.move(o, [o.position.clone(), tb.b, c.port('left')], 9);
              o.position.copy(c.port('top', .32));
              c.paint(C.wait);
              await x.wait(T);
              c.reset(); c.flash(C.ok); sD.add();
              x.remove(o);
            }
          });
        }
        const msg = () => {
          if (rate > cap + 1e-9) return `Stiže **${rate}/s**, a workeri obrađuju **${cap.toFixed(1)}/s**: red raste. Ništa se ne gubi, ali raste kašnjenje. Dodaj workera.`;
          if (q.length > 3) return `Red se prazni brzinom od oko **${(cap - rate).toFixed(1)}/s**. Queue je upio nalet umesto da obori servis.`;
          return 'Workeri stižu sve i poruke kratko čekaju. Pusti **nalet** ili pojačaj dolazak.';
        };
        x.every(1, () => x.say(msg()));
      },
    },
  },

  // ------------------------------------------------------------------ Kafka
  {
    id: 'kafka', d: 'messaging', sym: 'Kf', title: 'Kafka: particije i offseti',
    tags: ['event streaming', 'log', 'partition', 'particija', 'offset', 'consumer group', 'lag', 'replay', 'event hubs'],
    desc: 'Kafka čuva događaje u **logu podeljenom na particije**. Pročitana poruka se ne briše: svaka **consumer grupa** pamti svoj offset i čita svojim tempom, pa isti tok može da se pročita ponovo.',
    points: [
      'Particija je log u koji se samo dodaje (append-only). Redosled važi unutar particije, ne preko cele teme.',
      'Ključ poruke bira particiju (hash ključa), pa svi događaji jednog kupca ostaju u redosledu.',
      'Unutar grupe particiju čita najviše jedan consumer: više consumera nego particija znači da neki stoje besposleni.',
      'Različite grupe su nezavisne: svaka ima svoj offset i svoj zaostatak (lag).',
      'Offset može da se vrati unazad: ponovna obrada (replay) posle baga ili za novi servis.',
      'Azure Event Hubs podržava Kafka protokol: isti klijent, druga konfiguracija.',
    ],
    table: {
      title: 'Azure: koji servis za šta',
      head: ['', 'Service Bus', 'Event Hubs / Kafka', 'Event Grid'],
      rows: [
        ['Model', 'Broker poruka (queue, topic)', 'Log događaja (stream)', 'Rutiranje događaja (push)'],
        ['Posle čitanja', 'Poruka se briše', 'Ostaje do isteka retencije', 'Isporuči se i nestaje'],
        ['Redosled', 'Po sesiji', 'Po particiji', 'Nije garantovan'],
        ['Tipično', 'Komande, poslovni tokovi', 'Telemetrija, analitika, event sourcing', 'Reakcija na promene Azure resursa'],
      ],
    },
    code: [
      cs('C# · Confluent.Kafka: producer sa ključem', `
var config = new ProducerConfig
{
    BootstrapServers = "localhost:9092",
    Acks = Acks.All,             // čekaj potvrdu svih replika
    EnableIdempotence = true     // bez duplikata pri ponovnom slanju
};
using var producer = new ProducerBuilder<string, string>(config).Build();

await producer.ProduceAsync("orders", new Message<string, string>
{
    Key = order.CustomerId,      // isti kupac -> ista particija -> redosled
    Value = JsonSerializer.Serialize(order)
});`),
      cs('C# · Consumer u grupi, commit posle obrade', `
var config = new ConsumerConfig
{
    BootstrapServers = "localhost:9092",
    GroupId = "billing",
    AutoOffsetReset = AutoOffsetReset.Earliest,
    EnableAutoCommit = false
};
using var consumer = new ConsumerBuilder<string, string>(config).Build();
consumer.Subscribe("orders");

while (!ct.IsCancellationRequested)
{
    var record = consumer.Consume(ct);
    await HandleAsync(record.Message.Value);
    consumer.Commit(record);     // offset se pomera tek posle obrade
}`),
      { t: 'Shell · lag i premotavanje grupe', lang: 'bash', src: `
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --describe --group billing

# pročitaj sve ponovo od početka (grupa mora biti zaustavljena)
kafka-consumer-groups.sh --bootstrap-server localhost:9092 --group analytics \\
  --topic orders --reset-offsets --to-earliest --execute` },
    ],
    pitfalls: [
      'Broj particija ograničava paralelizam grupe. Kasnije povećanje menja raspored ključeva po particijama, pa redosled za stare ključeve puca.',
      'Vruć ključ (jedan kupac sa ogromnim brojem događaja) zaguši jednu particiju dok ostale miruju.',
      'Auto-commit pre završene obrade gubi poruke kad consumer padne.',
    ],
    rel: ['queue-vs-topic', 'delivery', 'consistent-hashing'],
    viz: {
      warm: 6,
      knobs: [{ id: 'n', label: 'Consumera u grupi Billing', min: 1, max: 4, value: 2 }],
      actions: [{ id: 'replay', label: 'Analytics: čitaj od početka', icon: 'rotate-ccw' }],
      build(x) {
        const { C, V } = x, n = x.p.n, P = 3, Z = [-2.6, 0, 2.6], X0 = -5.6, GAP = .8, WIN = 13;
        const KEYS = [['A', C.cat[0], 0], ['B', C.cat[1], 1], ['C', C.cat[2], 2], ['D', C.cat[3], 0]];
        const sN = x.stat('n', 'Zapisa', 0);
        const sA = x.stat('a', 'Lag Billing', 0, { color: C.sky });
        const sB = x.stat('b', 'Lag Analytics', 0, { color: C.pink });
        x.legend([[C.sky, 'offset Billing'], [C.pink, 'offset Analytics']]);
        const prod = x.box({ at: [-9.4, 0, 0], size: [1.9, .9, 1.2], label: 'Producer', side: 'in' });
        const logs = Z.map((z, p) => {
          x.plate({ at: [-.4, 0, z], w: 12.2, d: 1.5, color: C.edge, label: `Particija ${p}`, lpos: 'front' });
          return { z, recs: [], end: 0, base: 0, gA: 0, gB: 0 };
        });
        const posX = (L, off) => X0 + (off - L.base) * GAP;
        const mk = (col) => { const m = x.box({ at: [0, 0, 0], size: [.1, 1.05, 1.32], color: col, nofit: true }); m.o.material.emissive.set(col); m.o.material.emissiveIntensity = .5; return m; };
        logs.forEach(L => { L.mA = mk(C.sky); L.mB = mk(C.pink); });
        x.tick(dt => {
          const f = Math.min(1, dt * 8);
          for (const L of logs) {
            for (const r of L.recs) r.m.position.x += (posX(L, r.off) - r.m.position.x) * f;
            for (const [m, g] of [[L.mA, L.gA], [L.mB, L.gB]]) {
              const tx = posX(L, Math.max(g, L.base)) - GAP / 2;
              m.o.position.x += (tx - m.o.position.x) * f; m.o.position.z = L.z;
            }
          }
          sA.set(logs.reduce((s, L) => s + (L.end - L.gA), 0));
          sB.set(logs.reduce((s, L) => s + (L.end - L.gB), 0));
        });
        logs.forEach(L => { L.mA.o.position.set(posX(L, 0) - GAP / 2, .52, L.z); L.mB.o.position.set(posX(L, 0) - GAP / 2, .52, L.z); });
        // consumer grupa Billing: range assignor
        const per = Math.floor(P / n), extra = P % n;
        const billing = [];
        let p0 = 0;
        for (let i = 0; i < n; i++) {
          const cnt = per + (i < extra ? 1 : 0), parts = [];
          for (let j = 0; j < cnt; j++) parts.push(p0++);
          const z = parts.length ? parts.reduce((s, p) => s + Z[p], 0) / parts.length : 5;
          const c = x.box({ at: [7.4, 0, parts.length ? z : 5.2], size: [2, .8, 1.1], label: `Billing ${i + 1}${parts.length ? '' : ' (bez particije)'}`, side: 'in' });
          if (!parts.length) c.dim();
          c.parts = parts;
          billing.push(c);
        }
        const analytics = x.box({ at: [11.4, 0, 0], size: [2.2, .8, 1.1], label: 'Analytics', side: 'in' });
        x.label('Grupa Billing', [7.4, 1.2, -4.1], { cls: 'plate', color: C.sky, center: [.5, 1] });
        x.label('Grupa Analytics', [11.4, 1.2, -1.4], { cls: 'plate', color: C.pink, center: [.5, 1] });
        let tot = 0;
        x.every(.75, () => x.spawn(async () => {
          const [key, col, p] = x.pick(KEYS), L = logs[p];
          const o = x.orb(col, { label: key });
          prod.flash(C.sky, .3);
          const off = L.end++;
          await x.move(o, [prod.port('right'), V(-7.4, .55, L.z), V(posX(L, off), .55, L.z)], 9);
          x.remove(o);
          const m = x.chip(col, { s: .56, at: [posX(L, off), .3, L.z] });
          L.recs.push({ off, m });
          sN.set(++tot);
          if (L.end - L.base > WIN) {
            L.base = L.end - WIN;
            while (L.recs.length && L.recs[0].off < L.base) x.fadeOut(L.recs.shift().m, .25);
          }
        }));
        const read = async (L, which, c, speed) => {
          const g = which === 'A' ? 'gA' : 'gB';
          if (L[g] < L.base) L[g] = L.base;
          if (L[g] >= L.end) return false;
          const r = L.recs.find(rr => rr.off === L[g]);
          L[g]++;
          if (r) {
            const o = x.orb(r.m.color, { r: .17, halo: false });
            await x.move(o, [r.m.position.clone().add(V(0, .4, 0)), c.port('top', .2)], speed);
            x.remove(o);
            c.flash(which === 'A' ? C.sky : C.pink, .35);
          }
          return true;
        };
        for (const c of billing) {
          if (!c.parts.length) continue;
          x.spawn(async () => {
            let i = 0;
            while (x.alive) {
              const L = logs[c.parts[i++ % c.parts.length]];
              const did = await read(L, 'A', c, 16);
              await x.wait(did ? .25 : .08);
            }
          });
        }
        x.spawn(async () => {
          let i = 0;
          while (x.alive) {
            const did = await read(logs[i++ % P], 'B', analytics, 12);
            await x.wait(did ? .55 : .1);
          }
        });
        x.on('replay', () => {
          logs.forEach(L => { L.gB = L.base; });
          x.say('Analytics je vratio offset na početak: **isti zapisi se čitaju ponovo**, a Billing to ne primećuje jer ima svoj offset.');
        });
        x.say('Boja je ključ (kupac). Isti ključ uvek ide u **istu particiju**, pa redosled za kupca važi. Zapisi ostaju u logu i posle čitanja.');
      },
    },
  },

  // ------------------------------------------------------------------ Garancije isporuke
  {
    id: 'delivery', d: 'messaging', sym: 'Dg', title: 'Garancije isporuke',
    tags: ['at-most-once', 'at-least-once', 'exactly-once', 'idempotentnost', 'idempotency', 'inbox', 'duplikat', 'ack'],
    desc: 'Mreža i procesi padaju, pa sistem bira: rizikuje gubitak (**at-most-once**) ili duplikat (**at-least-once**). **Exactly-once** se u praksi gradi kao at-least-once plus idempotentna obrada.',
    points: [
      'At-most-once: potvrda (ack) pre obrade. Pad posle potvrde znači izgubljenu poruku.',
      'At-least-once: potvrda posle obrade. Pad pre potvrde znači da ista poruka stiže ponovo.',
      'Idempotentnost: ponovljena obrada ne menja rezultat. Najčešće preko tabele obrađenih ID-jeva (inbox) u istoj transakciji sa efektom.',
      'Neke operacije su idempotentne same po sebi: "postavi status na Plaćeno", upsert po ključu. Nisu: "dodaj 100 na stanje", "pošalji e-mail".',
    ],
    table: {
      title: 'Tri garancije',
      head: ['Garancija', 'Kada ide ack', 'Pri padu', 'Kad je u redu'],
      rows: [
        ['At-most-once', 'Pre obrade', 'Poruka se gubi', 'Metrike, logovi, telemetrija'],
        ['At-least-once', 'Posle obrade', 'Duplikat', 'Podrazumevano za poslovne događaje'],
        ['Effectively once', 'Posle obrade, uz proveru ID-ja', 'Duplikat se prepozna i preskoči', 'Novac, zalihe, sve što ne sme dvaput'],
      ],
    },
    code: [
      cs('C# · Idempotentan handler sa inbox tabelom (EF Core)', `
public async Task HandleAsync(PaymentRequested evt, CancellationToken ct)
{
    await using var tx = await db.Database.BeginTransactionAsync(ct);

    if (await db.Inbox.AnyAsync(m => m.MessageId == evt.MessageId, ct))
        return;                                 // već obrađeno: samo potvrdi

    db.Payments.Add(new Payment(evt.OrderId, evt.Amount));
    db.Inbox.Add(new InboxMessage(evt.MessageId, DateTime.UtcNow));

    await db.SaveChangesAsync(ct);              // efekat i ID zajedno
    await tx.CommitAsync(ct);
}`),
      cs('C# · Service Bus: detekcija duplikata pri slanju', `
await admin.CreateQueueAsync(new CreateQueueOptions("payments")
{
    RequiresDuplicateDetection = true,
    DuplicateDetectionHistoryTimeWindow = TimeSpan.FromMinutes(10)
});

// isti MessageId poslat dvaput u prozoru od 10 minuta: drugi se odbacuje
await sender.SendMessageAsync(new ServiceBusMessage(body) { MessageId = paymentId });`),
      { t: 'SQL · jedinstveni ključ kao poslednja odbrana', lang: 'sql', src: `
CREATE TABLE Inbox (
    MessageId    UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    ProcessedAt  DATETIME2        NOT NULL
);
-- drugi INSERT istog MessageId pada sa greškom 2627: duplikat je uhvaćen` },
    ],
    pitfalls: [
      'Detekcija duplikata na brokeru štiti od dvostrukog **slanja**, ne od dvostruke **obrade** posle pada potrošača.',
      'Provera "postoji li" pa upis, bez transakcije i jedinstvenog ključa: dve paralelne obrade obe prođu proveru.',
      'Spoljni API (e-mail, plaćanje) ne ulazi u tvoju transakciju. Pošalji mu idempotency key ako ga podržava.',
    ],
    rel: ['retry-dlq', 'outbox', 'kafka'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Režim', value: 'alo', options: [['amo', 'At-most-once'], ['alo', 'At-least-once'], ['idem', 'Idempotentno']] },
        { id: 'fail', label: 'Šansa pada', min: 0, max: 60, step: 5, value: 35, fmt: v => v + '%' },
      ],
      build(x) {
        const { C, V } = x, mode = x.p.mode, pf = x.p.fail / 100;
        const sS = x.stat('s', 'Poslato', 0);
        const sL = x.stat('l', 'Izgubljeno', 0, { color: C.err });
        const sD = x.stat('d', 'Duplikata', 0, { color: C.wait });
        const sO = x.stat('o', 'Tačno jednom', 0, { color: C.ok });
        x.plate({ at: [1.2, 0, .3], w: 22.4, d: 8.2, label: { amo: 'Ack pre obrade', alo: 'Ack posle obrade', idem: 'Ack posle obrade + inbox tabela' }[mode] });
        const prod = x.box({ at: [-8.9, 0, -1.2], size: [1.9, .9, 1.2], label: 'Producer', side: 'in' });
        const tb = x.tube([-7.7, .55, -1.2], [-2.6, .55, -1.2], { label: 'Broker' });
        const cons = x.box({ at: [-.2, 0, -1.2], size: [2.2, 1, 1.3], label: 'Consumer', side: 'in' });
        const pay = x.db({ at: [4.6, 0, -1.2], label: 'Naplate' });
        x.rail(cons.port('right'), pay.port('left'), { opacity: .35 });
        let inbox = null;
        if (mode === 'idem') {
          inbox = x.db({ at: [-.2, 0, 2.5], r: .62, h: .8, color: C.cache, label: 'Inbox: obrađeni ID' });
          x.rail(cons.port('front'), inbox.port('back'), { opacity: .35 });
        }
        const rows = [];
        const addPay = (col, id, dup) => {
          const ch = x.chip(col, { s: .42, label: dup ? `#${id} opet` : `#${id}`, lcls: dup ? 'tag err' : 'tag' });
          rows.push(ch);
          if (rows.length > 10) x.remove(rows.shift());
          rows.forEach((m, i) => m.position.set(6.6 + (i % 5) * 1.05, .21, -2.3 + Math.floor(i / 5) * 1.3));
          x.pop(ch);
        };
        const ack = () => x.spawn(async () => {
          const a = x.orb(C.ok, { r: .15, halo: false, label: 'ack', lcls: 'tag ok' });
          await x.move(a, [cons.port('left', .35), tb.b.clone().add(V(0, .35, 0))], 8);
          x.remove(a);
        });
        const seen = new Set(), eff = {};
        let id = 0;
        x.spawn(async () => {
          while (x.alive) {
            const my = ++id, col = C.cat[my % C.cat.length];
            sS.add();
            eff[my] = 0;
            const o = x.orb(col, { label: '#' + my });
            prod.flash(C.sky, .3);
            await x.move(o, [prod.port('right'), tb.a, tb.b], [8, 5]);
            for (let attempt = 1; x.alive; attempt++) {
              await x.move(o, [tb.b, cons.port('left')], 6);
              if (mode === 'amo') {
                x.say(`#${my}: consumer **odmah potvrđuje** (ack) i broker briše poruku.`);
                ack();
                await x.wait(.5);
                if (x.rnd() < pf) {
                  cons.flash(C.err, .9);
                  x.say(`Pad pre obrade: #${my} je **izgubljena**. Broker misli da je obrađena.`);
                  sL.add();
                  await x.fadeOut(o, .5);
                  break;
                }
                await x.move(o, [cons.port('right'), pay.port('left')], 7);
                addPay(col, my, false); pay.flash(C.ok); sO.add();
                x.remove(o);
                break;
              }
              const dup = seen.has(my);
              if (mode === 'idem' && dup) {
                inbox.flash(C.wait, .8);
                x.say(`#${my} je već u inbox tabeli: obrada se **preskače**, ide samo ack.`);
                await x.wait(.8);
              } else {
                x.say(attempt > 1 ? `#${my} stiže **ponovo** i obrađuje se još jednom.` : `#${my}: prvo obrada, pa ack.`);
                const e = x.orb(col, { r: .2, halo: false });
                await x.move(e, [cons.port('right'), pay.port('left')], 8);
                x.remove(e);
                eff[my]++;
                addPay(col, my, dup);
                pay.flash(dup ? C.err : C.ok);
                if (dup) { sD.add(); x.say(`#${my} je obrađena **drugi put**: dupla naplata.`); }
                seen.add(my);
                if (inbox) { inbox.flash(C.ok); inbox.text(`Inbox: … #${my}`); }
                await x.wait(.35);
              }
              if (attempt < 3 && x.rnd() < pf) {
                cons.flash(C.err, .9);
                x.say(`Pad **pre ack-a**: broker ne zna da je #${my} obrađena i šalje je ponovo.`);
                await x.move(o, [cons.port('left'), tb.b], 5);
                await x.wait(.6);
                continue;
              }
              ack();
              await x.wait(.3);
              if (eff[my] === 1) sO.add();
              x.remove(o);
              break;
            }
            await x.wait(.6);
          }
        });
      },
    },
  },

  // ------------------------------------------------------------------ Retry i DLQ
  {
    id: 'retry-dlq', d: 'messaging', sym: 'Rd', title: 'Retry, backoff i DLQ',
    tags: ['retry', 'exponential backoff', 'jitter', 'dead letter', 'dlq', 'poison message', 'polly', 'maxdeliverycount', 'prolazna greška'],
    desc: 'Prolazne greške rešava ponovni pokušaj sa sve dužim razmakom (**exponential backoff**) i slučajnim pomakom (**jitter**). Poruka koja ne prođe ni posle N pokušaja ide u **dead-letter queue** da ne blokira ostale.',
    points: [
      'Razmak raste eksponencijalno: 0,5 s, 1 s, 2 s, 4 s. Preopterećena zavisnost dobija vremena da se oporavi.',
      'Jitter rasipa pokušaje. Bez njega svi koji su pali zajedno udaraju ponovo u istom trenutku.',
      'Poison poruka (loš format, nepostojeći entitet) neće proći nikad. Posle `MaxDeliveryCount` pokušaja ide u DLQ.',
      'DLQ je red za ljude i alate: alarm na broj poruka, uvid u razlog, ponovno slanje posle popravke.',
      'Ponavljaj samo prolazne greške (timeout, 503, 429). Grešku validacije odmah šalji u DLQ.',
    ],
    code: [
      cs('C# · Polly v8: retry sa backoff-om i jitterom', `
var pipeline = new ResiliencePipelineBuilder()
    .AddRetry(new RetryStrategyOptions
    {
        MaxRetryAttempts = 4,
        Delay = TimeSpan.FromMilliseconds(500),
        BackoffType = DelayBackoffType.Exponential,   // 0,5 s, 1 s, 2 s, 4 s
        UseJitter = true,
        ShouldHandle = new PredicateBuilder()
            .Handle<HttpRequestException>()
            .Handle<TimeoutRejectedException>()
    })
    .Build();

await pipeline.ExecuteAsync(async token => await inventory.ReserveAsync(order, token), ct);`),
      cs('C# · Poison poruka odmah u DLQ', `
processor.ProcessMessageAsync += async args =>
{
    try
    {
        var cmd = args.Message.Body.ToObjectFromJson<ReserveStock>();
        await handler.HandleAsync(cmd, args.CancellationToken);
        await args.CompleteMessageAsync(args.Message);
    }
    catch (ValidationException ex)       // neće proći ni posle deset pokušaja
    {
        await args.DeadLetterMessageAsync(args.Message, "Validation", ex.Message);
    }
    // ostale greške: poruka se vraća u red i DeliveryCount raste
};`),
      cs('C# · Čitanje DLQ-a', `
ServiceBusReceiver dlq = client.CreateReceiver("orders",
    new ServiceBusReceiverOptions { SubQueue = SubQueue.DeadLetter });

foreach (var m in await dlq.ReceiveMessagesAsync(maxMessages: 20))
    Console.WriteLine($"{m.MessageId}: {m.DeadLetterReason} {m.DeadLetterErrorDescription}");`),
    ],
    pitfalls: [
      'Retry na više nivoa se množi: 3 pokušaja u HTTP klijentu × 3 u servisu × 10 isporuka brokera = 90 udaraca u istu zavisnost.',
      'Ponavljanje neidempotentne operacije bez idempotency ključa pravi duplikate.',
      'DLQ koji niko ne prati je samo sporiji gubitak podataka.',
    ],
    rel: ['delivery', 'circuit-breaker', 'load-leveling'],
    viz: {
      warm: 3,
      knobs: [
        { id: 'max', label: 'Maks. isporuka', min: 2, max: 5, value: 4 },
        { id: 'jit', label: 'Jitter', value: 'da', options: [['ne', 'Ne'], ['da', 'Da']] },
      ],
      actions: [{ id: 'outage', label: 'Ispad zavisnosti 4 s', icon: 'unplug' }],
      build(x) {
        const { C, V } = x, max = x.p.max, jitter = x.p.jit === 'da';
        const sO = x.stat('o', 'Uspešno', 0, { color: C.ok });
        const sR = x.stat('r', 'Ponovljenih', 0, { color: C.wait });
        const sD = x.stat('d', 'U DLQ', 0, { color: C.err });
        x.legend([[C.sky, 'prolazi'], [C.wait, 'prolazna greška'], [C.mag, 'poison']]);
        x.plate({ at: [.6, 0, .9], w: 22, d: 9.6 });
        const prod = x.box({ at: [-9, 0, -1.6], size: [1.9, .9, 1.2], label: 'Producer', side: 'in' });
        const tb = x.tube([-7.8, .55, -1.6], [-2.8, .55, -1.6], { label: 'Queue' });
        const cons = x.box({ at: [-.4, 0, -1.6], size: [2.2, 1, 1.3], label: 'Consumer', side: 'in' });
        const dep = x.box({ at: [5.6, 0, -1.6], size: [2.4, 1, 1.3], label: 'Zavisnost (API)', side: 'in' });
        x.rail(cons.port('right'), dep.port('left'), { opacity: .4 });
        const dlq = x.tube([-7.8, .55, 4.2], [-1.6, .55, 4.2], { color: C.err, label: 'Dead-letter queue' });
        x.label('← čekaju ponovni pokušaj', [-1.3, .3, 1.1], { cls: 'plate', color: C.wait, center: [0, .5] });
        const park = [];
        const spot = () => { let i = 0; while (park[i]) i++; park[i] = true; return i; };
        const spotPos = i => V(-7.3 + (i % 8) * .8, .55, 1.1 + Math.floor(i / 8) * .8);
        let nd = 0;
        const dlqPos = () => V(-1.95 - (nd++ % 9) * .62, .55, 4.2);
        const gate = x.sem(1);
        let down = false;
        x.on('outage', () => {
          down = true; dep.paint(C.err);
          x.say('**Zavisnost je pala** na 4 s: svi pokušaji padaju i poruke odlaze na čekanje.');
          x.wait(4).then(() => {
            down = false; dep.reset();
            x.say(jitter ? 'Zavisnost se oporavila. Sa jitterom ponovni pokušaji stižu **razbacano**.' : 'Zavisnost se oporavila. Bez jittera poruke koje su pale zajedno vraćaju se **u istom trenutku**.');
          });
        });
        const handle = async (o, my, kind, flaky) => {
          for (let att = 1; att <= max; att++) {
            await gate.acquire();
            await x.move(o, [o.position.clone(), tb.b, cons.port('left')], 9);
            const p = x.orb(C.white, { r: .13, halo: false });
            await x.move(p, [cons.port('right'), dep.port('left')], 10);
            x.remove(p);
            const fails = down || kind === 'poison' || (kind === 'flaky' && att <= flaky);
            dep.flash(fails ? C.err : C.ok, .45);
            gate.release();
            if (!fails) { cons.flash(C.ok); sO.add(); await x.fadeOut(o, .3); return; }
            cons.flash(C.err, .5);
            if (att === max) {
              sD.add();
              o.lbl.set(`#${my} u DLQ`);
              o.lbl.el.className = 'lbl lbl-tag lbl-err';
              await x.move(o, [o.position.clone(), V(-1, .55, 4.2), dlqPos()], 8);
              if (kind === 'poison') x.say(`#${my} je poison poruka: posle ${max} isporuka ide u **DLQ** i više ne blokira red.`);
              return;
            }
            sR.add();
            const delay = .6 * 2 ** (att - 1) * (jitter ? x.range(.5, 1.5) : 1);
            const i = spot();
            await x.move(o, [o.position.clone(), spotPos(i)], 9);
            for (let left = delay; left > 0; left -= .1) {
              o.lbl.set(`#${my} · ${att}/${max} · ${left.toFixed(1)} s`);
              await x.wait(.1);
            }
            o.lbl.set(`#${my}`);
            park[i] = false;
          }
        };
        let id = 0;
        x.every(1.35, () => x.spawn(async () => {
          const my = ++id, r = x.rnd();
          const kind = r < .12 ? 'poison' : r < .4 ? 'flaky' : 'ok';
          const o = x.orb(kind === 'poison' ? C.mag : kind === 'flaky' ? C.wait : C.sky, { label: '#' + my });
          prod.flash(C.sky, .3);
          await x.move(o, [prod.port('right'), tb.a, tb.b.clone().add(V(-.5, 0, 0))], [8, 6]);
          await handle(o, my, kind, kind === 'flaky' ? (x.rnd() < .5 ? 1 : 2) : 0);
        }));
        x.say('Žuta poruka prolazi posle jednog ili dva ponovna pokušaja, a magenta (poison) ne prođe nikad. Pusti **ispad zavisnosti** i uporedi sa jitterom i bez njega.');
      },
    },
  },
];
