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
| Version (four parts) | `1.0.1.0` | `pbiviz.json` → `visual.version` |
| Description | `Analyze any ordered process as a conversion funnel: stage-by-stage conversion, drop-off, absolute loss, and target benchmarks, with built-in data-quality diagnostics and full accessibility.` | `pbiviz.json` → `visual.description` |
| Support URL | `https://atlyn.io/contact` | `pbiviz.json` → `visual.supportUrl` |
| Author name | `Atlyn` | `pbiviz.json` → `author.name` |
| Author email | `atlyn.help@gmail.com` | `pbiviz.json` → `author.email` |
| API version | `5.11.0` | `pbiviz.json` → `apiVersion` |
| Visual icon | `assets/icon.png`, exactly 20x20 | `pbiviz.json` → `assets.icon` |
| Privileges | `[]` (no network, no downloads, no local storage) | `capabilities.json` → `privileges` |

The GUID is stable and must never change: it is already referenced by the Atlyn
storefront release manifest and by the published package download path.

Packaged artifact: `dist/atlynFunnelA1B2C3D4.1.0.1.0.pbiviz`, produced by
`npm run package` and byte-reproducible. The SHA-256 of the exact artifact you upload is
recorded in `release-manifest.json` → `package.sha256`.

Reproducibility holds *across platforms*, not just within one, and both halves of that are
deliberate:

- **Inputs.** `.gitattributes` sets `* text=auto eol=lf`, so every hashed text input —
  `pbiviz.json`, `capabilities.json`, `src/style.css`, `stringResources/**` — checks out
  with identical bytes on Windows and Linux. The PNGs are marked `binary` and are never
  filtered. A CRLF checkout would silently change the packaged bytes, so this is load
  bearing rather than cosmetic.
- **Archive.** `scripts/package.cjs` runs `pbiviz package` and then rewrites the result
  through `scripts/normalize-package.cjs`, which rebuilds the ZIP from scratch with JSZip:
  every entry — including the `resources/` directory entry — re-added in byte-sorted order
  with a fixed 1980-01-01 timestamp, DOS platform, fixed DOS permissions, DEFLATE level 9,
  and no implicitly created folders. Because the archive is rebuilt rather than patched,
  nothing the upstream packer chose about entry order, ordering of directory entries, or
  metadata survives into the output. The compressor is JSZip's bundled pako, pinned by
  `package-lock.json`, so the same implementation runs on every machine.

Verified rather than assumed: the same commit packaged on Windows with Node 24 and on
Ubuntu with Node 20 in CI produces identical bytes.

**Take the file you upload from a green CI run.** Every run publishes the packaged visual
as the `atlyn-funnel-pbiviz` artifact and prints its filename, SHA-256, and byte size to
the log and the run summary, so the value is recoverable without downloading anything.
That makes it unambiguous which binary the recorded hash describes and which one belongs
on the storefront. Note that GitHub wraps downloaded artifacts in a zip, so hash the
extracted `.pbiviz`, not the download.

Version `1.0.1.0` supersedes `1.0.0.0`. The `1.0.0.0` package that the Atlyn storefront
already distributes was built before the real 20x20 `assets/icon.png` landed, so its
bytes differ from anything this repository can rebuild. Rather than re-publish different
bytes under the same version number, the version was bumped: `1.0.0.0` stays frozen as
whatever is already published, and every artifact produced from this repository is
`1.0.1.0` or later. Upload and publish the `1.0.1.0` file only.

## 2. Offer listing fields

| Partner Center field | Final value |
| --- | --- |
| Offer name / display name | Atlyn Funnel |
| Publisher | Atlyn |
| Pricing | **AppSource listing: Free** — no transactable offer, no plans, no private offers |
| Support contact email | atlyn.help@gmail.com |
| Support URL | <https://atlyn.io/contact> |
| Privacy policy URL | <https://atlyn.io/legal/privacy> |
| Terms of use URL | <https://atlyn.io/legal/terms> |
| EULA | `EULA.md` in this repository (upload as the offer's licence terms) |
| GitHub / source URL | <https://github.com/garrett-hamers/powerbi-funnel-chart> |

**AppSource licensing is separate from the Atlyn subscription.** The visual is listed on
AppSource free of charge and must be published as a non-transactable offer: do not
configure plans, pricing, metered billing, or a Microsoft-managed licence. Monetisation
happens exclusively through the Atlyn storefront subscription (Stripe) at atlyn.io, which
is billed and enforced outside AppSource and outside this visual. Nothing in the visual
checks entitlement, calls a licence service, or degrades behaviour for non-subscribers.

`publication.json` pins this as `listing.pricing: "Free"` and
`listing.transactable: false`, and the certification audit fails if either changes.

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
| Visual icon | PNG, exactly 20x20 | `assets/icon.png` | 20x20 PNG, 241 bytes |
| Logo | PNG, exactly 300x300 | `assets/logo-300x300.png` | 300x300 PNG, 3,336 bytes |
| Screenshot 1 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/01-conversion-funnel.png` | 1366x768 PNG, 48,128 bytes |
| Screenshot 2 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/02-segment-comparison.png` | 1366x768 PNG, 66,841 bytes |
| Screenshot 3 | PNG, exactly 1366x768, ≤ 1024 KB | `assets/screenshots/03-diagnostics.png` | 1366x768 PNG, 51,599 bytes |

These are three separate, independently mandated sizes and the audit checks each one on
its own: the visual icon shown in the visualization pane is 20x20, the Partner Center
listing logo is 300x300, and every listing screenshot is 1366x768.

Exact byte sizes and SHA-256 hashes are regenerated into `release-manifest.json` →
`publicationAssets` by `npm run release-manifest`, and re-verified by
`npm run certification-audit`.

### How the visual icon is produced

`assets/icon.svg` remains the tracked source of the mark. `npm run icons`
(`scripts/build-icons.cjs`) parses its path, rasterises it at 20x20 with 16x16
supersampling, and encodes the PNG with `node:zlib` — no browser and no image library, so
the bytes are identical on every machine. The command refuses to write anything that is
not exactly 20x20 with real, non-uniform content.

### How the screenshots were produced

They are real renders of the packaged bundle, not mock-ups:

1. `npm run build` compiles `src/visual.ts`, and `npm run package` produces
   `dist/atlynFunnelA1B2C3D4.1.0.1.0.pbiviz`.
2. `npm run screenshots` (`scripts/capture-screenshots.cjs`) generates one offline HTML
   harness per scenario in `.tmp/screenshots/`. The harness reads the JS and CSS out of
   `dist/*.pbiviz` and inlines them, attaches a shadow root the way the Power BI host
   does, supplies a mock `IVisualHost`, and calls the packaged visual plugin with the
   literal data in `assets/sample-data/screenshot-scenarios.json`. The harness makes no
   network requests. `pbiviz package` runs its own build, so the packaged bundle is not
   byte-identical to `dist/visual.js`; the screenshots depict the artifact that is
   actually submitted.
3. A headless Chromium-family browser captures each page at
   `--window-size=1366,768 --force-device-scale-factor=1`.
4. Every emitted PNG is decoded and checked for exact dimensions and byte size before it
   is written to `assets/screenshots/`; an off-specification render fails the command
   instead of being committed.

Set `CHROME_PATH` if Chrome, Edge, or Chromium is not in a default install location. No
browser automation package is added to `package.json`, so `npm ci` and `npm audit` in CI
are unaffected.

### How small-tile behaviour is verified

Power BI hands a custom visual a fixed box and clips whatever does not fit, so a layout
whose regions cannot shrink loses the chart silently as the tile narrows. A test that
asserts the packaged stylesheet is non-empty passes on a completely broken layout, so this
repository measures instead.

`npm run layout-probe` (`scripts/layout-probe.cjs`) loads the same packaged bytes into the
same shadow-root harness and reads real geometry back with `getBoundingClientRect()` at
1280x620, 398x298, 258x198, 178x138 and 160x80 — the smallest size the stylesheet supports
— plus diagnostics, right-to-left, high-contrast and reduced-motion cases. It fails the
build when a box escapes the tile without a scrollable ancestor, when a region collapses or
hides content behind `overflow: hidden` with no route to it, when the funnel is pushed out
of view, when `text-overflow: ellipsis` is declared without `white-space: nowrap`, or when
keyboard focus, selection state, reduced motion, high contrast or RTL regress. CI runs it
on every push.

As the tile shrinks the visual drops chrome before data, in order: the heading that
repeats the tile title Power BI already renders, the intake figure, the verbose stage
sentence, the duplicate stage list, and finally the chart labels. The funnel stages, the
overall conversion metric and the data-quality diagnostics are never dropped, and every
figure that leaves the screen stays in the accessible table and in the accessible names.

## 4. Sample report — built as a PBIP project, one Desktop save from `.pbix`

Microsoft requires a sample report that works fully offline with no external
connections. **This repository does not contain a `.pbix`, and does not fake one.** A
`.pbix` embeds its data model as a binary Analysis Services backup image, which cannot
be produced headlessly.

Instead the repository ships the complete, ready-to-open equivalent as a **Power BI
Project (PBIP)** at `samples/atlyn-funnel-sample`, regenerated deterministically by
`npm run sample-report`:

```
samples/atlyn-funnel-sample/
├── AtlynFunnelSample.pbip
├── AtlynFunnelSample.Report/
│   ├── definition.pbir                     -> byPath reference to the local model
│   ├── definition/
│   │   ├── version.json
│   │   ├── report.json                     -> resourcePackages, CustomVisual
│   │   └── pages/
│   │       ├── pages.json
│   │       ├── conversionFunnel/           -> Stage, Value, Stage order, Target
│   │       ├── segmentComparison/          -> the above plus Segment in Group
│   │       └── dataQuality/                -> diagnostics table, no Stage order
│   └── CustomVisuals/atlynFunnelA1B2C3D4/  -> the built .pbiviz, unzipped
└── AtlynFunnelSample.SemanticModel/
    ├── definition.pbism
    └── definition/                         -> TMDL
        ├── database.tmdl
        ├── model.tmdl
        └── tables/*.tmdl                   -> DAX calculated tables
```

Two properties make it genuinely offline:

- **The visual is embedded, not fetched.** `report.json` declares a
  `resourcePackages` entry of type `CustomVisual` pointing at
  `atlynFunnelA1B2C3D4.pbiviz.json`, and the unzipped contents of the built
  `.pbiviz` live under `CustomVisuals/atlynFunnelA1B2C3D4/`. `publicCustomVisuals` is
  deliberately **not** used, because that resolves the visual from the AppSource store.
- **The model has no data source at all.** Both tables are DAX *calculated tables* whose
  partitions are inline `DATATABLE(...)` literals generated from the tracked CSVs. There
  is no Power Query partition, no data source object, and no connector or URL anywhere in
  the semantic model, so opening the project never prompts for credentials and there is
  nothing to refresh against. A blank stage is expressed as `BLANK()`, which
  [`DATATABLE` documents as a valid value](https://learn.microsoft.com/en-us/dax/datatable-function-dax).

No third-party tooling is involved. In particular **`pbi-tools` is not used and is not
required** — `pbi-tools compile` is broken against current Power BI Desktop packaging
APIs, and this project is produced by a dependency-free Node script and opened natively
by Desktop.

### Converting to `.pbix` — OWNER ACTION REQUIRED

1. In Power BI Desktop, enable two preview features under **File → Options and settings
   → Options → Preview features**: *Power BI Project (.pbip) save option* and *Store
   reports using enhanced metadata format (PBIR)*. Restart Desktop.
2. Open `samples/atlyn-funnel-sample/AtlynFunnelSample.pbip`. The report and its
   semantic model open together, and the Atlyn Funnel visual loads from the embedded
   package.
3. **Confirm the three pages render with data — do this before saving.** If any table
   shows as empty, or Desktop reports *"Some of the tables have incomplete or no data,"*
   run **Home → Refresh → Schema and data**, wait for it to finish, and re-check.

   Whether that refresh is needed here has not been tested. A PBIP caches no data — it
   stores the model *definition* only — so a project whose tables come from a Power Query
   `#table(...)` partition does open empty and must be refreshed. These tables are DAX
   `DATATABLE(...)` calculated tables instead, which the engine evaluates rather than
   fetching through Power Query, so Desktop may materialise them on open with no refresh
   at all. Either behaviour is fine; the check above is what matters. **Saving a `.pbix`
   whose tables are empty** means the funnel renders nothing and the submission fails
   review, because the sample exists to demonstrate the visual with data.

   Either way the project stays offline. If Desktop ever prompts for credentials,
   something external has crept into the model — stop and investigate rather than
   entering anything.
4. Check **File → Options and settings → Data source settings** — it should list no
   external sources at all.
5. **File → Save as** → `Power BI files (*.pbix)` → save as `Atlyn Funnel sample.pbix`.
6. Reopen the saved `.pbix` and confirm the three pages still render with data. This is
   what proves the `.pbix` carries the data rather than an empty model.
7. Upload that file as the offer's sample report in Partner Center.

The generated project is validated against Microsoft's published JSON schemas and by the
repository's own gates, but **it has not been opened in Power BI Desktop from this
repository** — no Desktop and no headless validator is available here. If Desktop reports
a problem with any file, that is the place to fix it.

Format versions are the ones Microsoft's own published projects use:
`definition.pbir` `4.0` and `definition.pbism` `4.0`, which are what permit the PBIR
`definition\` folder and the TMDL `definition\` folder respectively. Version `1.0` on
either file means the legacy single-file format instead.

The report definition schemas are pinned to versions a real Power BI Desktop build has
been observed to accept — `report` `2.1.0`, `page` `2.0.0`, `pagesMetadata` `1.0.0`,
`visualContainer` `2.7.0` — rather than to the newest versions Microsoft publishes.
Desktop rejects a report definition newer than the installed build supports, so a newer
published schema is not automatically a safer one. Do not raise any of them in
`scripts/build-sample-report.cjs` until Desktop has opened the result.

The underlying data is also still available as plain CSV for anyone who prefers to
rebuild the report by hand:

- `assets/sample-data/atlyn-funnel-sample.csv` — six-stage B2B funnel split across two
  segments (North America, EMEA) with `Stage`, `StageOrder`, `Segment`, `Value`,
  `Target`. Source of screenshots 1 and 2 and of the first two report pages.
- `assets/sample-data/atlyn-funnel-diagnostics-sample.csv` — an unordered funnel with a
  blank stage and a non-monotonic increase. Source of screenshot 3 and the third page.

## 5. Remaining owner-controlled steps

These cannot be completed from this repository:

1. **Save the sample `.pbix`** from the shipped PBIP project as described in section 4.
2. **Partner Center account.** Register or sign in to a Microsoft Partner Center account
   enrolled in the commercial marketplace program, and complete publisher verification
   and the tax/payout profile (required even for a free offer).
3. **Create the offer.** Partner Center → Marketplace offers → **New offer** →
   **Power BI visual**. Use offer ID `atlyn-funnel`.
4. **Properties.** Choose the analytics category, then either accept Microsoft's
   standard contract or upload `EULA.md` as custom licence terms. Enter
   <https://atlyn.io/legal/privacy> as the privacy policy URL. **Keep the offer free and
   non-transactable** — do not add plans or pricing; see section 2.
5. **Offer listing.** Paste the name, summary, and description from section 2; upload
   the 300x300 logo and the three 1366x768 screenshots from section 3; enter the support
   URL and support email.
6. **Technical configuration.** Upload `dist/atlynFunnelA1B2C3D4.1.0.1.0.pbiviz` and the
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
npm run sample-report
npm run release-manifest
npm run certification-audit
npm run audit
```

`npm run certification-audit` fails if the GUID changes, if the four-part version, the
description length, the https support URL, the free non-transactable listing, or the
Atlyn author identity regress, if the logo is not a real non-placeholder 300x300 PNG, if
a screenshot is missing or is not exactly 1366x768 and at most 1024 KB, if the EULA or
this dossier is missing or has drifted from the recorded hash, if the sample report
project loses a required part, binds a visual other than `atlynFunnelA1B2C3D4`, binds a
data role that does not exist in `capabilities.json`, or gains an external data source,
or if `release-manifest.json` no longer matches what is on disk.
