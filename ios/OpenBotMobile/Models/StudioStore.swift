import Foundation

@MainActor
final class StudioStore: ObservableObject {
    @Published private(set) var state = StudioState.empty
    @Published private(set) var isLoading = true
    @Published private(set) var isSending = false
    @Published private(set) var isLive = false
    @Published private(set) var needsAuthentication = false
    @Published var errorMessage: String?
    @Published var selectedThreadID = "team-room"

    private let client: StudioAPIClient
    private var eventTask: Task<Void, Never>?
    private var refreshInProgress = false

    init(serverURL: URL) {
        client = StudioAPIClient(baseURL: serverURL)
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

    func start() async {
        await refresh()
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

    func saveDraft(_ body: String) async {
        do {
            _ = try await client.saveDraft(threadID: selectedThreadID, body: body)
        } catch {
            if case StudioAPIError.unauthorized = error { handle(error) }
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
