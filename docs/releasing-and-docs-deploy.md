---
title: Releasing and Docs Deploy
sidebar_position: 2
description: How to build and deploy the Otto docs site, release packages via Release Please, and deploy extension assets.
keywords:
  - releasing
  - docs deploy
  - release please
  - GitHub Pages
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

## Release Please package versioning

Release management is handled by `.github/workflows/release-please.yml` using
`release-please-config.json` and `.release-please-manifest.json`.

- Managed components include CLI, relay, protocol, and extension.
- All component versions are kept in sync via a single `.` (root) package entry
  in the release-please config with `include-component-in-tag: false`, so all
  packages share one `v<version>` tag (for example `v0.8.5`).
- The `extra-files` list in the release-please config ensures `package.json`
  version fields and `.version` files for CLI, relay, protocol, and extension
  are all bumped together, along with internal `@telepat/*` dependency pins.

When a release PR is opened, expect version bumps and internal `@telepat/*`
dependency updates to be included together.

## Workflow trigger and job flow

The `release-please.yml` workflow triggers on every **push to `main`**. Not
every push produces a publish — the workflow uses job-level guards to ensure
publish and extension upload only run when a new release is created.

### Job 1: `release-please`

Runs the `googleapis/release-please-action@v4`. This job either:

- **Creates or updates** a release PR (no new release yet — no downstream
  publish).
- **Creates a GitHub release** when a release PR is merged (sets
  `releases_created: true` and `.--release_created: true`).

When release-please does **not** create a release, a **reconcile** step checks
for merged PRs that still carry the `autorelease: pending` label. If a merged
release PR was missed by release-please (for example, due to a race or v4 tag
skipping), the reconcile step creates the missing tag and GitHub release
manually, then relabels the PR `autorelease: tagged`.

### Job 2: `determine-release-tag`

Acts as a gate for downstream jobs. It checks three conditions in order:

1. **release-please created a release** (`cli_release_created == 'true'`):
   outputs the new tag from release-please.
2. **reconcile recovered a stuck PR** (`reconciled_tag` is non-empty): outputs
   the reconciled tag.
3. **Neither** (ordinary push with no new release): outputs an empty string,
   which causes all downstream jobs to skip.

This gate is what prevents `publish-packages` and `upload-extension-assets`
from running on every push to `main`. Only a genuine new release or a
successfully reconciled stuck release produces a non-empty `release_tag`.

### Job 3: `publish-packages`

Runs only when `release_tag != ''`. Checks out the release tag, runs full
package quality gates (typecheck, lint, build, test) for protocol, relay, and
CLI, then publishes all three packages to npm with provenance.

Publishing validates that each package version matches the release tag version
before proceeding.

### Job 4: `upload-extension-assets`

Runs only when `release_tag != ''`. Checks out the release tag, builds the
extension, runs extension quality gates (typecheck, lint, build, test), zips
the extension, and uploads the `.zip` and `.sha256` checksum to the
`v<version>` GitHub release.

### Flow diagram

```
push to main
  │
  ▼
release-please job
  ├── release PR created/updated → no downstream publish
  ├── release created (merge!)   → cli_release_created=true
  └── no release, reconcile step → reconciled_tag=vX.Y.Z (or empty)
        │
        ▼
determine-release-tag job
  ├── release_created=true → tag=vX.Y.Z  ──► publish-packages
  │                                           └─► upload-extension-assets
  ├── reconciled tag      → tag=vX.Y.Z  ──► publish-packages
  │                                           └─► upload-extension-assets
  └── neither             → tag=             ✔ (skips publish & upload)
```

## Why not `on: release` or `on: push: tags`?

The workflow intentionally avoids `on: release` or `on: push: tags` triggers to
avoid cross-workflow chaining. Using a single workflow triggered by
`on: push: branches: [main]` with internal job gates means:

- All release steps (tag creation, npm publish, extension upload) happen in one
  workflow run with one `GITHUB_TOKEN`. No PAT is needed.
- The `determine-release-tag` gate ensures only actual release events trigger
  publish, while ordinary pushes to main exit early at the gate.
- The reconcile step catches cases where release-please v4 skips tag creation
  for merged PRs, without requiring a separate recovery workflow.
