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
bare number with no verb in front of it. GitHub's linked-issue parser matches the
keyword and ignores the sentence around it, so a phrase of the form
`does not fix #NNN` closes the issue on merge — the wording written to prevent
the misreading is the wording that causes it.

Two details that are easy to get wrong, both learned by getting them wrong here:

- **The commit message is the surface that matters**, not only the pull request
  body. A squash merge scans the commit message, so a body that references issues
  carefully does not help if the message does not.
- **Quoting is not escaping.** The phrase cannot be reproduced safely even inside
  an explanation of why it is dangerous. Quotation marks, backticks and
  surrounding prose are all invisible to the parser — which is why the paragraph
  above uses a placeholder rather than an example.

This has closed a live defect report in this repository twice: once by a pull
request that said it was leaving the issue open, and once by the pull request
that documented the first occurrence.

Everything above is avoidance, and avoidance is forgettable. **After merging a
pull request that mentions an issue you are not resolving, list the open issues
and confirm it is still there.** Both closes here were noticed only because an
issue count moved during a check being run for something else; neither announced
itself, and both recorded a reason of `COMPLETED`. Checking the outcome catches
this regardless of which surface or wording caused it, which no amount of care
with the wording can promise.
