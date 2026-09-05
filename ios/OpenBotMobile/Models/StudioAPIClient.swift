import Foundation
import UniformTypeIdentifiers

struct StudioAPIClient {
    let baseURL: URL
    let sessionAccessKey: String?

    init(baseURL: URL, accessKey: String? = nil) {
        self.baseURL = baseURL
        sessionAccessKey = accessKey
    }

    func state(threadID: String) async throws -> StudioState {
        try await request("api/state", queryItems: [URLQueryItem(name: "threadId", value: threadID)])
    }

    func connectors() async throws -> StudioConnectorStatus {
        try await request("api/connectors")
    }

    func providers() async throws -> StudioProviderStatus {
        try await request("api/provider")
    }

    func beginProviderConnection(_ providerID: String) async throws -> StudioProviderLoginAttempt {
        let payload = try JSONEncoder().encode(ProviderConnectRequest(providerId: providerID))
        let data = try await dataRequest("api/provider/connect", method: "POST", body: payload)
        do { return try JSONDecoder().decode(StudioProviderLoginAttempt.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func finishProviderConnection(_ attemptID: String, code: String) async throws {
        let payload = try JSONEncoder().encode(ProviderCallbackRequest(code: code))
        _ = try await dataRequest("api/provider/connect/\(attemptID)/callback", method: "POST", body: payload)
    }

    func saveAPIProvider(id: String? = nil, name: String, baseURL: String, protocolName: String, modelIDs: [String], secret: String?) async throws {
        let payload = try JSONEncoder().encode(APIProviderRequest(
            id: id,
            name: name,
            provider: "custom",
            authMode: "api_key",
            runtime: "opencode",
            secret: secret,
            apiConfig: APIProviderConfigRequest(baseUrl: baseURL, protocolName: protocolName, modelIds: modelIDs)
        ))
        _ = try await dataRequest("api/providers", method: "POST", body: payload)
    }

    func deleteAPIProvider(_ id: String) async throws {
        _ = try await dataRequest("api/providers/\(id)", method: "DELETE")
    }

    func codeProjects() async throws -> StudioCodeProjectsStatus {
        try await request("api/code-projects")
    }

    func connectCodeProject(name: String, rootPath: String, access: [StudioCodeProjectAccess]) async throws {
        let payload = try JSONEncoder().encode(CodeProjectConnectRequest(name: name, rootPath: rootPath, access: access))
        _ = try await dataRequest("api/code-projects", method: "POST", body: payload)
    }

    func cloneCodeProject(repository: String, access: [StudioCodeProjectAccess]) async throws {
        let payload = try JSONEncoder().encode(CodeProjectCloneRequest(repository: repository, access: access))
        _ = try await dataRequest("api/code-projects/clone", method: "POST", body: payload)
    }

    func setCodeProjectAccess(projectID: String, botID: String, access: StudioCodeProjectAccess) async throws {
        let payload = try JSONEncoder().encode(CodeProjectAccessRequest(canRead: access.canRead, canWrite: access.canWrite, canRun: access.canRun))
        _ = try await dataRequest("api/code-projects/\(projectID)/access/\(botID)", method: "PATCH", body: payload)
    }

    func disconnectCodeProject(_ projectID: String) async throws {
        _ = try await dataRequest("api/code-projects/\(projectID)", method: "DELETE")
    }

    func reviewCodeProject(_ projectID: String, runID: String? = nil) async throws -> StudioCodeProjectReview {
        try await request("api/code-projects/\(projectID)/review", queryItems: runID.map { [URLQueryItem(name: "runId", value: $0)] } ?? [])
    }

    func restoreCodeProjectEdit(_ editID: String) async throws {
        _ = try await dataRequest("api/code-project-edits/\(editID)/restore", method: "POST")
    }

    func setMacAccessEnabled(_ enabled: Bool) async throws {
        let payload = try JSONEncoder().encode(MacAccessRequest(macAccessEnabled: enabled))
        _ = try await dataRequest("api/settings", method: "PATCH", body: payload)
    }

    func setBotCapabilities(_ botID: String, computerEnabled: Bool, browserEnabled: Bool) async throws {
        let payload = try JSONEncoder().encode(BotCapabilitiesRequest(computerEnabled: computerEnabled, browserEnabled: browserEnabled))
        _ = try await dataRequest("api/bots/\(botID)", method: "PATCH", body: payload)
    }

    func setBotProvider(_ botID: String, providerInstanceID: String, model: String) async throws {
        let payload = try JSONEncoder().encode(BotProviderRequest(providerInstanceId: providerInstanceID, model: model))
        _ = try await dataRequest("api/bots/\(botID)", method: "PATCH", body: payload)
    }

    func saveBot(
        id: String? = nil,
        name: String,
        emoji: String,
        mascot: String,
        color: String,
        role: String,
        instructions: String,
        providerInstanceID: String,
        model: String,
        computerEnabled: Bool,
        browserEnabled: Bool,
        weeklyTokenBudget: Int
    ) async throws {
        let payload = try JSONEncoder().encode(BotSaveRequest(
            name: name, emoji: emoji, mascot: mascot, color: color, role: role,
            instructions: instructions, model: model, providerInstanceId: providerInstanceID,
            computerEnabled: computerEnabled, browserEnabled: browserEnabled,
            weeklyTokenBudget: weeklyTokenBudget
        ))
        _ = try await dataRequest(id.map { "api/bots/\($0)" } ?? "api/bots", method: id == nil ? "POST" : "PATCH", body: payload)
    }

    func duplicateBot(_ botID: String) async throws {
        _ = try await dataRequest("api/bots/\(botID)/duplicate", method: "POST")
    }

    func workspaceFiles(botID: String) async throws -> [StudioWorkspaceFile] {
        try await request("api/bots/\(botID)/files")
    }

    func workspaceFile(botID: String, path: String) async throws -> StudioWorkspaceFileContent {
        try await request("api/bots/\(botID)/file", queryItems: [URLQueryItem(name: "path", value: path)])
    }

    func search(_ query: String) async throws -> [StudioSearchResult] {
        try await request("api/search", queryItems: [URLQueryItem(name: "q", value: query)])
    }

    func beginGoogleConnection() async throws -> URL {
        let data = try await dataRequest("api/connectors/google/connect", method: "POST")
        let result: StudioOAuthStart
        do { result = try JSONDecoder().decode(StudioOAuthStart.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
        guard let url = URL(string: result.url), url.scheme?.lowercased() == "https" else {
            throw StudioAPIError.invalidResponse
        }
        return url
    }

    func beginConnectorConnection(_ serviceID: String) async throws -> URL? {
        let connectorID = ["gmail", "google-drive", "google-calendar"].contains(serviceID) ? "google" : serviceID
        let data = try await dataRequest("api/connectors/\(connectorID)/connect", method: "POST")
        let result = try? JSONDecoder().decode(StudioOptionalOAuthStart.self, from: data)
        guard let rawURL = result?.url else { return nil }
        guard let url = URL(string: rawURL), url.scheme?.lowercased() == "https" else { throw StudioAPIError.invalidResponse }
        return url
    }

    func setConnectorAccess(serviceID: String, botID: String, canRead: Bool, canSend: Bool) async throws {
        let google = ["gmail", "google-drive", "google-calendar"].contains(serviceID)
        let path = google
            ? "api/connectors/google/access/\(serviceID)/\(botID)"
            : "api/connectors/\(serviceID)/access/\(botID)"
        let payload = try JSONEncoder().encode(ConnectorAccessRequest(canRead: canRead, canSend: canSend))
        _ = try await dataRequest(path, method: "PATCH", body: payload)
    }

    func disconnectConnector(_ serviceID: String) async throws {
        let connectorID = ["gmail", "google-drive", "google-calendar"].contains(serviceID) ? "google" : serviceID
        _ = try await dataRequest("api/connectors/\(connectorID)/disconnect", method: "POST")
    }

    func skills() async throws -> [StudioSkill] { try await request("api/workflows") }
    func skillTemplates() async throws -> [StudioSkillTemplate] { try await request("api/skill-templates") }
    func skillVersions(_ skillID: String) async throws -> [StudioSkillVersion] {
        try await request("api/workflows/\(skillID)/versions")
    }

    func installSkillTemplate(_ templateID: String, botID: String) async throws {
        let payload = try JSONEncoder().encode(SkillBotRequest(botId: botID))
        _ = try await dataRequest("api/skill-templates/\(templateID)/install", method: "POST", body: payload)
    }

    func assignSkill(_ skillID: String, botID: String) async throws {
        let payload = try JSONEncoder().encode(SkillBotRequest(botId: botID))
        _ = try await dataRequest("api/workflows/\(skillID)/assign", method: "POST", body: payload)
    }

    func updateSkill(_ skillID: String, name: String, description: String, instructions: String, startURL: String) async throws {
        let payload = try JSONEncoder().encode(SkillUpdateRequest(name: name, description: description, instructions: instructions, startUrl: startURL))
        _ = try await dataRequest("api/workflows/\(skillID)", method: "PATCH", body: payload)
    }

    func rollbackSkill(_ skillID: String, version: Int) async throws {
        let payload = try JSONEncoder().encode(SkillRollbackRequest(version: version))
        _ = try await dataRequest("api/workflows/\(skillID)/rollback", method: "POST", body: payload)
    }

    func deleteSkill(_ skillID: String) async throws {
        _ = try await dataRequest("api/workflows/\(skillID)", method: "DELETE")
    }

    func importSkill(fileURL: URL, botID: String) async throws {
        let accessed = fileURL.startAccessingSecurityScopedResource()
        defer { if accessed { fileURL.stopAccessingSecurityScopedResource() } }
        let data = try Data(contentsOf: fileURL)
        guard data.count <= 256_000 else { throw StudioAPIError.server("That skill file is larger than OpenBot's 256 KB limit.") }
        let package = try JSONSerialization.jsonObject(with: data)
        let body = try JSONSerialization.data(withJSONObject: ["botId": botID, "package": package])
        _ = try await dataRequest("api/skills/import", method: "POST", body: body)
    }

    func exportSkill(_ skill: StudioSkill) async throws -> URL {
        let data = try await dataRequest("api/workflows/\(skill.id)/export")
        let directory = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
        var destination = directory.appending(path: "\(skill.skillSlug).openbot-skill.json")
        if FileManager.default.fileExists(atPath: destination.path) {
            destination = directory.appending(path: "\(skill.skillSlug)-\(UUID().uuidString.prefix(8)).openbot-skill.json")
        }
        try data.write(to: destination, options: .atomic)
        return destination
    }

    func teachingStatus(botID: String) async throws -> StudioTeachingStatus {
        try await request("api/bots/\(botID)/teach")
    }

    func computerStatus(botID: String) async throws -> StudioComputerStatus {
        try await request("api/bots/\(botID)/computer")
    }

    func openBrowser(botID: String, url: String) async throws -> StudioComputerStatus {
        let payload = try JSONEncoder().encode(BrowserOpenRequest(url: url))
        _ = try await dataRequest("api/bots/\(botID)/browser/open", method: "POST", body: payload)
        return try await computerStatus(botID: botID)
    }

    func startTeaching(botID: String, name: String, startURL: String) async throws -> StudioTeachingStatus {
        let payload = try JSONEncoder().encode(TeachingStartRequest(name: name, startUrl: startURL))
        let data = try await dataRequest("api/bots/\(botID)/teach/start", method: "POST", body: payload)
        do { return try JSONDecoder().decode(StudioTeachingStatus.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func stopTeaching(botID: String) async throws -> StudioSkill {
        let data = try await dataRequest("api/bots/\(botID)/teach/stop", method: "POST")
        do { return try JSONDecoder().decode(StudioSkill.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func takeoverClick(botID: String, x: Double, y: Double) async throws -> StudioBrowserTakeoverResult {
        let payload = try JSONEncoder().encode(BrowserClickRequest(x: x, y: y))
        return try await takeover(botID: botID, path: "click", payload: payload)
    }

    func takeoverType(botID: String, value: String, replace: Bool) async throws -> StudioBrowserTakeoverResult {
        let payload = try JSONEncoder().encode(BrowserTypeRequest(value: value, replace: replace))
        return try await takeover(botID: botID, path: "type", payload: payload)
    }

    func takeoverKey(botID: String, key: String) async throws -> StudioBrowserTakeoverResult {
        let payload = try JSONEncoder().encode(BrowserKeyRequest(key: key))
        return try await takeover(botID: botID, path: "key", payload: payload)
    }

    private func takeover(botID: String, path: String, payload: Data) async throws -> StudioBrowserTakeoverResult {
        let data = try await dataRequest("api/bots/\(botID)/browser/takeover/\(path)", method: "POST", body: payload)
        do { return try JSONDecoder().decode(StudioBrowserTakeoverResult.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func sendMessage(threadID: String, body: String, targetBotIDs: [String], attachmentIDs: [String], replyToID: String? = nil) async throws {
        let payload = try JSONEncoder().encode(MessageRequest(
            threadId: threadID,
            body: body,
            targetBotIds: targetBotIDs,
            attachmentIds: attachmentIDs,
            replyToId: replyToID
        ))
        _ = try await dataRequest("api/messages", method: "POST", body: payload)
    }

    func toggleMessageReaction(messageID: String, emoji: String) async throws {
        let payload = try JSONEncoder().encode(MessageReactionRequest(emoji: emoji))
        _ = try await dataRequest("api/messages/\(messageID)/reactions", method: "POST", body: payload)
    }

    func saveDraft(threadID: String, body: String) async throws -> StudioDraft {
        #if os(macOS)
        let source = "macos"
        #else
        let source = "ios"
        #endif
        let payload = try JSONEncoder().encode(DraftRequest(body: body, source: source))
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

    func createScheduledRoutine(name: String, botID: String, threadID: String, prompt: String, intervalMinutes: Int) async throws {
        let payload = try JSONEncoder().encode(ScheduledRoutineRequest(
            name: name,
            botId: botID,
            threadId: threadID,
            prompt: prompt,
            intervalMinutes: intervalMinutes,
            enabled: true,
            triggerType: "schedule"
        ))
        _ = try await dataRequest("api/routines", method: "POST", body: payload)
    }

    func saveRoutine(
        id: String? = nil,
        name: String,
        botID: String,
        threadID: String,
        prompt: String,
        intervalMinutes: Int,
        enabled: Bool,
        triggerType: String,
        triggerConfig: StudioRoutineTriggerConfig
    ) async throws -> StudioRoutineSaveResult {
        let payload = try JSONEncoder().encode(RoutineSaveRequest(
            name: name, botId: botID, threadId: threadID, prompt: prompt,
            intervalMinutes: intervalMinutes, enabled: enabled,
            triggerType: triggerType, triggerConfig: triggerConfig
        ))
        let path = id.map { "api/routines/\($0)" } ?? "api/routines"
        let data = try await dataRequest(path, method: id == nil ? "POST" : "PATCH", body: payload)
        do { return try JSONDecoder().decode(StudioRoutineSaveResult.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func deleteRoutine(_ routineID: String) async throws {
        _ = try await dataRequest("api/routines/\(routineID)", method: "DELETE")
    }

    func rotateRoutineSecret(_ routineID: String) async throws -> StudioRoutineSaveResult {
        let data = try await dataRequest("api/routines/\(routineID)/rotate-secret", method: "POST")
        do { return try JSONDecoder().decode(StudioRoutineSaveResult.self, from: data) }
        catch { throw StudioAPIError.invalidResponse }
    }

    func setRoutineEnabled(_ routineID: String, enabled: Bool) async throws {
        let payload = try JSONEncoder().encode(RoutineEnabledRequest(enabled: enabled))
        _ = try await dataRequest("api/routines/\(routineID)", method: "PATCH", body: payload)
    }

    func runRoutineNow(_ routineID: String) async throws {
        let payload = try JSONEncoder().encode(RoutineRunRequest(confirmed: true))
        _ = try await dataRequest("api/routines/\(routineID)/run", method: "POST", body: payload)
    }

    func resolveApprovedAction(actionID: String, completed: Bool) async throws {
        let payload = try JSONEncoder().encode(ApprovedActionResolutionRequest(outcome: completed ? "completed" : "not_completed"))
        _ = try await dataRequest("api/approved-actions/\(actionID)/resolve", method: "POST", body: payload)
    }

    func wakeRunner() async throws {
        _ = try await dataRequest("api/runner/wake", method: "POST")
    }

    func setBackgroundProtection(_ enabled: Bool) async throws {
        _ = try await dataRequest("api/runner/background", method: enabled ? "POST" : "DELETE")
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
        let accessKey = sessionAccessKey ?? KeychainStore.load()
        guard let accessKey, !accessKey.isEmpty else { throw StudioAPIError.unauthorized }
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
    let replyToId: String?
}
private struct MessageReactionRequest: Encodable { let emoji: String }

private struct ProviderConnectRequest: Encodable { let providerId: String }
private struct ProviderCallbackRequest: Encodable { let code: String }
private struct SkillRollbackRequest: Encodable { let version: Int }
private struct TeachingStartRequest: Encodable { let name: String; let startUrl: String }
private struct BrowserOpenRequest: Encodable { let url: String }
private struct BrowserClickRequest: Encodable { let x: Double; let y: Double }
private struct BrowserTypeRequest: Encodable { let value: String; let replace: Bool }
private struct BrowserKeyRequest: Encodable { let key: String }

private struct APIProviderRequest: Encodable {
    let id: String?
    let name: String
    let provider: String
    let authMode: String
    let runtime: String
    let secret: String?
    let apiConfig: APIProviderConfigRequest
}

private struct APIProviderConfigRequest: Encodable {
    let baseUrl: String
    let protocolName: String
    let modelIds: [String]

    enum CodingKeys: String, CodingKey {
        case baseUrl
        case protocolName = "protocol"
        case modelIds
    }
}

private struct CodeProjectConnectRequest: Encodable {
    let name: String
    let rootPath: String
    let access: [StudioCodeProjectAccess]
}

private struct CodeProjectCloneRequest: Encodable {
    let repository: String
    let access: [StudioCodeProjectAccess]
}

private struct CodeProjectAccessRequest: Encodable {
    let canRead: Bool
    let canWrite: Bool
    let canRun: Bool
}

private struct MacAccessRequest: Encodable { let macAccessEnabled: Bool }
private struct BotCapabilitiesRequest: Encodable { let computerEnabled: Bool; let browserEnabled: Bool }
private struct BotProviderRequest: Encodable { let providerInstanceId: String; let model: String }
private struct BotSaveRequest: Encodable {
    let name: String
    let emoji: String
    let mascot: String
    let color: String
    let role: String
    let instructions: String
    let model: String
    let providerInstanceId: String
    let computerEnabled: Bool
    let browserEnabled: Bool
    let weeklyTokenBudget: Int
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
private struct ApprovedActionResolutionRequest: Encodable { let outcome: String }
private struct RoutineEnabledRequest: Encodable { let enabled: Bool }
private struct RoutineRunRequest: Encodable { let confirmed: Bool }
private struct ScheduledRoutineRequest: Encodable {
    let name: String
    let botId: String
    let threadId: String
    let prompt: String
    let intervalMinutes: Int
    let enabled: Bool
    let triggerType: String
}

private struct RoutineSaveRequest: Encodable {
    let name: String
    let botId: String
    let threadId: String
    let prompt: String
    let intervalMinutes: Int
    let enabled: Bool
    let triggerType: String
    let triggerConfig: StudioRoutineTriggerConfig
}

struct NativePushRegistration: Decodable {
    let id: String
    let connected: Bool
    let deliveryReady: Bool
}

private struct StudioOAuthStart: Decodable { let url: String }
private struct StudioOptionalOAuthStart: Decodable { let url: String? }
private struct ConnectorAccessRequest: Encodable { let canRead: Bool; let canSend: Bool }
private struct SkillBotRequest: Encodable { let botId: String }
private struct SkillUpdateRequest: Encodable {
    let name: String
    let description: String
    let instructions: String
    let startUrl: String
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
