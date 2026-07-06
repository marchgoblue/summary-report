/* ============================================================
   Tab 3 — Infectious Disease
   Temperature curve, WBC, lactate, CRP, procalcitonin,
   culture data, current & recent antibiotics.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U, ui = SR.ui;
  const PAGE = 'id';

  function render(container) {
    const win = SR.state.window();
    const data = SR.data;
    container.innerHTML = '';
    const sections = [];

    /* --- Sepsis snapshot --- */
    (function () {
      const s = ui.section({ id: 'sepsis', title: 'Infection Snapshot', color: '#7c3aed', page: PAGE, half: true });
      const temp = data.latest('temp'), wbc = data.latest('wbc'), lact = data.latest('lactate'),
        crp = data.latest('crp'), pct = data.latest('pct');
      const tempMax24 = U.inRange(data.series('temp'), data.now() - U.DAY, data.now())
        .reduce((m, p) => Math.max(m, p.v), 0);
      const tiles = U.h('div.tiles');
      tiles.append(
        ui.tile({ label: 'Temp (current)', value: temp ? U.round(temp.v, 1) : '—', unit: '°C', sub: 'Tmax 24h: ' + U.round(tempMax24, 1) + ' °C', tone: temp && temp.v >= 38.3 ? 'alert' : 'good', graphKey: 'temp' }),
        ui.tile({ label: 'WBC', value: wbc ? U.round(wbc.v, 1) : '—', unit: '×10³/µL', sub: wbc ? U.fmtAgo(wbc.t) + ' · peak 23.4' : '', tone: wbc && (wbc.v > 11 || wbc.v < 4) ? 'warn' : 'good', graphKey: 'wbc' }),
        ui.tile({ label: 'Lactate', value: lact ? U.round(lact.v, 1) : '—', unit: 'mmol/L', sub: 'peak 5.8 on admission — cleared', tone: lact && lact.v > 2 ? 'alert' : 'good', graphKey: 'lactate' }),
        ui.tile({ label: 'CRP', value: crp ? Math.round(crp.v) : '—', unit: 'mg/L', sub: 'peak ~250, downtrending', tone: crp && crp.v > 100 ? 'warn' : '', graphKey: 'crp' }),
        ui.tile({ label: 'Procalcitonin', value: pct ? U.round(pct.v, 2) : '—', unit: 'ng/mL', sub: 'peak 44 → now near-normal', tone: pct && pct.v > 2 ? 'warn' : 'good', graphKey: 'pct' })
      );
      s.body.appendChild(tiles);
      s.body.appendChild(U.h('div', { style: 'font-size:12px;color:var(--text-3)' },
        'Source: E. coli bacteremia from urinary source. Antibiotic day ' +
        Math.ceil((data.now() - SR.mock.T(1.5)) / U.DAY) +
        ' · ceftriaxone day ' + Math.ceil((data.now() - SR.mock.T(52)) / U.DAY) +
        ' of planned 14-day course from first negative blood culture.'));
      sections.push(Object.assign(s, { id: 'sepsis' }));
    })();

    /* --- Temperature curve + markers --- */
    (function () {
      const s = ui.section({ id: 'febrile', title: 'Fever Curve & Inflammatory Markers', color: '#e0705d', page: PAGE, half: true });
      s.body.appendChild(U.h('div', { style: 'font-size:12px;color:var(--text-3);margin:8px 0' },
        'Add Temperature + WBC + Procalcitonin to the trends graph — the multi-axis view overlays the fever curve directly on the marker trajectory.'));
      const rows = U.h('div.rows');
      ['temp', 'wbc', 'lactate', 'crp', 'pct'].forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);
      sections.push(Object.assign(s, { id: 'febrile' }));
    })();

    /* --- Antimicrobials --- */
    (function () {
      const s = ui.section({ id: 'abx', title: 'Antimicrobial Therapy', color: '#2563eb', page: PAGE });
      const T = SR.mock.T;
      s.body.appendChild(ui.gantt([
        { label: 'Vancomycin', sub: '1750 mg q12h — stopped (MRSA neg)', color: '#3f6fd1', spans: [{ start: T(2), end: T(50.1) }] },
        { label: 'Piperacillin-tazobactam', sub: '4.5 g q8h — narrowed', color: '#5d9fe0', spans: [{ start: T(1.5), end: T(49.5) }] },
        { label: 'Ceftriaxone', sub: '2 g q24h — ACTIVE', color: '#2563eb', spans: [{ start: T(52), end: null }] }
      ], win));
      const tbl = U.h('table.data');
      tbl.appendChild(U.h('tr', U.h('th', 'Agent'), U.h('th', 'Status'), U.h('th', 'Course'), U.h('th', 'Rationale')));
      [
        ['Ceftriaxone 2 g IV q24h', 'active', U.fmtDay(T(52)) + ' → planned 14 days', 'Definitive therapy — pan-susceptible E. coli (PCN allergy: hives; cephalosporin tolerated, monitored)'],
        ['Piperacillin-tazobactam 4.5 g IV q8h', 'stopped', U.fmtDay(T(1.5)) + ' → ' + U.fmtDay(T(49.5)), 'Empiric gram-negative coverage; narrowed after susceptibilities'],
        ['Vancomycin 1750 mg IV q12h', 'stopped', U.fmtDay(T(2)) + ' → ' + U.fmtDay(T(50)), 'Empiric MRSA coverage; stopped after negative MRSA PCR + cultures (last trough 14.2 µg/mL)']
      ].forEach(([a, st, c, r]) => tbl.appendChild(U.h('tr',
        U.h('td', { style: 'font-weight:600' }, a),
        U.h('td', U.h('span.pill.' + (st === 'active' ? 'ok' : 'neutral'), st.toUpperCase())),
        U.h('td', c),
        U.h('td', { style: 'color:var(--text-2)' }, r))));
      s.body.appendChild(tbl);
      const admins = data.medsInWindow(win, m => m.cls === 'Antibiotic').slice().reverse();
      s.body.appendChild(U.h('div', { style: 'margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Doses given in window'));
      if (!admins.length) s.body.appendChild(U.h('div', { style: 'color:var(--text-3);font-size:12.5px;padding:8px 0' }, 'None in the selected window — widen the time range.'));
      admins.forEach(m => s.body.appendChild(ui.medItem(m)));
      sections.push(Object.assign(s, { id: 'abx' }));
    })();

    /* --- Microbiology --- */
    (function () {
      const cx = data.cultures();
      const s = ui.section({ id: 'micro', title: 'Microbiology', color: '#a03fd1', count: cx.filter(c => c.positive).length + ' positive · ' + cx.length + ' total', page: PAGE });
      cx.slice().sort((a, b) => (b.positive - a.positive) || (b.collected - a.collected))
        .forEach(c => s.body.appendChild(ui.culture(c)));
      sections.push(Object.assign(s, { id: 'micro' }));
    })();

    /* --- Source control / infection risk factors --- */
    (function () {
      const s = ui.section({ id: 'source', title: 'Source Control & Device Risk', color: '#059669', page: PAGE });
      const devs = data.devices().filter(d => !d.removed);
      const tbl = U.h('table.data');
      tbl.appendChild(U.h('tr', U.h('th', 'Indwelling device'), U.h('th', 'Site'), U.h('th', 'Dwell time'), U.h('th', 'Infection risk note')));
      devs.forEach(d => {
        const dwellDays = ((data.now() - d.placed) / U.DAY);
        tbl.appendChild(U.h('tr',
          U.h('td', { style: 'font-weight:600' }, d.name),
          U.h('td', d.site),
          U.h('td.num', dwellDays.toFixed(1) + ' days'),
          U.h('td', d.name.includes('Central') ? U.h('span.pill.warn', 'CLABSI risk — review necessity daily')
            : d.name.includes('Foley') ? U.h('span.pill.warn', 'CAUTI risk — was the infection source; review necessity')
              : U.h('span.pill.neutral', 'routine care'))));
      });
      s.body.appendChild(tbl);
      s.body.appendChild(U.h('div', { style: 'font-size:12px;color:var(--text-2);margin-top:8px' },
        'Urinary source: Foley placed on admission for shock-state monitoring. Urine and blood grew the same E. coli. Repeat blood cultures (day 3) no growth ×4 days — adequate source control without intervention.'));
      sections.push(Object.assign(s, { id: 'source' }));
    })();

    ui.accordion(container, PAGE, sections);
  }

  SR.tabs = SR.tabs || {};
  SR.tabs.id = { label: 'Infectious Disease', render };
})(window.SR);
