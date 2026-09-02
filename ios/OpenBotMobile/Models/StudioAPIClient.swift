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

    func approve(runID: String) async throws {
        _ = try await dataRequest("api/runs/\(runID)/approve", method: "POST")
    }

    func cancel(runID: String) async throws {
        _ = try await dataRequest("api/runs/\(runID)/cancel", method: "POST")
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

private struct ServerMessage: Decodable { let error: String }

enum StudioAPIError: LocalizedError {
    case unauthorized
    case unreachable
    case invalidResponse
    case server(String)

    var errorDescription: String? {
        switch self {
        case .unauthorized: return "This studio needs its private access key again."
        case .unreachable: return "Your Mac did not answer. Check that OpenBot is running."
        case .invalidResponse: return "OpenBot sent something this app could not read. Update both apps and try again."
        case .server(let message): return message
        }
    }
}
