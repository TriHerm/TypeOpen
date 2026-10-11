import AppKit
import WebKit

final class TypeOpenWebView: WKWebView {
    var onTypeOpenCommand: ((String, Any?) -> Void)?
    var editorCommandsEnabled = false

    override func menu(for event: NSEvent) -> NSMenu? {
        let menu = super.menu(for: event) ?? NSMenu()
        guard editorCommandsEnabled else { return menu }
        if !menu.items.isEmpty, menu.items.last?.isSeparatorItem != true {
            menu.addItem(.separator())
        }

        let parent = NSMenuItem(title: "TypeOpen", action: nil, keyEquivalent: "")
        parent.submenu = makeTypeOpenCommandMenu()
        menu.addItem(parent)
        return menu
    }

    func makeTypeOpenCommandMenu() -> NSMenu {
        let menu = NSMenu(title: "TypeOpen")
        menu.addItem(commandItem("Bold", command: "context-format", payload: "bold"))
        menu.addItem(commandItem("Italic", command: "context-format", payload: "italic"))
        menu.addItem(commandItem("Inline Code", command: "context-format", payload: "code"))
        menu.addItem(commandItem("Clear Formatting", command: "context-clear-format"))
        menu.addItem(.separator())
        menu.addItem(commandItem("Block Quote", command: "context-insert", payload: "quote"))
        menu.addItem(commandItem("Task List", command: "context-insert", payload: "task-list"))
        menu.addItem(commandItem("Code Block", command: "context-insert", payload: "code-fence"))
        menu.addItem(commandItem("Table", command: "context-insert", payload: "table"))
        return menu
    }

    private func commandItem(_ title: String, command: String, payload: Any? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: #selector(emitTypeOpenCommand(_:)), keyEquivalent: "")
        item.target = self
        item.representedObject = ["command": command, "payload": payload ?? NSNull()]
        return item
    }

    @objc private func emitTypeOpenCommand(_ sender: NSMenuItem) {
        guard let represented = sender.representedObject as? [String: Any],
              let command = represented["command"] as? String else { return }
        let payload = represented["payload"] is NSNull ? nil : represented["payload"]
        onTypeOpenCommand?(command, payload)
    }
}
