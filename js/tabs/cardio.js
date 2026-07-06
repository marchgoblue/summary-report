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
      /* every annotation below is computed from the fetched series */
      const tropStats = data.stats('trop'), bnpStats = data.stats('bnp'),
        crStats = data.stats('cr'), wtStats = data.stats('weight');
      const crBase = data.baseline('cr');
      const wDelta = wtStats ? wtStats.last.v - wtStats.max.v : 0;
      const lvefObs = data.series('lvef');
      const lvefNow = lvefObs.length ? lvefObs[lvefObs.length - 1] : null;
      const lvefPrior = lvefObs.length > 1 ? lvefObs[0] : null;
      const lastEcg = data.reports().filter(r => r.kind === 'ECG').sort((a, b) => b.t - a.t)[0];
      tiles.append(
        ui.tile({
          label: 'Troponin I', value: trop ? U.round(trop.v, 2) : '—', unit: 'ng/mL',
          sub: trop ? U.fmtAgo(trop.t) + (tropStats ? ' · peak ' + U.round(tropStats.max.v, 2) + ' this admission' : '') : '',
          tone: trop && trop.v > 1 ? 'alert' : (trop && trop.v > 0.04 ? 'warn' : 'good'), graphKey: 'trop',
          source: 'Source: Observation · LOINC 10839-9. Peak derived in app (max of ' + (tropStats ? tropStats.n : 0) + ' results this admission).'
        }),
        ui.tile({
          label: 'BNP', value: bnp ? Math.round(bnp.v) : '—', unit: 'pg/mL',
          sub: bnp ? U.fmtAgo(bnp.t) + (bnpStats ? ' · peak ' + Math.round(bnpStats.max.v) + ' · ' + bnpStats.trend : '') : '',
          tone: bnp && bnp.v > 1000 ? 'warn' : '', graphKey: 'bnp',
          source: 'Source: Observation · LOINC 30934-4. Peak and trend derived in app.'
        }),
        ui.tile({
          label: 'Creatinine', value: cr ? U.round(cr.v, 2) : '—', unit: 'mg/dL',
          sub: (crBase ? 'baseline ' + U.round(crBase.v, 2) + ' (' + crBase.n + ' pre-admission labs)' : 'no pre-admission labs') +
            (crStats ? ' · peak ' + U.round(crStats.max.v, 2) : ''),
          tone: cr && cr.v > 2 ? 'warn' : '', graphKey: 'cr',
          source: 'Source: Observation · LOINC 2160-0. Baseline derived in app: median of outpatient results before admission (Epic returns historicals). Peak = max this admission.'
        }),
        ui.tile({
          label: 'Weight', value: wt ? U.round(wt.v, 1) : '—', unit: 'kg',
          sub: wtStats ? U.round(wDelta, 1) + ' kg from admission peak · min ' + U.round(wtStats.min.v, 1) : '',
          graphKey: 'weight',
          source: 'Source: Observation · LOINC 29463-7. Delta from admission peak derived in app.'
        }),
        ui.tile({
          label: 'LVEF', value: lvefNow ? Math.round(lvefNow.v) + '%' : 'see echo report',
          sub: lvefNow ? U.fmtDay(lvefNow.t) + (lvefPrior ? ' · prior ' + Math.round(lvefPrior.v) + '% (' + new Date(lvefPrior.t).getFullYear() + ')' : '') : '',
          tone: lvefNow && lvefNow.v < 40 ? 'alert' : '', site: true, graphKey: 'lvef',
          source: 'Source: Observation · LOINC 10230-1 — discrete EF, exposed where the site maps it. Where not mapped, the echo DiagnosticReport conclusion below is the source of truth.'
        }),
        ui.tile({
          label: 'Latest ECG', value: lastEcg ? U.fmtAgo(lastEcg.t) : '—',
          sub: lastEcg ? lastEcg.impression.split('.')[0] + '. (verbatim)' : '',
          source: 'Source: DiagnosticReport conclusion, quoted verbatim — the app does not interpret rhythm.'
        })
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
      const txInfo = tx => {
        const ctx = data.txContext(tx);
        return `<b>${tx.product}</b><br>${tx.volume} · ${U.fmtDateTime(tx.t)}` +
          (ctx ? `<br>Last ${ctx.label} before: <span class="tip-hl">${ctx.v} ${ctx.unit}</span> (${ctx.hrsBefore.toFixed(1)}h prior, derived)` : '');
      };
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
      s.body.appendChild(ui.rowsGrid(['net', 'urine', 'weight', 'bnp', 'cr', 'bun', 'k'], PAGE));
      const dia = lasixBoluses.slice().reverse().slice(0, 8);
      s.body.appendChild(U.h('div', { style: 'margin-top:10px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Recent diuretic doses'));
      dia.forEach(m => s.body.appendChild(ui.medItem(m)));
      sections.push(Object.assign(s, { id: 'volume' }));
    })();

    /* --- NSTEMI / ischemia --- */
    (function () {
      const s = ui.section({ id: 'ischemia', title: 'Ischemia — NSTEMI Workup & Treatment', color: '#dc2626', page: PAGE });
      s.body.appendChild(ui.rowsGrid(['trop', 'hr', 'map'], PAGE));

      s.body.appendChild(U.h('div', { style: 'margin-top:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3)' }, 'Angiography'));
      data.reports().filter(r => r.kind === 'Cath').sort((a, b) => b.t - a.t)
        .forEach(r => s.body.appendChild(ui.report(r, true)));
      data.procedures().forEach(p => s.body.appendChild(
        U.h('div', { style: 'font-size:12px;color:var(--text-2);padding:4px 12px' },
          'Procedure history: ' + p.name + ' (' + p.date + ')',
          U.h('span', { style: 'color:var(--text-3);font-size:11px' }, ' · source: ' + p.src))));

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
      tbl.appendChild(U.h('tr', U.h('th', 'Active order'), U.h('th', 'Class'), U.h('th', 'Started'), U.h('th', 'Day')));
      orders.forEach(o => tbl.appendChild(U.h('tr',
        U.h('td', { style: 'font-weight:600' }, o.name),
        U.h('td', U.h('span.pill.info', o.cls)),
        U.h('td', U.fmtDay(o.started)),
        U.h('td', { style: 'color:var(--text-3)' }, 'day ' + Math.ceil((data.now() - o.started) / U.DAY)))));
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
