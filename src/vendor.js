// Vendor bundle: three.js + addons + highlight.js, exposed on window.__V
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import hljs from 'highlight.js/lib/core';
import csharp from 'highlight.js/lib/languages/csharp';
import typescript from 'highlight.js/lib/languages/typescript';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import xml from 'highlight.js/lib/languages/xml';
import plaintext from 'highlight.js/lib/languages/plaintext';

const langs = { csharp, typescript, sql, yaml, bash, json, xml, plaintext };
for (const n in langs) hljs.registerLanguage(n, langs[n]);
window.__V = { THREE, OrbitControls, CSS2DRenderer, CSS2DObject, hljs };
