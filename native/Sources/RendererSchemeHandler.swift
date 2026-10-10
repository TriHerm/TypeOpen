import Foundation
import WebKit

final class RendererSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "typeopen"
    static let host = "app"

    private let rendererRoot: URL

    init(rendererRoot: URL) {
        self.rendererRoot = rendererRoot.standardizedFileURL.resolvingSymlinksInPath()
        super.init()
    }

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let requestURL = urlSchemeTask.request.url,
              requestURL.scheme == Self.scheme,
              requestURL.host == Self.host,
              let fileURL = resolve(requestURL) else {
            urlSchemeTask.didFailWithError(NSError(
                domain: NSURLErrorDomain,
                code: NSURLErrorBadURL,
                userInfo: [NSLocalizedDescriptionKey: "Invalid TypeOpen renderer URL."]
            ))
            return
        }

        do {
            let data = try Data(contentsOf: fileURL, options: [.mappedIfSafe])
            let ext = fileURL.pathExtension.lowercased()
            let response = URLResponse(
                url: requestURL,
                mimeType: mimeType(for: ext),
                expectedContentLength: data.count,
                textEncodingName: isTextExtension(ext) ? "utf-8" : nil
            )
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } catch {
            urlSchemeTask.didFailWithError(error)
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    private func resolve(_ requestURL: URL) -> URL? {
        let decodedPath = requestURL.path.removingPercentEncoding ?? requestURL.path
        let relative = decodedPath.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        let resource = relative.isEmpty ? "index.html" : relative
        guard !resource.isEmpty else { return nil }

        let candidate = rendererRoot.appendingPathComponent(resource).standardizedFileURL.resolvingSymlinksInPath()
        let rootPath = rendererRoot.path
        let candidatePath = candidate.path
        guard candidatePath == rootPath || candidatePath.hasPrefix(rootPath + "/") else { return nil }

        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: candidatePath, isDirectory: &isDirectory), !isDirectory.boolValue else { return nil }
        return candidate
    }

    private func mimeType(for ext: String) -> String {
        switch ext {
        case "html", "htm": return "text/html"
        case "js", "mjs": return "text/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "woff": return "font/woff"
        case "woff2": return "font/woff2"
        case "ttf": return "font/ttf"
        case "wasm": return "application/wasm"
        default: return "application/octet-stream"
        }
    }

    private func isTextExtension(_ ext: String) -> Bool {
        ["html", "htm", "js", "mjs", "css", "json", "svg"].contains(ext)
    }
}
