import Foundation

@main
struct NativeSecuritySmoke {
    private static func require(_ condition: Bool, _ message: String) {
        if !condition {
            fputs("native security smoke: FAIL — \(message)\n", stderr)
            exit(1)
        }
    }

    private static func requireThemeRejected(_ css: String, _ label: String) {
        do {
            _ = try sanitizeThemeCSS(css)
            fputs("native security smoke: FAIL — accepted \(label)\n", stderr)
            exit(1)
        } catch {
            // Expected.
        }
    }

    static func main() throws {
        let safeCSS = try sanitizeThemeCSS(".editor { color: #111; }")
        require(safeCSS == ".editor { color: #111; }", "safe CSS changed")
        requireThemeRejected(#".x { background: url(https://example.invalid/x.png); }"#, "url()")
        requireThemeRejected(#".x { background: u\72l(https://example.invalid/x.png); }"#, "escaped url()")
        requireThemeRejected(#"@\69mport "https://example.invalid/theme.css";"#, "escaped @import")
        requireThemeRejected(#".x { content: "\41"; }"#, "generic CSS escape")

        let fm = FileManager.default
        let root = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("typeopen-native-security-\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: root, withIntermediateDirectories: false)
        defer { try? fm.removeItem(at: root) }

        let safe = root.appendingPathComponent("safe.md")
        try "safe".write(to: safe, atomically: true, encoding: .utf8)
        let rootReal = try XCTUnwrap(realPath(root.path), "temporary root realpath")
        let stableText = try readStableTextFile(safe.path, authorizedRootRealPath: rootReal)
        require(stableText == "safe", "stable read failed")

        let initial = try XCTUnwrap(nativePathSnapshot(safe.path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)), "initial file snapshot")
        try fm.removeItem(at: safe)
        try "replacement".write(to: safe, atomically: true, encoding: .utf8)
        let replacement = try XCTUnwrap(nativePathSnapshot(safe.path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)), "replacement file snapshot")
        require(initial != replacement, "same-path replacement did not change identity")

        let outside = root.deletingLastPathComponent().appendingPathComponent("typeopen-native-outside-\(UUID().uuidString).md")
        try "outside".write(to: outside, atomically: true, encoding: .utf8)
        defer { try? fm.removeItem(at: outside) }
        let link = root.appendingPathComponent("link.md")
        try fm.createSymbolicLink(at: link, withDestinationURL: outside)
        require(nativePathSnapshot(link.path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)) == nil, "symlink snapshot was accepted")
        do {
            _ = try readStableTextFile(link.path, authorizedRootRealPath: rootReal)
            require(false, "symlink read was accepted")
        } catch {
            // Expected.
        }

        print("native security smoke: PASS")
    }
}

private func XCTUnwrap<T>(_ value: T?, _ label: String) throws -> T {
    guard let value else {
        throw NSError(domain: "NativeSecuritySmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing \(label)"])
    }
    return value
}
