# TypeOpen parity matrix

TypeOpen is an independent open-source implementation of a focused Markdown editor. The matrix separates observed reference behavior from TypeOpen's implementation status. The proprietary reference application, REA evidence database, icons, themes, code, and assets are excluded from the repository and release.

Reference inspected locally with REA: Typora 1.14.10 build 7786 on macOS. Primary shipped-artifact evidence IDs: plist `ev_d320983c9643a745901a4910ba9715365fb177ca3712aae86a7a128f14104349`; Interface Builder `ev_dc22b63aeacc7f8513a964fa2cc3571df4f1a303792f33f083290f0cfdef009b`; artifact inventory `ev_0d1cc961ab3b7b0f4c30501483bbab4b0c71514911bf8a633878ef1fb9fff422`; Mach-O `ev_f29e8338fb60fdc00ff8a475d1724d65e79a100046ff324ed68995c6bc8be412`.

`Implemented` means the TypeOpen feature exists and is exercised by build/type checks or direct smoke checks. `Partial` means the main workflow exists but exact reference edge semantics are not established. `Reference unknown` means REA could not dynamically establish the exact behavior in this run.

| Area | Reference evidence | TypeOpen status | Notes |
| --- | --- | --- | --- |
| Live rendered Markdown editing | shipped document/editor surfaces | Implemented | MDXEditor/Lexical, Markdown in/out, no proprietary editor code |
| Markdown/text files | plist document registrations | Implemented | Open/save/save-as and macOS file associations |
| TextBundle packages | plist editable TextBundle document role | Implemented | `.textbundle` is a macOS package association; payload-only saves preserve metadata/assets and Save As can create a new bundle |
| Open folder / file tree | static sidebar/file-library resources | Implemented | Recursive Markdown/text tree and article list |
| Recent/reopen/quick file workflows | static File menu resources | Implemented | Native recent documents, renderer closed-file history, and filename-only quick open over the current folder |
| Duplicate / Rename / Move To | static File menu resources | Implemented | Saved local documents only; tab paths update after filesystem operations and TextBundle packages move/copy as complete directories |
| Outline | static Outline resources | Implemented | H1-H6 extraction/navigation plus current-section highlighting while the editor scrolls |
| Source Code Mode | static View command | Implemented | CodeMirror-backed source view via MDXEditor |
| Read-only Mode | static View command | Implemented | Toggle in UI/menu command |
| Focus Mode | static View command/preferences | Implemented | Dims non-current top-level editor blocks |
| Typewriter Mode | static View command/preferences | Implemented | Keeps active block centered while caret moves |
| Find / Replace | static Edit resources | Implemented | Literal, case-sensitive option, next/previous/replace/all |
| Global folder search | static global Search action | Implemented | Recursive literal folder search with optional case sensitivity; hidden directories and `node_modules` are excluded |
| Headings H1-H6 | static Paragraph menu | Implemented | Insert commands and toolbar block type |
| Heading level / indent / outdent | static Paragraph menu | Partial | Heading promotion/demotion uses MDXEditor Realm block conversion; indent/outdent use Lexical list commands and intentionally apply only to list items |
| Quote / lists / tasks | static Paragraph menu | Implemented | Live editor plugins plus insertion commands |
| Task Status | static Paragraph menu | Implemented | Uses the public `@lexical/list` `ListItemNode` API to toggle the current checklist item's checked state; normal list items are left unchanged |
| Tables | static NIB/menu controls | Implemented | Live table plugin, insertion and editing controls supplied by editor engine |
| Fenced code | static menu/preferences | Implemented | CodeMirror editor with language selection |
| Inline/block math | static menu/preferences | Implemented | KaTeX; double-click formula to edit TeX |
| Mermaid diagrams | static diagram preferences | Implemented | Live preview in fenced `mermaid` blocks |
| Sequence diagrams | static diagram preferences | Implemented | `sequence` fences translated to Mermaid sequence syntax where possible |
| Flowcharts | static diagram preferences | Implemented | `flow`/`flowchart` fences rendered with flowchart.js |
| Links | static menu/preferences | Implemented | Rich link dialog plus Markdown insertion/copy/open support |
| Images | static menu/preferences | Implemented | URL/local insert; pasted/uploaded images can be copied to adjacent `assets/` |
| YAML front matter | static Paragraph/menu resources | Implemented | Frontmatter editor plugin and insert command |
| Table of contents marker | static Paragraph menu | Implemented | TypeOpen-owned MDXEditor/Lexical decorator recognizes a standalone `[TOC]`, renders a live heading outline, and serializes it back to the exact marker; source mode remains Markdown |
| Footnotes | static Paragraph menu | Implemented | TypeOpen-owned MDXEditor/Lexical nodes use the public GFM micromark/mdast extensions for paired `[^id]` references and `[^id]: text` definitions; canonical paired syntax round-trips through rich mode and remains literal Markdown in source mode. Noncanonical whitespace may normalize |
| Strong/emphasis/underline/code/strike | static Format menu | Implemented | Toolbar/menu commands |
| Clear Format | static Format menu | Implemented | Clears Lexical inline text formats on the active rich-text selection |
| Highlight / superscript / subscript | static Format menu | Implemented | Uses Lexical text-format commands; MDXEditor has native import/export visitors for highlight plus `<sup>`/`<sub>`, so these formats render and round-trip in rich mode |
| Comment | static Format menu | Implemented | TypeOpen-owned Lexical comment nodes preserve inline and block `<!-- ... -->` source losslessly in rich mode, remain literal in Source mode, and are omitted from exported visible DOM |
| Copy as Markdown / HTML | static Edit menu | Implemented | Selection/document Markdown and editor HTML copied to clipboard |
| Paste as plain text | static Edit menu | Implemented | Clipboard text insertion |
| PDF export | static export resources | Implemented | Native AppKit `NSPrintOperation` over system WKWebView using the TypeOpen export stylesheet |
| HTML export | static export resources | Implemented | Styled and style-stripped HTML |
| Image export | static export resources | Implemented | PNG capture of rendered document |
| DOCX/ODT/RTF/EPUB/LaTeX/MediaWiki | static Pandoc/import-export resources | Implemented when Pandoc exists | No bundled Pandoc; clear unavailable result otherwise |
| Import via Pandoc | static import/Pandoc resources | Implemented when Pandoc exists | DOCX, ODT, RTF, EPUB, LaTeX, RST, Org, OPML candidates |
| Appearance | static preferences | Implemented | System/light/dark, content width and font size |
| Spellcheck | static edit/preferences | Implemented | System WebKit/macOS text services and contextual suggestions |
| Autosave | exact reference recovery semantics unknown | Implemented | Optional debounced save for an existing file |
| Tabs / multi-document model | static New Tab / document switching | Implemented | Renderer-owned tabs preserve per-document dirty state, Save All, close prompts and next/previous switching |
| Native window behavior | shipped macOS window/menu surfaces | Implemented | AppKit traffic lights/full-size titlebar, draggable inert titlebar region, persisted frame size/position, standard Window menu, fullscreen/minimize/zoom and dirty-close lifecycle |
| Custom themes | static theme preferences | Implemented | Built-in light/dark/system remain available; users can explicitly choose a local CSS file that is size-limited and rejected if it contains external-resource/executable CSS constructs. Reference themes/assets are intentionally not copied |
| Page Setup | static File menu | Implemented | TypeOpen-owned dialog configures paper size, portrait/landscape orientation, and margins; settings map to `NSPrintInfo` for native PDF export and printing |
| Pixel-identical native UI | runtime capture blocked | Reference unknown | REA live native UI observation was denied Screen Recording and Accessibility permissions; TypeOpen uses an original UI |

## Evidence boundary

REA dynamic native-UI capture was blocked by macOS Screen Recording permission, and a later screenshot-disabled accessibility-only retry was blocked by macOS Accessibility permission. Exact reference caret transitions, selection retention, menu enabled states, custom theme CSS, and pixel geometry are therefore not claimed as observed. TypeOpen implements those areas independently and records remaining uncertainty rather than labeling it exact parity.
