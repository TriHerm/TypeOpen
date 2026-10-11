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
        ), let menu = view.menu(for: event),
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
