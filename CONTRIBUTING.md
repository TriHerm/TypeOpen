# Contributing to TypeOpen

TypeOpen is an independent open-source Markdown editor. Contributions must preserve the clean-room boundary used by the project.

## Development workflow

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run audit:runtime
```

Keep changes small enough to review and keep Markdown compatibility covered by focused tests when behavior changes.

## Clean-room rule

Do not commit or paste proprietary application binaries, decompiled function bodies, private assets, icons, themes, license/update code, credentials, or raw reverse-engineering databases into TypeOpen. Behavioral observations may be turned into neutral compatibility requirements and then implemented independently.

The local reference application and REA working data are intentionally ignored as `Typora.app/` and `.rea-evidence/`. Release verification also rejects those names from the packaged application.

## Licensing

By contributing code, documentation, or assets to this repository, you agree that your contribution can be distributed under the Apache License 2.0. New dependencies must have licenses compatible with TypeOpen distribution and should be reflected in `THIRD_PARTY_NOTICES.md` when they are direct runtime dependencies.
