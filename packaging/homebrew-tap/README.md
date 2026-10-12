# TypeOpen Homebrew tap

This directory is the canonical reviewable source for the TypeOpen Cask published through the TriHerm Homebrew tap.

## Public tap repository

The public tap is `TriHerm/homebrew-tap` with this layout:

```text
homebrew-tap/
├── Casks/
│   └── typeopen.rb
└── README.md
```

Homebrew maps the short tap name `triherm/tap` to `https://github.com/TriHerm/homebrew-tap`.

## v0.1.7 release metadata

- Release: `v0.1.7`
- Artifact: `TypeOpen-0.1.7-arm64.dmg`
- URL: `https://github.com/TriHerm/TypeOpen/releases/download/v0.1.7/TypeOpen-0.1.7-arm64.dmg`
- SHA-256: `dac8409f3edb2ea87ca7e5d416421d3c0d01a6d4ced14b4261e413d0ec4f3fb7`
- Architecture: Apple Silicon (`arm64`) only
- Minimum macOS: 13 Ventura
- Bundle identifier: `com.triherm.typeopen`
- Signing: ad-hoc
- Notarization: none

The checksum above is generated from the exact release DMG by `npm run homebrew:sync`. Before publishing or updating the tap, verify that the uploaded GitHub release asset digest matches this value.

## Install and uninstall

The preferred one-command install is the fully qualified cask name:

```bash
brew install --cask triherm/tap/typeopen
```

That lets Homebrew add the tap and scope trust to the requested third-party cask. The equivalent explicit flow is:

```bash
brew tap triherm/tap
brew trust --cask triherm/tap/typeopen
brew install --cask triherm/tap/typeopen
```

Uninstall TypeOpen with:

```bash
brew uninstall --cask triherm/tap/typeopen
```

No explicit `uninstall` stanza is needed for this cask: Homebrew owns the single `app "TypeOpen.app"` artifact and removes it automatically. A `zap` stanza is intentionally omitted until TypeOpen has stable, uniquely owned user-data paths that can be removed without risking unrelated data.

Remove the tap itself, if no longer needed, with:

```bash
brew untap triherm/tap
```

## Gatekeeper and quarantine

Do not add a cask-side quarantine bypass. Homebrew intentionally applies/preserves macOS quarantine for cask downloads so Gatekeeper evaluates downloaded applications.

The current v0.1.7 application has a valid ad-hoc code signature but no Developer ID identity and no Apple notarization ticket. Consequently it does not meet the security baseline for submission to the official `homebrew/cask` repository and may be blocked on first launch under the default Gatekeeper configuration.

Users who deliberately trust this exact release can first attempt to open TypeOpen, then go to **System Settings > Privacy & Security > Open Anyway** and confirm the launch. This creates a per-app exception without disabling Gatekeeper globally or stripping quarantine attributes from arbitrary downloads.

Once TypeOpen is Developer ID signed and notarized, remove the warning caveat from the cask and reevaluate eligibility for `homebrew/cask`.

## Updating the cask

For each new immutable GitHub release:

1. Update `version` in `Casks/typeopen.rb`.
2. Download the exact release artifact and run `shasum -a 256 <artifact>`.
3. Update `sha256` only when the release version changes; never silently accept a changed checksum for the same tag without investigating the retagged artifact.
4. Confirm the declared architecture and `LSMinimumSystemVersion` still match the app bundle.
5. Run Homebrew style/audit checks in the tap before publishing it.
