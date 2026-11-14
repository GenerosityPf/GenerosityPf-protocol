// Build: src/ -> dist/ (override with GEN_OUT). GEN_CA injects a CA into the register for branch proofs only.
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const out = process.env.GEN_OUT ? join(root, process.env.GEN_OUT) : join(root, 'dist');

const reg = JSON.parse(readFileSync(join(src, 'registry.json'), 'utf8'));
if (process.env.GEN_CA === 'none') reg.ca = { state: 'absent', value: null };
else if (process.env.GEN_CA) reg.ca = { state: 'stated', value: process.env.GEN_CA };

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const js = readdirSync(join(src, 'js')).filter(f => f.endsWith('.js')).sort()
  .map(f => readFileSync(join(src, 'js', f), 'utf8')).join('\n');
const app = `(() => {\n'use strict';\n${js}\n})();\n`;
const css = readFileSync(join(src, 'tokens.css'), 'utf8') + '\n' + readFileSync(join(src, 'styles.css'), 'utf8');
const hash = createHash('sha1').update(app + css).digest('hex').slice(0, 10);

writeFileSync(join(out, 'app.js'), app);
writeFileSync(join(out, 'styles.css'), css);
writeFileSync(join(out, 'index.html'),
  readFileSync(join(src, 'index.html'), 'utf8').replaceAll('__HASH__', hash).replace('__REGISTER__', JSON.stringify(reg)));

// assets: the logo files MUST land in dist/assets (verified by scripts/verify.mjs)
cpSync(join(src, 'assets'), join(out, 'assets'), { recursive: true });
copyFileSync(join(src, 'assets', 'favicon.svg'), join(out, 'favicon.svg'));

for (const f of ['assets/logo-96.png', 'assets/logo-256.png', 'assets/logo-512.png', 'favicon.svg', 'index.html', 'app.js', 'styles.css'])
  if (!existsSync(join(out, f))) { console.error('build: missing ' + f); process.exit(1); }
console.log(`build ok -> ${out} (ca: ${reg.ca.state})`);
