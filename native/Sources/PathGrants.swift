import Foundation
import Darwin

struct NativePathSnapshot: Equatable {
    let realPath: String
    let device: dev_t
    let inode: ino_t
    let fileType: mode_t
}

enum PathGrantError: LocalizedError {
    case invalidPath
    case missingPath
    case changedPath

    var errorDescription: String? {
        switch self {
        case .invalidPath: return "A valid local path is required."
        case .missingPath: return "The granted path must exist."
        case .changedPath: return "The granted path changed after it was authorized."
        }
    }
}

func normalizedPath(_ value: String) -> String? {
    guard !value.isEmpty else { return nil }
    let expanded = (value as NSString).expandingTildeInPath
    let absolute: String
    if expanded.hasPrefix("/") {
        absolute = expanded
    } else {
        absolute = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
            .appendingPathComponent(expanded).path
    }
    return URL(fileURLWithPath: absolute).standardizedFileURL.path
}

func realPath(_ value: String) -> String? {
    guard let normalized = normalizedPath(value) else { return nil }
    return normalized.withCString { pointer in
        guard let resolved = Darwin.realpath(pointer, nil) else { return nil }
        defer { free(resolved) }
        return String(cString: resolved)
    }
}

func isInsideOrEqual(_ targetPath: String, _ rootPath: String) -> Bool {
    guard let target = normalizedPath(targetPath), let root = normalizedPath(rootPath) else { return false }
    if target == root { return true }
    if root == "/" { return target.hasPrefix("/") }
    return target.hasPrefix(root + "/")
}

final class PathGrants {
    private struct Identity: Equatable {
        let device: dev_t
        let inode: ino_t
        let fileType: mode_t
    }

    private struct DocumentGrant {
        let realPath: String
        let identity: Identity
        let parentPath: String
        let parentRealPath: String
        let parentIdentity: Identity
    }

    private struct FolderGrant {
        let path: String
        let realPath: String
        let identity: Identity
    }

    private var documents: [String: DocumentGrant] = [:]
    private var folder: FolderGrant?

    private func identity(_ path: String) -> Identity? {
        var status = stat()
        guard stat(path, &status) == 0 else { return nil }
        return Identity(device: status.st_dev, inode: status.st_ino, fileType: status.st_mode & mode_t(S_IFMT))
    }

    private func activeFolder() -> FolderGrant? {
        guard let folder,
              realPath(folder.path) == folder.realPath,
              identity(folder.path) == folder.identity else { return nil }
        return folder
    }

    private func activeDocument(_ normalized: String) -> DocumentGrant? {
        guard let granted = documents[normalized],
              realPath(normalized) == granted.realPath,
              identity(normalized) == granted.identity,
              realPath(granted.parentPath) == granted.parentRealPath,
              identity(granted.parentPath) == granted.parentIdentity else { return nil }
        return granted
    }

    @discardableResult
    func grantDocument(
        _ filePath: String,
        expectedRealPath: String? = nil,
        expectedSnapshot: NativePathSnapshot? = nil,
        expectedParentSnapshot: NativePathSnapshot? = nil
    ) throws -> String {
        guard let normalized = normalizedPath(filePath) else { throw PathGrantError.invalidPath }
        let parentPath = URL(fileURLWithPath: normalized).deletingLastPathComponent().path
        guard let snapshot = realPath(normalized),
              let fileIdentity = identity(normalized),
              let parentRealPath = realPath(parentPath),
              let parentIdentity = identity(parentPath) else { throw PathGrantError.missingPath }
        if let expectedRealPath, snapshot != expectedRealPath { throw PathGrantError.changedPath }
        if let expectedSnapshot,
           (snapshot != expectedSnapshot.realPath ||
            fileIdentity.device != expectedSnapshot.device ||
            fileIdentity.inode != expectedSnapshot.inode ||
            fileIdentity.fileType != expectedSnapshot.fileType) {
            throw PathGrantError.changedPath
        }
        if let expectedParentSnapshot,
           (parentRealPath != expectedParentSnapshot.realPath ||
            parentIdentity.device != expectedParentSnapshot.device ||
            parentIdentity.inode != expectedParentSnapshot.inode ||
            parentIdentity.fileType != expectedParentSnapshot.fileType) {
            throw PathGrantError.changedPath
        }
        documents[normalized] = DocumentGrant(
            realPath: snapshot,
            identity: fileIdentity,
            parentPath: parentPath,
            parentRealPath: parentRealPath,
            parentIdentity: parentIdentity
        )
        return normalized
    }

    func revokeDocument(_ filePath: String) {
        guard let normalized = normalizedPath(filePath) else { return }
        documents.removeValue(forKey: normalized)
    }

    @discardableResult
    func setFolder(_ folderPath: String) throws -> String {
        guard let normalized = normalizedPath(folderPath) else { throw PathGrantError.invalidPath }
        guard let snapshot = realPath(normalized), let folderIdentity = identity(normalized) else { throw PathGrantError.missingPath }
        folder = FolderGrant(path: normalized, realPath: snapshot, identity: folderIdentity)
        return normalized
    }

    func clearFolder() {
        folder = nil
    }

    func getFolder() -> String? {
        activeFolder()?.path
    }

    func getFolderRealPath() -> String? {
        activeFolder()?.realPath
    }

    func isCurrentFolder(_ folderPath: String) -> Bool {
        guard let normalized = normalizedPath(folderPath), let active = activeFolder() else { return false }
        return normalized == active.path
    }

    func isDocumentGranted(_ filePath: String) -> Bool {
        guard let normalized = normalizedPath(filePath) else { return false }
        return activeDocument(normalized) != nil
    }

    func grantedDocumentRealPath(_ filePath: String) -> String? {
        guard let normalized = normalizedPath(filePath), let granted = activeDocument(normalized) else { return nil }
        return granted.realPath
    }

    func readableSnapshot(_ filePath: String) -> String? {
        guard let normalized = normalizedPath(filePath), let targetRealPath = realPath(normalized) else { return nil }
        if let granted = activeDocument(normalized), granted.realPath == targetRealPath { return targetRealPath }
        guard let active = activeFolder(), isInsideOrEqual(targetRealPath, active.realPath) else { return nil }
        return targetRealPath
    }

    func replacementReadableSnapshot(_ filePath: String) -> String? {
        guard let normalized = normalizedPath(filePath), let granted = documents[normalized] else { return nil }
        guard realPath(granted.parentPath) == granted.parentRealPath,
              identity(granted.parentPath) == granted.parentIdentity else { return nil }
        var linkStatus = stat()
        guard lstat(normalized, &linkStatus) == 0,
              (linkStatus.st_mode & mode_t(S_IFMT)) != mode_t(S_IFLNK),
              let replacementIdentity = identity(normalized),
              replacementIdentity.fileType == granted.identity.fileType,
              let replacementRealPath = realPath(normalized),
              isInsideOrEqual(replacementRealPath, granted.parentRealPath) else { return nil }
        return replacementRealPath
    }

    func canReadDocument(_ filePath: String) -> Bool {
        readableSnapshot(filePath) != nil
    }

    func canWriteDocument(_ filePath: String) -> Bool {
        isDocumentGranted(filePath)
    }

    func canListFolder(_ folderPath: String) -> Bool {
        guard let active = activeFolder(), let targetRealPath = realPath(folderPath) else { return false }
        return isInsideOrEqual(targetRealPath, active.realPath)
    }
}
