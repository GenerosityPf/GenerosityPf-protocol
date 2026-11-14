/* core: register, gates, helpers, spring solver */
const G = {};
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---- Rule 3: address gate. Shape detection only; never blanket-rejects 0x hex. ---- */
const EVM_RE = /\b0x[0-9a-fA-F]{40}\b/g;
const SOL_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
G.gate = {
  shape(str) {
    if (/^0x[0-9a-fA-F]{40}$/.test(str)) return 'evm';
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str)) return 'sol';
    return null;
  },
  stated() { // every stated registry value that is address-shaped
    return Object.values(G.reg).filter(r => r.state === 'stated' && typeof r.value === 'string' && G.gate.shape(r.value)).map(r => r.value);
  },
  matches(str) { return G.gate.stated().includes(str); },
  /* scan visible text; CA slots are exempt; address-shaped strings must match the stated registry */
  scan(root = document.body) {
    const bad = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n; (n = w.nextNode());) {
      if (n.parentElement.closest('[data-ca-exempt],script,style')) continue;
      const hits = (n.nodeValue.match(EVM_RE) || []).concat(n.nodeValue.match(SOL_RE) || []);
      for (const h of hits) if (!G.gate.matches(h)) bad.push(h);
    }
    return bad;
  },
};

/* ---- Rule 1: register. state: stated | absent | unconfirmed ---- */
G.reg = (() => {
  const raw = window.REGISTER || {};
  const out = {};
  for (const [k, r] of Object.entries(raw)) {
    let state = ['stated', 'absent', 'unconfirmed'].includes(r.state) ? r.state : 'unconfirmed';
    const rec = { ...r, state };
    if (k === 'ca' && state === 'stated' && !(typeof r.value === 'string' && G.gate.shape(r.value))) rec.state = 'unconfirmed';
    if (k !== 'ca' && ('url' in r) && state === 'stated' && !/^https:\/\//.test(r.url || '')) rec.state = 'unconfirmed';
    out[k] = rec;
  }
  return out;
})();
const isStated = k => G.reg[k] && G.reg[k].state === 'stated';
/* Rule 2: store URL, derive handle */
const handleOf = url => { try { return '@' + new URL(url).pathname.replace(/^\/+|\/+$/g, '').split('/')[0]; } catch { return ''; } };
const CA = () => (isStated('ca') ? G.reg.ca.value : null);

/* ---- formatting ---- */
const fmtUsd = v => {
  v = Number(v); if (!isFinite(v)) return '—';
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e4) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 });
};
const fmtPrice = v => {
  v = Number(v); if (!isFinite(v)) return '—';
  if (v >= 1) return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  if (v <= 0) return '$0';
  return '$' + v.toFixed(Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(v)))));
};
const fmtChg = v => { v = Number(v); return isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(Math.abs(v) >= 100 ? 0 : 2) + '%' : '—'; };
const fmtInt = v => Math.round(Number(v) || 0).toLocaleString('en-US');

/* ---- damped spring solver (semi-implicit Euler, fixed sub-steps) ---- */
G.spring = (from, to, onUpdate, onDone, { k = 170, c = 19, m = 1 } = {}) => {
  let x = from, v = 0, last = performance.now();
  const step = now => {
    let dt = Math.min(0.05, (now - last) / 1000); last = now;
    while (dt > 0) { const h = Math.min(dt, 1 / 240); v += ((-k * (x - to) - c * v) / m) * h; x += v * h; dt -= h; }
    if (Math.abs(v) < 0.002 && Math.abs(x - to) < 0.0005) { onUpdate(to); onDone && onDone(); return; }
    onUpdate(x); requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

let toastT;
const toast = msg => { const t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); };
