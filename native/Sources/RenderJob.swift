import AppKit
import WebKit

@MainActor
final class RenderJob: NSObject, WKNavigationDelegate {
    private let window: NSWindow
    let webView: WKWebView
    private var ready: ((Result<RenderJob, Error>) -> Void)?

    init(html: String, ready: @escaping (Result<RenderJob, Error>) -> Void) {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        self.webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 1200), configuration: configuration)
        self.window = NSWindow(
            contentRect: NSRect(x: -5000, y: -5000, width: 1000, height: 1200),
            styleMask: [.borderless],
            backing: .buffered,
            defer: false
        )
        self.ready = ready
        super.init()
        webView.navigationDelegate = self
        window.contentView = webView
        window.orderOut(nil)
        webView.loadHTMLString(html, baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.evaluateJavaScript("document.readyState") { [weak self] _, error in
            guard let self else { return }
            if let error {
                self.finishReady(.failure(error))
            } else {
                self.finishReady(.success(self))
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finishReady(.failure(error))
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finishReady(.failure(error))
    }

    private func finishReady(_ result: Result<RenderJob, Error>) {
        guard let ready else { return }
        self.ready = nil
        ready(result)
    }

    func snapshotPNG(completion: @escaping (Result<Data, Error>) -> Void) {
        let script = "(() => ({width: Math.min(1600, Math.max(800, document.documentElement.scrollWidth)), height: Math.min(30000, Math.max(900, document.documentElement.scrollHeight))}))()"
        webView.evaluateJavaScript(script) { [weak self] value, error in
            guard let self else { return }
            if let error {
                completion(.failure(error))
                return
            }
            guard
                let size = value as? [String: Any],
                let width = (size["width"] as? NSNumber)?.doubleValue,
                let height = (size["height"] as? NSNumber)?.doubleValue
            else {
                completion(.failure(NSError(domain: "TypeOpen", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to measure the rendered document."])))
                return
            }

            let frame = NSRect(x: 0, y: 0, width: width, height: height)
            self.window.setContentSize(frame.size)
            self.webView.frame = frame
            self.webView.layoutSubtreeIfNeeded()

            let configuration = WKSnapshotConfiguration()
            configuration.rect = frame
            self.webView.takeSnapshot(with: configuration) { image, error in
                if let error {
                    completion(.failure(error))
                    return
                }
                guard
                    let image,
                    let tiff = image.tiffRepresentation,
                    let bitmap = NSBitmapImageRep(data: tiff),
                    let png = bitmap.representation(using: .png, properties: [:])
                else {
                    completion(.failure(NSError(domain: "TypeOpen", code: 2, userInfo: [NSLocalizedDescriptionKey: "Unable to encode the rendered PNG."])))
                    return
                }
                completion(.success(png))
            }
        }
    }

    func printInfo(pageSetup: [String: Any]?) -> NSPrintInfo {
        let normalized = PageSetup.normalized(pageSetup)
        let info = NSPrintInfo.shared.copy() as! NSPrintInfo
        info.paperSize = normalized.paperSize
        info.orientation = normalized.landscape ? .landscape : .portrait
        info.topMargin = normalized.topMargin
        info.rightMargin = normalized.rightMargin
        info.bottomMargin = normalized.bottomMargin
        info.leftMargin = normalized.leftMargin
        info.horizontalPagination = .fit
        info.verticalPagination = .automatic
        info.isHorizontallyCentered = true
        info.isVerticallyCentered = false
        return info
    }

    func exportPDF(to destination: URL, pageSetup: [String: Any]?) throws {
        let info = printInfo(pageSetup: pageSetup)
        info.jobDisposition = .save
        info.dictionary()[NSPrintInfo.AttributeKey.jobSavingURL] = destination
        let operation = NSPrintOperation(view: webView, printInfo: info)
        operation.showsPrintPanel = false
        operation.showsProgressPanel = false
        guard operation.run() else {
            throw NSError(domain: "TypeOpen", code: 3, userInfo: [NSLocalizedDescriptionKey: "PDF export did not complete."])
        }
    }

    func printDocument(pageSetup: [String: Any]?) -> Bool {
        let operation = NSPrintOperation(view: webView, printInfo: printInfo(pageSetup: pageSetup))
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        return operation.run()
    }
}

struct PageSetup {
    let paperSize: NSSize
    let landscape: Bool
    let topMargin: CGFloat
    let rightMargin: CGFloat
    let bottomMargin: CGFloat
    let leftMargin: CGFloat

    static func normalized(_ raw: [String: Any]?) -> PageSetup {
        let pointsPerInch: CGFloat = 72
        let sizes: [String: NSSize] = [
            "Letter": NSSize(width: 8.5 * pointsPerInch, height: 11 * pointsPerInch),
            "A4": NSSize(width: 8.27 * pointsPerInch, height: 11.69 * pointsPerInch),
            "Legal": NSSize(width: 8.5 * pointsPerInch, height: 14 * pointsPerInch),
            "A5": NSSize(width: 5.83 * pointsPerInch, height: 8.27 * pointsPerInch),
            "Tabloid": NSSize(width: 11 * pointsPerInch, height: 17 * pointsPerInch)
        ]
        let paper = raw?["paperSize"] as? String ?? "Letter"
        let margins = raw?["margins"] as? [String: Any] ?? [:]
        func margin(_ key: String) -> CGFloat {
            let value = (margins[key] as? NSNumber)?.doubleValue ?? 0.5
            return CGFloat(max(0, min(3, value))) * pointsPerInch
        }
        return PageSetup(
            paperSize: sizes[paper] ?? sizes["Letter"]!,
            landscape: (raw?["orientation"] as? String) == "landscape",
            topMargin: margin("top"),
            rightMargin: margin("right"),
            bottomMargin: margin("bottom"),
            leftMargin: margin("left")
        )
    }
}
