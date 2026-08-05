# Atlyn Funnel

Atlyn Funnel is a certification-first Power BI custom visual for ordered conversion
and bottleneck analysis.

## Data contract

- **Stage** (required grouping): the process stage.
- **Value** (required measure): the stage volume or amount.
- **StageOrder** (optional measure): numeric order; ties are diagnosed.
- **Target** (optional measure): stage benchmark.
- **Group** (optional grouping): segment.
- **Tooltips** (optional, up to five): additional detail fields.

StageOrder is authoritative. Without it, the visual preserves model/query order and
shows an inferred-order warning. It never alphabetically sorts, sorts by value, or
top-reduces an intermediate stage. Zero and blank values remain distinct. The visual
shows overall conversion, stage conversion, drop rate, absolute loss, target, and
diagnostics for duplicate ordering, invalid numeric inputs, blanks, negative values,
and nonmonotonic data. Zero and negative StageOrder values are valid numeric order
values; blank or invalid orders remain after valid orders in preserved model order.
The host supplies an ordered window of up to 50 category rows per segment; the visual
reports omitted rows when its own group window is exceeded and labels host-reduced or
segmented data as partial. Measure format strings are honored in chart labels, the
accessible table, and tooltips. Negative or invalid Values never become
positive-width bars. A separate 500-row total render cap protects the host DOM for
large grouped datasets; any omitted rows are explicitly diagnosed as an ordered
window.

## Development

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run layout-probe
npm run release-manifest
npm run certification-audit
npm run audit
```

The stable visual GUID is `atlynFunnelA1B2C3D4`. `capabilities.json` intentionally
declares `privileges: []`; the visual uses no network access, external assets, or
custom download APIs. Certification and real-host validation are not claimed by
this repository. Packaging normalizes PBIVIZ ZIP entry timestamps and DEFLATE
settings, so the release-manifest SHA-256 is reproducible from identical source.
The full dependency audit and certification audit are required release gates.

## AppSource publication assets

`publication.json` is the single source of truth for the AppSource listing. It names
the support, privacy, and terms URLs, the tracked media assets, and the Partner Center
size constraints. `npm run release-manifest` re-emits those facts, with byte sizes and
SHA-256 hashes, into `release-manifest.json`, and `npm run certification-audit` fails if
anything drifts from what is on disk.

| Asset | Path |
| --- | --- |
| Visual icon (20x20 PNG) | `assets/icon.png`, generated from `assets/icon.svg` by `npm run icons` |
| Logo (300x300 PNG) | `assets/logo-300x300.png` |
| Screenshots (1366x768 PNG, ≤ 1024 KB) | `assets/screenshots/` |
| EULA | `EULA.md` |
| Submission dossier | `docs/partner-center-submission.md` |
| Offline sample report project (PBIP) | `samples/atlyn-funnel-sample/` |
| Offline sample data | `assets/sample-data/` |

The three image sizes are independently mandated and independently checked: the visual
icon is exactly 20x20, the listing logo exactly 300x300, and every screenshot exactly
1366x768 within a 1024 KB budget.

The screenshots are real renders of the built bundle, regenerated with:

```powershell
npm run build
npm run package
npm run screenshots
```

`npm run screenshots` builds one offline harness page per scenario in `.tmp/screenshots`
— the JS and CSS are read out of `dist/*.pbiviz` and inlined, a shadow root reproduces the
Power BI style boundary, and a mock `IVisualHost` supplies the literal data in
`assets/sample-data/screenshot-scenarios.json` — then drives a headless Chromium-family
browser at exactly 1366x768. `pbiviz package` runs its own build, so the packaged bundle
is not byte-identical to `dist/visual.js`, and a listing screenshot has to depict the
artifact the customer actually receives. Set `CHROME_PATH` if Chrome, Edge, or Chromium is
not in a default install location. No browser automation package is added to
`package.json`, so `npm ci` and `npm audit` are unaffected.

## Small-tile layout probe

Power BI gives a custom visual a fixed box and clips whatever does not fit, so a layout
that stacks regions which cannot shrink loses the chart silently as the tile narrows.
`npm run layout-probe` measures that instead of assuming it:

```powershell
npm run build
npm run package
npm run layout-probe
```

It loads the same packaged bytes into the same shadow-root harness and reads real geometry
back with `getBoundingClientRect()` at five tile sizes — 1280x620, 398x298, 258x198,
178x138 and 160x80, the smallest size the stylesheet supports — plus diagnostics, RTL, high
contrast and reduced-motion cases. The build fails when a box escapes the tile without a
scrollable ancestor, when a region collapses or hides content behind `overflow: hidden`
with no route to it, when the funnel is pushed out of view, when `text-overflow: ellipsis`
is declared without `white-space: nowrap`, or when keyboard focus, selection state,
reduced motion, high contrast or RTL regress. A test that only asserts the stylesheet is
non-empty passes on a completely broken layout; only measured boxes catch it.

**Small viewports and overflowing content are different tests.** Content that fits never
scrolls, and a region that never scrolls passes every scroll assertion vacuously — so the
probe also runs fixtures built to overflow (twelve stages across six segments, 72 rows)
and scrolls every scrollable region to 0%, 25%, 50% and 100% before measuring again. Those
scenarios are marked `expectOverflow`, and the run fails loudly if they ever stop
overflowing rather than passing in silence.

The probe also reports every non-static element together with the containing block it
resolves against, and fails when an `absolute` or `fixed` element resolves outside the
visual root — a root that computes `position: static` anchors nothing, so such an element
escapes the root's `overflow` entirely and only appears contained by luck. After each
scroll it checks that sticky header offsets stay strictly increasing and all distinct, and
that absolutely positioned children move with the scroller containing them. This visual
declares no `position: sticky`; the probe records the sticky count so that remains a
measured fact rather than an assumption.

Chrome degrades before data. As the tile shrinks the visual drops, in order, the heading
that duplicates the tile title, the intake figure, the verbose stage sentence, the stage
list, and finally the chart labels. The funnel stages, the conversion metric and the
data-quality diagnostics always survive, and every figure that leaves the screen remains
in the accessible table and the accessible names.

The Partner Center sample `.pbix` is **not** in this repository: a `.pbix` embeds its
data model as a binary Analysis Services backup image and cannot be produced headlessly.
Instead the equivalent Power BI Project ships at `samples/atlyn-funnel-sample`, generated
deterministically by:

```powershell
npm run build
npm run package
npm run sample-report
```

It is a PBIR-format report plus a TMDL semantic model. The visual is embedded from the
built `.pbiviz` through `resourcePackages` rather than `publicCustomVisuals`, and both
tables are DAX calculated tables built from inline `DATATABLE(...)` literals — the model
declares **no data source at all**, so the project opens with no credential prompt and
nothing to refresh. No third-party tooling is used or required. Turning it into the
required `.pbix` is a one-time **File → Save as** in Power BI Desktop;
`docs/partner-center-submission.md` records that step and every other remaining manual
action.
