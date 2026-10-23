<p align="center">
  <img src="build/icon.png" width="112" height="112" alt="TypeOpen app icon" />
</p>

# TypeOpen

**A lightweight, open-source Markdown editor for macOS.**

Write in a live, formatted Markdown editor, switch to the source whenever you need full control, and navigate your documents without leaving your writing flow. TypeOpen is an independent, Typora-style Markdown editor for Apple Silicon Macs, built with Swift/AppKit, WKWebView and a React/Lexical editing surface.

[![Download TypeOpen for macOS](https://img.shields.io/badge/Download-TypeOpen%20for%20macOS-111111?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/TriHerm/TypeOpen/releases/latest)
[![Homebrew](https://img.shields.io/badge/Homebrew-Install-FBB040?style=for-the-badge&logo=homebrew&logoColor=000000)](#install-with-homebrew)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue?style=for-the-badge)](LICENSE)

## The writing workflow

- **Live Markdown editing:** work directly with formatted headings, lists, tables, links, images and code; your document is saved as Markdown.
- **Source Code Mode:** move between rich editing and raw Markdown when syntax matters.
- **Document navigation:** use the folder tree, document tabs and outline to find the next section quickly.
- **Native macOS distribution:** a small Swift/AppKit shell uses the system WKWebView rather than bundling Chromium. The current release is Apple Silicon only.

TypeOpen is developed independently and is **not affiliated with Typora**. It does not attempt to claim feature-for-feature parity; see the [feature and compatibility matrix](docs/PARITY_MATRIX.md) for supported behavior and known gaps.

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

## Full feature list

<details>
<summary>Expand supported editor, navigation, formatting, and export features</summary>

- Live WYSIWYG Markdown editing with Markdown as the persisted format.
- Source Code Mode backed by CodeMirror.
- Headings, lists, task lists with Task Status toggling, block quotes, tables, links, images, YAML front matter and fenced code.
- Live `[TOC]` blocks and canonical paired GFM footnotes in rich and source editing workflows.
- Canonical GitHub-style Alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) with rich editing, slash insertion and styled export.
- CommonMark reference-style links (`[label][ref]`, `[label][]`, `[label]` plus definitions) render as links in rich mode and preserve their definitions; Source Mode remains the literal destination/title editing surface.
- Rich highlight, superscript and subscript formatting plus lossless inline/block HTML comments.
- Inline and block TeX math rendered with KaTeX.
- Mermaid, sequence and legacy flowchart previews inside fenced code blocks.
- Folder file tree, article list and document outline; the native runtime can create/rename/trash files and folders, refresh the tree, sort by name, modification time or creation time, optionally show hidden files, and reveal selected assets in Finder without promoting images into editable-document authority.
- Open Folder remembers the last successfully chosen folder as a chooser starting-location hint only; it does not reopen the folder or restore folder authority across launches.
- Multi-document tabs with per-document dirty state, Save All, safe close prompts and next/previous tab navigation.
- Native recent documents, reopen-closed history, Open Quickly, Reveal in File Tree and Open File Location.
- Files, Articles and Open Quickly support optional relative exclusion globs for hiding generated or noisy entries without changing folder authority or Search in Folder.
- Explicit **Restore Previous Session** for clean saved tabs; missing, replaced or symlinked paths are skipped, and no folder grant is restored implicitly.
- Duplicate, Rename and Move To for saved local documents, including complete TextBundle package operations.
- Editable TextBundle packages (`.textbundle`) with payload-preserving saves and bundle-local assets.
- Focus Mode, Typewriter Mode and Read-only Mode.
- Optional Typora-style bracket/quote auto-pairing in the rich editor, including closer-skip and empty-pair Backspace behavior; Source Mode keeps CodeMirror's native pairing and continues bullet, ordered and task-list markers on Enter.
- Rich Markdown typing shortcuts convert completed `==highlight==` and `~~strikethrough~~` markers without adding delimiter auto-pairing; MDXEditor continues to own the existing bold/italic/code/link transforms.
- Explicit Markdown hard breaks survive rich/source round-trips; two-space hard breaks may canonicalize to the equivalent backslash form rather than silently becoming soft line breaks.
- Fenced code blocks with line numbers, Tab/Shift-Tab and native Paragraph Indent/Outdent commands, wrapping, per-block language selection and a configurable default language for newly inserted fences.
- After a code block language is changed, newly inserted code blocks reuse that language for the rest of the current app session; this does not rewrite the persisted default-language preference.
- Document outline with hierarchical or flat presentation, configurable H1–H6 depth, branch collapse/expand, Expand All / Collapse All and active-heading reveal.
- Literal/regex find and replace with case/whole-word controls, recursive folder search, spell checking, word/character stats and optional autosave.
- Native macOS **Edit → Substitutions** controls for smart quotes, smart dashes and text replacement, delegated to WKWebView rather than implemented as Markdown-rewriting transforms.
- Private unsaved-buffer recovery plus native external-file conflict detection and **Reload from Disk**; recovered buffers reopen without filesystem write authority and require an explicit Save As, stale recovery is cleared immediately once all documents are clean, and clean saved tabs can be restored only through an explicit identity-revalidated session action.
- Light, dark and system appearance settings plus independently selected local custom CSS for Light/Dark editor appearances; existing single custom themes migrate to both slots and System follows macOS appearance changes. External-resource/executable CSS remains blocked.
- Built-in export appearance can match the editor or force Light/Dark for TypeOpen HTML, PDF, PNG and print rendering without injecting custom editor CSS.
- Page Setup for Letter/A4/Legal/A5/Tabloid, portrait/landscape orientation, per-side margins and optional new-page starts for top-level H1 headings after the first. The heading rule is print-only, so PNG and onscreen HTML stay continuous.
- Compact right-click TypeOpen commands plus a searchable `/` command palette for common Markdown blocks.
- PDF, HTML, style-free HTML and PNG export, plus **Export with Previous** to repeat the current document's last successful export format during the app session while still choosing the destination normally.
- DOCX, ODT, RTF, EPUB, LaTeX and MediaWiki export when Pandoc is installed.
- Import of supported Pandoc document formats into Markdown when Pandoc is installed.

</details>

See [`docs/PARITY_MATRIX.md`](docs/PARITY_MATRIX.md) for the exact feature/evidence status and known gaps.

## Feedback and contributions

Found an issue or want to suggest a feature? Use [GitHub Issues](https://github.com/TriHerm/TypeOpen/issues). Contributions are welcome; read [CONTRIBUTING.md](CONTRIBUTING.md) and the [architecture notes](docs/ARCHITECTURE.md) before making changes.

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

The verified `0.1.7` Apple Silicon release is about **10.5 MiB installed** and **4.6 MB as a DMG**, down from the Electron-based `0.1.0` package that was roughly 194 MB as a DMG.

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
