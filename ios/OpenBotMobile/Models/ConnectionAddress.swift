import Foundation

enum ConnectionAddressError: LocalizedError, Equatable {
    case empty
    case invalid
    case insecureRemote

    var errorDescription: String? {
        switch self {
        case .empty: return "Enter the address shown by OpenBot on your Mac."
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
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        guard let result = parts.url else { throw ConnectionAddressError.invalid }
        return result
    }

    static func appURL(for serverURL: URL) -> URL {
        var parts = URLComponents(url: serverURL, resolvingAgainstBaseURL: false)!
        parts.path = "/"
        parts.queryItems = [URLQueryItem(name: "native", value: "ios")]
        return parts.url!
    }

    private static func isPrivateHost(_ host: String) -> Bool {
        if host == "localhost" || host == "::1" || host.hasSuffix(".local") { return true }
        if host.hasPrefix("10.") || host.hasPrefix("192.168.") || host.hasPrefix("127.") { return true }
        if host.hasPrefix("172."), let second = Int(host.split(separator: ".").dropFirst().first ?? ""), (16...31).contains(second) { return true }
        if host.hasPrefix("100."), let second = Int(host.split(separator: ".").dropFirst().first ?? ""), (64...127).contains(second) { return true }
        return host.hasPrefix("fc") || host.hasPrefix("fd") || host.hasPrefix("fe80:")
    }
}

enum OpenBotDeepLink {
    static func serverAddress(from url: URL) -> String? {
        guard url.scheme?.lowercased() == "openbot", url.host?.lowercased() == "connect",
              let parts = URLComponents(url: url, resolvingAgainstBaseURL: false),
              parts.queryItems?.contains(where: { ["key", "token", "access_key"].contains($0.name.lowercased()) }) != true,
              let value = parts.queryItems?.first(where: { $0.name == "server" })?.value else { return nil }
        return try? ConnectionAddress.normalized(value).absoluteString
    }
}
