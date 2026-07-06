/* ============================================================
   Tab 4 — Quality & Safety
   Diet, DVT/PUD prophylaxis, bowel regimen, glycemic control,
   code status, lines/drains/airways (LDAs) with dwell alerts.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U, ui = SR.ui;
  const PAGE = 'quality';

  function render(container) {
    const data = SR.data;
    const now = data.now();
    container.innerHTML = '';
    const sections = [];

    /* --- Safety snapshot --- */
    (function () {
      const s = ui.section({ id: 'snapshot', title: 'Safety Snapshot', color: '#059669', page: PAGE });
      const cs = data.codeStatus();
      const bms = data.bowelMovements();
      const lastBm = bms.length ? bms[bms.length - 1] : null;
      const bmAgeH = lastBm ? (now - lastBm.t) / U.HOUR : Infinity;
      const cvc = data.devices().find(d => d.name.includes('Central') && !d.removed);
      const foley = data.devices().find(d => d.name.includes('Foley') && !d.removed);
      const diet = data.dietOrders().filter(d => !d.end || d.end > now).slice(-1)[0] || data.dietOrders().slice(-1)[0];
      const tiles = U.h('div.tiles');
      tiles.append(
        ui.tile({ label: 'Code Status', value: cs.status, sub: 'documented ' + U.fmtDay(cs.documented), tone: 'good' }),
        ui.tile({ label: 'Current Diet', value: diet ? diet.order : '—', sub: diet ? diet.detail : '' }),
        ui.tile({ label: 'Last BM', value: lastBm ? U.fmtAgo(lastBm.t) : 'none documented', sub: lastBm ? lastBm.desc : '', tone: bmAgeH > 72 ? 'alert' : bmAgeH > 48 ? 'warn' : 'good' }),
        ui.tile({ label: 'Central Line', value: cvc ? ((now - cvc.placed) / U.DAY).toFixed(1) + ' days' : 'None', sub: cvc ? cvc.site : '', tone: cvc && (now - cvc.placed) / U.DAY > 5 ? 'warn' : cvc ? '' : 'good' }),
        ui.tile({ label: 'Urinary Catheter', value: foley ? ((now - foley.placed) / U.DAY).toFixed(1) + ' days' : 'None', sub: foley ? 'review necessity daily' : '', tone: foley && (now - foley.placed) / U.DAY > 5 ? 'warn' : foley ? '' : 'good' }),
        ui.tile({ label: 'VTE Prophylaxis', value: 'Active', sub: 'enoxaparin 40 mg daily + SCDs', tone: 'good' })
      );
      s.body.appendChild(tiles);
      sections.push(Object.assign(s, { id: 'snapshot' }));
    })();

    /* --- Prophylaxis detail --- */
    (function () {
      const s = ui.section({ id: 'ppx', title: 'Prophylaxis (DVT / Stress Ulcer)', color: '#2563eb', page: PAGE });
      const vte = data.vteProphylaxis();
      const grid = U.h('div.q-grid');
      const dvt = U.h('div');
      dvt.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:8px 0 4px' }, 'DVT prophylaxis'));
      vte.history.forEach(h => dvt.appendChild(U.h('div.q-line',
        U.h('span.q-k', h.agent),
        U.h('span.q-v', h.end ? U.fmtDay(h.start) + ' – ' + U.fmtDay(h.end) : U.h('span.pill.ok', 'ACTIVE since ' + U.fmtDay(h.start))))));
      dvt.appendChild(U.h('div.q-line',
        U.h('span.q-k', vte.mechanical.device),
        U.h('span.q-v', U.h('span.pill.ok', 'ACTIVE'))));
      const pud = U.h('div');
      pud.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:8px 0 4px' }, 'Stress ulcer prophylaxis'));
      pud.appendChild(U.h('div.q-line',
        U.h('span.q-k', 'Pantoprazole 40 mg IV daily'),
        U.h('span.q-v', U.h('span.pill.ok', 'ACTIVE since ' + U.fmtDay(SR.mock.T(3))))));
      pud.appendChild(U.h('div.q-line',
        U.h('span.q-k', 'Indication'),
        U.h('span.q-v', 'Mechanical ventilation >48h, shock, DAPT')));
      grid.append(dvt, pud);
      s.body.appendChild(grid);
      sections.push(Object.assign(s, { id: 'ppx' }));
    })();

    /* --- Bowel regimen --- */
    (function () {
      const s = ui.section({ id: 'bowel', title: 'Bowel Regimen', color: '#b58a5d', page: PAGE });
      const bms = data.bowelMovements();
      const grid = U.h('div.q-grid');
      const left = U.h('div');
      left.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:8px 0 4px' }, 'Documented bowel movements'));
      if (!bms.length) left.appendChild(U.h('div.q-line', U.h('span.q-k', 'None documented this admission')));
      bms.slice().reverse().forEach(b => left.appendChild(U.h('div.q-line',
        U.h('span.q-k', U.fmtDateTime(b.t) + ' (' + U.fmtAgo(b.t) + ')'),
        U.h('span.q-v', b.desc))));
      const right = U.h('div');
      right.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:8px 0 4px' }, 'Laxatives — last 72 hours'));
      const lax = data.meds().filter(m => m.cls === 'Laxative' && m.t > now - 72 * U.HOUR).slice().reverse();
      if (!lax.length) right.appendChild(U.h('div.q-line', U.h('span.q-k', 'None administered in last 72h')));
      lax.forEach(m => right.appendChild(U.h('div.q-line',
        U.h('span.q-k', m.name + ' ' + m.dose + ' ' + m.unit + ' ' + m.route),
        U.h('span.q-v', U.fmtDateTime(m.t)))));
      grid.append(left, right);
      s.body.appendChild(grid);
      sections.push(Object.assign(s, { id: 'bowel' }));
    })();

    /* --- Glycemic control --- */
    (function () {
      const s = ui.section({ id: 'glucose', title: 'Glycemic Control', color: '#5db07a', page: PAGE });
      const glu24 = U.inRange(data.series('gluc'), now - U.DAY, now);
      const glu72 = U.inRange(data.series('gluc'), now - 3 * U.DAY, now);
      const inRange24 = glu24.filter(p => p.v >= 140 && p.v <= 180).length;
      const hypo72 = glu72.filter(p => p.v < 70).length;
      const min24 = glu24.reduce((m, p) => Math.min(m, p.v), Infinity);
      const max24 = glu24.reduce((m, p) => Math.max(m, p.v), 0);
      const tiles = U.h('div.tiles');
      tiles.append(
        ui.tile({ label: 'Range (24h)', value: Math.round(min24) + '–' + Math.round(max24), unit: 'mg/dL', sub: glu24.length + ' checks', graphKey: 'gluc' }),
        ui.tile({ label: 'In target 140–180', value: glu24.length ? Math.round(100 * inRange24 / glu24.length) + '%' : '—', sub: 'ICU target range (24h)', tone: glu24.length && inRange24 / glu24.length > 0.6 ? 'good' : 'warn' }),
        ui.tile({ label: 'Hypoglycemia (72h)', value: hypo72, sub: 'episodes < 70 mg/dL', tone: hypo72 ? 'alert' : 'good' }),
        ui.tile({ label: 'Diagnosis', value: 'T2DM', sub: 'insulin infusion d1–3 → basal-bolus' })
      );
      s.body.appendChild(tiles);

      /* 24h glucose strip */
      const strip = U.h('div.glu-strip');
      glu24.forEach(p => {
        const hpx = Math.min(42, Math.max(4, (p.v - 60) / 6));
        const cls = p.v < 70 ? 'low' : p.v > 250 ? 'vhigh' : p.v > 180 ? 'high' : '';
        strip.appendChild(U.h('div.glu-bar' + (cls ? '.' + cls : ''), { style: 'height:' + hpx + 'px', title: Math.round(p.v) + ' mg/dL · ' + U.fmtTime(p.t) }));
      });
      s.body.appendChild(strip);
      s.body.appendChild(U.h('div', { style: 'font-size:10.5px;color:var(--text-3);margin-bottom:8px' }, 'POC glucose, last 24h — green in/near target, amber >180, red >250, blue <70'));

      s.body.appendChild(U.h('div', { style: 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--text-3);margin:8px 0 2px' }, 'Diabetes medications ordered'));
      data.activeOrders().filter(o => o.cls === 'Insulin').forEach(o =>
        s.body.appendChild(U.h('div.q-line', U.h('span.q-k', o.name), U.h('span.q-v', U.h('span.pill.ok', 'ACTIVE since ' + U.fmtDay(o.started))))));
      s.body.appendChild(U.h('div.q-line', U.h('span.q-k', 'Home metformin'), U.h('span.q-v', U.h('span.pill.neutral', 'HELD — AKI/contrast'))));
      sections.push(Object.assign(s, { id: 'glucose' }));
    })();

    /* --- LDAs --- */
    (function () {
      const devs = data.devices();
      const s = ui.section({ id: 'lda', title: 'Lines, Drains & Airways (LDAs)', color: '#7c3aed', count: devs.filter(d => !d.removed).length + ' active', page: PAGE });
      devs.slice().sort((a, b) => (a.removed ? 1 : 0) - (b.removed ? 1 : 0)).forEach(d => {
        const active = !d.removed;
        const dwell = ((d.removed || now) - d.placed) / U.DAY;
        s.body.appendChild(U.h('div.lda-item',
          U.h('div.lda-icon' + (active ? '' : '.removed'), { html: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M5 9l7-7 7 7"/></svg>' }),
          U.h('div',
            U.h('div.lda-name', d.name),
            U.h('div.lda-sub', d.site + (d.note ? ' · ' + d.note : ''))),
          U.h('div.lda-right',
            active
              ? U.h('span.pill.' + (dwell > 5 ? 'warn' : 'info'), 'IN · day ' + dwell.toFixed(1) + (dwell > 5 ? ' — review necessity' : ''))
              : U.h('span.pill.neutral', 'Removed ' + U.fmtDay(d.removed)),
            U.h('div.lda-sub', 'placed ' + U.fmtDateTime(d.placed)))));
      });
      sections.push(Object.assign(s, { id: 'lda' }));
    })();

    /* --- Diet history --- */
    (function () {
      const s = ui.section({ id: 'diet', title: 'Nutrition Orders', color: '#94b53f', page: PAGE });
      const tbl = U.h('table.data');
      tbl.appendChild(U.h('tr', U.h('th', 'Order'), U.h('th', 'Period'), U.h('th', 'Detail'), U.h('th', 'Status')));
      data.dietOrders().slice().reverse().forEach(d => {
        const active = !d.end || d.end > now;
        tbl.appendChild(U.h('tr',
          U.h('td', { style: 'font-weight:600' }, d.order),
          U.h('td', U.fmtDateTime(d.start) + (d.end ? ' → ' + U.fmtDateTime(d.end) : ' → present')),
          U.h('td', { style: 'color:var(--text-2)' }, d.detail),
          U.h('td', active ? U.h('span.pill.ok', 'ACTIVE') : U.h('span.pill.neutral', 'ended'))));
      });
      s.body.appendChild(tbl);
      sections.push(Object.assign(s, { id: 'diet' }));
    })();

    ui.accordion(container, PAGE, sections);
  }

  SR.tabs = SR.tabs || {};
  SR.tabs.quality = { label: 'Quality', render };
})(window.SR);
