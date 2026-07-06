/* ============================================================
   Tab 2 — Cardiology
   CHF: I/O vs diuretic dosing, renal function, BNP, daily
   weights. NSTEMI: troponin trend, last cath, last echo, ECGs.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U, ui = SR.ui;
  const PAGE = 'cardio';

  function render(container) {
    const win = SR.state.window();
    const data = SR.data;
    container.innerHTML = '';
    const sections = [];

    /* --- Snapshot tiles --- */
    (function () {
      const s = ui.section({ id: 'snapshot', title: 'Cardiac Snapshot', color: '#dc2626', page: PAGE });
      const tiles = U.h('div.tiles');
      const trop = data.latest('trop'), bnp = data.latest('bnp'), cr = data.latest('cr'), wt = data.latest('weight');
      const wSeries = data.series('weight');
      const wDelta = wSeries.length > 1 ? wSeries[wSeries.length - 1].v - wSeries[0].v : 0;
      const echo = data.reports().filter(r => r.kind === 'Echo' && r.t > data.admitTime()).sort((a, b) => b.t - a.t)[0];
      tiles.append(
        ui.tile({ label: 'Troponin I', value: trop ? U.round(trop.v, 2) : '—', unit: 'ng/mL', sub: trop ? U.fmtAgo(trop.t) + ' · peak 8.7' : '', tone: trop && trop.v > 1 ? 'alert' : (trop && trop.v > 0.04 ? 'warn' : 'good'), graphKey: 'trop' }),
        ui.tile({ label: 'BNP', value: bnp ? Math.round(bnp.v) : '—', unit: 'pg/mL', sub: bnp ? U.fmtAgo(bnp.t) : '', tone: bnp && bnp.v > 1000 ? 'warn' : '', graphKey: 'bnp' }),
        ui.tile({ label: 'Creatinine', value: cr ? U.round(cr.v, 2) : '—', unit: 'mg/dL', sub: 'baseline 1.3 · peak 3.5', tone: cr && cr.v > 2 ? 'warn' : '', graphKey: 'cr' }),
        ui.tile({ label: 'Weight', value: wt ? U.round(wt.v, 1) : '—', unit: 'kg', sub: (wDelta >= 0 ? '+' : '') + U.round(wDelta, 1) + ' kg since admit · dry wt ~89', graphKey: 'weight' }),
        ui.tile({ label: 'LVEF', value: '25–30%', sub: echo ? 'TTE ' + U.fmtDay(echo.t) + ' · baseline 30%' : '', tone: 'alert' }),
        ui.tile({ label: 'Rhythm', value: 'Sinus', sub: 'no VT/VF on telemetry review', tone: 'good' })
      );
      s.body.appendChild(tiles);
      sections.push(Object.assign(s, { id: 'snapshot' }));
    })();

    /* --- CHF / volume management --- */
    (function () {
      const s = ui.section({ id: 'volume', title: 'Volume Status — I/O vs Diuretics (CHF)', color: '#3f9e7d', page: PAGE });
      s.body.appendChild(U.h('div', { style: 'font-size:12px;color:var(--text-3);margin:8px 0' },
        'Diuretic doses (green marks) against fluid balance. Plot Net balance + Furosemide infusion + Creatinine + BNP together on the trends graph to see the full diuresis picture.'));
      s.body.appendChild(ui.ioDays(6));
      const T = SR.mock.T;
      const lasixBoluses = data.meds().filter(m => m.cls === 'Diuretic');
      /* urine output in the 12h after a diuretic dose — shown on hover */
      const uopNext12h = t => Math.round(
        U.inRange(data.series('urine'), t, t + 12 * U.HOUR).reduce((sum, p) => sum + p.v, 0));
      const diureticInfo = m =>
        `<b>${m.name} ${m.dose} ${m.unit} ${m.route}</b><br>` +
        U.fmtDateTime(m.t) + '<br>' +
        `Urine output next 12h: <span class="tip-hl">${uopNext12h(m.t).toLocaleString()} mL</span>`;
      const txInfo = tx =>
        `<b>${tx.product}</b><br>${tx.volume} · ${U.fmtDateTime(tx.t)}<br>Indication: ${tx.indication}`;
      s.body.appendChild(ui.gantt([
        {
          label: 'Furosemide gtt', sub: '10→5 mg/hr', color: '#3f9e7d',
          spans: [{
            start: T(96), end: T(132),
            info: `<b>Furosemide infusion 10 → 5 mg/hr</b><br>${U.fmtDateTime(T(96))} → ${U.fmtDateTime(T(132))}<br>` +
              `Urine output first 12h: <span class="tip-hl">${uopNext12h(T(96)).toLocaleString()} mL</span>`
          }]
        },
        { label: 'Diuretic boluses', sub: 'furosemide / metolazone', color: '#059669', marks: lasixBoluses.map(m => ({ t: m.t, info: diureticInfo(m) })) },
        { label: 'Blood products', sub: 'volume given', color: '#c0392b', marks: data.transfusions().map(tx => ({ t: tx.t, info: txInfo(tx) })) }
      ], win));
      const rows = U.h('div.rows');
      ['net', 'urine', 'weight', 'bnp', 'cr', 'bun', 'k'].forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);
      const dia = lasixBoluses.slice().reverse().slice(0, 8);
      s.body.appendChild(U.h('div', { style: 'margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Recent diuretic doses'));
      dia.forEach(m => s.body.appendChild(ui.medItem(m)));
      sections.push(Object.assign(s, { id: 'volume' }));
    })();

    /* --- NSTEMI / ischemia --- */
    (function () {
      const s = ui.section({ id: 'ischemia', title: 'Ischemia — NSTEMI Workup & Treatment', color: '#dc2626', page: PAGE });
      const rows = U.h('div.rows');
      ['trop', 'hr', 'map'].forEach(k => { const r = ui.paramRow(k, PAGE); if (r) rows.appendChild(r); });
      s.body.appendChild(rows);

      s.body.appendChild(U.h('div', { style: 'margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Angiography'));
      data.reports().filter(r => r.kind === 'Cath').sort((a, b) => b.t - a.t)
        .forEach(r => s.body.appendChild(ui.report(r, true)));

      s.body.appendChild(U.h('div', { style: 'margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Echocardiography'));
      data.reports().filter(r => r.kind === 'Echo').sort((a, b) => b.t - a.t)
        .forEach(r => s.body.appendChild(ui.report(r, true)));

      s.body.appendChild(U.h('div', { style: 'margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'ECGs'));
      data.reports().filter(r => r.kind === 'ECG').sort((a, b) => b.t - a.t)
        .forEach(r => s.body.appendChild(ui.report(r)));
      sections.push(Object.assign(s, { id: 'ischemia' }));
    })();

    /* --- Cardiac medications --- */
    (function () {
      const s = ui.section({ id: 'cardmeds', title: 'Cardiac Medications', color: '#d97706', page: PAGE });
      const cardiacClasses = ['Antiplatelet', 'Anticoagulant', 'Statin', 'Beta-blocker', 'Diuretic'];
      const orders = data.activeOrders().filter(o => cardiacClasses.includes(o.cls));
      const tbl = U.h('table.data');
      tbl.appendChild(U.h('tr', U.h('th', 'Active order'), U.h('th', 'Class'), U.h('th', 'Started'), U.h('th', 'Note')));
      orders.forEach(o => tbl.appendChild(U.h('tr',
        U.h('td', { style: 'font-weight:600' }, o.name),
        U.h('td', U.h('span.pill.info', o.cls)),
        U.h('td', U.fmtDay(o.started)),
        U.h('td', { style: 'color:var(--text-3)' }, o.note || ''))));
      s.body.appendChild(tbl);
      s.body.appendChild(U.h('div', { style: 'margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Administrations in window'));
      const admins = data.medsInWindow(win, m => cardiacClasses.includes(m.cls)).slice().reverse();
      if (!admins.length) s.body.appendChild(U.h('div', { style: 'color:var(--text-3);font-size:12.5px;padding:8px 0' }, 'None in the selected window — widen the time range.'));
      admins.slice(0, 20).forEach(m => s.body.appendChild(ui.medItem(m)));
      sections.push(Object.assign(s, { id: 'cardmeds' }));
    })();

    ui.accordion(container, PAGE, sections);
  }

  SR.tabs = SR.tabs || {};
  SR.tabs.cardio = { label: 'Cardiology', render };
})(window.SR);
