import AppKit
import WebKit

@main
@MainActor
struct TypeOpenMain {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.setActivationPolicy(.regular)
        application.run()
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, NSMenuDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var bridge: NativeBridge!
    private var rendererSchemeHandler: RendererSchemeHandler!
    private var forceClose = false
    private var quitAfterSave = false
    private var terminating = false
    private var pendingSystemPaths: [String] = []
    private weak var recentDocumentsMenu: NSMenu?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        guard let rendererRoot = Bundle.main.resourceURL?.appendingPathComponent("renderer", isDirectory: true) else {
            presentFatalError("The TypeOpen renderer bundle is missing.")
            return
        }
        rendererSchemeHandler = RendererSchemeHandler(rendererRoot: rendererRoot)
        configuration.setURLSchemeHandler(rendererSchemeHandler, forURLScheme: RendererSchemeHandler.scheme)

        webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 820), configuration: configuration)
        webView.autoresizingMask = [.width, .height]
        webView.allowsMagnification = true

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.minSize = NSSize(width: 720, height: 520)
        window.center()
        window.title = "TypeOpen"
        window.titleVisibility = .hidden
        window.titlebarAppearsTransparent = true
        window.isMovableByWindowBackground = false
        window.isReleasedWhenClosed = false
        window.delegate = self
        window.contentView = webView

        bridge = NativeBridge(window: window, webView: webView)
        bridge.onCloseAfterSave = { [weak self] in self?.closeAfterSave() }
        webView.configuration.userContentController.add(bridge, name: "typeopen")
        webView.navigationDelegate = bridge

        do {
            guard let scriptURL = Bundle.main.url(forResource: "bridge", withExtension: "js") else {
                throw TypeOpenNativeError.message("Native bridge.js is missing from the application bundle.")
            }
            let bridgeSource = try String(contentsOf: scriptURL, encoding: .utf8)
            webView.configuration.userContentController.addUserScript(WKUserScript(source: bridgeSource, injectionTime: .atDocumentStart, forMainFrameOnly: true))

            guard FileManager.default.fileExists(atPath: rendererRoot.appendingPathComponent("index.html").path) else {
                throw TypeOpenNativeError.message("The TypeOpen renderer bundle is missing.")
            }
            guard let rendererURL = URL(string: "\(RendererSchemeHandler.scheme)://\(RendererSchemeHandler.host)/index.html") else {
                throw TypeOpenNativeError.message("The TypeOpen renderer URL is invalid.")
            }
            webView.load(URLRequest(url: rendererURL))
        } catch {
            presentFatalError(error.localizedDescription)
            return
        }

        NSApp.mainMenu = makeMainMenu()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        for path in pendingSystemPaths { bridge.queueSystemOpenPath(path) }
        pendingSystemPaths.removeAll()
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls where url.isFileURL {
            if bridge == nil { pendingSystemPaths.append(url.path) }
            else { bridge.queueSystemOpenPath(url.path) }
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            forceClose = false
            quitAfterSave = false
            terminating = false
            window?.makeKeyAndOrderFront(nil)
        }
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard !forceClose, bridge?.documentState.hasDirtyDocuments == true else {
            quitAfterSave = false
            terminating = true
            return .terminateNow
        }
        switch runCloseAlert() {
        case .alertFirstButtonReturn:
            forceClose = false
            quitAfterSave = true
            bridge.sendCommand("save-all-before-close")
            return .terminateCancel
        case .alertSecondButtonReturn:
            quitAfterSave = false
            forceClose = true
            terminating = true
            return .terminateNow
        default:
            quitAfterSave = false
            return .terminateCancel
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // A window close is a separate intent from a previously cancelled or
        // failed app-quit save. Do not let stale quitAfterSave state turn a
        // later successful Save All into NSApp.terminate(). Preserve the
        // one-shot forceClose bypass used by closeAfterSave itself.
        if !terminating && !forceClose {
            quitAfterSave = false
        }
        guard !forceClose, bridge?.documentState.hasDirtyDocuments == true else { return true }
        switch runCloseAlert() {
        case .alertFirstButtonReturn:
            bridge.sendCommand("save-all-before-close")
            return false
        case .alertSecondButtonReturn:
            forceClose = true
            return true
        default:
            return false
        }
    }

    func windowWillClose(_ notification: Notification) {
        forceClose = false
        if !terminating {
            quitAfterSave = false
        }
        if !terminating {
            webView.reload()
        }
    }

    private func runCloseAlert() -> NSApplication.ModalResponse {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Do you want to save changes to the open documents?"
        alert.informativeText = "Unsaved changes in any open tab will be lost if you do not save them."
        alert.addButton(withTitle: "Save All")
        alert.addButton(withTitle: "Don’t Save")
        alert.addButton(withTitle: "Cancel")
        return alert.runModal()
    }

    private func closeAfterSave() {
        forceClose = true
        if quitAfterSave {
            quitAfterSave = false
            terminating = true
            NSApp.terminate(nil)
        } else {
            window.performClose(nil)
            // performClose is synchronous with windowShouldClose. If AppKit did
            // not actually close the window, never leave a stale bypass armed.
            if window.isVisible {
                forceClose = false
            }
        }
    }

    private func presentFatalError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "TypeOpen could not start"
        alert.informativeText = message
        alert.runModal()
        NSApp.terminate(nil)
    }

    private func makeMainMenu() -> NSMenu {
        let main = NSMenu()

        let appMenu = NSMenu(title: "TypeOpen")
        appMenu.addItem(commandItem("About TypeOpen", command: "about"))
        appMenu.addItem(.separator())
        appMenu.addItem(commandItem("Preferences…", key: ",", command: "preferences"))
        appMenu.addItem(.separator())
        let servicesItem = NSMenuItem(title: "Services", action: nil, keyEquivalent: "")
        let servicesMenu = NSMenu(title: "Services")
        servicesItem.submenu = servicesMenu
        NSApp.servicesMenu = servicesMenu
        appMenu.addItem(servicesItem)
        appMenu.addItem(.separator())
        appMenu.addItem(nativeItem("Hide TypeOpen", key: "h", action: #selector(NSApplication.hide(_:)), target: NSApp))
        appMenu.addItem(nativeItem("Hide Others", key: "h", modifiers: [.command, .option], action: #selector(NSApplication.hideOtherApplications(_:)), target: NSApp))
        appMenu.addItem(nativeItem("Show All", action: #selector(NSApplication.unhideAllApplications(_:)), target: NSApp))
        appMenu.addItem(.separator())
        appMenu.addItem(nativeItem("Quit TypeOpen", key: "q", action: #selector(NSApplication.terminate(_:)), target: NSApp))
        main.addItem(menuRoot("TypeOpen", submenu: appMenu))

        let fileMenu = NSMenu(title: "File")
        fileMenu.addItem(commandItem("New", key: "n", command: "new"))
        fileMenu.addItem(commandItem("New Tab", key: "t", command: "new-tab"))
        fileMenu.addItem(commandItem("Open…", key: "o", command: "open"))
        fileMenu.addItem(commandItem("Open Folder…", key: "o", modifiers: [.command, .shift], command: "open-folder"))
        let recentItem = NSMenuItem(title: "Open Recent", action: nil, keyEquivalent: "")
        let recentMenu = NSMenu(title: "Open Recent")
        recentMenu.delegate = self
        recentItem.submenu = recentMenu
        recentDocumentsMenu = recentMenu
        fileMenu.addItem(recentItem)
        fileMenu.addItem(commandItem("Reopen Closed File", command: "reopen-closed-file"))
        fileMenu.addItem(commandItem("Open Quickly", command: "open-quickly"))
        fileMenu.addItem(nativeItem("Open File Location", action: #selector(openFileLocation(_:))))
        fileMenu.addItem(commandItem("Reveal in File Tree", command: "reveal-file-tree"))
        fileMenu.addItem(commandItem("Import…", command: "open"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(commandItem("Save", key: "s", command: "save"))
        fileMenu.addItem(commandItem("Save As…", key: "s", modifiers: [.command, .shift], command: "save-as"))
        fileMenu.addItem(commandItem("Save All", command: "save-all"))
        fileMenu.addItem(commandItem("Revert to Saved", command: "revert"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(commandItem("Duplicate", command: "duplicate-document"))
        fileMenu.addItem(commandItem("Rename", command: "rename-document"))
        fileMenu.addItem(commandItem("Move To", command: "move-document"))
        fileMenu.addItem(.separator())
        let exportMenu = NSMenu(title: "Export")
        exportMenu.addItem(commandItem("PDF…", command: "export", payload: "pdf"))
        exportMenu.addItem(commandItem("HTML…", command: "export", payload: "html"))
        exportMenu.addItem(commandItem("HTML (without styles)…", command: "export", payload: "html-plain"))
        exportMenu.addItem(commandItem("Image (PNG)…", command: "export", payload: "image"))
        exportMenu.addItem(.separator())
        exportMenu.addItem(commandItem("Word (.docx)…", command: "export", payload: "docx"))
        exportMenu.addItem(commandItem("OpenDocument (.odt)…", command: "export", payload: "odt"))
        exportMenu.addItem(commandItem("RTF…", command: "export", payload: "rtf"))
        exportMenu.addItem(commandItem("EPUB…", command: "export", payload: "epub"))
        exportMenu.addItem(commandItem("LaTeX…", command: "export", payload: "latex"))
        exportMenu.addItem(commandItem("MediaWiki…", command: "export", payload: "mediawiki"))
        fileMenu.addItem(menuRoot("Export", submenu: exportMenu))
        fileMenu.addItem(.separator())
        fileMenu.addItem(commandItem("Page Setup…", command: "page-setup"))
        fileMenu.addItem(commandItem("Print…", key: "p", command: "print"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(commandItem("Close Tab", key: "w", command: "close-tab"))
        fileMenu.addItem(nativeItem("Close Window", key: "w", modifiers: [.command, .shift], action: #selector(closeWindow(_:))))
        main.addItem(menuRoot("File", submenu: fileMenu))

        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(responderItem("Undo", key: "z", selector: Selector(("undo:"))))
        editMenu.addItem(responderItem("Redo", key: "z", modifiers: [.command, .shift], selector: Selector(("redo:"))))
        editMenu.addItem(.separator())
        editMenu.addItem(responderItem("Cut", key: "x", selector: #selector(NSText.cut(_:))))
        editMenu.addItem(responderItem("Copy", key: "c", selector: #selector(NSText.copy(_:))))
        editMenu.addItem(responderItem("Paste", key: "v", selector: #selector(NSText.paste(_:))))
        editMenu.addItem(commandItem("Paste as Plain Text", key: "v", modifiers: [.command, .shift], command: "paste-plain"))
        editMenu.addItem(commandItem("Copy as Markdown", key: "c", modifiers: [.command, .shift], command: "copy-markdown"))
        editMenu.addItem(commandItem("Copy as HTML", command: "copy-html"))
        editMenu.addItem(.separator())
        editMenu.addItem(responderItem("Select All", key: "a", selector: #selector(NSText.selectAll(_:))))
        editMenu.addItem(.separator())
        editMenu.addItem(commandItem("Find…", key: "f", command: "find"))
        editMenu.addItem(commandItem("Find Next", key: "g", command: "find-next"))
        editMenu.addItem(commandItem("Find Previous", key: "g", modifiers: [.command, .shift], command: "find-previous"))
        editMenu.addItem(commandItem("Replace…", key: "f", modifiers: [.command, .option], command: "replace"))
        editMenu.addItem(commandItem("Replace Next", command: "replace-next"))
        editMenu.addItem(.separator())
        editMenu.addItem(commandItem("Search in Folder…", key: "f", modifiers: [.command, .shift], command: "search-folder"))
        main.addItem(menuRoot("Edit", submenu: editMenu))

        let paragraphMenu = NSMenu(title: "Paragraph")
        paragraphMenu.addItem(commandItem("Paragraph", key: "0", command: "insert", payload: "paragraph"))
        for level in 1...6 { paragraphMenu.addItem(commandItem("Heading \(level)", key: "\(level)", command: "insert", payload: "h\(level)")) }
        paragraphMenu.addItem(commandItem("Increase Heading Level", command: "heading-level", payload: "increase"))
        paragraphMenu.addItem(commandItem("Decrease Heading Level", command: "heading-level", payload: "decrease"))
        paragraphMenu.addItem(.separator())
        paragraphMenu.addItem(commandItem("Block Quote", key: "q", modifiers: [.command, .shift], command: "insert", payload: "quote"))
        paragraphMenu.addItem(commandItem("Code Fence", key: "k", modifiers: [.command, .shift], command: "insert", payload: "code-fence"))
        paragraphMenu.addItem(commandItem("Math Block", command: "insert", payload: "math-block"))
        paragraphMenu.addItem(commandItem("Table…", command: "insert", payload: "table"))
        paragraphMenu.addItem(.separator())
        paragraphMenu.addItem(commandItem("Ordered List", command: "insert", payload: "ordered-list"))
        paragraphMenu.addItem(commandItem("Unordered List", command: "insert", payload: "unordered-list"))
        paragraphMenu.addItem(commandItem("Task List", command: "insert", payload: "task-list"))
        paragraphMenu.addItem(commandItem("Task Status", command: "task-status"))
        paragraphMenu.addItem(commandItem("Indent", command: "indent"))
        paragraphMenu.addItem(commandItem("Outdent", command: "outdent"))
        paragraphMenu.addItem(commandItem("Footnote", command: "insert", payload: "footnote"))
        paragraphMenu.addItem(commandItem("Table of Contents", command: "insert", payload: "toc"))
        paragraphMenu.addItem(commandItem("YAML Front Matter", command: "insert", payload: "frontmatter"))
        main.addItem(menuRoot("Paragraph", submenu: paragraphMenu))

        let formatMenu = NSMenu(title: "Format")
        formatMenu.addItem(commandItem("Strong", key: "b", command: "format", payload: "bold"))
        formatMenu.addItem(commandItem("Emphasis", key: "i", command: "format", payload: "italic"))
        formatMenu.addItem(commandItem("Underline", key: "u", command: "format", payload: "underline"))
        formatMenu.addItem(commandItem("Inline Code", key: "`", modifiers: [.command, .shift], command: "format", payload: "code"))
        formatMenu.addItem(commandItem("Strike", command: "format", payload: "strike"))
        formatMenu.addItem(commandItem("Highlight", command: "format", payload: "highlight"))
        formatMenu.addItem(commandItem("Superscript", command: "format", payload: "superscript"))
        formatMenu.addItem(commandItem("Subscript", command: "format", payload: "subscript"))
        formatMenu.addItem(commandItem("Comment", command: "format", payload: "comment"))
        formatMenu.addItem(commandItem("Inline Math", command: "insert", payload: "inline-math"))
        formatMenu.addItem(.separator())
        formatMenu.addItem(commandItem("Link…", key: "k", command: "insert", payload: "link"))
        formatMenu.addItem(commandItem("Image…", command: "insert", payload: "image"))
        formatMenu.addItem(commandItem("Horizontal Rule", command: "insert", payload: "hr"))
        formatMenu.addItem(.separator())
        formatMenu.addItem(commandItem("Clear Format", command: "clear-format"))
        main.addItem(menuRoot("Format", submenu: formatMenu))

        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(commandItem("Toggle Sidebar", key: "l", modifiers: [.command, .shift], command: "toggle-sidebar"))
        viewMenu.addItem(commandItem("Outline", key: "1", modifiers: [.command, .control], command: "sidebar", payload: "outline"))
        viewMenu.addItem(commandItem("Articles", key: "2", modifiers: [.command, .control], command: "sidebar", payload: "articles"))
        viewMenu.addItem(commandItem("File Tree", key: "3", modifiers: [.command, .control], command: "sidebar", payload: "files"))
        viewMenu.addItem(.separator())
        viewMenu.addItem(commandItem("Next Tab", key: "\t", modifiers: [.control], command: "next-tab"))
        viewMenu.addItem(commandItem("Previous Tab", key: "\t", modifiers: [.control, .shift], command: "previous-tab"))
        viewMenu.addItem(.separator())
        viewMenu.addItem(commandItem("Source Code Mode", key: "/", command: "source-mode"))
        viewMenu.addItem(commandItem("Read-only Mode", command: "read-only-mode"))
        viewMenu.addItem(commandItem("Focus Mode", command: "focus-mode"))
        viewMenu.addItem(commandItem("Typewriter Mode", command: "typewriter-mode"))
        viewMenu.addItem(.separator())
        viewMenu.addItem(commandItem("Show Status Bar", command: "toggle-status-bar"))
        viewMenu.addItem(commandItem("Show Editor Toolbar", command: "toggle-toolbar"))
        viewMenu.addItem(nativeItem("Always on Top", action: #selector(toggleAlwaysOnTop(_:))))
        viewMenu.addItem(.separator())
        viewMenu.addItem(responderItem("Enter Full Screen", key: "f", modifiers: [.command, .control], selector: #selector(NSWindow.toggleFullScreen(_:))))
        viewMenu.addItem(nativeItem("Actual Size", key: "0", action: #selector(resetZoom(_:))))
        viewMenu.addItem(nativeItem("Zoom In", key: "+", action: #selector(zoomIn(_:))))
        viewMenu.addItem(nativeItem("Zoom Out", key: "-", action: #selector(zoomOut(_:))))
        main.addItem(menuRoot("View", submenu: viewMenu))

        let helpMenu = NSMenu(title: "Help")
        helpMenu.addItem(commandItem("TypeOpen Documentation", command: "documentation"))
        helpMenu.addItem(commandItem("Markdown Reference", command: "markdown-reference"))
        helpMenu.addItem(.separator())
        helpMenu.addItem(commandItem("Open Source Licenses", command: "licenses"))
        main.addItem(menuRoot("Help", submenu: helpMenu))

        return main
    }

    func menuNeedsUpdate(_ menu: NSMenu) {
        guard menu === recentDocumentsMenu else { return }
        menu.removeAllItems()
        for url in NSDocumentController.shared.recentDocumentURLs.prefix(15) {
            let item = NSMenuItem(title: url.lastPathComponent, action: #selector(openRecentDocument(_:)), keyEquivalent: "")
            item.target = self
            item.representedObject = url.path
            menu.addItem(item)
        }
        if menu.items.isEmpty {
            let empty = NSMenuItem(title: "No Recent Documents", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            menu.addItem(empty)
        }
        menu.addItem(.separator())
        menu.addItem(nativeItem("Clear Menu", action: #selector(clearRecentDocuments(_:))))
    }

    private func menuRoot(_ title: String, submenu: NSMenu) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: nil, keyEquivalent: "")
        item.submenu = submenu
        return item
    }

    private func commandItem(_ title: String, key: String = "", modifiers: NSEvent.ModifierFlags = [.command], command: String, payload: Any? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: #selector(emitCommand(_:)), keyEquivalent: key)
        item.target = self
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        item.representedObject = ["command": command, "payload": payload ?? NSNull()]
        return item
    }

    private func nativeItem(_ title: String, key: String = "", modifiers: NSEvent.ModifierFlags = [.command], action: Selector, target: AnyObject? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = target ?? self
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        return item
    }

    private func responderItem(_ title: String, key: String, modifiers: NSEvent.ModifierFlags = [.command], selector: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: selector, keyEquivalent: key)
        item.target = nil
        item.keyEquivalentModifierMask = modifiers
        return item
    }

    @objc private func emitCommand(_ sender: NSMenuItem) {
        guard let represented = sender.representedObject as? [String: Any], let command = represented["command"] as? String else { return }
        let payload = represented["payload"] is NSNull ? nil : represented["payload"]
        bridge.sendCommand(command, payload: payload)
    }

    @objc private func openFileLocation(_ sender: Any?) {
        guard let path = bridge.documentState.filePath else { return }
        NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
    }

    @objc private func closeWindow(_ sender: Any?) {
        window.performClose(sender)
    }

    @objc private func openRecentDocument(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        bridge.queueSystemOpenPath(path)
    }

    @objc private func clearRecentDocuments(_ sender: Any?) {
        NSDocumentController.shared.clearRecentDocuments(sender)
    }

    @objc private func toggleAlwaysOnTop(_ sender: NSMenuItem) {
        let enabled = window.level != .floating
        window.level = enabled ? .floating : .normal
        sender.state = enabled ? .on : .off
    }

    @objc private func resetZoom(_ sender: Any?) {
        webView.pageZoom = 1
    }

    @objc private func zoomIn(_ sender: Any?) {
        webView.pageZoom = min(3, webView.pageZoom + 0.1)
    }

    @objc private func zoomOut(_ sender: Any?) {
        webView.pageZoom = max(0.5, webView.pageZoom - 0.1)
    }
}
