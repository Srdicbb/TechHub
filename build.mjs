import * as esbuild from 'esbuild';
import fs from 'node:fs';

const ICONS = ['send', 'lock', 'cpu', 'zap', 'network', 'database', 'blocks', 'container', 'activity', 'braces', 'component', 'brain-circuit', 'route',
  'play', 'pause', 'rotate-ccw', 'maximize', 'copy', 'search', 'menu', 'chevron-left', 'chevron-right', 'arrow-left', 'arrow-right', 'triangle-alert',
  'plus', 'minus', 'skull', 'power', 'refresh-cw', 'scissors', 'step-forward', 'wifi-off', 'unplug', 'hammer', 'flame', 'bug', 'server-crash', 'map', 'layers', 'gauge', 'timer', 'house', 'chevron-down', 'check', 'server', 'shield', 'crosshair', 'sun', 'moon', 'history', 'globe', 'x', 'sparkles'];
const icons = {};
for (const n of ICONS) {
  const p = `node_modules/lucide-static/icons/${n}.svg`;
  if (!fs.existsSync(p)) { console.warn('missing icon', n); continue; }
  icons[n] = fs.readFileSync(p, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/\s*class="[^"]*"/, '')
    .replace(/\s(width|height)="24"/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').trim();
}
fs.writeFileSync('src/icons.js', 'export const ICONS = ' + JSON.stringify(icons) + ';\n');
fs.mkdirSync('build', { recursive: true });
fs.mkdirSync('dist', { recursive: true });
await esbuild.build({ entryPoints: ['src/vendor.js'], bundle: true, minify: true, format: 'iife', outfile: 'build/vendor.js', legalComments: 'none', target: 'es2020', logLevel: 'warning' });
await esbuild.build({ entryPoints: ['src/app.js'], bundle: true, minify: false, format: 'iife', outfile: 'build/app.js', target: 'es2020', charset: 'utf8', logLevel: 'warning' });
const safe = s => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
let html = fs.readFileSync('src/index.html', 'utf8');
html = html.replace(/<!--ICON:([a-z0-9-]+)-->/g, (m, n) => (icons[n] || '').replace('<svg', '<svg aria-hidden="true" class="i"'));
html = html.replace('/*CSS*/', () => fs.readFileSync('src/style.css', 'utf8'))
  .replace('/*VENDOR*/', () => safe(fs.readFileSync('build/vendor.js', 'utf8')))
  .replace('/*APP*/', () => safe(fs.readFileSync('build/app.js', 'utf8')));
fs.writeFileSync('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0) + ' KB');
