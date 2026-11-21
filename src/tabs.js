// Tabovi: glavne oblasti sajta. Tab ima sekcije, a sekcija teme.
// Sekcija je ili ručno zadat spisak tema (topics) ili cela oblast iz domains.js (domains).
// page: 'system' znači da su teme delovi jedne stranice sa simulacijom; soon: oblast još nema tema.
export const TABS = [
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
    id: 'bezbednost', title: 'Bezbednost', name: 'Bezbednost', icon: 'shield', soon: true,
    blurb: 'Oblast je u pripremi i stiže na kraju.',
    sections: [],
  },
];
