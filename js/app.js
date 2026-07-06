/* ============================================================
   App shell — patient banner, tabs, global time-range bar,
   customize-layout mode, boot sequence (demo vs SMART launch).
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;

  /* ---------------- global state ---------------- */
  const RANGES = [
    { id: '4h', label: '4h', ms: 4 * U.HOUR },
    { id: '12h', label: '12h', ms: 12 * U.HOUR },
    { id: '24h', label: '24h', ms: 24 * U.HOUR },
    { id: '48h', label: '48h', ms: 48 * U.HOUR },
    { id: '3d', label: '3d', ms: 3 * U.DAY },
    { id: '7d', label: '7d', ms: 7 * U.DAY }
  ];
  const INTERVALS = [
    { id: '15m', label: '15 min', ms: 15 * U.MIN },
    { id: '30m', label: '30 min', ms: 30 * U.MIN },
    { id: '1h', label: '1 hr', ms: U.HOUR },
    { id: '4h', label: '4 hr', ms: 4 * U.HOUR },
    { id: '8h', label: '8 hr', ms: 8 * U.HOUR },
    { id: '24h', label: 'Daily', ms: 24 * U.HOUR }
  ];

  const state = {
    tab: U.store.get('tab', 'icu'),
    range: U.store.get('range', '24h'),
    interval: U.store.get('interval', '15m'),
    window() {
      const r = RANGES.find(x => x.id === state.range) || RANGES[2];
      const i = INTERVALS.find(x => x.id === state.interval) || INTERVALS[0];
      const end = SR.data.now();
      return { start: end - r.ms, end, interval: i.ms };
    }
  };
  SR.state = state;

  const TAB_ORDER = ['icu', 'cardio', 'id', 'quality'];
  const TAB_ICONS = {
    icu: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 12h-4l-3 8-4-16-3 8H2"/></svg>',
    cardio: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3.4 1-4.5 2.5C10.9 4 9.3 3 7.5 3A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/></svg>',
    id: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
    quality: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/></svg>'
  };

  /* ---------------- render pieces ---------------- */
  function renderBanner() {
    const p = SR.data.patient();
    const host = document.getElementById('banner');
    host.innerHTML = '';
    const initials = p.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    const codeEl = metaItem('Code Status', SR.data.codeStatus().status);
    SR.ui.attachTip(codeEl, 'Code status is not part of standard FHIR R4 — surfacing it requires an Epic-specific interface, configured per site.');
    host.append(
      U.h('div.avatar', initials),
      U.h('div',
        U.h('div.pt-name', p.name, ' ',
          U.h('span.badge-demo' + (SR.data.mode === 'live' ? '.badge-live' : ''),
            SR.data.mode === 'live' ? 'LIVE · FHIR' : 'DEMO PATIENT')),
        U.h('div.pt-sub', `${p.age} yo ${p.sex} · DOB ${p.dob} · MRN ${p.mrn} · ${p.location || ''}`)),
      U.h('div.pt-meta',
        metaItem('Admitted', U.fmtDateTime(p.admitted) + ' (day ' + Math.ceil((SR.data.now() - p.admitted) / U.DAY) + ')'),
        metaItem('Attending', p.attending || '—'),
        codeEl,
        U.h('div.meta-item',
          U.h('div.meta-label', 'Allergies'),
          U.h('div', { style: 'display:flex;gap:5px;margin-top:3px;flex-wrap:wrap;justify-content:flex-end' },
            SR.data.allergies().map(a => U.h('span.allergy-pill', { title: a.reaction }, a.substance)))))
    );
  }

  function metaItem(label, value) {
    return U.h('div.meta-item', U.h('div.meta-label', label), U.h('div.meta-value', value));
  }

  function renderTabs() {
    const host = document.getElementById('tabs');
    host.innerHTML = '';
    TAB_ORDER.forEach(id => {
      const t = SR.tabs[id];
      const btn = U.h('button.tab' + (state.tab === id ? '.active' : ''), {
        dataset: { tab: id },
        onclick: () => { state.tab = id; U.store.set('tab', id); renderTabs(); renderPage(); },
        html: TAB_ICONS[id]
      });
      btn.appendChild(document.createTextNode(t.label));
      host.appendChild(btn);
    });
  }

  function renderTimebar() {
    const host = document.getElementById('timebar');
    host.innerHTML = '';
    const rangeSeg = U.h('div.seg');
    RANGES.forEach(r => rangeSeg.appendChild(U.h('button' + (state.range === r.id ? '.on' : ''), {
      onclick: () => { state.range = r.id; U.store.set('range', r.id); onWindowChange(); }
    }, r.label)));
    const intSeg = U.h('div.seg');
    INTERVALS.forEach(i => intSeg.appendChild(U.h('button' + (state.interval === i.id ? '.on' : ''), {
      onclick: () => { state.interval = i.id; U.store.set('interval', i.id); onWindowChange(); }
    }, i.label)));

    const customizeBtn = U.h('button.btn-ghost' + (document.body.classList.contains('customize-on') ? '.on' : ''), {
      onclick: () => {
        document.body.classList.toggle('customize-on');
        customizeBtn.classList.toggle('on');
        customizeBtn.lastChild.textContent = document.body.classList.contains('customize-on') ? 'Done' : 'Customize layout';
      },
      html: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
    });
    customizeBtn.appendChild(document.createTextNode(document.body.classList.contains('customize-on') ? 'Done' : 'Customize layout'));

    const win = state.window();
    host.append(
      U.h('span.tb-label', 'Window'), rangeSeg,
      U.h('span.tb-label', { style: 'margin-left:8px' }, 'Resolution'), intSeg,
      U.h('span.spacer'),
      U.h('span.win-desc', U.fmtDateTime(win.start) + ' → now'),
      customizeBtn);
  }

  function onWindowChange() {
    renderTimebar();
    renderPage();
    SR.graph.refresh();
  }

  function renderPage() {
    const host = document.getElementById('page');
    SR.tabs[state.tab].render(host);
  }

  /* ---------------- boot ---------------- */
  function boot() {
    SR.data.trySmartLaunch().then(() => {
      renderBanner();
      renderTabs();
      renderTimebar();
      SR.graph.init(document.getElementById('graph-tray'));
      renderPage();
      /* sensible default plot so the trends panel isn't empty on first visit */
      if (!U.store.get('visited', false)) {
        U.store.set('visited', true);
        ['map', 'hr', 'norepi'].forEach(k => SR.graph.toggle(k));
      }
    });
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.SR);
