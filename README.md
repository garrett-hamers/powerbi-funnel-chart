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

### Capture-time content assertions

Size and byte budget are necessary but nowhere near sufficient. An empty chart, a chart
that failed to bind its data, and a chart whose content rendered outside the visible area
are all correctly sized PNGs under the cap, so those checks alone would commit any of them
as a submission asset. Inspecting the finished PNG cannot close that gap either: this
funnel is a flat design whose correct renders carry only 261-330 distinct colours, so any
colour or blankness floor loose enough to pass them would also pass a nearly-blank wrong
render, and pixel-diffing against goldens breaks on every Chrome, font and rasteriser
change.

So the content is asserted while the scene is still rendered, when it is still known what
was supposed to be drawn. Chromium writes the PNG and dumps the DOM in the same
invocation, so `scripts/screenshot-content-agent.js` measures the very render the
screenshot shows, and `scripts/screenshot-scene-expectations.cjs` gives each scene its own
expectation:

| Scene | Must show |
| --- | --- |
| `01-conversion-funnel` | 6 valued stages that strictly narrow, 6 labels, 1 overall-conversion metric, a bound Target, and **no** diagnostics panel |
| `02-segment-comparison` | 8 bars, **2** overall-conversion metrics, and 4 labels and 4 stage rows for each of North America and EMEA, each segment narrowing on its own |
| `03-diagnostics` | the diagnostics panel naming the inferred-order, blank-value and nonmonotonic findings, one dashed `blank` marker, no bar drawn for the blank stage, and the later stage visibly increasing |

The expectations are deliberately different from one another, because one shared check
would catch neither a missing second segment nor missing diagnostics. Alongside the counts
every region that has to be visible is measured with `getBoundingClientRect()` and clipped
against both the tile the host gave the visual and the captured frame, since the failure
worth guarding against is an element that sits in the DOM the whole time it is broken while
rendering at zero height. A scene that fails is never written to `assets/screenshots`, and
its stale file is removed rather than left behind reporting success.

`npm run screenshots:verify` runs every assertion without touching `assets/screenshots`,
which is how CI gates scene content without turning a runner's font stack into committed
byte churn.

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
