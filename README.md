# TypeOpen

TypeOpen is a TriHerm Labs open-source desktop Markdown editor for macOS focused on a clean live editing workflow: write Markdown while seeing a rendered document, switch to source when needed, navigate a folder/outline, and export to common document formats.

This project is an independent clean-room implementation. It does not contain Typora source code, decompiled function bodies, icons, themes, license/update mechanisms, or proprietary assets. REA was used locally to inventory user-visible behavior from a legally supplied application bundle; the reference application and raw REA evidence are explicitly excluded from Git and release artifacts.

## Current capabilities

- Live WYSIWYG Markdown editing with Markdown as the persisted format.
- Source Code Mode backed by CodeMirror.
- Headings, lists, task lists with Task Status toggling, block quotes, tables, links, images, YAML front matter and fenced code.
- Live `[TOC]` blocks and canonical paired GFM footnotes in rich and source editing workflows.
- Rich highlight, superscript and subscript formatting; HTML comments are kept source-only so rich serialization cannot silently discard them.
- Inline and block TeX math rendered with KaTeX.
- Mermaid, sequence and legacy flowchart previews inside fenced code blocks.
- Folder file tree, article list and document outline.
- Multi-document tabs with per-document dirty state, Save All, safe close prompts and next/previous tab navigation.
- Native recent documents, reopen-closed history, Open Quickly, Reveal in File Tree and Open File Location.
- Duplicate, Rename and Move To for saved local documents, including complete TextBundle package operations.
- Editable TextBundle packages (`.textbundle`) with payload-preserving saves and bundle-local assets.
- Focus Mode, Typewriter Mode and Read-only Mode.
- Find/replace, spell checking, word/character stats and optional autosave.
- Light, dark and system appearance settings plus explicitly selected local custom CSS themes with external-resource/executable CSS blocked.
- Page Setup for Letter/A4/Legal/A5/Tabloid, portrait/landscape orientation and per-side margins used by PDF export and printing.
- PDF, HTML, style-free HTML and PNG export.
- DOCX, ODT, RTF, EPUB, LaTeX and MediaWiki export when Pandoc is installed.
- Import of supported Pandoc document formats into Markdown when Pandoc is installed.

See [`docs/PARITY_MATRIX.md`](docs/PARITY_MATRIX.md) for the exact feature/evidence status and known gaps.

## Requirements

- macOS 13 or newer for the current Electron 44 target.
- Node.js 22.12+ (Node 26 is used for the current development build).
- npm 11+.
- Optional: Pandoc 2+ for advanced import/export formats.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

Production renderer build:

```bash
npm run build
```

## macOS package

Build an ad-hoc signed local Apple Silicon DMG:

```bash
npm run dmg
```

Build a universal DMG when both Electron architectures are available:

```bash
npm run dmg:universal
```

Release artifacts are written to `release/`. Local builds use ad-hoc signing so bundle integrity can be verified without private credentials. A public Gatekeeper-friendly distribution still requires an Apple Developer ID Application certificate plus Apple notarization credentials.

## Verification

```bash
npm run verify
npm run dmg
npm run verify:dist
```

`verify` checks the clean-room tracked-file boundary, Electron/CommonJS syntax, TypeScript, tests, renderer build and runtime dependency audit. `verify:dist` verifies the ad-hoc app signature, Apple Silicon architecture, bundle identifier, DMG checksum/mount, mounted app, and absence of local reference/evidence or signing-secret material from the packaged ASAR. `audit:runtime` fails at moderate severity or higher; the current dependency graph has no runtime moderate/high/critical advisories. See [`docs/RELEASING.md`](docs/RELEASING.md) for the full release procedure. For a public Developer ID release, additionally run Apple's `codesign`, `spctl`, `notarytool` and `stapler` verification steps.

## Architecture

- Electron main process: local files, native dialogs, menus, printing/export and macOS integration.
- Sandboxed preload: a minimal whitelisted IPC bridge.
- React renderer: TypeOpen shell, sidebar, preferences, find/replace and status surfaces.
- MDXEditor/Lexical: live Markdown editor surface.
- KaTeX, Mermaid and flowchart.js: math/diagram rendering.
- Pandoc: optional external adapter for advanced document conversion.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for process boundaries, document handling and release isolation.

## Licensing

TypeOpen is licensed under Apache License 2.0. Direct dependency licenses are summarized in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); the lockfile is the authoritative build dependency inventory.

## Clean-room boundary

Development notes are in [`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md). The proprietary reference artifact (`Typora.app/`), `.rea-evidence/`, local `.env` secrets and signing credentials are ignored and are additionally rejected by release verification; they must never be committed or included in releases.
