# Sample report

`atlyn-funnel-sample/` is a Power BI Project (PBIP) that demonstrates the Atlyn Funnel
visual on three pages: a conversion funnel, a segment comparison, and a data-quality
diagnostics page. It is generated deterministically by `npm run sample-report` and is
**not** hand-edited — anything you change here is overwritten on the next run.

It is the source for the sample `.pbix` that Partner Center requires. The full submission
context is in [`../docs/partner-center-submission.md`](../docs/partner-center-submission.md).

## Opening it, and saving it as `.pbix`

1. In Power BI Desktop, enable **File → Options and settings → Options → Preview
   features → *Power BI Project (.pbip) save option*** and ***Store reports using
   enhanced metadata format (PBIR)***. Restart Desktop.
2. Open `atlyn-funnel-sample/AtlynFunnelSample.pbip`.
3. **Confirm the three pages render with data.** If any table shows as empty, or Desktop
   reports *"Some of the tables have incomplete or no data,"* run **Home → Refresh →
   Schema and data**, wait for it to finish, and re-check.
4. **File → Save as** → `Power BI files (*.pbix)`.
5. Reopen the saved `.pbix` and confirm the pages still render with data.

### Why step 3 is a check rather than a fixed step

A PBIP caches no data — it stores the model *definition* only. A project whose tables come
from a Power Query `#table(...)` partition therefore opens empty and has to be refreshed
before it holds anything. These tables are DAX `DATATABLE(...)` calculated tables instead,
which the engine evaluates rather than fetching through Power Query, so Desktop may
materialise them on open with no refresh at all. **Nobody has opened this project in
Desktop, so neither behaviour is asserted here.** Check, and refresh only if the check
fails.

What is not optional is the outcome: **a `.pbix` saved with empty tables** renders no
funnel and fails AppSource review, since the sample exists to demonstrate the visual with
data. Step 5 is what proves the saved file is not that.

Either way the project stays offline. Both tables are inline `DATATABLE(...)` literals, so
there is no data source, no connector, and nothing on the network to reach — **File →
Options and settings → Data source settings** lists nothing at all, before or after any
refresh. If Desktop ever prompts for credentials, something external has crept into the
model: stop and investigate rather than entering anything.

## Format versions

The report definition schemas are pinned in `scripts/build-sample-report.cjs` to versions
a real Power BI Desktop build has been observed to accept: `report` `2.1.0`, `page`
`2.0.0`, `pagesMetadata` `1.0.0`, `visualContainer` `2.7.0`. Desktop rejects a report
definition newer than the installed build supports, so a newer schema published on
developer.microsoft.com is not automatically a safer one. Do not raise any of these until
Desktop has opened the result.
