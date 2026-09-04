import Foundation
import UniformTypeIdentifiers

struct StudioAPIClient {
    let baseURL: URL

    func state(threadID: String) async throws -> StudioState {
        try await request("api/state", queryItems: [URLQueryItem(name: "threadId", value: threadID)])
    }

    func sendMessage(threadID: String, body: String, targetBotIDs: [String], attachmentIDs: [String]) async throws {
        let payload = try JSONEncoder().encode(MessageRequest(
            threadId: threadID,
            body: body,
            targetBotIds: targetBotIDs,
            attachmentIds: attachmentIDs
        ))
        _ = try await dataRequest("api/messages", method: "POST", body: payload)
    }

    func saveDraft(threadID: String, body: String) async throws -> StudioDraft {
        let payload = try JSONEncoder().encode(DraftRequest(body: body, source: "ios"))
        let data = try await dataRequest("api/drafts/\(threadID)", method: "PUT", body: payload)
        do { return try JSONDecoder().decode(StudioDraft.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func upload(threadID: String, fileURL: URL) async throws -> StudioAttachment {
        let accessed = fileURL.startAccessingSecurityScopedResource()
        defer { if accessed { fileURL.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: fileURL, options: .mappedIfSafe)
        guard data.count <= 25_000_000 else { throw StudioAPIError.server("That file is larger than OpenBot’s 25 MB limit.") }
        let encodedName = fileURL.lastPathComponent.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "attachment"
        let mime = UTType(filenameExtension: fileURL.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let response = try await dataRequest(
            "api/attachments",
            queryItems: [URLQueryItem(name: "threadId", value: threadID)],
            method: "POST",
            body: data,
            headers: ["Content-Type": "application/octet-stream", "X-File-Name": encodedName, "X-File-Type": mime]
        )
        do { return try JSONDecoder().decode(StudioAttachment.self, from: response) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func download(_ attachment: StudioAttachment) async throws -> URL {
        let data = try await dataRequest("api/attachments/\(attachment.id)")
        guard data.count <= 25_000_000 else { throw StudioAPIError.server("That file is larger than OpenBot’s 25 MB limit.") }
        let safeName = attachment.name.replacingOccurrences(of: "/", with: "-")
        let directory = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appending(path: "OpenBotArtifacts", directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let destination = directory.appending(path: "\(attachment.id)-\(safeName)")
        try data.write(to: destination, options: .atomic)
        return destination
    }

    func approve(runID: String) async throws {
        _ = try await dataRequest("api/runs/\(runID)/approve", method: "POST")
    }

    func cancel(runID: String) async throws {
        _ = try await dataRequest("api/runs/\(runID)/cancel", method: "POST")
    }

    func wakeRunner() async throws {
        _ = try await dataRequest("api/runner/wake", method: "POST")
    }

    func runnerCare() async throws -> StudioRunnerCare {
        try await request("api/runner/diagnostics")
    }

    func setRunnerHealthAlerts(_ enabled: Bool) async throws {
        let payload = try JSONEncoder().encode(RunnerHealthAlertsRequest(enabled: enabled))
        _ = try await dataRequest("api/runner/diagnostics/alerts", method: "PATCH", body: payload)
    }

    func setExternalHeartbeat(_ enabled: Bool, url: String? = nil) async throws {
        let payload = try JSONEncoder().encode(RunnerExternalHeartbeatRequest(enabled: enabled, url: url))
        _ = try await dataRequest("api/runner/diagnostics/heartbeat", method: "PATCH", body: payload)
    }

    func registerNativePush(deviceToken: String, environment: String, bundleID: String) async throws -> NativePushRegistration {
        let payload = try JSONEncoder().encode(NativePushRequest(deviceToken: deviceToken, environment: environment, bundleId: bundleID))
        let data = try await dataRequest("api/notifications/native", method: "POST", body: payload)
        do { return try JSONDecoder().decode(NativePushRegistration.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func listenForEvents(onEvent: @escaping () async -> Void) async throws {
        var request = try authorizedRequest(path: "api/events")
        request.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 60 * 60
        let (bytes, response) = try await URLSession.shared.bytes(for: request)
        try validate(response: response, data: nil)
        for try await line in bytes.lines {
            guard line.hasPrefix("data:"), !Task.isCancelled else { continue }
            await onEvent()
        }
    }

    private func request<T: Decodable>(_ path: String, queryItems: [URLQueryItem] = []) async throws -> T {
        let data = try await dataRequest(path, queryItems: queryItems)
        do { return try JSONDecoder().decode(T.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    private func dataRequest(
        _ path: String,
        queryItems: [URLQueryItem] = [],
        method: String = "GET",
        body: Data? = nil,
        headers: [String: String] = [:]
    ) async throws -> Data {
        var request = try authorizedRequest(path: path, queryItems: queryItems)
        request.httpMethod = method
        request.httpBody = body
        if body != nil && headers["Content-Type"] == nil { request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        let (data, response) = try await URLSession.shared.data(for: request)
        try validate(response: response, data: data)
        return data
    }

    private func authorizedRequest(path: String, queryItems: [URLQueryItem] = []) throws -> URLRequest {
        guard let accessKey = KeychainStore.load(), !accessKey.isEmpty else { throw StudioAPIError.unauthorized }
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)
        if !queryItems.isEmpty { components?.queryItems = queryItems }
        guard let url = components?.url else { throw StudioAPIError.invalidResponse }
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.timeoutInterval = 20
        return request
    }

    private func validate(response: URLResponse, data: Data?) throws {
        guard let http = response as? HTTPURLResponse else { throw StudioAPIError.unreachable }
        if http.statusCode == 401 { throw StudioAPIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let message = data.flatMap { try? JSONDecoder().decode(ServerMessage.self, from: $0).error }
            throw StudioAPIError.server(message ?? "OpenBot could not finish that request.")
        }
    }
}

private struct MessageRequest: Encodable {
    let threadId: String
    let body: String
    let targetBotIds: [String]
    let attachmentIds: [String]
}

private struct DraftRequest: Encodable {
    let body: String
    let source: String
}

private struct NativePushRequest: Encodable {
    let deviceToken: String
    let environment: String
    let bundleId: String
}

private struct RunnerHealthAlertsRequest: Encodable { let enabled: Bool }
private struct RunnerExternalHeartbeatRequest: Encodable { let enabled: Bool; let url: String? }

struct NativePushRegistration: Decodable {
    let id: String
    let connected: Bool
    let deliveryReady: Bool
}

private struct ServerMessage: Decodable { let error: String }

enum StudioAPIError: LocalizedError {
    case unauthorized
    case unreachable
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "This studio needs its private access key again."
        case .unreachable: return "Your OpenBot home did not answer. Check that it is running."
        case .invalidResponse: return "OpenBot sent something this app could not read. Update both apps and try again."
        case .server(let message): return message
        }
    }
}
