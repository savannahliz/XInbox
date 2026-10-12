import Cocoa
import WebKit

final class INboxDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    var window: NSWindow!
    var web: WKWebView!
    var backend: Process?
    var startupTimer: Timer?
    var ready = false
    var stopping = false
    var output = ""
    let origin = "http://127.0.0.1:4319"

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .darkAqua)
        let menu = NSMenu()
        let appItem = NSMenuItem()
        menu.addItem(appItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "关于 INbox", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "退出 INbox", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu
        let edit = NSMenuItem(title: "编辑", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "编辑")
        for (title, action, key) in [("撤销", "undo:", "z"), ("剪切", "cut:", "x"), ("复制", "copy:", "c"), ("粘贴", "paste:", "v"), ("全选", "selectAll:", "a")] {
            editMenu.addItem(withTitle: title, action: NSSelectorFromString(action), keyEquivalent: key)
        }
        edit.submenu = editMenu
        menu.addItem(edit)
        NSApp.mainMenu = menu
        window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "INbox"
        window.minSize = NSSize(width: 900, height: 600)
        window.backgroundColor = NSColor(calibratedRed: 0.035, green: 0.047, blue: 0.039, alpha: 1)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "openExternal")
        web = WKWebView(frame: window.contentView!.bounds, configuration: configuration)
        web.autoresizingMask = [.width, .height]
        web.navigationDelegate = self
        web.uiDelegate = self
        web.underPageBackgroundColor = window.backgroundColor
        window.contentView = web
        web.loadHTMLString("<html style='background:#090c0a;color:#8bcf3a;font:20px Menlo'><body style='padding:48px'>INbox · 正在启动…</body></html>", baseURL: nil)
        window.center()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        startBackend()
    }

    func startBackend() {
        guard let resources = Bundle.main.resourceURL else { fail("安装文件不完整。"); return }
        let process = Process()
        process.executableURL = resources.appendingPathComponent("runtime/node")
        process.arguments = [resources.appendingPathComponent("app/desktop/server.js").path]
        process.currentDirectoryURL = resources.appendingPathComponent("app")
        var env = ProcessInfo.processInfo.environment
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dataRoot = support.appendingPathComponent("INbox")
        var dataPath = dataRoot.path
        if let bytes = try? Data(contentsOf: dataRoot.appendingPathComponent("library-location.json")),
           let location = try? JSONSerialization.jsonObject(with: bytes) as? [String: String],
           let configured = location["dataDir"],
           FileManager.default.fileExists(atPath: configured + "/recall.sqlite") { dataPath = configured }
        env["INBOX_DATA_DIR"] = dataPath
        env["INBOX_DESKTOP_PORT"] = "4319"
        process.environment = env
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            if data.isEmpty { handle.readabilityHandler = nil; return }
            let text = String(decoding: data, as: UTF8.self)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.output = String((self.output + text).suffix(8000))
                if !self.ready && self.output.contains("INBOX_READY " + self.origin) {
                    self.ready = true
                    self.startupTimer?.invalidate()
                    self.web.load(URLRequest(url: URL(string: self.origin)!))
                }
            }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async {
                guard let self = self, !self.stopping else { return }
                self.fail(self.output.contains("端口已被占用") ? "后台端口 4319 已被占用，请退出其他 INbox 实例后重试。" : "后台服务已停止，请重新启动 INbox。")
            }
        }
        backend = process
        do { try process.run() }
        catch { fail("无法启动内置运行环境，请重新安装 INbox。"); return }
        startupTimer = Timer.scheduledTimer(withTimeInterval: 15, repeats: false) { [weak self] _ in
            if self?.ready == false { self?.fail("后台启动超时，请重新启动 INbox。") }
        }
    }

    func fail(_ message: String) {
        startupTimer?.invalidate()
        let alert = NSAlert()
        alert.messageText = "INbox 无法运行"
        alert.informativeText = message
        alert.addButton(withTitle: "退出")
        alert.beginSheetModal(for: window) { _ in NSApp.terminate(nil) }
    }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }
    func applicationWillTerminate(_ notification: Notification) {
        stopping = true
        startupTimer?.invalidate()
        if let process = backend, process.isRunning { process.terminate(); process.waitUntilExit() }
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if navigationAction.shouldPerformDownload { decisionHandler(.download); return }
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if url.scheme == "about" || url.absoluteString.hasPrefix(origin + "/") || url.absoluteString == origin {
            decisionHandler(.allow)
        } else {
            if ["https", "http"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
            decisionHandler(.cancel)
        }
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "openExternal", message.frameInfo.isMainFrame,
              message.frameInfo.request.url?.host == "127.0.0.1",
              let value = message.body as? String, let url = URL(string: value),
              url.scheme == "https", url.host == "x.com", url.path == "/i/oauth2/authorize" else { return }
        NSWorkspace.shared.open(url)
    }
    func application(_ application: NSApplication, open urls: [URL]) {
        guard urls.contains(where: { $0.scheme == "inbox" && $0.host == "oauth" && $0.path == "/complete" }) else { return }
        NSApp.activate(ignoringOtherApps: true)
        window?.makeKeyAndOrderFront(nil)
        if ready { web.evaluateJavaScript("window.dispatchEvent(new Event('inbox-oauth-complete'))") }
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, ["http", "https"].contains(url.scheme ?? "") { NSWorkspace.shared.open(url) }
        return nil
    }
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename
        panel.beginSheetModal(for: window) { result in completionHandler(result == .OK ? panel.url : nil) }
    }
}

let app = NSApplication.shared
let delegate = INboxDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
