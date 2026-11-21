// Kubernetes i cloud
const yml = (t, src) => ({ t, lang: 'yaml', src });
const sh = (t, src) => ({ t, lang: 'bash', src });
const cs = (t, src) => ({ t, lang: 'csharp', src });

export default [
  // ------------------------------------------------------------------ Osnove
  {
    id: 'k8s-basics', d: 'kubernetes', sym: 'K8', title: 'Pod, Deployment, Service',
    tags: ['kubernetes', 'k8s', 'aks', 'pod', 'deployment', 'replicaset', 'service', 'readiness', 'liveness', 'probe', 'self-healing', 'node'],
    desc: 'Deployment opisuje željeno stanje (koliko replika koje verzije), a kontroler stalno upoređuje stvarno sa željenim i ispravlja razliku. Service daje stabilnu adresu i deli saobraćaj na spremne podove.',
    points: [
      'Pod je najmanja jedinica: jedan ili više kontejnera sa zajedničkom mrežom. Podovi su potrošni i dobijaju nove IP adrese.',
      'Deployment upravlja ReplicaSet-om, a on drži zadati broj podova: ugašen pod se zamenjuje novim.',
      'Service bira podove po labelama (`selector`) i šalje saobraćaj samo onima koji su spremni (readiness).',
      '**Readiness** proba odlučuje da li pod prima saobraćaj; **liveness** proba restartuje zaglavljen kontejner.',
      '`requests` i `limits` (CPU, memorija) određuju gde se pod raspoređuje i koliko sme da troši.',
    ],
    code: [
      yml('YAML · Deployment sa probama i resursima', `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders-api
spec:
  replicas: 3
  selector:
    matchLabels: { app: orders-api }
  template:
    metadata:
      labels: { app: orders-api }
    spec:
      containers:
        - name: api
          image: myregistry.azurecr.io/orders-api:1.4.2
          ports: [{ containerPort: 8080 }]
          resources:
            requests: { cpu: 250m, memory: 256Mi }
            limits: { memory: 512Mi }
          readinessProbe:
            httpGet: { path: /health/ready, port: 8080 }
            periodSeconds: 5
          livenessProbe:
            httpGet: { path: /health/live, port: 8080 }
            initialDelaySeconds: 10`),
      yml('YAML · Service', `
apiVersion: v1
kind: Service
metadata:
  name: orders-api
spec:
  selector: { app: orders-api }   # svi podovi sa ovom labelom
  ports:
    - port: 80
      targetPort: 8080`),
      cs('C# · Health endpoint-i u ASP.NET Core', `
builder.Services.AddHealthChecks()
    .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
    .AddSqlServer(connectionString, tags: ["ready"]);     // AspNetCore.HealthChecks.SqlServer

app.MapHealthChecks("/health/live", new() { Predicate = c => c.Tags.Contains("live") });
app.MapHealthChecks("/health/ready", new() { Predicate = c => c.Tags.Contains("ready") });`),
      sh('Shell · kubectl', `
kubectl get pods -l app=orders-api -o wide
kubectl delete pod orders-api-7d9f8-x2k4q     # ReplicaSet odmah pravi novi
kubectl describe pod orders-api-7d9f8-x2k4q   # događaji: probe, OOMKilled, restart`),
    ],
    pitfalls: [
      'Liveness proba koja proverava bazu: kad baza zakašlje, Kubernetes restartuje sve podove odjednom. Liveness proverava samo proces.',
      'Bez memorijskog limita jedan pod može da potroši ceo čvor; sa preniskim limitom dobija `OOMKilled`.',
      'Tag `latest`: ne znaš šta je pokrenuto, a rollback nema na šta da se vrati.',
    ],
    rel: ['rolling-update', 'hpa', 'load-leveling'],
    viz: {
      warm: 2,
      knobs: [{ id: 'r', label: 'replicas', min: 2, max: 6, value: 3 }],
      actions: [{ id: 'kill', label: 'Ugasi pod', icon: 'skull' }, { id: 'node', label: 'Ugasi ili vrati Node 3', icon: 'power' }],
      build(x) {
        const { C, V } = x, R = x.p.r;
        const sD = x.stat('d', 'Željeno', R);
        const sR = x.stat('r', 'Spremno', 0, { color: C.ok });
        const sQ = x.stat('q', 'Obrađeno zahteva', 0, { color: C.sky });
        const nodes = [-2.6, 3, 8.6].map((nx, i) => ({ i, nx, up: true, plate: x.plate({ at: [nx, 0, 0], w: 5, d: 6.6, label: `Node ${i + 1}` }) }));
        const svc = x.box({ at: [-8.4, 0, 0], size: [2.2, 1, 1.6], color: C.sky, label: 'Service', side: 'in' });
        const dep = x.box({ at: [-8.4, 0, -3.6], size: [2.8, .8, 1.2], color: C.mag, label: `Deployment: ${R}`, side: 'in' });
        const slots = [[-1.2, -1.9], [1.2, -1.9], [-1.2, 0], [1.2, 0], [-1.2, 1.9], [1.2, 1.9]];
        const pods = [];
        let id = 0, rr = 0;
        const ready = () => pods.filter(p => p.ready && !p.dead);
        const upd = () => sR.set(ready().length);
        const create = () => {
          const live = nodes.filter(n => n.up);
          const node = live.sort((a, b) => pods.filter(p => p.node === a && !p.dead).length - pods.filter(p => p.node === b && !p.dead).length)[0];
          const used = pods.filter(p => p.node === node && !p.dead).map(p => p.slot);
          const slot = slots.findIndex((_, i) => !used.includes(i));
          if (slot < 0) return;
          const name = 'api-' + (++id).toString(36).padStart(2, '0');
          const b = x.box({ at: [node.nx + slots[slot][0], 0, slots[slot][1]], size: [1.9, .7, 1.3], color: C.wait, label: name, side: 'in' });
          const p = { b, node, slot, ready: false, dead: false };
          pods.push(p);
          x.pop(b.o);
          x.wait(1.8).then(() => { if (!p.dead) { p.ready = true; b.paint(C.box); b.flash(C.ok, .6); upd(); } });
        };
        const kill = p => {
          p.dead = true; p.ready = false;
          p.b.paint(C.err);
          upd();
          x.wait(.5).then(() => x.fadeOut(p.b, .3));
          x.wait(.9).then(() => { const i = pods.indexOf(p); if (i >= 0) pods.splice(i, 1); });
        };
        for (let i = 0; i < R; i++) create();
        x.every(.5, () => {
          const alive = pods.filter(p => !p.dead).length;
          if (alive < R) { dep.flash(C.mag, .5); x.say(`Stvarno stanje (${alive}) nije željeno (${R}): ReplicaSet **pravi novi pod**. Dok ne prođe readiness probu (žuto), ne dobija saobraćaj.`); create(); }
        });
        x.on('kill', () => { const live = pods.filter(p => !p.dead); if (live.length) { const p = x.pick(live); x.say(`Pod ${p.b.lbl.el.textContent} je ugašen.`); kill(p); } });
        x.on('node', () => {
          const n = nodes[2];
          n.up = !n.up;
          n.plate.material = n.plate.material.clone(); n.plate.material.userData.shared = false;
          n.plate.material.color.set(n.up ? C.plate : 0x2a1730);
          if (!n.up) { pods.filter(p => p.node === n && !p.dead).forEach(kill); x.say('**Node 3 je pao**: njegovi podovi nestaju, a novi se raspoređuju na preostale čvorove.'); }
          else x.say('Node 3 je ponovo dostupan; novi podovi mogu da idu i na njega.');
        });
        x.every(9, () => x.emit('kill'), 6);
        x.every(.42, () => x.spawn(async () => {
          const rs = ready();
          if (!rs.length) return;
          const p = rs[rr++ % rs.length];
          const o = x.orb(C.sky, { r: .17, halo: false });
          await x.move(o, [V(-11, .5, 0), svc.port('left'), svc.port('right'), p.b.port('top', .25)], 14);
          if (!p.dead) { p.b.flash(C.sky, .25); sQ.add(); }
          x.remove(o);
        }));
        x.say('Service deli zahteve na spremne podove (round robin). Na svakih 9 s jedan pod se gasi da se vidi samoizlečenje.');
      },
    },
  },

  // ------------------------------------------------------------------ Rolling update i canary
  {
    id: 'rolling-update', d: 'kubernetes', sym: 'Ru', title: 'Rolling update i canary',
    tags: ['deploy', 'rolling update', 'canary', 'blue-green', 'maxsurge', 'maxunavailable', 'rollback', 'rollout undo', 'zero downtime'],
    desc: 'Nova verzija se uvodi bez prekida. **Rolling update** menja podove jedan po jedan, a **canary** prvo šalje mali deo saobraćaja na novu verziju i čeka da metrike potvrde da je sve u redu.',
    points: [
      '`maxSurge` je koliko podova sme da postoji iznad željenog broja; `maxUnavailable` koliko sme da fali.',
      'Novi pod dobija saobraćaj tek kad prođe readiness probu, i tek tada se gasi jedan stari.',
      'Rollback je isti proces unazad: `kubectl rollout undo` vraća prethodni ReplicaSet.',
      'Canary: nekoliko podova nove verzije uz stare, ili podela saobraćaja na ingress-u ili service mesh-u (npr. 10%).',
      'Blue-green: cela nova verzija stoji pored stare, a saobraćaj se prebaci odjednom. Brz povratak, ali duplo resursa.',
    ],
    code: [
      yml('YAML · strategija zamene', `
spec:
  replicas: 4
  minReadySeconds: 10        # pod mora biti spreman 10 s da bi se računao
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1            # najviše 5 podova tokom zamene
      maxUnavailable: 0      # nikad manje od 4 spremna`),
      sh('Shell · isporuka i povratak', `
kubectl set image deployment/orders-api api=myregistry.azurecr.io/orders-api:1.5.0
kubectl rollout status deployment/orders-api
kubectl rollout undo deployment/orders-api      # nazad na prethodnu verziju`),
      yml('YAML · canary sa NGINX ingress-om', `
metadata:
  name: orders-api-canary
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"   # 10% saobraćaja na novu verziju`),
    ],
    pitfalls: [
      'Promena šeme baze koja nije kompatibilna unazad: tokom zamene stara i nova verzija rade nad istom šemom. Menjaj šemu u dva koraka (expand, pa contract).',
      'Readiness proba koja odmah vraća 200 pušta saobraćaj na pod koji još nije spreman.',
    ],
    rel: ['k8s-basics', 'hpa', 'percentiles-slo'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Strategija', value: 'rolling', options: [['rolling', 'Rolling update'], ['canary', 'Canary']] },
        { id: 'bug', label: 'Verzija 2', value: 'ok', options: [['ok', 'Ispravna'], ['bug', 'Sa bagom']] },
      ],
      build(x) {
        const { C, V } = x, canary = x.p.mode === 'canary', bug = x.p.bug === 'bug';
        const s1 = x.stat('a', 'v1 podova', 0, { color: C.sky });
        const s2 = x.stat('b', 'v2 podova', 0, { color: C.mag });
        const sE = x.stat('e', 'Grešaka', 0, { color: C.err });
        x.plate({ at: [2.2, 0, 0], w: 12.6, d: 6.8, label: 'Deployment orders-api, replicas: 4' });
        const svc = x.box({ at: [-7.6, 0, 0], size: [2.2, 1, 1.6], color: C.sky, label: 'Service', side: 'in' });
        const slotP = i => V(-1.4 + (i % 4) * 2.4, 0, -1.4 + Math.floor(i / 4) * 2.8);
        let pods = [], rr = 0, weight = 0;
        const upd = () => { s1.set(pods.filter(p => p.v === 1 && !p.dead).length); s2.set(pods.filter(p => p.v === 2 && !p.dead).length); };
        const freeSlot = () => { for (let i = 0; i < 8; i++) if (!pods.some(p => p.slot === i && !p.dead)) return i; return 0; };
        const add = async (v, quick) => {
          const slot = freeSlot();
          const b = x.box({ at: slotP(slot), size: [2, .75, 1.4], color: quick ? (v === 1 ? C.sky : C.mag) : C.wait, label: `v${v}`, side: 'in' });
          const p = { b, v, slot, ready: !!quick, dead: false };
          pods.push(p); upd();
          if (!quick) { x.pop(b.o); await x.wait(1.5); p.ready = true; b.paint(v === 1 ? C.sky : C.mag); b.flash(C.ok, .5); }
          return p;
        };
        const del = async p => { p.dead = true; p.ready = false; p.b.paint(C.err); upd(); await x.wait(.5); x.fadeOut(p.b, .3); pods = pods.filter(q => q !== p); };
        x.every(.32, () => x.spawn(async () => {
          const rs = pods.filter(p => p.ready && !p.dead);
          if (!rs.length) return;
          let p;
          const v2 = rs.filter(q => q.v === 2), v1 = rs.filter(q => q.v === 1);
          if (canary && weight > 0 && v2.length && v1.length) p = x.rnd() < weight ? v2[rr++ % v2.length] : v1[rr++ % v1.length];
          else p = rs[rr++ % rs.length];
          const o = x.orb(C.white, { r: .16, halo: false });
          await x.move(o, [V(-10.4, .5, 0), svc.port('left'), svc.port('right'), p.b.port('top', .25)], 15);
          const err = p.v === 2 && bug;
          if (!p.dead) { p.b.flash(err ? C.err : C.ok, .3); if (err) sE.add(); }
          x.remove(o);
        }));
        const run = async () => {
          for (const p of pods) x.remove(p.b);
          pods = []; weight = 0; sE.set(0);
          for (let i = 0; i < 4; i++) await add(1, true);
          x.say('Radi verzija 1 na 4 poda.');
          await x.wait(2.2);
          if (!canary) {
            for (let i = 0; i < 4; i++) {
              x.say(`Rolling update, korak ${i + 1} od 4: novi v2 pod se pokreće (maxSurge 1), stari ostaju dok ne bude spreman.`);
              await add(2);
              const old = pods.find(p => p.v === 1 && !p.dead);
              if (old) await del(old);
              if (bug && i === 1) {
                x.say('Greške rastu sa svakim novim podom. **kubectl rollout undo**: vraćamo v1.');
                await x.wait(1.6);
                while (pods.some(p => p.v === 2 && !p.dead)) {
                  await add(1);
                  await del(pods.find(p => p.v === 2 && !p.dead));
                }
                x.say('Rollback je završen: opet radi v1. Polovina korisnika je ipak videla greške.');
                await x.wait(3);
                return;
              }
            }
            x.say('Svi podovi su na v2, bez prekida u saobraćaju.');
          } else {
            x.say('Canary: jedan v2 pod uz četiri v1. Na njega ide oko **20% zahteva**.');
            await add(2);
            weight = .2;
            await x.wait(4.5);
            if (bug) {
              x.say('Metrike canary-ja pokazuju greške: **canary se uklanja**. Greške je videlo samo oko 20% zahteva, i to kratko.');
              weight = 0;
              await del(pods.find(p => p.v === 2 && !p.dead));
              await x.wait(3);
              return;
            }
            x.say('Metrike su dobre: canary se **promoviše**, ostali podovi prelaze na v2.');
            weight = 0;
            for (let i = 0; i < 4; i++) { await add(2); const old = pods.find(p => p.v === 1 && !p.dead); if (old) await del(old); }
            const extra = pods.filter(p => p.v === 2 && !p.dead).slice(4);
            for (const p of extra) await del(p);
            x.say('Svi podovi su na v2.');
          }
          await x.wait(3);
        };
        x.spawn(async () => { while (x.alive) await run(); });
      },
    },
  },

  // ------------------------------------------------------------------ HPA
  {
    id: 'hpa', d: 'kubernetes', sym: 'Ha', title: 'HPA: automatsko skaliranje',
    tags: ['hpa', 'horizontal pod autoscaler', 'autoscaling', 'skaliranje', 'cpu', 'keda', 'replike', 'stabilizacija'],
    desc: '**Horizontal Pod Autoscaler** periodično meri opterećenje (npr. prosečan CPU) i menja broj replika tako da prosek bude blizu cilja.',
    points: [
      'Formula: željeno = ceil(trenutno × trenutna metrika / ciljna metrika). Sa 4 poda na 90% CPU i ciljem 60%: ceil(4 × 90 / 60) = 6.',
      'CPU se meri u odnosu na `requests`, zato pod bez `requests` ne može da se skalira po CPU-u.',
      'Smanjivanje čeka period stabilizacije (podrazumevano 5 minuta), da broj replika ne bi skakao gore-dole.',
      'Novom podu treba vremena da se pokrene i zagreje: autoskaliranje ne rešava skok koji traje par sekundi.',
      'KEDA dodaje skaliranje po spoljnim metrikama: dužina reda, lag na Kafki, broj HTTP zahteva.',
    ],
    code: [
      yml('YAML · HPA (autoscaling/v2)', `
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: orders-api
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: orders-api
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
  behavior:
    scaleDown:
      stabilizationWindowSeconds: 300`),
      sh('Shell · praćenje', `
kubectl get hpa orders-api --watch
kubectl top pods -l app=orders-api`),
    ],
    pitfalls: [
      'HPA i ručno postavljen `replicas` u Deployment-u se bore: svaki deploy vrati broj replika na vrednost iz YAML-a.',
      'Skaliranje po CPU-u za servis koji uglavnom čeka I/O: CPU je nizak dok red raste. Skaliraj po metrici koja stvarno raste.',
    ],
    rel: ['k8s-basics', 'load-leveling', 'percentiles-slo'],
    viz: {
      warm: 2,
      actions: [{ id: 'spike', label: 'Skok saobraćaja', icon: 'flame' }],
      build(x) {
        const { C, V } = x, TARGET = 60, MIN = 2, MAX = 8, BH = 2.6;
        const sN = x.stat('n', 'Replike', MIN);
        const sC = x.stat('c', 'Prosečan CPU', '0%', { color: C.wait });
        x.plate({ at: [1.2, 0, .4], w: 19.6, d: 7.4 });
        const slotX = i => -5.6 + i * 1.95;
        const tgt = x.box({ at: [1.2, .9 + BH * TARGET / 100, 0], size: [16.2, .02, .9], color: C.mag, nofit: true });
        tgt.o.material.transparent = true; tgt.o.material.opacity = .35; tgt.o.castShadow = false;
        x.label('cilj 60%', [9.5, .9 + BH * TARGET / 100, 0], { cls: 'tag mag', center: [0, .5] });
        const hpa = x.box({ at: [1.2, 0, -3.3], size: [7.4, .5, .8], color: 0x4f74b3, label: 'HPA', side: 'in' });
        const pods = [];
        const add = () => {
          const i = pods.length;
          const b = x.box({ at: [slotX(i), 0, 0], size: [1.4, .9, 1.4], color: C.wait, side: 'in', label: `pod ${i + 1}` });
          const bar = x.bar([slotX(i), .9, 0], .02, C.ok, { w: .6, d: .6, nofit: true });
          const p = { b, bar, ready: false };
          pods.push(p);
          x.pop(b.o);
          x.wait(2).then(() => { p.ready = true; b.paint(C.box); });
        };
        const remove = () => { const p = pods.pop(); if (p) { x.fadeOut(p.b, .3); x.remove(p.bar); } };
        for (let i = 0; i < MIN; i++) { add(); pods[i].ready = true; pods[i].b.paint(C.box); }
        let spikeUntil = -1, below = 0;
        const load = () => 110 + 200 * Math.max(0, Math.sin(x.t * Math.PI * 2 / 26)) + (x.t < spikeUntil ? 320 : 0);
        x.on('spike', () => { spikeUntil = x.t + 7; x.say('**Skok saobraćaja**: CPU na postojećim podovima skače, HPA u sledećem krugu dodaje replike.'); });
        x.tick(() => {
          const L = load(), rs = pods.filter(p => p.ready), avg = rs.length ? L / rs.length : 0;
          for (const p of pods) {
            const cpu = p.ready ? Math.min(100, avg) : 0;
            p.bar.setH(Math.max(.02, BH * cpu / 100));
            p.bar.paint(cpu > 85 ? C.err : cpu > TARGET ? C.wait : C.ok);
          }
          sC.set(Math.round(Math.min(150, avg)) + '%');
        });
        x.every(3, () => {
          const rs = pods.filter(p => p.ready), n = pods.length, avg = Math.round(load() / Math.max(1, rs.length));
          const desired = Math.max(MIN, Math.min(MAX, Math.ceil(n * avg / TARGET)));
          hpa.text(`HPA: ceil(${n} × ${avg}% / ${TARGET}%) = ${desired}`);
          hpa.flash(C.mag, .5);
          if (desired > n) { below = 0; for (let i = n; i < desired; i++) add(); x.say(`Prosek ${avg}% je iznad cilja: HPA dodaje **${desired - n}** ${desired - n === 1 ? 'pod' : 'poda'}. Novi podovi rade tek kad se pokrenu (žuto).`); }
          else if (desired < n) {
            below += 3;
            if (below >= 9) { below = 0; remove(); x.say('Opterećenje je palo i ostalo nisko kroz ceo period stabilizacije: HPA **uklanja jedan pod**.'); }
            else x.say(`HPA bi smanjio na ${desired}, ali **čeka stabilizaciju** da ne bi skakao gore-dole.`);
          } else below = 0;
          sN.set(pods.length);
        }, 1);
        x.every(.25, () => x.spawn(async () => {
          const rs = pods.filter(p => p.ready);
          if (!rs.length || x.rnd() > load() / 420) return;
          const p = x.pick(rs);
          const o = x.orb(C.sky, { r: .14, halo: false });
          await x.move(o, [V(-9.6, .5, 2.6), p.b.port('front', -.2)], 13);
          x.remove(o);
        }));
      },
    },
  },
];
