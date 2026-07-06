/* ============================================================
   Shared UI components: accordion sections (drag-to-reorder,
   include/exclude), parameter rows with sparklines + graph
   buttons, med items, gantt bars, tiles, culture & report cards.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;
  const ui = {};

  /* ---------- collapsible / customizable section card ---------- */
  ui.section = function (opts) {
    // opts: {id, title, color, count, page}
    const card = U.h('div.card', { dataset: { sec: opts.id } });
    const body = U.h('div.card-body');
    const collapsedSet = new Set(U.store.get(opts.page + '-collapsed', []));
    if (collapsedSet.has(opts.id)) card.classList.add('collapsed');
    const hiddenSecs = new Set(U.store.get(opts.page + '-hidden-secs', []));
    if (hiddenSecs.has(opts.id)) card.classList.add('hidden-sec');

    const head = U.h('div.card-head',
      U.h('span.drag-handle', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="5" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="5" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="16" cy="19" r="1.6"/></svg>' }),
      U.h('span.sec-dot', { style: 'background:' + (opts.color || 'var(--accent)') }),
      U.h('span.card-title', opts.title),
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
      U.h('span.r-name', cat.label, opts.sub ? U.h('span.r-sub', opts.sub) : null),
      valEl,
      U.h('span.r-time', last ? U.fmtAgo(last.t) : ''),
      U.h('span.r-spark', U.sparkline(
        sparkPts.length > 160 ? U.bucket(sparkPts, win.start, win.end, (win.end - win.start) / 160, cat.agg || 'mean') : sparkPts,
        { color: cat.color })),
      SR.graph.button(key)
    );
    return row;
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
    // rows: [{label, sub, color, spans:[{start,end}], marks:[t]}]
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
        track.appendChild(U.h('span.gantt-bar', {
          style: `left:${((a - win.start) / span * 100).toFixed(2)}%;width:${((b - a) / span * 100).toFixed(2)}%;background:${r.color}`,
          title: r.label + ': ' + U.fmtDateTime(a) + ' → ' + (s.end == null ? 'ongoing' : U.fmtDateTime(s.end))
        }));
      });
      (r.marks || []).forEach(t => {
        if (t < win.start || t > win.end) return;
        track.appendChild(U.h('span.gantt-bar', {
          style: `left:${((t - win.start) / span * 100).toFixed(2)}%;width:5px;background:${r.color};border-radius:99px`,
          title: r.label + ' — ' + U.fmtDateTime(t)
        }));
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
    // {label, value, unit, sub, tone, graphKey}
    const t = U.h('div.tile' + (opts.tone ? '.' + opts.tone : ''),
      U.h('div.t-label', opts.label),
      U.h('div.t-value', String(opts.value), opts.unit ? U.h('span.t-unit', ' ' + opts.unit) : null),
      opts.sub ? U.h('div.t-sub', opts.sub) : null);
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
