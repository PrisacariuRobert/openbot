import Foundation
import Darwin

enum ConnectionAddressError: LocalizedError, Equatable {
    case empty
    case invalid
    case insecureRemote

    var errorDescription: String? {
        switch self {
        case .empty: return "Enter the address shown by your OpenBot home."
        case .invalid: return "That does not look like an OpenBot address."
        case .insecureRemote: return "Use HTTPS away from your private network. Plain HTTP is allowed only for local addresses."
        }
    }
}

enum ConnectionAddress {
    static func normalized(_ raw: String) throws -> URL {
        var value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { throw ConnectionAddressError.empty }
        if !value.contains("://") {
            let candidateHost = URLComponents(string: "//\(value)")?.host?.lowercased() ?? ""
            value = "\(isPrivateHost(candidateHost) ? "http" : "https")://\(value)"
        }
        guard var parts = URLComponents(string: value),
              let scheme = parts.scheme?.lowercased(),
              ["http", "https"].contains(scheme),
              let host = parts.host?.lowercased(), !host.isEmpty,
              parts.user == nil, parts.password == nil else {
            throw ConnectionAddressError.invalid
        }
        if scheme == "http" && !isPrivateHost(host) { throw ConnectionAddressError.insecureRemote }
        parts.scheme = scheme
        // Preserve the exact studio on a shared relay. Never silently drop a
        // malformed studio path or normalize it into a different destination.
        guard let path = studioPath(parts.percentEncodedPath) else { throw ConnectionAddressError.invalid }
        parts.path = path
        parts.query = nil
        parts.fragment = nil
        guard let result = parts.url else { throw ConnectionAddressError.invalid }
        return result
    }

    static func studioPath(_ path: String) -> String? {
        if path.isEmpty || path == "/" { return "" }
        guard path.range(of: "^/s/[a-f0-9]{24}/?$", options: .regularExpression) != nil else { return nil }
        return path.hasSuffix("/") ? String(path.dropLast()) : path
    }

    static func appURL(for serverURL: URL) -> URL {
        var parts = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!
        parts.path = serverURL.path.isEmpty ? "/" : serverURL.path + "/"
        parts.queryItems = [URLQueryItem(name: "native", value: "ios")]
        return parts.url!
    }

    static func isLoopback(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return host == "localhost" || host == "127.0.0.1" || host == "::1"
    }

    private static func isPrivateHost(_ host: String) -> Bool {
        let host = host.trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
        if host == "localhost" || host == "::1" || host.hasSuffix(".local") { return true }
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        if parts.count == 4, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) && UInt8($0) != nil }) {
            let octets = parts.map { UInt8($0)! }
            return octets[0] == 10 || octets[0] == 127 || (octets[0] == 192 && octets[1] == 168) ||
                (octets[0] == 172 && (16...31).contains(octets[1])) || (octets[0] == 100 && (64...127).contains(octets[1]))
        }
        var address = in6_addr()
        if host.withCString({ inet_pton(AF_INET6, $0, &address) }) == 1 {
            return withUnsafeBytes(of: address) { bytes in
                bytes[0] & 0xfe == 0xfc || (bytes[0] == 0xfe && bytes[1] & 0xc0 == 0x80)
            }
        }
        return false
    }
}

enum OpenBotDeepLink {
    static func pairingInvitation(from url: URL) -> PairingInvitation? {
        guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.scheme == "openbot", parts.host == "pair", parts.path.isEmpty,
              parts.user == nil, parts.password == nil, parts.port == nil,
              let items = parts.queryItems, items.count == 1, items[0].name == "server",
              let raw = items[0].value, let server = URLComponents(string: raw),
              server.scheme == "https", server.user == nil, server.password == nil,
              server.query == nil, server.fragment == nil, ConnectionAddress.studioPath(server.percentEncodedPath) != nil,
              let hostname = server.host, !hostname.isEmpty,
              let serverURL = try? ConnectionAddress.normalized(raw),
              let ticket = parts.fragment, ticket.range(of: "^[A-Za-z0-9_-]{43}$", options: .regularExpression) != nil else { return nil }
        return PairingInvitation(server: serverURL, ticket: ticket)
    }
    static func serverAddress(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "openbot", url.host?.lowercased() == "connect",
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.queryItems?.contains(where: { ["key", "token", "access_key"].contains($0.name.lowercased()) }) != true,
              let value = parts.queryItems?.first(where: { $0.name == "server" })?.value else { return nil }
        return try? ConnectionAddress.normalized(value).absoluteString
    }
}

struct PairingInvitation: Identifiable {
    let id = UUID()
    let server: URL
    let ticket: String
}

// Never forward a credential or invitation after an HTTP redirect. A relay or
// studio misconfiguration should fail visibly, not send a key to another host.
final class ConnectionNoRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}
