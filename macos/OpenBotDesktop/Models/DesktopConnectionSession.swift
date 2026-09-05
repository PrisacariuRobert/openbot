import Foundation

@MainActor
final class DesktopConnectionSession: ObservableObject {
    @Published private(set) var serverURL: URL?
    @Published private(set) var isAuthenticated = false
    @Published private(set) var isConnecting = false
    @Published var errorMessage: String?
    @Published var suggestedAddress = "http://127.0.0.1:4311"

    private let addressKey = "openbot.desktop.server.address"
    private var lastAuthenticatedAt: Date?
    private var activeAccessKey: String?

    var displayAddress: String { serverURL?.absoluteString ?? suggestedAddress }
    var clientAccessKey: String? { activeAccessKey }

    func restore() async {
        guard !isAuthenticated, !isConnecting else { return }
        let saved = UserDefaults.standard.string(forKey: addressKey) ?? suggestedAddress
        suggestedAddress = saved
        let localDevelopmentKey = accessKeyFromEnvironmentFile()
        if let localDevelopmentKey {
            await authenticate(address: saved, accessKey: localDevelopmentKey, remember: false)
            return
        }
        if let url = try? ConnectionAddress.normalized(saved), ConnectionAddress.isLoopback(url),
           let key = try? await localPairingKey(from: url) {
            await authenticate(address: saved, accessKey: key, remember: true)
            return
        }
        guard let key = KeychainStore.load(), !key.isEmpty else { return }
        await authenticate(address: saved, accessKey: key, remember: false)
    }

    func connect(address: String, accessKey: String) async {
        await authenticate(address: address, accessKey: accessKey, remember: true)
    }

    func connectToThisMac() async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            let url = try ConnectionAddress.normalized("http://127.0.0.1:4311")
            let key = try await localPairingKey(from: url)
            isConnecting = false
            await authenticate(address: url.absoluteString, accessKey: key, remember: true)
        } catch {
            errorMessage = "OpenBot is not running on this Mac yet. Start the studio runner, then try again."
        }
    }

    func refreshIfNeeded() async {
        guard isAuthenticated,
              let lastAuthenticatedAt,
              Date().timeIntervalSince(lastAuthenticatedAt) > 12 * 60,
              let address = serverURL?.absoluteString,
              let key = activeAccessKey ?? KeychainStore.load() else { return }
        await authenticate(address: address, accessKey: key, remember: false)
    }

    func disconnect(forgetAddress: Bool = false) {
        isAuthenticated = false
        serverURL = nil
        lastAuthenticatedAt = nil
        activeAccessKey = nil
        errorMessage = nil
        KeychainStore.remove()
        if forgetAddress {
            UserDefaults.standard.removeObject(forKey: addressKey)
            suggestedAddress = "http://127.0.0.1:4311"
        }
    }

    func sessionExpired() {
        isAuthenticated = false
        activeAccessKey = nil
        errorMessage = "Unlock your studio again to continue."
    }

    func handleDeepLink(_ url: URL) {
        guard let address = OpenBotDeepLink.serverAddress(from: url) else { return }
        suggestedAddress = address
        disconnect()
    }

    private func authenticate(address: String, accessKey: String, remember: Bool) async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            let normalized = try ConnectionAddress.normalized(address)
            let cleanKey = accessKey.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanKey.isEmpty else { throw DesktopSessionError.missingKey }
            var request = URLRequest(url: normalized.appending(path: "api/auth/login"))
            request.httpMethod = "POST"
            request.timeoutInterval = 15
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(DesktopLoginRequest(token: cleanKey))
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = true
            let (data, response) = try await URLSession(configuration: configuration).data(for: request)
            guard let http = response as? HTTPURLResponse else { throw DesktopSessionError.unreachable }
            guard http.statusCode == 200 else {
                if http.statusCode == 401 { throw DesktopSessionError.wrongKey }
                let message = (try? JSONDecoder().decode(DesktopServerError.self, from: data).error)
                throw DesktopSessionError.server(message ?? "OpenBot could not unlock this studio.")
            }
            if remember {
                try KeychainStore.save(cleanKey)
                UserDefaults.standard.set(normalized.absoluteString, forKey: addressKey)
            }
            suggestedAddress = normalized.absoluteString
            serverURL = normalized
            activeAccessKey = cleanKey
            lastAuthenticatedAt = Date()
            isAuthenticated = true
        } catch let error as LocalizedError {
            isAuthenticated = false
            errorMessage = error.errorDescription ?? "OpenBot could not connect."
        } catch {
            isAuthenticated = false
            errorMessage = "OpenBot could not reach that address. Check that your studio runner is online."
        }
    }

    private func accessKeyFromEnvironmentFile() -> String? {
        guard let path = ProcessInfo.processInfo.environment["OPENBOT_LOCAL_ACCESS_KEY_FILE"],
              !path.isEmpty,
              let value = try? String(contentsOfFile: path, encoding: .utf8) else { return nil }
        return value.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func localPairingKey(from url: URL) async throws -> String {
        guard ConnectionAddress.isLoopback(url) else { throw DesktopSessionError.wrongKey }
        var request = URLRequest(url: url.appending(path: "api/access"))
        request.timeoutInterval = 3
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200,
              let result = try? JSONDecoder().decode(DesktopLocalAccess.self, from: data) else {
            throw DesktopSessionError.unreachable
        }
        let key = result.token.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.count >= 16 else { throw DesktopSessionError.wrongKey }
        return key
    }
}

private struct DesktopLoginRequest: Encodable { let token: String }
private struct DesktopServerError: Decodable { let error: String }
private struct DesktopLocalAccess: Decodable { let token: String }

private enum DesktopSessionError: LocalizedError {
    case missingKey
    case wrongKey
    case unreachable
    case server(String)

    var errorDescription: String? {
        switch self {
        case .missingKey: return "Enter the private access key shown by your OpenBot home."
        case .wrongKey: return "That access key did not match this OpenBot studio."
        case .unreachable: return "OpenBot did not answer. Check that the studio runner is online."
        case .server(let message): return message
        }
    }
}
