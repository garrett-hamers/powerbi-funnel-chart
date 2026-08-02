# Security Policy

## Supported versions

Security fixes are targeted at the latest version on the `main` branch.

## Reporting a vulnerability

Do not disclose a suspected vulnerability in a public issue. Email
`garrett.hamers@gmail.com` with a concise description, reproduction steps, and
the affected commit or package version. Do not include credentials, customer
data, or other sensitive information.

This visual intentionally declares no privileges, performs no network requests,
uses no external JavaScript or assets, and builds its DOM with safe APIs.

## Dependency hygiene

Pull requests must run `npm ci`, the full test and lint gates, `npm audit`, and
the certification audit before review.
