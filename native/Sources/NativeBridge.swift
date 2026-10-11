import AppKit
import Foundation
import UniformTypeIdentifiers
import WebKit
import Darwin

private let markdownExtensions: Set<String> = [
    "md", "markdown", "mmd", "mdown", "mkd", "mdwn", "mdtxt", "mdtext", "rmarkdown", "rmd", "apib", "qmd", "mdx", "txt", "text"
]
private let pandocImportExtensions: Set<String> = [
    "docx", "odt", "rtf", "epub", "tex", "latex", "ltx", "rst", "rest", "org", "wiki", "textile", "opml"
]
private let imageMimeTypes: [String: String] = [
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
    "webp": "image/webp", "svg": "image/svg+xml", "avif": "image/avif"
]
private let blockedImageDataURL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
private let globalSearchMaxResults = 250
private let globalSearchMaxFileBytes = 2 * 1024 * 1024
private let maxThemeCSSBytes = 512 * 1024

struct NativeDocumentState {
    var filePath: String?
    var folderPath: String?
    var dirty = false
    var hasDirtyDocuments = false
    var title = "Untitled"
    var editorCommandsEnabled = false
}

enum TypeOpenNativeError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message): return message
        }
    }
}

struct NativePathSnapshot: Equatable {
    let realPath: String
    let device: dev_t
    let inode: ino_t
    let fileType: mode_t
}

func nativePathSnapshot(_ path: String, rejectSymbolicLink: Bool, requiredType: mode_t? = nil) -> NativePathSnapshot? {
    var linkStatus = stat()
    guard lstat(path, &linkStatus) == 0 else { return nil }
    let linkType = linkStatus.st_mode & mode_t(S_IFMT)
    if rejectSymbolicLink && linkType == mode_t(S_IFLNK) { return nil }

    var targetStatus = stat()
    guard stat(path, &targetStatus) == 0, let resolved = realPath(path) else { return nil }
    let targetType = targetStatus.st_mode & mode_t(S_IFMT)
    if let requiredType, targetType != requiredType { return nil }
    return NativePathSnapshot(realPath: resolved, device: targetStatus.st_dev, inode: targetStatus.st_ino, fileType: targetType)
}

private func fileStatusMatchesSnapshot(_ status: stat, _ snapshot: NativePathSnapshot) -> Bool {
    (status.st_mode & mode_t(S_IFMT)) == snapshot.fileType &&
        status.st_dev == snapshot.device &&
        status.st_ino == snapshot.inode
}

private func posixFailure(_ operation: String) -> TypeOpenNativeError {
    TypeOpenNativeError.message("\(operation) failed: \(String(cString: strerror(errno)))")
}

private func relativePathComponents(_ targetRealPath: String, rootRealPath: String) -> [String]? {
    guard isInsideOrEqual(targetRealPath, rootRealPath), targetRealPath != rootRealPath else { return nil }
    let prefixCount = rootRealPath == "/" ? 1 : rootRealPath.count + 1
    return String(targetRealPath.dropFirst(prefixCount)).split(separator: "/").map(String.init)
}

private func openBoundDirectory(_ snapshot: NativePathSnapshot) throws -> Int32 {
    guard snapshot.fileType == mode_t(S_IFDIR) else { throw TypeOpenNativeError.message("Authorized root is not a directory.") }
    let fd = snapshot.realPath.withCString { Darwin.open($0, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW) }
    guard fd >= 0 else { throw posixFailure("Opening authorized directory") }
    var status = stat()
    guard fstat(fd, &status) == 0, fileStatusMatchesSnapshot(status, snapshot) else {
        Darwin.close(fd)
        throw TypeOpenNativeError.message("Authorized directory changed before I/O began.")
    }
    return fd
}

private func openBoundParent(root: NativePathSnapshot, targetRealPath: String) throws -> (fd: Int32, leaf: String) {
    guard let components = relativePathComponents(targetRealPath, rootRealPath: root.realPath), let leaf = components.last else {
        throw TypeOpenNativeError.message("Target is outside the authorized directory.")
    }
    var currentFD = try openBoundDirectory(root)
    do {
        for component in components.dropLast() {
            let nextFD = component.withCString { Darwin.openat(currentFD, $0, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW) }
            guard nextFD >= 0 else { throw posixFailure("Opening authorized subdirectory") }
            var status = stat()
            guard fstat(nextFD, &status) == 0, (status.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR) else {
                Darwin.close(nextFD)
                throw TypeOpenNativeError.message("Authorized path component is not a directory.")
            }
            Darwin.close(currentFD)
            currentFD = nextFD
        }
        return (currentFD, leaf)
    } catch {
        Darwin.close(currentFD)
        throw error
    }
}

private func readBoundDataFile(_ target: NativePathSnapshot, root: NativePathSnapshot, maximumBytes: Int? = nil) throws -> Data {
    guard target.fileType == mode_t(S_IFREG), isInsideOrEqual(target.realPath, root.realPath) else {
        throw TypeOpenNativeError.message("Local file is not a safe regular file.")
    }
    let parent = try openBoundParent(root: root, targetRealPath: target.realPath)
    defer { Darwin.close(parent.fd) }
    let fd = parent.leaf.withCString { Darwin.openat(parent.fd, $0, O_RDONLY | O_CLOEXEC | O_NOFOLLOW) }
    guard fd >= 0 else { throw posixFailure("Opening local file") }
    defer { Darwin.close(fd) }

    var status = stat()
    guard fstat(fd, &status) == 0, fileStatusMatchesSnapshot(status, target) else {
        throw TypeOpenNativeError.message("Local file changed before it could be read.")
    }
    if let maximumBytes, status.st_size > off_t(maximumBytes) {
        throw TypeOpenNativeError.message("Local file is too large to read safely.")
    }

    var result = Data()
    result.reserveCapacity(status.st_size > 0 && status.st_size <= off_t(Int.max) ? Int(status.st_size) : 0)
    var buffer = [UInt8](repeating: 0, count: 64 * 1024)
    while true {
        let count = buffer.withUnsafeMutableBytes { rawBuffer in
            Darwin.read(fd, rawBuffer.baseAddress, rawBuffer.count)
        }
        if count == 0 { break }
        if count < 0 {
            if errno == EINTR { continue }
            throw posixFailure("Reading local file")
        }
        if let maximumBytes, result.count + count > maximumBytes {
            throw TypeOpenNativeError.message("Local file is too large to read safely.")
        }
        result.append(buffer, count: count)
    }
    return result
}

func readStableDataFile(_ path: String, authorizedRootRealPath: String? = nil, maximumBytes: Int? = nil) throws -> Data {
    guard let target = nativePathSnapshot(path, rejectSymbolicLink: true, requiredType: mode_t(S_IFREG)) else {
        throw TypeOpenNativeError.message("Local file is not a safe regular file.")
    }
    let rootRealPath = authorizedRootRealPath ?? URL(fileURLWithPath: target.realPath).deletingLastPathComponent().path
    guard let root = nativePathSnapshot(rootRealPath, rejectSymbolicLink: false, requiredType: mode_t(S_IFDIR)),
          isInsideOrEqual(target.realPath, root.realPath) else {
        throw TypeOpenNativeError.message("Local file is outside the authorized directory.")
    }
    return try readBoundDataFile(target, root: root, maximumBytes: maximumBytes)
}

func readStableDataFile(_ target: NativePathSnapshot, authorizedRoot: NativePathSnapshot, maximumBytes: Int? = nil) throws -> Data {
    try readBoundDataFile(target, root: authorizedRoot, maximumBytes: maximumBytes)
}

private func readStableDataFile(_ target: NativePathSnapshot, maximumBytes: Int? = nil) throws -> Data {
    let parentPath = URL(fileURLWithPath: target.realPath).deletingLastPathComponent().path
    guard let parent = nativePathSnapshot(parentPath, rejectSymbolicLink: false, requiredType: mode_t(S_IFDIR)) else {
        throw TypeOpenNativeError.message("Local file parent directory is not available.")
    }
    return try readBoundDataFile(target, root: parent, maximumBytes: maximumBytes)
}

func readStableTextFile(_ path: String, authorizedRootRealPath: String? = nil, maximumBytes: Int? = nil) throws -> String {
    let data = try readStableDataFile(path, authorizedRootRealPath: authorizedRootRealPath, maximumBytes: maximumBytes)
    guard let text = String(data: data, encoding: .utf8) else {
        throw TypeOpenNativeError.message("Local text file is not valid UTF-8.")
    }
    return text
}

func readStableTextFile(_ target: NativePathSnapshot, authorizedRoot: NativePathSnapshot, maximumBytes: Int? = nil) throws -> String {
    let data = try readStableDataFile(target, authorizedRoot: authorizedRoot, maximumBytes: maximumBytes)
    guard let text = String(data: data, encoding: .utf8) else {
        throw TypeOpenNativeError.message("Local text file is not valid UTF-8.")
    }
    return text
}

private func readStableTextFile(_ target: NativePathSnapshot, maximumBytes: Int? = nil) throws -> String {
    let data = try readStableDataFile(target, maximumBytes: maximumBytes)
    guard let text = String(data: data, encoding: .utf8) else {
        throw TypeOpenNativeError.message("Local text file is not valid UTF-8.")
    }
    return text
}

private func writeAll(_ fd: Int32, data: Data) throws {
    try data.withUnsafeBytes { rawBuffer in
        guard let base = rawBuffer.baseAddress else { return }
        var offset = 0
        while offset < rawBuffer.count {
            let written = Darwin.write(fd, base.advanced(by: offset), rawBuffer.count - offset)
            if written < 0 {
                if errno == EINTR { continue }
                throw posixFailure("Writing local file")
            }
            offset += written
        }
    }
}

func atomicReplaceBoundFile(target: NativePathSnapshot, root: NativePathSnapshot, data: Data) throws {
    let parent = try openBoundParent(root: root, targetRealPath: target.realPath)
    defer { Darwin.close(parent.fd) }

    var existing = stat()
    let existingResult = parent.leaf.withCString { fstatat(parent.fd, $0, &existing, AT_SYMLINK_NOFOLLOW) }
    guard existingResult == 0, fileStatusMatchesSnapshot(existing, target) else {
        throw TypeOpenNativeError.message("Local file changed before it could be written.")
    }

    let temporary = ".typeopen-\(UUID().uuidString).tmp"
    let tempFD = temporary.withCString {
        Darwin.openat(parent.fd, $0, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, mode_t(existing.st_mode & 0o777))
    }
    guard tempFD >= 0 else { throw posixFailure("Creating temporary local file") }
    var temporaryExists = true
    defer {
        Darwin.close(tempFD)
        if temporaryExists {
            _ = temporary.withCString { unlinkat(parent.fd, $0, 0) }
        }
    }

    try writeAll(tempFD, data: data)
    guard fsync(tempFD) == 0 else { throw posixFailure("Flushing temporary local file") }

    var beforeRename = stat()
    let beforeRenameResult = parent.leaf.withCString { fstatat(parent.fd, $0, &beforeRename, AT_SYMLINK_NOFOLLOW) }
    guard beforeRenameResult == 0, fileStatusMatchesSnapshot(beforeRename, target) else {
        throw TypeOpenNativeError.message("Local file changed while it was being written.")
    }
    let renameResult = temporary.withCString { tempName in
        parent.leaf.withCString { leafName in
            renameat(parent.fd, tempName, parent.fd, leafName)
        }
    }
    guard renameResult == 0 else { throw posixFailure("Replacing local file") }
    temporaryExists = false
}

func createBoundFile(directory: NativePathSnapshot, fileName: String, data: Data) throws -> NativePathSnapshot? {
    guard directory.fileType == mode_t(S_IFDIR), !fileName.isEmpty, !fileName.contains("/") else {
        throw TypeOpenNativeError.message("Invalid local file name.")
    }
    let directoryFD = try openBoundDirectory(directory)
    defer { Darwin.close(directoryFD) }
    let fd = fileName.withCString {
        Darwin.openat(directoryFD, $0, O_WRONLY | O_CREAT | O_EXCL | O_CLOEXEC | O_NOFOLLOW, mode_t(0o600))
    }
    if fd < 0, errno == EEXIST { return nil }
    guard fd >= 0 else { throw posixFailure("Creating local file") }
    var created = true
    defer {
        Darwin.close(fd)
        if created {
            _ = fileName.withCString { unlinkat(directoryFD, $0, 0) }
        }
    }
    try writeAll(fd, data: data)
    guard fsync(fd) == 0 else { throw posixFailure("Flushing local file") }
    var status = stat()
    guard fstat(fd, &status) == 0, (status.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) else {
        throw TypeOpenNativeError.message("Created local file is not a regular file.")
    }
    created = false
    let realPath = URL(fileURLWithPath: directory.realPath).appendingPathComponent(fileName).standardizedFileURL.path
    return NativePathSnapshot(realPath: realPath, device: status.st_dev, inode: status.st_ino, fileType: status.st_mode & mode_t(S_IFMT))
}

func ensureBoundSubdirectory(parent: NativePathSnapshot, name: String) throws -> NativePathSnapshot {
    guard parent.fileType == mode_t(S_IFDIR), !name.isEmpty, !name.contains("/") else {
        throw TypeOpenNativeError.message("Invalid local directory name.")
    }
    let parentFD = try openBoundDirectory(parent)
    defer { Darwin.close(parentFD) }
    let mkdirResult = name.withCString { mkdirat(parentFD, $0, mode_t(0o755)) }
    if mkdirResult != 0, errno != EEXIST { throw posixFailure("Creating local directory") }

    let childFD = name.withCString { Darwin.openat(parentFD, $0, O_RDONLY | O_DIRECTORY | O_CLOEXEC | O_NOFOLLOW) }
    guard childFD >= 0 else { throw posixFailure("Opening local directory") }
    defer { Darwin.close(childFD) }
    var status = stat()
    guard fstat(childFD, &status) == 0, (status.st_mode & mode_t(S_IFMT)) == mode_t(S_IFDIR) else {
        throw TypeOpenNativeError.message("Local directory is not a safe directory.")
    }
    let realPath = URL(fileURLWithPath: parent.realPath).appendingPathComponent(name, isDirectory: true).standardizedFileURL.path
    return NativePathSnapshot(realPath: realPath, device: status.st_dev, inode: status.st_ino, fileType: status.st_mode & mode_t(S_IFMT))
}

func sanitizeThemeCSS(_ css: String) throws -> String {
    guard css.utf8.count <= maxThemeCSSBytes else { throw TypeOpenNativeError.message("Theme CSS is too large (512 KiB maximum).") }
    guard !css.contains("\0") else { throw TypeOpenNativeError.message("Theme CSS contains invalid null bytes.") }
    let scan = css.replacingOccurrences(of: #"/\*[\s\S]*?\*/"#, with: "", options: .regularExpression)
    // CSS escapes can encode characters in blocked constructs (`u\72l`,
    // `@\69mport`, etc.). Reject every effective backslash instead of trying
    // to decode the many valid CSS escape forms before policy matching.
    if scan.contains("\\") { throw TypeOpenNativeError.message("Theme CSS escapes are not allowed.") }
    let blocked = [#"@import\b"#, #"url\s*\("#, #"image-set\s*\("#, #"expression\s*\("#, #"javascript\s*:"#, #"behavior\s*:"#, #"-moz-binding\s*:"#]
    for pattern in blocked where scan.range(of: pattern, options: [.regularExpression, .caseInsensitive]) != nil {
        throw TypeOpenNativeError.message("Theme CSS may not load external resources or executable CSS constructs.")
    }
    return css
}

@MainActor
final class NativeBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    private weak var window: NSWindow?
    private weak var webView: WKWebView?
    private let grants = PathGrants()
    private var rendererIsReady = false
    private var pendingOpenPaths: [String] = []
    private var renderJobs: [UUID: RenderJob] = [:]
    private(set) var documentState = NativeDocumentState()

    var onCloseAfterSave: (() -> Void)?
    var onDocumentStateChanged: ((NativeDocumentState) -> Void)?

    init(window: NSWindow, webView: WKWebView) {
        self.window = window
        self.webView = webView
        super.init()
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let rendererURL = message.frameInfo.request.url ?? webView?.url
        guard message.name == "typeopen", message.frameInfo.isMainFrame, isTrustedRendererURL(rendererURL) else { return }
        guard let body = message.body as? [String: Any], let kind = body["kind"] as? String else { return }

        if kind == "invoke" {
            guard let requestID = (body["id"] as? NSNumber)?.intValue, let channel = body["channel"] as? String else { return }
            handleInvoke(requestID: requestID, channel: channel, payload: body["payload"])
            return
        }

        if kind == "event", let event = body["event"] as? String {
            handleEvent(event, payload: body["payload"])
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if isTrustedRendererURL(url) || url.absoluteString == "about:blank" {
            decisionHandler(.allow)
            return
        }
        if let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            NSWorkspace.shared.open(url)
        }
        decisionHandler(.cancel)
    }

    func queueSystemOpenPath(_ filePath: String) {
        guard isEditableDocument(filePath), FileManager.default.fileExists(atPath: filePath) else { return }
        do {
            let normalized = try grants.grantDocument(filePath)
            noteRecent(normalized)
            if rendererIsReady {
                sendCommand("open-path", payload: normalized)
            } else {
                if !pendingOpenPaths.contains(normalized) { pendingOpenPaths.append(normalized) }
            }
        } catch {
            NSSound.beep()
        }
    }

    func sendCommand(_ command: String, payload: Any? = nil) {
        sendJavaScript(function: "__typeopenDispatchCommand", payload: [
            "command": command,
            "payload": payload ?? NSNull()
        ])
    }

    func sendFileChanged(_ filePath: String) {
        sendJavaScript(function: "__typeopenDispatchFileChanged", payload: ["filePath": filePath])
    }

    private func handleEvent(_ event: String, payload: Any?) {
        switch event {
        case "document-state":
            guard let raw = payload as? [String: Any] else { return }
            let requestedFilePath = raw["filePath"] as? String
            let requestedFolderPath = raw["folderPath"] as? String
            documentState = NativeDocumentState(
                filePath: requestedFilePath.flatMap { grants.isDocumentGranted($0) ? normalizedPath($0) : nil },
                folderPath: requestedFolderPath.flatMap { grants.isCurrentFolder($0) ? normalizedPath($0) : nil },
                dirty: (raw["dirty"] as? Bool) ?? false,
                hasDirtyDocuments: (raw["hasDirtyDocuments"] as? Bool) ?? false,
                title: String(((raw["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? "Untitled").prefix(512)),
                editorCommandsEnabled: (raw["editorCommandsEnabled"] as? Bool) ?? false
            )
            updateWindowDocumentState()
            onDocumentStateChanged?(documentState)
        case "renderer-ready":
            rendererIsReady = true
            for path in pendingOpenPaths { sendCommand("open-path", payload: path) }
            pendingOpenPaths.removeAll()
        case "close-after-save":
            onCloseAfterSave?()
        default:
            break
        }
    }

    private func handleInvoke(requestID: Int, channel: String, payload: Any?) {
        switch channel {
        case "typeopen:export-pdf":
            exportPDF(payload: payload) { [weak self] result in self?.resolve(requestID, result) }
        case "typeopen:export-image":
            exportPNG(payload: payload) { [weak self] result in self?.resolve(requestID, result) }
        case "typeopen:print-html":
            printHTML(payload: payload) { [weak self] result in self?.resolve(requestID, result) }
        default:
            do {
                resolve(requestID, .success(try invokeSync(channel: channel, payload: payload)))
            } catch {
                resolve(requestID, .failure(error))
            }
        }
    }

    private func invokeSync(channel: String, payload: Any?) throws -> Any? {
        switch channel {
        case "typeopen:open-file": return try chooseOpenFile()
        case "typeopen:open-folder": return try chooseOpenFolder()
        case "typeopen:choose-theme-css": return try chooseThemeCSS()
        case "typeopen:read-file": return try readGrantedDocument(requireString(payload, "Document path is required."))
        case "typeopen:list-folder": return try listGrantedFolder(requireString(payload, "Folder path is required."))
        case "typeopen:search-folder": return try searchGrantedFolder(payload as? [String: Any] ?? [:])
        case "typeopen:save-file": return try writeDocument(payload: requireDictionary(payload), saveAs: false)
        case "typeopen:save-file-as": return try writeDocument(payload: requireDictionary(payload), saveAs: true)
        case "typeopen:duplicate-document": return try duplicateDocument(payload: requireDictionary(payload))
        case "typeopen:rename-document": return try renameDocument(requireString(payload, "Document path is required."))
        case "typeopen:move-document": return try moveDocument(requireString(payload, "Document path is required."))
        case "typeopen:export-html": return try exportHTML(payload: requireDictionary(payload))
        case "typeopen:export-pandoc": return try exportPandoc(payload: requireDictionary(payload))
        case "typeopen:pandoc-status": return ["available": locatePandoc() != nil]
        case "typeopen:save-image": return try saveImageAsset(payload: requireDictionary(payload))
        case "typeopen:resolve-image-preview": return ["url": try resolveImagePreview(requireString(payload, "Image source is required."))]
        case "typeopen:clipboard-read": return NSPasteboard.general.string(forType: .string) ?? ""
        case "typeopen:clipboard-write":
            let text = try requireString(payload, "Clipboard text is required.")
            NSPasteboard.general.clearContents()
            return NSPasteboard.general.setString(text, forType: .string)
        case "typeopen:show-item":
            let path = try requireString(payload, "Item path is required.")
            guard grants.canReadDocument(path) else { throw TypeOpenNativeError.message("Item path has not been granted by the user.") }
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            return true
        case "typeopen:open-external":
            let value = try requireString(payload, "External URL is required.")
            guard let url = URL(string: value), let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" else {
                throw TypeOpenNativeError.message("Only HTTP(S) external links are allowed.")
            }
            return NSWorkspace.shared.open(url)
        case "typeopen:confirm-discard": return confirmDiscard(payload as? [String: Any])
        default: throw TypeOpenNativeError.message("Blocked IPC channel: \(channel)")
        }
    }

    private func isTrustedRendererURL(_ url: URL?) -> Bool {
        guard let url else { return false }
        return url.scheme == RendererSchemeHandler.scheme && url.host == RendererSchemeHandler.host
    }

    private func resolve(_ requestID: Int, _ result: Result<Any?, Error>) {
        switch result {
        case .success(let value):
            sendJavaScript(function: "__typeopenResolve", payload: ["id": requestID, "ok": true, "value": value ?? NSNull()])
        case .failure(let error):
            sendJavaScript(function: "__typeopenResolve", payload: ["id": requestID, "ok": false, "error": error.localizedDescription])
        }
    }

    private func sendJavaScript(function: String, payload: Any) {
        guard let webView else { return }
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.\(function)(\(json))", completionHandler: nil)
    }

    private func updateWindowDocumentState() {
        guard let window else { return }
        window.isDocumentEdited = documentState.dirty
        window.representedURL = documentState.filePath.map { URL(fileURLWithPath: $0) }
        window.title = "\(documentState.title)\(documentState.dirty ? " — Edited" : "") — TypeOpen"
    }

    private func requireDictionary(_ value: Any?) throws -> [String: Any] {
        guard let dictionary = value as? [String: Any] else { throw TypeOpenNativeError.message("A valid request payload is required.") }
        return dictionary
    }

    private func requireString(_ value: Any?, _ message: String) throws -> String {
        guard let value = value as? String, !value.isEmpty else { throw TypeOpenNativeError.message(message) }
        return value
    }

    private func isEditableDocument(_ filePath: String) -> Bool {
        let ext = URL(fileURLWithPath: filePath).pathExtension.lowercased()
        return ext == "textbundle" || markdownExtensions.contains(ext) || pandocImportExtensions.contains(ext)
    }

    private func noteRecent(_ filePath: String) {
        NSDocumentController.shared.noteNewRecentDocumentURL(URL(fileURLWithPath: filePath))
    }

    private func chooseOpenFile() throws -> Any? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        panel.treatsFilePackagesAsDirectories = false
        panel.allowedContentTypes = (markdownExtensions.union(pandocImportExtensions).union(["textbundle"]))
            .compactMap { UTType(filenameExtension: $0) }
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        guard isEditableDocument(url.path) else { throw TypeOpenNativeError.message("Choose a supported document type.") }
        let path = try grants.grantDocument(url.path)
        noteRecent(path)
        return ["filePath": path, "imported": pandocImportExtensions.contains(url.pathExtension.lowercased())]
    }

    private func chooseOpenFolder() throws -> Any? {
        let panel = NSOpenPanel()
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = false
        panel.allowsMultipleSelection = false
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        let folderPath = try grants.setFolder(url.path)
        return ["folderPath": folderPath, "tree": try listDirectory(folderPath)]
    }

    private func chooseThemeCSS() throws -> Any? {
        let panel = NSOpenPanel()
        panel.title = "Choose Custom Theme CSS"
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = false
        if let css = UTType(filenameExtension: "css") { panel.allowedContentTypes = [css] }
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        let css = try readStableTextFile(url.path, maximumBytes: maxThemeCSSBytes)
        return ["name": url.lastPathComponent, "css": try sanitizeThemeCSS(css)]
    }

    private func readGrantedDocument(_ filePath: String) throws -> [String: Any] {
        guard let normalized = normalizedPath(filePath),
              let before = grants.readableSnapshot(normalized),
              let identityBefore = nativePathSnapshot(normalized, rejectSymbolicLink: false),
              identityBefore.realPath == before,
              grants.readableSnapshot(normalized) == before else {
            throw TypeOpenNativeError.message("Document path has not been granted by the user.")
        }
        let content = try readDocument(normalized, expectedSnapshot: identityBefore)
        guard realPath(normalized) == before,
              grants.readableSnapshot(normalized) == before,
              nativePathSnapshot(normalized, rejectSymbolicLink: false) == identityBefore else {
            throw TypeOpenNativeError.message("Document path changed while it was being read.")
        }
        try grants.grantDocument(normalized, expectedRealPath: before)
        noteRecent(normalized)
        return [
            "filePath": normalized,
            "content": content,
            "imported": pandocImportExtensions.contains(URL(fileURLWithPath: normalized).pathExtension.lowercased())
        ]
    }

    private func listGrantedFolder(_ folderPath: String) throws -> [String: Any] {
        guard let normalized = normalizedPath(folderPath),
              grants.canListFolder(normalized),
              let before = realPath(normalized),
              let identityBefore = nativePathSnapshot(normalized, rejectSymbolicLink: false, requiredType: S_IFDIR),
              grants.canListFolder(normalized) else {
            throw TypeOpenNativeError.message("Folder path has not been granted by the user.")
        }
        let tree = try listDirectory(normalized)
        guard realPath(normalized) == before,
              grants.canListFolder(normalized),
              nativePathSnapshot(normalized, rejectSymbolicLink: false, requiredType: S_IFDIR) == identityBefore else {
            throw TypeOpenNativeError.message("Folder path changed while it was being read.")
        }
        return ["folderPath": normalized, "tree": tree]
    }

    private func listDirectory(_ rootPath: String, depth: Int = 0) throws -> [[String: Any]] {
        if depth > 14 { return [] }
        guard let authorizedRoot = grants.getFolderRealPath(), let rootReal = realPath(rootPath), isInsideOrEqual(rootReal, authorizedRoot) else { return [] }
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey]
        let urls = try FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: rootPath), includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles])
            .filter { $0.lastPathComponent != "node_modules" && $0.lastPathComponent != "Library" }
            .sorted { lhs, rhs in
                let lv = try? lhs.resourceValues(forKeys: keys)
                let rv = try? rhs.resourceValues(forKeys: keys)
                if lv?.isDirectory != rv?.isDirectory { return lv?.isDirectory == true }
                return lhs.lastPathComponent.localizedStandardCompare(rhs.lastPathComponent) == .orderedAscending
            }

        var result: [[String: Any]] = []
        for url in urls {
            let values = try url.resourceValues(forKeys: keys)
            if values.isSymbolicLink == true { continue }
            guard let candidateReal = realPath(url.path), isInsideOrEqual(candidateReal, authorizedRoot) else { continue }
            if values.isDirectory == true && url.pathExtension.lowercased() == "textbundle" {
                result.append(["type": "file", "name": url.lastPathComponent, "path": url.path])
            } else if values.isDirectory == true {
                result.append(["type": "directory", "name": url.lastPathComponent, "path": url.path, "children": try listDirectory(url.path, depth: depth + 1)])
            } else if isEditableDocument(url.path) || imageMimeTypes[url.pathExtension.lowercased()] != nil {
                result.append(["type": "file", "name": url.lastPathComponent, "path": url.path])
            }
        }
        return result
    }

    private func searchGrantedFolder(_ payload: [String: Any]) throws -> [String: Any] {
        guard let folderPath = grants.getFolder(), let query = payload["query"] as? String, !query.isEmpty else {
            return ["results": [], "truncated": false]
        }
        guard grants.canListFolder(folderPath),
              let identityBefore = nativePathSnapshot(folderPath, rejectSymbolicLink: false, requiredType: S_IFDIR),
              grants.canListFolder(folderPath) else {
            throw TypeOpenNativeError.message("Folder path has not been granted by the user.")
        }
        var results: [[String: Any]] = []
        try searchFolder(folderPath, authorizedRoot: identityBefore, query: query, matchCase: (payload["matchCase"] as? Bool) ?? false, results: &results)
        guard realPath(folderPath) == identityBefore.realPath,
              grants.canListFolder(folderPath),
              nativePathSnapshot(folderPath, rejectSymbolicLink: false, requiredType: S_IFDIR) == identityBefore else {
            throw TypeOpenNativeError.message("Folder path changed while it was being searched.")
        }
        return ["results": results, "truncated": results.count >= globalSearchMaxResults]
    }

    private func searchFolder(_ rootPath: String, authorizedRoot: NativePathSnapshot, query: String, matchCase: Bool, results: inout [[String: Any]]) throws {
        guard results.count < globalSearchMaxResults,
              grants.getFolderRealPath() == authorizedRoot.realPath,
              let rootReal = realPath(rootPath),
              isInsideOrEqual(rootReal, authorizedRoot.realPath) else { return }
        let keys: Set<URLResourceKey> = [.isDirectoryKey, .isSymbolicLinkKey, .fileSizeKey]
        let urls = (try? FileManager.default.contentsOfDirectory(at: URL(fileURLWithPath: rootPath), includingPropertiesForKeys: Array(keys), options: [.skipsHiddenFiles])) ?? []
        for url in urls {
            if results.count >= globalSearchMaxResults || grants.getFolderRealPath() != authorizedRoot.realPath { return }
            if url.lastPathComponent == "node_modules" { continue }
            let values = try? url.resourceValues(forKeys: keys)
            if values?.isSymbolicLink == true { continue }
            guard let candidateReal = realPath(url.path), isInsideOrEqual(candidateReal, authorizedRoot.realPath) else { continue }

            if values?.isDirectory == true && url.pathExtension.lowercased() == "textbundle" {
                if let content = try? readTextBundlePayload(url.path, authorizedRootSnapshot: authorizedRoot, maximumBytes: globalSearchMaxFileBytes) {
                    appendSearchMatches(filePath: url.path, relativePath: relativePath(url.path, to: grants.getFolder() ?? rootPath), content: content, query: query, matchCase: matchCase, results: &results)
                }
            } else if values?.isDirectory == true {
                try searchFolder(url.path, authorizedRoot: authorizedRoot, query: query, matchCase: matchCase, results: &results)
            } else if markdownExtensions.contains(url.pathExtension.lowercased()),
                      let candidate = nativePathSnapshot(url.path, rejectSymbolicLink: true, requiredType: S_IFREG),
                      isInsideOrEqual(candidate.realPath, authorizedRoot.realPath),
                      let content = try? readStableTextFile(candidate, authorizedRoot: authorizedRoot, maximumBytes: globalSearchMaxFileBytes) {
                appendSearchMatches(filePath: url.path, relativePath: relativePath(url.path, to: grants.getFolder() ?? rootPath), content: content, query: query, matchCase: matchCase, results: &results)
            }
        }
    }

    private func appendSearchMatches(filePath: String, relativePath: String, content: String, query: String, matchCase: Bool, results: inout [[String: Any]]) {
        let needle = matchCase ? query : query.lowercased()
        for (index, rawLine) in content.components(separatedBy: .newlines).enumerated() {
            if results.count >= globalSearchMaxResults { return }
            let haystack = matchCase ? rawLine : rawLine.lowercased()
            guard let range = haystack.range(of: needle) else { continue }
            let column = haystack.distance(from: haystack.startIndex, to: range.lowerBound)
            let characters = Array(rawLine)
            let start = max(0, column - 60)
            let end = min(characters.count, column + query.count + 100)
            let preview = String(characters[start..<end]).replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespacesAndNewlines)
            results.append([
                "filePath": filePath,
                "relativePath": relativePath,
                "line": index + 1,
                "preview": "\(start > 0 ? "…" : "")\(preview)\(end < characters.count ? "…" : "")"
            ])
        }
    }

    private func readDocument(_ filePath: String, expectedSnapshot: NativePathSnapshot) throws -> String {
        let ext = URL(fileURLWithPath: filePath).pathExtension.lowercased()
        if ext == "textbundle" {
            return try readTextBundlePayload(filePath, expectedBundleSnapshot: expectedSnapshot)
        }
        guard expectedSnapshot.fileType == mode_t(S_IFREG) else {
            throw TypeOpenNativeError.message("Document is not a regular local file.")
        }
        if pandocImportExtensions.contains(ext) {
            guard let pandoc = locatePandoc() else { throw TypeOpenNativeError.message("Pandoc is required to import .\(ext) files.") }
            let sourceData = try readStableDataFile(expectedSnapshot)
            let tempDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("typeopen-import-\(UUID().uuidString)", isDirectory: true)
            try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: false)
            defer { try? FileManager.default.removeItem(at: tempDir) }
            let tempSource = tempDir.appendingPathComponent("source.\(ext)")
            try sourceData.write(to: tempSource, options: [.atomic])
            return try runProcess(executable: pandoc, arguments: [tempSource.path, "--to=gfm+yaml_metadata_block"]).stdout
        }
        return try readStableTextFile(expectedSnapshot)
    }

    private func writeDocument(payload: [String: Any], saveAs: Bool) throws -> Any? {
        guard let content = payload["content"] as? String else { throw TypeOpenNativeError.message("Document content must be text.") }
        var destination = payload["filePath"] as? String
        if !saveAs, let destination, !grants.canWriteDocument(destination) { throw TypeOpenNativeError.message("Document path is not open for writing.") }

        if saveAs || destination == nil {
            let panel = NSSavePanel()
            let suggested = (payload["suggestedName"] as? String).flatMap { $0.isEmpty ? nil : URL(fileURLWithPath: $0).lastPathComponent } ?? "\(documentState.title).md"
            panel.nameFieldStringValue = destination.map { URL(fileURLWithPath: $0).lastPathComponent } ?? suggested
            if let destination { panel.directoryURL = URL(fileURLWithPath: destination).deletingLastPathComponent() }
            guard panel.runModal() == .OK, let url = panel.url else { return nil }
            destination = url.path
        }
        guard let destination else { return nil }

        if destination.lowercased().hasSuffix(".textbundle") {
            if FileManager.default.fileExists(atPath: destination) {
                guard let expectedBundle = nativePathSnapshot(destination, rejectSymbolicLink: true, requiredType: S_IFDIR) else {
                    throw TypeOpenNativeError.message("TextBundle must be a safe directory package.")
                }
                if !saveAs, !grants.isDocumentGranted(destination) {
                    throw TypeOpenNativeError.message("TextBundle changed after it was authorized for writing.")
                }
                try writeTextBundlePayload(destination, content: content, expectedBundleSnapshot: expectedBundle)
            } else {
                try createTextBundle(destination, content: content)
            }
        } else {
            try content.write(toFile: destination, atomically: true, encoding: .utf8)
        }
        let granted = try grants.grantDocument(destination)
        noteRecent(granted)
        return ["filePath": granted]
    }

    private func duplicateDocument(payload: [String: Any]) throws -> Any? {
        guard let sourcePath = payload["filePath"] as? String, grants.canWriteDocument(sourcePath), isEditableDocument(sourcePath), FileManager.default.fileExists(atPath: sourcePath) else {
            throw TypeOpenNativeError.message("The current document is not a saved local document.")
        }
        guard !isSymbolicLink(sourcePath) else { throw TypeOpenNativeError.message("Symbolic-link documents are not supported for duplicate/move operations.") }
        let sourceURL = URL(fileURLWithPath: sourcePath)
        let panel = NSSavePanel()
        panel.title = "Duplicate Document"
        panel.prompt = "Duplicate"
        panel.directoryURL = sourceURL.deletingLastPathComponent()
        panel.nameFieldStringValue = "\(sourceURL.deletingPathExtension().lastPathComponent) copy.\(sourceURL.pathExtension)"
        guard panel.runModal() == .OK, let destinationURL = panel.url else { return nil }
        try assertSameDocumentExtension(sourcePath, destinationURL.path)
        guard normalizedPath(sourcePath) != normalizedPath(destinationURL.path) else { throw TypeOpenNativeError.message("Choose a different name or location for the duplicate.") }
        guard !FileManager.default.fileExists(atPath: destinationURL.path) else { throw TypeOpenNativeError.message("Destination already exists.") }

        do {
            try FileManager.default.copyItem(at: sourceURL, to: destinationURL)
            if let content = payload["content"] as? String {
                if destinationURL.pathExtension.lowercased() == "textbundle" { try writeTextBundlePayload(destinationURL.path, content: content) }
                else { try content.write(to: destinationURL, atomically: true, encoding: .utf8) }
            }
        } catch {
            try? FileManager.default.removeItem(at: destinationURL)
            throw error
        }
        let destination = try grants.grantDocument(destinationURL.path)
        noteRecent(destination)
        return ["filePath": destination]
    }

    private func renameDocument(_ sourcePath: String) throws -> Any? {
        guard grants.canWriteDocument(sourcePath), isEditableDocument(sourcePath), FileManager.default.fileExists(atPath: sourcePath) else {
            throw TypeOpenNativeError.message("The current document is not a saved local document.")
        }
        let sourceURL = URL(fileURLWithPath: sourcePath)
        let panel = NSSavePanel()
        panel.title = "Rename Document"
        panel.prompt = "Rename"
        panel.directoryURL = sourceURL.deletingLastPathComponent()
        panel.nameFieldStringValue = sourceURL.lastPathComponent
        guard panel.runModal() == .OK, let destinationURL = panel.url else { return nil }
        try assertSameDocumentExtension(sourcePath, destinationURL.path)
        guard normalizedPath(destinationURL.deletingLastPathComponent().path) == normalizedPath(sourceURL.deletingLastPathComponent().path) else {
            throw TypeOpenNativeError.message("Rename keeps the document in its current folder. Use Move To for another folder.")
        }
        if normalizedPath(destinationURL.path) == normalizedPath(sourcePath) { return ["filePath": sourcePath] }
        try moveDocumentPath(sourcePath, destinationURL.path)
        grants.revokeDocument(sourcePath)
        let destination = try grants.grantDocument(destinationURL.path)
        noteRecent(destination)
        return ["filePath": destination]
    }

    private func moveDocument(_ sourcePath: String) throws -> Any? {
        guard grants.canWriteDocument(sourcePath), isEditableDocument(sourcePath), FileManager.default.fileExists(atPath: sourcePath) else {
            throw TypeOpenNativeError.message("The current document is not a saved local document.")
        }
        guard !isSymbolicLink(sourcePath) else { throw TypeOpenNativeError.message("Symbolic-link documents are not supported for duplicate/move operations.") }
        let panel = NSOpenPanel()
        panel.title = "Move Document To"
        panel.prompt = "Move"
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        guard panel.runModal() == .OK, let directory = panel.url else { return nil }
        let destinationURL = directory.appendingPathComponent(URL(fileURLWithPath: sourcePath).lastPathComponent)
        if normalizedPath(destinationURL.path) == normalizedPath(sourcePath) { return ["filePath": sourcePath] }
        try moveDocumentPath(sourcePath, destinationURL.path)
        grants.revokeDocument(sourcePath)
        let destination = try grants.grantDocument(destinationURL.path)
        noteRecent(destination)
        return ["filePath": destination]
    }

    private func assertSameDocumentExtension(_ sourcePath: String, _ destinationPath: String) throws {
        if URL(fileURLWithPath: sourcePath).pathExtension.lowercased() != URL(fileURLWithPath: destinationPath).pathExtension.lowercased() {
            throw TypeOpenNativeError.message("Keep the original extension for this document operation.")
        }
    }

    private func moveDocumentPath(_ sourcePath: String, _ destinationPath: String) throws {
        guard !FileManager.default.fileExists(atPath: destinationPath) else { throw TypeOpenNativeError.message("Destination already exists.") }
        do {
            try FileManager.default.moveItem(atPath: sourcePath, toPath: destinationPath)
        } catch let moveError {
            do {
                try FileManager.default.copyItem(atPath: sourcePath, toPath: destinationPath)
                do {
                    try FileManager.default.removeItem(atPath: sourcePath)
                } catch {
                    try? FileManager.default.removeItem(atPath: destinationPath)
                    throw error
                }
            } catch {
                throw moveError
            }
        }
    }

    private struct TextBundlePayloadSnapshot {
        let bundle: NativePathSnapshot
        let payloadPath: String
        let payload: NativePathSnapshot
    }

    private func resolveTextBundlePayloadSnapshot(
        _ bundlePath: String,
        authorizedRootSnapshot: NativePathSnapshot? = nil,
        expectedBundleSnapshot: NativePathSnapshot? = nil
    ) throws -> TextBundlePayloadSnapshot {
        guard URL(fileURLWithPath: bundlePath).pathExtension.lowercased() == "textbundle" else { throw TypeOpenNativeError.message("Not a TextBundle path.") }
        guard let bundle = nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) else {
            throw TypeOpenNativeError.message("TextBundle must be a directory package.")
        }
        if let expectedBundleSnapshot, bundle != expectedBundleSnapshot {
            throw TypeOpenNativeError.message("TextBundle changed after it was authorized.")
        }
        if let authorizedRootSnapshot, !isInsideOrEqual(bundle.realPath, authorizedRootSnapshot.realPath) {
            throw TypeOpenNativeError.message("TextBundle is outside the authorized directory.")
        }
        var candidates: [String] = []
        let infoURL = URL(fileURLWithPath: bundlePath).appendingPathComponent("info.json")
        if let infoSnapshot = nativePathSnapshot(infoURL.path, rejectSymbolicLink: true, requiredType: S_IFREG),
           isInsideOrEqual(infoSnapshot.realPath, bundle.realPath),
           let data = try? readStableDataFile(infoSnapshot, authorizedRoot: bundle, maximumBytes: 1024 * 1024),
           let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let text = info["text"] as? String {
            candidates.append(text)
        }
        guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == bundle else {
            throw TypeOpenNativeError.message("TextBundle changed while its metadata was being read.")
        }
        candidates.append(contentsOf: ["text.md", "text.markdown", "text.txt"])
        var seen = Set<String>()
        for candidate in candidates {
            if candidate.isEmpty || candidate.hasPrefix("/") { continue }
            let payload = URL(fileURLWithPath: bundlePath).appendingPathComponent(candidate).standardizedFileURL.path
            guard isInsideOrEqual(payload, bundlePath), !seen.contains(payload) else { continue }
            seen.insert(payload)
            guard let payloadSnapshot = nativePathSnapshot(payload, rejectSymbolicLink: true, requiredType: S_IFREG),
                  isInsideOrEqual(payloadSnapshot.realPath, bundle.realPath) else { continue }
            return TextBundlePayloadSnapshot(bundle: bundle, payloadPath: payload, payload: payloadSnapshot)
        }
        throw TypeOpenNativeError.message("TextBundle does not contain a readable text payload.")
    }

    private func readTextBundlePayload(
        _ bundlePath: String,
        authorizedRootSnapshot: NativePathSnapshot? = nil,
        expectedBundleSnapshot: NativePathSnapshot? = nil,
        maximumBytes: Int? = nil
    ) throws -> String {
        let resolved = try resolveTextBundlePayloadSnapshot(
            bundlePath,
            authorizedRootSnapshot: authorizedRootSnapshot,
            expectedBundleSnapshot: expectedBundleSnapshot
        )
        let content = try readStableTextFile(resolved.payload, authorizedRoot: resolved.bundle, maximumBytes: maximumBytes)
        guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == resolved.bundle,
              nativePathSnapshot(resolved.payloadPath, rejectSymbolicLink: true, requiredType: S_IFREG) == resolved.payload else {
            throw TypeOpenNativeError.message("TextBundle changed while its text payload was being read.")
        }
        return content
    }

    private func writeTextBundlePayload(_ bundlePath: String, content: String, expectedBundleSnapshot: NativePathSnapshot? = nil) throws {
        let resolved = try resolveTextBundlePayloadSnapshot(bundlePath, expectedBundleSnapshot: expectedBundleSnapshot)
        guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == resolved.bundle,
              nativePathSnapshot(resolved.payloadPath, rejectSymbolicLink: true, requiredType: S_IFREG) == resolved.payload else {
            throw TypeOpenNativeError.message("TextBundle changed before its text payload could be written.")
        }
        try atomicReplaceBoundFile(target: resolved.payload, root: resolved.bundle, data: Data(content.utf8))
        guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == resolved.bundle,
              let payloadAfter = nativePathSnapshot(resolved.payloadPath, rejectSymbolicLink: true, requiredType: S_IFREG),
              isInsideOrEqual(payloadAfter.realPath, resolved.bundle.realPath) else {
            throw TypeOpenNativeError.message("TextBundle changed while its text payload was being written.")
        }
    }

    private func createTextBundle(_ bundlePath: String, content: String) throws {
        do {
            try FileManager.default.createDirectory(atPath: bundlePath, withIntermediateDirectories: false)
            guard let bundleSnapshot = nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) else {
                throw TypeOpenNativeError.message("New TextBundle directory is not safe.")
            }
            let textURL = URL(fileURLWithPath: bundlePath).appendingPathComponent("text.md")
            let infoURL = URL(fileURLWithPath: bundlePath).appendingPathComponent("info.json")
            let bundleFD = try openBoundDirectory(bundleSnapshot)
            defer { Darwin.close(bundleFD) }
            let mkdirResult = "assets".withCString { mkdirat(bundleFD, $0, mode_t(0o755)) }
            guard mkdirResult == 0 || errno == EEXIST else { throw posixFailure("Creating TextBundle assets directory") }
            guard try createBoundFile(directory: bundleSnapshot, fileName: "text.md", data: Data(content.utf8)) != nil else {
                throw TypeOpenNativeError.message("TextBundle text payload already exists unexpectedly.")
            }
            let info: [String: Any] = ["version": 2, "type": "net.daringfireball.markdown", "creatorIdentifier": "com.triherm.typeopen", "text": "text.md"]
            let data = try JSONSerialization.data(withJSONObject: info, options: [.prettyPrinted, .sortedKeys])
            guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == bundleSnapshot else {
                throw TypeOpenNativeError.message("TextBundle changed while it was being created.")
            }
            guard try createBoundFile(directory: bundleSnapshot, fileName: "info.json", data: data) != nil else {
                throw TypeOpenNativeError.message("TextBundle metadata already exists unexpectedly.")
            }
            guard nativePathSnapshot(bundlePath, rejectSymbolicLink: true, requiredType: S_IFDIR) == bundleSnapshot,
                  let textSnapshot = nativePathSnapshot(textURL.path, rejectSymbolicLink: true, requiredType: S_IFREG),
                  let infoSnapshot = nativePathSnapshot(infoURL.path, rejectSymbolicLink: true, requiredType: S_IFREG),
                  let assetsSnapshot = nativePathSnapshot(URL(fileURLWithPath: bundlePath).appendingPathComponent("assets").path, rejectSymbolicLink: true, requiredType: S_IFDIR),
                  isInsideOrEqual(textSnapshot.realPath, bundleSnapshot.realPath),
                  isInsideOrEqual(infoSnapshot.realPath, bundleSnapshot.realPath),
                  isInsideOrEqual(assetsSnapshot.realPath, bundleSnapshot.realPath) else {
                throw TypeOpenNativeError.message("TextBundle changed while it was being created.")
            }
        } catch {
            // Do not path-delete a partially created package here: an attacker
            // could replace the pathname between validation and cleanup. The
            // write operations above are descriptor-bound; leaving a partial
            // package on failure is safer than deleting a replacement inode.
            throw error
        }
    }

    private func documentBaseDirectory() -> String? {
        if let filePath = documentState.filePath, grants.isDocumentGranted(filePath) {
            if URL(fileURLWithPath: filePath).pathExtension.lowercased() == "textbundle" { return filePath }
            return URL(fileURLWithPath: filePath).deletingLastPathComponent().path
        }
        return grants.getFolder()
    }

    private func localImageDataURL(_ source: String) throws -> String {
        if source.range(of: #"^(?:data:|blob:|https?:)"#, options: [.regularExpression, .caseInsensitive]) != nil { return source }
        guard let baseDir = documentBaseDirectory(),
              let baseSnapshot = nativePathSnapshot(baseDir, rejectSymbolicLink: false, requiredType: S_IFDIR) else { return blockedImageDataURL }
        let baseReal = baseSnapshot.realPath
        let localPath: String
        if source.lowercased().hasPrefix("file:"), let url = URL(string: source), url.isFileURL {
            localPath = url.path
        } else if source.hasPrefix("/") {
            localPath = source
        } else {
            let raw = source.split(whereSeparator: { $0 == "?" || $0 == "#" }).first.map(String.init) ?? source
            let decoded = raw.removingPercentEncoding ?? raw
            localPath = URL(fileURLWithPath: baseDir).appendingPathComponent(decoded).standardizedFileURL.path
        }
        guard isInsideOrEqual(localPath, baseDir),
              let localSnapshot = nativePathSnapshot(localPath, rejectSymbolicLink: true, requiredType: S_IFREG),
              isInsideOrEqual(localSnapshot.realPath, baseReal) else { return blockedImageDataURL }
        let ext = URL(fileURLWithPath: localPath).pathExtension.lowercased()
        guard let mime = imageMimeTypes[ext], isRegularFile(localPath), fileSize(localPath) <= 64 * 1024 * 1024 else { return blockedImageDataURL }
        let data = try readStableDataFile(localSnapshot, authorizedRoot: baseSnapshot, maximumBytes: 64 * 1024 * 1024)
        guard nativePathSnapshot(baseDir, rejectSymbolicLink: false, requiredType: S_IFDIR) == baseSnapshot,
              nativePathSnapshot(localPath, rejectSymbolicLink: true, requiredType: S_IFREG) == localSnapshot else {
            return blockedImageDataURL
        }
        return "data:\(mime);base64,\(data.base64EncodedString())"
    }

    private func resolveImagePreview(_ source: String) throws -> String {
        try localImageDataURL(source)
    }

    private func saveImageAsset(payload: [String: Any]) throws -> [String: Any] {
        guard let dataURL = payload["dataUrl"] as? String, let comma = dataURL.firstIndex(of: ",") else { throw TypeOpenNativeError.message("Image payload is not a supported data URL.") }
        let header = String(dataURL[..<comma])
        guard header.hasPrefix("data:image/"), header.hasSuffix(";base64") else { throw TypeOpenNativeError.message("Image payload is not a supported data URL.") }
        let mime = String(header.dropFirst(5).dropLast(7))
        let extensionByMime = ["image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg", "image/avif": "avif"]
        guard let ext = extensionByMime[mime], let data = Data(base64Encoded: String(dataURL[dataURL.index(after: comma)...])) else { throw TypeOpenNativeError.message("Image payload is not valid base64 data.") }
        guard let baseDir = documentBaseDirectory(),
              let baseSnapshot = nativePathSnapshot(baseDir, rejectSymbolicLink: false, requiredType: S_IFDIR) else { return ["url": dataURL] }
        let assetsSnapshot = try ensureBoundSubdirectory(parent: baseSnapshot, name: "assets")
        let suppliedName = payload["name"] as? String ?? "image"
        var stem = URL(fileURLWithPath: suppliedName).deletingPathExtension().lastPathComponent
            .replacingOccurrences(of: #"[^a-zA-Z0-9-_]+"#, with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        if stem.isEmpty { stem = "image-\(Int(Date().timeIntervalSince1970 * 1000))" }
        var fileName = "\(stem).\(ext)"
        var counter = 2
        while try createBoundFile(directory: assetsSnapshot, fileName: fileName, data: data) == nil {
            fileName = "\(stem)-\(counter).\(ext)"
            counter += 1
        }
        return ["url": "assets/\(fileName)"]
    }

    private func inlineLocalImages(_ html: String) throws -> String {
        let regex = try NSRegularExpression(pattern: #"(<img\b[^>]*?\bsrc=[\"'])([^\"']+)([\"'][^>]*>)"#, options: [.caseInsensitive])
        let mutable = NSMutableString(string: html)
        let fullRange = NSRange(location: 0, length: (html as NSString).length)
        let matches = regex.matches(in: html, range: fullRange)
        for match in matches.reversed() where match.numberOfRanges >= 3 {
            let source = (html as NSString).substring(with: match.range(at: 2))
            if source.range(of: #"^(?:data:|https?:|blob:|#)"#, options: [.regularExpression, .caseInsensitive]) != nil { continue }
            let replacement = try localImageDataURL(source)
            mutable.replaceCharacters(in: match.range(at: 2), with: replacement)
        }
        return mutable as String
    }

    private func defaultExportName(_ ext: String) -> String {
        let source = documentState.filePath.map { URL(fileURLWithPath: $0).deletingPathExtension().lastPathComponent } ?? documentState.title
        return "\(source.isEmpty ? "Untitled" : source).\(ext)"
    }

    private func exportHTML(payload: [String: Any]) throws -> Any? {
        guard let html = payload["html"] as? String else { throw TypeOpenNativeError.message("Export HTML is required.") }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = defaultExportName("html")
        if let type = UTType(filenameExtension: "html") { panel.allowedContentTypes = [type] }
        guard panel.runModal() == .OK, let url = panel.url else { return nil }
        var output = try inlineLocalImages(html)
        if (payload["styled"] as? Bool) == false {
            output = output.replacingOccurrences(of: #"<style[\s\S]*?</style>"#, with: "", options: [.regularExpression, .caseInsensitive])
        }
        try output.write(to: url, atomically: true, encoding: .utf8)
        return ["filePath": url.path]
    }

    private func exportPDF(payload: Any?, completion: @escaping (Result<Any?, Error>) -> Void) {
        do {
            let payload = try requireDictionary(payload)
            guard let html = payload["html"] as? String else { throw TypeOpenNativeError.message("Export HTML is required.") }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = defaultExportName("pdf")
            if let type = UTType.pdf as UTType? { panel.allowedContentTypes = [type] }
            guard panel.runModal() == .OK, let url = panel.url else { completion(.success(nil)); return }
            let output = try inlineLocalImages(html)
            startRenderJob(html: output) { job, finish in
                do {
                    try job.exportPDF(to: url, pageSetup: payload["pageSetup"] as? [String: Any])
                    finish()
                    completion(.success(["filePath": url.path]))
                } catch {
                    finish()
                    completion(.failure(error))
                }
            } onFailure: { error in completion(.failure(error)) }
        } catch {
            completion(.failure(error))
        }
    }

    private func exportPNG(payload: Any?, completion: @escaping (Result<Any?, Error>) -> Void) {
        do {
            let payload = try requireDictionary(payload)
            guard let html = payload["html"] as? String else { throw TypeOpenNativeError.message("Export HTML is required.") }
            let panel = NSSavePanel()
            panel.nameFieldStringValue = defaultExportName("png")
            if let type = UTType.png as UTType? { panel.allowedContentTypes = [type] }
            guard panel.runModal() == .OK, let url = panel.url else { completion(.success(nil)); return }
            let output = try inlineLocalImages(html)
            startRenderJob(html: output) { job, finish in
                job.snapshotPNG { result in
                    defer { finish() }
                    do {
                        let data = try result.get()
                        try data.write(to: url, options: .atomic)
                        completion(.success(["filePath": url.path]))
                    } catch {
                        completion(.failure(error))
                    }
                }
            } onFailure: { error in completion(.failure(error)) }
        } catch {
            completion(.failure(error))
        }
    }

    private func printHTML(payload: Any?, completion: @escaping (Result<Any?, Error>) -> Void) {
        do {
            let payload = try requireDictionary(payload)
            guard let html = payload["html"] as? String else { throw TypeOpenNativeError.message("Print HTML is required.") }
            let output = try inlineLocalImages(html)
            startRenderJob(html: output) { job, finish in
                let success = job.printDocument(pageSetup: payload["pageSetup"] as? [String: Any])
                finish()
                completion(.success(success ? ["ok": true] : ["ok": false, "error": "Print was cancelled."]))
            } onFailure: { error in completion(.failure(error)) }
        } catch {
            completion(.failure(error))
        }
    }

    private func startRenderJob(html: String, operation: @escaping (RenderJob, @escaping () -> Void) -> Void, onFailure: @escaping (Error) -> Void) {
        let id = UUID()
        var job: RenderJob!
        job = RenderJob(html: html) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let readyJob):
                operation(readyJob) { [weak self] in self?.renderJobs.removeValue(forKey: id) }
            case .failure(let error):
                self.renderJobs.removeValue(forKey: id)
                onFailure(error)
            }
        }
        renderJobs[id] = job
    }

    private func exportPandoc(payload: [String: Any]) throws -> Any? {
        guard let pandoc = locatePandoc() else { return ["ok": false, "error": "Pandoc is not installed. Install Pandoc 2.0+ to enable this export format."] }
        guard let markdown = payload["markdown"] as? String, let format = payload["format"] as? String else { throw TypeOpenNativeError.message("Pandoc export payload is incomplete.") }
        let formats: [String: (ext: String, to: String)] = [
            "docx": ("docx", "docx"), "odt": ("odt", "odt"), "rtf": ("rtf", "rtf"),
            "epub": ("epub", "epub"), "latex": ("tex", "latex"), "mediawiki": ("mediawiki", "mediawiki")
        ]
        guard let spec = formats[format] else { throw TypeOpenNativeError.message("Unsupported export format: \(format)") }
        let panel = NSSavePanel()
        panel.nameFieldStringValue = defaultExportName(spec.ext)
        if let type = UTType(filenameExtension: spec.ext) { panel.allowedContentTypes = [type] }
        guard panel.runModal() == .OK, let destination = panel.url else { return nil }
        let tempDir = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("typeopen-export-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: false)
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let source = tempDir.appendingPathComponent("source.md")
        try markdown.write(to: source, atomically: true, encoding: .utf8)
        do {
            _ = try runProcess(executable: pandoc, arguments: [source.path, "--from=gfm+yaml_metadata_block", "--to=\(spec.to)", "--output", destination.path])
            return ["ok": true, "filePath": destination.path]
        } catch {
            return ["ok": false, "error": error.localizedDescription]
        }
    }

    private func locatePandoc() -> String? {
        let candidates = ["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc"] +
            (ProcessInfo.processInfo.environment["PATH"] ?? "").split(separator: ":").map { "\($0)/pandoc" }
        return candidates.first { FileManager.default.isExecutableFile(atPath: $0) }
    }

    private func runProcess(executable: String, arguments: [String]) throws -> (stdout: String, stderr: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr
        try process.run()
        process.waitUntilExit()
        let outData = stdout.fileHandleForReading.readDataToEndOfFile()
        let errData = stderr.fileHandleForReading.readDataToEndOfFile()
        let out = String(data: outData, encoding: .utf8) ?? ""
        let err = String(data: errData, encoding: .utf8) ?? ""
        guard process.terminationStatus == 0 else {
            throw TypeOpenNativeError.message(err.isEmpty ? "Pandoc exited with status \(process.terminationStatus)." : err)
        }
        return (out, err)
    }

    private func confirmDiscard(_ payload: [String: Any]?) -> String {
        let title = (payload?["title"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? documentState.title
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Save changes to “\(title)” before continuing?"
        alert.informativeText = "Unsaved changes will be lost if you discard them."
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Discard Changes")
        alert.addButton(withTitle: "Cancel")
        switch alert.runModal() {
        case .alertFirstButtonReturn: return "save"
        case .alertSecondButtonReturn: return "discard"
        default: return "cancel"
        }
    }
}

private func relativePath(_ path: String, to root: String) -> String {
    guard let normalized = normalizedPath(path), let base = normalizedPath(root), isInsideOrEqual(normalized, base) else { return path }
    if normalized == base { return URL(fileURLWithPath: normalized).lastPathComponent }
    return String(normalized.dropFirst(base.count + (base == "/" ? 0 : 1)))
}

private func fileSize(_ path: String) -> Int {
    ((try? FileManager.default.attributesOfItem(atPath: path)[.size]) as? NSNumber)?.intValue ?? Int.max
}

private func isSymbolicLink(_ path: String) -> Bool {
    var status = stat()
    guard lstat(path, &status) == 0 else { return false }
    return (status.st_mode & S_IFMT) == S_IFLNK
}

private func isRegularFile(_ path: String) -> Bool {
    var status = stat()
    guard lstat(path, &status) == 0 else { return false }
    return (status.st_mode & S_IFMT) == S_IFREG
}

private func isDirectory(_ path: String) -> Bool {
    var status = stat()
    guard lstat(path, &status) == 0 else { return false }
    return (status.st_mode & S_IFMT) == S_IFDIR
}
