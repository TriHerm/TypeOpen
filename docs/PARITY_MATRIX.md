# TypeOpen parity matrix

TypeOpen is an independent open-source implementation of a focused Markdown editor. The matrix separates observed reference behavior from TypeOpen's implementation status. The proprietary reference application, REA evidence database, icons, themes, code, and assets are excluded from the repository and release.

Reference inspected locally with REA: Typora 1.14.10 build 7786 on macOS. Primary shipped-artifact evidence IDs: plist `ev_d320983c9643a745901a4910ba9715365fb177ca3712aae86a7a128f14104349`; Interface Builder `ev_dc22b63aeacc7f8513a964fa2cc3571df4f1a303792f33f083290f0cfdef009b`; artifact inventory `ev_0d1cc961ab3b7b0f4c30501483bbab4b0c71514911bf8a633878ef1fb9fff422`; Mach-O `ev_f29e8338fb60fdc00ff8a475d1724d65e79a100046ff324ed68995c6bc8be412`.

`Implemented` means the TypeOpen feature exists and is exercised by build/type checks or direct smoke checks. `Partial` means the main workflow exists but exact reference edge semantics are not established. `Reference unknown` means REA could not dynamically establish the exact behavior in this run.

| Area | Reference evidence | TypeOpen status | Notes |
| --- | --- | --- | --- |
| Live rendered Markdown editing | shipped document/editor surfaces | Implemented | MDXEditor/Lexical, Markdown in/out, no proprietary editor code |
| Markdown/text files | plist document registrations | Implemented | Open/save/save-as and macOS file associations |
| TextBundle packages | plist editable TextBundle document role | Implemented | `.textbundle` is a macOS package association; payload-only saves preserve metadata/assets and Save As can create a new bundle |
| Open folder / file tree | static sidebar/file-library resources | Partial | Recursive Markdown/text tree and article list; native runtime adds create file/folder, rename, Move to Trash, refresh, name/modified/creation-date sorting and an opt-in host-enforced hidden-file visibility preference. Configurable glob filtering, pinning, grouping and other library controls remain |
| Recent/reopen/quick file workflows | static File menu resources | Implemented | Native recent documents, renderer closed-file history, and filename-only quick open over the current folder |
| Duplicate / Rename / Move To | static File menu resources | Implemented | Saved local documents only; tab paths update after filesystem operations and TextBundle packages move/copy as complete directories |
| Outline | static Outline resources | Implemented | H1-H6 extraction/navigation, flat or hierarchical presentation, configurable maximum heading level, hierarchical branch collapse/expand, Expand All / Collapse All and current-section highlighting/reveal are implemented. Hidden deeper active headings project to their nearest visible ancestor |
| Source Code Mode | static View command | Implemented | CodeMirror-backed source view via MDXEditor |
| Read-only Mode | static View command | Implemented | Toggle in UI/menu command |
| Focus Mode | static View command/preferences | Implemented | Dims non-current top-level editor blocks |
| Typewriter Mode | static View command/preferences | Implemented | Keeps active block centered while caret moves |
| Find / Replace | static Edit resources | Implemented | Literal or regular-expression search, optional case sensitivity and whole-word matching, next/previous/replace/all. Replacement text is literal rather than regex capture expansion |
| Global folder search | static global Search action | Implemented | Recursive literal or regular-expression folder search with optional case sensitivity/whole-word matching; hidden directories and `node_modules` are excluded and result/file-size caps remain enforced |
| Auto-pair brackets / quotes | static editor preferences | Implemented | Optional rich-text pairing for `()`, `[]`, `{}`, single and double quotes; typing an existing closer advances the caret and Backspace removes an empty pair. Apostrophes after word characters are left literal. Source Mode and fenced code use CodeMirror's built-in close-bracket behavior |
| Smart punctuation / substitutions | static Edit resources | Implemented on macOS | Native AppKit exposes its standard substitution responder actions for Smart Quotes, Smart Dashes and Text Replacement under **Edit → Substitutions**, and the WKWebView runtime is smoke-tested to respond to those selectors. The retained Electron fallback exposes the corresponding native roles. TypeOpen does not run a custom Markdown punctuation rewrite |
| Source Mode list continuation | static editor behavior | Implemented | Enter continues bullet and ordered markers, increments ordered numbers, starts new task items unchecked, and exits an empty list item. The extension is limited to parsed Markdown `ListItem` nodes and does not run inside fenced or indented code |
| Headings H1-H6 | static Paragraph menu | Implemented | Insert commands and toolbar block type |
| Heading level / indent / outdent | static Paragraph menu | Partial | Heading promotion/demotion uses MDXEditor Realm block conversion. Indent/outdent route to focused CodeMirror selections/blocks first and otherwise use Lexical list commands; arbitrary rich paragraphs are not assigned non-portable indentation |
| Quote / lists / tasks | static Paragraph menu | Implemented | Live editor plugins plus insertion commands |
| Task Status | static Paragraph menu | Implemented | Uses the public `@lexical/list` `ListItemNode` API to toggle the current checklist item's checked state; normal list items are left unchanged |
| Tables | static NIB/menu controls | Implemented | Live table plugin, insertion and editing controls supplied by editor engine |
| Fenced code | static menu/preferences | Implemented | CodeMirror provides line numbers, Tab/Shift-Tab indentation, wrapping and per-block language selection; TypeOpen bridges native Paragraph Indent/Outdent to the focused CodeMirror. The persisted preference supplies the initial default, while an explicit language change becomes the session-only default for newly inserted blocks until restart |
| Inline/block math | static menu/preferences | Implemented | KaTeX; double-click formula to edit TeX |
| Mermaid diagrams | static diagram preferences | Implemented | Live preview in fenced `mermaid` blocks |
| Sequence diagrams | static diagram preferences | Implemented | `sequence` fences translated to Mermaid sequence syntax where possible |
| Flowcharts | static diagram preferences | Implemented | `flow`/`flowchart` fences rendered with flowchart.js |
| Links | static menu/preferences | Implemented | Rich link dialog plus Markdown insertion/copy/open support |
| Reference-style links | static Markdown behavior | Implemented | Full, collapsed and shortcut CommonMark references render in rich mode and serialize back with their definitions. Duplicate identifiers resolve first-definition-wins while duplicate/unused definitions are preserved. Definition destinations/titles remain Source-mode edits; rich formatting may canonicalize inside the link label |
| Images | static menu/preferences | Implemented | URL/local insert; pasted/uploaded images can be copied to adjacent `assets/` |
| YAML front matter | static Paragraph/menu resources | Implemented | Frontmatter editor plugin and insert command |
| GitHub-style Alerts | static Markdown/preferences behavior | Implemented | Canonical `> [!NOTE]` / `TIP` / `IMPORTANT` / `WARNING` / `CAUTION` syntax becomes an editable rich alert, round-trips exactly, remains literal in Source mode, and exports as a styled callout |
| HTML blocks / inline HTML | static Markdown behavior | Implemented | MDXEditor core imports/exports supported HTML elements as rich generic HTML nodes; TypeOpen separately preserves HTML comments losslessly |
| Table of contents marker | static Paragraph menu | Implemented | TypeOpen-owned MDXEditor/Lexical decorator recognizes a standalone `[TOC]`, renders a live heading outline, and serializes it back to the exact marker; source mode remains Markdown |
| Footnotes | static Paragraph menu | Implemented | TypeOpen-owned MDXEditor/Lexical nodes use the public GFM micromark/mdast extensions for paired `[^id]` references and `[^id]: text` definitions; canonical paired syntax round-trips through rich mode and remains literal Markdown in source mode. Noncanonical whitespace may normalize |
| Hard line breaks | static Markdown behavior | Implemented | MDXEditor imports MDAST hard breaks as Lexical line-break nodes but normally exports them as soft newline text. TypeOpen overrides only that export visitor so explicit breaks remain MDAST `break` nodes; backslash and two-space source forms preserve semantics and may canonicalize to `\` |
| Strong/emphasis/underline/code/strike | static Format menu | Implemented | Toolbar/menu commands. MDXEditor owns rich bold/italic/code typing shortcuts; TypeOpen registers Lexical's omitted `STRIKETHROUGH` transformer so a completed `~~text~~` pair applies rich strike formatting |
| Clear Format | static Format menu | Implemented | Clears Lexical inline text formats on the active rich-text selection |
| Highlight / superscript / subscript | static Format menu | Implemented | Uses Lexical text-format commands; MDXEditor has native import/export visitors for highlight plus `<sup>`/`<sub>`, so these formats render and round-trip in rich mode. TypeOpen registers Lexical's public `HIGHLIGHT` shortcut transformer so typing a completed `==text==` pair applies rich highlight formatting |
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
| Autosave | exact reference recovery semantics unknown | Implemented | Optional debounced save for an existing file; autosave stops when the native runtime detects an unresolved external-file conflict |
| Unsaved draft recovery | static recovery/preferences resources | Partial | Dirty/imported buffers are snapshotted privately and recovered after an interrupted session as pathless `Recovered` documents that require explicit Save As. Startup recovery is loaded before clean-state host reporting, stale dirty snapshots are cleared immediately once every open document is clean, and native recovery reads require a bound regular non-symlink file. Full reference recovery/version history remains |
| Clean saved-tab session restore | static recovery/preferences resources | Implemented | **Restore Previous Session** is explicit. A native-owned manifest stores ordered clean saved-tab intent plus file/parent identity only for paths already granted in the live session. Manifest loading grants/reads nothing; restore skips missing/replaced/symlinked entries, revalidates identity before grant/read, and never restores folder authority |
| External file changes / Reload from Disk | static File/resources messages | Implemented in native runtime | Native file watchers mark conflicts, block autosave/normal Save, and offer Reload from Disk or Save As. Existing-file saves use macOS file coordination plus descriptor-bound revision checks; the retained Electron migration fallback does not provide live external-change watching |
| Tabs / multi-document model | static New Tab / document switching | Implemented | Renderer-owned tabs preserve per-document dirty state, Save All, close prompts and next/previous switching |
| Native window behavior | shipped macOS window/menu surfaces | Implemented | AppKit traffic lights/full-size titlebar, draggable inert titlebar region, persisted frame size/position, standard Window menu, fullscreen/minimize/zoom and dirty-close lifecycle |
| Custom themes | static theme preferences | Implemented | Built-in light/dark/system remain available; users can explicitly choose a local CSS file that is size-limited and rejected if it contains external-resource/executable CSS constructs. Reference themes/assets are intentionally not copied |
| Page Setup | static File menu | Implemented | TypeOpen-owned dialog configures paper size, portrait/landscape orientation, and margins; settings map to `NSPrintInfo` for native PDF export and printing |
| Pixel-identical native UI | runtime capture blocked | Reference unknown | REA live native UI observation was denied Screen Recording and Accessibility permissions; TypeOpen uses an original UI |

## High-value replacement gaps retained from the reference inventory

These are intentionally tracked even when they are not part of the current implementation stage. They are ordered by replacement value rather than by how many menu items the reference exposes.

| Priority | Reference capability still worth closing | TypeOpen state / intended boundary |
| --- | --- | --- |
| Next | Configurable outer-whitespace behavior | Explicit hard-break semantics are preserved and smart punctuation now delegates to the host's explicit native substitution controls. MDXEditor still trims outer document whitespace during root import/export even with `trim={false}`; preserving it would require an explicit conservative editor-state contract rather than an invisible TypeOpen-owned envelope |
| Later | Folder-session hints and stronger recovery/version workflows | Clean saved tabs now restore explicitly after native identity revalidation. Folder grants remain deliberately non-persistent; any future folder hint must still require a normal user-authorized Open Folder flow |
| Later | Multi-window / Open in New Window | Multi-tab model exists; the native app still centers on one main editing window |
| Later | Advanced file library: configurable glob patterns, pinned/recent locations and grouping | Native management, name/modified/creation-date sorting and a host-enforced hidden-file toggle exist |
| Later | Advanced image management: configurable asset roots/copy rules, copy/move/rename/delete image assets, syntax switching, zoom/open actions | Safe local image insert/preview and adjacent `assets/` storage exist; cloud/PicGo/PicList integration is intentionally deferred |
| Later | Export profiles: previous export, headers/footers, heading page breaks, export theme/CSS/templates, destination/post-export actions and richer Pandoc arguments | Core native/Pandoc export exists; profile system remains |
| Later | Custom shortcuts, richer spellcheck language controls, separate light/dark custom themes and launch behavior preferences | Not required for core Markdown replacement but retained as parity backlog |
| Deliberately different | Typora licensing/activation/server/update mechanisms | Not a parity target. TypeOpen remains open source and uses GitHub/Homebrew distribution instead |

## Evidence boundary

REA dynamic native-UI capture was blocked by macOS Screen Recording permission, and a later screenshot-disabled accessibility-only retry was blocked by macOS Accessibility permission. Exact reference caret transitions, selection retention, menu enabled states, custom theme CSS, and pixel geometry are therefore not claimed as observed. TypeOpen implements those areas independently and records remaining uncertainty rather than labeling it exact parity.
