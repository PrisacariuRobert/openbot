import Foundation

@MainActor
final class ConnectionSession: ObservableObject {
    @Published private(set) var serverURL: URL?
    @Published private(set) var isAuthenticated = false
    @Published private(set) var isConnecting = false
    @Published var errorMessage: String?
    @Published var suggestedAddress = ""

    private let addressKey = "openbot.server.address"
    private var lastAuthenticatedAt: Date?

    var displayAddress: String { serverURL?.absoluteString ?? suggestedAddress }

    func restore() async {
        guard !isAuthenticated, !isConnecting else { return }
        let saved = UserDefaults.standard.string(forKey: addressKey) ?? ""
        suggestedAddress = saved
        guard !saved.isEmpty, let key = KeychainStore.load() else { return }
        await authenticate(address: saved, accessKey: key, remember: false)
    }

    func connect(address: String, accessKey: String) async {
        await authenticate(address: address, accessKey: accessKey, remember: true)
    }

    func refreshIfNeeded() async {
        guard isAuthenticated, let lastAuthenticatedAt, Date().timeIntervalSince(lastAuthenticatedAt) > 12 * 60,
              let address = serverURL?.absoluteString, let key = KeychainStore.load() else { return }
        await authenticate(address: address, accessKey: key, remember: false)
    }

    func disconnect(keepAddress: Bool = true) {
        isAuthenticated = false
        serverURL = nil
        lastAuthenticatedAt = nil
        errorMessage = nil
        KeychainStore.remove()
        if !keepAddress {
            UserDefaults.standard.removeObject(forKey: addressKey)
            suggestedAddress = ""
        }
    }

    func handleDeepLink(_ url: URL) {
        guard let address = OpenBotDeepLink.serverAddress(from: url) else { return }
        suggestedAddress = address
        disconnect(keepAddress: true)
    }

    func sessionExpired() {
        isAuthenticated = false
        errorMessage = "Unlocking your private session again…"
        Task { await restore() }
    }

    private func authenticate(address: String, accessKey: String, remember: Bool) async {
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            let normalized = try ConnectionAddress.normalized(address)
            let cleanAccessKey = accessKey.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !cleanAccessKey.isEmpty else {
                throw SessionError.missingKey
            }
            let endpoint = normalized.appending(path: "api/auth/login")
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.timeoutInterval = 15
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(LoginRequest(token: cleanAccessKey))
            let configuration = URLSessionConfiguration.ephemeral
            configuration.httpShouldSetCookies = true
            let (data, response) = try await URLSession(configuration: configuration).data(for: request)
            guard let http = response as? HTTPURLResponse else { throw SessionError.unreachable }
            guard http.statusCode == 200 else {
                if http.statusCode == 401 { throw SessionError.wrongKey }
                let message = (try? JSONDecoder().decode(ServerError.self, from: data).error) ?? "OpenBot could not unlock this connection."
                throw SessionError.server(message)
            }
            if remember {
                try KeychainStore.save(cleanAccessKey)
                UserDefaults.standard.set(normalized.absoluteString, forKey: addressKey)
            }
            suggestedAddress = normalized.absoluteString
            serverURL = normalized
            lastAuthenticatedAt = Date()
            isAuthenticated = true
        } catch let error as LocalizedError {
            isAuthenticated = false
            errorMessage = error.errorDescription ?? "OpenBot could not connect."
        } catch {
            isAuthenticated = false
            errorMessage = "OpenBot could not reach that address. Check that your Mac is awake and phone access is running."
        }
    }

}

private struct LoginRequest: Encodable { let token: String }
private struct ServerError: Decodable { let error: String }

private enum SessionError: LocalizedError {
    case missingKey
    case wrongKey
    case unreachable
    case server(String)

    var errorDescription: String? {
        switch self {
        case .missingKey: return "Enter the private access key shown by OpenBot on your Mac."
        case .wrongKey: return "That access key did not match this OpenBot studio."
        case .unreachable: return "OpenBot did not answer. Check that the Mac is awake and phone access is running."
        case .server(let message): return message
        }
    }
}
