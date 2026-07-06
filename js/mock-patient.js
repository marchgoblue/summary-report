/* ============================================================
   Perry Cox — simulated critically-ill patient (demo mode)

   Clinical storyline (T0 = ICU admission, ~7 days ago):
     58M with HFrEF (EF 30%), CAD s/p PCI (RCA 2019), HTN, T2DM,
     CKD 2. Admitted with E. coli urosepsis -> septic shock,
     intubated, norepinephrine + vasopressin, AKI.
     Hour ~46: demand-mediated NSTEMI (troponin rise, dynamic ST
     depression) -> heparin gtt, DAPT -> cath hour ~63: DES to 80%
     mid-LAD. Hour ~74: flash pulmonary edema -> aggressive
     diuresis. Extubated hour ~122. Improving through day 7.

   Everything is generated deterministically (seeded PRNG) and
   shaped to match what Epic returns via FHIR R4 (LOINC-coded
   Observations, MedicationAdministration, DiagnosticReport, etc).
   ============================================================ */
(function (SR) {
  'use strict';
  const U = SR.U;
  const HOUR = U.HOUR, MIN = U.MIN;

  /* Anchor the whole record so "now" is always current */
  const NOW = Math.floor(Date.now() / (15 * MIN)) * (15 * MIN);
  const ADMIT = NOW - 167 * HOUR;          // hour 0
  const T = h => ADMIT + h * HOUR;         // hour-offset -> epoch ms
  const END_H = 167;

  const rand = U.prng(20260705);

  /* ============================================================
     SERIES CATALOG — every graphable parameter.
     loinc codes are what the live FHIR layer queries for.
     ============================================================ */
  const catalog = {
    /* Vitals */
    hr:    { label: 'Heart Rate', unit: 'bpm', loinc: '8867-4', group: 'Vitals', dp: 0, lo: 60, hi: 100, critLo: 40, critHi: 140, color: '#e05d5d' },
    sbp:   { label: 'Systolic BP', unit: 'mmHg', loinc: '8480-6', group: 'Vitals', dp: 0, lo: 90, hi: 160, critLo: 70, critHi: 200, color: '#d98f3e' },
    dbp:   { label: 'Diastolic BP', unit: 'mmHg', loinc: '8462-4', group: 'Vitals', dp: 0, lo: 50, hi: 95, color: '#c9a24a' },
    map:   { label: 'MAP', unit: 'mmHg', loinc: '8478-0', group: 'Vitals', dp: 0, lo: 65, hi: 110, critLo: 55, color: '#b56a3f' },
    temp:  { label: 'Temperature', unit: '°C', loinc: '8310-5', group: 'Vitals', dp: 1, lo: 36, hi: 38, critHi: 39.5, color: '#e0705d' },
    rr:    { label: 'Resp Rate', unit: '/min', loinc: '9279-1', group: 'Vitals', dp: 0, lo: 10, hi: 22, critHi: 32, color: '#5da8e0' },
    spo2:  { label: 'SpO₂', unit: '%', loinc: '59408-5', group: 'Vitals', dp: 0, lo: 92, critLo: 88, color: '#4fb3a5' },
    cvp:   { label: 'CVP', unit: 'mmHg', loinc: '60985-9', group: 'Hemodynamics', dp: 0, lo: 2, hi: 10, color: '#8d6fd1', src: 'Observation (flowsheet row) — site-configured' },
    weight:{ label: 'Weight', unit: 'kg', loinc: '29463-7', group: 'Vitals', dp: 1, color: '#7a8aa0' },

    /* Ventilator / respiratory support — flowsheet rows, site-configured */
    fio2:  { label: 'FiO₂', unit: '%', loinc: '3150-0', group: 'Respiratory', dp: 0, hi: 60, color: '#5d8de0', src: 'Observation (flowsheet row) · LOINC 3150-0 — site-configured' },
    peep:  { label: 'PEEP', unit: 'cmH₂O', loinc: '76248-7', group: 'Respiratory', dp: 0, color: '#6e9ad4', src: 'Observation (flowsheet row) — site-configured' },

    /* Drips (dose series) — sourced from MAR rate documentation */
    norepi: { label: 'Norepinephrine', unit: 'mcg/kg/min', group: 'Drips', dp: 2, color: '#c74d6e', step: true, src: 'MedicationAdministration — MAR rate documentation' },
    vasopressin: { label: 'Vasopressin', unit: 'units/min', group: 'Drips', dp: 2, color: '#a05dbf', step: true, src: 'MedicationAdministration — MAR rate documentation' },
    insulinGtt: { label: 'Insulin infusion', unit: 'units/hr', group: 'Drips', dp: 1, color: '#4d8bc7', step: true, src: 'MedicationAdministration — MAR rate documentation' },
    propofol: { label: 'Propofol', unit: 'mcg/kg/min', group: 'Drips', dp: 0, color: '#8a9bb0', step: true, src: 'MedicationAdministration — MAR rate documentation' },
    heparinGtt: { label: 'Heparin infusion', unit: 'units/hr', group: 'Drips', dp: 0, color: '#5a6fbf', step: true, src: 'MedicationAdministration — MAR rate documentation' },
    lasixGtt: { label: 'Furosemide infusion', unit: 'mg/hr', group: 'Drips', dp: 0, color: '#3f9e7d', step: true, src: 'MedicationAdministration — MAR rate documentation' },

    /* Hematology */
    wbc:   { label: 'WBC', unit: '×10³/µL', loinc: '6690-2', group: 'Hematology', dp: 1, lo: 4, hi: 11, critHi: 30, color: '#d16fb0' },
    hgb:   { label: 'Hemoglobin', unit: 'g/dL', loinc: '718-7', group: 'Hematology', dp: 1, lo: 12, hi: 17, critLo: 7, color: '#c75454' },
    hct:   { label: 'Hematocrit', unit: '%', loinc: '4544-3', group: 'Hematology', dp: 1, lo: 36, hi: 50, color: '#b05e5e' },
    plt:   { label: 'Platelets', unit: '×10³/µL', loinc: '777-3', group: 'Hematology', dp: 0, lo: 150, hi: 400, critLo: 50, color: '#cf8f4e' },
    inr:   { label: 'INR', unit: '', loinc: '6301-6', group: 'Hematology', dp: 1, hi: 1.2, color: '#9a6fd1' },
    ptt:   { label: 'aPTT', unit: 'sec', loinc: '14979-9', group: 'Hematology', dp: 0, lo: 25, hi: 35, color: '#7d6fd1' },

    /* Chemistry */
    na:    { label: 'Sodium', unit: 'mmol/L', loinc: '2951-2', group: 'Chemistry', dp: 0, lo: 135, hi: 145, critLo: 120, critHi: 160, color: '#5d9fe0' },
    k:     { label: 'Potassium', unit: 'mmol/L', loinc: '2823-3', group: 'Chemistry', dp: 1, lo: 3.5, hi: 5.1, critLo: 2.8, critHi: 6.2, color: '#e0a35d' },
    cl:    { label: 'Chloride', unit: 'mmol/L', loinc: '2075-0', group: 'Chemistry', dp: 0, lo: 98, hi: 107, color: '#79b0d6' },
    co2:   { label: 'CO₂ (bicarb)', unit: 'mmol/L', loinc: '1963-8', group: 'Chemistry', dp: 0, lo: 22, hi: 29, color: '#6fc7b4' },
    bun:   { label: 'BUN', unit: 'mg/dL', loinc: '3094-0', group: 'Chemistry', dp: 0, lo: 7, hi: 20, color: '#b58a5d' },
    cr:    { label: 'Creatinine', unit: 'mg/dL', loinc: '2160-0', group: 'Chemistry', dp: 2, lo: 0.6, hi: 1.2, critHi: 4, color: '#a5763f' },
    gluc:  { label: 'Glucose (POC)', unit: 'mg/dL', loinc: '2339-0', group: 'Chemistry', dp: 0, lo: 70, hi: 180, critLo: 50, critHi: 400, color: '#5db07a' },
    mg:    { label: 'Magnesium', unit: 'mg/dL', loinc: '19123-9', group: 'Chemistry', dp: 1, lo: 1.6, hi: 2.4, color: '#8fa3bd' },
    phos:  { label: 'Phosphorus', unit: 'mg/dL', loinc: '2777-1', group: 'Chemistry', dp: 1, lo: 2.5, hi: 4.5, color: '#9bb08f' },
    ca:    { label: 'Calcium', unit: 'mg/dL', loinc: '17861-6', group: 'Chemistry', dp: 1, lo: 8.5, hi: 10.2, color: '#bda98f' },
    alt:   { label: 'ALT', unit: 'U/L', loinc: '1742-6', group: 'Chemistry', dp: 0, hi: 55, color: '#b0955d' },
    ast:   { label: 'AST', unit: 'U/L', loinc: '1920-8', group: 'Chemistry', dp: 0, hi: 48, color: '#b0855d' },
    tbili: { label: 'Total bilirubin', unit: 'mg/dL', loinc: '1975-2', group: 'Chemistry', dp: 1, hi: 1.2, color: '#c7b03e' },
    alb:   { label: 'Albumin', unit: 'g/dL', loinc: '1751-7', group: 'Chemistry', dp: 1, lo: 3.5, hi: 5, color: '#94b53f' },

    /* Cardiac / inflammatory */
    trop:  { label: 'Troponin I', unit: 'ng/mL', loinc: '10839-9', group: 'Cardiac', dp: 2, hi: 0.04, critHi: 1, color: '#d1493f' },
    bnp:   { label: 'BNP', unit: 'pg/mL', loinc: '30934-4', group: 'Cardiac', dp: 0, hi: 100, color: '#3f6fd1' },
    lvef:  { label: 'LVEF', unit: '%', loinc: '10230-1', group: 'Cardiac', dp: 0, lo: 50, color: '#3f8ad1', src: 'Observation · LOINC 10230-1 — discrete EF where site-configured' },
    vancTrough: { label: 'Vancomycin trough', unit: 'µg/mL', loinc: '20578-1', group: 'Drug Levels', dp: 1, lo: 10, hi: 20, color: '#8a5dd1' },
    lactate: { label: 'Lactate', unit: 'mmol/L', loinc: '2524-7', group: 'Inflammatory', dp: 1, hi: 2, critHi: 4, color: '#d1763f' },
    crp:   { label: 'CRP', unit: 'mg/L', loinc: '1988-5', group: 'Inflammatory', dp: 1, hi: 8, color: '#d13f8a' },
    pct:   { label: 'Procalcitonin', unit: 'ng/mL', loinc: '33959-8', group: 'Inflammatory', dp: 2, hi: 0.25, critHi: 2, color: '#a03fd1' },

    /* Blood gas */
    ph:    { label: 'pH (art)', unit: '', loinc: '2744-1', group: 'Blood Gas', dp: 2, lo: 7.35, hi: 7.45, critLo: 7.2, color: '#3fa5d1' },
    pco2:  { label: 'pCO₂ (art)', unit: 'mmHg', loinc: '2019-8', group: 'Blood Gas', dp: 0, lo: 35, hi: 45, color: '#3fc0d1' },
    po2:   { label: 'pO₂ (art)', unit: 'mmHg', loinc: '2703-7', group: 'Blood Gas', dp: 0, lo: 80, hi: 100, color: '#3fd1b8' },

    /* Fluids (agg=sum when bucketing) — flowsheet-row Observations, site-configured */
    urine: { label: 'Urine output', unit: 'mL', loinc: '9187-6', group: 'Fluids', dp: 0, agg: 'sum', color: '#d9c23e', src: 'Observation (flowsheet row) · LOINC 9187-6 — site-configured' },
    intake:{ label: 'Intake (all)', unit: 'mL', loinc: '8999-5', group: 'Fluids', dp: 0, agg: 'sum', color: '#4d9ec7', src: 'Observation (flowsheet row) — site-configured' },
    net:   { label: 'Net balance', unit: 'mL', group: 'Fluids', dp: 0, agg: 'sum', color: '#7a8aa0', src: 'Derived in app: intake − urine output − drain output' },
    ngout: { label: 'NG output', unit: 'mL', group: 'Fluids', dp: 0, agg: 'sum', color: '#a3b53f', src: 'Observation (flowsheet row) — site-configured' }
  };

  /* ============================================================
     Series generation helpers
     ============================================================ */
  function genContinuous(keyframes, intervalMin, noiseAmp, opts) {
    opts = opts || {};
    const pts = [];
    const startH = opts.startH || 0, endH = opts.endH == null ? END_H : opts.endH;
    for (let h = startH; h <= endH; h += intervalMin / 60) {
      let v = U.interp(keyframes, h) + U.noise(rand) * noiseAmp;
      if (opts.min != null && v < opts.min) v = opts.min;
      if (opts.max != null && v > opts.max) v = opts.max;
      if (opts.round != null) v = Math.round(v / opts.round) * opts.round;
      pts.push({ t: T(h), v: v });
    }
    return pts;
  }

  function genScheduled(hours, keyframes, noiseAmp, opts) {
    opts = opts || {};
    return hours.filter(h => h <= END_H).map(h => {
      let v = U.interp(keyframes, h) + U.noise(rand) * noiseAmp;
      if (opts.min != null && v < opts.min) v = opts.min;
      return { t: T(h), v: v };
    });
  }

  /* q6h lab draws day 1-2, daily 04:00 after */
  function labHours(firstDayEvery, startH) {
    const hrs = [];
    let h = startH == null ? 0.5 : startH;
    while (h < 48) { hrs.push(h); h += firstDayEvery; }
    for (let d = 2; d < 7; d++) hrs.push(d * 24 + 4);
    return hrs;
  }

  const dailyHours = [0.5, 28, 52, 76, 100, 124, 148];   // ~q24h draws

  /* ============================================================
     Build every series
     ============================================================ */
  const series = {};

  series.hr = genContinuous([[0, 118], [8, 128], [16, 132], [30, 120], [46, 126], [50, 118], [63, 108], [74, 121], [80, 112], [96, 102], [122, 94], [144, 86], [167, 82]], 15, 4, { round: 1 });
  series.sbp = genContinuous([[0, 82], [3, 88], [8, 92], [16, 96], [30, 101], [46, 94], [63, 104], [74, 98], [84, 108], [96, 112], [122, 114], [167, 118]], 15, 5, { round: 1 });
  series.dbp = genContinuous([[0, 44], [3, 50], [16, 54], [46, 52], [84, 58], [122, 62], [167, 66]], 15, 4, { round: 1 });
  series.map = series.sbp.map((p, i) => ({ t: p.t, v: Math.round((p.v + 2 * series.dbp[i].v) / 3) }));
  series.temp = genContinuous([[0, 39.3], [6, 38.9], [14, 39.1], [24, 38.4], [30, 38.8], [40, 38.1], [54, 38.4], [64, 37.7], [78, 37.4], [100, 37.2], [110, 37.8], [116, 37.3], [167, 36.9]], 15, 0.15, { round: 0.1 });
  series.rr = genContinuous([[0, 31], [4, 18], [46, 22], [74, 27], [84, 20], [122, 21], [130, 18], [167, 16]], 15, 1.6, { round: 1 });
  series.spo2 = genContinuous([[0, 87], [2, 93], [6, 96], [46, 94], [74, 90], [80, 94], [96, 96], [122, 95], [167, 96]], 15, 1, { round: 1, max: 100 });
  series.cvp = genContinuous([[2, 4], [8, 9], [24, 12], [60, 13], [74, 16], [96, 12], [120, 9]], 30, 1.2, { startH: 2, endH: 120, round: 1 });
  series.weight = genScheduled([1, 24, 48, 72, 96, 120, 144, 166], [[1, 92.0], [24, 95.1], [48, 96.0], [72, 96.6], [96, 95.0], [120, 93.4], [144, 92.1], [166, 91.2]], 0.1);

  series.fio2 = genContinuous([[1.5, 100], [4, 70], [8, 60], [24, 45], [46, 50], [74, 80], [82, 60], [96, 40], [110, 35], [121.9, 30]], 60, 2, { startH: 1.5, endH: 121.9, round: 5, min: 30, max: 100 });
  series.peep = genContinuous([[1.5, 10], [24, 8], [74, 12], [96, 8], [110, 5], [121.9, 5]], 60, 0, { startH: 1.5, endH: 121.9, round: 1 });

  series.norepi = genContinuous([[0.7, 0.12], [4, 0.22], [10, 0.32], [18, 0.28], [30, 0.2], [46, 0.26], [56, 0.18], [70, 0.1], [80, 0.04], [84, 0.02]], 60, 0.015, { startH: 0.7, endH: 84, min: 0.02, round: 0.02 });
  series.vasopressin = genContinuous([[8, 0.04], [60, 0.04]], 120, 0, { startH: 8, endH: 60 });
  series.insulinGtt = genContinuous([[6, 4], [12, 7], [24, 6], [40, 5], [60, 3], [72, 2]], 60, 0.8, { startH: 6, endH: 72, min: 0.5, round: 0.5 });
  series.propofol = genContinuous([[1.5, 40], [24, 30], [74, 40], [100, 20], [116, 10], [121, 5]], 120, 4, { startH: 1.5, endH: 121, min: 5, round: 5 });
  series.heparinGtt = genContinuous([[47, 1150], [52, 1300], [63.5, 1300]], 60, 0, { startH: 47, endH: 63.5, round: 50 });
  series.lasixGtt = genContinuous([[96, 10], [120, 10], [126, 5], [132, 5]], 120, 0, { startH: 96, endH: 132 });

  series.wbc = genScheduled(labHours(12), [[0, 18.6], [12, 21.4], [24, 22.8], [48, 17.2], [76, 14.8], [100, 12.1], [124, 10.6], [148, 9.4]], 0.5, { min: 4 });
  series.hgb = genScheduled(labHours(6), [[0, 9.9], [12, 9.1], [24, 8.2], [34, 6.9], [40, 7.8], [48, 8.9], [76, 8.6], [100, 8.8], [148, 9.1]], 0.15);
  series.hct = series.hgb.map(p => ({ t: p.t, v: U.round(p.v * 3.02, 1) }));
  series.plt = genScheduled(labHours(12), [[0, 146], [24, 104], [48, 66], [58, 58], [64, 92], [76, 88], [100, 112], [124, 146], [148, 189]], 6, { min: 40 });
  series.inr = genScheduled(dailyHours, [[0, 1.5], [48, 1.7], [76, 1.5], [124, 1.3], [148, 1.2]], 0.05);
  series.ptt = genScheduled([0.5, 47.5, 51, 55, 59, 63, 76, 100], [[0, 34], [47.5, 52], [51, 88], [55, 71], [59, 66], [63, 68], [76, 38], [100, 33]], 2);

  series.na = genScheduled(labHours(6), [[0, 131], [24, 134], [48, 136], [76, 138], [100, 140], [148, 138]], 1.2);
  series.k = genScheduled(labHours(6), [[0, 5.4], [12, 4.9], [48, 4.4], [76, 4.1], [100, 3.6], [110, 4.1], [148, 4.0]], 0.15);
  series.cl = genScheduled(labHours(6), [[0, 99], [24, 104], [76, 106], [124, 102]], 1.2);
  series.co2 = genScheduled(labHours(6), [[0, 14], [12, 16], [24, 19], [48, 21], [76, 22], [100, 26], [148, 27]], 1);
  series.bun = genScheduled(labHours(12), [[0, 38], [24, 52], [48, 64], [76, 68], [100, 61], [124, 49], [148, 38]], 2);
  series.cr = genScheduled(labHours(12), [[0, 2.1], [24, 2.9], [48, 3.4], [60, 3.5], [76, 3.2], [100, 2.7], [124, 2.2], [148, 1.8]], 0.08);
  /* Pre-admission outpatient creatinines — Epic's Observation API returns
     historical results, which is what lets the app COMPUTE a true baseline */
  series.cr = [
    { t: T(-6480), v: 1.24 },   // ~9 months before admission
    { t: T(-3240), v: 1.31 },   // ~4.5 months
    { t: T(-980), v: 1.28 }     // ~6 weeks
  ].concat(series.cr);
  series.gluc = (function () {
    const hrs = [];
    for (let h = 1; h <= 72; h += 1) hrs.push(h);          // q1h on insulin gtt
    for (let h = 74; h <= END_H; h += 4) hrs.push(h);      // q4h after
    return genScheduled(hrs, [[0, 318], [6, 268], [12, 224], [24, 196], [48, 172], [72, 158], [100, 164], [124, 152], [167, 148]], 22, { min: 82 });
  })();
  series.mg = genScheduled(dailyHours, [[0, 1.6], [28, 2.1], [76, 2.0], [148, 2.1]], 0.12);
  series.phos = genScheduled(dailyHours, [[0, 4.8], [28, 3.9], [76, 2.4], [100, 3.1], [148, 3.4]], 0.2);
  series.ca = genScheduled(dailyHours, [[0, 7.9], [28, 8.1], [76, 8.4], [148, 8.7]], 0.15);
  series.alt = genScheduled(dailyHours, [[0, 88], [28, 134], [52, 112], [100, 74], [148, 51]], 5);
  series.ast = genScheduled(dailyHours, [[0, 102], [28, 156], [52, 118], [100, 68], [148, 44]], 5);
  series.tbili = genScheduled(dailyHours, [[0, 1.8], [28, 2.3], [76, 1.6], [148, 1.1]], 0.1);
  series.alb = genScheduled(dailyHours, [[0, 2.9], [76, 2.5], [148, 2.7]], 0.1);

  series.trop = genScheduled([0.5, 6.5, 46.5, 50, 54, 58, 63, 70, 78, 100, 124], [[0, 0.05], [6.5, 0.06], [46.5, 0.94], [50, 3.1], [54, 6.4], [58, 8.7], [63, 8.1], [70, 6.2], [78, 4.1], [100, 1.4], [124, 0.5]], 0.03, { min: 0.01 });
  series.bnp = genScheduled([0.5, 52, 76, 100, 148], [[0, 940], [52, 1480], [76, 2360], [100, 1720], [148, 1010]], 40);
  series.lactate = genScheduled([0.5, 3, 6, 9, 12, 18, 24, 36, 48, 76, 100], [[0, 5.8], [3, 4.9], [6, 3.6], [9, 2.8], [12, 2.2], [18, 1.7], [24, 1.4], [48, 1.2], [100, 0.9]], 0.15, { min: 0.5 });
  series.crp = genScheduled(dailyHours, [[0, 187], [28, 246], [52, 214], [76, 152], [100, 98], [124, 61], [148, 38]], 8);
  series.pct = genScheduled(dailyHours, [[0, 38.4], [28, 44.2], [52, 21.7], [76, 8.3], [100, 2.9], [124, 1.1], [148, 0.4]], 0.5, { min: 0.05 });

  /* Discrete LVEF observations (LOINC 10230-1) — prior TTE + this admission */
  series.lvef = [{ t: T(-5300), v: 30 }, { t: T(57), v: 27 }];
  /* Vancomycin trough drawn before 4th dose */
  series.vancTrough = [{ t: T(37), v: 14.2 }];

  series.ph = genScheduled([0.5, 2, 6, 12, 24, 47, 75, 80, 96, 121], [[0, 7.18], [2, 7.24], [6, 7.29], [12, 7.33], [24, 7.36], [47, 7.35], [75, 7.31], [80, 7.36], [96, 7.39], [121, 7.42]], 0.01);
  series.pco2 = genScheduled([0.5, 2, 6, 12, 24, 47, 75, 80, 96, 121], [[0, 30], [6, 36], [24, 38], [75, 44], [96, 40], [121, 38]], 1.5);
  series.po2 = genScheduled([0.5, 2, 6, 12, 24, 47, 75, 80, 96, 121], [[0, 54], [2, 84], [6, 92], [24, 88], [75, 61], [80, 79], [96, 84], [121, 86]], 4);

  /* Hourly fluids */
  series.urine = genContinuous([[1, 14], [8, 9], [16, 12], [24, 22], [48, 34], [72, 42], [78, 140], [90, 220], [108, 190], [132, 130], [144, 95], [167, 80]], 60, 8, { startH: 1, min: 0, round: 5 });
  series.intake = genContinuous([[0, 520], [1, 540], [2, 510], [3, 490], [4, 180], [8, 130], [24, 155], [72, 150], [96, 85], [130, 70], [167, 75]], 60, 15, { min: 0, round: 5 });
  series.ngout = genContinuous([[2, 20], [24, 15], [96, 5], [121, 5]], 60, 6, { startH: 2, endH: 121, min: 0, round: 5 });
  series.net = series.intake.map((p, i) => {
    const u = series.urine[Math.max(0, i - 1)] || { v: 0 };
    const n = series.ngout.find(q => q.t === p.t);
    return { t: p.t, v: p.v - u.v - (n ? n.v : 0) };
  });

  /* ============================================================
     MEDICATION ADMINISTRATIONS  (MedicationAdministration)
     ============================================================ */
  const meds = [];
  function admin(name, rxnorm, cls, dose, unit, route, hoursList) {
    hoursList.forEach(h => {
      if (h <= END_H) meds.push({ name, rxnorm, cls, dose, unit, route, t: T(h) });
    });
  }
  function q(start, everyH, stopH) {
    const out = [];
    for (let h = start; h <= Math.min(stopH == null ? END_H : stopH, END_H); h += everyH) out.push(h);
    return out;
  }

  /* Antibiotics */
  admin('Vancomycin', '11124', 'Antibiotic', 1750, 'mg', 'IV', [2, 14, 26, 38, 50]);
  admin('Piperacillin-tazobactam', '33533', 'Antibiotic', 4.5, 'g', 'IV', q(1.5, 8, 49.5));
  admin('Ceftriaxone', '2193', 'Antibiotic', 2, 'g', 'IV', q(52, 24));

  /* Vasoactive / drips as discrete rate-change documents live in series; also log key boluses */
  admin('Norepinephrine (rate change)', '7512', 'Vasopressor', 0.32, 'mcg/kg/min', 'IV', [10]);
  admin('Vasopressin (start)', '11149', 'Vasopressor', 0.04, 'units/min', 'IV', [8]);
  admin('Vasopressin (stop)', '11149', 'Vasopressor', 0, 'units/min', 'IV', [60]);
  admin('Norepinephrine (off)', '7512', 'Vasopressor', 0, 'mcg/kg/min', 'IV', [84]);

  /* Sepsis resuscitation */
  admin('Lactated Ringers bolus', '9863', 'Fluid', 1000, 'mL', 'IV', [0.3, 1.2, 2.4]);
  admin('Albumin 5%', '433', 'Fluid', 500, 'mL', 'IV', [9]);
  admin('Hydrocortisone', '5492', 'Steroid', 50, 'mg', 'IV', q(11, 6, 83));

  /* NSTEMI treatment */
  admin('Aspirin (chewed)', '1191', 'Antiplatelet', 324, 'mg', 'PO', [46.8]);
  admin('Aspirin', '1191', 'Antiplatelet', 81, 'mg', 'PO', q(70, 24));
  admin('Ticagrelor (load)', '1116632', 'Antiplatelet', 180, 'mg', 'PO', [58]);
  admin('Ticagrelor', '1116632', 'Antiplatelet', 90, 'mg', 'PO', q(70, 12));
  admin('Heparin bolus', '5224', 'Anticoagulant', 4000, 'units', 'IV', [47]);
  admin('Atorvastatin', '83367', 'Statin', 80, 'mg', 'PO', q(49, 24));
  admin('Metoprolol tartrate', '6918', 'Beta-blocker', 12.5, 'mg', 'PO', q(96, 12));

  /* Diuresis */
  admin('Furosemide', '4603', 'Diuretic', 80, 'mg', 'IV', [78, 90]);
  admin('Furosemide', '4603', 'Diuretic', 40, 'mg', 'IV', q(134, 12, 167));
  admin('Metolazone', '6916', 'Diuretic', 5, 'mg', 'PO', [102, 126]);
  admin('Potassium chloride', '8591', 'Electrolyte', 40, 'mEq', 'PO', [104, 112, 128]);
  admin('Magnesium sulfate', '6585', 'Electrolyte', 2, 'g', 'IV', [1.8, 100]);
  admin('Calcium gluconate', '1901', 'Electrolyte', 2, 'g', 'IV', [2.2]);
  admin('Sodium phosphate', '36709', 'Electrolyte', 15, 'mmol', 'IV', [78]);

  /* Sedation / analgesia */
  admin('Fentanyl (rate change)', '4337', 'Sedation', 50, 'mcg/hr', 'IV', [1.5, 74, 100]);
  admin('Propofol (off — extubation)', '8782', 'Sedation', 0, 'mcg/kg/min', 'IV', [121.5]);

  /* Insulin (post-drip) */
  admin('Insulin glargine', '274783', 'Insulin', 24, 'units', 'SubQ', [96, 120, 144]);
  admin('Insulin lispro (correction)', '86009', 'Insulin', 4, 'units', 'SubQ', [102, 114, 126, 150]);
  admin('Insulin lispro (correction)', '86009', 'Insulin', 6, 'units', 'SubQ', [98, 138]);

  /* GI / prophylaxis / bowel regimen */
  admin('Pantoprazole', '40790', 'PPI', 40, 'mg', 'IV', q(3, 24));
  admin('Enoxaparin (prophylaxis)', '67108', 'Anticoagulant', 40, 'mg', 'SubQ', q(96, 24));
  admin('Sennosides', '36387', 'Laxative', 17.2, 'mg', 'PO', [100, 124, 148, 160]);
  admin('Docusate sodium', '82003', 'Laxative', 100, 'mg', 'PO', q(96, 12));
  admin('Polyethylene glycol 3350', '221147', 'Laxative', 17, 'g', 'PO', [130, 154]);
  admin('Chlorhexidine oral rinse', '20470', 'Oral care', 15, 'mL', 'PO', q(6, 12, 120));
  admin('Acetaminophen', '161', 'Antipyretic', 650, 'mg', 'PO', [5, 14, 30, 54, 110]);

  meds.sort((a, b) => a.t - b.t);

  /* ============================================================
     BLOOD PRODUCTS
     ============================================================ */
  /* Administration time + product only — pre-transfusion lab context is
     COMPUTED by the app from the Hgb/platelet series (see data.txContext) */
  const transfusions = [
    { product: 'Packed Red Blood Cells', abbrev: 'PRBC', volume: '1 unit (310 mL)', t: T(35.2) },
    { product: 'Packed Red Blood Cells', abbrev: 'PRBC', volume: '1 unit (295 mL)', t: T(38.8) },
    { product: 'Platelets (apheresis)', abbrev: 'PLT', volume: '1 unit (250 mL)', t: T(60.5) }
  ];

  /* ============================================================
     MICROBIOLOGY  (DiagnosticReport, category MB)
     ============================================================ */
  const cultures = [
    {
      type: 'Blood culture ×2', source: 'Peripheral + RIJ CVC', collected: T(0.5), resulted: T(38),
      status: 'Final', positive: true,
      organism: 'Escherichia coli (2/2 bottles, 2/2 sets)',
      gram: 'Gram-negative rods at 11h',
      susceptibilities: [
        ['Ampicillin', 'R'], ['Ampicillin-sulbactam', 'R'], ['Ceftriaxone', 'S'],
        ['Ceftazidime', 'S'], ['Cefepime', 'S'], ['Piperacillin-tazobactam', 'S'],
        ['Meropenem', 'S'], ['Ciprofloxacin', 'R'], ['Gentamicin', 'S'],
        ['Trimethoprim-sulfamethoxazole', 'R'], ['Nitrofurantoin', 'S']
      ]
    },
    {
      type: 'Urine culture', source: 'Foley catheter', collected: T(0.6), resulted: T(30),
      status: 'Final', positive: true,
      organism: '>100,000 CFU/mL Escherichia coli',
      gram: null,
      susceptibilities: [
        ['Ampicillin', 'R'], ['Ceftriaxone', 'S'], ['Ciprofloxacin', 'R'],
        ['Nitrofurantoin', 'S'], ['Trimethoprim-sulfamethoxazole', 'R']
      ]
    },
    { type: 'Respiratory culture', source: 'Endotracheal aspirate', collected: T(4), resulted: T(52), status: 'Final', positive: false, organism: 'Normal respiratory flora', gram: 'Few WBC, rare epithelial cells' },
    { type: 'MRSA nasal PCR', source: 'Nares', collected: T(4), resulted: T(8), status: 'Final', positive: false, organism: 'MRSA NOT detected' },
    { type: 'Blood culture ×2 (repeat)', source: 'Peripheral ×2', collected: T(50), resulted: T(146), status: 'Final', positive: false, organism: 'No growth at 4 days' },
    { type: 'C. difficile PCR', source: 'Stool', collected: T(119), resulted: T(123), status: 'Final', positive: false, organism: 'C. difficile toxin gene NOT detected' },
    { type: 'Urinalysis', source: 'Foley catheter', collected: T(0.5), resulted: T(2), status: 'Final', positive: true, organism: '>182 WBC/hpf, large leuk esterase, positive nitrites, many bacteria' }
  ];

  /* ============================================================
     DIAGNOSTIC REPORTS  (imaging / cardiology / ECG)
     ============================================================ */
  const reports = [
    {
      kind: 'ECG', title: 'ECG 12-lead', t: T(1), link: '#ecg-1',
      impression: 'Sinus tachycardia at 121 bpm. Nonspecific ST-T wave changes. No prior for comparison at this facility.'
    },
    {
      kind: 'ECG', title: 'ECG 12-lead', t: T(46.3), link: '#ecg-2',
      impression: 'Sinus tachycardia at 126 bpm. New 1-2 mm horizontal ST depression V3–V6 with T-wave inversion V4–V6 compared to prior. Consistent with ischemia.'
    },
    {
      kind: 'ECG', title: 'ECG 12-lead (post-PCI)', t: T(66), link: '#ecg-3',
      impression: 'Sinus rhythm at 104 bpm. Improving anterolateral ST depression. Persistent T-wave inversion V4–V6.'
    },
    {
      kind: 'Echo', title: 'Transthoracic Echocardiogram', t: T(57), link: '#echo-1',
      impression: 'LVEF 25–30% (visual estimate; baseline 30% in 2025). Severe global hypokinesis with regional akinesis of the mid-distal anterior wall and apex (new from prior). Moderate (2+) functional mitral regurgitation. RVSP 46 mmHg. IVC dilated without respiratory variation. No pericardial effusion.',
      detail: 'LVEDD 6.1 cm. LA moderately dilated. RV mildly reduced. Mild TR. No LV thrombus identified; suboptimal apical windows.'
    },
    {
      kind: 'Cath', title: 'Left Heart Catheterization / PCI', t: T(63), link: '#cath-1',
      impression: 'Culprit: 80% mid-LAD stenosis with haziness — treated with 3.0 × 18 mm drug-eluting stent, TIMI 3 flow post. RCA: patent stent (2019) with 40% in-stent neointima. LCx: 30% mid vessel. LVEDP 28 mmHg.',
      detail: 'Right radial access. Contrast 85 mL. No complications. Plan: DAPT with aspirin + ticagrelor ×12 months, high-intensity statin.'
    },
    {
      kind: 'Echo', title: 'Prior TTE (Nov 2025)', t: T(-5300), link: '#echo-0',
      impression: 'LVEF 30%. Global hypokinesis. Mild MR. Consistent with known ischemic cardiomyopathy.'
    },
    {
      kind: 'CXR', title: 'Chest X-ray (portable)', t: T(0.8), link: '#cxr-1',
      impression: 'Low lung volumes. Bilateral perihilar opacities compatible with pulmonary edema versus multifocal pneumonia. ETT 4 cm above carina. Right IJ line tip at cavoatrial junction.'
    },
    {
      kind: 'CXR', title: 'Chest X-ray (portable)', t: T(74.5), link: '#cxr-2',
      impression: 'Interval worsening of bilateral alveolar opacities with cephalization, consistent with acute pulmonary edema.'
    },
    {
      kind: 'CXR', title: 'Chest X-ray (portable)', t: T(129), link: '#cxr-3',
      impression: 'Marked improvement in pulmonary edema. Small residual bilateral pleural effusions. Lines and tubes removed.'
    }
  ];

  /* ============================================================
     LINES / DRAINS / AIRWAYS  (Device / Procedure)
     ============================================================ */
  /* Device, site, and timestamps only — placement narrative lives in notes,
     not in FHIR. Dwell time and necessity prompts are computed by the app. */
  const devices = [
    { name: 'Central venous catheter — triple lumen', site: 'Right internal jugular', placed: T(2), removed: null },
    { name: 'Arterial line', site: 'Left radial', placed: T(2.5), removed: T(120) },
    { name: 'Urinary catheter (Foley)', site: 'Urethral, 16 Fr', placed: T(0.5), removed: null },
    { name: 'Endotracheal tube', site: '7.5 ETT', placed: T(1.3), removed: T(122) },
    { name: 'Nasogastric tube', site: 'Left nare, 18 Fr', placed: T(2), removed: T(123) },
    { name: 'Peripheral IV', site: 'Right forearm, 18 g', placed: T(0.2), removed: T(96) }
  ];

  /* Surgical/procedure history (FHIR Procedure) — existence and date only */
  const procedures = [
    { name: 'Percutaneous coronary intervention, drug-eluting stent', date: '2019', src: 'Procedure — surgical history' }
  ];

  /* ============================================================
     ORDERS — diet, code status, active meds (MedicationRequest)
     ============================================================ */
  const dietOrders = [
    { order: 'NPO', start: T(0.4), end: T(20), detail: 'NPO — shock, pending intubation' },
    { order: 'Enteral nutrition — tube feeds', start: T(20), end: T(123), detail: 'Isosource 1.5 Cal via NG: start 10 mL/hr, advance q6h to goal 40 mL/hr' },
    { order: 'NPO pending swallow evaluation', start: T(123), end: T(129), detail: 'Post-extubation' },
    { order: 'Cardiac diet, consistent carbohydrate', start: T(130), end: null, detail: '2 g sodium, 1.5 L fluid restriction, consistent carbohydrate (diabetic)' }
  ];

  const codeStatus = { status: 'Full Code', documented: T(1.1), by: 'ICU attending, confirmed with patient’s spouse (HCPOA: Jordan Cox)' };

  const activeOrders = [
    { name: 'Ceftriaxone 2 g IV q24h', cls: 'Antibiotic', started: T(52) },
    { name: 'Aspirin 81 mg PO daily', cls: 'Antiplatelet', started: T(70) },
    { name: 'Ticagrelor 90 mg PO BID', cls: 'Antiplatelet', started: T(70) },
    { name: 'Atorvastatin 80 mg PO nightly', cls: 'Statin', started: T(49) },
    { name: 'Metoprolol tartrate 12.5 mg PO BID', cls: 'Beta-blocker', started: T(96) },
    { name: 'Furosemide 40 mg IV q12h', cls: 'Diuretic', started: T(134) },
    { name: 'Enoxaparin 40 mg SubQ daily', cls: 'VTE prophylaxis', started: T(96) },
    { name: 'Pantoprazole 40 mg IV daily', cls: 'Stress ulcer prophylaxis', started: T(3) },
    { name: 'Insulin glargine 24 units SubQ nightly', cls: 'Insulin', started: T(96) },
    { name: 'Insulin lispro correction scale AC+HS', cls: 'Insulin', started: T(96) },
    { name: 'Sennosides 17.2 mg PO BID PRN', cls: 'Laxative', started: T(96) },
    { name: 'Docusate 100 mg PO BID', cls: 'Laxative', started: T(96) },
    { name: 'Polyethylene glycol 17 g PO daily PRN', cls: 'Laxative', started: T(130) },
    { name: 'Acetaminophen 650 mg PO q6h PRN', cls: 'PRN', started: T(3) }
  ];

  /* Bowel movements (documented flowsheet Observations) */
  const bowelMovements = [
    { t: T(118), desc: 'Loose, medium, brown' },
    { t: T(151), desc: 'Soft formed, medium, brown' }
  ];

  /* SCDs for mechanical VTE ppx */
  const vteProphylaxis = {
    mechanical: { device: 'Sequential compression devices, bilateral', started: T(2), active: true },
    history: [
      { agent: 'Heparin infusion (therapeutic — NSTEMI)', start: T(47), end: T(63.5) },
      { agent: 'Enoxaparin 40 mg SubQ daily', start: T(96), end: null }
    ]
  };

  /* ============================================================
     PATIENT / ENCOUNTER / PROBLEMS / ALLERGIES
     ============================================================ */
  const patient = {
    id: 'demo-perry-cox',
    name: 'Perry Cox',
    dob: '1968-01-22',
    age: Math.floor((NOW - new Date('1968-01-22').getTime()) / (365.25 * U.DAY)),
    sex: 'Male',
    mrn: 'E784512',
    heightCm: 185,
    weightKg: 92,
    location: 'MICU Bed 7',
    attending: 'R. Kelso, MD',
    admitted: ADMIT,
    losDays: ((NOW - ADMIT) / U.DAY).toFixed(1)
  };

  const problems = [
    'Septic shock secondary to E. coli urosepsis (bacteremic)',
    'NSTEMI — s/p DES to mid-LAD (hospital day 3)',
    'Acute on chronic systolic heart failure (HFrEF, EF 25–30%)',
    'Acute kidney injury on CKD stage 2 (baseline Cr 1.3), improving',
    'Acute hypoxemic respiratory failure — extubated day 5',
    'Type 2 diabetes mellitus',
    'Thrombocytopenia, sepsis-related, resolving',
    'Anemia — transfused 2 units PRBC'
  ];

  const allergies = [
    { substance: 'Penicillin', reaction: 'Hives (documented 1994)', severity: 'Moderate' },
    { substance: 'Lisinopril', reaction: 'Cough', severity: 'Mild' }
  ];

  /* ============================================================
     Export
     ============================================================ */
  SR.mock = {
    NOW, ADMIT, T,
    catalog, series, meds, transfusions, cultures, reports,
    devices, procedures, dietOrders, codeStatus, activeOrders,
    bowelMovements, vteProphylaxis,
    patient, problems, allergies
  };
})(window.SR);
