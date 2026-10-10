# TypeOpen architecture

## Process boundary

TypeOpen uses Electron with a strict separation between native capabilities and the editor renderer.

- `electron/main.cjs` owns filesystem access, macOS dialogs/menus, printing, export, file associations, optional Pandoc execution and package lifecycle.
- `electron/preload.cjs` exposes a small allowlisted IPC surface. The renderer has no Node.js access.
- `src/` is a sandboxed React renderer. Markdown editing is provided by MDXEditor/Lexical; TypeOpen adds its own document shell, files/outline/search, preferences, math/diagram behavior and desktop commands.

`contextIsolation`, renderer sandboxing, navigation guards and a CSP are enabled. External navigation is delegated to the operating system only for HTTP(S) URLs.

Filesystem authority is held in the main process. Paths selected through native open/save dialogs are recorded as document or folder grants; IPC handlers revalidate those grants instead of trusting renderer-supplied state. Changing the active folder immediately revokes authority inherited only from the previous folder. Local image previews are returned as `data:` URLs only after containment checks, and `file:` image loading is not allowed by the renderer CSP.

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

HTML, PDF and PNG exports are rendered from Markdown through a TypeOpen-owned export stylesheet. Local images are embedded before export, and math is emitted as MathML so exported documents do not depend on TypeOpen's KaTeX CSS bundle.

DOCX, ODT, RTF, EPUB, LaTeX and MediaWiki use the user's local Pandoc installation. Pandoc is deliberately not bundled because TypeOpen can operate fully as a Markdown editor without it.

## Release boundary

`Typora.app/` and `.rea-evidence/` are local development inputs and are excluded by Git, npm source packaging and electron-builder's explicit application file allowlist. Local environment secrets and signing material are excluded as well. `scripts/check-clean-room.mjs` rejects forbidden tracked paths, while `scripts/verify-dist.mjs` rejects reference/evidence and secret/certificate material in the packaged ASAR and verifies bundle identity, the ad-hoc code signature and DMG integrity.
