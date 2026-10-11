cask "typeopen" do
  version "0.1.5"
  sha256 "405fef441c9f76e302ebda8135c0d2bb2e5fb66741a48922009fbf11eb39a144"

  url "https://github.com/TriHerm/TypeOpen/releases/download/v#{version}/TypeOpen-#{version}-arm64.dmg"
  name "TypeOpen"
  desc "Open-source Markdown editor with a focused live editing experience"
  homepage "https://github.com/TriHerm/TypeOpen"

  depends_on arch: :arm64
  depends_on macos: :ventura

  app "TypeOpen.app"

  caveats <<~EOS
    TypeOpen #{version} is ad-hoc signed and is not notarized by Apple.
    Homebrew keeps macOS quarantine enabled, so Gatekeeper may block the first launch.
    If you trust this release, try to open TypeOpen once, then use
    System Settings > Privacy & Security > Open Anyway to approve it.
  EOS
end
