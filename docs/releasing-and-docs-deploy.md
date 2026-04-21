---
title: Releasing and Docs Deploy
sidebar_position: 2
---

## Build docs locally

```bash
npm run docs:build
npm run docs:serve
```

## Local development mode

```bash
npm run docs:start
```

## Deployment variables

Docusaurus configuration supports:

- DOCS_URL (default https://docs.telepat.io)
- DOCS_BASE_URL (default /otto/)
- GITHUB_OWNER (default telepat-io)
- GITHUB_REPO (default otto)
- GH_PAGES_BRANCH (default gh-pages)

Use DOCS_LOCAL=true for localhost base path.

## Release please package versioning

Release management is handled by `.github/workflows/release-please.yml` using
`release-please-config.json` and `.release-please-manifest.json`.

- Managed components include CLI, relay, protocol, and extension.
- The `linked-versions` plugin keeps those components on the same release version.
- The `node-workspace` plugin updates internal workspace dependency versions in
	release PRs (for example, extension `@telepat/otto-protocol` dependency pins).

When a release PR is opened, expect version bumps and internal `@telepat/*`
dependency updates to be included together.

## Release execution flow

Release execution is consolidated in `.github/workflows/release-please.yml`.
When a Release PR is merged and release-please creates the semver CLI release
tag (`v<version>`), the same workflow run also:

- publishes `@telepat/otto-protocol`, `@telepat/otto-relay`, and `@telepat/otto`
	to npm after package quality gates pass.
- builds, tests, zips, and uploads extension artifacts (`.zip` and `.sha256`) to
	the same `v<version>` GitHub release.

This design avoids release-event workflow chaining (`on: release`) so release
automation works with the default `GITHUB_TOKEN` and does not require a PAT for
cross-workflow triggering.
