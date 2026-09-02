import SwiftUI
import UIKit
import WebKit

struct StudioWebView: UIViewRepresentable {
    let url: URL
    let onSessionExpired: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onSessionExpired: onSessionExpired) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.keyboardDismissMode = .interactive
        webView.scrollView.refreshControl = UIRefreshControl()
        webView.scrollView.refreshControl?.addTarget(context.coordinator, action: #selector(Coordinator.refresh(_:)), for: .valueChanged)
        webView.customUserAgent = "OpenBot-iOS/0.17"
        context.coordinator.webView = webView
        context.coordinator.requestedURL = url
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard context.coordinator.requestedURL != url else { return }
        context.coordinator.requestedURL = url
        webView.load(URLRequest(url: url, cachePolicy: .reloadRevalidatingCacheData))
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var webView: WKWebView?
        var requestedURL: URL?
        private let onSessionExpired: () -> Void

        init(onSessionExpired: @escaping () -> Void) { self.onSessionExpired = onSessionExpired }

        @objc func refresh(_ sender: UIRefreshControl) {
            webView?.reload()
            sender.endRefreshing()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
            if let response = navigationResponse.response as? HTTPURLResponse, response.statusCode == 401 {
                decisionHandler(.cancel)
                Task { @MainActor in self.onSessionExpired() }
                return
            }
            decisionHandler(.allow)
        }

        func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
            if navigationAction.targetFrame == nil, let target = navigationAction.request.url { UIApplication.shared.open(target) }
            return nil
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }
    }
}
