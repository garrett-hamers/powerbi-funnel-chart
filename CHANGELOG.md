# Changelog

All notable changes to Atlyn Funnel are documented here.

## Unreleased

- The screenshot capture now asserts what each scene actually drew, so a screenshot
  cannot be written unless the scene it claims to show really rendered. Previously
  `scripts/capture-screenshots.cjs` checked only that each PNG was exactly 1366x768 and
  under the 1024 KB Partner Center cap and never inspected the DOM, so an empty chart, a
  chart that failed to bind its data, or a chart whose content rendered outside the
  visible area would have passed every check and shipped as a submission asset. Static
  analysis of the finished PNG cannot close that gap — these funnels are a flat design
  whose correct renders carry only 261-330 distinct colours, so any colour or blankness
  floor loose enough to pass them also passes a nearly-blank wrong render, and
  pixel-diffing against goldens breaks on every Chrome, font and rasteriser change. The
  assertion is therefore made at capture time: Chromium writes the PNG and dumps the DOM
  in one invocation, `scripts/screenshot-content-agent.js` counts the scene's elements
  and measures their boxes in that same render, and
  `scripts/screenshot-scene-expectations.cjs` holds a separate expectation per scene —
  `01-conversion-funnel` requires six strictly narrowing valued stages, a bound Target
  and no diagnostics panel; `02-segment-comparison` requires two overall-conversion
  metrics and four labels and four stage rows for each of North America and EMEA, each
  segment narrowing on its own; `03-diagnostics` requires the diagnostics panel naming
  the inferred-order, blank-value and nonmonotonic findings, one dashed `blank` marker,
  no bar drawn for the blank stage, and the later stage visibly increasing. Presence
  alone is not enough, since the failure worth guarding against is an element that sits
  in the DOM the whole time it is broken while rendering at zero height, so every region
  that must be visible is measured with `getBoundingClientRect()` and clipped against
  both the tile the host gave the visual and the captured frame. A scene that fails is
  never written to `assets/screenshots/`, and its stale file is removed rather than left
  behind while the run reports success. `npm run screenshots:verify` runs the same gate
  without touching the committed assets, and CI runs it on every push.

- Fixed a small-tile layout defect that hid the funnel itself. The visual root stacked
  its regions with a `min-height: 80px` / `min-width: 160px` floor and no way to shrink,
  so as a tile narrowed the chrome above the chart wrapped onto more lines and pushed the
  funnel below the fold. Measured against the packaged bytes at 258x198, 745px of content
  was stacked into a 198px tile and the stage list was entirely out of view; at 160x80 the
  content grew to 1016px and **the funnel chart was 0% visible**. The root is now a flex
  column, every stacked region carries `min-height: 0`, and the size floors are gone. At
  every probed size the root content now equals the tile exactly and the chart is 100%
  visible without scrolling.
- Chrome now degrades before data. `data-narrow`, `data-short` and `data-tiny` are set
  from the host viewport — not from a media query, which sees the report page rather than
  the tile — and drop, in order: the heading that repeats the tile title Power BI already
  renders, the intake figure that is the funnel's first bar, the six-clause stage sentence
  (shortened; the accessible name keeps every figure), the duplicate stage list, and
  finally the chart labels. The funnel stages, the conversion metric and the data-quality
  diagnostics are never dropped.
- The chart canvas now tracks the real tile width. Its `viewBox` was pinned to a minimum
  of 320px, so on any tile narrower than that the browser scaled the whole drawing down —
  to 46% at 160px wide — shrinking every label below legibility instead of drawing a
  smaller funnel. Row height and the label gutter now adapt to the tile, and labels are
  truncated to the space that exists rather than overflowing it.
- Fixed keyboard focus loss on every re-render. Power BI mounts custom visuals in a shadow
  root, where `document.activeElement` resolves to the shadow host, so the visual never
  recognised its own focused control and dropped focus on every update. Focus now resolves
  through shadow roots, and arrow-key navigation falls back to the chart bars on tiles
  where the stage list has been dropped.
- Fixed right-to-left chart labels. `text-anchor` resolves against the inline base
  direction, so anchoring `start` at the left gutter hung every RTL label off the canvas.
- Added `npm run layout-probe`: it extracts the JS and CSS that ship inside
  `dist/*.pbiviz`, mounts them in a shadow root in an offline harness with a mock
  `IVisualHost`, and measures real geometry with `getBoundingClientRect()` across nine
  cases — five tile sizes down to the declared minimum, plus diagnostics, RTL, high
  contrast and reduced motion. It fails the build when a box escapes the tile without a
  scrollable ancestor, when a region collapses or clips content unreachably, when the
  funnel is pushed out of view, when `text-overflow: ellipsis` is declared without
  `white-space: nowrap`, or when focus, selection, reduced motion, high contrast or RTL
  regress. Asserting that `content.css` is non-empty passes on a broken layout; only
  measured boxes catch it. CI runs the probe and now also reports the packaged CSS byte
  count alongside the package hash.
- The screenshot harness and the layout probe both load the bytes from `dist/*.pbiviz`
  rather than `dist/visual.js`. `pbiviz package` runs its own build, so the two are not
  identical, and a listing screenshot must depict the artifact the customer receives. The
  committed 1366x768 screenshots were re-captured from the fixed build.

## 1.0.1.0 - 2026-08-04

- Bumped the visual version from `1.0.0.0` to `1.0.1.0` (`pbiviz.json` →
  `visual.version`, `package.json` → `version` `1.0.1`). The packaged artifact is now
  `atlynFunnelA1B2C3D4.1.0.1.0.pbiviz`. **This release supersedes the v1.0.0.0 storefront
  artifact**: the AppSource submission work replaced the visual icon and reworked
  `pbiviz.json`, so the package this repository builds no longer matches the bytes already
  published at the version-keyed path `funnel-chart/1.0.0.0/atlynFunnelA1B2C3D4.1.0.0.0.pbiviz`.
  Two different files must never share one version number, so `1.0.0.0` is frozen as
  whatever is already distributed and the storefront should be re-pointed at the
  `1.0.1.0` artifact. The visual GUID `atlynFunnelA1B2C3D4` is unchanged.
- Replaced the SVG visual icon with a real 20x20 `assets/icon.png`, generated from the
  tracked `assets/icon.svg` by `npm run icons`. The packaging plugin hardcodes
  `assets/icon.png` into the packaged manifest while base64-encoding whatever
  `assets.icon` points at, so the previous SVG produced a package that declared a PNG and
  embedded an `image/svg+xml` data URI. **This changes the packaged `.pbiviz` SHA-256**,
  which is why this release carries a new version number rather than re-publishing
  different bytes as `1.0.0.0`. The visual GUID is unchanged.
- CI now publishes the packaged visual as the `atlyn-funnel-pbiviz` artifact and prints its
  filename, SHA-256, and byte size to the log and the run summary, so the exact binary that
  belongs on the storefront is downloadable and its hash is readable from any green run
  without downloading it. Packaging was already platform-independent, by two mechanisms
  documented in the dossier: `.gitattributes` normalises every hashed text input to LF, and
  `scripts/normalize-package.cjs` rebuilds the archive from scratch with JSZip, re-adding
  every entry — the `resources/` directory entry included — in byte-sorted order with fixed
  timestamps, permissions, and compression level. The same commit packaged on Windows with
  Node 24 and on Ubuntu with Node 20 produces identical bytes.
- Pinned the sample report's PBIR schema versions to what Power BI Desktop actually
  accepts rather than to the newest versions Microsoft publishes: `report` drops from
  `3.0.0` to `2.1.0`, joining `page` `2.0.0`, `pagesMetadata` `1.0.0`, and
  `visualContainer` `2.7.0`. Desktop rejects a report definition newer than the installed
  build supports, and `3.0.0` had never been opened in Desktop. The `2.1.0` schema also
  types `themeCollection.baseTheme.reportVersionAtImport` as a version string rather than
  the `{visual, page, report}` object introduced at `3.0.0`, so the base theme now records
  `CY23SU04` / `5.46`, the pairing Desktop itself writes. Every generated project file was
  validated against its declared schema, with remote `$ref`s resolved.
- Documented a data check before saving the sample `.pbix`. A PBIP caches no data — it
  stores the model *definition* only — so a project whose tables come from a Power Query
  `#table(...)` partition opens empty and must be refreshed. These tables are DAX
  `DATATABLE(...)` calculated tables, which the engine evaluates rather than fetching
  through Power Query, so Desktop may materialise them on open instead; nobody has opened
  this project in Desktop, so neither behaviour is claimed. The instruction is therefore a
  check: confirm the pages render with data, and run **Home → Refresh → Schema and data**
  only if they do not. What is not optional is the outcome — a `.pbix` saved with empty
  tables renders no funnel and fails review — so a post-save reopen now verifies it. Added
  `samples/README.md` and expanded `docs/partner-center-submission.md` §4 accordingly.
- The certification audit now checks the three published image sizes independently:
  `assets/icon.png` exactly 20x20, `assets/logo-300x300.png` exactly 300x300, and every
  screenshot exactly 1366x768 within 1024 KB.

- Normalized the published identity to the Atlyn brand: `author.name` is `Atlyn`,
  `author.email` is `atlyn.help@gmail.com`, and `visual.supportUrl` points at
  <https://atlyn.io/contact>. The visual GUID is unchanged.
- Rewrote `visual.description` into listing-quality copy and gated its length.
- Added the AppSource media assets: three real 1366x768 renders of the built bundle in
  `assets/screenshots/`, produced by `npm run screenshots` from an offline mock-host
  harness, alongside the existing 300x300 logo.
- Added `EULA.md`, `docs/partner-center-submission.md`, `publication.json`, and the
  offline sample datasets in `assets/sample-data/`.
- Recorded the AppSource listing as free and non-transactable; monetisation stays with
  the separate Atlyn storefront subscription and is not enforced by the visual.
- Added the offline sample report project at `samples/atlyn-funnel-sample`, generated by
  `npm run sample-report`: a PBIR report plus a TMDL semantic model, with the built
  `.pbiviz` embedded through `resourcePackages` and both tables built as DAX calculated
  tables from inline `DATATABLE(...)` literals, so the model declares no data source at
  all. The required `.pbix` is one Power BI Desktop save away and is deliberately not
  stubbed.
- Extended the release manifest and certification audit to verify the submission assets
  deterministically: real non-placeholder PNG content, exact logo and screenshot
  dimensions, the 1024 KB screenshot budget, https listing URLs, and hash parity between
  the manifest and the tracked files.
- Pinned `hono` to `^4.12.34` through `overrides` to clear a transitive moderate
  advisory so the required `npm audit` gate passes again.
- The Partner Center sample `.pbix` remains an owner-controlled manual step and is
  deliberately not stubbed; the repository ships the complete PBIP project it is saved
  from.

## 1.0.0 - 2026-08-01

- Added ordered Stage/Value conversion metrics with optional StageOrder, Target,
  Group, and tooltip fields.
- Added deterministic diagnostics for blanks, zero and negative values, invalid
  numeric inputs, duplicate stages or orders, nonmonotonic sequences, reduced
  windows, and segmented host data.
- Added accessible keyboard, list, table, tooltip, selection, context-menu,
  high-contrast, RTL, localization, reduced-motion, and mobile behavior.
- Added persisted formatting-model settings, fail-closed PBIVIZ packaging, and
  certification audit and dependency gates.

Microsoft certification and live-host validation are not claimed by this
repository.
