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

        let continuity = root.appendingPathComponent("continuity.md")
        try "first".write(to: continuity, atomically: true, encoding: .utf8)
        let grants = PathGrants()
        _ = try grants.grantDocument(continuity.path)
        require(grants.isDocumentGranted(continuity.path), "initial exact grant missing")
        try fm.removeItem(at: continuity)
        try "second".write(to: continuity, atomically: true, encoding: .utf8)
        require(!grants.isDocumentGranted(continuity.path), "replacement incorrectly retained the old inode grant")
        require(grants.replacementReadableSnapshot(continuity.path) == realPath(continuity.path), "safe same-path replacement continuity was rejected")

        let promotion = root.appendingPathComponent("promotion.md")
        try "read version".write(to: promotion, atomically: true, encoding: .utf8)
        let promotionSnapshot = try XCTUnwrap(nativePathSnapshot(promotion.path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)), "promotion snapshot")
        try fm.removeItem(at: promotion)
        try "replacement".write(to: promotion, atomically: true, encoding: .utf8)
        do {
            _ = try grants.grantDocument(promotion.path, expectedSnapshot: promotionSnapshot)
            fatalError("snapshot-bound grant accepted a replaced file")
        } catch {
            // Expected: promotion must stay bound to the file that was read.
        }

        let guardedSave = root.appendingPathComponent("guarded-save.md")
        try "baseline".write(to: guardedSave, atomically: true, encoding: .utf8)
        let guardedSnapshot = try XCTUnwrap(nativePathSnapshot(guardedSave.path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)), "guarded-save snapshot")
        let guardedRoot = try XCTUnwrap(nativePathSnapshot(root.path, rejectSymbolicLink: false, requiredType: mode_t(S_IFDIR)), "guarded-save root")
        let guardedRevision = try XCTUnwrap(nativeFileRevision(guardedSave.path), "guarded-save revision")
        let handle = try FileHandle(forWritingTo: guardedSave)
        try handle.truncate(atOffset: 0)
        try handle.write(contentsOf: Data("external edit".utf8))
        try handle.close()
        do {
            try atomicReplaceBoundFile(
                target: guardedSnapshot,
                root: guardedRoot,
                data: Data("typeopen edit".utf8),
                expectedRevision: guardedRevision
            )
            require(false, "revision-guarded replace accepted an external in-place edit")
        } catch {
            let preserved = try String(contentsOf: guardedSave, encoding: .utf8)
            require(preserved == "external edit", "revision conflict overwrote the external edit")
        }

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

        try fm.removeItem(at: continuity)
        try fm.createSymbolicLink(at: continuity, withDestinationURL: outside)
        require(grants.replacementReadableSnapshot(continuity.path) == nil, "symlink replacement was accepted as grant continuity")

        print("native security smoke: PASS")
    }
}

private func XCTUnwrap<T>(_ value: T?, _ label: String) throws -> T {
    guard let value else {
        throw NSError(domain: "NativeSecuritySmoke", code: 1, userInfo: [NSLocalizedDescriptionKey: "Missing \(label)"])
    }
    return value
}
