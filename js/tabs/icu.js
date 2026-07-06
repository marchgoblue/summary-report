/* ============================================================
   Tab 1 — ICU Accordion
   Drag-to-reorder sections, include/exclude sections and
   individual parameters (Customize layout), one-click graphing.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U, ui = SR.ui;
  const PAGE = 'icu';

  function rowsSection(opts, keys) {
    const s = ui.section(Object.assign({ page: PAGE }, opts));
    const rows = U.h('div.rows');
    keys.forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
    s.body.appendChild(rows);
    return s;
  }

  function render(container) {
    const win = SR.state.window();
    const data = SR.data;
    container.innerHTML = '';
    const sections = [];

    /* --- Vitals --- */
    sections.push(Object.assign(rowsSection(
      { id: 'vitals', title: 'Vitals', color: '#e05d5d', half: true },
      ['hr', 'map', 'sbp', 'dbp', 'temp', 'rr', 'spo2', 'cvp', 'weight']), { id: 'vitals' }));

    /* --- Drips / hemodynamic support --- */
    (function () {
      const s = ui.section({ id: 'drips', title: 'Drips & Hemodynamic Support', color: '#c74d6e', page: PAGE, half: true });
      const tiles = U.h('div.tiles');
      const dripKeys = ['norepi', 'vasopressin', 'insulinGtt', 'propofol', 'heparinGtt', 'lasixGtt'];
      dripKeys.forEach(k => {
        const cat = data.catalog()[k];
        const pts = data.series(k);
        const last = U.lastPoint(pts);
        const running = last && (data.now() - last.t) < 3 * U.HOUR && last.v > 0;
        tiles.appendChild(ui.tile({
          label: cat.label,
          value: running ? U.round(last.v, cat.dp) : 'OFF',
          unit: running ? cat.unit : '',
          sub: running ? 'running' : (last ? 'stopped ' + U.fmtAgo(last.t) : 'never started'),
          tone: running ? (k === 'norepi' || k === 'vasopressin' ? 'alert' : 'warn') : '',
          graphKey: k
        }));
      });
      s.body.appendChild(tiles);
      const rows = U.h('div.rows');
      dripKeys.forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);
      sections.push(Object.assign(s, { id: 'drips' }));
    })();

    /* --- Labs --- */
    (function () {
      const s = ui.section({ id: 'labs', title: 'Labs', color: '#5d9fe0', page: PAGE });
      const groups = [
        ['Hematology', ['wbc', 'hgb', 'hct', 'plt', 'inr', 'ptt']],
        ['Chemistry', ['na', 'k', 'cl', 'co2', 'bun', 'cr', 'gluc', 'mg', 'phos', 'ca']],
        ['Hepatic', ['alt', 'ast', 'tbili', 'alb']],
        ['Cardiac & Inflammatory', ['trop', 'bnp', 'lactate', 'crp', 'pct']],
        ['Arterial Blood Gas', ['ph', 'pco2', 'po2']]
      ];
      groups.forEach(([name, keys]) => {
        s.body.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:12px 0 2px' }, name));
        const rows = U.h('div.rows');
        keys.forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
        s.body.appendChild(rows);
      });
      sections.push(Object.assign(s, { id: 'labs' }));
    })();

    /* --- Intake & Output --- */
    (function () {
      const s = ui.section({ id: 'io', title: 'Intake & Output', color: '#d9c23e', page: PAGE, half: true });
      s.body.appendChild(ui.ioDays(5));
      const rows = U.h('div.rows');
      ['intake', 'urine', 'ngout', 'net'].forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);
      sections.push(Object.assign(s, { id: 'io' }));
    })();

    /* --- Cultures --- */
    (function () {
      const cx = data.cultures();
      const s = ui.section({ id: 'cultures', title: 'Culture Results', color: '#a03fd1', count: cx.filter(c => c.positive).length + ' positive · ' + cx.length + ' total', page: PAGE });
      cx.slice().sort((a, b) => (b.positive - a.positive) || (b.collected - a.collected))
        .forEach(c => s.body.appendChild(ui.culture(c)));
      sections.push(Object.assign(s, { id: 'cultures' }));
    })();

    /* --- Medication administrations (in window) --- */
    (function () {
      const all = data.medsInWindow(win);
      const s = ui.section({ id: 'meds', title: 'Medication Administrations', color: '#4d8bc7', count: all.length + ' in window', page: PAGE });

      /* course gantt for key infusions/abx over the window */
      const T = SR.mock.T;
      s.body.appendChild(ui.gantt([
        { label: 'Norepinephrine', sub: 'vasopressor', color: '#c74d6e', spans: [{ start: T(0.7), end: T(84) }] },
        { label: 'Vasopressin', sub: 'vasopressor', color: '#a05dbf', spans: [{ start: T(8), end: T(60) }] },
        { label: 'Vancomycin', sub: 'antibiotic', color: '#3f6fd1', spans: [{ start: T(2), end: T(50.1) }] },
        { label: 'Piperacillin-tazobactam', sub: 'antibiotic', color: '#5d9fe0', spans: [{ start: T(1.5), end: T(49.5) }] },
        { label: 'Ceftriaxone', sub: 'antibiotic — active', color: '#2563eb', spans: [{ start: T(52), end: null }] },
        { label: 'Heparin gtt', sub: 'NSTEMI', color: '#8d6fd1', spans: [{ start: T(47), end: T(63.5) }] },
        {
          label: 'Furosemide', sub: 'diuretic', color: '#3f9e7d',
          marks: data.meds().filter(m => m.name === 'Furosemide').map(m => ({
            t: m.t,
            info: `<b>${m.name} ${m.dose} ${m.unit} ${m.route}</b><br>${U.fmtDateTime(m.t)}`
          })),
          spans: [{ start: T(96), end: T(132), info: '<b>Furosemide infusion 10 → 5 mg/hr</b><br>' + U.fmtDateTime(T(96)) + ' → ' + U.fmtDateTime(T(132)) }]
        },
        {
          label: 'Blood products', sub: 'PRBC / PLT', color: '#c0392b',
          marks: data.transfusions().map(tx => ({
            t: tx.t,
            info: `<b>${tx.product}</b><br>${tx.volume} · ${U.fmtDateTime(tx.t)}<br>Indication: ${tx.indication}`
          }))
        }
      ], win));

      /* class filter + list */
      const classes = ['All', 'Antibiotic', 'Vasopressor', 'Diuretic', 'Insulin', 'Anticoagulant', 'Antiplatelet', 'Electrolyte', 'Sedation', 'Laxative'];
      let active = 'All';
      const list = U.h('div', { style: 'max-height:340px;overflow-y:auto;margin-top:10px' });
      const seg = U.h('div.seg', { style: 'flex-wrap:wrap;margin-top:12px' });
      function draw() {
        list.innerHTML = '';
        const items = all.filter(m => active === 'All' || m.cls === active).slice().reverse();
        if (!items.length) list.appendChild(U.h('div', { style: 'color:var(--text-3);padding:12px;font-size:12.5px' }, 'No administrations of this class in the selected window.'));
        items.forEach(m => list.appendChild(ui.medItem(m)));
      }
      classes.forEach(c => {
        const b = U.h('button', { onclick: () => { active = c; [...seg.children].forEach(x => x.classList.toggle('on', x.textContent === c)); draw(); } }, c);
        if (c === active) b.classList.add('on');
        seg.appendChild(b);
      });
      s.body.append(seg, list);
      draw();
      sections.push(Object.assign(s, { id: 'meds' }));
    })();

    /* --- Blood products --- */
    (function () {
      const tx = data.transfusions();
      const s = ui.section({ id: 'blood', title: 'Blood Component Administration', color: '#c0392b', count: tx.length + ' transfusions', page: PAGE, half: true });
      tx.forEach(t => s.body.appendChild(U.h('div.tx-item',
        U.h('span.tx-dot' + (t.abbrev === 'PLT' ? '.plt' : '')),
        U.h('span', { style: 'font-weight:700;font-size:13px' }, t.product),
        U.h('span', { style: 'color:var(--text-2);font-size:12.5px' }, t.volume),
        U.h('span.pill.neutral', t.indication),
        U.h('span', { style: 'margin-left:auto;font-size:11.5px;color:var(--text-3)' }, U.fmtDateTime(t.t) + ' · reaction: ' + t.reaction))));
      s.body.appendChild(U.h('div', { style: 'font-size:11.5px;color:var(--text-3);margin-top:8px' },
        'Tip: transfusion times also appear as red/gold marks on the medication course timeline above — add Hemoglobin or Platelets to the trends graph to correlate.'));
      sections.push(Object.assign(s, { id: 'blood' }));
    })();

    /* --- Respiratory / vent --- */
    (function () {
      const s = ui.section({ id: 'resp', title: 'Respiratory Support', color: '#5d8de0', page: PAGE, half: true });
      const ett = data.devices().find(d => d.name.includes('Endotracheal'));
      s.body.appendChild(U.h('div', { style: 'margin:10px 0 4px' },
        ett && ett.removed
          ? U.h('span.pill.ok', 'Extubated ' + U.fmtAgo(ett.removed) + ' — now on nasal cannula')
          : U.h('span.pill.danger', 'Intubated / mechanically ventilated')));
      const rows = U.h('div.rows');
      ['fio2', 'peep', 'spo2', 'rr'].forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);
      sections.push(Object.assign(s, { id: 'resp' }));
    })();

    ui.accordion(container, PAGE, sections);
  }

  SR.tabs = SR.tabs || {};
  SR.tabs.icu = { label: 'ICU', render };
})(window.SR);
