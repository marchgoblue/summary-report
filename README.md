# Summary Report — SMART on FHIR (Demo)

A SMART on FHIR (R4) web application that turns raw EHR data into four focused, physician-oriented summary views. This initial version is **demo only**: it ships with a richly simulated critically-ill patient (**Perry Cox**) and requires no server, build step, or credentials — open it and it works. The same code paths are wired for a real SMART on FHIR launch against the Epic sandbox when the demo period ends.

**Live demo:** https://marchgoblue.github.io/summary-report/

## The four reports (tabs)

| Tab | Focus |
| --- | --- |
| **ICU** | Accordion of vitals, drips (pressor doses), labs, intake & output, cultures, medication administrations, blood component administration (PRBC/platelets with times), respiratory support. Sections drag-to-reorder; sections *and* individual parameters can be included/excluded (Customize layout). |
| **Cardiology** | CHF view — I/O vs diuretic dosing, daily weights, BNP, renal function; NSTEMI view — troponin trend, latest + prior angiography and echocardiography reports, ECG links, cardiac med orders. |
| **Infectious Disease** | Temperature curve, WBC, lactate, CRP, procalcitonin, full culture data with susceptibilities, current/recent antibiotics as a course timeline, device-related infection risk. |
| **Quality** | Current diet, DVT + stress-ulcer prophylaxis, last bowel movement + laxatives in last 72 h, glycemic range + insulin/diabetes orders, code status, LDAs (central line, Foley, ETT, art line) with dwell-time alerts. |

### Shared tooling on every tab
- **Trends graph** — click the graph button next to *any* vital, lab, drip dose, or I/O value to plot it. Plot many at once; **each distinct unit gets its own Y-axis** (e.g. MAP mmHg + lactate mmol/L + norepinephrine mcg/kg/min on one chart).
- **Time window** — 4 h to 7 d, with resolution from **every 15 minutes up to daily** aggregation.
- **Customize layout** — drag sections into any order, hide sections or individual rows; preferences persist locally per tab.

## Running locally

No build step. Either double-click `index.html`, or serve statically:

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Connecting to Epic (after the demo period)

The app already uses [`fhirclient`](https://github.com/smart-on-fhir/client-js) and hydrates from FHIR R4 when launched via SMART:

1. Register the app at [vendorservices.epic.com](https://vendorservices.epic.com) (or open.epic.com for the public sandbox). Launch URL: `launch.html`; Redirect URI: `index.html`.
2. Put your non-production client ID in `launch.html`.
3. Launch from the Epic sandbox (`iss = https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4`). When a SMART context is present the app pulls live data; otherwise it falls back to the demo patient.

### FHIR resources used (all available in Epic's R4 sandbox)

| Data on screen | FHIR resource |
| --- | --- |
| Vitals, labs, I/O, glucose, weights | `Observation` (LOINC-coded; vital-signs / laboratory / flowsheet) |
| Med doses, drips, antibiotics, laxatives, insulin | `MedicationAdministration`, `MedicationRequest` |
| Cultures & susceptibilities | `DiagnosticReport` (MB) / `Observation` |
| Echo, cath, ECG, imaging reports | `DiagnosticReport`, `DocumentReference` |
| Problems, allergies | `Condition`, `AllergyIntolerance` |
| Lines/drains/airways | `Device`, `Procedure` |
| Diet | `NutritionOrder` |
| Demographics, encounter | `Patient`, `Encounter` |

### Data provenance — nothing is overpromised

Every value on screen falls into exactly one of three classes, and the UI says which:

1. **Direct FHIR** — shown as returned. Report narratives (echo, cath, ECG, imaging) are quoted **verbatim** from `DiagnosticReport.conclusion`; the app never interprets them.
2. **Derived in app** (marked with an *ƒ derived* chip or noted in hover tooltips) — deterministic calculations over fetched FHIR data: peaks/trends this admission, pre-admission baseline creatinine (median of historical outpatient results), urine output in the 12h after a diuretic dose, last Hgb/platelet count before each transfusion, organism matching across cultures, device dwell times, prophylaxis supporting factors. No LLM, no external calls — nothing leaves the browser.
3. **Site-configured** (violet badge) — real Epic data that requires per-institution setup rather than vanilla FHIR R4: code status, I&O / vent settings / CVP (flowsheet-row Observations), LDA tracking, bowel documentation, blood-product administration feeds, discrete LVEF (LOINC 10230-1 where mapped).

Hover any parameter name or snapshot tile for its exact source (resource + LOINC, or the derivation).

## The demo patient

**Perry Cox** — 58 M, HFrEF (EF 30%), CAD s/p PCI, T2DM, CKD 2 — admitted 7 days ago with *E. coli* urosepsis → septic shock (norepinephrine + vasopressin, intubated), AKI on CKD, sepsis-related thrombocytopenia (2 u PRBC + 1 u platelets), demand NSTEMI on day 2 → DES to mid-LAD day 3, flash pulmonary edema → diuresis, extubated day 5, now improving on ceftriaxone (day 5 of 14). All data are deterministically generated at load time with physiologic arcs and noise — vitals q15 min, labs on realistic draw schedules, hourly I/O, dose-by-dose med administrations — so every view is fully populated at any time window.

**All patient data in this repository are simulated. No real health information.**

## Stack

Plain HTML/CSS/JS (no build), [Chart.js](https://www.chartjs.org/) for multi-axis trends, [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop, [fhirclient](https://docs.smarthealthit.org/client-js/) for SMART on FHIR.
