/* ============================================================
   Shared UI components: accordion sections (drag-to-reorder,
   include/exclude), parameter rows with sparklines + graph
   buttons, med items, gantt bars, tiles, culture & report cards.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;
  const ui = {};

  /* All in-card sparklines share one color; distinct colors are reserved
     for the Trends graph, where they're assigned by selection order. */
  const SPARK_COLOR = '#5b8def';

  /* ---------- shared hover tooltip (gantt bars/marks) ---------- */
  let tipEl = null;
  function moveTip(e) {
    if (!tipEl) return;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + tipEl.offsetWidth > window.innerWidth - 8) x = e.clientX - tipEl.offsetWidth - 10;
    if (y + tipEl.offsetHeight > window.innerHeight - 8) y = e.clientY - tipEl.offsetHeight - 10;
    tipEl.style.left = x + 'px';
    tipEl.style.top = y + 'px';
  }
  ui.attachTip = function (el, html) {
    el.addEventListener('mouseenter', e => {
      if (!tipEl) { tipEl = U.h('div.sr-tooltip'); document.body.appendChild(tipEl); }
      tipEl.innerHTML = html;
      tipEl.style.display = 'block';
      moveTip(e);
    });
    el.addEventListener('mousemove', moveTip);
    el.addEventListener('mouseleave', () => { if (tipEl) tipEl.style.display = 'none'; });
  };

  /* ---------- provenance / honesty helpers ---------- */
  const SITE_TIP = 'Available from Epic via flowsheet-mapped Observations or an Epic-specific interface. Requires per-site configuration — not vanilla FHIR R4.';

  ui.siteBadge = function () {
    const b = U.h('span.pill.site', 'site-configured');
    ui.attachTip(b, SITE_TIP);
    return b;
  };

  ui.derived = function (tip) {
    const b = U.h('span.pill.derived', 'ƒ derived');
    ui.attachTip(b, tip || 'Computed in the app from FHIR data — deterministic rules, nothing leaves the browser.');
    return b;
  };

  /* Provenance line for a catalog entry */
  ui.provOf = function (cat) {
    return cat.src || (cat.loinc ? 'Source: FHIR Observation · LOINC ' + cat.loinc : 'Derived in app from FHIR data');
  };

  /* ---------- collapsible / customizable section card ---------- */
  ui.section = function (opts) {
    // opts: {id, title, color, count, page, half}
    const card = U.h('div.card', { dataset: { sec: opts.id } });
    if (opts.half) card.classList.add('half');
    const body = U.h('div.card-body');
    const collapsedSet = new Set(U.store.get(opts.page + '-collapsed', []));
    if (collapsedSet.has(opts.id)) card.classList.add('collapsed');
    const hiddenSecs = new Set(U.store.get(opts.page + '-hidden-secs', []));
    if (hiddenSecs.has(opts.id)) card.classList.add('hidden-sec');

    const head = U.h('div.card-head',
      U.h('span.drag-handle', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>' }),
      U.h('span.sec-dot', { style: 'background:' + (opts.color || 'var(--accent)') }),
      U.h('span.card-title', opts.title),
      opts.site ? ui.siteBadge() : null,
      opts.count != null ? U.h('span.card-count', String(opts.count)) : null,
      U.h('span.head-right',
        U.h('button.eye-btn', {
          title: 'Include / exclude this section',
          onclick: e => {
            e.stopPropagation();
            card.classList.toggle('hidden-sec');
            const set = new Set(U.store.get(opts.page + '-hidden-secs', []));
            card.classList.contains('hidden-sec') ? set.add(opts.id) : set.delete(opts.id);
            U.store.set(opts.page + '-hidden-secs', [...set]);
          },
          html: eyeSvg()
        }),
        U.h('span.caret', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg>' }))
    );
    head.addEventListener('click', e => {
      if (document.body.classList.contains('customize-on')) return;
      card.classList.toggle('collapsed');
      const set = new Set(U.store.get(opts.page + '-collapsed', []));
      card.classList.contains('collapsed') ? set.add(opts.id) : set.delete(opts.id);
      U.store.set(opts.page + '-collapsed', [...set]);
    });
    card.append(head, body);
    return { card, body };
  };

  function eyeSvg() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  /* Mount sections into a container with saved ordering + drag support */
  ui.accordion = function (container, page, sections) {
    const order = U.store.get(page + '-order', null);
    let list = sections;
    if (order) {
      list = [...sections].sort((a, b) => {
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });
    }
    list.forEach(s => container.appendChild(s.card));
    if (typeof Sortable !== 'undefined') {
      new Sortable(container, {
        handle: '.drag-handle',
        animation: 180,
        onEnd: () => {
          const ids = [...container.querySelectorAll('[data-sec]')].map(el => el.dataset.sec);
          U.store.set(page + '-order', ids);
        }
      });
    }
  };

  /* ---------- parameter row: name | latest | when | sparkline | graph ---------- */
  ui.paramRow = function (key, page, opts) {
    opts = opts || {};
    const cat = SR.data.catalog()[key];
    if (!cat) return null;
    const win = SR.state.window();
    const last = SR.data.latest(key);
    const sparkPts = U.inRange(SR.data.series(key), win.start, win.end);

    const row = U.h('div.row', { dataset: { rowid: key } });
    const hiddenRows = new Set(U.store.get(page + '-hidden-rows', []));
    if (hiddenRows.has(key)) row.classList.add('hidden-row');

    let valEl;
    if (last) {
      const flagCls = U.flag(last.v, cat.lo, cat.hi, cat.critLo, cat.critHi);
      valEl = U.h('span.r-value' + (flagCls ? '.' + flagCls : ''),
        String(U.round(last.v, cat.dp)),
        U.h('span.r-unit', cat.unit || ''));
    } else {
      valEl = U.h('span.r-value', { style: 'color:var(--text-3);font-weight:500' }, '—');
    }

    const nameEl = U.h('span.r-name', cat.label, opts.sub ? U.h('span.r-sub', opts.sub) : null);
    ui.attachTip(nameEl, ui.provOf(cat));
    row.append(
      U.h('button.eye-btn', {
        title: 'Include / exclude',
        onclick: () => {
          row.classList.toggle('hidden-row');
          const set = new Set(U.store.get(page + '-hidden-rows', []));
          row.classList.contains('hidden-row') ? set.add(key) : set.delete(key);
          U.store.set(page + '-hidden-rows', [...set]);
        },
        html: eyeSvg()
      }),
      nameEl,
      valEl,
      U.h('span.r-time', last ? U.fmtAgo(last.t) : ''),
      U.h('span.r-spark', U.sparkline(
        sparkPts.length > 160 ? U.bucket(sparkPts, win.start, win.end, (win.end - win.start) / 160, cat.agg || 'mean') : sparkPts,
        { color: SPARK_COLOR, width: opts.sparkWidth || 120 })),
      SR.graph.button(key)
    );
    return row;
  };

  /* ---------- parameter rows flowing into two columns ----------
     Fills full-width cards: reads top-to-bottom in the left column,
     then the right. Sparklines get more room than single-column. */
  ui.rowsGrid = function (keys, page, opts) {
    const wrap = U.h('div.rows.cols-2');
    const rows = keys.map(k => ui.paramRow(k, page, Object.assign({ sparkWidth: 170 }, opts))).filter(Boolean);
    wrap.style.setProperty('--nrows', Math.ceil(rows.length / 2));
    rows.forEach(r => wrap.appendChild(r));
    return wrap;
  };

  /* ---------- labs: results-over-time table ----------
     Epic-results-review style: the time window is split into
     columns, each cell holds the last value in that bucket;
     Latest is emphasized. Graph button + include/exclude kept
     per analyte. */
  ui.labTable = function (keys, page) {
    const win = SR.state.window();
    const range = win.end - win.start;
    const nCols = range > 3 * U.DAY ? Math.round(range / U.DAY) : 6;
    const colMs = range / nCols;
    const colLabel = t =>
      colMs >= 20 * U.HOUR ? U.fmtDay(t) :
        range > 2 * U.DAY ? U.fmtDay(t) + ' ' + U.fmtTime(t) : U.fmtTime(t);

    const tbl = U.h('table.data.labtbl');
    const head = U.h('tr', U.h('th.lab-name', ''));
    for (let i = 0; i < nCols; i++) head.appendChild(U.h('th', colLabel(win.start + i * colMs)));
    head.append(U.h('th', 'Latest'), U.h('th', ''));
    tbl.appendChild(head);

    const hiddenRows = new Set(U.store.get(page + '-hidden-rows', []));
    keys.forEach(key => {
      const cat = SR.data.catalog()[key];
      if (!cat) return;
      const series = SR.data.series(key);
      const flagCls = v => {
        const f = U.flag(v, cat.lo, cat.hi, cat.critLo, cat.critHi);
        return f ? '.val-' + f : '';
      };
      const tr = U.h('tr', { dataset: { rowid: key } });
      if (hiddenRows.has(key)) tr.classList.add('hidden-row');
      const nameTd = U.h('td.lab-name',
        U.h('button.eye-btn', {
          title: 'Include / exclude',
          onclick: () => {
            tr.classList.toggle('hidden-row');
            const set = new Set(U.store.get(page + '-hidden-rows', []));
            tr.classList.contains('hidden-row') ? set.add(key) : set.delete(key);
            U.store.set(page + '-hidden-rows', [...set]);
          },
          html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>'
        }),
        cat.label, U.h('span.lab-unit', cat.unit || ''));
      ui.attachTip(nameTd, ui.provOf(cat));
      tr.appendChild(nameTd);
      for (let i = 0; i < nCols; i++) {
        const a = win.start + i * colMs, b = a + colMs;
        let v = null;
        for (const p of series) { if (p.t >= a && p.t < b) v = p.v; if (p.t >= b) break; }
        tr.appendChild(v == null
          ? U.h('td.muted', '–')
          : U.h('td' + flagCls(v), String(U.round(v, cat.dp))));
      }
      const last = U.lastPoint(series);
      tr.appendChild(last
        ? U.h('td.latest' + flagCls(last.v), { title: U.fmtDateTime(last.t) + ' (' + U.fmtAgo(last.t) + ')' }, String(U.round(last.v, cat.dp)))
        : U.h('td.muted.latest', '–'));
      tr.appendChild(U.h('td', { style: 'text-align:right' }, SR.graph.button(key)));
      tbl.appendChild(tr);
    });
    return tbl;
  };

  /* ---------- med administration line ---------- */
  ui.medItem = function (m) {
    const clsColor = {
      Antibiotic: 'info', Vasopressor: 'danger', Diuretic: 'ok',
      'Blood Product': 'danger', Insulin: 'warn', Anticoagulant: 'warn',
      Antiplatelet: 'warn', Laxative: 'neutral', Sedation: 'neutral'
    }[m.cls] || 'neutral';
    return U.h('div.med-item',
      U.h('span.med-time', U.fmtDateTime(m.t)),
      U.h('span.med-name', m.name),
      U.h('span.med-dose', (m.dose !== '' && m.dose != null ? m.dose + ' ' + (m.unit || '') : '') + (m.route ? ' · ' + m.route : '')),
      U.h('span.med-class', U.h('span.pill.' + clsColor, m.cls)));
  };

  /* ---------- gantt (med courses over the window) ---------- */
  ui.gantt = function (rows, win) {
    // rows: [{label, sub, color, spans:[{start, end, info?}], marks:[t | {t, info}]}]
    // info = HTML shown in the hover tooltip (dose, response data, etc.)
    const wrap = U.h('div.gantt');
    const span = win.end - win.start;
    rows.forEach(r => {
      const track = U.h('div.gantt-track');
      for (let f = 0.25; f < 1; f += 0.25) {
        track.appendChild(U.h('span.gantt-tick', { style: 'left:' + (f * 100) + '%' }));
      }
      (r.spans || []).forEach(s => {
        const a = Math.max(s.start, win.start), b = Math.min(s.end == null ? win.end : s.end, win.end);
        if (b <= win.start || a >= win.end) return;
        const bar = U.h('span.gantt-bar', {
          style: `left:${((a - win.start) / span * 100).toFixed(2)}%;width:${((b - a) / span * 100).toFixed(2)}%;background:${r.color}`
        });
        ui.attachTip(bar, s.info ||
          ('<b>' + r.label + '</b><br>' + U.fmtDateTime(s.start) + ' → ' + (s.end == null ? 'ongoing' : U.fmtDateTime(s.end))));
        track.appendChild(bar);
      });
      (r.marks || []).forEach(mk => {
        const t = typeof mk === 'number' ? mk : mk.t;
        if (t < win.start || t > win.end) return;
        const bar = U.h('span.gantt-bar.gantt-mark', {
          style: `left:${((t - win.start) / span * 100).toFixed(2)}%;width:6px;background:${r.color};border-radius:99px`
        });
        ui.attachTip(bar, (mk && mk.info) || ('<b>' + r.label + '</b><br>' + U.fmtDateTime(t)));
        track.appendChild(bar);
      });
      wrap.appendChild(U.h('div.gantt-row',
        U.h('span.gantt-label', r.label, r.sub ? U.h('span.g-sub', r.sub) : null),
        track));
    });
    wrap.appendChild(U.h('div.gantt-axis',
      U.h('span', U.fmtDateTime(win.start)),
      U.h('span', U.fmtDateTime(win.start + span / 2)),
      U.h('span', U.fmtDateTime(win.end))));
    return wrap;
  };

  /* ---------- stat tile ---------- */
  ui.tile = function (opts) {
    // {label, value, unit, sub, tone, graphKey, source, site}
    const t = U.h('div.tile' + (opts.tone ? '.' + opts.tone : ''),
      U.h('div.t-label', opts.label, opts.site ? ui.siteBadge() : null),
      U.h('div.t-value', String(opts.value), opts.unit ? U.h('span.t-unit', ' ' + opts.unit) : null),
      opts.sub ? U.h('div.t-sub', opts.sub) : null);
    if (opts.source) ui.attachTip(t, opts.source);
    if (opts.graphKey) t.appendChild(SR.graph.button(opts.graphKey));
    return t;
  };

  /* ---------- culture card ---------- */
  ui.culture = function (cx) {
    const el = U.h('div.cx-item' + (cx.positive ? '.positive' : ''),
      U.h('div.cx-head',
        U.h('span.cx-type', cx.type),
        U.h('span.pill.' + (cx.positive ? 'danger' : 'ok'), cx.positive ? 'POSITIVE' : 'Negative'),
        U.h('span.pill.neutral', cx.status),
        U.h('span.cx-meta', 'Collected ' + U.fmtDateTime(cx.collected) + ' · ' + cx.source),
        U.h('span.cx-meta', 'Resulted ' + U.fmtDateTime(cx.resulted))),
      U.h('div.cx-org' + (cx.positive ? '' : '.neg'), cx.organism));
    if (cx.gram) el.appendChild(U.h('div.cx-meta', { style: 'margin-top:3px' }, 'Gram stain / prelim: ' + cx.gram));
    if (cx.susceptibilities) {
      const grid = U.h('div.sens-grid');
      cx.susceptibilities.forEach(([drug, s]) => {
        grid.appendChild(U.h('div.sens-item', U.h('span', drug), U.h('span.sens-' + s, s)));
      });
      el.appendChild(grid);
    }
    return el;
  };

  /* ---------- diagnostic report card ---------- */
  ui.report = function (r, accent) {
    return U.h('div.rep-item' + (accent ? '.accent' : ''),
      U.h('div.rep-head',
        U.h('span.rep-title', r.title),
        U.h('span.rep-time', U.fmtDateTime(r.t)),
        r.link ? U.h('a', { href: r.link, onclick: e => e.preventDefault() }, 'Open ↗') : null),
      U.h('div.rep-text', r.impression),
      r.detail ? U.h('div.rep-detail', r.detail) : null);
  };

  /* ---------- daily I/O summary strip ---------- */
  ui.ioDays = function (nDays) {
    const wrap = U.h('div.io-days');
    const now = SR.data.now();
    for (let d = nDays - 1; d >= 0; d--) {
      const dayStart = now - (d + 1) * U.DAY, dayEnd = now - d * U.DAY;
      const inn = U.inRange(SR.data.series('intake'), dayStart, dayEnd).reduce((s, p) => s + p.v, 0);
      const out = U.inRange(SR.data.series('urine'), dayStart, dayEnd).reduce((s, p) => s + p.v, 0) +
        U.inRange(SR.data.series('ngout'), dayStart, dayEnd).reduce((s, p) => s + p.v, 0);
      const net = inn - out;
      wrap.appendChild(U.h('div.io-day',
        U.h('div.d-label', d === 0 ? 'Last 24h' : U.fmtDay(dayStart)),
        U.h('div.d-in', 'In ' + Math.round(inn).toLocaleString()),
        U.h('div.d-out', 'Out ' + Math.round(out).toLocaleString()),
        U.h('div.d-net' + (net > 0 ? '.pos' : '.neg'), (net > 0 ? '+' : '') + Math.round(net).toLocaleString() + ' mL')));
    }
    return wrap;
  };

  SR.ui = ui;
})(window.SR);
