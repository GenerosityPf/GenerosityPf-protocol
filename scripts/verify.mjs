// Gate checks over dist/ plus a state-independent branch proof (both CA branches are built and exercised).
import { readFileSync, existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const rd = p => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const gate = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  | ' + detail : ''}`); };

const html = rd('dist/index.html'), app = rd('dist/app.js'), css = rd('dist/styles.css');
const reg = JSON.parse(rd('src/registry.json'));

// logo + favicon in dist
for (const f of ['logo-96.png', 'logo-256.png', 'logo-512.png']) {
  const p = join(dist, 'assets', f), ok = existsSync(p) && readFileSync(p).subarray(1, 4).toString() === 'PNG';
  const b = ok ? readFileSync(p) : null;
  gate(`dist/assets/${f} present, valid PNG`, ok, ok ? `colortype ${b[25]}, ${b.readUInt32BE(16)}x${b.readUInt32BE(20)}` : '');
}
gate('index.html references assets/logo-96.png (relative path, file exists)', /src="assets\/logo-96\.png"/.test(html) && existsSync(join(dist, 'assets/logo-96.png')));
const refs = [...html.matchAll(/(?:src|href)="([^":#?]+(?:\?[^"]*)?)"/g)].map(m => m[1].split('?')[0]).filter(r => !r.startsWith('http') && !r.startsWith('//'));
gate('every relative src/href in index.html resolves inside dist/', refs.every(r => existsSync(join(dist, r))), refs.join(', '));
const fav = existsSync(join(dist, 'favicon.svg')) ? readFileSync(join(dist, 'favicon.svg'), 'utf8') : '';
gate('favicon.svg is 32x32 and linked', /viewBox="0 0 32 32"/.test(fav) && /rel="icon"[^>]*favicon\.svg/.test(html));

// palette rule: colour literals only in tokens.css
const files0 = ['src/styles.css', 'src/index.html', ...readdirSync(join(root, 'src/js')).map(f => 'src/js/' + f)];
const hexHits = [];
for (const f of files0) for (const m of rd(f).matchAll(/(?<![&\w])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![\w-])/g)) if (/\d/.test(m[1]) || /^[a-f]{6}$/i.test(m[1])) hexHits.push(f + ' ' + m[0]);
gate('no colour literals outside src/tokens.css', hexHits.length === 0, hexHits.slice(0, 5).join('; '));

// no dates
const visible = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
const dateRe = /\b(19|20)\d{2}\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.? \d|\b\d{1,2}:\d{2}\b|\bas of\b|\bchecked\b|\bupdated\b|\b(ago|yesterday|today|tomorrow)\b/i;
const jsStrings = (app.match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g) || []).filter(s => !/^['"`]https?:/.test(s));
const jsDate = /\b(19|20)\d{2}\b|\b\d{1,2}:\d{2}\b|\bas of\b|\bchecked\b|\bago\b/i;
gate('no dates, timestamps or clock strings in page text', !dateRe.test(visible), (visible.match(dateRe) || [''])[0]);
gate('no date or clock strings in JS-rendered text', !jsStrings.some(s => jsDate.test(s)), jsStrings.find(s => jsDate.test(s)) || '');

// link rule
gate('no hard-coded x.com / github.com hrefs (links derive from register)', !/x\.com\/|github\.com\//.test(html.replace(/window\.REGISTER=[^\n]*?;<\/script>/, '') + app));

// repo hygiene
const walk = d => readdirSync(d).flatMap(n => { if (['node_modules', '.git', 'brand', 'reference'].includes(n) || n.startsWith('.proof-')) return []; const p = join(d, n); return statSync(p).isDirectory() ? [p, ...walk(p)] : [p]; });
const files = walk(root);
gate('no CLAUDE.md or .claude/ in repo', !files.some(f => /(^|[\\/])(CLAUDE\.md|\.claude)([\\/]|$)/.test(relative(root, f))));
const textFiles = files.filter(f => ['.md', '.js', '.mjs', '.html', '.css', '.json', '.svg', ''].includes(extname(f)) && statSync(f).isFile() && statSync(f).size < 2e6 && !f.endsWith('verify.mjs'));
const attrib = textFiles.filter(f => /claude|anthropic|co-authored-by|generated (with|by)|\bAI[- ]generated/i.test(readFileSync(f, 'utf8')));
gate('no AI attribution in any project file', attrib.length === 0, attrib.map(f => relative(root, f)).join(', '));

// address gate (static): address-shaped strings must match the stated registry; CA slots exempt
const caVal = reg.ca.state === 'stated' ? reg.ca.value : null;
const exempt = visible; // data-ca-exempt text is stripped below from the raw html
const stripped = html.replace(/<[^>]*data-ca-exempt[^>]*>[^<]*/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, ' ');
const addrHits = [...(stripped.match(/\b0x[0-9a-fA-F]{40}\b|\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g) || [])].filter(a => a !== caVal);
gate('address scanner: no unregistered address-shaped strings in markup', addrHits.length === 0, addrHits.join(','));

// market independent of CA
const lt = app.slice(app.indexOf('async function loadTrending'), app.indexOf('async function loadOwn'));
gate('market loader (loadTrending) has zero dependency on CA state', lt.length > 100 && !/CA\(\)|reg\.ca|isStated/.test(lt));
gate('market follows the market register record only', /const M = G\.reg\.market/.test(app) && /M\.boostsUrl/.test(lt) && /M\.tokenUrl/.test(lt));

// own-token row contract
gate('own row: pump.fun and DexScreener fetched in parallel, neither awaited on the other', /const dexP[\s\S]{0,500}const pumpP[\s\S]{0,300}Promise\.allSettled\(\[dexP, pumpP\]\)/.test(app));
gate('own row: 2px accent border-left, ownPulse keyframes, reduced-motion animation none', /\.mrow\.own\s*\{[^}]*border-left:\s*2px solid var\(--color-accent\)/.test(css) && /@keyframes ownPulse/.test(css) && /prefers-reduced-motion: reduce\) \{ \.mrow\.own \{ animation: none/.test(css));
gate('poll 60s, paused while hidden, immediate fetch on visible', reg.market.pollMs === 60000 && /document\.hidden/.test(app) && /visibilitychange/.test(app));

// branch proof: anchors read the CURRENT record, then flip it (state independent)
const sample = 'So11111111111111111111111111111111111111112';
const cur = reg.ca.state;
const variants = { current: cur === 'stated' ? sample : 'none', flipped: cur === 'stated' ? 'none' : sample };
const core = readFileSync(join(root, 'src/js/01-core.js'), 'utf8');
const evalCore = (register, tail) => {
  const ctx = { window: { REGISTER: register }, document: {}, matchMedia: () => ({ matches: false }), NodeFilter: {}, performance, URL };
  vm.createContext(ctx); vm.runInContext(core + '\n;' + tail, ctx); return ctx.__out;
};
const proof = {};
for (const [k, v] of Object.entries(variants)) {
  const out = `.proof-${k}`;
  execFileSync('node', [join(root, 'scripts/build.mjs')], { env: { ...process.env, GEN_OUT: out, GEN_CA: v }, stdio: 'pipe' });
  const h = readFileSync(join(root, out, 'index.html'), 'utf8');
  const r = JSON.parse(h.match(/window\.REGISTER=(\{.*\});<\/script>/)[1]);
  proof[k] = { r, o: evalCore(r, 'globalThis.__out={G,isStated,CA,handleOf};') };
  rmSync(join(root, out), { recursive: true, force: true });
}
const absentSide = Object.values(proof).find(p => p.r.ca.state === 'absent'), statedSide = Object.values(proof).find(p => p.r.ca.state === 'stated');
gate('branch A (CA absent): CA() is null, slot inert, github record inert, X record stated', !!absentSide && absentSide.o.CA() === null && !absentSide.o.isStated('ca') && absentSide.o.isStated('x1') && !absentSide.o.isStated('github'));
gate('branch B (CA stated): CA() returns the stated value', !!statedSide && statedSide.o.CA() === sample);
gate('handles derive from stored URL', proof.current.o.handleOf(reg.x1.url) === '@' + new URL(reg.x1.url).pathname.slice(1));
const gt = proof.current.o.G.gate;
gate('gate: 0x hex is not blanket-rejected, shapes detected', gt.shape('0x' + 'a'.repeat(40)) === 'evm' && gt.shape(sample) === 'sol' && gt.shape('hello') === null);
const caStateFor = v => evalCore({ ...reg, ca: { state: 'stated', value: v } }, 'globalThis.__out=G.reg.ca.state;');
gate('gate: stated CA must be address-shaped, else unconfirmed (inert)', caStateFor('not-an-address!') === 'unconfirmed' && caStateFor('0x' + 'b'.repeat(40)) === 'stated' && caStateFor(sample) === 'stated');

console.log(`\ngates: ${pass + fail}  passed: ${pass}  failed: ${fail}`);
process.exit(fail ? 1 : 0);
