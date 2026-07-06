/* ============================================================
   Summary Report — shared utilities
   Namespace: window.SR
   ============================================================ */
window.SR = window.SR || {};

(function (SR) {
  'use strict';

  const U = {};

  /* ---------- Seeded PRNG (mulberry32) so demo data is deterministic ---------- */
  U.prng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /* Approximately normal noise in [-1, 1] */
  U.noise = function (rand) {
    return (rand() + rand() + rand()) / 1.5 - 1;
  };

  /* ---------- Time helpers ---------- */
  const HOUR = 3600 * 1000;
  const MIN = 60 * 1000;
  U.HOUR = HOUR;
  U.MIN = MIN;
  U.DAY = 24 * HOUR;

  U.fmtTime = function (t) {
    const d = new Date(t);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  U.fmtDay = function (t) {
    const d = new Date(t);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  U.fmtDateTime = function (t) {
    const d = new Date(t);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  U.fmtAgo = function (t) {
    const ms = Date.now() - t;
    if (ms < MIN) return 'just now';
    if (ms < HOUR) return Math.round(ms / MIN) + 'm ago';
    if (ms < U.DAY) return Math.round(ms / HOUR) + 'h ago';
    return (ms / U.DAY).toFixed(1).replace(/\.0$/, '') + 'd ago';
  };

  /* Piecewise-linear interpolation over [hourOffset, value] keyframes */
  U.interp = function (keyframes, h) {
    if (h <= keyframes[0][0]) return keyframes[0][1];
    for (let i = 1; i < keyframes.length; i++) {
      if (h <= keyframes[i][0]) {
        const [h0, v0] = keyframes[i - 1];
        const [h1, v1] = keyframes[i];
        return v0 + ((h - h0) / (h1 - h0)) * (v1 - v0);
      }
    }
    return keyframes[keyframes.length - 1][1];
  };

  /* ---------- Series aggregation (bucketing) ----------
     points: [{t, v}] sorted ascending.
     agg: 'mean' | 'sum' | 'last' | 'max' | 'min'                       */
  U.bucket = function (points, startMs, endMs, intervalMs, agg) {
    agg = agg || 'mean';
    const out = [];
    if (!points || !points.length) return out;
    for (let b = startMs; b < endMs; b += intervalMs) {
      const bEnd = b + intervalMs;
      let sum = 0, n = 0, mx = -Infinity, mn = Infinity, last = null;
      for (const p of points) {
        if (p.t >= b && p.t < bEnd) {
          sum += p.v; n++;
          if (p.v > mx) mx = p.v;
          if (p.v < mn) mn = p.v;
          last = p.v;
        }
        if (p.t >= bEnd) break;
      }
      if (n > 0) {
        let v;
        if (agg === 'sum') v = sum;
        else if (agg === 'max') v = mx;
        else if (agg === 'min') v = mn;
        else if (agg === 'last') v = last;
        else v = sum / n;
        out.push({ t: b + intervalMs / 2, v: v });
      }
    }
    return out;
  };

  U.inRange = function (points, startMs, endMs) {
    return (points || []).filter(p => p.t >= startMs && p.t <= endMs);
  };

  U.lastPoint = function (points) {
    return points && points.length ? points[points.length - 1] : null;
  };

  U.lastBefore = function (points, t) {
    let best = null;
    for (const p of points) { if (p.t <= t) best = p; else break; }
    return best;
  };

  U.round = function (v, dp) {
    const f = Math.pow(10, dp == null ? 1 : dp);
    return Math.round(v * f) / f;
  };

  /* ---------- Tiny DOM builder ----------
     U.h('div.card', {onclick: fn, title: 'x'}, child1, child2 ...)     */
  U.h = function (spec) {
    const parts = spec.split('.');
    const el = document.createElement(parts[0] || 'div');
    if (parts.length > 1) el.className = parts.slice(1).join(' ');
    for (let i = 1; i < arguments.length; i++) {
      const a = arguments[i];
      if (a == null) continue;
      if (typeof a === 'string' || typeof a === 'number') {
        el.appendChild(document.createTextNode(a));
      } else if (a instanceof Node) {
        el.appendChild(a);
      } else if (Array.isArray(a)) {
        a.forEach(c => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
      } else if (typeof a === 'object') {
        for (const k in a) {
          if (k.startsWith('on')) el.addEventListener(k.slice(2), a[k]);
          else if (k === 'html') el.innerHTML = a[k];
          else if (k === 'dataset') Object.assign(el.dataset, a[k]);
          else el.setAttribute(k, a[k]);
        }
      }
    }
    return el;
  };

  /* ---------- Sparkline ---------- */
  U.sparkline = function (points, opts) {
    opts = opts || {};
    const w = opts.width || 120, hgt = opts.height || 30;
    const cv = document.createElement('canvas');
    cv.width = w * 2; cv.height = hgt * 2;      // retina
    cv.style.width = w + 'px'; cv.style.height = hgt + 'px';
    cv.className = 'sparkline';
    const ctx = cv.getContext('2d');
    ctx.scale(2, 2);
    if (!points || points.length < 2) {
      ctx.fillStyle = 'rgba(120,130,150,.4)';
      ctx.font = '9px sans-serif';
      ctx.fillText('—', w / 2 - 3, hgt / 2 + 3);
      return cv;
    }
    let mn = Infinity, mx = -Infinity;
    points.forEach(p => { if (p.v < mn) mn = p.v; if (p.v > mx) mx = p.v; });
    if (mx === mn) { mx += 1; mn -= 1; }
    const pad = (mx - mn) * 0.12;
    mn -= pad; mx += pad;
    const t0 = points[0].t, t1 = points[points.length - 1].t || t0 + 1;
    const X = t => 2 + ((t - t0) / (t1 - t0 || 1)) * (w - 4);
    const Y = v => hgt - 3 - ((v - mn) / (mx - mn)) * (hgt - 6);
    ctx.beginPath();
    points.forEach((p, i) => i ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v)));
    ctx.strokeStyle = opts.color || '#5b8def';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // last point dot
    const lp = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(X(lp.t), Y(lp.v), 2.2, 0, Math.PI * 2);
    ctx.fillStyle = opts.color || '#5b8def';
    ctx.fill();
    return cv;
  };

  /* ---------- localStorage helpers ---------- */
  U.store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('sr:' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem('sr:' + key, JSON.stringify(val)); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- Reference-range flagging ---------- */
  U.flag = function (v, lo, hi, critLo, critHi) {
    if (critLo != null && v <= critLo) return 'crit';
    if (critHi != null && v >= critHi) return 'crit';
    if (lo != null && v < lo) return 'low';
    if (hi != null && v > hi) return 'high';
    return '';
  };

  SR.U = U;
})(window.SR);
