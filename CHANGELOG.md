# Changelog

All notable TypeOpen changes are recorded here.

## 0.1.2 — Unreleased

Release-hardening and native UX parity.

- Restored normal macOS window dragging for the WKWebView titlebar and persisted the main window frame between launches.
- Added a standard macOS Window menu and resolved shortcut conflicts so Paragraph/Format commands match the reference workflow without colliding with TypeOpen zoom controls.
- Added current-section highlighting to the document outline while scrolling.
- Added TypeOpen-owned rich-mode HTML comment nodes so inline and block `<!-- ... -->` comments round-trip losslessly instead of forcing Source mode.
- Added a staged TriHerm Homebrew Cask/tap layout plus a deterministic cask version/checksum sync script.

## 0.1.1 — 2026-10-09

Lightweight native macOS release.

- Replaced the default Electron package with an original Swift/AppKit + system WKWebView shell while preserving the existing React renderer and `window.typeopen` bridge contract.
- Removed bundled Chromium/Node/Electron runtime payload from the default application and DMG.
- Added native file dialogs, menus, file associations, dirty-close lifecycle, clipboard/Finder integration, WebKit PDF/PNG/print rendering and Pandoc execution.
- Added a confined `typeopen://app/` renderer scheme so packaged ES modules run under WKWebView without broad `file:` access.
- Hardened native path grants, TextBundle/image I/O and local custom-theme CSS against symlink swaps and escaped remote-resource constructs.
- Switched production renderer builds to the macOS 13 / Safari 16 syntax floor and stopped shipping production source maps.
- Updated the application icon to the TypeOpen flame monogram.
- Kept the previous Electron shell only as an explicit development/migration fallback.

## 0.1.0 — 2026-10-09

Initial open-source macOS release.

- Live Markdown editing with source mode, outline, folder tree, article list and search.
- Multi-document tabs with dirty-state protection, Save All and safe close behavior.
- Recent/reopen/quick-open workflows plus Reveal in File Tree and Open File Location.
- Duplicate, Rename and Move To operations for saved files and complete TextBundle packages.
- Markdown tables, task lists, fenced code, YAML front matter, links and images.
- Task Status toggling, live `[TOC]`, canonical paired GFM footnotes, and rich highlight/superscript/subscript formatting.
- KaTeX math plus Mermaid, sequence and flowchart previews.
- Focus, Typewriter and Read-only modes.
- Editable TextBundle packages with bundle-local assets.
- PDF, HTML and PNG export, plus optional Pandoc import/export formats.
- Page Setup controls for paper size, orientation and margins across PDF export and printing.
- Local custom CSS themes with external-resource/executable CSS rejection.
- Native macOS menus, recent documents, spellcheck, substitutions and speech integration.
- Clear Format, heading promotion/demotion and list indent/outdent through the editor engine's command APIs.
- Main-process path grants, realpath-safe TextBundle payloads, HTTP(S)-only external navigation and renderer-safe local image previews.
- Source-mode protection for HTML comments so unsupported rich-comment semantics cannot silently lose Markdown content.
- Clean-room REA-assisted compatibility inventory; no proprietary reference code or assets are distributed.
