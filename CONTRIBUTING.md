# Contributing

## Development

Use Node.js supported by the repository and install the locked dependency tree:

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

Keep the visual deterministic and certification-safe. Do not add network
requests, external assets, privileges, unsafe DOM APIs, or value/alphabetical
reduction. Preserve the stable GUID and update `CHANGELOG.md` for user-visible
changes. The package wrapper normalizes PBIVIZ ZIP metadata; do not bypass it
when producing a release hash.

## Pull requests

Use a focused branch based on the latest `main`. Include regression coverage for
behavior changes and explain any host API assumptions. Do not describe local
tests as Microsoft certification or live-host validation.

When a pull request mentions an issue it is **not** resolving, reference it as a
bare `#123`. GitHub's linked-issue parser matches the keyword and ignores the
sentence around it, so `does not fix #123` and `this does not close #123` both
close the issue on merge — the wording written to prevent the misreading is the
wording that causes it. This has already closed a live defect report here, one
second after the merge that said it was leaving it open.
