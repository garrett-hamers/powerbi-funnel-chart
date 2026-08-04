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
npm run release-manifest
npm run certification-audit
npm run audit
```

The stable visual GUID is `atlynFunnelA1B2C3D4`. `capabilities.json` intentionally
declares `privileges: []`; the visual uses no network access, external assets, or
custom download APIs. Certification and real-host validation are not claimed by
this repository. Packaging normalizes PBIVIZ ZIP entry timestamps and DEFLATE
settings, so the release-manifest SHA-256 is reproducible from identical source.
Partner Center publication assets include a tracked deterministic
`assets/logo-300x300.png` derived from `assets/icon.svg`.
The full dependency audit and certification audit are required release gates.
