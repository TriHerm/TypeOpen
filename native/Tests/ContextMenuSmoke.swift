import AppKit
import WebKit

@main
@MainActor
struct ContextMenuSmoke {
    static func main() {
        let view = TypeOpenWebView(
            frame: NSRect(x: 0, y: 0, width: 600, height: 400),
            configuration: WKWebViewConfiguration()
        )
        guard let event = NSEvent.mouseEvent(
            with: .rightMouseDown,
            location: NSPoint(x: 200, y: 200),
            modifierFlags: [],
            timestamp: 0,
            windowNumber: 0,
            context: nil,
            eventNumber: 1,
            clickCount: 1,
            pressure: 1
        ) else {
            fatalError("Could not create context-menu event.")
        }

        let disabledMenu = view.menu(for: event)
        precondition(disabledMenu?.items.contains(where: { $0.title == "TypeOpen" }) != true, "TypeOpen commands must stay hidden until rich editing is enabled.")

        view.editorCommandsEnabled = true
        guard let menu = view.menu(for: event),
           let typeOpenItem = menu.items.first(where: { $0.title == "TypeOpen" }),
           let submenu = typeOpenItem.submenu else {
            fatalError("TypeOpen submenu is missing from the WKWebView context menu.")
        }

        let titles = submenu.items.filter { !$0.isSeparatorItem }.map(\.title)
        let expected = [
            "Bold", "Italic", "Inline Code", "Clear Formatting",
            "Block Quote", "Task List", "Code Block", "Table"
        ]
        precondition(titles == expected, "Unexpected TypeOpen context commands: \(titles)")
        print("Native context menu smoke: PASS")
    }
}
