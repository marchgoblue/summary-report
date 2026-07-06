/* ============================================================
   Graph tray — a shared, always-available charting panel.

   Any parameter anywhere in the app can be added with one click
   (the ⊕ graph buttons). Multiple series plot together; each
   distinct UNIT gets its own Y axis (alternating left/right) so
   different scales — e.g. MAP in mmHg, lactate in mmol/L,
   norepinephrine in mcg/kg/min — stay readable on one chart.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;

  const graph = {
    selected: [],            // ordered list of catalog keys
    chart: null,
    els: {}
  };

  /* Colors are assigned dynamically by selection order (not per-parameter)
     so simultaneously plotted series are always visually distinct. */
  const PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed',
    '#0891b2', '#db2777', '#65a30d', '#475569', '#b45309'];
  const seriesColor = idx => PALETTE[idx % PALETTE.length];

  graph.init = function (host) {
    graph.els.host = host;
    host.classList.add('graph-tray');
    host.innerHTML = '';
    const chips = U.h('div.graph-chips');
    const canvasWrap = U.h('div.graph-canvas-wrap');
    const canvas = document.createElement('canvas');
    canvasWrap.appendChild(canvas);
    const empty = U.h('div.graph-empty',
      U.h('div.graph-empty-icon', { html: icon() }),
      U.h('div', 'Click the graph button next to any vital, lab, drip or I&O value to plot it here.'),
      U.h('div.graph-empty-sub', 'Add several at once — each unit gets its own Y-axis.'));
    host.append(
      U.h('div.graph-head',
        U.h('div.graph-title', 'Trends'),
        chips,
        U.h('button.btn-ghost.graph-clear', { onclick: () => { graph.selected = []; graph.refresh(); } }, 'Clear all')),
      empty, canvasWrap);
    graph.els.chips = chips;
    graph.els.canvas = canvas;
    graph.els.canvasWrap = canvasWrap;
    graph.els.empty = empty;
    graph.refresh();
  };

  function icon() {
    return '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M6 15l4-6 4 3 5-8"/></svg>';
  }

  graph.has = key => graph.selected.includes(key);

  graph.toggle = function (key) {
    const i = graph.selected.indexOf(key);
    if (i >= 0) graph.selected.splice(i, 1);
    else graph.selected.push(key);
    graph.refresh();
    document.dispatchEvent(new CustomEvent('sr:graph-changed'));
    if (graph.selected.length && i < 0) {
      graph.els.host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  graph.refresh = function () {
    const cat = SR.data.catalog();
    const win = SR.state.window();
    const { chips, canvasWrap, empty, host } = graph.els;

    chips.innerHTML = '';
    graph.selected.forEach((key, idx) => {
      const c = cat[key];
      if (!c) return;
      chips.appendChild(U.h('span.chip', { style: '--chip:' + seriesColor(idx) },
        U.h('span.chip-dot'),
        c.label + (c.unit ? ' (' + c.unit + ')' : ''),
        U.h('button.chip-x', { onclick: () => graph.toggle(key), title: 'Remove' }, '×')));
    });

    const hasData = graph.selected.length > 0;
    empty.style.display = hasData ? 'none' : '';
    canvasWrap.style.display = hasData ? '' : 'none';
    host.querySelector('.graph-clear').style.display = hasData ? '' : 'none';

    if (!hasData) {
      if (graph.chart) { graph.chart.destroy(); graph.chart = null; }
      return;
    }

    /* Build datasets + one axis per unit */
    const datasets = [];
    const axes = {};
    let axisCount = 0;
    graph.selected.forEach((key, idx) => {
      const c = cat[key];
      const color = seriesColor(idx);
      const unitKey = 'y_' + (c.unit || 'unitless').replace(/[^a-z0-9]/gi, '');
      if (!axes[unitKey]) {
        axes[unitKey] = {
          type: 'linear',
          position: axisCount % 2 === 0 ? 'left' : 'right',
          grid: { drawOnChartArea: axisCount === 0, color: 'rgba(140,155,175,.14)' },
          title: { display: true, text: c.unit || '', color: color, font: { size: 11, weight: '600' } },
          ticks: { color: color, font: { size: 10 } },
          beginAtZero: !!c.agg || !!c.step
        };
        axisCount++;
      }
      const pts = SR.data.windowed(key, win).map(p => ({ x: p.t, y: U.round(p.v, c.dp != null ? c.dp : 1) }));
      const isBar = c.agg === 'sum';
      datasets.push({
        label: c.label,
        data: pts,
        yAxisID: unitKey,
        type: isBar ? 'bar' : 'line',
        borderColor: color,
        backgroundColor: isBar ? color + '88' : color + '22',
        pointRadius: pts.length > 90 ? 0 : 2.5,
        pointHoverRadius: 4,
        borderWidth: 2,
        tension: c.step ? 0 : 0.3,
        stepped: c.step ? 'before' : false,
        spanGaps: true,
        barThickness: 'flex',
        maxBarThickness: 14
      });
    });

    const scales = Object.assign({
      x: {
        type: 'linear',
        min: win.start,
        max: win.end,
        grid: { color: 'rgba(140,155,175,.10)' },
        ticks: {
          maxTicksLimit: 10,
          color: '#7d8aa0',
          font: { size: 10 },
          callback: v => (win.end - win.start) > 2 * U.DAY
            ? U.fmtDay(v) + ' ' + U.fmtTime(v)
            : U.fmtTime(v)
        }
      }
    }, axes);

    if (graph.chart) graph.chart.destroy();
    graph.chart = new Chart(graph.els.canvas, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'nearest', axis: 'x', intersect: false },
        plugins: {
          legend: { labels: { color: '#4a5568', usePointStyle: true, pointStyle: 'line', font: { size: 11 } } },
          tooltip: {
            callbacks: {
              title: items => items.length ? U.fmtDateTime(items[0].parsed.x) : ''
            }
          }
        },
        scales
      }
    });
  };

  /* A reusable "add to graph" button */
  graph.button = function (key) {
    const btn = U.h('button.graph-btn', {
      title: 'Plot on trends graph',
      onclick: e => { e.stopPropagation(); graph.toggle(key); },
      html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M3 3v18h18"/><path d="M6 15l4-6 4 3 5-8"/></svg>'
    });
    const sync = () => btn.classList.toggle('on', graph.has(key));
    sync();
    document.addEventListener('sr:graph-changed', sync);
    return btn;
  };

  SR.graph = graph;
})(window.SR);
