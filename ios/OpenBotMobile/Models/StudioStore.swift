import Foundation

@MainActor
final class StudioStore: ObservableObject {
    @Published private(set) var state = StudioState.empty
    @Published private(set) var isLoading = true
    @Published private(set) var isSending = false
    @Published private(set) var isLive = false
    @Published private(set) var needsAuthentication = false
    @Published private(set) var runnerCare: StudioRunnerCare?
    @Published private(set) var connectorStatus: StudioConnectorStatus?
    @Published private(set) var providerStatus: StudioProviderStatus?
    @Published private(set) var codeProjectsStatus: StudioCodeProjectsStatus?
    @Published private(set) var codeProjectReview: StudioCodeProjectReview?
    @Published private(set) var skills: [StudioSkill] = []
    @Published private(set) var skillTemplates: [StudioSkillTemplate] = []
    @Published private(set) var isCheckingConnectors = false
    @Published private(set) var isCheckingProviders = false
    @Published private(set) var isCheckingCodeProjects = false
    @Published private(set) var isCheckingSkills = false
    @Published private(set) var isCheckingRunner = false
    @Published var errorMessage: String?
    @Published var shareNotice: String?
    @Published var selectedThreadID = "team-room"

    private let client: StudioAPIClient
    private var eventTask: Task<Void, Never>?
    private var refreshInProgress = false
    private var shareImportInProgress = false

    init(serverURL: URL, accessKey: String? = nil) {
        client = StudioAPIClient(baseURL: serverURL, accessKey: accessKey)
    }

    var activeThread: StudioThread? {
        state.threads.first(where: { $0.id == selectedThreadID })
    }

    var activeBot: StudioBot? {
        guard let botID = activeThread?.botId else { return nil }
        return state.bots.first(where: { $0.id == botID })
    }

    var activeRuns: [StudioRun] {
        state.runs.filter { ["awaiting_approval", "waiting_for_teammate", "queued", "running"].contains($0.status) }
    }

    var activeDraft: StudioDraft {
        state.draft ?? StudioDraft(threadId: selectedThreadID, body: "", source: nil, updatedAt: nil)
    }

    var routines: [StudioRoutine] { state.routines ?? [] }

    func start() async {
        await refresh()
        await refreshConnectors()
        eventTask?.cancel()
        eventTask = Task { [weak self] in await self?.eventLoop() }
    }

    func stop() {
        eventTask?.cancel()
        eventTask = nil
    }

    func chooseThread(_ id: String) async {
        guard selectedThreadID != id else { return }
        selectedThreadID = id
        await refresh()
    }

    @discardableResult
    func send(_ body: String, targetBotID: String?, files: [URL] = []) async -> Bool {
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!cleanBody.isEmpty || !files.isEmpty), !isSending else { return false }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            let attachments = try await files.asyncMap { try await client.upload(threadID: selectedThreadID, fileURL: $0) }
            try await client.sendMessage(
                threadID: selectedThreadID,
                body: cleanBody,
                targetBotIDs: targetBotID.map { [$0] } ?? [],
                attachmentIDs: attachments.map(\.id)
            )
            await refresh(silent: true)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func approve(_ run: StudioRun) async {
        await perform { try await client.approve(runID: run.id) }
    }

    func cancel(_ run: StudioRun) async {
        await perform { try await client.cancel(runID: run.id) }
    }

    func resolveApprovedAction(_ action: StudioApprovedAction, completed: Bool) async {
        await perform { try await client.resolveApprovedAction(actionID: action.id, completed: completed) }
    }

    @discardableResult
    func createScheduledRoutine(name: String, botID: String, threadID: String, prompt: String, intervalMinutes: Int) async -> Bool {
        do {
            try await client.createScheduledRoutine(name: name, botID: botID, threadID: threadID, prompt: prompt, intervalMinutes: intervalMinutes)
            await refresh(silent: true)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func setRoutineEnabled(_ routine: StudioRoutine, enabled: Bool) async {
        await perform { try await client.setRoutineEnabled(routine.id, enabled: enabled) }
    }

    func runRoutineNow(_ routine: StudioRoutine) async {
        await perform { try await client.runRoutineNow(routine.id) }
    }

    func wakeRunner() async {
        await perform { try await client.wakeRunner() }
    }

    func setBackgroundProtection(_ enabled: Bool) async {
        await perform { try await client.setBackgroundProtection(enabled) }
    }

    func refreshConnectors() async {
        guard !isCheckingConnectors else { return }
        isCheckingConnectors = true
        defer { isCheckingConnectors = false }
        do {
            connectorStatus = try await client.connectors()
        } catch {
            if case StudioAPIError.unauthorized = error { handle(error) }
        }
    }

    func beginGoogleConnection() async -> URL? {
        guard !isCheckingConnectors else { return nil }
        isCheckingConnectors = true
        errorMessage = nil
        defer { isCheckingConnectors = false }
        do { return try await client.beginGoogleConnection() }
        catch { handle(error); return nil }
    }

    func beginConnectorConnection(_ serviceID: String) async -> URL? {
        guard !isCheckingConnectors else { return nil }
        isCheckingConnectors = true
        errorMessage = nil
        defer { isCheckingConnectors = false }
        do {
            let url = try await client.beginConnectorConnection(serviceID)
            connectorStatus = try await client.connectors()
            return url
        } catch {
            handle(error)
            return nil
        }
    }

    func setConnectorAccess(serviceID: String, botID: String, canRead: Bool, canSend: Bool) async {
        guard !isCheckingConnectors else { return }
        isCheckingConnectors = true
        errorMessage = nil
        defer { isCheckingConnectors = false }
        do {
            try await client.setConnectorAccess(serviceID: serviceID, botID: botID, canRead: canRead, canSend: canSend)
            connectorStatus = try await client.connectors()
        } catch { handle(error) }
    }

    func disconnectConnector(_ serviceID: String) async {
        guard !isCheckingConnectors else { return }
        isCheckingConnectors = true
        errorMessage = nil
        defer { isCheckingConnectors = false }
        do {
            try await client.disconnectConnector(serviceID)
            connectorStatus = try await client.connectors()
        } catch { handle(error) }
    }

    func refreshSkills() async {
        guard !isCheckingSkills else { return }
        isCheckingSkills = true
        defer { isCheckingSkills = false }
        do {
            async let saved = client.skills()
            async let templates = client.skillTemplates()
            (skills, skillTemplates) = try await (saved, templates)
        } catch { handle(error) }
    }

    @discardableResult
    func installSkillTemplate(_ templateID: String, botID: String) async -> Bool {
        await changeSkills { try await client.installSkillTemplate(templateID, botID: botID) }
    }

    @discardableResult
    func assignSkill(_ skillID: String, botID: String) async -> Bool {
        await changeSkills { try await client.assignSkill(skillID, botID: botID) }
    }

    @discardableResult
    func updateSkill(_ skillID: String, name: String, description: String, instructions: String, startURL: String) async -> Bool {
        await changeSkills { try await client.updateSkill(skillID, name: name, description: description, instructions: instructions, startURL: startURL) }
    }

    func skillVersions(_ skillID: String) async -> [StudioSkillVersion]? {
        do {
            errorMessage = nil
            return try await client.skillVersions(skillID)
        } catch {
            handle(error)
            return nil
        }
    }

    @discardableResult
    func rollbackSkill(_ skillID: String, version: Int) async -> Bool {
        await changeSkills { try await client.rollbackSkill(skillID, version: version) }
    }

    @discardableResult
    func deleteSkill(_ skillID: String) async -> Bool {
        await changeSkills { try await client.deleteSkill(skillID) }
    }

    @discardableResult
    func importSkill(fileURL: URL, botID: String) async -> Bool {
        await changeSkills { try await client.importSkill(fileURL: fileURL, botID: botID) }
    }

    func exportSkill(_ skill: StudioSkill) async -> URL? {
        do { return try await client.exportSkill(skill) }
        catch { handle(error); return nil }
    }

    func refreshProviders() async {
        guard !isCheckingProviders else { return }
        isCheckingProviders = true
        defer { isCheckingProviders = false }
        do { providerStatus = try await client.providers() }
        catch { handle(error) }
    }

    func beginProviderConnection(_ providerID: String) async -> StudioProviderLoginAttempt? {
        guard !isCheckingProviders else { return nil }
        isCheckingProviders = true
        errorMessage = nil
        defer { isCheckingProviders = false }
        do {
            let attempt = try await client.beginProviderConnection(providerID)
            providerStatus = try await client.providers()
            return attempt
        } catch {
            handle(error)
            return nil
        }
    }

    @discardableResult
    func finishProviderConnection(_ attemptID: String, code: String) async -> Bool {
        guard !isCheckingProviders else { return false }
        isCheckingProviders = true
        errorMessage = nil
        defer { isCheckingProviders = false }
        do {
            try await client.finishProviderConnection(attemptID, code: code)
            providerStatus = try await client.providers()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func saveAPIProvider(id: String? = nil, name: String, baseURL: String, protocolName: String, modelIDs: [String], secret: String?) async -> Bool {
        guard !isCheckingProviders else { return false }
        isCheckingProviders = true
        errorMessage = nil
        defer { isCheckingProviders = false }
        do {
            try await client.saveAPIProvider(id: id, name: name, baseURL: baseURL, protocolName: protocolName, modelIDs: modelIDs, secret: secret)
            providerStatus = try await client.providers()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func deleteAPIProvider(_ id: String) async -> Bool {
        guard !isCheckingProviders else { return false }
        isCheckingProviders = true
        errorMessage = nil
        defer { isCheckingProviders = false }
        do {
            try await client.deleteAPIProvider(id)
            providerStatus = try await client.providers()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func refreshCodeProjects() async {
        guard !isCheckingCodeProjects else { return }
        isCheckingCodeProjects = true
        defer { isCheckingCodeProjects = false }
        do { codeProjectsStatus = try await client.codeProjects() }
        catch { handle(error) }
    }

    @discardableResult
    func connectCodeProject(name: String, rootPath: String, access: [StudioCodeProjectAccess]) async -> Bool {
        await changeCodeProjects {
            try await client.connectCodeProject(name: name, rootPath: rootPath, access: access)
        }
    }

    @discardableResult
    func cloneCodeProject(repository: String, access: [StudioCodeProjectAccess]) async -> Bool {
        await changeCodeProjects { try await client.cloneCodeProject(repository: repository, access: access) }
    }

    func setCodeProjectAccess(projectID: String, botID: String, access: StudioCodeProjectAccess) async {
        _ = await changeCodeProjects { try await client.setCodeProjectAccess(projectID: projectID, botID: botID, access: access) }
    }

    @discardableResult
    func disconnectCodeProject(_ projectID: String) async -> Bool {
        await changeCodeProjects { try await client.disconnectCodeProject(projectID) }
    }

    @discardableResult
    func reviewCodeProject(_ projectID: String, runID: String? = nil) async -> Bool {
        guard !isCheckingCodeProjects else { return false }
        isCheckingCodeProjects = true
        errorMessage = nil
        defer { isCheckingCodeProjects = false }
        do {
            codeProjectReview = try await client.reviewCodeProject(projectID, runID: runID)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func restoreCodeProjectEdit(_ editID: String) async -> Bool {
        await changeCodeProjects { try await client.restoreCodeProjectEdit(editID) }
    }

    func setMacAccessEnabled(_ enabled: Bool) async {
        await perform { try await client.setMacAccessEnabled(enabled) }
    }

    func setBotCapabilities(_ bot: StudioBot, computerEnabled: Bool? = nil, browserEnabled: Bool? = nil) async {
        await perform {
            try await client.setBotCapabilities(
                bot.id,
                computerEnabled: computerEnabled ?? bot.computerEnabled ?? false,
                browserEnabled: browserEnabled ?? bot.browserEnabled ?? false
            )
        }
    }

    func setBotProvider(_ botID: String, providerInstanceID: String, model: String) async {
        await perform { try await client.setBotProvider(botID, providerInstanceID: providerInstanceID, model: model) }
        await refreshProviders()
    }

    @discardableResult
    func startWorkflow(_ starter: StudioStarter, timeZone: String = TimeZone.current.identifier) async -> Bool {
        await chooseThread("team-room")
        return await send(starter.prompt(timeZone: timeZone), targetBotID: nil)
    }

    func checkRunnerCare() async {
        guard !isCheckingRunner else { return }
        isCheckingRunner = true
        errorMessage = nil
        defer { isCheckingRunner = false }
        do { runnerCare = try await client.runnerCare() }
        catch { handle(error) }
    }

    func setRunnerHealthAlerts(_ enabled: Bool) async {
        guard !isCheckingRunner else { return }
        isCheckingRunner = true
        errorMessage = nil
        defer { isCheckingRunner = false }
        do {
            try await client.setRunnerHealthAlerts(enabled)
            runnerCare = try await client.runnerCare()
        } catch { handle(error) }
    }

    func setExternalHeartbeat(_ enabled: Bool, url: String? = nil) async {
        guard !isCheckingRunner else { return }
        isCheckingRunner = true
        errorMessage = nil
        defer { isCheckingRunner = false }
        do {
            try await client.setExternalHeartbeat(enabled, url: url)
            runnerCare = try await client.runnerCare()
        } catch { handle(error) }
    }

    func saveDraft(_ body: String) async {
        do {
            _ = try await client.saveDraft(threadID: selectedThreadID, body: body)
        } catch {
            if case StudioAPIError.unauthorized = error { handle(error) }
        }
    }

    func download(_ attachment: StudioAttachment) async -> URL? {
        do {
            errorMessage = nil
            return try await client.download(attachment)
        } catch {
            handle(error)
            return nil
        }
    }

    func importSharedInbox() async {
        guard !shareImportInProgress, isLive else { return }
        let items = OpenBotSharedInbox.pending()
        guard !items.isEmpty else { return }
        shareImportInProgress = true
        defer { shareImportInProgress = false }
        var imported = 0
        for item in items {
            let files = OpenBotSharedInbox.fileURLs(for: item)
            if await send(item.text, targetBotID: nil, files: files) {
                OpenBotSharedInbox.remove(item)
                imported += 1
            } else { break }
        }
        if imported > 0 {
            shareNotice = imported == 1 ? "Shared item added to this conversation" : "\(imported) shared items added to this conversation"
            Task {
                try? await Task.sleep(for: .seconds(3))
                if !Task.isCancelled { shareNotice = nil }
            }
        }
    }

    func refresh(silent: Bool = false) async {
        guard !refreshInProgress else { return }
        refreshInProgress = true
        if !silent { isLoading = state.threads.isEmpty }
        defer { refreshInProgress = false; isLoading = false }
        do {
            let next = try await client.state(threadID: selectedThreadID)
            state = next
            selectedThreadID = next.activeThreadId
            isLive = true
            errorMessage = nil
        } catch {
            isLive = false
            handle(error)
        }
    }

    private func perform(_ action: () async throws -> Void) async {
        do {
            try await action()
            await refresh(silent: true)
        } catch { handle(error) }
    }

    private func changeCodeProjects(_ action: () async throws -> Void) async -> Bool {
        guard !isCheckingCodeProjects else { return false }
        isCheckingCodeProjects = true
        errorMessage = nil
        defer { isCheckingCodeProjects = false }
        do {
            try await action()
            codeProjectsStatus = try await client.codeProjects()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    private func changeSkills(_ action: () async throws -> Void) async -> Bool {
        guard !isCheckingSkills else { return false }
        isCheckingSkills = true
        errorMessage = nil
        defer { isCheckingSkills = false }
        do {
            try await action()
            skills = try await client.skills()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    private func eventLoop() async {
        while !Task.isCancelled {
            do {
                try await client.listenForEvents { [weak self] in
                    await self?.refresh(silent: true)
                }
                isLive = false
            } catch {
                guard !Task.isCancelled else { return }
                isLive = false
                if case StudioAPIError.unauthorized = error { handle(error); return }
            }
            try? await Task.sleep(nanoseconds: 1_500_000_000)
        }
    }

    private func handle(_ error: Error) {
        if case StudioAPIError.unauthorized = error { needsAuthentication = true }
        errorMessage = (error as? LocalizedError)?.errorDescription ?? "Something went wrong. Try again."
    }
}

private extension Array {
    func asyncMap<T>(_ transform: (Element) async throws -> T) async rethrows -> [T] {
        var result: [T] = []
        result.reserveCapacity(count)
        for item in self { result.append(try await transform(item)) }
        return result
    }
}
