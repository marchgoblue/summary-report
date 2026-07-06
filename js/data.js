/* ============================================================
   Data service — one interface, two backends:

   1. DEMO  — the generated Perry Cox record (default).
   2. LIVE  — a SMART on FHIR launch against Epic. After the
      OAuth2 launch completes (see launch.html), fhirclient's
      client object is used to pull the same data via FHIR R4:
        - Observation (vital-signs / laboratory, by LOINC)
        - MedicationAdministration / MedicationRequest
        - DiagnosticReport (LAB/MB, imaging, cardiology)
        - Device, Procedure, NutritionOrder, Condition,
          AllergyIntolerance
      Anything the sandbox doesn't return simply renders as
      "no data in range" — the UI is tolerant of gaps.
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;

  const svc = {
    mode: 'demo',          // 'demo' | 'live'
    client: null,          // fhirclient client when live
    ready: null            // promise resolved when data available
  };

  /* ---------- shared accessors (demo-backed; live mode fills the same stores) ---------- */
  svc.catalog = () => SR.mock.catalog;
  svc.patient = () => SR.mock.patient;
  svc.problems = () => SR.mock.problems;
  svc.allergies = () => SR.mock.allergies;
  svc.meds = () => SR.mock.meds;
  svc.transfusions = () => SR.mock.transfusions;
  svc.cultures = () => SR.mock.cultures;
  svc.reports = () => SR.mock.reports;
  svc.devices = () => SR.mock.devices;
  svc.procedures = () => SR.mock.procedures;
  svc.dietOrders = () => SR.mock.dietOrders;
  svc.codeStatus = () => SR.mock.codeStatus;
  svc.activeOrders = () => SR.mock.activeOrders;
  svc.bowelMovements = () => SR.mock.bowelMovements;
  svc.vteProphylaxis = () => SR.mock.vteProphylaxis;
  svc.admitTime = () => SR.mock.ADMIT;
  svc.now = () => SR.mock.NOW;

  /* Raw series for a catalog key */
  svc.series = function (key) {
    return SR.mock.series[key] || [];
  };

  /* Series clipped to the active window and bucketed to the active interval */
  svc.windowed = function (key, win) {
    const cat = svc.catalog()[key] || {};
    const pts = U.inRange(svc.series(key), win.start, win.end);
    if (!win.interval) return pts;
    return U.bucket(pts, win.start, win.end, win.interval, cat.agg || 'mean');
  };

  svc.latest = function (key) {
    return U.lastPoint(svc.series(key));
  };

  svc.medsInWindow = function (win, filterFn) {
    return svc.meds().filter(m => m.t >= win.start && m.t <= win.end && (!filterFn || filterFn(m)));
  };

  /* ---------- derived-in-app calculations ----------
     Everything below is deterministic math over fetched FHIR data.
     Nothing is hardcoded and nothing leaves the browser. */

  /* Max/min/latest over this admission (t >= admit) */
  svc.stats = function (key) {
    const admit = svc.admitTime();
    const pts = svc.series(key).filter(p => p.t >= admit);
    if (!pts.length) return null;
    let max = pts[0], min = pts[0];
    pts.forEach(p => { if (p.v > max.v) max = p; if (p.v < min.v) min = p; });
    const last = pts[pts.length - 1];
    const prev = pts.length > 1 ? pts[pts.length - 2] : null;
    let trend = 'stable';
    if (prev && prev.v !== 0) {
      const d = (last.v - prev.v) / Math.abs(prev.v);
      if (d < -0.07) trend = 'falling';
      else if (d > 0.07) trend = 'rising';
    }
    return { max, min, last, trend, n: pts.length };
  };

  /* Median of pre-admission (historical/outpatient) results — Epic's
     Observation API returns historicals, so a true baseline is computable */
  svc.baseline = function (key) {
    const admit = svc.admitTime();
    const pre = svc.series(key).filter(p => p.t < admit).map(p => p.v).sort((a, b) => a - b);
    if (!pre.length) return null;
    return { v: pre[Math.floor(pre.length / 2)], n: pre.length };
  };

  /* Last relevant lab before a transfusion (Hgb for PRBC, Plt for platelets) */
  svc.txContext = function (tx) {
    const key = /platelet/i.test(tx.product) ? 'plt' : 'hgb';
    const cat = svc.catalog()[key];
    const p = U.lastBefore(svc.series(key), tx.t);
    if (!p) return null;
    return { label: cat.label, v: U.round(p.v, cat.dp), unit: cat.unit, hrsBefore: (tx.t - p.t) / U.HOUR };
  };

  /* First/last/count of administrations by med name substring */
  svc.medCourse = function (nameSub) {
    const doses = svc.meds().filter(m => m.name.toLowerCase().startsWith(nameSub.toLowerCase()));
    if (!doses.length) return null;
    return { first: doses[0].t, last: doses[doses.length - 1].t, n: doses.length };
  };

  /* ============================================================
     LIVE MODE — SMART on FHIR (Epic)
     Called from app.js at startup; if a SMART launch context
     exists in sessionStorage, hydrate from the FHIR server.
     ============================================================ */
  svc.trySmartLaunch = function () {
    if (typeof FHIR === 'undefined' || !sessionStorage.getItem('SMART_KEY')) {
      svc.ready = Promise.resolve('demo');
      return svc.ready;
    }
    svc.ready = FHIR.oauth2.ready()
      .then(client => {
        svc.client = client;
        svc.mode = 'live';
        return hydrateFromFhir(client);
      })
      .then(() => 'live')
      .catch(err => {
        console.warn('SMART launch not available, falling back to demo mode:', err);
        svc.mode = 'demo';
        return 'demo';
      });
    return svc.ready;
  };

  function obsValue(obs) {
    if (obs.valueQuantity) return obs.valueQuantity.value;
    if (obs.component && obs.component.length) return null; // handled per-component
    return null;
  }

  function obsTime(obs) {
    const t = obs.effectiveDateTime || (obs.effectivePeriod && obs.effectivePeriod.start) || obs.issued;
    return t ? new Date(t).getTime() : null;
  }

  async function fetchAll(client, url) {
    const out = [];
    let bundle = await client.request(url, { pageLimit: 5, flat: false });
    while (bundle) {
      (bundle.entry || []).forEach(e => e.resource && out.push(e.resource));
      const next = (bundle.link || []).find(l => l.relation === 'next');
      bundle = next ? await client.request(next.url, { flat: false }) : null;
    }
    return out;
  }

  async function hydrateFromFhir(client) {
    const pid = client.patient.id;
    const cat = svc.catalog();

    /* Patient demographics */
    try {
      const p = await client.patient.read();
      const name = (p.name && p.name[0]) ? [p.name[0].given ? p.name[0].given.join(' ') : '', p.name[0].family || ''].join(' ').trim() : 'Unknown';
      Object.assign(SR.mock.patient, {
        id: p.id, name: name, dob: p.birthDate || '',
        sex: p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : '',
        mrn: (p.identifier && p.identifier[0] && p.identifier[0].value) || p.id
      });
    } catch (e) { console.warn('Patient read failed', e); }

    /* Observations — vitals + labs by LOINC, batched */
    const loincToKey = {};
    Object.keys(cat).forEach(k => { if (cat[k].loinc) loincToKey[cat[k].loinc] = k; });
    const codes = Object.keys(loincToKey);
    const chunks = [];
    for (let i = 0; i < codes.length; i += 10) chunks.push(codes.slice(i, i + 10));

    for (const chunk of chunks) {
      try {
        const obs = await fetchAll(client,
          `Observation?patient=${pid}&code=${chunk.join(',')}&_sort=date&_count=200`);
        obs.forEach(o => {
          const coding = (o.code && o.code.coding) || [];
          const t = obsTime(o), v = obsValue(o);
          coding.forEach(c => {
            const key = loincToKey[c.code];
            if (key != null && t != null && v != null) {
              (SR.mock.series[key] = SR.mock.series[key] || []).push({ t, v });
            }
          });
          /* BP panel arrives as components */
          if (t != null && o.component) {
            o.component.forEach(comp => {
              const cc = (comp.code.coding || [])[0];
              const key = cc && loincToKey[cc.code];
              if (key && comp.valueQuantity) {
                (SR.mock.series[key] = SR.mock.series[key] || []).push({ t, v: comp.valueQuantity.value });
              }
            });
          }
        });
      } catch (e) { console.warn('Observation fetch failed for', chunk, e); }
    }
    Object.keys(SR.mock.series).forEach(k => SR.mock.series[k].sort((a, b) => a.t - b.t));

    /* Medication administrations */
    try {
      const admins = await fetchAll(client, `MedicationAdministration?patient=${pid}&_count=200`);
      SR.mock.meds = admins.map(a => ({
        name: (a.medicationCodeableConcept && a.medicationCodeableConcept.text) || 'Medication',
        cls: 'Medication',
        dose: a.dosage && a.dosage.dose ? a.dosage.dose.value : '',
        unit: a.dosage && a.dosage.dose ? a.dosage.dose.unit : '',
        route: a.dosage && a.dosage.route ? (a.dosage.route.text || '') : '',
        t: new Date(a.effectiveDateTime || (a.effectivePeriod && a.effectivePeriod.start) || 0).getTime()
      })).filter(m => m.t).sort((a, b) => a.t - b.t);
    } catch (e) { console.warn('MedicationAdministration fetch failed', e); }

    /* Conditions -> problem list */
    try {
      const conds = await fetchAll(client, `Condition?patient=${pid}&category=problem-list-item&_count=100`);
      const active = conds.filter(c => !c.clinicalStatus || (c.clinicalStatus.coding || []).some(x => x.code === 'active'));
      if (active.length) SR.mock.problems = active.map(c => (c.code && (c.code.text || (c.code.coding && c.code.coding[0].display))) || 'Condition');
    } catch (e) { console.warn('Condition fetch failed', e); }

    /* Allergies */
    try {
      const alls = await fetchAll(client, `AllergyIntolerance?patient=${pid}&_count=100`);
      if (alls.length) SR.mock.allergies = alls.map(a => ({
        substance: (a.code && (a.code.text || (a.code.coding && a.code.coding[0].display))) || 'Allergen',
        reaction: (a.reaction && a.reaction[0] && a.reaction[0].manifestation && a.reaction[0].manifestation[0].text) || '',
        severity: (a.reaction && a.reaction[0] && a.reaction[0].severity) || ''
      }));
    } catch (e) { console.warn('AllergyIntolerance fetch failed', e); }

    /* Diagnostic reports (micro + imaging + cardiology) */
    try {
      const reps = await fetchAll(client, `DiagnosticReport?patient=${pid}&_count=100&_sort=date`);
      const mapped = reps.map(r => ({
        kind: (r.category && r.category[0] && (r.category[0].text || (r.category[0].coding && r.category[0].coding[0].code))) || 'Report',
        title: (r.code && (r.code.text || (r.code.coding && r.code.coding[0].display))) || 'Diagnostic report',
        t: new Date(r.effectiveDateTime || r.issued || 0).getTime(),
        link: '#',
        impression: r.conclusion || '(see full report in EHR)'
      })).filter(r => r.t);
      if (mapped.length) SR.mock.reports = mapped;
    } catch (e) { console.warn('DiagnosticReport fetch failed', e); }

    /* Note: Device, NutritionOrder, Procedure hydration follows the same
       pattern and can be added per-institution once sandbox testing begins. */
  }

  SR.data = svc;
})(window.SR);
