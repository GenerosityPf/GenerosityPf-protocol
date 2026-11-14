(() => {
'use strict';
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

/* ui: social, CA slot, reveal, parallax, spotlight, progress, count-up */
const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>';
const GH_SVG = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>';

function renderSocial() {
  const mk = (key, svg, name) => {
    const r = G.reg[key];
    if (r.state === 'stated') {
      const h = key.startsWith('x') ? handleOf(r.url) : name;
      return `<a class="icon-btn" data-social="${key}" href="${esc(r.url)}" target="_blank" rel="noopener" aria-label="${esc(name)} ${esc(h)}" title="${esc(name)} ${esc(h)}">${svg}</a>`;
    }
    return `<span class="icon-btn inert" data-social="${key}" role="img" aria-disabled="true" aria-label="${esc(name)} not yet available" title="${esc(name)} not yet available">${svg}</span>`;
  };
  $('#social').innerHTML = mk('x1', X_SVG, 'X') + mk('github', GH_SVG, 'GitHub');
  const links = [];
  for (const k of ['x1']) if (isStated(k)) links.push(`<a class="chipl" href="${esc(G.reg[k].url)}" target="_blank" rel="noopener">${esc(handleOf(G.reg[k].url))}</a>`);
  links.push(isStated('ca') ? `<a class="chipl" href="https://dexscreener.com/solana/${esc(CA())}" target="_blank" rel="noopener">Open chart</a>` : `<span class="chipl" aria-disabled="true">Chart link arrives alongside the mint</span>`);
  $('#nowLinks').innerHTML = links.join('');
}

/* CA slot: inert until a CA is stated */
function renderCA() {
  const b = $('#ca'), t = $('#caText'), a = $('#caAct'), kv = $('#kvMint');
  const ca = CA();
  if (!ca) {
    b.setAttribute('aria-disabled', 'true'); b.tabIndex = -1; a.textContent = '';
    b.setAttribute('aria-label', 'Token mint not yet announced');
    kv.textContent = 'to be announced';
    return;
  }
  t.textContent = ca; a.textContent = 'Copy'; kv.textContent = ca.slice(0, 5) + '…' + ca.slice(-5);
  b.removeAttribute('aria-disabled'); b.tabIndex = 0; b.setAttribute('aria-label', 'Copy token mint ' + ca);
  let h;
  b.addEventListener('click', async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(ca); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = ca; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch {} ta.remove();
    }
    a.textContent = ok ? 'Copied ✓' : 'Press Ctrl+C'; b.classList.toggle('copied', ok); toast(ok ? 'Mint copied' : 'Copy failed, select the text');
    clearTimeout(h); h = setTimeout(() => { a.textContent = 'Copy'; b.classList.remove('copied'); }, 1800);
  });
}

/* scroll-reveal with staggered springs */
function initReveal() {
  const els = $$('[data-reveal]');
  const show = el => { el.style.removeProperty('opacity'); el.style.removeProperty('transform'); el.classList.add('in'); };
  if (reduced.matches || !('IntersectionObserver' in window)) { els.forEach(show); return; }
  let n = 0, rs;
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      io.unobserve(e.target);
      const el = e.target, delay = (n++ % 6) * 90;
      setTimeout(() => {
        el.style.opacity = '0'; el.classList.add('in');
        G.spring(0, 1, p => { el.style.opacity = Math.min(1, Math.max(0, p)); el.style.transform = `translate3d(0,${(1 - p) * 28}px,0)`; }, () => show(el));
      }, delay);
    }
    clearTimeout(rs); rs = setTimeout(() => { n = 0; }, 400);
  }, { threshold: 0.12, rootMargin: '0px 0px -4% 0px' });
  els.forEach(el => io.observe(el));
}

/* hero parallax: pointer + scroll, lerped */
function initParallax() {
  if (reduced.matches) return;
  const layers = $$('[data-depth]').map(el => ({ el, d: parseFloat(el.dataset.depth) }));
  let tx = 0, ty = 0, cx = 0, cy = 0, sy = 0, csy = 0, run = false;
  const loop = () => {
    cx += (tx - cx) * 0.08; cy += (ty - cy) * 0.08; csy += (sy - csy) * 0.1;
    for (const { el, d } of layers) el.style.transform = `translate3d(${cx * d * 34}px, ${cy * d * 34 - csy * d * 0.22}px, 0)`;
    if (Math.abs(tx - cx) > 0.001 || Math.abs(ty - cy) > 0.001 || Math.abs(sy - csy) > 0.2) requestAnimationFrame(loop); else run = false;
  };
  const kick = () => { if (!run) { run = true; requestAnimationFrame(loop); } };
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; kick(); }, { passive: true });
  addEventListener('scroll', () => { sy = scrollY; kick(); }, { passive: true });
}

function initSpotlight() {
  document.addEventListener('pointermove', e => {
    const el = e.target.closest && e.target.closest('[data-spot]');
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', e.clientX - r.left + 'px'); el.style.setProperty('--my', e.clientY - r.top + 'px');
  }, { passive: true });
}

function initProgress() {
  const bar = $('#progress'); let q = false;
  const upd = () => { q = false; const h = document.documentElement.scrollHeight - innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, scrollY / h) : 0})`; };
  addEventListener('scroll', () => { if (!q) { q = true; requestAnimationFrame(upd); } }, { passive: true });
  addEventListener('resize', upd); upd();
}

function initNav() {
  const links = $$('[data-nav]'), map = new Map(links.map(a => [a.dataset.nav, a]));
  const secs = [['top', $('.hero')], ['market', $('#market')], ['values', $('#values')]];
  const upd = () => { let cur = 'top'; for (const [k, el] of secs) if (el.getBoundingClientRect().top < innerHeight * 0.35) cur = k; links.forEach(a => a.classList.toggle('on', a === map.get(cur))); };
  addEventListener('scroll', upd, { passive: true }); upd();
}

/* number count-up with flash on change */
function setNum(el, value, fmt, { flash = true } = {}) {
  if (!el) return;
  const prev = el._n;
  if (value == null || !isFinite(value)) { el._n = undefined; el.textContent = '—'; el.classList.add('dash'); return; }
  el.classList.remove('dash');
  if (prev === value) return;
  el._n = value;
  cancelAnimationFrame(el._raf);
  if (prev == null || reduced.matches) { el.textContent = fmt(value); return; }
  const t0 = performance.now(), dur = 600;
  const tick = now => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(prev + (value - prev) * e);
    if (p < 1) el._raf = requestAnimationFrame(tick); else el.textContent = fmt(value);
  };
  el._raf = requestAnimationFrame(tick);
  if (flash) {
    const host = el.closest('.mrow, .row, .now-figs > div, .stat') || el;
    host.classList.remove('flash-up', 'flash-dn'); void host.offsetWidth;
    host.classList.add(value > prev ? 'flash-up' : 'flash-dn');
  }
}

function initBurger() {
  const b = $('#burger'), n = $('#nav');
  const set = o => { n.classList.toggle('open', o); b.setAttribute('aria-expanded', String(o)); };
  b.addEventListener('click', () => set(!n.classList.contains('open')));
  n.addEventListener('click', e => { if (e.target.closest('a')) set(false); });
  addEventListener('resize', () => { if (innerWidth > 900) set(false); });
}

/* market: live DexScreener data (never gated by CA state), own-token row, ticker, hero stats */
const M = G.reg.market;
const BRAND_LOGO = 'assets/logo-96.png';
const S = { trending: [], ownDex: null, ownPump: null, ownDexErr: false, hasData: false, status: 'loading', sort: 'boost', q: '', nextAt: 0 };
const num = v => { const n = Number(v); return isFinite(n) && v !== null && v !== '' ? n : null; };

async function getJSON(url, ms = 10000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', signal: ctl.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(t); }
}
/* exponential backoff with jitter */
async function withBackoff(fn, tries = 3, base = 800) {
  let err;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); } catch (e) { err = e; if (i < tries - 1) await sleep(base * 2 ** i + Math.random() * 250); }
  }
  throw err;
}

const pickPair = (pairs, addr) => {
  const sol = (pairs || []).filter(p => p && p.chainId === 'solana');
  const base = sol.filter(p => p.baseToken && p.baseToken.address === addr);
  return (base.length ? base : sol).sort((a, b) => (num(b.volume && b.volume.h24) || 0) - (num(a.volume && a.volume.h24) || 0))[0] || null;
};
const rowFromPair = (p, extra = {}) => ({
  symbol: p.baseToken.symbol, name: p.baseToken.name,
  logos: [p.info && p.info.imageUrl].filter(Boolean),
  price: num(p.priceUsd), chg: num(p.priceChange && p.priceChange.h24), vol: num(p.volume && p.volume.h24), liq: num(p.liquidity && p.liquidity.usd),
  url: p.url, ...extra,
});

async function loadTrending() {
  const boosts = await withBackoff(() => getJSON(M.boostsUrl));
  const best = new Map();
  for (const b of Array.isArray(boosts) ? boosts : []) {
    if (b.chainId !== 'solana' || !b.tokenAddress) continue;
    const cur = best.get(b.tokenAddress);
    if (!cur || (num(b.totalAmount) || 0) > (num(cur.totalAmount) || 0)) best.set(b.tokenAddress, b);
  }
  const top = [...best.values()].sort((a, b) => (num(b.totalAmount) || 0) - (num(a.totalAmount) || 0)).slice(0, 10);
  if (!top.length) throw new Error('empty');
  const prev = new Map(S.trending.map(r => [r.addr, r]));
  const rows = await Promise.all(top.map(async (b, i) => {
    const addr = b.tokenAddress;
    try {
      const pairs = await withBackoff(() => getJSON(M.tokenUrl + addr), 2);
      const p = pickPair(pairs, addr);
      if (!p) throw new Error('no pair');
      return rowFromPair(p, { addr, boost: i, logos: [p.info && p.info.imageUrl, b.icon].filter(Boolean), url: p.url || b.url });
    } catch {
      const old = prev.get(addr);
      return old ? { ...old, boost: i } : { addr, boost: i, symbol: null, name: addr.slice(0, 4) + '…' + addr.slice(-4), logos: [b.icon].filter(Boolean), failed: true, url: b.url };
    }
  }));
  if (rows.every(r => r.failed)) throw new Error('all token lookups failed');
  S.trending = rows; S.hasData = true;
}

async function loadOwn() {
  const ca = CA(); if (!ca) return;
  // Rule 6: both fetched in parallel; each renders as soon as it lands, neither blocks the other.
  const dexP = withBackoff(() => getJSON(M.ownDexUrl + ca), 2).then(j => {
    S.ownDex = pickPair(j && j.pairs, ca); S.ownDexErr = !S.ownDex; renderAll();
  }).catch(() => { S.ownDexErr = true; renderAll(); });
  const pumpP = getJSON(M.ownPumpUrl + ca).then(j => { S.ownPump = j && typeof j === 'object' ? j : null; renderAll(); }).catch(() => {});
  await Promise.allSettled([dexP, pumpP]);
}

/* the composite own-token record */
function own() {
  const ca = CA();
  if (!ca) return { placeholder: true, symbol: 'Generosity', name: 'Contract pending', logos: [BRAND_LOGO] };
  const d = S.ownDex, p = S.ownPump;
  const base = d ? rowFromPair(d) : { price: null, chg: null, vol: null, liq: null };
  const logos = [p && p.image_uri, d && d.info && d.info.imageUrl, BRAND_LOGO].filter(Boolean);
  return {
    ...base, addr: ca, logos,
    symbol: (p && p.symbol) || (d && d.baseToken.symbol) || 'Generosity',
    name: (p && p.name) || (d && d.baseToken.name) || 'Generosity',
    url: (d && d.url) || 'https://dexscreener.com/solana/' + ca,
  };
}

/* ---------- logos ---------- */
const logoHTML = (logos, letter, size) => {
  const tile = `<span class="mono-logo" style="width:${size}px;height:${size}px;font-size:${Math.round(size / 2.4)}px">${esc((letter || '?').charAt(0).toUpperCase())}</span>`;
  if (!logos.length) return tile;
  return `<img class="logo-img" src="${esc(logos[0])}" data-alts="${esc(logos.slice(1).join(' '))}" data-letter="${esc((letter || '?').charAt(0).toUpperCase())}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer" style="width:${size}px;height:${size}px;padding:${Math.max(1, Math.round(size * 0.06))}px">`;
};
addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains('logo-img')) return;
  const alts = (img.dataset.alts || '').split(' ').filter(Boolean);
  if (alts.length) { img.src = alts.shift(); img.dataset.alts = alts.join(' '); return; }
  const s = img.width || 32;
  const t = document.createElement('span'); t.className = 'mono-logo'; t.style.cssText = `width:${s}px;height:${s}px;font-size:${Math.round(s / 2.4)}px`; t.textContent = img.dataset.letter || '?';
  img.replaceWith(t);
}, true);

/* ---------- board ---------- */
const rowsEl = () => $('#mrows');
function skeleton() {
  rowsEl().innerHTML = Array.from({ length: 10 }, () => `<div class="mrow skel"><span class="sk" style="width:16px;justify-self:center"></span><div class="tk-id"><span class="sk l"></span><div style="flex:1"><span class="sk" style="width:60%;margin-bottom:6px"></span><span class="sk" style="width:40%;height:9px"></span></div></div><span class="sk" style="justify-self:end;width:70px"></span><span class="sk" style="justify-self:end;width:50px"></span><span class="sk" style="justify-self:end;width:70px"></span><span class="sk" style="justify-self:end;width:70px"></span></div>`).join('');
  $('#ticker #tickerTrack').innerHTML = Array.from({ length: 14 }, () => '<span class="tk sk"><i class="sk"></i></span>').join('');
}

function makeRow(key, isOwn, clickable) {
  const el = document.createElement(clickable ? 'a' : 'div');
  el.className = 'mrow enter' + (isOwn ? ' own' : '') + (isOwn && !clickable ? ' placeholder' : '');
  el.dataset.key = key; el.setAttribute('data-spot', '');
  if (clickable) { el.target = '_blank'; el.rel = 'noopener'; }
  el.innerHTML = `<span class="rk"></span><div class="tk-id"><span data-logo></span><div><b data-sym></b><span class="n" data-name></span></div></div><span class="c" data-f="price"></span><span class="c chg" data-f="chg"><span class="arr"></span><span class="n"></span></span><span class="c" data-f="vol"></span><span class="c" data-f="liq"></span>`;
  return el;
}
function fillRow(el, r, rank) {
  el.querySelector('.rk').textContent = rank;
  const sym = el.querySelector('[data-sym]'), nm = el.querySelector('[data-name]');
  sym.textContent = r.symbol || r.name; nm.textContent = r.symbol ? r.name : (r.failed ? 'lookup failed' : '');
  const lk = r.logos.join('|') + '#' + (r.symbol || r.name);
  if (el._lk !== lk) { el._lk = lk; el.querySelector('[data-logo]').innerHTML = logoHTML(r.logos, r.symbol || r.name, 36); }
  if (r.placeholder) { for (const f of ['price', 'vol', 'liq']) el.querySelector(`[data-f="${f}"]`).textContent = '· · · · ·'; const c = el.querySelector('[data-f="chg"]'); c.querySelector('.n').textContent = '· · · · ·'; c.querySelector('.arr').textContent = ''; el.querySelector('[data-f="price"]').classList.add('dash'); return; }
  if (el.href !== r.url && r.url) el.href = r.url;
  setNum(el.querySelector('[data-f="price"]'), r.price, fmtPrice);
  setNum(el.querySelector('[data-f="vol"]'), r.vol, fmtUsd);
  setNum(el.querySelector('[data-f="liq"]'), r.liq, fmtUsd);
  const c = el.querySelector('[data-f="chg"]');
  setNum(c.querySelector('.n'), r.chg, fmtChg);
  c.classList.toggle('up', r.chg > 0); c.classList.toggle('dn', r.chg != null && r.chg < 0);
  c.querySelector('.arr').textContent = r.chg == null ? '' : r.chg > 0 ? '▲' : r.chg < 0 ? '▼' : '';
}
function showRows(el, list) { // list: [{key, build, data, rank}]
  const host = rowsEl();
  const loading = !S.hasData && S.status === 'loading';
  if (!loading) for (const n of [...host.children]) if (n.classList.contains('skel')) n.remove();
  const keep = new Set(list.map(x => x.key));
  for (const n of [...host.children]) if (!n.classList.contains('skel') && !keep.has(n.dataset.key)) n.remove();
  list.forEach((x, i) => {
    let row = host.querySelector(`[data-key="${CSS.escape(x.key)}"]`);
    const isNew = !row;
    if (!row) row = x.build();
    fillRow(row, x.data, x.rank);
    if (host.children[i] !== row) host.insertBefore(row, host.children[i] || null);
    if (isNew) { row.style.setProperty('--d', i * 55 + 'ms'); requestAnimationFrame(() => requestAnimationFrame(() => row.classList.add('in'))); }
    row.classList.toggle('hidden', !!x.hide);
  });
}

function sorted(rows) {
  const r = rows.slice();
  if (S.sort === 'chg') r.sort((a, b) => (b.chg ?? -Infinity) - (a.chg ?? -Infinity));
  else if (S.sort === 'vol') r.sort((a, b) => (b.vol ?? -Infinity) - (a.vol ?? -Infinity));
  else r.sort((a, b) => a.boost - b.boost);
  return r;
}
const trendingRows = () => { const ca = CA(); return S.trending.filter(r => r.addr !== ca); }; // dedup: own token never repeats

function renderBoard() {
  const o = own(), clickable = !!CA();
  const list = [{ key: 'own', build: () => makeRow('own', true, clickable), data: o, rank: 1 }];
  if (S.hasData) {
    const q = S.q.trim().toLowerCase();
    sorted(trendingRows()).forEach((r, i) => list.push({ key: r.addr, build: () => makeRow(r.addr, false, true), data: r, rank: i + 2, hide: q && !((r.symbol || '') + ' ' + (r.name || '')).toLowerCase().includes(q) }));
  } else if (S.status !== 'loading') {
    // source failed and nothing cached: dash rows
    for (let i = 0; i < 10; i++) list.push({ key: 'dash' + i, build: () => makeRow('dash' + i, false, false), data: { name: '—', logos: [], symbol: '—', price: null, chg: null, vol: null, liq: null }, rank: i + 2 });
  }
  showRows(rowsEl(), list);
}

/* ---------- ticker ---------- */
function renderTicker() {
  const items = [];
  const ca = CA(); if (ca && S.ownDex) items.push({ key: 'own', ...own() });
  for (const r of sorted(trendingRows()).filter(r => !r.failed).sort((a, b) => a.boost - b.boost)) items.push({ key: r.addr, ...r });
  if (!items.length) return;
  const track = $('#tickerTrack'), sig = items.map(i => i.key).join(',');
  const html = it => `<span class="tk" data-k="${esc(it.key)}">${logoHTML(it.logos, it.symbol || it.name, 20)}<b>${esc(it.symbol || it.name)}</b><span data-p></span><span data-c></span></span>`;
  if (track._sig !== sig) { track._sig = sig; const half = items.map(html).join('').repeat(2); track.innerHTML = half + half; }
  for (const it of items) for (const el of $$(`[data-k="${CSS.escape(it.key)}"]`, track)) {
    el.querySelector('[data-p]').textContent = fmtPrice(it.price);
    const c = el.querySelector('[data-c]'); c.textContent = fmtChg(it.chg); c.className = it.chg > 0 ? 'up' : it.chg < 0 ? 'dn' : '';
  }
}

/* ---------- hero ---------- */
function renderHero() {
  const ca = CA(), o = own();
  const logoHost = $('#nowLogo'), lk = o.logos.join('|');
  if (logoHost._lk !== lk) { logoHost._lk = lk; logoHost.innerHTML = logoHTML(o.logos, 'G', 84); }
  if (ca) {
    $('#nowName').textContent = o.name;
    setNum($('#fPrice'), o.price, fmtPrice);
    const c = $('#fChg'); setNum(c, o.chg, fmtChg); c.style.color = o.chg > 0 ? 'var(--green-ink)' : '';
    setNum($('#fVol'), o.vol, fmtUsd);
    $('#fLiq').textContent = o.liq != null ? 'Liquidity ' + fmtUsd(o.liq) : ' ';
  }
  // market-derived stats (independent of CA)
  const rows = S.trending.filter(r => !r.failed);
  if (!S.hasData) { for (const id of ['sCount', 'sVol', 'sLiq', 'sTop']) if (S.status === 'error') { $('#' + id).textContent = '—'; } return; }
  setNum($('#sCount'), S.trending.length, fmtInt);
  setNum($('#sVol'), rows.reduce((a, r) => a + (r.vol || 0), 0), fmtUsd);
  setNum($('#sLiq'), rows.reduce((a, r) => a + (r.liq || 0), 0), fmtUsd);
  const top = rows.filter(r => r.chg != null).sort((a, b) => b.chg - a.chg)[0];
  if (top) { setNum($('#sTop'), top.chg, fmtChg); $('#sTopS').textContent = top.symbol; }
  const hot = $('#hotList');
  const hotRows = S.trending.slice(0, 5);
  hot.innerHTML = hotRows.map(r => `<a class="row" data-spot href="${esc(r.url || '#')}" target="_blank" rel="noopener"><span class="place">${r.boost + 1}</span>${logoHTML(r.logos, r.symbol || r.name, 32)}<div class="grow"><div class="nm">${esc(r.symbol || r.name)}</div><div class="sub">${esc(r.symbol ? r.name : '')}</div></div><div class="right mono" style="color:${r.chg > 0 ? 'var(--green-ink)' : 'inherit'}">${esc(fmtChg(r.chg))}</div></a>`).join('');
}

/* ---------- status ---------- */
const STATUS = { loading: ['Connecting', false], live: ['Live', true], stale: ['Retrying, showing last data', false], error: ['Feed unreachable', false] };
function setStatus(s) {
  S.status = s;
  for (const el of $$('[data-status]')) {
    el.classList.toggle('off', !STATUS[s][1]); el.classList.toggle('green', STATUS[s][1]);
    el.querySelector('.dot').classList.toggle('live', STATUS[s][1]); el.querySelector('span').textContent = STATUS[s][0];
  }
  const err = $('#mErr');
  if (s === 'stale') { err.textContent = 'The market feed did not answer. The last good numbers stay on screen while we retry.'; err.classList.remove('hide'); }
  else if (s === 'error') { err.textContent = 'The market feed is unreachable, so values show a dash. Retrying with longer pauses.'; err.classList.remove('hide'); }
  else err.classList.add('hide');
}

function renderAll() { renderBoard(); renderTicker(); renderHero(); }

/* ---------- polling: 60s, paused while hidden, immediate on visible ---------- */
let timer = 0, busy = false, failStreak = 0;
async function cycle() {
  if (busy) return; busy = true;
  clearTimeout(timer);
  if (!S.hasData) setStatus('loading');
  const jobs = [loadTrending(), loadOwn()];
  const [t] = await Promise.allSettled(jobs);
  if (t.status === 'fulfilled') { failStreak = 0; setStatus('live'); } else { failStreak++; setStatus(S.hasData ? 'stale' : 'error'); }
  renderAll();
  busy = false;
  schedule();
}
function schedule() {
  clearTimeout(timer);
  if (document.hidden) { S.nextAt = 0; return; }
  const wait = failStreak ? Math.min(M.pollMs, 5000 * 2 ** (failStreak - 1)) : M.pollMs; // backoff between failed cycles, never slower than the poll interval
  S.nextAt = performance.now() + wait; S.wait = wait;
  timer = setTimeout(cycle, wait);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(timer); S.nextAt = 0; } else cycle(); });

function tickCountdown() {
  if (document.hidden || !S.nextAt) return;
  const left = Math.max(0, S.nextAt - performance.now());
  $('#nowLeft').textContent = busy ? 'refreshing' : Math.ceil(left / 1000) + 's';
  $('#nowBar').style.transform = `scaleX(${busy ? 1 : 1 - left / (S.wait || M.pollMs)})`;
}

/* boot */
renderSocial();
renderCA(); initBurger();
initProgress(); initNav(); initSpotlight(); initParallax(); initReveal();

$$('#sortSeg button').forEach(b => b.addEventListener('click', () => {
  S.sort = b.dataset.sort; $$('#sortSeg button').forEach(x => x.classList.toggle('on', x === b)); renderBoard();
}));
$('#q').addEventListener('input', e => { S.q = e.target.value; renderBoard(); });

skeleton();
renderHero();
setStatus('loading');
renderBoard();
cycle();
setInterval(tickCountdown, 500);

/* Rule 3 gate: address-shaped strings must match the stated registry (CA slots exempt) */
setTimeout(() => { const bad = G.gate.scan(); if (bad.length) console.warn('[gate] unregistered address-shaped strings:', bad); }, 1500);
window.__generosity = { gate: G.gate, reg: G.reg };

})();
