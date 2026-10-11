import AppKit

final class TypeOpenDragRegionView: NSView {
    static let rendererTitlebarHeight: CGFloat = 42
    static let interactiveLeadingWidth: CGFloat = 240

    static func frame(in bounds: NSRect) -> NSRect {
        NSRect(
            x: interactiveLeadingWidth,
            y: max(bounds.minY, bounds.maxY - rendererTitlebarHeight),
            width: max(0, bounds.width - interactiveLeadingWidth),
            height: min(rendererTitlebarHeight, bounds.height)
        )
    }

    override var isOpaque: Bool { false }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        // A user must be able to grab an inactive TypeOpen window immediately,
        // just like a native titlebar, instead of spending the first click only
        // activating the WKWebView window.
        true
    }

    override func mouseDown(with event: NSEvent) {
        guard event.clickCount == 1 else {
            super.mouseDown(with: event)
            return
        }
        window?.performDrag(with: event)
    }
}
