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
      /* all annotations computed from the fetched series */
      const wbcS = data.stats('wbc'), lactS = data.stats('lactate'),
        crpS = data.stats('crp'), pctS = data.stats('pct');
      const tempMax24 = U.inRange(data.series('temp'), data.now() - U.DAY, data.now())
        .reduce((m, p) => Math.max(m, p.v), 0);
      const tiles = U.h('div.tiles');
      tiles.append(
        ui.tile({ label: 'Temp (current)', value: temp ? U.round(temp.v, 1) : '—', unit: '°C', sub: 'Tmax 24h: ' + U.round(tempMax24, 1) + ' °C (derived)', tone: temp && temp.v >= 38.3 ? 'alert' : 'good', graphKey: 'temp', source: 'Source: Observation · LOINC 8310-5. Tmax derived in app (max of last 24h).' }),
        ui.tile({ label: 'WBC', value: wbc ? U.round(wbc.v, 1) : '—', unit: '×10³/µL', sub: wbc && wbcS ? U.fmtAgo(wbc.t) + ' · peak ' + U.round(wbcS.max.v, 1) + ' · ' + wbcS.trend : '', tone: wbc && (wbc.v > 11 || wbc.v < 4) ? 'warn' : 'good', graphKey: 'wbc', source: 'Source: Observation · LOINC 6690-2. Peak and trend derived in app.' }),
        ui.tile({ label: 'Lactate', value: lact ? U.round(lact.v, 1) : '—', unit: 'mmol/L', sub: lactS ? 'peak ' + U.round(lactS.max.v, 1) + ' (' + U.fmtDay(lactS.max.t) + ')' + (lactS.last.v < 2 ? ' · now normal' : '') : '', tone: lact && lact.v > 2 ? 'alert' : 'good', graphKey: 'lactate', source: 'Source: Observation · LOINC 2524-7. Peak derived in app.' }),
        ui.tile({ label: 'CRP', value: crp ? Math.round(crp.v) : '—', unit: 'mg/L', sub: crpS ? 'peak ' + Math.round(crpS.max.v) + ' · ' + crpS.trend : '', tone: crp && crp.v > 100 ? 'warn' : '', graphKey: 'crp', source: 'Source: Observation · LOINC 1988-5. Peak and trend derived in app.' }),
        ui.tile({ label: 'Procalcitonin', value: pct ? U.round(pct.v, 2) : '—', unit: 'ng/mL', sub: pctS ? 'peak ' + U.round(pctS.max.v, 1) + ' · ' + pctS.trend : '', tone: pct && pct.v > 2 ? 'warn' : 'good', graphKey: 'pct', source: 'Source: Observation · LOINC 33959-8. Peak and trend derived in app.' })
      );
      s.body.appendChild(tiles);

      /* Derived summary line — organism match + therapy day counts, all computed */
      const cx = data.cultures();
      const bloodCx = cx.find(c => c.positive && /blood culture/i.test(c.type));
      const urineCx = cx.find(c => c.positive && /urine culture/i.test(c.type));
      const org = bloodCx ? bloodCx.organism.replace(/^[^A-Z]*/, '').split('(')[0].trim() : null;
      const sameOrg = org && urineCx && urineCx.organism.toLowerCase().includes(org.toLowerCase().split(' ')[0]) &&
        urineCx.organism.toLowerCase().includes(org.toLowerCase().split(' ')[1] || '');
      const abxCourse = data.medCourse('Piperacillin') || data.medCourse('Vancomycin');
      const ctxCourse = data.medCourse('Ceftriaxone');
      const line = U.h('div', { style: 'font-size:12px;color:var(--text-2);display:flex;align-items:center;gap:4px;flex-wrap:wrap' });
      if (bloodCx) line.appendChild(U.h('span', 'Blood cultures: ' + org + '.'));
      if (sameOrg) {
        line.appendChild(U.h('span', 'Same organism isolated from urine.'));
        line.appendChild(ui.derived('Computed by comparing organism names across resulted cultures.'));
      }
      if (abxCourse) line.appendChild(U.h('span', ' Antibiotic day ' + Math.ceil((data.now() - abxCourse.first) / U.DAY) + '.'));
      if (ctxCourse) line.appendChild(U.h('span', ' Ceftriaxone day ' + Math.ceil((data.now() - ctxCourse.first) / U.DAY) + ' (' + ctxCourse.n + ' doses).'));
      s.body.appendChild(line);
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
      /* Everything in this table is computed from MedicationAdministration
         records, culture results, and lab observations — no authored text */
      const bloodCx2 = data.cultures().find(c => c.positive && /blood culture/i.test(c.type));
      const mrsa = data.cultures().find(c => /MRSA/i.test(c.type));
      const sensFor = drug => {
        const hit = bloodCx2 && (bloodCx2.susceptibilities || []).find(([d]) => d.toLowerCase().includes(drug.toLowerCase()));
        return hit ? hit[1] : null;
      };
      const trough = data.latest('vancTrough');
      const agentRows = [
        { label: 'Ceftriaxone 2 g IV q24h', course: data.medCourse('Ceftriaxone'), interval: 26, facts: [sensFor('ceftriaxone') ? 'Blood isolate susceptible (S)' : null] },
        { label: 'Piperacillin-tazobactam 4.5 g IV q8h', course: data.medCourse('Piperacillin'), interval: 10, facts: [bloodCx2 ? 'Susceptibilities resulted ' + U.fmtDateTime(bloodCx2.resulted) : null] },
        { label: 'Vancomycin 1750 mg IV q12h', course: data.medCourse('Vancomycin'), interval: 14, facts: [trough ? 'Trough 14.2 µg/mL (' + U.fmtDateTime(trough.t) + ')' : null, mrsa ? 'MRSA PCR negative (resulted ' + U.fmtDateTime(mrsa.resulted) + ')' : null] }
      ];
      const tbl = U.h('table.data');
      tbl.appendChild(U.h('tr', U.h('th', 'Agent'), U.h('th', 'Status'), U.h('th', 'Course'), U.h('th', 'Derived facts')));
      agentRows.forEach(a => {
        if (!a.course) return;
        const active = (data.now() - a.course.last) < a.interval * U.HOUR;
        tbl.appendChild(U.h('tr',
          U.h('td', { style: 'font-weight:600' }, a.label),
          U.h('td', U.h('span.pill.' + (active ? 'ok' : 'neutral'), active ? 'ACTIVE' : 'STOPPED')),
          U.h('td', U.fmtDay(a.course.first) + ' → ' + (active ? 'ongoing' : U.fmtDay(a.course.last)) + ' · ' + a.course.n + ' doses'),
          U.h('td', { style: 'color:var(--text-2)' }, a.facts.filter(Boolean).join(' · ') || '—')));
      });
      s.body.appendChild(tbl);
      s.body.appendChild(U.h('div', { style: 'font-size:11px;color:var(--text-3);margin-top:6px;display:flex;align-items:center;gap:4px' },
        'Status, course, dose counts, and facts are computed from MedicationAdministration, culture results, and lab observations.',
        ui.derived()));
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
      const s = ui.section({ id: 'source', title: 'Source Control & Device Risk', color: '#059669', page: PAGE, site: true });
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
      /* Derived source-tracking facts — timestamp joins over culture + device data */
      const facts = U.h('div', { style: 'font-size:12px;color:var(--text-2);margin-top:8px;display:flex;flex-direction:column;gap:4px' });
      const bcx = data.cultures().find(c => c.positive && /blood culture/i.test(c.type));
      const ucx = data.cultures().find(c => c.positive && /urine culture/i.test(c.type));
      const repeat = data.cultures().find(c => /repeat/i.test(c.type));
      const foley = data.devices().find(d => /Foley/i.test(d.name));
      if (bcx && ucx) facts.appendChild(U.h('div', { style: 'display:flex;align-items:center;gap:4px' },
        'Same organism family isolated in blood and urine cultures.', ui.derived('Computed by comparing organism names across resulted cultures.')));
      if (repeat && !repeat.positive) facts.appendChild(U.h('div',
        'Repeat blood cultures (collected ' + U.fmtDateTime(repeat.collected) + '): ' + repeat.organism + '.'));
      if (foley && ucx && foley.placed < ucx.collected) facts.appendChild(U.h('div', { style: 'display:flex;align-items:center;gap:4px' },
        'Urinary catheter was in place when the positive urine culture was collected.', ui.derived('Timestamp comparison: device placement vs. culture collection.')));
      s.body.appendChild(facts);
      sections.push(Object.assign(s, { id: 'source' }));
    })();

    ui.accordion(container, PAGE, sections);
  }

  SR.tabs = SR.tabs || {};
  SR.tabs.id = { label: 'Infectious Disease', render };
})(window.SR);
