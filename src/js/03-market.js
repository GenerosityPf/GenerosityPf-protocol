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
