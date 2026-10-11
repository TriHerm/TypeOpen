cask "typeopen" do
  version "0.1.4"
  sha256 "223ac6297fbbd1720c92ee60933cb22011a20b77bc3bf4860e896e065107b09d"

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
