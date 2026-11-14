// Tiny static server for local checks: node scripts/serve.mjs <dir> <port>
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
const dir = resolve(process.argv[2] || 'dist'), port = +process.argv[3] || 4173;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
createServer((q, r) => {
  let p = join(dir, decodeURIComponent(q.url.split('?')[0])); if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(dir) || !existsSync(p)) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' }); r.end(readFileSync(p));
}).listen(port, () => console.log('serving ' + dir + ' on ' + port));
