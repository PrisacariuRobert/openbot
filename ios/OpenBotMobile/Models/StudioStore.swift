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
    @Published private(set) var teachingStatus: StudioTeachingStatus?
    @Published private(set) var browserComputer: StudioComputerStatus?
    @Published private(set) var browserLiveFrame: Data?
    @Published private(set) var browserLiveState: String?
    @Published private(set) var workspaceFiles: [StudioWorkspaceFile] = []
    @Published private(set) var workspaceFileContent: StudioWorkspaceFileContent?
    @Published private(set) var artifacts: [StudioArtifact] = []
    @Published private(set) var artifactRevisions: [StudioArtifactRevision] = []
    @Published private(set) var isCheckingArtifacts = false
    @Published private(set) var searchResults: [StudioSearchResult] = []
    @Published private(set) var isCheckingConnectors = false
    @Published private(set) var isCheckingProviders = false
    @Published private(set) var isCheckingCodeProjects = false
    @Published private(set) var isCheckingSkills = false
    @Published private(set) var isTeaching = false
    @Published private(set) var isCheckingWorkspace = false
    @Published private(set) var isSearching = false
    @Published private(set) var isCheckingRunner = false
    @Published var errorMessage: String?
    @Published var shareNotice: String?
    @Published var selectedThreadID = "team-room"

    private let client: StudioAPIClient

    func workSources(botID: String) async throws -> StudioWorkSources { try await client.workSources(botID: botID) }
    func workFollowups() async throws -> StudioWorkFollowups { try await client.workFollowups() }
    func updateWorkDigest(enabled: Bool?) async throws { try await client.updateWorkDigest(enabled: enabled) }
    func trackFollowup(_ item: StudioWorkFollowup) async throws { try await client.trackFollowup(item) }
    func updateFollowup(_ id: String, status: String) async throws { try await client.updateFollowup(id, status: status) }
    func workSourceChoices(service: String, query: String) async throws -> StudioWorkSourceChoices { try await client.workSourceChoices(service: service, query: query) }
    func saveWorkSources(botID: String, value: StudioWorkSources) async throws -> StudioWorkSources { try await client.saveWorkSources(botID: botID, value: value) }
    func extensionData(_ path: String = "", method: String = "GET", body: Data? = nil) async throws -> Data {
        try await client.extensionData(path, method: method, body: body)
    }
    func recipeData(_ path: String = "", botID: String? = nil, method: String = "GET", body: Data? = nil) async throws -> Data {
        try await client.recipeData(path, botID: botID, method: method, body: body)
    }
    private var eventTask: Task<Void, Never>?
    private var refreshInProgress = false
    private var refreshAgain = false
    private var shareImportInProgress = false
    private var liveViewTask: Task<Void, Never>?
    private var liveViewBotID: String?

    /// Live screen frames for the computer screen currently open. Watching
    /// never starts a browser or grants access; when the live stream is
    /// unavailable the view falls back to snapshot refreshes.
    func startLiveView(botID: String) {
        stopLiveView()
        liveViewBotID = botID
        liveViewTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await client.computerFrames(botID: botID) { [weak self] event in
                    guard let self, self.liveViewBotID == botID, !Task.isCancelled else { return }
                    if event.type == "frame", let jpeg = event.jpeg, let data = Data(base64Encoded: jpeg) {
                        self.browserLiveFrame = data
                    } else if event.type == "status", let browser = event.browser {
                        self.browserLiveState = browser
                    }
                }
                if self.liveViewBotID == botID && !Task.isCancelled { self.browserLiveState = self.browserLiveState ?? "unavailable" }
            } catch {
                if self.liveViewBotID == botID { self.browserLiveState = "unavailable" }
            }
        }
    }

    func stopLiveView() {
        liveViewTask?.cancel()
        liveViewTask = nil
        liveViewBotID = nil
        browserLiveFrame = nil
        browserLiveState = nil
    }

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
        state.allRuns.filter { ["awaiting_approval", "waiting_for_teammate", "queued", "running"].contains($0.status) }
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
    func saveGroup(id: String? = nil, title: String, botIDs: [String]) async -> Bool {
        guard let input = StudioGroupInput(title: title, botIDs: botIDs),
              input.botIds.allSatisfy({ id in state.bots.contains { $0.id == id } }) else {
            errorMessage = "Choose a name up to 48 characters and one to six existing teammates."
            return false
        }
        errorMessage = nil
        do {
            let thread = try await client.saveGroup(id: id, input: input)
            await refresh(silent: true)
            await chooseThread(thread.id)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func send(_ body: String, targetBotID: String?, files: [URL] = [], replyToID: String? = nil, expectedWorkKind: String? = nil, threadID: String? = nil) async -> Bool {
        let cleanBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (!cleanBody.isEmpty || !files.isEmpty), !isSending else { return false }
        let destination = threadID ?? selectedThreadID
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            let attachments = try await files.asyncMap { try await client.upload(threadID: destination, fileURL: $0) }
            try await client.sendMessage(
                threadID: destination,
                body: cleanBody,
                targetBotIDs: targetBotID.map { [$0] } ?? [],
                attachmentIDs: attachments.map(\.id),
                replyToID: replyToID,
                expectedWorkKind: expectedWorkKind
            )
            await refresh(silent: true)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func toggleReaction(messageID: String, emoji: String) async {
        await perform { try await client.toggleMessageReaction(messageID: messageID, emoji: emoji) }
    }

    func signInControl(_ approvalID: String, control: StudioSignInControl) async throws -> StudioSignInScreen {
        try await client.signInControl(approvalID, control: control)
    }

    func approvalPreview(_ approvalID: String) async throws -> StudioApprovalPreview {
        try await client.approvalPreview(approvalID)
    }

    func decideReviewedApproval(_ approvalID: String, decision: String, reviewFingerprint: String?) async throws -> StudioApproval {
        try await client.decideReviewedApproval(approvalID, decision: decision, reviewFingerprint: reviewFingerprint)
    }

    func refreshApprovalState() async { await refresh(silent: true) }

    func fullApprovalReviewURL(threadID: String?) -> URL { client.fullApprovalReviewURL(threadID: threadID) }

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

    @discardableResult
    func saveRoutine(
        id: String? = nil,
        name: String,
        botID: String,
        threadID: String,
        prompt: String,
        intervalMinutes: Int,
        enabled: Bool,
        triggerType: String,
        triggerConfig: StudioRoutineTriggerConfig,
        schedule: StudioRoutineSchedule = .interval
    ) async -> StudioRoutineSaveResult? {
        do {
            errorMessage = nil
            let result = try await client.saveRoutine(
                id: id, name: name, botID: botID, threadID: threadID, prompt: prompt,
                intervalMinutes: intervalMinutes, enabled: enabled,
                triggerType: triggerType, triggerConfig: triggerConfig, schedule: schedule
            )
            await refresh(silent: true)
            return result
        } catch {
            handle(error)
            return nil
        }
    }

    @discardableResult
    func deleteRoutine(_ routine: StudioRoutine) async -> Bool {
        do {
            errorMessage = nil
            try await client.deleteRoutine(routine.id)
            await refresh(silent: true)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func previewSchedule(_ schedule: StudioRoutineSchedule, intervalMinutes: Int, routineID: String?) async throws -> StudioSchedulePreview {
        try await client.previewSchedule(schedule, intervalMinutes: intervalMinutes, routineID: routineID)
    }

    func rotateRoutineSecret(_ routine: StudioRoutine) async -> StudioRoutineSaveResult? {
        do {
            errorMessage = nil
            let result = try await client.rotateRoutineSecret(routine.id)
            await refresh(silent: true)
            return result
        } catch {
            handle(error)
            return nil
        }
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

    func refreshTeaching(botID: String, reportErrors: Bool = false) async {
        do {
            async let status = client.teachingStatus(botID: botID)
            async let computer = client.computerStatus(botID: botID)
            (teachingStatus, browserComputer) = try await (status, computer)
        } catch {
            if reportErrors { handle(error) }
        }
    }

    @discardableResult
    func startTeaching(botID: String, name: String, startURL: String) async -> Bool {
        guard !isTeaching else { return false }
        isTeaching = true
        errorMessage = nil
        defer { isTeaching = false }
        do {
            teachingStatus = try await client.startTeaching(botID: botID, name: name, startURL: startURL)
            browserComputer = try await client.computerStatus(botID: botID)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func stopTeaching(botID: String) async -> StudioSkill? {
        guard !isTeaching else { return nil }
        isTeaching = true
        errorMessage = nil
        defer { isTeaching = false }
        do {
            let skill = try await client.stopTeaching(botID: botID)
            teachingStatus = StudioTeachingStatus(recording: false, name: nil, stepCount: 0)
            browserComputer = try? await client.computerStatus(botID: botID)
            await refreshSkills()
            return skill
        } catch {
            handle(error)
            return nil
        }
    }

    func teachingClick(botID: String, x: Double, y: Double) async {
        await browserTakeover(botID: botID) {
            try await client.takeoverClick(botID: botID, x: x, y: y)
        }
    }

    func teachingType(botID: String, value: String, replace: Bool) async {
        await browserTakeover(botID: botID) {
            try await client.takeoverType(botID: botID, value: value, replace: replace)
        }
    }

    func teachingKey(botID: String, key: String) async {
        await browserTakeover(botID: botID) {
            try await client.takeoverKey(botID: botID, key: key)
        }
    }

    func refreshBrowser(botID: String, reportErrors: Bool = false) async {
        do { browserComputer = try await client.computerStatus(botID: botID) }
        catch { if reportErrors { handle(error) } }
    }

    func openBrowser(botID: String, url: String) async {
        guard !isTeaching else { return }
        isTeaching = true
        errorMessage = nil
        defer { isTeaching = false }
        do { browserComputer = try await client.openBrowser(botID: botID, url: url) }
        catch { handle(error) }
    }

    func browserClick(botID: String, x: Double, y: Double) async {
        await browserTakeover(botID: botID) { try await client.takeoverClick(botID: botID, x: x, y: y) }
    }

    func browserType(botID: String, value: String, replace: Bool) async {
        await browserTakeover(botID: botID) { try await client.takeoverType(botID: botID, value: value, replace: replace) }
    }

    func browserKey(botID: String, key: String) async {
        await browserTakeover(botID: botID) { try await client.takeoverKey(botID: botID, key: key) }
    }

    private func browserTakeover(botID: String, _ action: () async throws -> StudioBrowserTakeoverResult) async {
        guard !isTeaching else { return }
        isTeaching = true
        errorMessage = nil
        defer { isTeaching = false }
        do {
            let result = try await action()
            browserComputer = StudioComputerStatus(
                botId: botID,
                container: browserComputer?.container ?? "stopped",
                browser: "ready",
                currentUrl: result.url,
                title: result.title,
                screenshot: result.screenshot,
                updatedAt: ISO8601DateFormatter().string(from: Date())
            )
        } catch { handle(error) }
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

    var needsProviderChoice: Bool {
        !state.bots.isEmpty && state.bots.allSatisfy { ($0.providerInstanceId ?? "").isEmpty && ($0.model ?? "").isEmpty }
    }

    func chooseInitialProvider(providerInstanceID: String, model: String) async {
        await perform { try await client.chooseInitialProvider(providerInstanceID: providerInstanceID, model: model) }
        await refreshProviders()
    }

    @discardableResult
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
    ) async -> Bool {
        do {
            errorMessage = nil
            try await client.saveBot(
                id: id, name: name, emoji: emoji, mascot: mascot, color: color,
                role: role, instructions: instructions, providerInstanceID: providerInstanceID,
                model: model, computerEnabled: computerEnabled, browserEnabled: browserEnabled,
                weeklyTokenBudget: weeklyTokenBudget
            )
            await refresh(silent: true)
            await refreshProviders()
            return true
        } catch {
            handle(error)
            return false
        }
    }

    @discardableResult
    func duplicateBot(_ botID: String) async -> Bool {
        do {
            errorMessage = nil
            try await client.duplicateBot(botID)
            await refresh(silent: true)
            return true
        } catch {
            handle(error)
            return false
        }
    }

    func refreshWorkspace(botID: String) async {
        guard !isCheckingWorkspace else { return }
        isCheckingWorkspace = true
        errorMessage = nil
        workspaceFileContent = nil
        defer { isCheckingWorkspace = false }
        do { workspaceFiles = try await client.workspaceFiles(botID: botID) }
        catch { workspaceFiles = []; handle(error) }
    }

    func refreshArtifacts() async {
        guard !isCheckingArtifacts else { return }
        isCheckingArtifacts = true
        errorMessage = nil
        defer { isCheckingArtifacts = false }
        do { artifacts = try await client.artifacts() }
        catch { artifacts = []; handle(error) }
    }

    func openArtifact(_ artifact: StudioArtifact) async {
        guard !isCheckingArtifacts else { return }
        isCheckingArtifacts = true
        errorMessage = nil
        defer { isCheckingArtifacts = false }
        do { artifactRevisions = try await client.artifactRevisions(artifact.id) }
        catch { artifactRevisions = []; handle(error) }
    }

    func closeArtifact() { artifactRevisions = [] }

    func previewURL(_ path: String) -> URL? {
        URL(string: path, relativeTo: client.baseURL)
    }

    func openWorkspaceFile(botID: String, path: String) async {
        guard !isCheckingWorkspace else { return }
        isCheckingWorkspace = true
        errorMessage = nil
        defer { isCheckingWorkspace = false }
        do { workspaceFileContent = try await client.workspaceFile(botID: botID, path: path) }
        catch { handle(error) }
    }

    func closeWorkspaceFile() {
        workspaceFileContent = nil
    }

    func searchStudio(_ query: String) async {
        let clean = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard clean.count >= 2 else { searchResults = []; isSearching = false; return }
        isSearching = true
        defer { isSearching = false }
        do { searchResults = try await client.search(clean) }
        catch { searchResults = []; handle(error) }
    }

    func clearSearch() {
        searchResults = []
        isSearching = false
    }

    @discardableResult
    func startWorkflow(_ starter: StudioStarter, timeZone: String = TimeZone.current.identifier) async -> Bool {
        await chooseThread("team-room")
        return await send(starter.prompt(timeZone: timeZone), targetBotID: nil, expectedWorkKind: starter.expectedWorkKind)
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

    func saveDraft(_ body: String, threadID: String? = nil) async {
        let destination = threadID ?? selectedThreadID
        do {
            _ = try await client.saveDraft(threadID: destination, body: body)
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
        guard !refreshInProgress else { refreshAgain = true; return }
        refreshInProgress = true
        if !silent { isLoading = state.threads.isEmpty }
        defer { refreshInProgress = false; isLoading = false }
        repeat {
            refreshAgain = false
            let destination = selectedThreadID
            do {
                let next = try await client.state(threadID: destination)
                guard destination == selectedThreadID else { refreshAgain = true; continue }
                state = next
                selectedThreadID = next.activeThreadId
                isLive = true
                errorMessage = nil
            } catch {
                guard destination == selectedThreadID else { refreshAgain = true; continue }
                isLive = false
                handle(error)
            }
        } while refreshAgain && !Task.isCancelled
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
        // Leaving a native settings page cancels its loading task. That is not
        // a failed action and must not leak an error onto the next page.
        if StudioAPIError.isCancelledRequest(error) { return }
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
