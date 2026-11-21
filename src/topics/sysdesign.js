// System design: delovi stranice ispod uvodne simulacije.
// Delovi su teme sa `part: true`: imaju svoje mesto u meniju, pretrazi i roadmapi,
// ali žive na jednoj stranici (#system-design), pa link na deo samo skroluje do njega.
// `focus` je ključ komponente u simulaciji koju dugme "Pokaži u simulaciji" označava.
const cs = (t, src) => ({ t, lang: 'csharp', src });
const js = (t, src) => ({ t, lang: 'json', src });

export default [
  // ------------------------------------------------------------------ Skaliranje
  {
    id: 'sd-scaling', d: 'sysdesign', part: true, sym: 'Sk', title: 'Vertikalno i horizontalno skaliranje', focus: 'auto',
    tags: ['skaliranje', 'scale up', 'scale out', 'vertikalno', 'horizontalno', 'autoscaling', 'stateless', 'hpa', 'data protection'],
    desc: '**Vertikalno** skaliranje znači veću mašinu: više jezgara i memorije za istu instancu. **Horizontalno** znači više kopija iste aplikacije iza load balancera. Vertikalno je najjednostavnije, ali ima plafon i obično traži restart. Horizontalno nema praktičan plafon i preživljava pad jedne mašine, ali aplikacija mora biti bez stanja (stateless).',
    points: [
      'Vertikalno ne traži izmene koda, ali najveća mašina je plafon, cena raste brže od snage, a jedna instanca je i dalje jedna tačka otkaza.',
      'Horizontalno: sesija, fajlovi i keš moraju izaći iz procesa (Redis, blob storage, baza), jer sledeći zahtev istog korisnika može da stigne na drugu instancu.',
      'Autoskaler dodaje instance po metrici: željeno = ceil(trenutno × trenutna metrika / cilj). Sa 4 instance na 90% CPU i ciljem 60% traži 6.',
      'Nova instanca treba vremena da se podigne i zagreje (JIT, keš, konekcije), pa skok koji traje sekundama mora da preuzme rezerva ili rate limiter.',
      'Baza se skalira najteže: aplikacija se lako umnožava, a podaci ne.',
    ],
    table: {
      title: 'Vertikalno ili horizontalno',
      head: ['', 'Vertikalno', 'Horizontalno'],
      rows: [
        ['Kako', 'Veća mašina', 'Više mašina iza load balancera'],
        ['Izmene u kodu', 'Nisu potrebne', 'Aplikacija mora biti stateless'],
        ['Plafon', 'Najveća dostupna mašina', 'Praktično ga nema'],
        ['Kvar mašine', 'Prekid rada', 'Ostale instance preuzimaju'],
        ['Promena veličine', 'Restart, kratak prekid', 'Bez prekida'],
      ],
    },
    code: [
      cs('C# · Stanje van procesa, da svaka instanca može da obradi bilo koji zahtev', `
var redis = builder.Configuration.GetConnectionString("redis")!;

builder.Services.AddStackExchangeRedisCache(o => o.Configuration = redis); // IDistributedCache
builder.Services.AddSession();                                            // sesija živi u Redisu

// Kolačiće šifruju Data Protection ključevi: sve instance moraju imati iste
builder.Services.AddDataProtection()
    .PersistKeysToStackExchangeRedis(ConnectionMultiplexer.Connect(redis), "dp-keys");`),
    ],
    sim: 'Podigni opterećenje dok instance ne počnu da padaju, pa probaj oba puta: veću instancu (vertikalno) i dugme **+ Instanca** (horizontalno). Sa jednom instancom vertikalno skaliranje pravi prekid, jer se instanca restartuje.',
    rel: ['hpa', 'k8s-basics', 'rolling-update'],
  },
  {
    id: 'sd-capacity', d: 'sysdesign', part: true, sym: 'Kc', title: 'Procena kapaciteta', focus: 'clients',
    tags: ['kapacitet', 'back of the envelope', 'procena', 'qps', 'rps', 'littleov zakon', 'little', 'vrh', 'peak', 'n+1'],
    desc: 'Pre crtanja arhitekture vredi grubo izračunati opterećenje: koliko zahteva u sekundi, koliko podataka i koliko instanci. Cilj nije tačan broj nego red veličine, da se vidi da li je problem 100 ili 100 000 zahteva u sekundi.',
    points: [
      'Prosek: 1 milion aktivnih korisnika × 20 zahteva dnevno = 20 miliona dnevno, oko 230 req/s. Dan ima 86 400 s, za grubu računicu 10⁵.',
      'Vrh je obično 3–10× prosek (jutro, akcija, push notifikacija), a sistem se dimenzioniše za vrh, ne za prosek.',
      'Broj instanci = vrh / kapacitet jedne instance / ciljno iskorišćenje. 2 300 req/s / 1 000 req/s / 0,6 ≈ 4 instance, plus jedna rezerva za kvar (N+1).',
      '**Littleov zakon**: zahteva u obradi = dolazni tok × vreme obrade. 2 000 req/s × 50 ms = 100 istovremenih zahteva, što određuje broj niti i konekcija.',
      'Iznad ~70% iskorišćenja kašnjenje raste nelinearno: red čekanja se puni i pre nego što CPU stigne do 100%.',
    ],
    table: {
      title: 'Brojevi za grubu računicu',
      head: ['Veličina', 'Približno'],
      rows: [
        ['Sekundi u danu', '86 400 ≈ 10⁵'],
        ['1 milion zahteva dnevno', '≈ 12 req/s u proseku'],
        ['Vrh u odnosu na prosek', '3–10×'],
        ['Ciljno iskorišćenje CPU-a', '60–70%'],
        ['1 KB × 1 milion zapisa', '1 GB'],
        ['Rezerva za kvar', 'N+1 instanca, bar dve zone'],
      ],
      note: 'Red veličine, ne tačna vrednost. Kapacitet jedne instance se meri load testom, ne pogađa.',
    },
    sim: 'Klijenti pokazuju koliko zahteva stiže, a load balancer koliko je instanci zdravo. Uporedi opterećenje sa kapacitetom: instanca M obradi oko 5 000 req/s.',
    rel: ['percentiles-slo', 'latency', 'thread-pool'],
  },
  {
    id: 'sd-mono-micro', d: 'sysdesign', part: true, sym: 'Mm', title: 'Monolit ili mikroservisi', focus: 'tier',
    tags: ['monolit', 'monolith', 'mikroservisi', 'microservices', 'modularni monolit', 'servisi', 'arhitektura'],
    desc: '**Monolit** je jedna aplikacija koja se gradi, isporučuje i skalira u celosti. Jednostavan je za razvoj, testiranje i debagovanje: pozivi između modula su obični pozivi metoda, a transakcija preko cele baze je besplatna. **Mikroservisi** dele sistem na servise koji se isporučuju i skaliraju nezavisno, svaki sa svojom bazom: tim menja svoj servis bez čekanja ostalih, opterećen deo se skalira sam, a kvar jednog servisa ne obara ceo sistem. Cena je mreža između servisa (kašnjenje, delimični otkazi), podaci bez zajedničke transakcije i mnogo više operativnog posla, jer svaki servis traži svoju isporuku, monitoring i tracing. Dobar podrazumevani početak je **modularni monolit** sa jasnim granicama modula, koji se kasnije deli tamo gde stvarno boli.',
    sim: 'Prebaci arhitekturu na **Mikroservisi** i podigni opterećenje na 15 000 req/s: preopterećen je samo Katalog. Kad on padne, Porudžbine i Plaćanja i dalje rade, a autoskaler dodaje instance uglavnom Katalogu. Monolit na istom opterećenju pada ceo.',
    rel: ['clean-architecture', 'saga', 'outbox', 'tracing'],
  },

  // ------------------------------------------------------------------ Ulaz u sistem
  {
    id: 'sd-firewall', d: 'sysdesign', part: true, sym: 'Fw', title: 'Firewall i WAF', focus: 'fw',
    tags: ['firewall', 'waf', 'ddos', 'nsg', 'owasp', 'tls', 'front door', 'application gateway', 'mreža'],
    desc: 'Prvi filter na ulazu. **Mrežni firewall** (L3/L4) propušta samo dozvoljene adrese, portove i protokole. **WAF** (L7) čita HTTP zahteve i blokira poznate napade: SQL injection, XSS, zlonamerne botove. Ispred svega stoji **DDoS zaštita** na ivici mreže, koja upija ogroman saobraćaj pre nego što stigne do tvojih servera.',
    points: [
      'Najmanja prava: spolja je otvoren samo port 443 na ivici, a baza i interni servisi nemaju javnu adresu (privatna mreža, NSG, security grupe).',
      'WAF radi po pravilima (npr. OWASP Core Rule Set) i ume da blokira i ispravne zahteve, pa se uvodi prvo u režimu detekcije, a tek onda blokiranja.',
      'TLS se obično završava na ivici (Front Door, Application Gateway, ingress), a unutra se po potrebi ponovo šifruje (mTLS između servisa).',
      'U Azure-u: NSG i Azure Firewall za mrežu, WAF na Front Door-u ili Application Gateway-u, DDoS Protection za mrežne napade.',
      'Firewall ne zamenjuje bezbednost u aplikaciji: autentifikacija, autorizacija i validacija ulaza i dalje su obavezni.',
    ],
    sim: 'Ljubičaste kugle su zlonamerni zahtevi. Firewall ih zaustavlja pre nego što potroše išta od kapaciteta aplikacije.',
    rel: ['middleware'],
  },
  {
    id: 'sd-gateway', d: 'sysdesign', part: true, sym: 'Gw', title: 'API gateway', focus: 'lb',
    tags: ['api gateway', 'gateway', 'yarp', 'apim', 'api management', 'bff', 'reverse proxy', 'rutiranje', 'kong'],
    desc: 'Jedna ulazna tačka za klijente ispred više servisa. Gateway rutira zahtev po putanji ili hostu (`/katalog` ide na servis Katalog) i preuzima zajedničke poslove: autentifikaciju, rate limiting, TLS, keširanje odgovora, verzionisanje i spajanje više poziva u jedan.',
    points: [
      'Klijent ne zna gde servisi žive ni koliko ih ima: gateway skriva unutrašnju topologiju i može da je menja bez izmena kod klijenata.',
      '**BFF** (backend for frontend): poseban gateway za web i za mobilnu aplikaciju, svaki sa odgovorima skrojenim za svog klijenta.',
      'Gateway ne sme da postane novi monolit: poslovna logika ostaje u servisima, a gateway radi samo opšte stvari.',
      'Svaki zahtev prolazi kroz njega, pa mora biti brz i redundantan.',
      '.NET: YARP kao reverse proxy u kodu; Azure API Management, Kong ili NGINX kao gotova rešenja.',
    ],
    code: [
      js('appsettings.json · YARP: rutiranje, balansiranje i health check', `
{
  "ReverseProxy": {
    "Routes": {
      "katalog": { "ClusterId": "katalog", "Match": { "Path": "/katalog/{**rest}" } },
      "porudzbine": { "ClusterId": "porudzbine", "Match": { "Path": "/porudzbine/{**rest}" } }
    },
    "Clusters": {
      "katalog": {
        "LoadBalancingPolicy": "LeastRequests",
        "HealthCheck": { "Active": { "Enabled": true, "Interval": "00:00:10", "Path": "/health/ready" } },
        "Destinations": {
          "k1": { "Address": "http://katalog-1:8080/" },
          "k2": { "Address": "http://katalog-2:8080/" }
        }
      },
      "porudzbine": { "Destinations": { "p1": { "Address": "http://porudzbine:8080/" } } }
    }
  }
}`),
      cs('C# · Program.cs', `
builder.Services.AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

var app = builder.Build();
app.MapReverseProxy();`),
    ],
    sim: 'U režimu **Mikroservisi** kutija na ulazu postaje API gateway: deli zahteve na Katalog, Porudžbine i Plaćanja.',
    rel: ['rate-limiting', 'middleware'],
  },
  {
    id: 'sd-lb', d: 'sysdesign', part: true, sym: 'Lb', title: 'Load balancer', focus: 'lb',
    tags: ['load balancer', 'balansiranje', 'l4', 'l7', 'round robin', 'least connections', 'health check', 'sticky session', 'ingress'],
    desc: 'Raspoređuje zahteve na više instanci i prati koje su zdrave. Kad instanca padne ili ne prođe **health check**, prestaje da dobija saobraćaj, pa korisnik ne vidi kvar. Bez load balancera nema horizontalnog skaliranja.',
    points: [
      '**L4** balansira TCP konekcije po adresi i portu: brz je, ali ne vidi HTTP. **L7** čita HTTP, pa može da rutira po putanji, zaglavlju ili kolačiću i da završi TLS.',
      '**Sticky sessions** vežu korisnika za instancu. Rade, ali otežavaju skaliranje i gube sesiju kad instanca padne: bolje je da stanje živi van instance.',
      'Health check treba da proveri da li instanca stvarno može da radi (readiness: baza, keš, zavisnosti), a ne samo da li proces postoji.',
      'Nova instanca dobija saobraćaj tek kad prođe readiness proveru, a instanca koja se gasi prvo završi zahteve koje već ima (draining).',
      'I sam load balancer mora biti redundantan. U cloudu je to upravljana usluga (Azure Load Balancer, Application Gateway), a u Kubernetes-u Service i Ingress.',
    ],
    table: {
      title: 'Algoritmi',
      head: ['Algoritam', 'Kako bira', 'Kada'],
      rows: [
        ['Round robin', 'Redom, jedan po jedan', 'Slične instance i slični zahtevi'],
        ['Least connections', 'Instancu sa najmanje otvorenih zahteva', 'Zahtevi različitog trajanja'],
        ['Weighted', 'Srazmerno težini instance', 'Mašine različite snage'],
        ['Power of two choices', 'Bolju od dve nasumične', 'Mnogo instanci, bez centralnog brojača'],
        ['Heš po ključu', 'Isti ključ uvek na istu instancu', 'Lokalni keš, sesija, WebSocket'],
      ],
    },
    sim: 'Linije od load balancera vode samo do zdravih instanci. Kad instanca padne, njena linija pocrveni i saobraćaj ide na ostale.',
    rel: ['consistent-hashing', 'k8s-basics', 'rolling-update'],
  },
  {
    id: 'sd-rate', d: 'sysdesign', part: true, sym: 'Lm', title: 'Rate limiting i load shedding', focus: 'rl',
    tags: ['rate limiting', 'rate limiter', '429', 'throttling', 'load shedding', 'token bucket', 'retry-after', 'kvota'],
    desc: 'Rate limiter ograničava koliko zahteva klijent ili ceo sistem sme da pošalje u jedinici vremena. Višak se odmah odbija sa `429 Too Many Requests`, umesto da uđe u sistem i obori ga. Bolje je odbiti deo zahteva nego pasti za sve.',
    points: [
      'Algoritmi: **token bucket** (dozvoljava kratke nalete), fixed window, sliding window i concurrency limit. Detaljno u temi [[rate-limiting]].',
      'Limit po korisniku ili API ključu štiti od jednog bučnog klijenta; globalni limit štiti sistem od ukupnog preopterećenja.',
      'Sa više instanci gateway-a brojač mora biti zajednički (Redis) ili se limit deli na broj instanci.',
      '**Load shedding** je srodna ideja: servis sam odbacuje posao kad je pun (red predugačak, kašnjenje preveliko), umesto da prima dok ne padne.',
      'Klijent treba da poštuje `Retry-After` i da ponavlja sa backoff-om i jitter-om, inače ponovljeni zahtevi naprave novi talas.',
    ],
    code: [
      cs('C# · Token bucket po korisniku, za ceo API', `
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx =>
        RateLimitPartition.GetTokenBucketLimiter(
            ctx.User.Identity?.Name ?? ctx.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new TokenBucketRateLimiterOptions
            {
                TokenLimit = 100,                              // najveći nalet
                TokensPerPeriod = 50,                          // 50 zahteva u sekundi u proseku
                ReplenishmentPeriod = TimeSpan.FromSeconds(1),
                QueueLimit = 0,                                // višak odmah dobija 429
            }));
});

app.UseRateLimiter();`),
    ],
    sim: 'Uključi **Rate limiter** pa pusti 1M zahteva. Limiter ovde prati kapacitet zdravih instanci (adaptivni limit): propušta onoliko koliko one mogu da obrade, a višak su žute kugle sa 429. Sistem ostaje živ.',
    rel: ['rate-limiting', 'circuit-breaker', 'retry-dlq'],
  },

  // ------------------------------------------------------------------ Podaci i brzina
  {
    id: 'sd-cache', d: 'sysdesign', part: true, sym: 'Ke', title: 'Keširanje i CDN', focus: 'cache',
    tags: ['keš', 'cache', 'cdn', 'redis', 'hybridcache', 'imemorycache', 'cache-aside', 'invalidacija', 'ttl', 'hit ratio'],
    desc: 'Keš čuva rezultat skupog posla bliže onome ko ga traži. Svaki pogodak je jedan upit manje u bazi: sa 90% pogodaka baza vidi deset puta manje upita. Keš postoji na više nivoa, od pregledača i CDN-a do memorije procesa i Redisa.',
    points: [
      '**CDN** čuva statičke fajlove i javne odgovore na serverima blizu korisnika: manje kašnjenje i manje saobraćaja do tvog sistema.',
      '**Lokalni keš** (`IMemoryCache`) je najbrži, ali svaka instanca ima svoju kopiju; **distribuirani** (Redis) je zajednički za sve instance i preživljava restart.',
      '**Cache-aside**: čitaj iz keša, a na promašaj iz baze pa upiši u keš. Najčešći obrazac; detalji u [[cache-aside]].',
      'Najteži deo je invalidacija: TTL ograničava koliko dugo podatak sme da bude zastareo, a brisanje ključa pri upisu skraćuje taj prozor.',
      'Hladan keš posle restarta ili isteka popularnog ključa šalje sve na bazu odjednom: to je [[stampede]].',
    ],
    table: {
      title: 'Nivoi keša',
      head: ['Nivo', 'Primer', 'Približno kašnjenje'],
      rows: [
        ['Pregledač', '`Cache-Control`, `ETag`', '0 ms, nema zahteva'],
        ['CDN', 'Azure Front Door, Cloudflare', '5–30 ms, blizu korisnika'],
        ['Gateway', 'keš odgovora', '1–5 ms'],
        ['Memorija procesa', '`IMemoryCache`, L1 u `HybridCache`', 'ispod 0,1 ms'],
        ['Distribuirani', 'Redis', '0,5–1 ms'],
        ['Baza', 'buffer pool', '1–10 ms'],
      ],
    },
    code: [
      cs('C# · HybridCache (.NET 9): memorija procesa + Redis, sa zaštitom od stampeda', `
builder.Services.AddStackExchangeRedisCache(o => o.Configuration = builder.Configuration.GetConnectionString("redis"));
builder.Services.AddHybridCache();

app.MapGet("/proizvodi/{id:int}", async (int id, HybridCache cache, AppDb db, CancellationToken ct) =>
    await cache.GetOrCreateAsync($"proizvod:{id}",
        async c => await db.Products.FindAsync([id], c),   // samo jedan poziv po ključu
        new HybridCacheEntryOptions { Expiration = TimeSpan.FromMinutes(5) },
        cancellationToken: ct));`),
    ],
    sim: 'Uključi autoskaler, podigni opterećenje na 40 000 req/s i sačekaj nove instance, pa isključi **Keš**: svaki zahtev ide u bazu i usko grlo se seli sa aplikacije na bazu. Kad ga ponovo uključiš, keš se puni postepeno, pa baza još par sekundi vidi pun pritisak.',
    rel: ['cache-aside', 'distributed-cache', 'stampede', 'eviction', 'latency'],
  },
  {
    id: 'sd-db', d: 'sysdesign', part: true, sym: 'Db', title: 'Skaliranje baze', focus: 'db',
    tags: ['baza', 'database', 'replika', 'read replica', 'sharding', 'particionisanje', 'connection pool', 'cqrs', 'sql', 'nosql'],
    desc: 'Baza je obično prvo usko grlo, jer se aplikacija lako umnožava, a podaci ne. Redosled je otprilike: dobri indeksi i upiti, keš, veća mašina, replike za čitanje, pa tek onda deljenje podataka na više baza (sharding).',
    points: [
      '**Indeksi i upiti** su najjeftinija optimizacija: jedan upit bez indeksa može da pojede CPU cele baze. Pazi i na [[n-plus-one]].',
      '**Connection pool**: otvaranje konekcije je skupo, a baza podnosi ograničen broj. Sa 20 instanci × 100 konekcija lako se pređe limit baze.',
      '**Read replike** preuzimaju čitanja. Replikacija je obično asinhrona, pa replika kasni (replication lag) i korisnik možda ne vidi svoj upis odmah.',
      '**Sharding** deli podatke po ključu (npr. tenant ili korisnik) na više baza. Skalira i upise, ali upiti i transakcije preko više shardova postaju teški, a loš ključ pravi vruć shard.',
      '**CQRS** odvaja model za upis od modela za čitanje, koji može da živi u drugoj bazi ili u pretraživaču.',
      'SQL za relacije, transakcije i ad hoc upite; NoSQL (Cosmos DB, MongoDB) za pristup po ključu, ogroman obim i globalnu distribuciju. Vidi i [[cap]].',
    ],
    sim: 'Stub iznad baze je njeno opterećenje. U monolitu je jedna baza za sve, a u mikroservisima svaki servis ima svoju, pa preopterećena baza Kataloga ne usporava Plaćanja.',
    rel: ['btree', 'isolation', 'n-plus-one', 'consistent-hashing', 'cap'],
  },
  {
    id: 'sd-queue', d: 'sysdesign', part: true, sym: 'Mq', title: 'Redovi i asinhrona obrada',
    tags: ['red', 'queue', 'asinhrono', '202 accepted', 'service bus', 'kafka', 'load leveling', 'idempotentnost', 'keda'],
    desc: 'Ne mora sve da se završi dok korisnik čeka. Spor ili rizičan posao (slanje mejla, obrada plaćanja, izveštaj) ide u red, a API odmah vraća `202 Accepted`. Red upija nalete: proizvođač piše brzo, a potrošači obrađuju svojim tempom.',
    points: [
      'Red razdvaja servise u vremenu: ako potrošač padne, poruke čekaju u redu umesto da se izgube.',
      'Potrošači se skaliraju po dužini reda (KEDA), nezavisno od API-ja.',
      'Isporuka je obično at-least-once, pa obrada mora biti idempotentna: ista poruka dva puta ne sme da naplati dva puta.',
      'Upis u bazu i slanje poruke povezuje [[outbox]], inače jedno od to dvoje može da izostane.',
      'Queue kad posao radi jedan potrošač, topic kad isti događaj treba više servisa, Kafka kad je potreban log koji se može ponovo pročitati.',
    ],
    code: [
      cs('C# · Prihvati odmah, obradi kasnije', `
app.MapPost("/izvestaji", async (ZahtevIzvestaja z, ServiceBusSender sender) =>
{
    var id = Guid.NewGuid();
    await sender.SendMessageAsync(new ServiceBusMessage(BinaryData.FromObjectAsJson(z with { Id = id })));
    return Results.Accepted($"/izvestaji/{id}", new { id });   // klijent proverava status kasnije
});`),
    ],
    rel: ['load-leveling', 'queue-vs-topic', 'kafka', 'outbox', 'retry-dlq', 'delivery'],
  },

  // ------------------------------------------------------------------ Pouzdanost
  {
    id: 'sd-resilience', d: 'sysdesign', part: true, sym: 'Ot', title: 'Otpornost na kvarove', focus: 'tier',
    tags: ['otpornost', 'resilience', 'kaskadni pad', 'cascading failure', 'timeout', 'retry', 'circuit breaker', 'bulkhead', 'polly', 'spof'],
    desc: 'U distribuiranom sistemu nešto je uvek u kvaru: instanca, mreža, zavisnost. Cilj je da kvar jednog dela ostane lokalan, umesto da se proširi na ceo sistem kao kaskadni pad.',
    points: [
      '**Bez jedne tačke otkaza**: bar dve instance svega, u različitim zonama dostupnosti (N+1).',
      '**Timeout** na svakom pozivu ka zavisnosti; bez njega spor servis veže niti i konekcije dok sve ne stane.',
      '**Retry** sa eksponencijalnim backoff-om i jitter-om, samo za privremene greške i idempotentne operacije.',
      '**Circuit breaker** prestaje da zove zavisnost koja pada i daje joj vremena da se oporavi; detalji u [[circuit-breaker]].',
      '**Bulkhead**: odvojeni pool-ovi niti i konekcija po zavisnosti, da spora zavisnost ne pojede resurse svih ostalih.',
      '**Graceful degradation**: kad preporuke ne rade, prikaži stranicu bez njih umesto greške.',
    ],
    code: [
      cs('C# · Timeout, retry i circuit breaker za HTTP klijenta (Microsoft.Extensions.Http.Resilience)', `
builder.Services.AddHttpClient<KatalogClient>(c => c.BaseAddress = new Uri("http://katalog"))
    .AddStandardResilienceHandler();   // ukupni timeout, retry sa backoff-om, circuit breaker`),
    ],
    sim: 'Bez rate limitera, kad jedna instanca padne (OOM), njen saobraćaj prelazi na ostale, koje zatim padaju još brže. To je kaskadni pad; posle restarta preopterećene instance padaju ponovo.',
    rel: ['circuit-breaker', 'retry-dlq', 'rolling-update', 'saga'],
  },
  {
    id: 'sd-observe', d: 'sysdesign', part: true, sym: 'Mo', title: 'Monitoring, SLO i kapacitet', focus: 'chart',
    tags: ['monitoring', 'metrike', 'red', 'use', 'slo', 'sli', 'p95', 'p99', 'alarmi', 'opentelemetry', 'dashboard'],
    desc: 'Ne možeš da skaliraš ono što ne meriš. Metrike pokazuju da nešto nije u redu, logovi šta se desilo, a tragovi (traces) gde je vreme potrošeno kroz više servisa.',
    points: [
      '**RED** za servise: rate (zahtevi u sekundi), errors, duration. **USE** za resurse: utilization, saturation, errors (CPU, memorija, konekcije, dužina reda).',
      'Kašnjenje se prati kroz percentile (p95, p99), a ne kroz prosek: prosek sakrije spore korisnike. Vidi [[percentiles-slo]].',
      '**SLO** (npr. 99,9% zahteva brže od 300 ms) i budžet grešaka određuju kada se usporava razvoj i radi na stabilnosti.',
      'Alarmi na simptome koje korisnik oseća (greške, kašnjenje), ne na svaki skok CPU-a.',
      'Kapacitet se planira iz istih metrika: trend vrha, iskorišćenje na vrhu i koliko instanci treba za sledeći rast.',
    ],
    sim: 'Grafikon ispod scene je mali dashboard: poslati i uspešni zahtevi, pa prosečan CPU i RAM instanci za poslednjih 60 sekundi. Crveno polje su izgubljeni zahtevi.',
    rel: ['tracing', 'percentiles-slo'],
  },
];
