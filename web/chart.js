// Hand-drawn <canvas> charts, devicePixelRatio aware. No libraries.
(function () {
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function setup(cv, h) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || cv.parentNode.clientWidth;
    cv.style.height = h + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, w, h];
  }
  const T = s => Date.parse(s);
  // Home LIVE line: green line, gradient fill, dashed start line, marks above the line that never overlap.
  function line(cv, data, opt) {
    opt = opt || {};
    const st = cv._st || (cv._st = {n: 0, t0: 0, alpha: 0});
    const pts = (data.points || []).map(p => [T(p[0]), p[1]]);
    const start = data.start;
    const grew = pts.length > st.n && st.n > 0; st.n = pts.length;
    const t0 = performance.now();
    function frame(now) {
      const k = RM || !grew ? 1 : Math.min(1, (now - t0) / 250);
      const ma = RM ? 1 : Math.min(1, (now - t0) / 200);
      draw(k, ma); if (k < 1 || ma < 1) requestAnimationFrame(frame);
    }
    function draw(k, ma) {
      const [c, w, h] = setup(cv, opt.h || 220);
      c.clearRect(0, 0, w, h);
      const top = 46, bot = h - 8;
      if (!pts.length) {
        c.setLineDash([4, 4]); c.strokeStyle = 'rgba(235,235,245,0.3)'; c.lineWidth = 1;
        c.beginPath(); c.moveTo(0, (top + bot) / 2); c.lineTo(w, (top + bot) / 2); c.stroke(); c.setLineDash([]);
        c.fillStyle = 'rgba(235,235,245,0.6)'; c.font = '15px -apple-system,system-ui'; c.textAlign = 'center';
        c.fillText('Waiting for the first trade', w / 2, (top + bot) / 2 - 12); return;
      }
      let vs = pts.map(p => p[1]); if (start != null) vs.push(start);
      let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
      const pad = (hi - lo) * .1; lo -= pad; hi += pad;
      const x0 = pts[0][0], x1 = Math.max(pts[pts.length - 1][0], x0 + 1);
      const X = t => (t - x0) / (x1 - x0) * w, Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
      let P = pts.map(p => [X(p[0]), Y(p[1])]);
      if (k < 1 && P.length > 1) { const a = P[P.length - 2], b = P[P.length - 1]; P[P.length - 1] = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
      if (start != null) { c.setLineDash([3, 4]); c.strokeStyle = 'rgba(235,235,245,0.3)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, Y(start)); c.lineTo(w, Y(start)); c.stroke(); c.setLineDash([]); }
      const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(0,211,90,0.28)'); g.addColorStop(1, 'rgba(0,211,90,0)');
      c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      c.lineTo(P[P.length - 1][0], bot); c.lineTo(P[0][0], bot); c.closePath(); c.fillStyle = g; c.fill();
      c.beginPath(); P.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
      c.strokeStyle = '#00d35a'; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
      // marks: later mark moves up a row when it would overlap
      c.font = '600 11px -apple-system,system-ui'; c.textAlign = 'left'; c.globalAlpha = ma;
      const rows = [];
      (data.marks || []).slice().sort((a, b) => T(a.ts) - T(b.ts)).forEach(m => {
        const t = T(m.ts); if (t < x0) return;
        let near = pts.reduce((a, p) => Math.abs(p[0] - t) < Math.abs(a[0] - t) ? p : a, pts[0]);
        const tw = c.measureText(m.text).width + 12, x = Math.min(Math.max(0, X(t) - tw / 2), w - tw);
        let row = 0; while ((rows[row] || []).some(r => x < r[1] + 4 && x + tw > r[0] - 4)) row++;
        (rows[row] = rows[row] || []).push([x, x + tw]);
        const y = Math.max(2, Y(near[1]) - 26 - row * 22);
        const col = m.kind === 'bought' ? '#0a84ff' : m.kind === 'sold' ? '#00d35a' : '#ff453a';
        c.fillStyle = col; rr(c, x, y, tw, 18, 9); c.fill();
        c.fillStyle = m.kind === 'sold' ? '#000' : '#fff'; c.fillText(m.text, x + 6, y + 13);
      });
      c.globalAlpha = 1;
    }
    requestAnimationFrame(frame);
  }
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  // Coin candles (1-min OHLC from db.prices) + volume bars + orange dashed exit line
  function candles(cv, cs, exitLine) {
    const [c, w, h] = setup(cv, 240); c.clearRect(0, 0, w, h);
    if (!cs || !cs.length) { c.fillStyle = 'rgba(235,235,245,0.6)'; c.font = '15px -apple-system,system-ui'; c.textAlign = 'center'; c.fillText('No candles yet', w / 2, h / 2); return; }
    const vh = 40, top = 8, bot = h - vh - 8;
    let lo = Math.min(...cs.map(k => k.l)), hi = Math.max(...cs.map(k => k.h));
    if (exitLine) { lo = Math.min(lo, exitLine); hi = Math.max(hi, exitLine); }
    if (hi - lo < hi * 1e-6) { hi *= 1.01; lo *= 0.99; }
    const Y = v => bot - (v - lo) / (hi - lo) * (bot - top), n = Math.max(cs.length, 30), bw = w / n;
    const vmax = Math.max(...cs.map(k => k.v), 1e-9);
    cs.forEach((k, i) => {
      const x = (n - cs.length + i) * bw, up = k.c >= k.o, col = up ? '#00d35a' : '#ff453a';
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1;
      c.beginPath(); c.moveTo(x + bw / 2, Y(k.h)); c.lineTo(x + bw / 2, Y(k.l)); c.stroke();
      c.fillRect(x + bw * .15, Math.min(Y(k.o), Y(k.c)), bw * .7, Math.max(1, Math.abs(Y(k.o) - Y(k.c))));
      c.globalAlpha = .45; const vhh = k.v / vmax * vh; c.fillRect(x + bw * .15, h - vhh, bw * .7, vhh); c.globalAlpha = 1;
    });
    if (exitLine) {
      c.setLineDash([5, 4]); c.strokeStyle = '#ff9f0a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, Y(exitLine)); c.lineTo(w, Y(exitLine)); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#ff9f0a'; c.font = '600 11px -apple-system,system-ui'; c.textAlign = 'left'; c.fillText('Risk trailing stop', 4, Y(exitLine) - 4);
    }
  }
  // Analyst score ring 0-100, green from min (70)
  function ring(cv, score, min) {
    const [c, w, h] = setup(cv, cv.clientHeight || 120); const r = Math.min(w, h) / 2 - 8, cx = w / 2, cy = h / 2;
    c.lineWidth = 10; c.lineCap = 'round'; c.strokeStyle = '#2c2c2e'; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
    if (score != null) { c.strokeStyle = score >= (min || 70) ? '#00d35a' : '#ffd60a'; c.beginPath(); c.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); c.stroke(); }
    c.fillStyle = '#fff'; c.font = '600 32px -apple-system,system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(score == null ? '–' : String(score), cx, cy);
  }
  window.Charts = {line, candles, ring};
})();
