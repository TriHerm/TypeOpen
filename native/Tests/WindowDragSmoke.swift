import AppKit

@main
struct WindowDragSmoke {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else {
            fputs("Window drag smoke failed: \(message)\n", stderr)
            exit(1)
        }
    }

    static func main() {
        let root = NSView(frame: NSRect(x: 0, y: 0, width: 1180, height: 820))
        let renderer = NSView(frame: root.bounds)
        renderer.autoresizingMask = [.width, .height]
        root.addSubview(renderer)

        let dragRegion = TypeOpenDragRegionView(frame: TypeOpenDragRegionView.frame(in: root.bounds))
        dragRegion.autoresizingMask = [.width, .minYMargin]
        root.addSubview(dragRegion)

        require(dragRegion.frame == NSRect(x: 240, y: 778, width: 940, height: 42), "initial frame is not aligned to the renderer titlebar")
        require(root.hitTest(NSPoint(x: 120, y: 805)) === renderer, "leading toolbar area must remain interactive")
        require(root.hitTest(NSPoint(x: 400, y: 805)) === dragRegion, "inert titlebar must hit the native drag region")
        require(root.hitTest(NSPoint(x: 400, y: 500)) === renderer, "editor content must continue hitting the renderer")

        root.setFrameSize(NSSize(width: 900, height: 600))
        require(dragRegion.frame == NSRect(x: 240, y: 558, width: 660, height: 42), "drag region must remain pinned to the top when resized")
        require(root.hitTest(NSPoint(x: 400, y: 590)) === dragRegion, "resized titlebar must still hit the native drag region")

        print("Native window drag hit-testing: PASS")
    }
}
