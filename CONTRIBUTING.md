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
changes.

## Pull requests

Use a focused branch based on the latest `main`. Include regression coverage for
behavior changes and explain any host API assumptions. Do not describe local
tests as Microsoft certification or live-host validation.
