import Foundation
import Security

@MainActor
final class ConnectionSession: ObservableObject {
    @Published private(set) var serverURL: URL?
    @Published private(set) var isAuthenticated = false
    @Published private(set) var isConnecting = false
    @Published var errorMessage: String?
    @Published var suggestedAddress = ""
    @Published var pairingInvitation: PairingInvitation?
    @Published private(set) var requestedThreadID: String?
    @Published private(set) var nativePushReady = false
    @Published private(set) var nativePushMessage: String?

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
        if let invitation = OpenBotDeepLink.pairingInvitation(from: url) { pairingInvitation = invitation; return }
        guard let address = OpenBotDeepLink.serverAddress(from: url) else { return }
        suggestedAddress = address
        disconnect(keepAddress: true)
    }

    func connectByQR(_ invitation: PairingInvitation) async {
        guard !isConnecting else { return }
        isConnecting = true
        errorMessage = nil
        defer { isConnecting = false }
        do {
            var bytes = [UInt8](repeating: 0, count: 32)
            guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else { throw SessionError.unreachable }
            let deviceKey = "obd_" + Data(bytes).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
            var request = URLRequest(url: invitation.server.appending(path: "api/auth/pair"))
            request.httpMethod = "POST"
            request.timeoutInterval = 20
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(PairRequest(ticket: invitation.ticket, deviceKey: deviceKey, name: "iPhone"))
            let network = URLSession(configuration: .ephemeral, delegate: ConnectionNoRedirect(), delegateQueue: nil)
            defer { network.invalidateAndCancel() }
            let result: (Data, URLResponse)
            do { result = try await network.data(for: request) }
            catch { result = try await network.data(for: request) } // Same key makes a lost-response retry idempotent.
            guard let response = result.1 as? HTTPURLResponse, response.statusCode == 200 else {
                let detail = (try? JSONDecoder().decode(ServerError.self, from: result.0).error) ?? "This QR code could not connect. Show a new code on your Mac."
                throw SessionError.server(detail)
            }
            // Keep a successfully claimed connection recoverable even if the
            // following login request is interrupted by a network change.
            try KeychainStore.save(deviceKey)
            UserDefaults.standard.set(invitation.server.absoluteString, forKey: addressKey)
            suggestedAddress = invitation.server.absoluteString
            await authenticate(address: invitation.server.absoluteString, accessKey: deviceKey, remember: false)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Your Mac could not be reached. Keep OpenBot running and scan a new code."
        }
    }

    func handleNotificationPath(_ path: String) {
        let value = path.hasPrefix("http") ? path : "https://openbot.local\(path.hasPrefix("/") ? path : "/\(path)")"
        guard let components = URLComponents(string: value),
              let threadID = components.queryItems?.first(where: { $0.name == "thread" })?.value,
              !threadID.isEmpty else { return }
        requestedThreadID = threadID
    }

    func consumeRequestedThread() { requestedThreadID = nil }

    func registerPushDevice(_ deviceToken: String?) async {
        guard isAuthenticated, let serverURL, let deviceToken, !deviceToken.isEmpty else { return }
        do {
            let result = try await StudioAPIClient(baseURL: serverURL).registerNativePush(
                deviceToken: deviceToken,
                environment: Self.pushEnvironment,
                bundleID: Bundle.main.bundleIdentifier ?? "app.openbot.mobile"
            )
            nativePushReady = result.deliveryReady
            nativePushMessage = result.deliveryReady
                ? "This iPhone will receive finished-task and approval notifications."
                : "Notifications are allowed here. Add the Apple push key on your OpenBot host to deliver them."
        } catch {
            nativePushReady = false
            nativePushMessage = (error as? LocalizedError)?.errorDescription ?? "OpenBot could not register this iPhone for notifications."
        }
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
            let network = URLSession(configuration: configuration, delegate: ConnectionNoRedirect(), delegateQueue: nil)
            defer { network.invalidateAndCancel() }
            let (data, response) = try await network.data(for: request)
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
            errorMessage = "OpenBot could not reach that address. Check that your studio host is online."
        }
    }

    private static var pushEnvironment: String {
        #if DEBUG
        "sandbox"
        #else
        "production"
        #endif
    }

}

private struct LoginRequest: Encodable { let token: String }
private struct PairRequest: Encodable { let ticket: String; let deviceKey: String; let name: String }
private struct ServerError: Decodable { let error: String }

private enum SessionError: LocalizedError {
    case missingKey
    case wrongKey
    case unreachable
    case server(String)

    var errorDescription: String? {
        switch self {
        case .missingKey: return "Enter the private access key shown by your OpenBot home."
        case .wrongKey: return "That access key did not match this OpenBot studio."
        case .unreachable: return "OpenBot did not answer. Check that your studio host is online."
        case .server(let message): return message
        }
    }
}
