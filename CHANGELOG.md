# Changelog

All notable TypeOpen changes are recorded here.

## 0.1.6 — 2026-10-10

Theme consistency and code-editor contrast.

- Unified the built-in Light and Dark palettes and mapped MDXEditor surfaces to TypeOpen theme tokens so editor controls no longer fall back to a white surface in Dark mode.
- Added theme-aware CodeMirror backgrounds, gutters, active-line/selection states, language menus and syntax colors for rich code blocks and Source mode.
- Added regression coverage for MDXEditor palette mapping and AA contrast of primary, secondary and comment text in code surfaces.

## 0.1.5 — 2026-10-10

Navigation polish and project attribution.

- Smoothed sidebar collapse/expand, active tab reveal and outline tracking while honoring macOS reduced-motion preferences.
- Added short microtransitions for navigation states without adding persistent animation or visual chrome.
- Replaced the About toast with a compact About panel that credits TriHerm Labs first and Fernando Abishai secondarily, and added a non-invasive TriHerm Labs link under Help.

## 0.1.4 — 2026-10-10

Editor command surfaces.

- Added a compact native **TypeOpen** submenu to the macOS right-click menu while preserving the platform Copy/Paste/Spelling items.
- Added a searchable slash command palette in rich-text mode with a deliberately small default set plus filtered access to tables, images, math, TOC, footnotes and front matter.
- Added keyboard navigation for slash commands and regression coverage for command filtering/parsing and the native context-menu integration.

## 0.1.3 — 2026-10-10

Window-drag hotfix.

- Replaced the WKWebView-dependent window-event interception with an AppKit-owned transparent drag surface above the inert titlebar region, so WebKit can no longer swallow drag gestures.
- Added a native hit-testing regression smoke that verifies the toolbar stays interactive, the drag region owns the intended titlebar area, and the region remains pinned correctly after resize.

## 0.1.2 — 2026-10-10

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
