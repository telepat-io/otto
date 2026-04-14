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
