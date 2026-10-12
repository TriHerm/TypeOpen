# Changelog

All notable TypeOpen changes are recorded here.

## Unreleased

Replacement-workflow reliability and file navigation.

- Added private recovery snapshots for dirty/imported buffers; interrupted work returns as pathless recovered documents instead of silently restoring filesystem authority.
- Added native external-file change detection, conflict-gated autosave/Save, Reload from Disk, macOS-coordinated existing-file writes and revision-checked descriptor-bound replacement.
- Added Whole Word and regular-expression controls to document find/replace and recursive folder search.
- Added compact native file-tree actions for creating files/folders, renaming, refreshing, sorting and safely moving items to the user Trash; sensitive sidebar mutations remain disabled in the retained Electron migration fallback.
- Added optional rich-text auto-pairing for brackets and quotes with closer-skip and empty-pair Backspace behavior; Source Mode keeps CodeMirror's native pairing and now continues bullet, ordered and task-list markers on Enter while leaving code blocks untouched.
- Added a configurable default language for newly inserted fenced code blocks while retaining CodeMirror's existing line numbers, Tab indentation, wrapping and per-block language selector.
- Routed native Paragraph Indent / Outdent commands (including ⌘[ / ⌘]) to the focused CodeMirror editor before falling back to Lexical list indentation, so fenced code and Source Mode retain block/selection indentation inside the native app.
- Added a hierarchical collapsible document outline with branch toggles, Expand All / Collapse All controls and automatic ancestor expansion when the active heading changes.
- Added outline presentation preferences for flat versus hierarchical navigation and a maximum visible heading level from H1 through H6, while preserving full-document heading navigation and active-section tracking.
- Added canonical GitHub-style Alerts (`NOTE`, `TIP`, `IMPORTANT`, `WARNING`, `CAUTION`) as editable rich blocks with exact Markdown round-trip, slash-command insertion and styled HTML/PDF/PNG/Print output.
- Added CommonMark reference-style links in rich mode for full, collapsed and shortcut forms, preserving definitions and shared/unused references while keeping destination/title editing literal in Source Mode.
- Hardened unsaved-buffer recovery lifecycle so the host cannot clear a valid startup snapshot before it is loaded, stale dirty snapshots are removed immediately once all open documents are clean, and the native loader rejects unsafe recovery-file indirection.
- Added explicit **Restore Previous Session** for clean saved tabs. The host persists only already-authorized clean file intent plus captured file/parent identity; loading the manifest grants nothing, and restore revalidates identity before granting and reading each surviving tab. Folder authority is not restored.
- Completed rich Markdown typing shortcuts for `==highlight==` and `~~strikethrough~~` using Lexical's public transformers; existing bold/italic/code/link shortcuts remain owned by MDXEditor and Source Mode stays literal.
- Preserved Markdown hard-break semantics across rich/source round-trips. Backslash and two-space hard breaks now remain explicit breaks instead of degrading to soft newlines; rich normalization uses the canonical backslash marker.
- New code blocks remember the last language explicitly selected during the current app session. The saved default-code-language preference remains unchanged and is used again as the fallback on a fresh session.
- Added an opt-in **Show hidden files in folder tree** preference. Native and Electron hosts apply the visibility filter while preserving folder-grant containment, symlink rejection for descendants and existing `node_modules`/`Library` exclusions.
- Added folder-tree sorting by file creation date alongside the existing name and modification-time options. Creation timestamps come from host filesystem metadata and do not widen folder authority.
- Added native **Edit → Substitutions** controls for smart quotes, smart dashes and macOS text replacement. The native host delegates these explicit user actions to WKWebView instead of rewriting Markdown with TypeOpen-owned punctuation transforms.
- Hardened folder-tree image handling so image assets cannot enter the editable-document `read-file`/grant path. Image rows remain selectable and can be revealed in Finder through the existing folder-scoped authority instead of being opened as Markdown.
- Added **Export with Previous** as per-document, session-only export history. It remembers only the last successfully completed export format and reruns the normal save flow; cancelled/failed exports do not replace history, and output destinations are not persisted or silently reused.
- Hardened Electron local-image preview/export reads against pathname replacement: image bytes are now read from a bound file descriptor only after its filesystem identity and containment are validated, with symlink and size checks retained.
- Added renderer-only file-library exclusion globs for Files, Articles and Open Quickly. Patterns are stored as preference text only, never as filesystem authority; the active/revealed document remains visible and Search in Folder continues to search the full authorized folder.

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
