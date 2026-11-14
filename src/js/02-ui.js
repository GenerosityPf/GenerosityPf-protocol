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
