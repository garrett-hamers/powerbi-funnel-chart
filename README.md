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
diagnostics for duplicate ordering, blanks, negative values, and nonmonotonic data.
The visual displays an ordered window of up to 50 stages per group and reports omitted
rows when the host supplies more data; segmented host data is labeled partial. Measure
format strings are honored in chart labels, the accessible table, and tooltips.

## Development

```powershell
npm ci
npm test
npm run typecheck
npm run lint
npm run build
npm run package
npm run audit
```

The stable visual GUID is `atlynFunnelA1B2C3D4`. `capabilities.json` intentionally
declares `privileges: []`; the visual uses no network access, external assets, or
custom download APIs. Certification and real-host validation are not claimed by
this repository. The production dependency audit is clean; the development-only
Power BI packaging toolchain currently reports transitive moderate/low advisories
that would require a breaking major tool upgrade.
