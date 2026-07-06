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

> Note: a few items (code status, some flowsheet rows like bowel movements and LDA properties) vary by institution in how they're exposed via FHIR (e.g. Epic `Flag`, flowsheet-backed `Observation`s). The UI renders whatever is available and degrades gracefully when a resource isn't returned.

## The demo patient

**Perry Cox** — 58 M, HFrEF (EF 30%), CAD s/p PCI, T2DM, CKD 2 — admitted 7 days ago with *E. coli* urosepsis → septic shock (norepinephrine + vasopressin, intubated), AKI on CKD, sepsis-related thrombocytopenia (2 u PRBC + 1 u platelets), demand NSTEMI on day 2 → DES to mid-LAD day 3, flash pulmonary edema → diuresis, extubated day 5, now improving on ceftriaxone (day 5 of 14). All data are deterministically generated at load time with physiologic arcs and noise — vitals q15 min, labs on realistic draw schedules, hourly I/O, dose-by-dose med administrations — so every view is fully populated at any time window.

**All patient data in this repository are simulated. No real health information.**

## Stack

Plain HTML/CSS/JS (no build), [Chart.js](https://www.chartjs.org/) for multi-axis trends, [SortableJS](https://sortablejs.github.io/Sortable/) for drag-and-drop, [fhirclient](https://docs.smarthealthit.org/client-js/) for SMART on FHIR.
