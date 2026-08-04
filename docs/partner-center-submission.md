# Atlyn Funnel — Partner Center / AppSource submission dossier

This document records the concrete value for every input Microsoft requires when
submitting the Atlyn Funnel Power BI custom visual to AppSource, and the steps that are
still owner-controlled.

Microsoft's requirements are published at
<https://learn.microsoft.com/en-us/power-bi/developer/visuals/office-store>.

**Nothing in this repository claims that the visual has been submitted, reviewed,
certified, or published.** This dossier describes readiness only.

## 1. Package metadata (`pbiviz.json`)

| Requirement | Final value | Source of truth |
| --- | --- | --- |
| Visual name | `atlynFunnel` | `pbiviz.json` → `visual.name` |
| Display name | `Atlyn Funnel` | `pbiviz.json` → `visual.displayName` |
| GUID | `atlynFunnelA1B2C3D4` | `pbiviz.json` → `visual.guid` |
| Version (four parts) | `1.0.0.0` | `pbiviz.json` → `visual.version` |
| Description | `Analyze any ordered process as a conversion funnel: stage-by-stage conversion, drop-off, absolute loss, and target benchmarks, with built-in data-quality diagnostics and full accessibility.` | `pbiviz.json` → `visual.description` |
| Support URL | `https://atlyn.io/contact` | `pbiviz.json` → `visual.supportUrl` |
| Author name | `Atlyn` | `pbiviz.json` → `author.name` |
| Author email | `atlyn.help@gmail.com` | `pbiviz.json` → `author.email` |
| API version | `5.11.0` | `pbiviz.json` → `apiVersion` |
| Privileges | `[]` (no network, no downloads, no local storage) | `capabilities.json` → `privileges` |

The GUID is stable and must never change: it is already referenced by the Atlyn
storefront release manifest and by the published package download path.

Packaged artifact: `dist/atlynFunnelA1B2C3D4.1.0.0.0.pbiviz`, produced by
`npm run package` and byte-reproducible (ZIP timestamps and DEFLATE level are
normalised). The SHA-256 of the exact artifact you upload is recorded in
`release-manifest.json` → `package.sha256`.

## 2. Offer listing fields

| Partner Center field | Final value |
| --- | --- |
| Offer name / display name | Atlyn Funnel |
| Publisher | Atlyn |
| Support contact email | atlyn.help@gmail.com |
| Support URL | <https://atlyn.io/contact> |
| Privacy policy URL | <https://atlyn.io/legal/privacy> |
| Terms of use URL | <https://atlyn.io/legal/terms> |
| EULA | `EULA.md` in this repository (upload as the offer's licence terms) |
| GitHub / source URL | <https://github.com/garrett-hamers/powerbi-funnel-chart> |

All listing URLs live in `publication.json` and are re-emitted into
`release-manifest.json` → `publication` on every release build, so the manifest and the
listing cannot drift apart silently.

### Suggested listing copy

**Summary (short description).** Ordered conversion funnel with stage conversion,
drop-off, absolute loss, target benchmarks, and built-in data-quality diagnostics.

**Description (long).** Atlyn Funnel turns any ordered process — marketing to revenue,
sign-up to activation, application to approval, quote to cash — into a conversion
funnel you can act on. Every stage reports overall conversion, stage-to-stage
conversion, drop rate, and absolute loss, with an optional target benchmark per stage
and an optional Group field for side-by-side segment comparison.

Stage order is explicit and authoritative: supply a numeric Stage order field and the
funnel follows your process, never an alphabetical or value-based re-sort. When the
data is imperfect, the visual says so instead of hiding it — blanks, zeros, negative
values, non-numeric inputs, duplicate stages, duplicate or missing order values,
non-monotonic sequences, and host-reduced or segmented data are each surfaced as an
explicit diagnostic.

Atlyn Funnel is built for regulated and accessibility-conscious deployments: full
keyboard navigation, screen-reader landmarks and an accessible data table, high
contrast support, right-to-left layouts, reduced-motion support, and localisation.
It declares no privileges, makes no network calls, loads no external scripts, and never
transmits your data anywhere.

## 3. Media assets

| Asset | Requirement | File | Actual |
| --- | --- | --- | --- |
| Logo | PNG, exactly 300x300 | `assets/logo-300x300.png` | 300x300 PNG, 3,336 bytes |
| Screenshot 1 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/01-conversion-funnel.png` | 1366x768 PNG, 48,128 bytes |
| Screenshot 2 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/02-segment-comparison.png` | 1366x768 PNG, 66,841 bytes |
| Screenshot 3 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/03-diagnostics.png` | 1366x768 PNG, 51,599 bytes |

Exact byte sizes and SHA-256 hashes are regenerated into `release-manifest.json` →
`publicationAssets` by `npm run release-manifest`, and re-verified by
`npm run certification-audit`.

### How the screenshots were produced

They are real renders of the built bundle, not mock-ups:

1. `npm run build` compiles `src/visual.ts` into `dist/visual.js` and `dist/visual.css`.
2. `npm run screenshots` (`scripts/capture-screenshots.cjs`) generates one offline HTML
   harness per scenario in `.tmp/screenshots/`. The harness inlines the built bundle and
   stylesheet, attaches a shadow root the way the Power BI host does, supplies a mock
   `IVisualHost`, and calls `Visual.update()` with the literal data in
   `assets/sample-data/screenshot-scenarios.json`. The harness makes no network
   requests.
3. A headless Chromium-family browser captures each page at
   `--window-size=1366,768 --force-device-scale-factor=1`.
4. Every emitted PNG is decoded and checked for exact dimensions and byte size before it
   is written to `assets/screenshots/`; an off-specification render fails the command
   instead of being committed.

Set `CHROME_PATH` if Chrome, Edge, or Chromium is not in a default install location. No
browser automation package is added to `package.json`, so `npm ci` and `npm audit` in CI
are unaffected.

## 4. Sample report (`.pbix`) — OWNER ACTION REQUIRED

Microsoft requires a sample `.pbix` that works fully offline with no external
connections. **This repository does not contain one, and does not fake one.** A `.pbix`
can only be authored by Power BI Desktop.

The data needed to build it in a few minutes is committed:

- `assets/sample-data/atlyn-funnel-sample.csv` — six-stage B2B funnel split across two
  segments (North America, EMEA) with `Stage`, `StageOrder`, `Segment`, `Value`,
  `Target` columns. This is the source of screenshots 1 and 2.
- `assets/sample-data/atlyn-funnel-diagnostics-sample.csv` — an unordered funnel with a
  blank stage and a non-monotonic increase. This is the source of screenshot 3.

Steps:

1. Open Power BI Desktop → **Get data** → **Text/CSV** → import both CSV files. Choose
   **Import** (not DirectQuery) so the report has no live connection.
2. Add the Atlyn Funnel visual to the report page (**Insert** → **More visuals** →
   **Import a visual from a file** → `dist/atlynFunnelA1B2C3D4.1.0.0.0.pbiviz`).
3. Page 1 — "Conversion funnel": from the first table, put `Stage` in **Stage**,
   `Value` in **Value**, `StageOrder` in **Stage order**, `Target` in **Target**.
4. Page 2 — "Segment comparison": same field wells, plus `Segment` in **Group**.
5. Page 3 — "Data quality": from the diagnostics table, put `Stage` in **Stage** and
   `Value` in **Value**, leaving **Stage order** empty so the diagnostics panel appears.
6. Save as `Atlyn Funnel sample.pbix`. Confirm **File → Options and settings → Data
   source settings** lists only the two local CSV imports and that the report renders
   with the network disconnected.
7. Upload that file as the offer's sample report in Partner Center.

## 5. Remaining owner-controlled steps

These cannot be completed from this repository:

1. **Create the sample `.pbix`** as described in section 4.
2. **Partner Center account.** Register or sign in to a Microsoft Partner Center account
   enrolled in the commercial marketplace program, and complete publisher verification
   and the tax/payout profile (required even for a free offer).
3. **Create the offer.** Partner Center → Marketplace offers → **New offer** →
   **Power BI visual**. Use offer ID `atlyn-funnel`.
4. **Properties.** Choose the analytics category, then either accept Microsoft's
   standard contract or upload `EULA.md` as custom licence terms. Enter
   <https://atlyn.io/legal/privacy> as the privacy policy URL.
5. **Offer listing.** Paste the name, summary, and description from section 2; upload
   the 300x300 logo and the three 1366x768 screenshots from section 3; enter the support
   URL and support email.
6. **Technical configuration.** Upload `dist/atlynFunnelA1B2C3D4.1.0.0.0.pbiviz` and the
   sample `.pbix`.
7. **Submit for review** and respond to validation feedback. Microsoft's review outcome
   is not predictable from this repository, and certification (the separate, stricter
   process) is a distinct opt-in request after publication.

## 6. Verification

Every mechanical requirement above is enforced deterministically. Run:

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run release-manifest
npm run certification-audit
npm run audit
```

`npm run certification-audit` fails if the GUID changes, if the four-part version, the
description length, the https support URL, or the Atlyn author identity regress, if the
logo is not a real non-placeholder 300x300 PNG, if a screenshot is missing or is not
exactly 1366x768 and at most 1024 KB, if the EULA or this dossier is missing or has
drifted from the recorded hash, or if `release-manifest.json` no longer matches what is
on disk.
