# TypeOpen architecture

## Process boundary

TypeOpen's default macOS application is a small Swift/AppKit host with a system `WKWebView`. The React/Vite renderer remains the editor UI and keeps the same `window.typeopen` contract that was used during the earlier Electron implementation.

- `native/Sources/AppDelegate.swift` owns application/window lifecycle, native menus, Finder open-file delivery and dirty-close handling.
- `native/Sources/NativeBridge.swift` owns filesystem access, macOS dialogs, export/print, optional Pandoc execution and the allowlisted WebKit message surface.
- `native/bridge.js` is injected at document start for the main frame only and presents the existing Promise-based `window.typeopen` API to React.
- `native/Sources/PathGrants.swift` snapshots selected document/folder `realpath` values and revalidates them before authority is reused. Folder-scoped reads are revalidated after I/O before promotion to an exact document grant.
- `src/` is a sandboxed React renderer. Markdown editing is provided by MDXEditor/Lexical; TypeOpen adds its own document shell, files/outline/search, preferences, math/diagram behavior and desktop commands.

The renderer is read from the application's `Resources/renderer` directory through a TypeOpen-owned `WKURLSchemeHandler` at `typeopen://app/`. This gives ES modules a normal same-origin URL without a local server while keeping resource resolution confined to the packaged renderer directory. WKWebView navigation is restricted to that renderer origin; HTTP(S) navigation is handed to `NSWorkspace` instead of being loaded inside the editor. The renderer CSP remains enabled. Native bridge messages are accepted only from the main frame on the `typeopen://app` origin.

Filesystem authority is held in the native bridge. Paths selected through native open/save dialogs are recorded as document or folder grants; bridge handlers revalidate those grants instead of trusting renderer-supplied state. Changing the active folder immediately revokes authority inherited only from the previous folder. Local image previews are returned as `data:` URLs only after containment checks, and `file:` image loading is not allowed by the renderer CSP.

## Document model

Markdown remains the canonical persisted format. Rich editing is a view over Markdown rather than a proprietary document database.

- The renderer owns a `documents[]` collection plus an active document identifier. Each tab tracks its Markdown buffer, saved baseline, path/import source and dirty state independently.
- Opening an already-open path focuses its existing tab; opening a new path creates a tab. Closing tabs and windows gates on unsaved state, and Save All serializes dirty documents through the same save path used by an individual tab.
- Standard Markdown/text files are read and written directly.
- Pandoc-backed imports are converted into a new unsaved Markdown document so the source binary can never be overwritten by Save.
- TextBundle packages resolve a safe internal text payload, verify realpath containment so symlinked ancestors cannot escape the package, and preserve metadata/assets when saving.
- Relative image Markdown remains relative. For live preview, TypeOpen resolves local image bytes through the main process and returns a renderer-safe data URL; persisted Markdown is not rewritten to absolute machine paths.

## Editor extensions

- KaTeX renders inline and block TeX math.
- TypeOpen-owned Lexical/MDXEditor extensions render standalone `[TOC]` blocks and canonical paired GFM footnotes while serializing back to Markdown.
- Highlight, superscript and subscript use Lexical text-format commands. HTML comments remain source-mode-only because the current rich model has no lossless inline comment primitive.
- Mermaid renders Mermaid and sequence diagrams.
- flowchart.js renders legacy flowchart fences.
- CodeMirror supplies fenced-code/source editing inside the Markdown editor.
- DOMPurify sanitizes standalone HTML generated for export.
- Custom CSS themes are read only from an explicitly chosen local file, size-limited, and rejected if they contain remote-resource or executable CSS constructs before injection into the renderer.

## Export

HTML, PDF and PNG exports are rendered from Markdown through a TypeOpen-owned export stylesheet. Local images are embedded before export, and math is emitted as MathML so exported documents do not depend on TypeOpen's KaTeX CSS bundle. PDF and printing use public `NSPrintOperation`/`NSPrintInfo` over an off-screen system `WKWebView`; PNG uses `WKWebView.takeSnapshot` after sizing the render surface.

DOCX, ODT, RTF, EPUB, LaTeX and MediaWiki use the user's local Pandoc installation. Pandoc is deliberately not bundled because TypeOpen can operate fully as a Markdown editor without it.

## Release boundary

`Typora.app/` and `.rea-evidence/` are local development inputs and are excluded by Git and native packaging. Local environment secrets and signing material are excluded as well. `scripts/check-clean-room.mjs` rejects forbidden tracked paths. `scripts/build-native.mjs` compiles only TypeOpen's Swift host and copies the production Vite renderer; `scripts/verify-native-dist.mjs` verifies bundle identity, the ad-hoc signature, DMG integrity, renderer/bridge presence, and explicitly rejects Electron Framework, `app.asar`, Typora and REA evidence from the native application.

The previous `electron/` implementation and electron-builder configuration remain in the repository as a temporary migration fallback. They are reachable only through the explicit `*:electron` scripts and are not part of the default native package.
