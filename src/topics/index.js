import messaging from './messaging.js';
import concurrency from './concurrency.js';
import concurrency2 from './concurrency2.js';
import parallel from './parallel.js';
import caching from './caching.js';
import distributed from './distributed.js';
import sql from './sql.js';
import architecture from './architecture.js';
import kubernetes from './kubernetes.js';
import observability from './observability.js';
import dotnet from './dotnet.js';
import angular from './angular.js';
import ai from './ai.js';
import algorithms from './algorithms.js';
import sysdesign from './sysdesign.js';
import network from './network.js';
import hardware from './hardware.js';

const ALL = [...messaging, ...concurrency, ...concurrency2, ...parallel, ...caching, ...distributed, ...sql, ...architecture, ...kubernetes, ...observability, ...dotnet, ...angular, ...ai, ...algorithms, ...sysdesign, ...network, ...hardware];

// tema u pripremi (soon) ustupa mesto punoj temi sa istim id-jem, gde god da je napisana
const pick = new Map();
for (const t of ALL) { const o = pick.get(t.id); if (!o || (o.soon && !t.soon)) pick.set(t.id, t); }
export const TOPICS = [...pick.values()];
