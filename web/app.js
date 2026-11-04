// Grok Bot desk · iPhone web app · plan B: polls static JSON on GitHub Pages with a ?t= cache-buster.
(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, e) => (e || document).querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const POLL = 15;
  // opening link: {URL}#d={DATA_PATH} once, then kept in localStorage (plan B stand-in for #t=)
  // #d= stays in the URL (history.replaceState keeps it) so Add to Home Screen captures it:
  // iOS home-screen apps get their own storage. Also kept in localStorage + a cookie.
  const m = location.hash.match(/^#d=([A-Za-z0-9_-]{16,})/);
  const ck = (document.cookie.match(/(?:^|; )desk_d=([A-Za-z0-9_-]+)/) || [])[1];
  let D0 = null;
  try { D0 = localStorage.getItem('desk_d'); } catch (_) {}
  const D = (m && m[1]) || D0 || ck || null;
  if (D) {
    try { localStorage.setItem('desk_d', D); } catch (_) {}
    document.cookie = 'desk_d=' + D + '; path=/grok-desk/; max-age=31536000; SameSite=Strict; Secure';
  }
  const routeOf = () => location.hash.replace(/^#(d=[A-Za-z0-9_-]+&?)?\/?/, '');
  function keepD() {
    if (!D) return;
    const r = routeOf() || 'home';
    const want = '#d=' + D + '&/' + r;
    if (location.hash !== want) history.replaceState(null, '', location.pathname + location.search + want);
  }
  keepD();
  const BASE = D ? '/grok-desk-data/d/' + D + '/' : null;
  const S = {state: null, chart: null, activity: null, coins: {}, last: null, fail: 0, retryAt: 0, range: 'LIVE', seen: +localStorage.getItem('seen') || 0};
  const usd = (v, d = 2) => v == null ? '–' : (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  const pct = v => v == null ? '–' : (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const tm = s => s ? new Date(s).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'}) : '–';
  const short = s => s ? s.slice(0, 4) + '…' + s.slice(-3) : '';
  const fmtP = v => v == null ? '–' : v >= 1 ? '$' + v.toFixed(4) : '$' + v.toPrecision(4);
  const big = v => v == null ? 'n/a' : v >= 1e6 ? '$' + (v / 1e6).toFixed(2) + 'M' : v >= 1e3 ? '$' + (v / 1e3).toFixed(1) + 'K' : '$' + v.toFixed(0);

  // Two mirrors of the same data repo: GitHub Pages (main) and raw.githubusercontent (fallback when a
  // Pages deploy is stuck or queued; its CDN caches up to 300s). The newest state.json wins.
  const RAW = D ? 'https://raw.githubusercontent.com/William6500/grok-desk-data/main/d/' + D + '/' : null;
  async function get1(base, p) {
    const r = await fetch(base + p + '?t=' + Date.now(), {cache: 'no-store'});
    if (!r.ok) throw new Error(r.status);
    return r.json();
  }
  async function getSet(base) {
    const [st, ch, ac] = await Promise.all([get1(base, 'state.json'), get1(base, 'chart.json'), get1(base, 'activity.json')]);
    return {st, ch, ac, t: Date.parse(st.ts) || 0};
  }
  async function get(p) {
    if (!BASE) throw new Error('no link');
    try { return await get1(BASE, p); } catch (e) { return get1(RAW, p); }
  }
  // Offline ONLY on a real failure: every fetch failed for FAIL_N polls in a row (~45s),
  // or the newest data from both mirrors is older than DEAD_S (desk really stopped).
  // Normal latency measured end to end: 20-90s (60s push + 20s deploy), up to 11 min when a Pages deploy hangs.
  const FAIL_N = 3, DEAD_S = 600, MIRROR_S = 150;
  async function poll() {
    if (!BASE) { setErr(null); return; }              // no link: empty message only, never the red row
    let best = null;
    try { best = await getSet(BASE); } catch (_) {}
    if (!best || (Date.now() - best.t) / 1000 > MIRROR_S) {
      try { const r = await getSet(RAW); if (!best || r.t > best.t) best = r; } catch (_) {}
    }
    if (best) {
      if (!S.last || best.t >= Date.parse(S.last)) { S.state = best.st; S.chart = best.ch; S.activity = best.ac; S.last = best.st.ts; }
      S.fail = 0;
      const age = (Date.now() - Date.parse(S.last)) / 1000;
      if (age > DEAD_S) { S.retryAt = Date.now() + POLL * 1000; setErr(true); } else setErr(null);
    } else {
      S.fail++; S.retryAt = Date.now() + POLL * 1000;
      if (S.fail >= FAIL_N) setErr(true);
    }
    render(true);
    clearTimeout(S.pt); S.pt = setTimeout(poll, POLL * 1000);
  }
  let errTimer;
  function setErr(on) {
    const el = ERR; clearInterval(errTimer);
    if (!on) { el.hidden = true; return; }
    const upd = () => { const n = Math.max(0, Math.ceil((S.retryAt - Date.now()) / 1000));
      el.textContent = `Desk offline · retrying in ${n}s · last update ${S.last ? tm(S.last) : '–'}`; };
    upd(); el.hidden = false; errTimer = setInterval(upd, 1000);
  }
  // odometer: each changed digit rolls 600ms ease-out, 30ms stagger right to left
  function odo(el, text) {
    const prev = el.dataset.v || '';
    if (RM || !prev || prev.length !== text.length) { el.dataset.v = text; el.innerHTML = [...text].map(ch => /\d/.test(ch) ? `<span class="d"><span class="col" style="transform:translateY(-${ch}0%)">${'0123456789'.split('').map(x => `<span>${x}</span>`).join('')}</span></span>` : `<span>${esc(ch)}</span>`).join(''); return; }
    el.dataset.v = text;
    const cols = [...el.children]; const chars = [...text]; let k = 0;
    for (let i = chars.length - 1; i >= 0; i--) {
      const ch = chars[i], node = cols[i];
      if (/\d/.test(ch) && node && node.firstChild && node.firstChild.style) {
        if (prev[i] !== ch) { const col = node.firstChild; col.style.transitionDelay = (k++ * 30) + 'ms'; col.style.transform = `translateY(-${ch}0%)`; }
      } else if (node) node.textContent = ch;
    }
  }
  const skel = (h, mb = 12) => `<div class="skel" style="height:${h}px;margin-bottom:${mb}px"></div>`;
  const paperBadge = () => S.state && S.state.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : '';
  const searchIco = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
  const bellIco = '<svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>';

  function navbar() {
    const unread = S.state && S.state.unread > S.seen;
    S.navKey = String(!!unread) + !!S.showPnl;
    return `<div class="nav"><a class="avatar" href="#/account">W</a><button class="title" id="ttl" aria-label="Show PnL">Grok Bot ${S.showPnl ? '⌄' : '›'}</button>
      <button class="ib" id="sbtn" aria-label="Search">${searchIco}</button>
      <a class="ib" href="#/activity" id="bell" aria-label="Pushes">${bellIco}${unread ? '<i class="dot"></i>' : ''}</a></div>
      <input class="search" id="search" placeholder="Name, symbol or mint" hidden>`;
  }
  function header() {
    const box = document.getElementById('navbox');
    const key = String(!!(S.state && S.state.unread > S.seen)) + !!S.showPnl;
    if (box.firstChild && S.navKey === key) return;
    const q = $('#search'), keepQ = q && !q.hidden ? q.value : null;
    box.innerHTML = BASE ? navbar() : '<div class="nav"><div class="title">Grok Bot</div></div>';
    if (keepQ != null) { $('#search').hidden = false; $('#search').value = keepQ; }
    wireSearch();
    const t = $('#ttl'); if (t) t.onclick = () => { S.showPnl = !S.showPnl; if ((routeOf() || 'home').split('/')[0] !== 'home') location.hash = '#/home'; else render(false); };
  }
  // tap "Grok Bot" (top left): realized + unrealized PnL from state.pnl
  function pnlCard(st) {
    const p = st.pnl; if (!p) return '<div class="pnl"><div class="sub">PnL not published yet</div></div>';
    const c = v => v > 0 ? 'g' : v < 0 ? 'r' : '';
    const sg = v => (v > 0 ? '+' : '') + usd(v);
    return `<div class="pnl"><div class="l"><b>PnL</b>${p.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : '<span class="pill">LIVE</span>'}</div>
      <div class="l"><span class="sub">Total</span><b class="${c(p.total)}">${sg(p.total)}</b></div>
      <div class="l"><span class="sub">Realized · ${p.closed} closed</span><span class="${c(p.realized)}">${sg(p.realized)}</span></div>
      <div class="l"><span class="sub">Unrealized · ${p.open} open</span><span class="${c(p.unrealized)}">${sg(p.unrealized)}</span></div>
      ${p.realizedTonight != null ? `<div class="l"><span class="sub">Realized tonight · ${p.closedTonight} closed</span><span class="${c(p.realizedTonight)}">${sg(p.realizedTonight)}</span></div>` : ''}</div>`;
  }
  // ---------------- HOME
  function home(update) {
    const st = S.state, v = $('#view');
    if (!st) { v.innerHTML = skel(80) + skel(30) + skel(220) + skel(44) + `<div class="car">${'<div class="card skel"></div>'.repeat(2)}</div>` + skel(240); return; }
    if (!update || !$('#bal') || !!$('#pnl') !== !!S.showPnl) {
      v.innerHTML = (S.showPnl ? '<div id="pnl"></div>' : '') + `<div class="bal"><div class="big odo" id="bal"></div>${paperBadge()}</div>
        <div class="today"><span id="todayp"></span><span class="pill mult" id="mult"></span></div>
        <canvas id="line"></canvas>
        <div class="ranges">${['LIVE', '1H', '4H', '1D', '1W', 'ALL'].map(r => `<button data-r="${r}" class="${r === S.range ? 'on' : ''}">${r}</button>`).join('')}</div>
        <div class="sec"><h2 id="agh"></h2></div><div class="car" id="car"></div>
        <div class="sec"><h2>Activity</h2><a href="#/activity">See all</a></div><div class="list" id="act5"></div>`;
      v.querySelectorAll('.ranges button').forEach(b => b.onclick = () => { S.range = b.dataset.r; render(); });
    }
    if (S.showPnl) $('#pnl').innerHTML = pnlCard(st);
    odo($('#bal'), usd(st.balance));
    const tp = $('#todayp'); tp.textContent = pct(st.todayPct) + ' today'; tp.className = st.todayPct >= 0 ? 'g' : 'r';
    $('#mult').textContent = st.multiplier.toFixed(2) + '×';
    Charts.line($('#line'), {...((S.chart && S.chart.ranges[S.range]) || {points: []}), start: S.chart && S.chart.start});
    const running = Object.values(st.agents).filter(a => a.running).length;
    $('#agh').textContent = `Agents · ${running} running`;
    const car = $('#car'), sl = car.scrollLeft; car.innerHTML = agentCards(st); car.scrollLeft = sl;
    const ring = $('#ring'); if (ring) Charts.ring(ring, st.agents.analyst.score, st.agents.analyst.minScore);
    $('#act5').innerHTML = actRows((S.activity && S.activity.rows || []).slice(0, 5));
  }
  function cardShell(name, color, body) {
    return `<div class="card" style="border-radius:calc(42 * (100vw - 32px) / 504)"><h3><span style="color:${color}">●</span>${name}</h3>${body}</div>`;
  }
  function agentCards(st) {
    const a = st.agents;
    const sc = a.scanner, au = a.auditor, an = a.analyst, ex = a.executor, ri = a.risk;
    const feed = sc.feed.length ? `<ul class="feed">${sc.feed.map(f => `<li class="${f.verdict === 'kill' ? 'killed' : ''}"><a class="nm" href="${esc(f.coin_url)}">${esc(f.name)}</a><span class="${f.verdict === 'kill' ? 'r' : 'g'}">${f.verdict === 'kill' ? esc(f.reason) : '→ auditor'}</span></li>`).join('')}</ul>`
      : '<div class="empty">Listening for graduations</div>';
    const strips = `<div class="strips">${[0, 1, 2, 3, 4, 5, 6, 7].map(i => `<i class="${au.strips[i] === true ? 'ok' : au.strips[i] === false ? 'no' : ''}"></i>`).join('')}</div>`;
    const auLine = au.running ? 'taking apart...' : au.last ? (au.last.passed ? '8/8 → Executor' : esc(au.last.reason)) : 'No coin taken apart yet';
    const prog = ex.progress;
    const exBar = prog ? (prog.filled ? '<div class="bar"><i style="width:100%"></i></div><div class="g">✓ Filled</div>' : '<div class="bar"><i style="width:60%"></i></div><div class="sub">Executing... 60%</div>') : '<div class="sub" style="margin-top:12px">Waiting for a signal</div>';
    const le = ri.lastExit;
    return [
      cardShell('Scanner', sc.color, `<div class="n" style="color:${sc.color}">${sc.pools} pools</div>${feed}`),
      cardShell('Auditor', '#fff', `<div class="n">${au.takenApart} taken apart</div>${strips}<div>${auLine}</div><div class="sub" style="margin-top:auto">${au.rejected} rejected</div>`),
      cardShell('Analyst', an.color, `<div class="sub">Scoring${an.mode === 'rules' ? ' (rules)' : ''}</div><canvas class="ring" id="ring" style="height:120px;width:120px"></canvas><div class="sub" style="text-align:center">green from ${an.minScore}</div>`),
      cardShell('Executor', ex.color, `<div class="n" style="color:${ex.color}">${ex.trades} trades</div><div>${usd(ex.ticket)} · ${ex.stackPct}% of stack</div>${exBar}`),
      cardShell('Risk', ri.color, `<div class="n" style="color:${ri.color}">Guarding</div><div class="sub">${ri.open} open${le ? ' · ' + (le.reason === 'trail' ? 'Trailed out' : le.reason === 'stop' ? 'Stopped' : esc(le.reason)) + ' ' + esc(le.name) : ''}</div><div class="pills"><span class="pill pr mono">stop -${ri.stopPct}%</span><span class="pill pg mono">trail ${ri.trailPct}%</span></div>`)
    ].join('');
  }
  function actRows(rows) {
    if (!rows.length) return '<div class="empty">Nothing yet tonight</div>';
    return rows.map(r => {
      const href = r.kind === 'rejected' ? `#/auditor/${r.mint}` : `#/coin/${r.mint}`;
      const ic = {bought: ['#0a84ff', '↓'], sold: ['#00d35a', '↑'], stopped: ['#ff453a', '!'], rejected: ['rgba(235,235,245,0.3)', '×']}[r.kind] || ['#2c2c2e', '·'];
      const vc = r.kind === 'sold' ? 'g' : r.kind === 'stopped' ? 'r' : r.kind === 'rejected' ? 'ter' : '';
      return `<a class="row" href="${href}"><span class="ic" style="color:${ic[0]}">${ic[1]}</span><span class="mid"><div class="t1">${esc(r.title)}</div><div class="t2">${esc(r.subtitle)}</div></span><span class="v ${vc}">${esc(r.value)}</span></a>`;
    }).join('');
  }
  function wireSearch() {
    const b = $('#sbtn'), i = $('#search'); if (!b) return;
    b.onclick = () => { i.hidden = !i.hidden; if (!i.hidden) i.focus(); };
    i.onkeydown = e => { if (e.key !== 'Enter') return; const q = i.value.trim().toLowerCase(); if (!q) return;
      const all = [...(S.activity ? S.activity.rows : []), ...Object.values(S.state ? S.state.decisions : {}).flat()];
      const hit = all.find(r => r.mint && (r.mint.toLowerCase() === q || (r.name || '').toLowerCase() === q || (r.title || '').toLowerCase().includes(q)));
      location.hash = hit ? '#/coin/' + hit.mint : (q.length >= 32 ? '#/coin/' + i.value.trim() : location.hash); };
  }
  // ---------------- AGENTS TAB
  function agents() {
    const st = S.state, v = $('#view');
    if (!st) { v.innerHTML = '<h1>Agents</h1>' + skel(200).repeat(5); return; }
    const order = ['scanner', 'auditor', 'analyst', 'executor', 'risk'];
    v.innerHTML = '<h1>Agents</h1>' + order.map(k => {
      const a = st.agents[k], dec = st.decisions[k] || [];
      const locked = k === 'risk' && a.locked;
      return `<div class="acard"><div class="hd"><span class="sd ${a.running ? '' : 'off'}"></span><h3>${a.name}</h3><span class="sub">${a.today} today</span>
        <button class="sw ${a.paused ? '' : 'on'}" disabled aria-label="pause/resume" title="${locked ? 'locked while a position is open' : 'pause ' + k + ' via Telegram'}"></button></div>
        <div class="note">${a.paused ? 'paused' : 'running'}${locked ? ' · locked while a position is open' : ''} · pause/resume via Telegram</div>
        <div class="dec">${dec.length ? dec.map(d => `<div class="row"><span class="sub" style="width:44px">${tm(d.ts)}</span><span class="mid"><a href="${esc(d.coin_url)}" class="t1">${esc(d.name)}</a><div class="t2">${esc(d.reason || '')}</div></span><span class="v ${/kill|reject|stop/.test(d.verdict) ? 'r' : 'g'}">${esc(d.verdict)}</span></div>`).join('') : '<div class="empty">' + (k === 'scanner' ? 'Listening for graduations' : 'Nothing yet tonight') + '</div>'}</div></div>`;
    }).join('');
  }
  // ---------------- ACTIVITY
  function activity() {
    const v = $('#view');
    if (S.state) { S.seen = S.state.unread; localStorage.setItem('seen', S.seen); }
    if (!S.activity) { v.innerHTML = '<h1>Activity</h1>' + skel(60, 1).repeat(8); return; }
    v.innerHTML = '<h1>Activity</h1><div class="list">' + actRows(S.activity.rows) + '</div>';
  }
  // ---------------- AUDITOR SCREEN
  const beamDone = {};
  async function auditor(mint, update) {
    const v = $('#view');
    let c = S.coins[mint];
    if (!c || !update) { try { c = S.coins[mint] = await get('coin/' + mint + '.json'); } catch (e) { if (!c) { v.innerHTML = '<a class="back" href="#/activity">‹ Back</a><h1>Auditor</h1><div class="empty">No coin taken apart yet</div>'; return; } } }
    if (update && $('#discs')) return;
    const L = c.audit.layers, checked = L.filter(l => l.pass !== null);
    const rej = c.audit.rejectedReason;
    v.innerHTML = `<a class="back" href="#/activity">‹ Back</a><h1>${esc(c.name)}</h1>
      <div class="discs" id="discs">${L.map((l, i) => `<div class="disc" data-i="${i}" style="top:${i * 26}px"></div>`).join('')}<div class="beam" id="beam"></div></div>
      <div id="vrows">${L.map((l, i) => `<div class="vrow"><span class="ck" id="ck${i}"></span><span style="flex:1">${esc(l.name)}</span><span class="sub">${esc(l.pass === null ? 'not checked' : '')}</span><span id="vv${i}"></span></div>`).join('')}</div>
      <div style="margin-top:16px" id="verdict"></div>
      <div class="set"><div class="l"><span>Take apart before buying</span><button class="sw ${c.audit.enabled ? 'on' : ''}" disabled></button></div><div class="note">read-only in plan B · change it via Telegram</div></div>
      <a class="btn" href="${esc(c.coin_url)}">Open on FOMO</a>`;
    const discs = [...v.querySelectorAll('.disc')], beam = $('#beam');
    const finish = () => { $('#verdict').innerHTML = !checked.length ? '<div class="empty">No coin taken apart yet</div>' : rej
      ? `<div style="font-size:20px;font-weight:600" class="r">Rejected · ${esc(rej)}</div><div class="sub">Grok Bot won't buy ${esc(c.name)}</div>`
      : c.audit.passed ? `<div style="font-size:20px;font-weight:600" class="g">Cleared · 8/8 parts</div><div class="sub">Sent to Executor · ${usd(c.audit.sentUsd)}</div>` : ''; };
    const show = i => { const l = L[i]; discs[i].classList.add(l.pass ? 'ok' : 'no'); $('#ck' + i).innerHTML = l.pass ? '<span class="g">✓</span>' : '<span class="r">✕</span>'; $('#vv' + i).innerHTML = `<span class="${l.pass ? '' : 'r'}">${esc(l.value)}</span>`; };
    if (RM || beamDone[mint]) { checked.forEach((l, i) => show(i)); finish(); return; }
    beamDone[mint] = 1; beam.style.opacity = 1;
    for (let i = 0; i < checked.length; i++) {           // only layers the server sent
      beam.style.top = (i * 26 + 10) + 'px';
      await new Promise(r => setTimeout(r, 350)); await new Promise(r => setTimeout(r, 150)); show(i);
    }
    beam.style.opacity = 0; finish();
  }
  // ---------------- COIN SCREEN
  async function coin(mint, update) {
    const v = $('#view');
    if (!S.coins[mint]) v.innerHTML = '<a class="back" href="#/home">‹ Back</a>' + skel(60) + skel(80) + skel(240) + skel(120);
    let c;
    try { c = S.coins[mint] = await get('coin/' + mint + '.json'); } catch (e) { c = S.coins[mint]; if (!c) { v.innerHTML = '<a class="back" href="#/home">‹ Back</a><div class="empty">Not on the desk tonight</div>'; return; } }
    const p = c.position && c.position.open ? c.position : null;
    const since = p && c.price ? 100 * (c.price / p.entry - 1) : null;
    const age = c.ageH == null ? '' : ' · ' + (c.ageH >= 1 ? Math.round(c.ageH) + 'h' : Math.round(c.ageH * 60) + 'm') + ' old';
    const L = c.audit.layers.filter(l => l.pass !== null), ok = L.filter(l => l.pass).length;
    v.innerHTML = `<a class="back" href="#/home">‹ Back</a>
      <div style="display:flex;align-items:center;gap:8px"><h1 style="flex:1;margin:0">${esc(c.name)}</h1>${c.mode === 'PAPER' ? '<span class="pill paper">PAPER</span>' : ''}</div>
      <div class="sub" style="display:flex;gap:8px;align-items:center;margin:4px 0 10px">${esc(c.symbol || '')} · Solana${age} <a class="chip ${ok === 8 ? '' : 'bad'}" href="#/auditor/${c.mint}">🛡 ${ok}/8</a></div>
      <div class="big" style="font-size:66px">${fmtP(c.price)}</div>
      ${since != null ? `<div class="${since >= 0 ? 'g' : 'r'}" style="font-size:17px">${since >= 0 ? '▲' : '▼'} ${Math.abs(since).toFixed(2)}% since entry</div>` : ''}
      <canvas id="cnd" style="margin-top:12px"></canvas>
      <div class="stats"><div><span class="sub">Market cap</span><b>${big(c.stats.marketCap)}</b></div><div><span class="sub">Liquidity</span><b>${big(c.stats.liquidity)}</b></div>
        <div><span class="sub">24h volume</span><b>${big(c.stats.volume24h)}</b></div><div><span class="sub">Holders</span><b>${c.stats.holders == null ? 'n/a' : c.stats.holders}</b></div></div>
      ${p ? `<div class="acard"><div style="font-weight:600">Your position · ${usd(p.sizeUsd)} in · Executor</div>
        <div class="vrow"><span>Stop line</span><span class="r">${fmtP(p.stop)} · -${p.stopPct}%</span></div>
        <div class="vrow"><span>Trail line</span><span class="g">${p.trailLine ? fmtP(p.trailLine) : 'starts at +' + (S.state ? S.state.settings.risk.find(s => s.name === 'trail_start_pct').value : 20) + '%'}</span></div>
        <div class="vrow" style="border:0"><span>Time left to timeout</span><span>${Math.floor(p.timeLeftS / 3600)}h ${Math.floor(p.timeLeftS % 3600 / 60)}m</span></div></div>` : ''}
      <a class="btn" href="${esc(c.coin_url)}">${p ? 'Sell on FOMO' : 'Buy on FOMO'}</a>`;
    Charts.candles($('#cnd'), c.candles, p ? p.exitLine : null);
  }
  // ---------------- ACCOUNT TAB
  function account(section) {
    const st = S.state, v = $('#view');
    if (!st) { v.innerHTML = '<h1>Account</h1>' + skel(44) + skel(60, 1).repeat(4) + skel(300); return; }
    const a = st.account;
    v.innerHTML = `<h1>Account</h1>
      <div class="seg"><button class="${a.mode === 'PAPER' ? 'on' : ''}" disabled>PAPER</button><button class="${a.mode === 'LIVE' ? 'on' : ''}" disabled>LIVE</button></div>
      <div class="note">Read-only in plan B. Switch with "paper" or "live" (type LIVE to confirm) on Telegram.</div>
      <div class="list" id="acct" style="margin-top:12px">
        <div class="row"><span class="mid"><div class="t1">Stack</div><div class="t2">${a.mode === 'PAPER' ? 'PAPER balance' : 'LIVE stack · "stack N" on Telegram'}</div></span><span class="v">${usd(a.stack)}</span></div>
        <a class="row" href="${esc(a.profile_url)}"><span class="mid"><div class="t1">Your FOMO profile</div></span><span class="v sub">›</span></a>
        <a class="row" href="${esc(a.signup_url)}" id="invite"><span class="mid"><div class="t1">Invite a friend</div></span><span class="v sub">›</span></a>
        <div class="row"><span class="mid"><div class="t1">Telegram</div><div class="t2">${a.telegram.connected ? 'connected' : 'not connected'}</div></span><a class="v" style="color:var(--blue)" href="https://t.me/FomoCoolbot">Send test push</a></div>
      </div>
      <div class="note" id="copied" hidden>Link copied</div>`;
    $('#invite').onclick = async e => { e.preventDefault(); const url = a.signup_url;
      if (navigator.share) { try { await navigator.share({url}); } catch (_) {} } else { try { await navigator.clipboard.writeText(url); } catch (_) {} $('#copied').hidden = false; } };
      }
  // ---------------- ROUTER
  // error row sits right under the navbar (STEP 8); re-placed after every render
  const ERR = document.getElementById('err');
  function render(update) {
    const h = routeOf() || 'home', [r, arg] = h.split('/');
    document.querySelectorAll('.tabs a').forEach(a => a.classList.toggle('on', a.dataset.tab === (r === 'coin' || r === 'auditor' ? '' : r)));
    header();
    if (!BASE) { $('#view').innerHTML = '<h1>Grok Bot</h1><div class="empty">Open the desk link from Telegram once.</div>'; return; }
    if (r === 'agents') return update ? agents() : agents();
    if (r === 'activity') return activity();
    if (r === 'account') return update && $('#acct') ? null : account(arg);
    if (r === 'auditor') return auditor(arg, update);
    if (r === 'coin') return update ? coin(arg, true) : coin(arg);
    return home(update);
  }
  addEventListener('hashchange', () => { keepD(); $('#view').scrollTop = 0; render(false); });
  // pages are fixed: no pinch / double-tap zoom (iOS ignores user-scalable=no)
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(t => document.addEventListener(t, e => e.preventDefault(), {passive: false}));
  document.addEventListener('touchmove', e => { if (e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, {passive: false});
  let lastTouch = 0;
  document.addEventListener('touchend', e => { const n = Date.now(); if (n - lastTouch < 300 && !e.target.closest('a,button,input')) e.preventDefault(); lastTouch = n; }, {passive: false});
  // back to the app (home screen or Safari tab): refresh right away instead of waiting for the next poll
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { S.fail = 0; clearTimeout(S.pt); poll(); } });
  addEventListener('resize', () => render(false));
  render(false); poll();
})();
