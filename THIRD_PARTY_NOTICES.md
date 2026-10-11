# Third-party notices

TypeOpen depends on open-source software. The package lock is the authoritative version inventory for a build. Renderer libraries are bundled into the production assets at build time rather than copied as a production `node_modules` tree. Major application/runtime components include:

| Package | Purpose | License |
| --- | --- | --- |
| Electron | legacy development/fallback desktop shell | MIT |
| React / React DOM | renderer UI | MIT |
| @mdxeditor/editor | Markdown WYSIWYG editor framework | MIT |
| Lexical / @lexical/list / @lexical/markdown / @lexical/rich-text | editor engine and rich/Markdown/list primitives | MIT |
| CodeMirror / @codemirror/* | Source Mode, fenced code editing, Markdown syntax tree and typing keymaps | MIT |
| KaTeX | math rendering | MIT |
| Mermaid | diagrams | MIT |
| flowchart.js | legacy flowchart diagrams | MIT |
| marked | Markdown rendering for export | MIT |
| DOMPurify | export sanitization | MPL-2.0 OR Apache-2.0 |
| mdast-util-gfm-footnote | GFM footnote Markdown AST parsing/serialization | MIT |
| mdast-util-math | math Markdown AST extension | MIT |
| mdast-util-from-markdown | Markdown AST parsing used for lossless rich-mode comment boundaries | MIT |
| mdast-util-mdx-jsx | MDX/HTML AST element types used by rich-mode comment bridging | MIT |
| micromark-extension-gfm-footnote | GFM footnote Markdown syntax | MIT |
| micromark-extension-math | math Markdown syntax | MIT |
| lucide-react | UI icons | ISC |

Each dependency remains subject to its own license and notices. Run `npm ls --all` against the locked install to inspect the complete transitive dependency graph.
