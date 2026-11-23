// Smart home: kako uređaji rade zajedno u kući. Pune teme; plan iste teme u hardware.js ustupa mesto ovoj.
import { dec } from '../i18n.js';
const yaml = (t, src) => ({ t, lang: 'yaml', src });
const sh = (t, src) => ({ t, lang: 'bash', src });
const txt = (t, src) => ({ t, lang: 'plaintext', src });

const WARM = 0xffd166, OFF = 0x59606e, CMD = 0x5aa9ff, PWR = 0xff9f68, BUS = 0x3ddc97;

// sijalica: sfera na stubu koja svetli kad je uključena (v od 0 do 1 je jačina)
function bulb(x, at, label) {
  const [X, H, Z] = at;
  x.rail([X, 0, Z], [X, H - .28, Z], { color: 0x8a94a6, opacity: .7, r: .035 });
  const m = x.chip(OFF, { s: .56, round: true, at: [X, H, Z], fit: true, glow: 0 });
  if (label) x.label(label, [X, H + .42, Z]);
  let on = 0;
  return {
    m, get on() { return on; },
    set(v) { on = v; const c = v ? WARM : OFF; m.material.color.set(c); m.material.emissive.set(c); m.material.emissiveIntensity = v ? .3 + .8 * v : 0; },
  };
}
// poruka koja putuje kroz tačke i nestaje
async function send(x, pts, color, v = 6, r = .2) {
  const o = x.orb(color, { r, at: pts[0] });
  await x.move(o, pts, v);
  x.remove(o);
}

export default [
  // ------------------------------------------------------------------ Kako je sistem sastavljen
  {
    id: 'sh-sistem', sym: 'Sh', title: 'Kako je smart home sistem sastavljen',
    tags: ['smart home', 'pametna kuća', 'kontroler', 'aktuator', 'senzor', 'centralizovan', 'decentralizovan', 'controller', 'actuator', 'architecture', 'fallback'],
    desc: 'Svaki smart home sistem ima iste uloge: **senzori** i tasteri javljaju šta se desilo, **kontroler** odlučuje, **aktuatori** (releji, dimeri, motori roletni) izvršavaju, a paneli i aplikacija služe ljudima. Sistemi se razlikuju po tome gde živi logika i šta se desi kad jedan deo otkaže.',
    points: [
      '**Senzori i tasteri** su ulazi: pokret, temperatura, vlaga, otvoren prozor, pritisak tastera. Oni javljaju događaj, a ne odlučuju šta dalje.',
      '**Aktuatori** su izlazi: relej pali svetlo, dimer menja jačinu, modul pomera roletnu, ventil reguliše grejanje. Obično stoje u razvodnom ormanu ili u kutiji iza prekidača.',
      '**Kontroler** čuva logiku: scene, rasporede i pravila. U centralizovanom sistemu svaka komanda prolazi kroz njega.',
      'U **decentralizovanom** sistemu (KNX je tipičan primer) svaki uređaj ima svoj procesor i parametre, pa taster šalje komandu direktno aktuatoru, bez kontrolera u sredini.',
      '**Žičani** sistemi (KNX, Modbus, DALI, ožičeni ulazi kontrolera) su pouzdaniji i ne troše baterije; **bežični** (Zigbee, Thread, Wi‑Fi) se lakše ugrađuju u stan koji je već završen.',
      'Dobar sistem ima **rezervni put**: osnovne funkcije, kao paljenje svetla tasterom, rade i kad kontroler, mreža ili internet otkažu.',
    ],
    table: {
      title: 'Uloge u sistemu',
      head: ['Uloga', 'Primeri', 'Gde stoji'],
      rows: [
        ['Senzor, taster', 'senzor pokreta, termostat, kontakt na prozoru, zidni taster', 'u prostoriji'],
        ['Aktuator', 'relejni modul, dimer, modul za roletne, ventil grejanja', 'razvodni orman ili kutija iza prekidača'],
        ['Kontroler', 'smart home kontroler, Home Assistant, KNX logički modul', 'razvodni orman ili ormar sa mrežnom opremom'],
        ['Interfejs', 'zidni panel, aplikacija, glasovni asistent', 'zid, telefon'],
      ],
    },
    code: [
      txt('Plan · ko šta radi u dnevnoj sobi', `
Dnevna soba
  ulazi:    taster kod vrata (2 tastera), senzor pokreta, kontakt na prozoru
  izlazi:   relej K1 (plafonsko svetlo), dimer D1 (LED traka), modul R1 (roletna)
  logika:   taster 1 kratko  → K1 uključi ili isključi
            taster 2 držanje → D1 menja jačinu
            prozor otvoren   → grejanje u sobi staje
  rezerva:  taster 1 vezan i direktno na K1, radi i kad kontroler ne radi`),
    ],
    pitfalls: [
      'Sve kroz jedan kontroler, bez rezervnog puta: kad on stane, ne radi ni svetlo u kupatilu. Osnovne funkcije treba da rade i bez njega.',
      'Bežični senzori tamo gde signal ne dopire, ili baterije koje niko ne menja: sistem tiho prestane da reaguje.',
      'Logika rasuta na tri mesta (u uređaju, u kontroleru i u cloudu): posle godinu dana niko ne zna zašto se svetlo upalilo.',
      'Aktuator bez ručnog uključenja i bez oznaka u ormanu: kad nešto ne radi, nema brzog načina da se proveri da li je kvar u logici ili u instalaciji.',
    ],
    rel: ['sh-lokalno', 'sh-knx', 'el-orman', 'sh-pierre'],
    viz: {
      knobs: [
        { id: 'arch', label: 'Sistem', value: 'c', options: [['c', 'centralizovan'], ['d', 'decentralizovan (magistrala)']] },
        { id: 'fail', label: 'Kontroler', value: 0, options: [[0, 'radi'], [1, 'ne radi']] },
      ],
      build(x) {
        const { C } = x, central = x.p.arch === 'c', dead = !!x.p.fail;
        x.view({ dir: [1.2, 6.5, 11], top: 56 });
        x.plate({ w: 17, d: 8.6, at: [-.6, 0, 0], label: 'Kuća' });
        x.plate({ w: 6.4, d: 6.8, at: [4.6, .02, 0], label: 'Razvodni orman', fill: 0x262d39, color: 0x7d8aa1 });
        const T = x.box({ at: [-7.3, 0, 2.2], size: [.7, .9, .24], label: 'Taster' });
        const S = x.db({ at: [-7.3, 0, -2], r: .36, h: .42, color: 0xc3a6ff, label: 'Senzor pokreta' });
        const L1 = bulb(x, [-3.6, 2.3, 2.2], 'Svetlo 1'), L2 = bulb(x, [-3.6, 2.3, -2], 'Svetlo 2');
        const K = x.box({ at: [3.2, 0, 0], size: [1.6, 1.1, 1.1], color: 0x5ec8ff, label: central ? 'Kontroler' : 'Logički modul' });
        const R1 = x.box({ at: [6.2, 0, 2.1], size: [1.2, .95, .9], label: 'Relej 1' });
        const R2 = x.box({ at: [6.2, 0, -2.1], size: [1.2, .95, .9], label: 'Relej 2' });
        if (dead) K.paint(0x6b7280).dim();
        const Y = .14, BZ = 3.5;
        // napajanje svetala ide iz releja u ormanu
        x.rail([6.2, Y, 2.1], [-3.6, Y, 2.2], { color: PWR, opacity: .55 });
        x.rail([6.2, Y, -2.1], [-3.6, Y, -2], { color: PWR, opacity: .55 });
        if (central) {
          for (const n of [T, S, R1, R2]) x.rail([n.pos.x, Y + .1, n.pos.z], [3.2, Y + .1, 0], { color: CMD, opacity: .45 });
        } else {
          x.rail([-7.3, Y, BZ], [6.2, Y, BZ], { color: BUS, opacity: .8, r: .06 });
          x.label('Magistrala', [-1.5, .3, BZ + .2], { cls: 'tag', color: BUS, center: [.5, 0] });
          for (const n of [T, S, K, R1, R2]) x.rail([n.pos.x, Y, n.pos.z], [n.pos.x, Y, BZ], { color: BUS, opacity: .6, r: .045 });
        }
        const sOn = x.stat('on', 'Uključeno svetala', 0), sLost = x.stat('lost', 'Izgubljenih komandi', 0);
        let lost = 0;
        const H = .75, top = n => [n.pos.x, H + .5, n.pos.z], low = n => [n.pos.x, H, n.pos.z];
        const upd = () => sOn.set((L1.on ? 1 : 0) + (L2.on ? 1 : 0));
        const fail = async n => { n.flash(C.err, 1); x.ripple(n.pos, C.err, 1); lost++; sLost.set(lost); };
        // komanda od ulaza do releja; vraća da li je stigla
        const go = async (from, relay) => {
          if (central) {
            await send(x, [top(from), low(from), low(K), top(K)], C.mag, 6);
            if (dead) { await fail(K); return false; }
            K.flash(C.ok, .8);
            await x.wait(.7);
            await send(x, [top(K), low(K), low(relay), top(relay)], C.mag, 6);
          } else {
            await send(x, [top(from), [from.pos.x, Y + .25, from.pos.z], [from.pos.x, Y + .25, BZ], [relay.pos.x, Y + .25, BZ], [relay.pos.x, Y + .25, relay.pos.z], top(relay)], C.mag, 7);
          }
          relay.flash(C.ok, .8);
          return true;
        };
        const power = async (relay, lamp, v) => {
          await send(x, [[relay.pos.x, Y + .2, relay.pos.z], [lamp.m.position.x, Y + .2, lamp.m.position.z], [lamp.m.position.x, lamp.m.position.y - .3, lamp.m.position.z]], PWR, 9, .16);
          lamp.set(v); upd();
        };
        const cycle = async () => {
          L1.set(0); L2.set(0); upd();
          T.flash(C.mag, .8);
          x.say(central
            ? 'Pritisak na **taster** je samo događaj. Taster ga šalje **kontroleru**, jer u centralizovanom sistemu jedino kontroler zna šta treba da se desi.'
            : 'Taster šalje **telegram** na magistralu. Svi uređaji ga vide, ali reaguje samo onaj koji je podešen da sluša tu adresu: **Relej 1**.');
          if (await go(T, R1)) {
            x.say(central ? 'Kontroler nađe pravilo „taster 1 → svetlo 1” i šalje komandu **releju**. Relej zatvara kontakt i svetlo dobija napon.' : 'Relej sam uključuje svetlo. Logički modul nije u putu, pa mu otkaz ne smeta.');
            await power(R1, L1, 1);
          } else x.say('**Kontroler ne radi**: događaj nema ko da obradi i svetlo ostaje ugašeno. Zato osnovni tasteri treba da imaju i direktan put do releja.');
          await x.wait(2.4);
          S.flash(C.mag, .8);
          x.say(central ? 'Senzor javlja **pokret**. Pravilo u kontroleru kaže: posle 22 h svetlo 2 na 30 %, da ne zaslepi.' : 'Senzor pokreta je podešen da šalje telegram releju 2: radi i bez logičkog modula.');
          if (await go(S, R2)) await power(R2, L2, .3);
          else x.say('Ni senzor ne pomaže: bez kontrolera nema ni pravila ni komande.');
          await x.wait(2.6);
          if (!central) {
            x.say(dead ? 'Ono što živi samo u logičkom modulu ne radi: scena **„Laku noć”** i rasporedi. Tasteri i senzori i dalje rade.' : 'Scena **„Laku noć”** živi u logičkom modulu: on šalje telegrame za gašenje oba svetla.');
            if (dead) { await fail(K); }
            else {
              K.flash(C.mag, .8);
              await Promise.all([go(K, R1), x.wait(.5).then(() => go(K, R2))]);
              L1.set(0); L2.set(0); upd();
            }
            await x.wait(2.4);
          }
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Lokalno ili preko clouda
  {
    id: 'sh-lokalno', sym: 'Lc', title: 'Lokalno ili preko clouda',
    tags: ['lokalno', 'cloud', 'vpn', 'wireguard', 'internet', 'offline', 'local control', 'remote access', 'latencija', 'glasovni asistent'],
    desc: 'Ista komanda može da ide kratkim putem, kroz kućnu mrežu do kontrolera, ili dugim, preko interneta do servera proizvođača i nazad. **Lokalni** put je brži i radi bez interneta; **cloud** donosi pristup sa daljine i integracije, ali postaje još jedna tačka otkaza.',
    points: [
      '**Lokalno**: taster, zidni panel i aplikacija na kućnom Wi‑Fi-ju razgovaraju sa kontrolerom u kući. Kašnjenje je desetine milisekundi.',
      '**Cloud**: komanda ide do servera proizvođača i nazad, kroz ruter i internet. Kašnjenje je stotine milisekundi, a bez interneta ne radi ništa što zavisi od clouda.',
      'Glasovni asistenti obično obrađuju govor u cloudu, pa bez interneta glas ne radi ni kad je sve ostalo lokalno.',
      'Pristup sa daljine bez clouda proizvođača: **VPN** do kućne mreže, na primer WireGuard na ruteru. Telefon je tada kao kod kuće i koristi lokalni put.',
      'Otkaz kontrolera je teži od otkaza interneta. Zato ožičeni tasteri treba da imaju i direktan put do izlaza.',
      'Bezbednost: smart home uređaji u odvojenoj mreži (VLAN), bez otvorenih portova ka internetu, sa ažurnim firmverom.',
    ],
    table: {
      title: 'Šta radi kad nešto otkaže',
      head: ['Put', 'Bez interneta', 'Bez kontrolera'],
      rows: [
        ['Zidni taster, žičano', 'radi', 'radi ako ima direktan put do releja'],
        ['Zidni panel i aplikacija kod kuće', 'radi', 'ne radi'],
        ['Aplikacija van kuće, preko clouda ili VPN-a', 'ne radi', 'ne radi'],
        ['Glasovni asistent', 'ne radi', 'ne radi'],
      ],
    },
    code: [
      txt('WireGuard · telefon kao deo kućne mreže', `
[Interface]                      # telefon
PrivateKey = <privatni ključ telefona>
Address = 10.8.0.2/32
DNS = 192.168.1.1                # kućni ruter, da rade imena uređaja

[Peer]                           # kućni ruter
PublicKey = <javni ključ rutera>
Endpoint = kuca.example.net:51820
AllowedIPs = 192.168.1.0/24      # kroz tunel ide samo kućna mreža
PersistentKeepalive = 25`),
    ],
    pitfalls: [
      'Uređaj koji radi samo preko clouda proizvođača: kad servis promeni uslove ili se ugasi, uređaj ostaje bez upravljanja.',
      'Port kontrolera ili snimača otvoren ka internetu: skeneri ga nađu za nekoliko sati. Pristup sa daljine ide kroz VPN ili proveren cloud servis.',
      'Automatizacija koja zavisi od podataka sa interneta (prognoza, cena struje) mora da ima razumno ponašanje kad podataka nema.',
      'Kućni Wi‑Fi kao jedina veza za sve: kad se ruter restartuje, stane i kuća. Ključni uređaji idu žicom ili kroz mrežu koja ne zavisi od rutera.',
    ],
    rel: ['sh-sistem', 'cc-pristup', 'sh-paneli', 'cc-mreza'],
    viz: {
      knobs: [
        { id: 'net', label: 'Internet', value: 1, options: [[1, 'radi'], [0, 'ne radi']] },
        { id: 'ctl', label: 'Kontroler', value: 1, options: [[1, 'radi'], [0, 'ne radi']] },
      ],
      build(x) {
        const { C } = x, net = !!x.p.net, ctl = !!x.p.ctl;
        x.view({ dir: [1, 6.5, 11], top: 56 });
        x.plate({ w: 13.4, d: 8.4, at: [-3.9, 0, 0], label: 'Kuća' });
        x.plate({ w: 6.4, d: 8.4, at: [7.2, 0, 0], label: 'Internet', fill: 0x232a36, color: 0x6c7a92 });
        const R = x.db({ at: [1.8, 0, 0], r: .55, h: .5, color: 0x9aa4b5, label: 'Ruter' });
        const K = x.box({ at: [-1.8, 0, -2.4], size: [1.6, 1.1, 1.1], color: 0x5ec8ff, label: 'Kontroler' });
        const RL = x.box({ at: [-5.4, 0, -2.6], size: [1, .9, .9], label: 'Relej' });
        const L = bulb(x, [-8.6, 2.3, -2.6], 'Svetlo');
        const T = x.box({ at: [-8.6, 0, 1.6], size: [.7, .9, .24], label: 'Taster' });
        const P = x.box({ at: [-6, 0, 2.8], size: [1.1, .8, .18], color: 0xc3a6ff, label: 'Zidni panel' });
        const F = x.box({ at: [-3.2, 0, 2.8], size: [.5, .9, .14], color: 0x7ee0b5, label: 'Telefon kod kuće' });
        const A = x.db({ at: [-.4, 0, 2.8], r: .35, h: .5, color: 0xff9f68, label: 'Glasovni asistent' });
        const CL = x.box({ at: [7.4, 0, -1.8], size: [2.2, 1, 1.4], color: 0xc3a6ff, label: 'Cloud proizvođača' });
        const FA = x.box({ at: [8.4, 0, 2.4], size: [.5, .9, .14], color: 0x7ee0b5, label: 'Telefon van kuće' });
        if (!net) { CL.dim(); FA.dim(); }
        if (!ctl) K.paint(0x6b7280).dim();
        const Y = .12;
        x.rail([-8.6, Y, 1.6], [-1.8, Y, -2.4], { color: CMD, opacity: .45 });
        x.rail([-8.6, Y, 1.6], [-5.4, Y, -2.6], { color: CMD, opacity: .22 });
        x.rail([-1.8, Y, -2.4], [-5.4, Y, -2.6], { color: CMD, opacity: .45 });
        x.rail([-5.4, Y, -2.6], [-8.6, Y, -2.6], { color: PWR, opacity: .55 });
        x.rail([1.8, Y, 0], [-1.8, Y, -2.4], { color: CMD, opacity: .45 });
        x.rail([1.8, Y, 0], [7.4, Y, -1.8], { color: net ? 0x9aa4b5 : C.err, opacity: net ? .45 : .7 });
        x.rail([1.8, Y, 0], [8.4, Y, 2.4], { color: net ? 0x9aa4b5 : C.err, opacity: net ? .3 : .6 });
        const sOk = x.stat('ok', 'Izvršeno', 0), sFail = x.stat('fail', 'Nije stiglo', 0), sMs = x.stat('ms', 'Kašnjenje', '—');
        let ok = 0, bad = 0;
        const H = .8, at = n => [n.pos.x, H, n.pos.z], hi = n => [n.pos.x, H + .5, n.pos.z];
        const lamp = [-8.6, H, -2.6];
        const light = async ms => {
          RL.flash(C.ok, .8);
          await send(x, [at(RL), lamp], PWR, 9, .16);
          L.set(L.on ? 0 : 1);
          ok++; sOk.set(ok); sMs.set(ms);
          await x.wait(2.2);
        };
        // put je niz čvorova; prvi koji ne radi zaustavlja poruku
        const run = async (from, hops, ms, text, fallback) => {
          from.flash(C.mag, .8);
          x.say(text);
          const pts = [hi(from), at(from)];
          for (const n of hops) {
            pts.push(at(n));
            const down = n === CL && !net, deadK = n === K && !ctl;
            if (!down && !deadK) continue;
            await send(x, pts, C.mag, 7);
            if (deadK && fallback) {
              x.say(fallback);
              await send(x, [at(from), at(RL)], C.mag, 7);
              await light(ms);
              return;
            }
            n.flash(C.err, 1); x.ripple(n.pos, C.err, 1);
            bad++; sFail.set(bad); sMs.set('—');
            x.say(down ? 'Nema interneta: poruka ne može dalje od rutera, pa ovaj put ne radi.' : '**Kontroler ne radi**: komandu nema ko da izvrši.');
            await x.wait(2.4);
            return;
          }
          await send(x, pts, C.mag, 7);
          K.flash(C.ok, .8);
          await send(x, [at(K), at(RL)], C.mag, 7);
          await light(ms);
        };
        const cycle = async () => {
          await run(T, [K], '~20 ms', '**Taster** je žicom vezan za kontroler: najkraći put, ne zavisi ni od Wi‑Fi-ja ni od interneta.', 'Kontroler ne radi, ali taster ima i **direktan put** do releja: osnovna funkcija radi.');
          await run(P, [R, K], '~40 ms', '**Zidni panel** šalje komandu preko kućnog Wi‑Fi-ja i rutera do kontrolera. Internet nije potreban.');
          await run(F, [R, K], '~50 ms', '**Telefon kod kuće** koristi lokalni put, isto kao panel.');
          await run(FA, [CL, R, K], '~300 ms', '**Telefon van kuće** ide preko clouda proizvođača: cloud prosleđuje komandu kroz vezu koju kontroler drži otvorenom.');
          await run(A, [R, CL, R, K], '~800 ms', '**Glasovni asistent** šalje snimak govora u cloud, a cloud vraća komandu kontroleru. Bez interneta glas ne radi.');
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Zigbee
  {
    id: 'sh-zigbee', sym: 'Zb', title: 'Zigbee',
    tags: ['zigbee', 'mesh', 'koordinator', 'ruter', 'krajnji uređaj', 'zigbee2mqtt', 'zha', 'coordinator', 'router', 'end device', '2.4 ghz'],
    desc: 'Zigbee je bežična **mesh** mreža na 2,4 GHz, napravljena za male poruke i malu potrošnju. **Koordinator** pravi mrežu, uređaji na struji (sijalice, utičnice, prekidači sa nulom) su **ruteri** i prosleđuju tuđe poruke, a baterijski senzori su **krajnji uređaji** koji uglavnom spavaju.',
    points: [
      '**Koordinator** (USB stik ili modul u kontroleru) osniva mrežu, bira kanal i čuva ključ mreže. U mreži je tačno jedan.',
      '**Ruteri** su uređaji stalno na napajanju. Prosleđuju poruke drugima i čuvaju poruke za uspavane krajnje uređaje.',
      '**Krajnji uređaji** na bateriju (senzori, daljinski) bude se samo da pošalju događaj ili da pitaju roditelja ima li poruka za njih, pa baterija traje mesecima ili godinama.',
      'Domet ne dolazi od jačeg signala nego od **više rutera**: poruka skače od uređaja do uređaja. Kad ruter nestane, mreža sama nađe drugi put, ako postoji.',
      'Zigbee deli opseg od 2,4 GHz sa Wi‑Fi-jem, pa se kanal Zigbee mreže bira dalje od kanala Wi‑Fi mreže.',
      '**Zigbee2MQTT** i **ZHA** povezuju koordinator sa Home Assistant-om: prvi pretvara uređaje u MQTT teme, drugi je ugrađena integracija.',
    ],
    table: {
      title: 'Uloge u Zigbee mreži',
      head: ['Uloga', 'Napajanje', 'Prosleđuje poruke', 'Primeri'],
      rows: [
        ['Koordinator', 'stalno', 'da', 'USB stik, modul u kontroleru'],
        ['Ruter', 'stalno', 'da', 'sijalica, utičnica, prekidač sa nulom'],
        ['Krajnji uređaj', 'baterija', 'ne', 'senzor pokreta, kontakt na vratima, daljinski'],
      ],
    },
    code: [
      sh('MQTT · praćenje Zigbee uređaja', `
mosquitto_sub -h 192.168.1.10 -t 'zigbee2mqtt/#' -v     # sve poruke Zigbee2MQTT-a
# zigbee2mqtt/hodnik_pokret {"occupancy":true,"battery":87,"linkquality":96}
mosquitto_pub -h 192.168.1.10 -t 'zigbee2mqtt/dnevna_svetlo/set' \\
  -m '{"state":"ON","brightness":180}'                     # uključi svetlo na oko 70 %`),
      yaml('Zigbee2MQTT · configuration.yaml', `
mqtt:
  server: mqtt://192.168.1.10
serial:
  port: /dev/ttyUSB0          # koordinator, USB stik
advanced:
  channel: 20                 # dalje od Wi-Fi kanala 1, 6 i 11
  network_key: GENERATE       # ključ mreže pravi se pri prvom pokretanju
homeassistant:
  enabled: true               # uređaji se sami pojave u Home Assistant-u`),
    ],
    pitfalls: [
      'Mreža samo od baterijskih senzora, bez rutera: senzori dalje od koordinatora gube vezu. Pomaže nekoliko uređaja na struji raspoređenih po kući.',
      'Pametne sijalice iza zidnog prekidača koji ih gasi: ruter nestaje iz mreže svaki put kad neko ugasi svetlo, a poruke koje su išle preko njega kasne ili se gube.',
      'Koordinator u USB portu odmah do računara ili diska: smetnje od USB 3 u opsegu od 2,4 GHz jako smanjuju domet. Pomaže produžni USB kabl.',
      'Krajnji uređaj se veže za ruter koji je bio blizu pri uparivanju. Kad ga premestiš daleko, veza je loša dok ne izabere novog roditelja.',
    ],
    rel: ['sh-matter', 'ei-mqtt', 'sh-ha', 'ei-wifi'],
    viz: {
      knobs: [{ id: 'off', label: 'Ruteri', value: 'all', options: [['all', 'svi rade'], ['r2', 'ugašena sijalica 2'], ['r23', 'ugašene sijalica 2 i utičnica 3']] }],
      build(x) {
        const { C } = x, off = new Set(x.p.off === 'r2' ? ['R2'] : x.p.off === 'r23' ? ['R2', 'R3'] : []);
        x.view({ dir: [.8, 7, 10], top: 56 });
        x.plate({ w: 17.4, d: 8.8, at: [0, 0, 0], label: 'Kuća' });
        const N = {
          K: { at: [-7, 0, 0], name: 'Koordinator', kind: 'k' },
          R1: { at: [-3.2, 0, -2.6], name: 'Utičnica 1', kind: 'r' },
          R2: { at: [-2.6, 0, 2.4], name: 'Sijalica 2', kind: 'r' },
          R3: { at: [1.4, 0, -2.4], name: 'Utičnica 3', kind: 'r' },
          R4: { at: [2.6, 0, 2.2], name: 'Sijalica 4', kind: 'r' },
          S1: { at: [6.8, 0, 2.6], name: 'Senzor pokreta', kind: 'e' },
          S2: { at: [6.4, 0, -2.6], name: 'Kontakt na prozoru', kind: 'e' },
        };
        const E = [['K', 'R1'], ['K', 'R2'], ['R1', 'R3'], ['R2', 'R4'], ['R3', 'R4'], ['R2', 'R3'], ['R4', 'S1'], ['R3', 'S2']];
        for (const [k, n] of Object.entries(N)) {
          const sub = n.kind === 'k' ? '<small>pravi mrežu</small>' : n.kind === 'r' ? '<small>ruter, na struji</small>' : '<small>baterija, spava</small>';
          n.node = n.kind === 'k' ? x.db({ at: n.at, r: .6, h: .7, color: 0x5ec8ff, label: n.name + sub })
            : n.kind === 'r' ? x.box({ at: n.at, size: [1, .8, 1], color: 0x7ee0b5, label: n.name + sub })
              : x.box({ at: n.at, size: [.7, .45, .7], color: WARM, label: n.name + sub });
          if (off.has(k)) n.node.paint(0x6b7280).dim();
        }
        const live = k => !off.has(k);
        for (const [a, b] of E) {
          const on = live(a) && live(b), pa = N[a].at, pb = N[b].at;
          x.rail([pa[0], .5, pa[2]], [pb[0], .5, pb[2]], { color: on ? 0x7ee0b5 : 0x6b7280, opacity: on ? .35 : .15, r: .03 });
        }
        // najkraći put kroz mrežu bez ugašenih rutera (krajnji uređaj ne prosleđuje)
        const route = from => {
          const prev = { [from]: null }, q = [from];
          while (q.length) {
            const c = q.shift();
            if (c === 'K') break;
            for (const [a, b] of E) {
              const n = a === c ? b : b === c ? a : null;
              if (!n || n in prev || !live(n) || N[n].kind === 'e') continue;
              prev[n] = c; q.push(n);
            }
          }
          if (!('K' in prev)) return null;
          const path = [];
          for (let c = 'K'; c; c = prev[c]) path.unshift(c);
          return path;
        };
        const sHop = x.stat('hop', 'Skokova', 0), sOk = x.stat('ok', 'Isporučeno', 0), sBad = x.stat('bad', 'Izgubljeno', 0);
        let ok = 0, bad = 0;
        const P = k => [N[k].at[0], .95, N[k].at[2]];
        const deliver = async (from, what) => {
          const path = route(from);
          N[from].node.flash(C.mag, .8);
          if (!path) {
            const first = E.map(([a, b]) => (a === from ? b : b === from ? a : null)).find(Boolean);
            x.say(live(first)
              ? `**${N[from].name}** šalje „${what}” roditelju, ali od njega dalje nema puta: ruteri u dometu su ugašeni. Poruka se gubi.`
              : `**${N[from].name}** šalje „${what}”, ali njegov roditelj je ugašen, a drugog rutera nema u dometu. Poruka se gubi.`);
            await send(x, [P(from), P(first)], C.mag, 4);
            N[first].node.flash(C.err, 1); x.ripple(N[first].at, C.err, 1);
            bad++; sBad.set(bad); sHop.set('—');
            return;
          }
          x.say(`**${N[from].name}** se budi i šalje „${what}” svom roditelju. Put do koordinatora: ${path.map(k => N[k].name).join(' → ')}.`);
          for (let i = 1; i < path.length; i++) {
            await send(x, [P(path[i - 1]), P(path[i])], C.mag, 4.5);
            N[path[i]].node.flash(path[i] === 'K' ? C.ok : 0x7ee0b5, .7);
            sHop.set(i);
          }
          ok++; sOk.set(ok);
        };
        const cycle = async () => {
          await deliver('S1', 'pokret');
          await x.wait(off.size ? 2.8 : 2);
          if (off.size === 1) { x.say('Sijalica 2 je ugašena prekidačem, pa nestaje iz mreže. Mesh sam nalazi **drugi put**, preko utičnice 3: jedan skok više, ali poruka stiže.'); await x.wait(3); }
          await deliver('S2', 'otvoren prozor');
          await x.wait(2.4);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ KNX
  {
    id: 'sh-knx', sym: 'Kx', title: 'KNX',
    tags: ['knx', 'ets', 'grupna adresa', 'group address', 'fizička adresa', 'magistrala', 'bus', 'telegram', 'aktuator', 'knx ip', 'eib'],
    desc: 'KNX je otvoren standard za automatizaciju kuća i zgrada. Uređaji su na zajedničkoj dvožičnoj **magistrali**, svaki ima svoj procesor i parametre, a komande putuju kao **telegrami** upućeni **grupnim adresama**. Taster ne zna koji relej pali: šalje na grupnu adresu, a reaguju svi uređaji koji je slušaju.',
    points: [
      '**Magistrala** (TP) je dvožični kabl koji nosi i napajanje i podatke. Napajanje linije daje oko 30 V DC i uređaji ga dele, pa se broj uređaja i potrošnja po liniji planiraju unapred.',
      '**Fizička adresa** (npr. `1.1.12`) kaže gde je uređaj: oblast, linija, uređaj. Koristi se za programiranje i dijagnostiku.',
      '**Grupna adresa** (npr. `1/0/3`) je funkcija, na primer „svetlo u dnevnoj, uključi”. Taster šalje na nju, a reaguju svi aktuatori koji je slušaju; jedan uređaj može da sluša više grupnih adresa.',
      'Za istu funkciju obično postoje dve adrese: **komanda** i **status**. Aktuator javlja stvarno stanje na statusnu adresu, a paneli i vizualizacija čitaju nju.',
      'Sve se podešava u programu **ETS**: projekat, adrese i parametri uređaja. Uređaji se zatim programiraju preko magistrale ili IP interfejsa.',
      '**KNX IP** interfejs ili ruter povezuje magistralu sa mrežom: za ETS, za vizualizaciju i za povezivanje sa Home Assistant-om ili drugim sistemima.',
      'Logika živi u uređajima, pa osnovne funkcije rade i bez servera ili kontrolera.',
    ],
    table: {
      title: 'Adrese u KNX-u',
      head: ['Adresa', 'Primer', 'Šta znači'],
      rows: [
        ['Fizička', '`1.1.12`', 'oblast 1, linija 1, uređaj 12: gde je uređaj'],
        ['Grupna, komanda', '`1/0/3`', 'svetla, uključi-isključi, dnevna soba plafon'],
        ['Grupna, status', '`1/4/3`', 'stvarno stanje istog svetla; javlja ga aktuator'],
      ],
    },
    code: [
      txt('KNX · plan grupnih adresa', `
1 Svetla
  1/0  Uključi-isključi      1/0/1 Hodnik         1/0/3 Dnevna plafon
  1/1  Dimovanje             1/1/3 Dnevna plafon
  1/2  Jačina (%)            1/2/3 Dnevna plafon
  1/4  Status                1/4/1 Hodnik         1/4/3 Dnevna plafon
2 Roletne
  2/0  Gore-dole             2/0/1 Dnevna levo    2/0/2 Dnevna desno
  2/1  Stop                  2/1/1 Dnevna levo    2/1/2 Dnevna desno
3 Scene
  3/0  Scene kuće            3/0/1 Sve isključi   3/0/2 Dobro jutro`),
      yaml('Home Assistant · KNX svetlo sa statusom', `
knx:
  light:
    - name: dnevna_plafon
      address: "1/0/3"                   # komanda uključi-isključi
      state_address: "1/4/3"             # stvarno stanje, javlja ga aktuator
      brightness_address: "1/2/3"        # jačina u procentima
      brightness_state_address: "1/4/4"`),
    ],
    pitfalls: [
      'Bez statusnih adresa panel prikazuje ono što je poslao, a ne ono što se desilo: posle ručnog uključenja ili nestanka struje prikaz nije tačan.',
      'Plan grupnih adresa smišljen usput: posle godinu dana niko ne zna šta je `4/7/23`. Plan se pravi pre ETS-a, po funkciji i prostoriji.',
      'ETS projekat koji postoji samo na laptopu izvođača: bez njega se instalacija ne može menjati. Projekat se predaje investitoru.',
      'Previše uređaja na jednoj liniji: napajanje linije ne izdrži i javljaju se greške koje se teško traže. Linije se planiraju sa rezervom.',
      'KNX IP bez zaštite u kućnoj mreži: ko je u mreži, može da šalje telegrame. Pomaže KNX Secure ili bar odvojena mreža.',
    ],
    rel: ['sh-sistem', 'sh-dali', 'sh-ha', 'ei-rs485'],
    viz: {
      knobs: [{ id: 'ga', label: 'Taster šalje', value: '1', options: [['1', '1/0/3 · dnevna'], ['2', '1/0/1 · hodnik'], ['3', '3/0/1 · sve isključi']] }],
      build(x) {
        const { C } = x, mode = x.p.ga, GA = { 1: '1/0/3', 2: '1/0/1', 3: '3/0/1' }[mode];
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        const XMIN = -9.6, XMAX = 9.6, BY = .1;
        x.rail([XMIN, BY, 0], [XMAX, BY, 0], { color: BUS, opacity: .85, r: .07 });
        x.label('Magistrala KNX TP', [XMIN + .2, .25, .35], { cls: 'tag', color: BUS, center: [0, 0] });
        const D = [];
        const dev = (n, X, Z, listens, lamp) => { const d = { n, x: X, z: Z, listens, lamp }; D.push(d); x.rail([X, BY, Z], [X, BY, 0], { color: BUS, opacity: .7, r: .05 }); return d; };
        dev(x.box({ at: [-8.4, 0, -1.8], size: [1.2, .9, .9], color: 0x9aa4b5, label: 'Napajanje linije<small>oko 30 V DC</small>' }), -8.4, -1.8, []);
        const T = dev(x.box({ at: [-5.4, 0, 1.9], size: [.8, .9, .24], label: `Taster<small>šalje ${GA}</small>` }), -5.4, 1.9, []);
        const lamp = (X, l) => bulb(x, [X, 2, -4.4], l);
        const A1 = dev(x.box({ at: [-2.2, 0, -1.8], size: [1.2, .95, .9], label: 'Aktuator 1<small>sluša 1/0/3, 3/0/1</small>' }), -2.2, -1.8, ['1/0/3', '3/0/1'], lamp(-2.2, 'Dnevna plafon'));
        const DM = dev(x.box({ at: [1.2, 0, -1.8], size: [1.2, .95, .9], label: 'Dimer<small>sluša 1/0/3, 3/0/1</small>' }), 1.2, -1.8, ['1/0/3', '3/0/1'], lamp(1.2, 'LED traka'));
        const A2 = dev(x.box({ at: [4.6, 0, -1.8], size: [1.2, .95, .9], label: 'Aktuator 2<small>sluša 1/0/1, 3/0/1</small>' }), 4.6, -1.8, ['1/0/1', '3/0/1'], lamp(4.6, 'Hodnik'));
        const P = dev(x.box({ at: [6.6, 0, 1.9], size: [1.3, .8, .18], color: 0xc3a6ff, label: 'Panel<small>čita statuse</small>' }), 6.6, 1.9, ['1/4/3', '1/4/1']);
        dev(x.box({ at: [8.8, 0, -1.8], size: [1, .8, .8], color: 0x5ec8ff, label: 'KNX IP<small>ETS, vizualizacija</small>' }), 8.8, -1.8, []);
        for (const d of [A1, DM, A2]) x.rail([d.x, .12, d.z], [d.x, .12, -4.4], { color: PWR, opacity: .55 });
        const st = { '1/4/3': 0, '1/4/1': 0 };
        const show = x.label('', [6.6, .1, 2.6], { cls: 'tag', center: [.5, 0] });
        const onoff = v => (v ? 'uključeno' : 'isključeno');
        const paint = () => show.set(`Dnevna: ${onoff(st['1/4/3'])} · Hodnik: ${onoff(st['1/4/1'])}`);
        paint();
        const sTg = x.stat('tg', 'Telegrama', 0), sRe = x.stat('re', 'Reagovalo uređaja', 0);
        let tg = 0, re = 0;
        const SPEED = 8;
        // telegram ide od uređaja na magistralu i širi se na obe strane; reaguju oni koji slušaju adresu
        const telegram = async (src, ga, val, color = C.mag) => {
          tg++; sTg.set(tg);
          await send(x, [[src.x, 1.2, src.z], [src.x, .35, src.z], [src.x, .35, 0]], color, 7);
          const L = x.orb(color, { r: .2, label: `${ga} = ${val}`, at: [src.x, .35, 0] }), R = x.orb(color, { r: .2, at: [src.x, .35, 0] });
          const acts = [];
          const done = Promise.all([x.move(L, [[src.x, .35, 0], [XMIN, .35, 0]], SPEED), x.move(R, [[src.x, .35, 0], [XMAX, .35, 0]], SPEED)]);
          for (const d of D) {
            if (d === src) continue;
            acts.push(x.wait(Math.abs(d.x - src.x) / SPEED).then(() => {
              if (!d.listens.includes(ga)) { d.n.flash(0x6b7280, .35); return; }
              d.n.flash(C.ok, .9); re++; sRe.set(re);
              if (d.lamp) d.lamp.set(val ? (d === DM ? .5 : 1) : 0);
              if (d === P) { st[ga] = val; paint(); }
            }));
          }
          await Promise.all([done, ...acts]);
          x.remove(L); x.remove(R);
        };
        const status = async (d, ga) => telegram(d, ga, d.lamp.on ? 1 : 0, C.sky);
        const cycle = async () => {
          if (mode === '3') {
            for (const d of [A1, DM, A2]) d.lamp.set(d === DM ? .5 : 1);
            st['1/4/3'] = st['1/4/1'] = 1; paint();
            T.n.flash(C.mag, .8);
            x.say('Taster šalje **scenu** na `3/0/1`. Sva tri aktuatora slušaju tu adresu, pa jednim telegramom gase sve. Nijedan centralni uređaj ne učestvuje.');
            await telegram(T, '3/0/1', 0);
            await x.wait(.6);
            x.say('Aktuatori javljaju **status** na svoje statusne adrese (plavo). Panel ih čita i pokazuje stvarno stanje.');
            await status(A1, '1/4/3');
            await status(A2, '1/4/1');
            await x.wait(2.6);
            return;
          }
          const act = mode === '1' ? A1 : A2, sga = mode === '1' ? '1/4/3' : '1/4/1';
          for (const v of [1, 0]) {
            T.n.flash(C.mag, .8);
            x.say(v
              ? `Taster šalje telegram **${GA} = 1** na magistralu. Svi uređaji ga vide; reaguju samo oni koji slušaju ${GA}${mode === '1' ? ': aktuator 1 i dimer, iz jednog pritiska.' : ': aktuator 2.'}`
              : `Drugi pritisak šalje **${GA} = 0** i ista grupa se gasi.`);
            await telegram(T, GA, v);
            await x.wait(.5);
            x.say('Aktuator javlja **status** na statusnu adresu (plavo), a panel prikazuje stvarno stanje, a ne ono što je neko poslao.');
            await status(act, sga);
            await x.wait(2.2);
          }
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Home Assistant
  {
    id: 'sh-ha', sym: 'Ha', title: 'Home Assistant',
    tags: ['home assistant', 'hass', 'automatizacija', 'automation', 'entitet', 'entity', 'integracija', 'integration', 'esphome', 'yaml', 'trigger', 'okidač'],
    desc: 'Home Assistant je otvorena platforma koja radi na računaru u kući (mini PC, Raspberry Pi ili virtuelna mašina) i spaja uređaje različitih proizvođača preko **integracija**. Svaki uređaj postaje skup **entiteta** sa stanjem, a **automatizacije** reaguju na promene stanja: okidač, uslov, akcija.',
    points: [
      '**Integracija** zna da razgovara sa jednom vrstom uređaja ili servisa: Zigbee (ZHA ili Zigbee2MQTT), MQTT, KNX, Modbus, ESPHome, cloud servisi proizvođača.',
      '**Entitet** je jedno stanje ili jedna kontrola: `light.hodnik`, `binary_sensor.hodnik_pokret`, `sensor.kupatilo_vlaga`. Jedan uređaj obično ima više entiteta.',
      '**Automatizacija** ima okidač (šta se desilo), uslove (da li sme) i akcije (šta da uradi). **Skripta** je niz akcija bez okidača, a **scena** pamti željena stanja više entiteta.',
      '**ESPHome** pravi firmver za ESP32 iz YAML opisa, a uređaj se sam pojavi u Home Assistant-u i radi lokalno, bez clouda.',
      'Automatizacije se izvršavaju u kući i rade bez interneta, osim integracija koje zavise od clouda proizvođača.',
      'Konfiguracija se čuva u **rezervnim kopijama**; kopija van tog računara (NAS, cloud) je jedini spas kad otkaže kartica ili disk.',
    ],
    code: [
      yaml('Home Assistant · svetlo u hodniku na pokret', `
# kad je mrak: svetlo na pokret, gasi se 2 minuta posle poslednjeg pokreta
alias: hodnik-svetlo-na-pokret
mode: restart                        # novi pokret ponovo pokreće odbrojavanje
triggers:
  - trigger: state
    entity_id: binary_sensor.hodnik_pokret
    to: "on"
conditions:
  - condition: numeric_state
    entity_id: sensor.hodnik_osvetljenost
    below: 20                        # luksa
actions:
  - action: light.turn_on
    target:
      entity_id: light.hodnik
    data:
      brightness_pct: 60
  - wait_for_trigger:
      - trigger: state
        entity_id: binary_sensor.hodnik_pokret
        to: "off"
        for: "00:02:00"
  - action: light.turn_off
    target:
      entity_id: light.hodnik`),
      yaml('ESPHome · temperatura, vlaga i relej na ESP32', `
esphome:
  name: kupatilo-modul
esp32:
  board: esp32dev
wifi:
  ssid: !secret wifi_ssid
  password: !secret wifi_password
api:                                 # lokalna veza sa Home Assistant-om
ota:
  - platform: esphome                # novi firmver preko mreže
sensor:
  - platform: dht
    pin: GPIO4
    temperature:
      name: kupatilo-temperatura
    humidity:
      name: kupatilo-vlaga
    update_interval: 30s
switch:
  - platform: gpio
    pin: GPIO26
    name: kupatilo-ventilator        # relej za ventilator`),
    ],
    pitfalls: [
      'Home Assistant na SD kartici u Raspberry Pi-ju: posle nekoliko meseci upisa u bazu kartica otkaže. Bolji su SSD ili mini PC, uz redovne kopije.',
      'Automatizacija bez dobrog `mode`: na svaki pokret pokreće se nova kopija, pa svetlo trepće ili se gasi dok je neko u prostoriji.',
      'Sve zavisi od jednog računara: kad on stane, staju sve automatizacije. Osnovne funkcije treba da rade i bez njega.',
      'Ažuriranje odmah po izlasku nove verzije, bez kopije: integracija se promeni baš kad nikog nema kod kuće.',
    ],
    rel: ['ei-mqtt', 'sh-scene', 'sh-zigbee', 'ei-firmware'],
    viz: {
      knobs: [{ id: 'lux', label: 'Osvetljenost u hodniku', value: 8, options: [[8, 'mrak · 8 lx'], [240, 'dan · 240 lx']] }],
      build(x) {
        const { C } = x, lux = x.p.lux, dark = lux < 20;
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        const HA = x.box({ at: [0, 0, -.4], size: [2.6, 1.4, 1.8], color: 0x41bdf5, label: 'Home Assistant<small>računar u kući</small>' });
        const Z = x.db({ at: [-7, 0, -3.2], r: .55, h: .6, color: 0x7ee0b5, label: 'Zigbee<small>senzor pokreta</small>', side: 'left' });
        const E = x.box({ at: [-7, 0, 0], size: [1, .7, .8], color: 0xffd166, label: 'ESPHome<small>osvetljenost</small>', side: 'left' });
        const M = x.box({ at: [-7, 0, 3.2], size: [1, .7, .8], color: 0xc3a6ff, label: 'MQTT<small>temperatura</small>', side: 'left' });
        const L = bulb(x, [7, 2.3, -1.2], 'Svetlo hodnik');
        const STEP = [['Okidač', -2.6], ['Uslov', 0], ['Akcija', 2.6]].map(([n, X]) => x.box({ at: [X, 0, 3.2], size: [1.7, .5, .9], color: 0x9aa4b5, label: n }));
        for (const n of [Z, E, M]) x.rail([n.pos.x, .12, n.pos.z], [-1.3, .12, -.4], { color: CMD, opacity: .4 });
        x.rail([1.3, .12, -.4], [7, .12, -1.2], { color: CMD, opacity: .4 });
        for (let i = 0; i < 2; i++) x.arrow([STEP[i].pos.x + .9, .3, 3.2], [STEP[i + 1].pos.x - .9, .3, 3.2], { color: 0x9aa4b5, opacity: .6, head: .26 });
        x.label('Automatizacija', [-3.5, .1, 4.1], { cls: 'plate', center: [0, 0] });
        const ent = { mot: 'off', lit: 'off', temp: '21,5' };
        const box = x.label('', [0, 3.1, -.4], { center: [.5, 1] });
        const paint = () => box.set(`<span class="m">binary_sensor.hodnik_pokret: ${ent.mot}<br>sensor.hodnik_osvetljenost: ${lux} lx<br>sensor.dnevna_temperatura: ${ent.temp} °C<br>light.hodnik: ${ent.lit}</span>`);
        paint();
        const sSt = x.stat('st', 'Promena stanja', 0), sRun = x.stat('run', 'Pokretanja automatizacije', 0), sAct = x.stat('act', 'Izvršeno akcija', 0);
        let nst = 0, nrun = 0, nact = 0;
        const H = .9, P = n => [n.pos.x, H, n.pos.z], hp = [0, H, -.4];
        const state = async (src, f) => { src.flash(C.mag, .6); await send(x, [P(src), hp], C.mag, 8); HA.flash(C.sky, .6); f(); paint(); nst++; sSt.set(nst); };
        const cycle = async () => {
          x.say('**Integracije** donose promene stanja: MQTT javlja temperaturu, ESPHome osvetljenost. Svaka promena menja stanje jednog **entiteta**.');
          await state(M, () => { ent.temp = ent.temp === '21,5' ? '21,6' : '21,5'; });
          await state(E, () => {});
          await x.wait(1.2);
          x.say('Zigbee senzor javlja **pokret**: `binary_sensor.hodnik_pokret` prelazi u `on`. To je **okidač** automatizacije.');
          await state(Z, () => { ent.mot = 'on'; });
          STEP[0].flash(C.mag, 1); nrun++; sRun.set(nrun);
          await x.wait(1.2);
          if (!dark) {
            STEP[1].flash(C.err, 1.2);
            x.say(`**Uslov** traži osvetljenost ispod 20 lx, a sada je ${lux} lx. Automatizacija se zaustavlja i svetlo ostaje ugašeno.`);
            await x.wait(3.2);
            ent.mot = 'off'; paint();
            await x.wait(1);
            return;
          }
          STEP[1].flash(C.ok, 1);
          x.say(`**Uslov**: osvetljenost je ${lux} lx, ispod granice od 20 lx, pa automatizacija ide dalje.`);
          await x.wait(1.6);
          STEP[2].flash(C.ok, 1);
          x.say('**Akcija** `light.turn_on` sa 60 % jačine. Home Assistant šalje komandu svetlu kroz njegovu integraciju.');
          await send(x, [hp, [7, H, -1.2]], C.mag, 8);
          L.set(.6); ent.lit = 'on'; paint(); nact++; sAct.set(nact);
          await x.wait(2.2);
          ent.mot = 'off'; paint();
          x.say('Pokret je prestao. Automatizacija čeka 2 minuta bez pokreta (`wait_for_trigger`), pa gasi svetlo. Novi pokret u tom vremenu ponovo pokreće odbrojavanje (`mode: restart`).');
          await x.wait(3.2);
          await send(x, [hp, [7, H, -1.2]], C.mag, 8);
          L.set(0); ent.lit = 'off'; paint(); nact++; sAct.set(nact);
          await x.wait(1.4);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Rasveta
  {
    id: 'sh-rasveta', sym: 'Rv', title: 'Rasveta',
    tags: ['rasveta', 'dimer', 'dimovanje', 'fazno odsecanje', 'leading edge', 'trailing edge', 'led traka', 'pad napona', 'pwm', '0-10 v', '1-10 v', 'dali', 'rgbw', 'cct', 'lighting', 'dimming'],
    desc: 'Svetlo se uključuje relejem, a dimuje na više načina: **faznim odsecanjem** mrežnog napona, signalom **0–10 V**, **DALI** komandama ili **PWM-om** na LED traci. Kod LED traka najčešći problem nije upravljanje nego **pad napona**: na kraju duge trake svetlo je slabije.',
    points: [
      '**Fazni dimer** seče deo sinusoide od 230 V. **Leading edge** (odsecanje na početku poluperiode) je za klasične sijalice i induktivna opterećenja, **trailing edge** (na kraju) za LED drajvere i elektronske transformatore.',
      'LED svetiljka mora da bude označena kao dimabilna i da odgovara tipu dimera; inače treperi, zuji ili ne može da se spusti na nisku jačinu.',
      '**0–10 V** i **1–10 V** su analogni signali do drajvera: jednostavni, ali bez povratne informacije, a svaki izlaz traži svoje žice.',
      '**DALI** daje svakoj svetiljci adresu i vraća informaciju o stanju i kvaru.',
      '**LED trake** na 12 V ili 24 V dimuju se PWM-om. Struja kroz tanke bakarne staze trake pravi pad napona, pa duga traka traži napajanje sa oba kraja ili traku na 24 V.',
      '**Temperatura boje** (2700 K toplo, 4000 K neutralno): tunable white traka ima dva kanala, RGBW četiri, svaki sa svojim PWM izlazom.',
    ],
    table: {
      title: 'Načini dimovanja',
      head: ['Način', 'Gde', 'Povratna informacija', 'Napomena'],
      rows: [
        ['Fazno odsecanje', 'mrežni napon 230 V', 'ne', 'tip dimera mora da odgovara svetiljci'],
        ['0–10 V i 1–10 V', 'drajver, posebne žice', 'ne', 'jedan krug po izlazu'],
        ['DALI', 'drajver, dvožična magistrala', 'da', 'adrese, grupe i scene'],
        ['PWM', 'LED traka 12 V ili 24 V', 'ne', 'pad napona na dugim trakama'],
      ],
    },
    code: [
      txt('Proračun · struja i pad napona na LED traci', `
Traka: 5 m, 14,4 W/m, napajanje sa jednog kraja
Snaga:  5 m × 14,4 W/m = 72 W
Struja: na 12 V → 72 W / 12 V = 6 A        na 24 V → 72 W / 24 V = 3 A

Pad napona raste sa strujom (I · R), a gubitak snage sa kvadratom struje (I² · R).
Na 24 V struja je dva puta manja, pa je i pad napona dva puta manji,
a gubitak u stazama trake četiri puta manji.
Dugu traku napajaj sa oba kraja ili iz sredine, a kabl od napajanja
do trake biraj prema struji i dužini.`),
    ],
    pitfalls: [
      'Dimer za klasične sijalice na LED svetiljci: treperenje, zujanje i kraći vek drajvera.',
      'Duga LED traka napajana samo sa jednog kraja: kraj je vidno slabiji. Pomaže napajanje sa oba kraja, iz sredine ili traka na 24 V.',
      'Napajanje trake opterećeno do kraja: greje se i otkazuje. Uobičajena je rezerva od oko 20 %.',
      'Tanak kabl od napajanja do udaljene trake: napon padne pre nego što struja uopšte stigne do trake.',
    ],
    rel: ['sh-dali', 'el-kabl', 'ei-prekidaci', 'sh-scene'],
    viz: {
      knobs: [
        { id: 'v', label: 'Napon trake', value: 12, options: [[12, '12 V'], [24, '24 V']] },
        { id: 'len', label: 'Dužina', value: 5, options: [[5, '5 m'], [10, '10 m']] },
        { id: 'feed', label: 'Napajanje', value: 'one', options: [['one', 'sa jednog kraja'], ['both', 'sa oba kraja']] },
      ],
      build(x) {
        const { C, THREE } = x, V0 = x.p.v, LEN = x.p.len, both = x.p.feed === 'both';
        x.view({ dir: [0, 6, 11], top: 56 });
        // ravnomerno opterećenje: 14,4 W/m; otpor oba provodnika trake oko 0,08 Ω/m
        const I = 14.4 * LEN / V0, r = .08, i = I / LEN;
        const drop = s => { const u = both ? Math.min(s, LEN - s) : s, Lh = both ? LEN / 2 : LEN; return r * i * (Lh * u - u * u / 2); };
        const volt = s => V0 - drop(s), bright = v => Math.max(0, Math.min(1, (v - .75 * V0) / (.25 * V0)));
        const N = 44, X0 = -8.6, X1 = 8.6, sx = k => X0 + (X1 - X0) * k / (N - 1);
        x.plate({ w: 19.4, d: 4.6, at: [0, 0, 0], label: `LED traka · ${LEN} m · ${V0} V`, fill: 0x232a36, color: 0x6c7a92 });
        x.box({ at: [0, 0, 0], size: [17.6, .08, .5], color: 0xdedfe2 });
        let vmin = V0;
        for (let k = 0; k < N; k++) {
          const s = LEN * k / (N - 1), v = volt(s), b = bright(v);
          vmin = Math.min(vmin, v);
          const c = new THREE.Color(OFF).lerp(new THREE.Color(WARM), b), m = x.chip(c.getHex(), { s: .28, at: [sx(k), .2, 0], fit: true, glow: .1 + .9 * b });
          m.material.emissive.copy(c);
        }
        // napon duž trake: linija iznad trake (vrh = puni napon)
        const gy = v => 1.2 + 2.2 * Math.max(0, (v - .5 * V0) / (.5 * V0));
        x.line(Array.from({ length: N }, (_, k) => [sx(k), gy(volt(LEN * k / (N - 1))), -.6]), C.sky, { opacity: .9 });
        x.line([[X0, gy(V0), -.6], [X1, gy(V0), -.6]], 0x6b7280, { opacity: .5 });
        const fmt = v => dec(v, 1) + ' V';
        x.label(fmt(V0), [X0 - .2, gy(V0), -.6], { cls: 'tag', center: [1, .5] });
        const kmin = both ? (N - 1) / 2 : N - 1;
        x.label(`${both ? 'u sredini' : 'na kraju'} ${fmt(vmin)}`, [sx(kmin), gy(vmin) + .15, -.6], { cls: vmin < .9 * V0 ? 'err' : 'tag', center: [both ? .5 : 1, 1] });
        const feeds = both ? [X0, X1] : [X0];
        for (const X of feeds) {
          const px = X < 0 ? X0 - 1.4 : X1 + 1.4;
          x.box({ at: [px, 0, 1.4], size: [1.4, .7, .9], color: 0x9aa4b5, label: `Napajanje ${V0} V`, side: X < 0 ? 'left' : 'right' });
          x.rail([px, .15, 1.4], [X, .15, 0], { color: PWR, opacity: .7 });
        }
        const pct = (V0 - vmin) / V0 * 100;
        x.stat('vmin', both ? 'Napon u sredini' : 'Napon na kraju', fmt(vmin));
        x.stat('pad', 'Pad napona', dec(pct, 1) + ' %');
        x.stat('i', 'Struja napajanja', dec(I, 1) + ' A');
        x.say(pct > 10
          ? `Traka vuče **${dec(I, 1)} A**. Na stazama trake gubi se ${dec(V0 - vmin, 1)} V (${dec(pct, 0)} %), pa LED-ovi ${both ? 'u sredini' : 'na kraju'} vidno slabije svetle. Probaj 24 V ili napajanje sa oba kraja.`
          : pct > 4
            ? `Pad od ${dec(pct, 1)} % se primećuje na belom zidu, ali je prihvatljiv. Struja je ${dec(I, 1)} A.`
            : `Pad je samo ${dec(pct, 1)} %: traka svetli ujednačeno. Manja struja (${dec(I, 1)} A) i kraći put struje rade zajedno.`);
        // struja teče od napajanja kroz traku
        const flow = async X => {
          const end = both ? 0 : X1, o = x.orb(C.mag, { r: .14, at: [X, .45, 0] });
          await x.move(o, [[X, .45, 0], [both ? (X < 0 ? -.2 : .2) : end, .45, 0]], 4);
          x.remove(o);
        };
        x.every(.55, () => { for (const X of feeds) x.spawn(() => flow(X)); });
      },
    },
  },

  // ------------------------------------------------------------------ Scene i automatizacije
  {
    id: 'sh-scene', sym: 'Sc', title: 'Scene i automatizacije',
    tags: ['scena', 'scene', 'automatizacija', 'automation', 'okidač', 'uslov', 'akcija', 'trigger', 'condition', 'prisustvo', 'presence', 'mmwave'],
    desc: '**Scena** je skup željenih stanja koji se primeni odjednom: „Film” spušta roletnu, gasi plafon i pali LED traku na 20 %. **Automatizacija** je pravilo koje kuća izvršava sama: kad se desi okidač i ispunjeni su uslovi, izvrši akcije. Dobra automatizacija se ne primećuje; loša pali svetlo kad to niko ne želi.',
    points: [
      'Scena ne pamti korake nego **stanja**: svaki uređaj ide u svoje stanje, bez obzira na to kakav je bio pre.',
      '**Okidač** je događaj: pokret, otvorena vrata, zalazak sunca, vreme, pritisak tastera. **Uslov** proverava stanje u tom trenutku: da li je mrak, da li je neko kod kuće. **Akcija** menja stanja ili poziva scenu.',
      '**Prisustvo** je teže od pokreta: senzor pokreta ne vidi osobu koja mirno sedi. Pomažu mmWave senzori prisustva i duže vreme gašenja.',
      'Ručna komanda ima prednost: taster na zidu uvek radi, a automatizacija ne sme odmah da ponovi ono što je čovek upravo poništio.',
      'Vreme gašenja i osetljivost podešavaju se po prostoriji: hodnik nekoliko minuta, kupatilo duže.',
      'Ista scena se poziva sa više mesta: taster, panel, aplikacija, glas ili druga automatizacija.',
    ],
    code: [
      yaml('Home Assistant · scena „Film” (scenes.yaml)', `
# scena pamti željena stanja; poziva se tasterom, sa panela ili iz automatizacije
- id: film
  name: Film
  entities:
    light.dnevna_plafon:
      state: "off"
    light.dnevna_led_traka:
      state: "on"
      brightness: 51                 # oko 20 %
    cover.dnevna_roletna:
      state: closed
    media_player.tv:
      state: "on"`),
    ],
    pitfalls: [
      'Automatizacija koja gasi svetlo dok neko mirno sedi ili čita: senzor pokreta nije senzor prisustva.',
      'Ista funkcija u dve automatizacije koje se međusobno poništavaju: svetlo se pali i gasi u krug.',
      'Automatizacija koja ne poštuje ručnu promenu: čovek ugasi svetlo, a ona ga posle minut ponovo upali.',
      'Scene sa jačinama koje niko ne prilagođava: posle nekoliko meseci ukućani ih zaobilaze i sve pale ručno.',
    ],
    rel: ['sh-ha', 'sh-rasveta', 'sh-paneli', 'sh-knx'],
    viz: {
      knobs: [
        { id: 'mode', label: 'Prikaz', value: 'scene', options: [['scene', 'scena „Film”'], ['auto', 'automatizacija u hodniku']] },
        { id: 'dark', label: 'Napolju', value: 1, options: [[1, 'mrak'], [0, 'dan']] },
      ],
      build(x) {
        const { C } = x, scene = x.p.mode === 'scene', dark = !!x.p.dark;
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        x.plate({ w: 11, d: 8, at: [-3.6, 0, 0], label: 'Dnevna soba' });
        x.plate({ w: 6, d: 8, at: [5.4, 0, 0], label: 'Hodnik' });
        const K = x.box({ at: [1.8, 0, -3], size: [1.4, 1, 1], color: 0x5ec8ff, label: 'Kontroler' });
        const L1 = bulb(x, [-6.6, 2.4, -1.2], 'Plafon'), L2 = bulb(x, [-3.4, 1.6, -2.4], 'LED traka'), L3 = bulb(x, [5.6, 2.4, -1], 'Svetlo hodnik');
        // prozor sa roletnom i televizor
        x.box({ at: [-.8, .3, -3.7], size: [2.2, 1.7, .1], color: 0xcfe0ff });
        const blind = x.box({ at: [-.8, .3, -3.6], size: [2.2, 1.7, .12], color: 0x9aa4b5 });
        x.label('Roletna', [-.8, 2.2, -3.6]);
        const TOP = .3 + 1.7;
        const setBlind = k => { blind.o.scale.y = Math.max(.02, k); blind.o.position.y = TOP - 1.7 * Math.max(.02, k) / 2; };
        const tv = x.box({ at: [-4.6, 0, 2.4], size: [2, 1.1, .14], color: 0x2b303a, label: 'TV' });
        const P = x.box({ at: [-8, 0, 2.4], size: [1.1, .8, .18], color: 0xc3a6ff, label: 'Panel<small>scena „Film”</small>' });
        const S = x.db({ at: [7, 0, 2.2], r: .36, h: .42, color: 0xc3a6ff, label: 'Senzor pokreta' });
        const cond = x.label('', [4.2, .1, 3.6], { cls: 'tag', center: [.5, 0] });
        let blindK = .05, tvOn = false;
        const tvSet = v => { tvOn = v; tv.o.material.emissive.set(v ? 0x5ec8ff : 0x000000); tv.o.material.emissiveIntensity = v ? .7 : 0; };
        const sCmd = x.stat('cmd', 'Komandi', 0), sRun = x.stat('run', 'Pokretanja', 0);
        let ncmd = 0, nrun = 0;
        const H = .9, at = n => [n.pos.x, H, n.pos.z], kp = at(K);
        const cmd = async (to, color = C.mag) => { ncmd++; sCmd.set(ncmd); await send(x, [kp, to], color, 8); };
        const home = () => { L1.set(1); L2.set(0); L3.set(0); blindK = .05; setBlind(blindK); tvSet(false); };
        if (scene) {
          cond.set('');
          const cycle = async () => {
            home();
            x.say('Uveče u dnevnoj sobi: upaljen je plafon, roletna je gore, TV je ugašen.');
            await x.wait(2.2);
            P.flash(C.mag, .8);
            x.say('Na panelu je izabrana scena **„Film”**. Panel šalje kontroleru samo jedno: „scena Film”.');
            await send(x, [[P.pos.x, H + .4, P.pos.z], at(P), kp], C.mag, 8);
            K.flash(C.ok, .8); nrun++; sRun.set(nrun);
            x.say('Kontroler zna **stanja** za tu scenu i šalje četiri komande odjednom: plafon isključi, LED traka 20 %, roletna dole, TV uključi.');
            await Promise.all([
              cmd([L1.m.position.x, H, L1.m.position.z]).then(() => L1.set(0)),
              cmd([L2.m.position.x, H, L2.m.position.z]).then(() => L2.set(.2)),
              cmd([-.8, H, -3.4]).then(() => x.tween(1.6, k => setBlind(.05 + .95 * k))),
              cmd(at(tv)).then(() => tvSet(true)),
            ]);
            await x.wait(3.2);
          };
          x.spawn(async () => { while (x.alive) await cycle(); });
          return;
        }
        L1.set(0); L2.set(0); L3.set(0); setBlind(.05);
        const cycle = async () => {
          cond.set(dark ? 'Uslov: mrak · ispunjen' : 'Uslov: mrak · nije ispunjen');
          S.flash(C.mag, .8);
          x.say('**Okidač**: senzor u hodniku javlja pokret.');
          await send(x, [[S.pos.x, H + .4, S.pos.z], at(S), kp], C.mag, 8);
          nrun++; sRun.set(nrun);
          if (!dark) {
            K.flash(C.err, 1);
            x.say('**Uslov** „mrak” nije ispunjen: danju je hodnik dovoljno svetao. Automatizacija se zaustavlja, svetlo ostaje ugašeno.');
            await x.wait(3.4);
            return;
          }
          K.flash(C.ok, .8);
          x.say('**Uslov** je ispunjen (mrak), pa ide **akcija**: svetlo u hodniku na 30 %, da ne zaslepi noću.');
          await cmd([L3.m.position.x, H, L3.m.position.z]);
          L3.set(.3);
          await x.wait(2.4);
          x.say('Posle 2 minuta bez pokreta automatizacija gasi svetlo. Novi pokret u međuvremenu ponovo pokreće odbrojavanje.');
          await x.wait(2.6);
          await cmd([L3.m.position.x, H, L3.m.position.z]);
          L3.set(0);
          await x.wait(1.4);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Thread i Matter
  {
    id: 'sh-matter', sym: 'Mt', title: 'Thread i Matter',
    tags: ['matter', 'thread', 'border router', 'multi-admin', 'fabric', 'commissioning', 'ipv6', 'mesh', 'csa'],
    desc: '**Matter** je zajednički aplikacioni standard za smart home uređaje: isti uređaj radi sa više ekosistema i upravlja se lokalno, preko IP mreže. **Thread** je bežična IP mesh mreža male potrošnje kojom Matter uređaji često putuju, a u kućnu mrežu ulazi preko **border routera**.',
    points: [
      'Matter radi preko IP-a: Wi‑Fi, Ethernet ili Thread. Komande ostaju u kućnoj mreži, pa internet nije potreban za upravljanje.',
      '**Thread** je mesh kao Zigbee, ali svaki uređaj ima svoju IPv6 adresu. Uređaji na struji su ruteri, a baterijski su krajnji uređaji koji uglavnom spavaju.',
      '**Border router** povezuje Thread mesh sa kućnom mrežom. Može ih biti više; kad jedan nestane, saobraćaj ide preko drugog.',
      '**Commissioning**: uređaj se dodaje skeniranjem QR koda ili unosom koda za uparivanje; tada dobija sertifikat i ulazi u **fabric** kontrolera.',
      '**Multi-admin**: isti uređaj može da bude u više fabric-a odjednom, pa njime upravljaju dva ekosistema, na primer aplikacija proizvođača i Home Assistant.',
      'Matter opisuje uređaje preko **klastera** (On/Off, Level Control, Color Control). Ono što standard ne pokriva ostaje u aplikaciji proizvođača, pa podrška nije svuda ista.',
    ],
    code: [
      txt('Matter · dodavanje uređaja (commissioning)', `
1. Uređaj se oglašava preko BLE-a (ili na mreži) i čeka kod za uparivanje.
2. Kontroler skenira QR kod i dobija kod i podatke o uređaju.
3. Proverava se sertifikat uređaja: da je pravi, sertifikovan proizvod.
4. Kontroler daje uređaju mrežne podatke: Wi-Fi lozinku ili podatke Thread mreže.
5. Uređaj dobija operativni sertifikat i ulazi u fabric kontrolera.
6. Za drugi ekosistem: u prvom se otvori prozor za uparivanje i postupak se ponovi.`),
    ],
    pitfalls: [
      'Thread uređaj u kući bez border routera nema kako da stigne do kućne mreže. Border router je obično ugrađen u hub, pametni zvučnik ili ruter.',
      'Više odvojenih Thread mreža različitih proizvođača: uređaji su podeljeni, a svaki mesh slabiji. Pomaže kad border routeri dele istu Thread mrežu.',
      'Očekivanje da Matter donosi sve funkcije uređaja: napredna podešavanja često ostaju samo u aplikaciji proizvođača.',
      'IPv6 ili multicast blokiran u kućnoj mreži: Matter uređaji se ne pronalaze ili povremeno nestaju.',
    ],
    rel: ['sh-zigbee', 'sh-lokalno', 'sh-ha', 'ei-wifi'],
    viz: {
      knobs: [
        { id: 'br', label: 'Border routeri', value: 0, options: [[0, 'oba rade'], [1, 'border router 1 ugašen']] },
        { id: 'net', label: 'Internet', value: 1, options: [[1, 'radi'], [0, 'ne radi']] },
      ],
      build(x) {
        const { C } = x, br1off = !!x.p.br, net = !!x.p.net;
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        x.plate({ w: 8.4, d: 8.4, at: [-5.4, 0, 0], label: 'Thread mesh' });
        x.plate({ w: 9.4, d: 8.4, at: [3.9, 0, 0], label: 'Kućna mreža (Wi‑Fi, Ethernet)', fill: 0x232a36, color: 0x6c7a92, lpos: 'front' });
        const net0 = x.box({ at: [4.6, 0, -3.4], size: [1.6, .6, .8], color: 0x9aa4b5, label: net ? 'Internet<small>nije potreban</small>' : 'Internet<small>ne radi, nije bitno</small>' });
        net0.dim();
        const W = x.db({ at: [3.4, 0, 0], r: .55, h: .5, color: 0x9aa4b5, label: 'Ruter' });
        const B1 = x.box({ at: [-.6, 0, -2], size: [1.2, .8, .9], color: 0x7ee0b5, label: 'Border router 1' });
        const B2 = x.box({ at: [-.6, 0, 2.2], size: [1.2, .8, .9], color: 0x7ee0b5, label: 'Border router 2' });
        if (br1off) B1.paint(0x6b7280).dim();
        const CA = x.box({ at: [7.4, 0, -.4], size: [.6, 1, .16], color: 0xc3a6ff, label: 'Kontroler A<small>aplikacija proizvođača</small>' });
        const CB = x.box({ at: [6.4, 0, 2.8], size: [1.3, .8, .9], color: 0x41bdf5, label: 'Kontroler B<small>Home Assistant</small>' });
        const T1 = x.box({ at: [-4, 0, -1.4], size: [.9, .7, .9], color: 0x7ee0b5, label: 'Sijalica<small>Thread ruter</small>' });
        const T2 = x.box({ at: [-4.4, 0, 2.6], size: [.9, .7, .9], color: 0x7ee0b5, label: 'Utičnica<small>Thread ruter</small>' });
        const S = x.box({ at: [-8.2, 0, .4], size: [.7, .45, .7], color: WARM, label: 'Senzor<small>baterija</small>' });
        const lamp = bulb(x, [-6.2, 2.2, -3], 'Svetlo');
        const Y = .12, rail = (a, b, c = 0x7ee0b5, o = .35) => x.rail([a.pos.x, Y, a.pos.z], [b.pos.x, Y, b.pos.z], { color: c, opacity: o });
        rail(S, T1); rail(S, T2); rail(T1, T2); rail(T1, B1, 0x7ee0b5, br1off ? .12 : .35); rail(T2, B2); rail(T1, B2, 0x7ee0b5, .2);
        rail(B1, W, CMD, br1off ? .12 : .4); rail(B2, W, CMD, .4); rail(W, CA, CMD, .4); rail(W, CB, CMD, .4);
        x.rail([T1.pos.x, Y, T1.pos.z], [-6.2, Y, -3], { color: PWR, opacity: .5 });
        const sOk = x.stat('ok', 'Isporučeno', 0), sBr = x.stat('br', 'Preko', '—');
        let ok = 0;
        const H = .9, at = n => [n.pos.x, H, n.pos.z];
        const via = br1off ? B2 : B1, viaName = br1off ? 'border router 2' : 'border router 1';
        const toLamp = async (ctl, what, v) => {
          ctl.flash(C.mag, .8);
          await send(x, [[ctl.pos.x, H + .5, ctl.pos.z], at(ctl), at(W), at(via)], C.mag, 7);
          via.flash(C.ok, .6);
          await send(x, br1off ? [at(via), at(T2), at(T1)] : [at(via), at(T1)], C.mag, 6);
          T1.flash(C.ok, .8); lamp.set(v);
          ok++; sOk.set(ok); sBr.set(viaName);
        };
        const cycle = async () => {
          lamp.set(0);
          x.say(`**Kontroler A** (aplikacija proizvođača) šalje „uključi”. Komanda ide kroz kućnu mrežu do border routera, pa kroz Thread mesh do sijalice. Internet ${net ? 'se ne koristi' : 'ne radi, ali to ovde ništa ne menja'}.`);
          await toLamp(CA, 'on', 1);
          await x.wait(2);
          x.say('**Kontroler B** (Home Assistant) šalje „50 %” istoj sijalici. To je **multi-admin**: sijalica je u dva fabric-a i sluša oba kontrolera.');
          await toLamp(CB, 'level', .5);
          await x.wait(2);
          S.flash(C.mag, .8);
          x.say(br1off
            ? 'Senzor javlja događaj. **Border router 1 je ugašen**, pa mesh šalje poruku preko utičnice i border routera 2. Oba kontrolera je dobijaju.'
            : 'Senzor se budi i javlja događaj. Poruka ide kroz mesh do border routera, a oba kontrolera je dobijaju, jer su se oba pretplatila.');
          await send(x, br1off ? [at(S), at(T2), at(B2)] : [at(S), at(T1), at(B1)], C.mag, 6);
          via.flash(C.ok, .6);
          await send(x, [at(via), at(W)], C.mag, 7);
          await Promise.all([send(x, [at(W), at(CA)], C.mag, 7), send(x, [at(W), at(CB)], C.mag, 7)]);
          CA.flash(C.ok, .8); CB.flash(C.ok, .8);
          await x.wait(2.4);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ DALI
  {
    id: 'sh-dali', sym: 'Dl', title: 'DALI',
    tags: ['dali', 'dali-2', 'dt8', 'rasveta', 'drajver', 'adresa', 'grupa', 'scena', 'broadcast', 'lighting', 'driver', 'gateway'],
    desc: '**DALI** je dvožična digitalna magistrala za rasvetu. Svaki drajver dobija kratku adresu od 0 do 63, može da bude član do 16 grupa i pamti do 16 scena. Kontroler šalje komandu jednoj adresi, grupi ili svima odjednom, a drajveri mogu i da odgovore: stanje, jačina, kvar sijalice.',
    points: [
      'Magistrala ima svoje napajanje (obično oko 16 V DC) i radi sporo, 1 200 bit/s, što je dovoljno za rasvetu: komanda traje nekoliko desetina milisekundi.',
      'DALI nije bezbedan mali napon (SELV): žice magistrale mogu da idu u istom kablu sa napajanjem svetiljke, ali se tretiraju kao mrežni napon. Kod većine uređaja polaritet nije bitan.',
      '**Kratka adresa** je za jednu svetiljku, **grupa** za više njih (na primer sve u kancelariji), a **broadcast** za sve na liniji.',
      '**Scena** se čuva u samom drajveru: kontroler kaže „scena 2”, a svaki drajver zna svoju jačinu za tu scenu.',
      '**DALI-2** standardizuje i ulazne uređaje (tastere, senzore) i proveru kompatibilnosti; **DT8** je tip uređaja za boju svetla (tunable white, RGBW).',
      'Na jednoj liniji je do 64 drajvera; za više se dodaju linije, a sistem se povezuje sa KNX-om ili smart home kontrolerom preko gateway-a.',
    ],
    table: {
      title: 'Kome ide komanda',
      head: ['Adresiranje', 'Ko reaguje', 'Primer'],
      rows: [
        ['Kratka adresa (0–63)', 'jedan drajver', 'svetiljka iznad stola'],
        ['Grupa (0–15)', 'svi članovi grupe', 'sve svetiljke u kancelariji'],
        ['Broadcast', 'svi na liniji', 'gašenje cele linije'],
        ['Scena (0–15)', 'svako po svojoj vrednosti', 'rad, sastanak, prezentacija'],
      ],
    },
    code: [
      txt('DALI · plan linije u kancelariji', `
Linija 1, napajanje magistrale oko 16 V DC
  A0–A5   paneli 60×60 iznad stolova     grupa 0 (kancelarija), A0–A1 i grupa 1 (uz prozor)
  A6–A7   downlight kod ulaza            grupa 0, grupa 2 (ulaz)
Scene:    0 rad = 100 %    1 sastanak = 70 %    2 prezentacija: ulaz 0 %, ostalo 30 %
Senzori:  prisustvo pali grupu 0; osvetljenost reguliše grupu 1 (uz prozor)`),
    ],
    pitfalls: [
      'Adrese dodeljene nasumično, bez plana i oznaka na svetiljkama: posle niko ne zna koja je koja. Adresa se upisuje u plan i na svetiljku.',
      'Previše drajvera ili predug kabl na jednoj liniji: pad napona na magistrali pravi povremene greške. Linija je ograničena i brojem uređaja i dužinom.',
      'Drajveri različitih proizvođača sa različitom krivom dimovanja: na istoj komandi svetle različito. Pomaže ista serija drajvera u jednoj prostoriji.',
      'DALI tretiran kao slaba struja: magistrala nije SELV i izoluje se kao mrežni napon.',
    ],
    rel: ['sh-rasveta', 'sh-knx', 'sh-scene', 'sh-sistem'],
    viz: {
      knobs: [{ id: 'cmd', label: 'Komanda', value: 'g2', options: [['bc', 'broadcast · 100 %'], ['g2', 'grupa 2 (ulaz) · 50 %'], ['a3', 'adresa 3 · isključi'], ['sc', 'scena 2 · prezentacija']] }],
      build(x) {
        const { C } = x, mode = x.p.cmd;
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        const XMIN = -9, XMAX = 9.4, BY = .1;
        x.rail([XMIN, BY, 0], [XMAX, BY, 0], { color: 0xffd166, opacity: .8, r: .065 });
        x.label('DALI magistrala', [XMAX - .2, .25, .35], { cls: 'tag', color: 0xffd166, center: [1, 0] });
        const G = x.box({ at: [-8.2, 0, 2], size: [1.4, .9, .9], color: 0x5ec8ff, label: 'DALI gateway<small>kontroler</small>' });
        x.rail([-8.2, BY, 2], [-8.2, BY, 0], { color: 0xffd166, opacity: .7, r: .05 });
        const GR = [[0, 1], [0, 1], [0], [0], [0], [0], [0, 2], [0, 2]];
        const SC2 = [.3, .3, .3, .3, .3, .3, 0, 0];
        const D = GR.map((g, a) => {
          const X = -6 + a * 2;
          const n = x.box({ at: [X, 0, -1.5], size: [1, .5, .7], color: 0xdedfe2, label: `A${a}<small>grupe ${g.join(', ')}</small>` });
          x.rail([X, BY, -1.5], [X, BY, 0], { color: 0xffd166, opacity: .7, r: .05 });
          const b = bulb(x, [X, 2.2, -3.6], '');
          return { a, X, n, g, b };
        });
        const CMD_LBL = { bc: 'broadcast · 100 %', g2: 'grupa 2 · 50 %', a3: 'A3 · isključi', sc: 'scena 2' };
        const hits = d => mode === 'bc' || (mode === 'g2' && d.g.includes(2)) || (mode === 'a3' && d.a === 3) || mode === 'sc';
        const level = d => (mode === 'bc' ? 1 : mode === 'g2' ? .5 : mode === 'a3' ? 0 : SC2[d.a]);
        const SAY = {
          bc: '**Broadcast**: jedna komanda za sve drajvere na liniji. Svi idu na 100 %.',
          g2: '**Grupa 2** (ulaz): komanda ide svima, ali reaguju samo A6 i A7, jer su članovi grupe 2. Svaki drajver sam zna u kojim je grupama.',
          a3: '**Kratka adresa 3**: reaguje samo drajver A3. Ostali vide telegram i ignorišu ga.',
          sc: '**Scena 2** („prezentacija”): gateway šalje samo broj scene. Svaki drajver ima svoju zapamćenu vrednost: uz stolove 30 %, kod ulaza 0 %.',
        };
        const sCmd = x.stat('c', 'Komandi', 0), sRe = x.stat('r', 'Reagovalo drajvera', 0), sQ = x.stat('q', 'Odgovor A3', '—');
        let nc = 0;
        const SPEED = 7;
        const cycle = async () => {
          for (const d of D) d.b.set(mode === 'bc' ? .3 : 1);
          sQ.set('—');
          await x.wait(1);
          G.flash(C.mag, .8);
          x.say(SAY[mode]);
          nc++; sCmd.set(nc);
          await send(x, [[-8.2, 1.2, 2], [-8.2, .35, 2], [-8.2, .35, 0]], C.mag, 7);
          const o = x.orb(C.mag, { r: .2, label: CMD_LBL[mode], at: [-8.2, .35, 0] });
          let re = 0;
          const acts = D.map(d => x.wait(Math.abs(d.X + 8.2) / SPEED).then(() => {
            if (!hits(d)) { d.n.flash(0x6b7280, .35); return; }
            d.n.flash(C.ok, .9); d.b.set(level(d)); re++; sRe.set(re);
          }));
          await Promise.all([x.move(o, [[-8.2, .35, 0], [XMAX, .35, 0]], SPEED), ...acts]);
          x.remove(o);
          await x.wait(1.4);
          x.say('Gateway pita **A3 za stanje**. Drajver odgovara kratkim okvirom unazad (plavo): trenutna jačina i da li je sijalica ispravna.');
          await send(x, [[-8.2, .35, 0], [D[3].X, .35, 0]], C.mag, SPEED);
          D[3].n.flash(C.sky, .8);
          await send(x, [[D[3].X, .35, 0], [-8.2, .35, 0], [-8.2, 1.2, 2]], C.sky, SPEED);
          G.flash(C.ok, .6);
          sQ.set(`${Math.round(D[3].b.on * 100)} %, ispravno`);
          await x.wait(2.6);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },

  // ------------------------------------------------------------------ Zidni paneli i aplikacije
  {
    id: 'sh-paneli', sym: 'Zp', title: 'Zidni paneli i aplikacije',
    tags: ['panel', 'zidni ekran', 'taster', 'aplikacija', 'glas', 'wall panel', 'touch screen', 'dashboard', 'status', 'ui', 'interfejs'],
    desc: 'Ukućani kućom upravljaju preko **tastera**, **zidnih ekrana**, **aplikacije** i **glasa**. Dobar interfejs je brz, uvek pokazuje **stvarno stanje** i ne traži telefon za osnovne stvari: svetlo se pali tasterom na zidu, a ekran i aplikacija služe za scene, pregled i podešavanja.',
    points: [
      'Zidni **taster** ostaje glavni ulaz: radi odmah, bez ekrana i telefona, i u mraku. Pametni taster šalje komandu, a ne prekida strujni krug svetla.',
      '**Zidni ekran** je dobar za scene, pregled kuće i grejanje. Stanje čita iz statusa aktuatora, a ne iz onoga što je sam poslao.',
      '**Aplikacija** je za pristup sa daljine i podešavanja; kod kuće ne bi trebalo da bude jedini način da se nešto uključi.',
      '**Glas** je zgodan kad su ruke zauzete, ali zavisi od interneta i od dobro imenovanih prostorija i uređaja.',
      'Dobar raspored: prostorije umesto dugačke liste uređaja, velike površine za dodir, jasno stanje (uključeno, isključeno, jačina) i odziv odmah posle dodira.',
      'Svi interfejsi čitaju **isto stanje** iz kontrolera, pa se promena tasterom odmah vidi i na ekranu i u aplikaciji.',
    ],
    code: [
      yaml('Home Assistant · dnevna soba na zidnom ekranu', `
# jedna prostorija na ekranu: svetla, roletna i scena; stanje se čita iz entiteta
type: vertical-stack
cards:
  - type: tile
    entity: light.dnevna_plafon
  - type: tile
    entity: light.dnevna_led_traka
    features:
      - type: light-brightness
  - type: tile
    entity: cover.dnevna_roletna
    features:
      - type: cover-open-close
  - type: button
    name: Film
    entity: scene.film
    tap_action:
      action: perform-action
      perform_action: scene.turn_on
      target:
        entity_id: scene.film`),
    ],
    pitfalls: [
      'Panel koji prikazuje poslednju poslatu komandu umesto stanja: posle uključenja tasterom ekran pokazuje pogrešno.',
      'Telefon kao jedini način za osnovne funkcije: za gosta, dete ili kad se baterija isprazni, kuća postaje neupotrebljiva.',
      'Zidni ekran koji se gasi da štedi energiju i posle buđenja se sekundama povezuje: ukućani prestanu da ga koriste.',
      'Previše dugmića na jednom ekranu: ukućani koriste dve funkcije, a traže ih među dvadeset.',
    ],
    rel: ['pr-panel', 'sh-lokalno', 'sh-knx', 'sh-scene'],
    viz: {
      knobs: [{ id: 'status', label: 'Prikaz stanja', value: 1, options: [[1, 'iz statusa aktuatora'], [0, 'poslata komanda']] }],
      build(x) {
        const { C } = x, st = !!x.p.status;
        x.view({ dir: [.9, 6.5, 11], top: 56 });
        x.plate({ w: 18, d: 8.4, at: [0, 0, 0], label: 'Kuća' });
        const K = x.box({ at: [0, 0, -2.2], size: [1.6, 1.1, 1.1], color: 0x5ec8ff, label: 'Kontroler' });
        const A = x.box({ at: [4.2, 0, -2.4], size: [1.2, .95, .9], label: 'Aktuator' });
        const L = bulb(x, [7.6, 2.3, -2.6], 'Svetlo');
        const T = x.box({ at: [4.6, 0, 2.6], size: [.7, .9, .24], label: 'Taster na zidu' });
        const P = x.box({ at: [-4.6, 0, 2.4], size: [1.5, 1, .18], color: 0xc3a6ff, label: 'Zidni ekran' });
        const F = x.box({ at: [-7.6, 0, 0], size: [.55, 1, .14], color: 0x7ee0b5, label: 'Aplikacija na telefonu' });
        const Y = .12;
        x.rail([4.2, Y, -2.4], [7.6, Y, -2.6], { color: PWR, opacity: .55 });
        x.rail([4.6, Y, 2.6], [4.2, Y, -2.4], { color: CMD, opacity: .45 });
        x.rail([4.2, Y, -2.4], [0, Y, -2.2], { color: CMD, opacity: .45 });
        x.rail([-4.6, Y, 2.4], [0, Y, -2.2], { color: CMD, opacity: .45 });
        x.rail([-7.6, Y, 0], [0, Y, -2.2], { color: CMD, opacity: .3 });
        const view = { P: 0, F: 0 };
        const lp = x.label('', [-4.6, .05, 3.2], { cls: 'tag', center: [.5, 0] });
        const lf = x.label('', [-7.6, .05, .8], { cls: 'tag', center: [.5, 0] });
        const sOk = x.stat('ok', 'Tačan prikaz', 0), sBad = x.stat('bad', 'Pogrešan prikaz', 0);
        let good = 0, bad = 0;
        const onoff = v => (v ? 'uključeno' : 'isključeno');
        const paint = () => {
          const real = L.on ? 1 : 0;
          for (const [k, lab, name] of [['P', lp, 'Ekran'], ['F', lf, 'Telefon']]) {
            const ok = view[k] === real;
            lab.set(`${name}: ${onoff(view[k])}`);
            lab.el.classList.toggle('lbl-err', !ok);
          }
        };
        const check = () => { const real = L.on ? 1 : 0; if (view.P === real && view.F === real) { good++; sOk.set(good); } else { bad++; sBad.set(bad); } };
        paint();
        const H = .9, at = n => [n.pos.x, H, n.pos.z];
        const statusUp = async () => {
          await send(x, [at(A), at(K)], C.sky, 8);
          K.flash(C.sky, .6);
          await Promise.all([send(x, [at(K), at(P)], C.sky, 8), send(x, [at(K), at(F)], C.sky, 8)]);
          view.P = view.F = L.on ? 1 : 0; paint();
        };
        const cycle = async () => {
          L.set(0); view.P = view.F = 0; paint();
          await x.wait(1);
          P.flash(C.mag, .8);
          x.say('Dodir na **zidnom ekranu**: „uključi svetlo”. Komanda ide kontroleru, pa aktuatoru.');
          if (!st) { view.P = 1; paint(); }
          await send(x, [[P.pos.x, H + .5, P.pos.z], at(P), at(K), at(A)], C.mag, 8);
          A.flash(C.ok, .8);
          await send(x, [at(A), [7.6, H, -2.6]], PWR, 9, .16);
          L.set(1); paint();
          if (st) { x.say('Aktuator javlja **status** (plavo). Kontroler ga prosleđuje ekranu i aplikaciji, pa oba pokazuju stvarno stanje.'); await statusUp(); }
          else x.say('Bez statusa ekran pokazuje ono što je **poslao**, a aplikacija ne zna ništa: ona i dalje pokazuje „isključeno”.');
          check();
          await x.wait(2.6);
          T.flash(C.mag, .8);
          x.say('Neko ugasi svetlo **tasterom na zidu**. Taster je vezan za aktuator, pa ekran i aplikacija nisu u putu.');
          await send(x, [[T.pos.x, H + .5, T.pos.z], at(T), at(A)], C.mag, 8);
          A.flash(C.ok, .8);
          L.set(0); paint();
          if (st) { await statusUp(); x.say('Status stiže i do ekrana i do aplikacije: svi prikazi su tačni.'); }
          else x.say('Bez statusa ekran i dalje pokazuje **„uključeno”**, a svetlo je ugašeno. Ukućani prestaju da veruju ekranu.');
          check();
          await x.wait(3);
        };
        x.spawn(async () => { while (x.alive) await cycle(); });
      },
    },
  },
];
