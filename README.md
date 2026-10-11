<p align="center">
  <img src="build/icon.png" width="128" height="128" alt="TypeOpen logo" />
</p>

# TypeOpen

TypeOpen is a TriHerm Labs open-source desktop Markdown editor for macOS focused on a clean live editing workflow: write Markdown while seeing a rendered document, switch to source when needed, navigate a folder/outline, and export to common document formats.

[![Download latest DMG](https://img.shields.io/badge/Download-Latest%20DMG-111111?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/TriHerm/TypeOpen/releases/latest)

The default macOS build uses a small Swift/AppKit shell with the system WKWebView rather than bundling Chromium. This keeps the application in the same lightweight architectural class as native WebKit editors while preserving TypeOpen's React/Lexical editor surface.

This project is an independent clean-room implementation. It does not contain Typora source code, decompiled function bodies, icons, themes, license/update mechanisms, or proprietary assets. REA was used locally to inventory user-visible behavior from a legally supplied application bundle; the reference application and raw REA evidence are explicitly excluded from Git and release artifacts.

## Current capabilities

- Live WYSIWYG Markdown editing with Markdown as the persisted format.
- Source Code Mode backed by CodeMirror.
- Headings, lists, task lists with Task Status toggling, block quotes, tables, links, images, YAML front matter and fenced code.
- Live `[TOC]` blocks and canonical paired GFM footnotes in rich and source editing workflows.
- Canonical GitHub-style Alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) with rich editing, slash insertion and styled export.
- CommonMark reference-style links (`[label][ref]`, `[label][]`, `[label]` plus definitions) render as links in rich mode and preserve their definitions; Source Mode remains the literal destination/title editing surface.
- Rich highlight, superscript and subscript formatting plus lossless inline/block HTML comments.
- Inline and block TeX math rendered with KaTeX.
- Mermaid, sequence and legacy flowchart previews inside fenced code blocks.
- Folder file tree, article list and document outline; the native runtime can create/rename/trash files and folders, refresh the tree, and sort by name or modification time.
- Multi-document tabs with per-document dirty state, Save All, safe close prompts and next/previous tab navigation.
- Native recent documents, reopen-closed history, Open Quickly, Reveal in File Tree and Open File Location.
- Duplicate, Rename and Move To for saved local documents, including complete TextBundle package operations.
- Editable TextBundle packages (`.textbundle`) with payload-preserving saves and bundle-local assets.
- Focus Mode, Typewriter Mode and Read-only Mode.
- Optional Typora-style bracket/quote auto-pairing in the rich editor, including closer-skip and empty-pair Backspace behavior; Source Mode keeps CodeMirror's native pairing and continues bullet, ordered and task-list markers on Enter.
- Fenced code blocks with line numbers, Tab indentation, wrapping, per-block language selection and a configurable default language for newly inserted fences.
- Hierarchical document outline with branch collapse/expand, Expand All / Collapse All and active-heading reveal.
- Literal/regex find and replace with case/whole-word controls, recursive folder search, spell checking, word/character stats and optional autosave.
- Private unsaved-buffer recovery plus native external-file conflict detection and **Reload from Disk**; recovered buffers reopen without filesystem write authority and require an explicit Save As.
- Light, dark and system appearance settings plus explicitly selected local custom CSS themes with external-resource/executable CSS blocked.
- Page Setup for Letter/A4/Legal/A5/Tabloid, portrait/landscape orientation and per-side margins used by PDF export and printing.
- Compact right-click TypeOpen commands plus a searchable `/` command palette for common Markdown blocks.
- PDF, HTML, style-free HTML and PNG export.
- DOCX, ODT, RTF, EPUB, LaTeX and MediaWiki export when Pandoc is installed.
- Import of supported Pandoc document formats into Markdown when Pandoc is installed.

See [`docs/PARITY_MATRIX.md`](docs/PARITY_MATRIX.md) for the exact feature/evidence status and known gaps.

## Install with Homebrew

Homebrew is the recommended installation path for TypeOpen on Apple Silicon Macs:

```bash
brew install --cask triherm/tap/typeopen
```

The Cask is maintained in the public [`TriHerm/homebrew-tap`](https://github.com/TriHerm/homebrew-tap) repository and tracks the matching immutable GitHub release artifact.

TypeOpen is currently ad-hoc signed and not notarized. Homebrew keeps macOS quarantine enabled, so Gatekeeper may block the first launch. If you trust the release, open TypeOpen once and approve it through **System Settings → Privacy & Security → Open Anyway**.

You can also download the current Apple Silicon DMG directly from [GitHub Releases](https://github.com/TriHerm/TypeOpen/releases/latest).

## Requirements

- macOS 13 or newer.
- Apple Silicon (`arm64`) for the current public release.
- Optional: Pandoc 2+ for advanced import/export formats.

For development from source, use Node.js 22.12+, npm 11+, and Xcode Command Line Tools with `swiftc`.

## Development

```bash
npm ci
npm run typecheck
npm test
npm run dev
```

`npm run dev` builds and launches the native WKWebView application. The previous Electron shell remains in the repository temporarily as a migration fallback and can be launched with `npm run dev:electron` while native parity is being validated.

Production renderer build:

```bash
npm run build
```

## macOS package

Build an ad-hoc signed local Apple Silicon DMG:

```bash
npm run dmg
```

Build just the native application bundle:

```bash
npm run pack
```

The native application is written to `release/native-arm64/TypeOpen.app`; the compressed image is `release/TypeOpen-<version>-arm64.dmg`. The shell links only system AppKit/WebKit frameworks and reuses the compiled Vite renderer, so it does not package Chromium, Node.js, Electron Framework, or an ASAR. Local builds use ad-hoc signing so bundle integrity can be verified without private credentials. A public Gatekeeper-friendly distribution still requires an Apple Developer ID Application certificate plus Apple notarization credentials.

The verified `0.1.6` Apple Silicon release is about **10.3 MiB installed** and **4.5 MB as a DMG**, down from the Electron-based `0.1.0` package that was roughly 194 MB as a DMG.

The retained Electron fallback can still be packaged explicitly with `npm run pack:electron`, `npm run dmg:electron`, or `npm run dmg:electron:universal`. Those commands are migration aids rather than the default distribution path.

## Verification

```bash
npm run verify
npm run dmg
npm run verify:dist
```

`verify` checks the clean-room tracked-file boundary, native Swift typechecking, the retained Electron/CommonJS fallback syntax, TypeScript, tests, renderer build and dependency audit. `verify:dist` verifies the native ad-hoc app signature, Apple Silicon architecture, bundle identifier, DMG checksum/mount, mounted app, required renderer/bridge resources, and absence of Electron packaging or local reference/evidence material from the native bundle. See [`docs/RELEASING.md`](docs/RELEASING.md) for the full release procedure. For a public Developer ID release, additionally run Apple's `codesign`, `spctl`, `notarytool` and `stapler` verification steps.

## Architecture

- Swift/AppKit host: native window lifecycle, dialogs, menus, file associations, printing/export and macOS integration.
- WKWebView bridge: a small injected `window.typeopen` adapter with an allowlisted request surface and main-frame-only native message handling.
- React renderer: TypeOpen shell, sidebar, preferences, find/replace and status surfaces.
- MDXEditor/Lexical: live Markdown editor surface.
- KaTeX, Mermaid and flowchart.js: math/diagram rendering.
- Pandoc: optional external adapter for advanced document conversion.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for process boundaries, document handling and release isolation.

## Licensing

TypeOpen is licensed under Apache License 2.0. Direct dependency licenses are summarized in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md); the lockfile is the authoritative build dependency inventory.

## Clean-room boundary

Development notes are in [`docs/REVERSE_ENGINEERING.md`](docs/REVERSE_ENGINEERING.md). The proprietary reference artifact (`Typora.app/`), `.rea-evidence/`, local `.env` secrets and signing credentials are ignored and are additionally rejected by release verification; they must never be committed or included in releases.
