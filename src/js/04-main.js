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
