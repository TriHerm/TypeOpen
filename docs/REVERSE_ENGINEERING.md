# Clean-room reconstruction notes

TypeOpen uses behavioral and shipped-artifact evidence to define compatibility targets. It does not incorporate proprietary source code, decompiler output, icons, themes, assets, license mechanisms, update feeds, secrets, or distinctive marketing text from the reference application.

The local reference artifact used during development is ignored by Git as `Typora.app/`. REA working evidence is ignored as `.rea-evidence/` and is not part of TypeOpen's source or distribution.

Observed shipped surfaces were converted into feature obligations, then independently implemented with open-source libraries and TypeOpen-owned code. When runtime behavior could not be established, the parity matrix marks it explicitly rather than treating an inference as a confirmed behavior.

REA 6.3.0 with Hopper was available for native/static analysis. Runtime native UI observation was attempted, including a screenshot-disabled accessibility-only retry, but macOS denied the required Screen Recording and Accessibility permissions to the REA host. This release therefore does not claim pixel-identical UI or exact dynamic semantics in those unresolved areas.
