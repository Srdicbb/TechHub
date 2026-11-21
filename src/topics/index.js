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

export const TOPICS = [...messaging, ...concurrency, ...concurrency2, ...parallel, ...caching, ...distributed, ...sql, ...architecture, ...kubernetes, ...observability, ...dotnet, ...angular, ...ai, ...algorithms, ...sysdesign];
