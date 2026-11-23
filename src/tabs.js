// Tabovi: glavne oblasti sajta. Tab ima sekcije, a sekcija teme.
// Sekcija je ili ručno zadat spisak tema (topics) ili cela oblast iz domains.js (domains).
// page: 'system' znači da su teme delovi jedne stranice sa simulacijom; soon: oblast još nema tema.
// world: kom svetu oblast pripada ('sw' ako nije navedeno); skill: false znači da oblast nije osa u Skillset radaru.

// Svetovi: sajt ima dva odvojena dela sa svojim oblastima, početnom stranom i Skillsetom
export const WORLDS = [
  { id: 'sw', title: 'Software', icon: 'code-xml' },
  { id: 'hw', title: 'Hardware', icon: 'cpu' },
];

export const TABS = [
  {
    id: 'network', title: 'Network', name: 'Network', icon: 'globe',
    blurb: 'Šta se dešava između klijenta i servera: slojevi i paketi, TCP i UDP, DNS, HTTP i njegove verzije, metode i idempotentnost, HTTPS i TLS handshake.',
    sections: [
      { id: 'n-osnove', title: 'Kako paket stiže', icon: 'network', topics: ['net-layers', 'tcp-udp', 'dns'] },
      { id: 'n-http', title: 'HTTP i HTTPS', icon: 'globe', topics: ['http-basics', 'http-methods', 'https-tls'] },
    ],
  },
  {
    id: 'system-design', title: 'System design', name: 'System design', icon: 'server', page: 'system',
    blurb: 'Kako sistem izdrži rast: load balancer, rate limiting, keš, baza i skaliranje. Na vrhu je simulacija koja reaguje na opterećenje, a ispod je opis svake komponente.',
    sections: [
      { id: 'sd-s-skaliranje', title: 'Skaliranje', icon: 'layers', topics: ['sd-scaling', 'sd-capacity', 'sd-mono-micro'] },
      { id: 'sd-s-ulaz', title: 'Ulaz u sistem', icon: 'shield', topics: ['sd-firewall', 'sd-gateway', 'sd-lb', 'sd-rate'] },
      { id: 'sd-s-podaci', title: 'Podaci i brzina', icon: 'database', topics: ['sd-cache', 'sd-db', 'sd-queue'] },
      { id: 'sd-s-pouzdanost', title: 'Pouzdanost', icon: 'activity', topics: ['sd-resilience', 'sd-observe'] },
    ],
  },
  {
    id: 'konkurentnost', title: 'Konkurentnost', name: 'Konkurentnost i paralelizam', icon: 'cpu',
    blurb: 'Od jezgra procesora do `async/await`: kako se posao deli na niti i jezgra, kako ga .NET raspoređuje i kako deljeno stanje ostaje ispravno kad mu pristupa više niti.',
    sections: [
      { id: 'k-osnove', title: 'Osnove', icon: 'cpu', topics: ['concurrency-vs-parallelism', 'cpu-cores', 'threads', 'os-scheduler'] },
      { id: 'k-net', title: '.NET: taskovi i async', icon: 'braces', topics: ['thread-pool', 'async-await', 'parallel-for', 'channels'] },
      { id: 'k-sync', title: 'Sinhronizacija i thread safety', icon: 'lock', topics: ['race', 'thread-safety', 'lock', 'semaphore', 'atomic', 'deadlock'] },
      { id: 'k-mapa', title: 'Pregled', icon: 'map', topics: ['concurrency-map'] },
    ],
  },
  {
    id: 'arhitektura', title: 'Arhitektura', name: 'Arhitektura i distribuirani sistemi', icon: 'blocks',
    blurb: 'Kako servisi razgovaraju preko poruka, šta se menja kad stanje živi na više mašina i kako se sistem brani kad zavisnost uspori ili padne.',
    domains: ['messaging', 'distributed', 'architecture'],
  },
  {
    id: 'podaci', title: 'Podaci', name: 'Baze i keširanje', icon: 'database',
    blurb: 'Indeksi, izolacija transakcija i keš: gde podaci žive i koliko košta da se do njih stigne.',
    domains: ['sql', 'caching'],
  },
  {
    id: 'cloud', title: 'Cloud', name: 'Kubernetes i monitoring', icon: 'container',
    blurb: 'Podovi i servisi, isporuka bez prekida, automatsko skaliranje i kako videti šta sistem stvarno radi.',
    domains: ['kubernetes', 'observability'],
  },
  {
    id: 'net-angular', title: '.NET i Angular', name: '.NET i Angular', icon: 'braces',
    blurb: 'Memorija i GC, DI kontejner i pipeline ASP.NET Core zahteva, pa detekcija promena i RxJS na strani Angulara.',
    domains: ['dotnet', 'angular'],
  },
  {
    id: 'ai-llm', title: 'AI', name: 'AI i LLM', icon: 'brain-circuit',
    blurb: 'Embeddings i semantička pretraga, RAG i agenti koji pozivaju alate.',
    domains: ['ai'],
  },
  {
    id: 'algoritmi', title: 'Algoritmi', name: 'Algoritmi i strukture podataka', icon: 'route',
    blurb: 'Složenost, sortiranje, pretraga, heš tabele i grafovi, sa koracima koje možeš da pratiš.',
    domains: ['algorithms'],
  },
  {
    id: 'security', title: 'Security', name: 'Security', icon: 'shield', soon: true,
    blurb: 'Oblast je u pripremi i stiže na kraju.',
    sections: [],
  },

  // ---------- Hardware ----------
  {
    id: 'electrical', world: 'hw', title: 'Electrical', name: 'Struja i razvodni ormani', icon: 'plug-zap',
    blurb: 'Od napona i struje do ispitanog razvodnog ormana: zaštita, kablovi, uzemljenje, šeme i merenja.',
    sections: [
      { id: 'el-s-osnove', title: 'Osnove', icon: 'zap', topics: ['el-ui', 'el-faze'] },
      { id: 'el-s-zastita', title: 'Zaštita', icon: 'shield', topics: ['el-mcb', 'el-fid', 'el-spd'] },
      { id: 'el-s-instalacija', title: 'Instalacija', icon: 'cable', topics: ['el-kabl', 'el-pe'] },
      { id: 'el-s-ormani', title: 'Razvodni ormani', icon: 'layers', topics: ['el-sema', 'el-orman', 'el-merenja'] },
    ],
  },
  {
    id: 'electronics', world: 'hw', title: 'Electronics & IoT', name: 'Elektronika i IoT', icon: 'circuit-board',
    blurb: 'Kako uređaj radi iznutra: komponente i napajanje, ESP32 i firmware, i protokoli kojima uređaji razgovaraju, od UART-a do MQTT-a.',
    sections: [
      { id: 'ei-s-osnove', title: 'Komponente i napajanje', icon: 'zap', topics: ['ei-komponente', 'ei-napajanja', 'ei-prekidaci'] },
      { id: 'ei-s-mcu', title: 'Mikrokontroleri', icon: 'cpu', topics: ['ei-esp32', 'ei-gpio', 'ei-firmware'] },
      { id: 'ei-s-zicani', title: 'Žičani protokoli', icon: 'cable', topics: ['ei-uart', 'ei-rs485'] },
      { id: 'ei-s-bezicni', title: 'Bežično i IoT', icon: 'send', topics: ['ei-wifi', 'ei-lora', 'ei-mqtt'] },
    ],
  },
  {
    id: 'smart-home', world: 'hw', title: 'Smart home', name: 'Smart home', icon: 'house-plug',
    blurb: 'Kako uređaji rade zajedno u kući: sistemi i protokoli, rasveta, scene i automatizacije, paneli i šta radi kad nestane interneta.',
    sections: [
      { id: 'sh-s-sistemi', title: 'Sistemi', icon: 'blocks', topics: ['sh-sistem', 'sh-pierre', 'sh-knx', 'sh-ha'] },
      { id: 'sh-s-protokoli', title: 'Protokoli', icon: 'network', topics: ['sh-zigbee', 'sh-matter', 'sh-dali'] },
      { id: 'sh-s-funkcije', title: 'Funkcije', icon: 'lightbulb', topics: ['sh-rasveta', 'sh-scene', 'sh-paneli', 'sh-lokalno'] },
    ],
  },
  {
    id: 'cctv', world: 'hw', title: 'CCTV', name: 'Video nadzor', icon: 'cctv',
    blurb: 'Od kamere do snimka: senzor i objektiv, IP kamere i PoE, snimači i diskovi, mreža za kamere i bezbedan pristup sa daljine.',
    sections: [
      { id: 'cc-s-kamere', title: 'Kamere', icon: 'cctv', topics: ['cc-kamera', 'cc-noc', 'cc-analitika'] },
      { id: 'cc-s-snimanje', title: 'Snimanje', icon: 'database', topics: ['cc-poe', 'cc-nvr', 'cc-bitrate', 'cc-disk'] },
      { id: 'cc-s-mreza', title: 'Mreža i pristup', icon: 'network', topics: ['cc-onvif', 'cc-mreza', 'cc-pristup', 'cc-propisi'] },
    ],
  },
  {
    id: 'projects', world: 'hw', title: 'Projects', name: 'Projekti', icon: 'hammer', skill: false,
    blurb: 'Beleške iz sopstvenih projekata: šta je napravljeno, koje su odluke donete, šeme i šta je naučeno.',
    sections: [
      { id: 'pr-s-projekti', title: 'Projekti', icon: 'hammer', topics: ['pr-esp32', 'pr-panel'] },
    ],
  },
];
